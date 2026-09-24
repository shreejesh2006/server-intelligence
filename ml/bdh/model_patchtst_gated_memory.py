"""
PatchTST + BDH Gated Fast-Weight Associative Memory Model (Experiment C-Fix)
"""

import torch
import torch.nn as nn

from ml.bdh.model_patchtst import PatchTSTModel
from ml.bdh.gated_fast_memory import GatedFastAssociativeMemory


class PatchTSTGatedMemoryModel(nn.Module):
    """
    PatchTST Sequence Model Enhanced with Persistent Gated Fast-Weight Associative Memory (Experiment C-Fix).

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
    Persistent Gated Fast-Weight Memory (GatedFastAssociativeMemory)
          │
          ▼
    Memory-Enhanced Representation z_t^mem [B, 64]
          │
          ▼
    Forecasting Head Linear(64, 15) -> [B, 3, 5]

    Operations:
    1. PREDICT: `predict(x)` uses current memory state to produce forecast [B, 3, 5]. Zero memory mutation.
    2. UPDATE: `update_memory(x, y_actual, y_pred)` updates persistent fast-weight matrix M_t using write gate g_k
       computed strictly over valid (finite, non-NaN) target observations.
    3. RESET: `reset_memory()` clears persistent memory state and audit history.
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
        gate_slope: float = 5.0,
        gate_bias: float = -2.5,
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
        self.gate_slope = gate_slope
        self.gate_bias = gate_bias
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

        # 2. BDH-Inspired Persistent Gated Fast-Weight Associative Memory
        self.fast_memory = GatedFastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=hidden_dim,
            decay=memory_decay,
            update_scale=memory_update_scale,
            gate_slope=gate_slope,
            gate_bias=gate_bias,
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

    def compute_error_signal(
        self, y_actual: torch.Tensor, y_pred: torch.Tensor, eps: float = 1e-5
    ) -> float | None:
        """
        Computes relative normalized error signal e_k strictly over valid (finite, non-NaN) observations.
        valid_mask = isfinite(y_actual) & isfinite(y_pred)
        e_k = sum(|y_actual - y_pred|) / (sum(|y_actual|) + eps)
        Returns None if valid_mask is empty (zero valid observations).
        """
        valid_mask = torch.isfinite(y_actual) & torch.isfinite(y_pred)
        if not torch.any(valid_mask):
            return None

        diff = torch.abs(y_actual[valid_mask] - y_pred[valid_mask])
        norm_actual = torch.abs(y_actual[valid_mask])

        sum_diff = torch.sum(diff)
        sum_actual = torch.sum(norm_actual)

        e_k = float((sum_diff / (sum_actual + eps)).item())
        return e_k

    def update_memory(
        self,
        x_observed: torch.Tensor,
        y_actual: torch.Tensor | None = None,
        y_pred: torch.Tensor | None = None,
        error_signal: float | torch.Tensor | None = None,
        gate_value: float | torch.Tensor | None = None,
    ) -> float:
        """
        Updates persistent memory state from newly observed telemetry using write gate g_k.
        Called strictly AFTER actual observations become available.
        Returns computed gate value g_k.
        """
        is_single = (x_observed.ndim == 2)
        if is_single:
            x_observed = x_observed.unsqueeze(0)

        if error_signal is None and y_actual is not None and y_pred is not None:
            error_signal = self.compute_error_signal(y_actual, y_pred)

        with torch.no_grad():
            z_t = self.extract_latent(x_observed)
            g_k = self.fast_memory.update(z_t, error_signal=error_signal, gate_value=gate_value)

        return g_k

    def reset_memory(self) -> None:
        """Resets persistent memory state and audit logs."""
        self.fast_memory.reset_state()

    def get_gate_stats(self) -> dict:
        """Returns gate audit statistics."""
        return self.fast_memory.get_gate_stats()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass defaults to non-mutating prediction."""
        return self.predict(x)

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
