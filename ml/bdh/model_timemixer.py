"""
TimeMixer Architecture — Decomposable Multiscale Mixing for Telemetry Forecasting
Based on Wang et al. (ICLR 2024): "TimeMixer: Decomposable Multiscale Mixing for Time Series Forecasting"
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class SeriesDecomp(nn.Module):
    """
    Series decomposition block using moving average pooling.
    Deconstructs time series into trend and seasonal/residual components.
    """

    def __init__(self, kernel_size: int = 5):
        super().__init__()
        self.kernel_size = kernel_size
        padding = (kernel_size - 1) // 2
        self.avg = nn.AvgPool1d(kernel_size=kernel_size, stride=1, padding=padding, count_include_pad=False)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Input x: [B, T, D]
        Returns (seasonal, trend): ([B, T, D], [B, T, D])
        """
        # Permute to [B, D, T] for 1D pooling
        x_perm = x.permute(0, 2, 1)
        trend = self.avg(x_perm).permute(0, 2, 1)
        seasonal = x - trend
        return seasonal, trend


class PastDecomposableMixingBlock(nn.Module):
    """
    Past-Decomposable Mixing (PDM) Block.
    Performs temporal mixing and multiscale cross-scale aggregation across seasonal and trend components.
    """

    def __init__(
        self,
        seq_lengths: list[int],
        input_dim: int,
        hidden_dim: int,
        dropout: float = 0.05,
    ):
        super().__init__()
        self.seq_lengths = seq_lengths
        self.num_scales = len(seq_lengths)
        self.hidden_dim = hidden_dim

        # Temporal mixing per scale for seasonal
        self.seasonal_mixers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(seq_len, seq_len),
                nn.GELU(),
                nn.Dropout(dropout),
            )
            for seq_len in seq_lengths
        ])

        # Temporal mixing per scale for trend
        self.trend_mixers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(seq_len, seq_len),
                nn.GELU(),
                nn.Dropout(dropout),
            )
            for seq_len in seq_lengths
        ])

        # Channel mapping per scale
        self.channel_proj = nn.ModuleList([
            nn.Linear(input_dim, hidden_dim)
            for _ in seq_lengths
        ])

    def forward(
        self,
        seasonals: list[torch.Tensor],
        trends: list[torch.Tensor],
    ) -> tuple[list[torch.Tensor], list[torch.Tensor]]:
        """
        seasonals: list of [B, T_s, D] for scale s
        trends: list of [B, T_s, D] for scale s
        Returns updated (seasonals, trends) lists.
        """
        out_seasonals = []
        out_trends = []

        for i, seq_len in enumerate(self.seq_lengths):
            s_i = seasonals[i]  # [B, T_i, D]
            t_i = trends[i]     # [B, T_i, D]

            # 1. Temporal mixing along sequence dimension
            # [B, D, T_i] -> Temporal linear -> [B, D, T_i] -> [B, T_i, D]
            s_mix = self.seasonal_mixers[i](s_i.permute(0, 2, 1)).permute(0, 2, 1)
            t_mix = self.trend_mixers[i](t_i.permute(0, 2, 1)).permute(0, 2, 1)

            # 2. Residual connection
            s_out = s_i + s_mix
            t_out = t_i + t_mix

            out_seasonals.append(s_out)
            out_trends.append(t_out)

        return out_seasonals, out_trends


