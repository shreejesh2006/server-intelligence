"""
PatchTST + BDH Fast-Weight Associative Memory Model for Telemetry Forecasting
"""

import torch
import torch.nn as nn

from ml.bdh.model_patchtst import PatchTSTModel
from ml.bdh.fast_memory import FastAssociativeMemory


class PatchTSTFastMemoryModel(nn.Module):
    """
    PatchTST Sequence Model Enhanced with Persistent Fast-Weight Associative Memory.

    Architecture pipeline:
    Input telemetry X [B, 60, 14]
          │
          ▼
    PatchTST Encoder
          │
          ▼
    Temporal representation z_t [B, 64]
          │
          ▼
    Persistent Fast-Weight Memory (FastAssociativeMemory)
          │
          ▼
    Memory-Enhanced Representation z_t^mem [B, 64]
          │
          ▼
    Forecasting Head Linear(64, 15) -> [B, 3, 5]

    Operations:
    1. PREDICT: `predict(x)` uses current memory state to produce forecast [B, 3, 5]. Zero memory mutation.
    2. UPDATE: `update_memory(x)` updates persistent fast-weight matrix M_t from actual observations.
    3. RESET: `reset_memory()` clears persistent memory state.
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
        memory_decay: float = 0.95,
        memory_update_scale: float = 0.1,
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

        # 1. Base PatchTST Model
        self.patchtst = PatchTSTModel(
            input_dim=input_dim,
            sequence_length=sequence_length,
            patch_len=patch_len,
            stride=stride,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            nhead=nhead,
            dropout=dropout,
            output_targets=output_targets,
            output_horizons=output_horizons,
        )

        # 2. BDH-Inspired Persistent Fast-Weight Associative Memory
        self.fast_memory = FastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=hidden_dim,
            decay=memory_decay,
            update_scale=memory_update_scale,
        )

        # 3. Task-specific forecasting head over memory-enhanced representation
        self.head = nn.Linear(hidden_dim, output_targets * output_horizons)

    def extract_latent(self, x: torch.Tensor) -> torch.Tensor:
        """Extracts latent temporal representation z_t [B, hidden_dim]."""
        return self.patchtst.extract_representation(x)

    def predict(self, x: torch.Tensor) -> torch.Tensor:
        """
        Non-mutating forecast using current persistent memory state.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        Does NOT modify persistent memory state.
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)  # [1, T, 14]

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Extract base temporal representation z_t
        z_t = self.extract_latent(x)  # [B, hidden_dim]

        # 2. Retrieve memory-enhanced representation (non-mutating)
        z_mem = self.fast_memory.retrieve(z_t)  # [B, hidden_dim]

        # 3. Project via forecasting head
        out_flat = self.head(z_mem)  # [B, 15]
        out = out_flat.view(B, self.output_targets, self.output_horizons)  # [B, 3, 5]

        if is_single:
            out = out.squeeze(0)

        return out

    def update_memory(self, x_observed: torch.Tensor) -> None:
        """
        Updates persistent memory state from newly observed telemetry.
        Called strictly AFTER actual observations become available.
        """
        is_single = (x_observed.ndim == 2)
        if is_single:
            x_observed = x_observed.unsqueeze(0)

        with torch.no_grad():
            z_t = self.extract_latent(x_observed)
            self.fast_memory.update(z_t)

    def reset_memory(self) -> None:
        """Resets persistent memory state to zeros."""
        self.fast_memory.reset_state()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass defaults to non-mutating prediction."""
        return self.predict(x)

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
