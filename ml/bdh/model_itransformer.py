"""
iTransformer Architecture — Inverted Transformer for Time Series Forecasting
Based on Liu et al. (ICLR 2024): "iTransformer: Inverted Transformers Are Effective for Time Series Forecasting"
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS


class iTransformerModel(nn.Module):
    """
    Lightweight iTransformer (Inverted Transformer) for Telemetry Forecasting.

    Key Innovation:
    Inverts time series representation by embedding the entire lookback sequence T=60 per channel into
    channel tokens [B, D, hidden_dim], then applying Multihead Self-Attention across channels (D=14).
    This explicitly models cross-variable interactions (e.g. CPU <-> Load, Memory <-> Swap, RX <-> TX).
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        hidden_dim: int = 64,
        num_layers: int = 2,
        nhead: int = 4,
        dropout: float = 0.05,
        output_targets: int = 3,
        output_horizons: int = 5,
        target_indices: list[int] | None = None,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.nhead = nhead
        self.output_targets = output_targets
        self.output_horizons = output_horizons

        # Index mapping for canonical target channels within FEATURE_COLUMNS
        # Default: 0=cpu, 1=memory, 4=load_1m
        if target_indices is None:
            self.target_indices = [FEATURE_COLUMNS.index(t) for t in TARGET_COLUMNS]
        else:
            self.target_indices = target_indices

        # 1. Inverted Variational Token Embedding: maps sequence length T -> hidden_dim per variable
        self.seq_embedding = nn.Linear(sequence_length, hidden_dim)

        # 2. Channel/Variable positional embedding
        self.channel_pos_embed = nn.Parameter(torch.zeros(1, input_dim, hidden_dim))
        nn.init.trunc_normal_(self.channel_pos_embed, std=0.02)

        # 3. Transformer Encoder across channels (attention along D dimension)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=nhead,
            dim_feedforward=hidden_dim * 2,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        # 4. Target Projection Heads per target metric
        # Projects each target metric's contextual token state [B, hidden_dim] -> [B, output_horizons]
        self.target_heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_dim, output_horizons),
            )
            for _ in range(output_targets)
        ])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for iTransformerModel.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Invert time and variable dimensions: [B, T, D] -> [B, D, T]
        x_inverted = x.permute(0, 2, 1)  # [B, D=14, T=60]

        # 2. Linear token embedding per variable: [B, D, T] -> [B, D, hidden_dim]
        var_tokens = self.seq_embedding(x_inverted) + self.channel_pos_embed  # [B, 14, hidden_dim]

        # 3. Cross-variable Multi-Head Self-Attention across channels
        h = self.encoder(var_tokens)  # [B, 14, hidden_dim]

        # 4. Target metric forecast projection
        outputs = []
        for m_idx, channel_idx in enumerate(self.target_indices):
            target_token = h[:, channel_idx, :]  # [B, hidden_dim]
            pred_h = self.target_heads[m_idx](target_token)  # [B, 5]
            outputs.append(pred_h.unsqueeze(1))  # [B, 1, 5]

        # Concatenate targets along metric dimension -> [B, 3, 5]
        out = torch.cat(outputs, dim=1)

        if is_single:
            out = out.squeeze(0)

        return out

    def get_parameter_counts(self) -> tuple[int, int]:
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