class TimeMixerModel(nn.Module):
    """
    Lightweight TimeMixer Model for Multivariate Server Telemetry Forecasting.

    Architecture pipeline:
    1. Multiscale Downsampling: Constructs 3 scale levels (e.g., T=60, T/2=30, T/4=15).
    2. Series Decomposition: Extracts seasonal & trend signals across scales.
    3. Past-Decomposable Mixing Blocks: Multi-layer temporal mixing.
    4. Future Aggregation Head: Aggregates multiscale hidden representations into [B, 3, 5].
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        hidden_dim: int = 64,
        num_layers: int = 2,
        down_sampling_layers: int = 2,
        down_sampling_window: int = 2,
        decomp_kernel_size: int = 5,
        dropout: float = 0.05,
        output_targets: int = 3,
        output_horizons: int = 5,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.down_sampling_layers = down_sampling_layers
        self.down_sampling_window = down_sampling_window
        self.output_targets = output_targets
        self.output_horizons = output_horizons

        # Calculate multiscale sequence lengths
        self.seq_lengths = [sequence_length]
        curr_len = sequence_length
        for _ in range(down_sampling_layers):
            curr_len = curr_len // down_sampling_window
            self.seq_lengths.append(curr_len)

        # Downsampling pools
        self.down_pools = nn.ModuleList([
            nn.AvgPool1d(kernel_size=down_sampling_window, stride=down_sampling_window)
            for _ in range(down_sampling_layers)
        ])

        # Series decomposition
        self.decomp = SeriesDecomp(kernel_size=decomp_kernel_size)

        # Mixing blocks
        self.pdm_blocks = nn.ModuleList([
            PastDecomposableMixingBlock(
                seq_lengths=self.seq_lengths,
                input_dim=input_dim,
                hidden_dim=hidden_dim,
                dropout=dropout,
            )
            for _ in range(num_layers)
        ])

        # Project multiscale seasonal and trend states to hidden dimension
        self.multiscale_proj = nn.ModuleList([
            nn.Linear(input_dim, hidden_dim)
            for _ in self.seq_lengths
        ])

        # Aggregate multi-scale summary vectors to target forecast tensor
        # Total concatenated context features across scales = sum(self.seq_lengths) * hidden_dim
        total_scale_dim = sum(self.seq_lengths) * hidden_dim
        self.head = nn.Sequential(
            nn.Linear(total_scale_dim, hidden_dim * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim * 2, output_targets * output_horizons),
        )

    def downsample_multiscale(self, x: torch.Tensor) -> list[torch.Tensor]:
        """
        Produces multiscale list of inputs [X_0, X_1, X_2].
        x: [B, T, D]
        """
        multiscale = [x]
        curr = x
        for pool in self.down_pools:
            # [B, T, D] -> [B, D, T] -> Pool -> [B, D, T_down] -> [B, T_down, D]
            curr = pool(curr.permute(0, 2, 1)).permute(0, 2, 1)
            multiscale.append(curr)
        return multiscale

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for TimeMixerModel.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Multiscale downsampling
        x_scales = self.downsample_multiscale(x)  # list of [B, T_s, D]

        # 2. Multiscale series decomposition
        seasonals = []
        trends = []
        for x_s in x_scales:
            s_s, t_s = self.decomp(x_s)
            seasonals.append(s_s)
            trends.append(t_s)

        # 3. Past Decomposable Mixing (PDM) blocks
        for block in self.pdm_blocks:
            seasonals, trends = block(seasonals, trends)

        # 4. Multiscale feature projection & pooling
        scale_feats = []
        for i, (s_s, t_s) in enumerate(zip(seasonals, trends)):
            combined_s = s_s + t_s  # [B, T_s, D]
            h_s = self.multiscale_proj[i](combined_s)  # [B, T_s, hidden_dim]
            # Flatten sequence dimension per scale -> [B, T_s * hidden_dim]
            h_s_flat = h_s.reshape(B, -1)
            scale_feats.append(h_s_flat)

        # Concatenate across scales -> [B, sum(T_s * hidden_dim)]
        concat_feats = torch.cat(scale_feats, dim=1)

        # 5. Forecasting Head -> [B, 15] -> [B, 3, 5]
        out_flat = self.head(concat_feats)
        out = out_flat.view(B, self.output_targets, self.output_horizons)

        if is_single:
            out = out.squeeze(0)

        return out

    def get_parameter_counts(self) -> tuple[int, int]:
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
