"""
PatchTST and BDH + PatchTST Hybrid Models for Multivariate Server Telemetry Forecasting
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml.bdh.model import BDHInspiredBlock


class PatchTSTModel(nn.Module):
    """
    Lightweight PatchTST (Patch Time Series Transformer) for Telemetry Forecasting.

    Architecture pipeline:
    1. Patch Extraction: Unfolds 1D continuous sequence dimension T=60 into N_p overlapping patches
       of length P=10 and stride S=5 (e.g. N_p = 11 patches).
    2. Linear Patch Embedding + Positional Encoding: Projects flattened patch vectors (P * D_in) -> hidden_dim
       and adds learnable 1D temporal positional embeddings.
    3. Transformer Encoder: Multihead Self-Attention + FFN layers over patch tokens.
    4. Forecasting Head: Projects last patch token contextual state -> target matrix [B, 3, 5].
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        patch_len: int = 10,
        stride: int = 5,
        hidden_dim: int = 64,
        num_layers: int = 2,
        nhead: int = 4,
        dropout: float = 0.05,
        output_targets: int = 3,
        output_horizons: int = 5,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.patch_len = patch_len
        self.stride = stride
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.nhead = nhead
        self.output_targets = output_targets
        self.output_horizons = output_horizons

        # Calculate patch count N_p
        if sequence_length < patch_len:
            raise ValueError(f"Sequence length ({sequence_length}) must be >= patch length ({patch_len})")
        self.num_patches = (sequence_length - patch_len) // stride + 1

        # 1. Patch linear projection
        patch_dim = patch_len * input_dim
        self.patch_proj = nn.Linear(patch_dim, hidden_dim)

        # 2. Learnable 1D positional embedding for patch tokens
        self.pos_embed = nn.Parameter(torch.zeros(1, self.num_patches, hidden_dim))
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

        # 3. Transformer Encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=nhead,
            dim_feedforward=hidden_dim * 2,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        # 4. Forecasting Head
        self.head = nn.Linear(hidden_dim, output_targets * output_horizons)

    def extract_patches(self, x: torch.Tensor) -> torch.Tensor:
        """
        Extracts overlapping patches along the sequence dimension.
        Input x: [B, T, D]
        Returns: [B, N_p, patch_len * D]
        """
        B, T, D = x.shape
        # unfold along T (dimension 1) -> [B, N_p, D, patch_len]
        patches = x.unfold(dimension=1, size=self.patch_len, step=self.stride)
        # Permute to [B, N_p, patch_len, D] and flatten patch features -> [B, N_p, patch_len * D]
        patches = patches.permute(0, 1, 3, 2).contiguous().view(B, self.num_patches, self.patch_len * D)
        return patches

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for PatchTSTModel.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)  # [1, T, 14]

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Extract and project patches
        patches = self.extract_patches(x)  # [B, N_p, patch_len * D_in]
        h = self.patch_proj(patches) + self.pos_embed  # [B, N_p, hidden_dim]

        # 2. Transformer Encoder over patch tokens
        h = self.encoder(h)  # [B, N_p, hidden_dim]

        # 3. Task-specific forecasting head (last patch token contextual state)
        last_patch_h = h[:, -1, :]  # [B, hidden_dim]
        out_flat = self.head(last_patch_h)  # [B, 15]
        out = out_flat.view(B, self.output_targets, self.output_horizons)  # [B, 3, 5]

        if is_single:
            out = out.squeeze(0)  # [3, 5]

        return out

    def extract_representation(self, x: torch.Tensor) -> torch.Tensor:
        """
        Extracts temporal representation z_t [B, hidden_dim] prior to forecasting head.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, hidden_dim]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        patches = self.extract_patches(x)
        h = self.patch_proj(patches) + self.pos_embed
        h = self.encoder(h)
        last_patch_h = h[:, -1, :]  # [B, hidden_dim]

        if is_single:
            last_patch_h = last_patch_h.squeeze(0)

        return last_patch_h

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params


class BDHPatchTSTHybrid(nn.Module):
    """
    BDH + PatchTST Hybrid Sequence Model for Telemetry Forecasting.

    Architecture pipeline:
    Input [B, 60, 14]
            │
            ▼
     PatchTST patch extraction & linear embedding + Positional Encoding [B, N_p, 64]
            │
            ▼
     PatchTST Transformer Encoder [B, N_p, 64]
            │
            ▼
     BDH-Inspired Interaction Blocks (BDHInspiredBlock with symmetric Q=K & ReLU scores) [B, N_p, 64]
            │
            ▼
     Sequence Representation (last patch state) [B, 64]
            │
            ▼
     Forecasting Head Linear(64, 15) -> [B, 3, 5]
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        patch_len: int = 10,
        stride: int = 5,
        hidden_dim: int = 64,
        num_encoder_layers: int = 2,
        num_bdh_layers: int = 2,
        nhead: int = 4,
        dropout: float = 0.05,
        output_targets: int = 3,
        output_horizons: int = 5,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.patch_len = patch_len
        self.stride = stride
        self.hidden_dim = hidden_dim
        self.num_encoder_layers = num_encoder_layers
        self.num_bdh_layers = num_bdh_layers
        self.nhead = nhead
        self.output_targets = output_targets
        self.output_horizons = output_horizons

        # Calculate patch count N_p
        if sequence_length < patch_len:
            raise ValueError(f"Sequence length ({sequence_length}) must be >= patch length ({patch_len})")
        self.num_patches = (sequence_length - patch_len) // stride + 1

        # 1. Patch projection & Positional Embedding
        patch_dim = patch_len * input_dim
        self.patch_proj = nn.Linear(patch_dim, hidden_dim)
        self.pos_embed = nn.Parameter(torch.zeros(1, self.num_patches, hidden_dim))
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

        # 2. PatchTST Transformer Encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=nhead,
            dim_feedforward=hidden_dim * 2,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_encoder_layers)

        # 3. BDH-Inspired Sequence Interaction Blocks
        self.bdh_blocks = nn.ModuleList([
            BDHInspiredBlock(hidden_dim=hidden_dim, dropout=dropout)
            for _ in range(num_bdh_layers)
        ])

        # 4. Forecasting Head
        self.head = nn.Linear(hidden_dim, output_targets * output_horizons)

    def extract_patches(self, x: torch.Tensor) -> torch.Tensor:
        """Extracts overlapping patches along the sequence dimension."""
        B, T, D = x.shape
        patches = x.unfold(dimension=1, size=self.patch_len, step=self.stride)
        patches = patches.permute(0, 1, 3, 2).contiguous().view(B, self.num_patches, self.patch_len * D)
        return patches

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for BDHPatchTSTHybrid.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)  # [1, T, 14]

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Patch extraction & linear projection
        patches = self.extract_patches(x)  # [B, N_p, patch_len * D_in]
        h = self.patch_proj(patches) + self.pos_embed  # [B, N_p, hidden_dim]

        # 2. PatchTST Transformer Encoder
        h = self.encoder(h)  # [B, N_p, hidden_dim]

        # 3. BDH-Inspired Interaction Blocks over Patch Embeddings
        for bdh_block in self.bdh_blocks:
            h = bdh_block(h)  # [B, N_p, hidden_dim]

        # 4. Forecasting Head
        last_patch_h = h[:, -1, :]  # [B, hidden_dim]
        out_flat = self.head(last_patch_h)  # [B, 15]
        out = out_flat.view(B, self.output_targets, self.output_horizons)  # [B, 3, 5]

        if is_single:
            out = out.squeeze(0)  # [3, 5]

        return out

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
