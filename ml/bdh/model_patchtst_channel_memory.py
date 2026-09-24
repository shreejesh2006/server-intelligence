"""
PatchTST + BDH Channel-Isolated Gated Fast-Weight Associative Memory Model (Experiment D)
"""

import torch
import torch.nn as nn

from ml.bdh.model_patchtst import PatchTSTModel
from ml.bdh.channel_isolated_memory import ChannelIsolatedFastAssociativeMemory


class PatchTSTChannelMemoryModel(nn.Module):
    """
    PatchTST Model Enhanced with Persistent Channel-Isolated Gated Fast-Weight Memory (Experiment D).

    Architecture pipeline:
    Input telemetry X [B, 60, 14]
          │
          ▼
    PatchTST Encoder
          │
          ▼
    Temporal representation z_t [B, 64]
          │
      ┌───┼───┐  (Target Projections)
      ▼   ▼   ▼
    z_cpu z_mem z_load
      │   │   │
      ▼   ▼   ▼  (Isolated Memory Modules)
    M_cpu M_mem M_load
      │   │   │
      ▼   ▼   ▼  (Channel Forecasting Heads Linear(64, 5))
    CPU  RAM Load  Forecasts [B, 3, 5]

    Operations:
    1. PREDICT: `predict(x)` uses isolated memory states to produce forecast [B, 3, 5]. Zero memory mutation.
    2. UPDATE: `update_memory(x, y_actual, y_pred)` updates each target channel's memory matrix independently using
       valid-masked error signals. Zero cross-channel contamination guaranteed.
    3. RESET: `reset_memory()` clears all three persistent memory states.
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

        # 2. BDH Channel-Isolated Fast Associative Memory
        self.channel_memory = ChannelIsolatedFastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=hidden_dim,
            decay=memory_decay,
            update_scale=memory_update_scale,
            gate_slope=gate_slope,
            gate_bias=gate_bias,
        )

        # 3. Channel-Specific Forecasting Heads: Linear(64, 5) per target
        self.head_cpu = nn.Linear(hidden_dim, output_horizons)
        self.head_memory = nn.Linear(hidden_dim, output_horizons)
        self.head_load = nn.Linear(hidden_dim, output_horizons)

    def extract_latent(self, x: torch.Tensor) -> torch.Tensor:
        """Extracts base latent representation z_t [B, hidden_dim]."""
        return self.patchtst.extract_representation(x)

    def predict(self, x: torch.Tensor) -> torch.Tensor:
        """
        Non-mutating forecast using current persistent channel-isolated memory states.
        Input x: [B, T, 14] or [T, 14]
        Returns forecast tensor: [B, 3, 5] (Target 0: CPU, Target 1: Memory, Target 2: Load).
        Does NOT modify any persistent memory state.
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)  # [1, T, 14]

        B, T, D_in = x.shape
        if D_in != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D_in}")

        # 1. Base latent extraction
        z_t = self.extract_latent(x)  # [B, hidden_dim]

        # 2. Retrieve channel-isolated memory-enhanced representations
        mem_dict = self.channel_memory.retrieve(z_t)
        m_cpu = mem_dict["cpu"]          # [B, hidden_dim]
        m_memory = mem_dict["memory"]    # [B, hidden_dim]
        m_load = mem_dict["load_1m"]     # [B, hidden_dim]

        # 3. Project via channel-specific heads -> [B, 5]
        out_cpu = self.head_cpu(m_cpu).unsqueeze(1)          # [B, 1, 5]
        out_memory = self.head_memory(m_memory).unsqueeze(1) # [B, 1, 5]
        out_load = self.head_load(m_load).unsqueeze(1)       # [B, 1, 5]

        # Stack targets -> [B, 3, 5]
        out = torch.cat([out_cpu, out_memory, out_load], dim=1)

        if is_single:
            out = out.squeeze(0)

        return out

    def compute_error_signal_for_channel(
        self, y_actual_chan: torch.Tensor, y_pred_chan: torch.Tensor, eps: float = 1e-5
    ) -> float | None:
        """
        Computes relative error e_k for a single target channel over valid (finite, non-NaN) values.
        Returns None if no valid targets exist.
        """
        valid_mask = torch.isfinite(y_actual_chan) & torch.isfinite(y_pred_chan)
        if not torch.any(valid_mask):
            return None

        diff = torch.abs(y_actual_chan[valid_mask] - y_pred_chan[valid_mask])
        norm_actual = torch.abs(y_actual_chan[valid_mask])

        sum_diff = torch.sum(diff)
        sum_actual = torch.sum(norm_actual)

        e_k = float((sum_diff / (sum_actual + eps)).item())
        return e_k

    def update_memory(
        self,
        x_observed: torch.Tensor,
        y_actual: torch.Tensor | None = None,
        y_pred: torch.Tensor | None = None,
    ) -> dict[str, float]:
        """
        Updates each target channel's isolated memory matrix independently.
        CPU observation -> M_cpu ONLY.
        RAM observation -> M_memory ONLY.
        Load observation -> M_load ONLY.
        Zero cross-channel contamination guaranteed.
        """
        is_single = (x_observed.ndim == 2)
        if is_single:
            x_observed = x_observed.unsqueeze(0)

        with torch.no_grad():
            z_t = self.extract_latent(x_observed)

            gates = {}
            target_names = ["cpu", "memory", "load_1m"]

            for m_idx, t_name in enumerate(target_names):
                if y_actual is not None and y_pred is not None:
                    # Select slice for channel m_idx -> shape [B, 1] or [B, H]
                    y_act_chan = y_actual[:, m_idx] if y_actual.ndim >= 2 else y_actual
                    y_pred_chan = y_pred[:, m_idx] if y_pred.ndim >= 2 else y_pred
                    err_chan = self.compute_error_signal_for_channel(y_act_chan, y_pred_chan)
                else:
                    err_chan = None

                g_c = self.channel_memory.update_target(t_name, z_t, error_signal=err_chan)
                gates[t_name] = g_c

        return gates

    def reset_memory(self) -> None:
        """Resets all three persistent channel-isolated memory states."""
        self.channel_memory.reset_state()

    def get_memory_norms(self) -> dict[str, float]:
        """Returns Frobenius norms for each channel memory matrix."""
        return self.channel_memory.get_memory_norms()

    def get_gate_stats(self) -> dict[str, dict]:
        """Returns gate audit statistics for each channel."""
        return self.channel_memory.get_gate_stats()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass defaults to non-mutating prediction."""
        return self.predict(x)

    def get_parameter_counts(self) -> tuple[int, int]:
        """Calculates total and trainable parameter counts."""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
