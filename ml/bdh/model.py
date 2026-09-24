"""
BDH-Inspired Sequence Model for Multivariate Server Telemetry Forecasting
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class BDHInspiredBlock(nn.Module):
    """
    BDH-Inspired Layer Block for Continuous Telemetry Sequences.

    Core BDH-inspired principles:
    1. Symmetric Q/K Projection: Query and Key projections use a shared weight matrix (Q = K).
    2. Non-Softmax Causal Interaction: Causal sequence score matrix S = (Q @ K.T) / sqrt(D)
       masked lower-triangular, without exponential Softmax.
    3. Non-Negative Activation: Applies ReLU to sequence interaction scores and feature mappings,
       reflecting BDH's sparse, non-negative activation constraint.
    4. Residual Connection & Scaling: Adds input residual and LayerNorm to maintain numerical stability
       and prevent exponential activation growth.
    """

    def __init__(self, hidden_dim: int = 64, dropout: float = 0.05):
        super().__init__()
        self.hidden_dim = hidden_dim

        # 1. BDH-Inspired: Shared/Symmetric Q=K Linear projection matrix
        self.q_k_proj = nn.Linear(hidden_dim, hidden_dim, bias=False)

        # 2. Sequence output projection
        self.out_proj = nn.Linear(hidden_dim, hidden_dim)

        # 3. Feedforward projection (expansion factor = 2)
        self.ffn = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim * 2),
            nn.ReLU(),  # BDH-Inspired non-negative activation
            nn.Linear(hidden_dim * 2, hidden_dim),
        )

        self.norm1 = nn.LayerNorm(hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for BDH-inspired block.
        Input x: [B, T, D]
        Returns: [B, T, D]
        """
        B, T, D = x.shape

        # 1. BDH-inspired symmetric Q=K feature transformation
        # Telemetry adaptation: continuous hidden state x is projected via shared q_k_proj
        qk = self.q_k_proj(x)  # [B, T, D]

        # 2. Causal sequence interaction (No Softmax, lower-triangular causal mask)
        # Scaled dot-product score matrix between timesteps
        scores = torch.matmul(qk, qk.transpose(-2, -1)) / math.sqrt(D)  # [B, T, T]

        # Causal mask: prevent future timesteps (j > i) from influencing past timesteps (i)
        causal_mask = torch.tril(torch.ones(T, T, device=x.device, dtype=torch.bool))
        scores = scores.masked_fill(~causal_mask, 0.0)

        # BDH-inspired non-negative score activation (ReLU instead of Softmax)
        scores = F.relu(scores)  # [B, T, T]

        # Normalization factor per timestep to prevent scale blowup as T grows
        denom = torch.clamp(scores.sum(dim=-1, keepdim=True), min=1.0)
        attn_weights = scores / denom  # [B, T, T]

        # Aggregate sequence states
        context = torch.matmul(attn_weights, qk)  # [B, T, D]
        interaction_out = self.out_proj(context)  # [B, T, D]

        # Residual connection 1 + LayerNorm
        x = self.norm1(x + self.dropout(interaction_out))

        # Feedforward + Residual connection 2 + LayerNorm
        ffn_out = self.ffn(x)
        x = self.norm2(x + self.dropout(ffn_out))

        return x


class BDHInspiredSequenceModel(nn.Module):
    """
    Lightweight BDH-Inspired Sequence Model for Multivariate Server Telemetry Forecasting.

    Architecture pipeline:
    1. Telemetry adaptation: Linear(input_dim=14, hidden_dim=64) projects continuous features.
    2. BDH-inspired backbone: num_layers of BDHInspiredBlock with Q=K causal interaction & ReLU activations.
    3. Task-specific forecasting logic: Extracts sequence bottleneck at last step T-1 and projects
       via Linear(64, 15) to multi-horizon target matrix [B, 3, 5].
    """

    def __init__(
        self,
        input_dim: int = 14,
        hidden_dim: int = 64,
        num_layers: int = 2,
        output_targets: int = 3,
        output_horizons: int = 5,
        dropout: float = 0.05,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.output_targets = output_targets
        self.output_horizons = output_horizons

        # 1. Telemetry Adaptation: Continuous feature projection
        self.input_proj = nn.Linear(input_dim, hidden_dim)

        # 2. BDH-Inspired Core Sequence Blocks
        self.blocks = nn.ModuleList([
            BDHInspiredBlock(hidden_dim=hidden_dim, dropout=dropout)
            for _ in range(num_layers)
        ])

        # 3. Task-Specific Forecasting Head (Target: 3 metrics x 5 horizons = 15 values)
        self.forecast_head = nn.Linear(hidden_dim, output_targets * output_horizons)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)  # [1, T, 14]

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected input feature dimension {self.input_dim}, got {D_in}")

        # 1. Telemetry feature projection
        h = self.input_proj(x)  # [B, T, 64]

        # 2. BDH-inspired sequence blocks
        for block in self.blocks:
            h = block(h)  # [B, T, 64]

        # 3. Task-specific forecasting: extract last context step (t = T - 1)
        last_step_h = h[:, -1, :]  # [B, 64]

        # Project to target horizon matrix
        out_flat = self.forecast_head(last_step_h)  # [B, 15]
        out = out_flat.view(B, self.output_targets, self.output_horizons)  # [B, 3, 5]

        if is_single:
            out = out.squeeze(0)  # [3, 5]

        return out

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
