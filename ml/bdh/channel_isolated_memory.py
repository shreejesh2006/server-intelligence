"""
BDH-Inspired Channel-Isolated Gated Fast-Weight Associative Memory Module (Experiment D)
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml.bdh.gated_fast_memory import GatedFastAssociativeMemory


class ChannelIsolatedFastAssociativeMemory(nn.Module):
    """
    BDH-Inspired Channel-Isolated Gated Fast-Weight Associative Memory Module (Experiment D).

    Key principles:
    1. Maintains THREE independent persistent outer-product memory states:
       - M_cpu    [memory_dim, memory_dim]
       - M_memory [memory_dim, memory_dim]
       - M_load   [memory_dim, memory_dim]
    2. Strict Channel Isolation:
       - CPU observations update M_cpu ONLY (zero mutation to M_memory or M_load).
       - RAM observations update M_memory ONLY (zero mutation to M_cpu or M_load).
       - Load observations update M_load ONLY (zero mutation to M_cpu or M_memory).
    3. Target-Specific Latent Projections:
       - z_cpu    = proj_cpu(z_t)
       - z_memory = proj_memory(z_t)
       - z_load   = proj_load(z_t)
    4. Non-mutating Retrieval: Returns memory-enhanced latent representations for each target channel.
    5. Preserves all C-Fix hyperparameters: gate_slope = 5.0, gate_bias = -2.5, decay = 0.95, update_scale = 0.1.
    """

    def __init__(
        self,
        hidden_dim: int = 64,
        memory_dim: int = 64,
        decay: float = 0.95,
        update_scale: float = 0.1,
        gate_slope: float = 5.0,
        gate_bias: float = -2.5,
    ):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.memory_dim = memory_dim

        # Target-specific latent projections
        self.proj_cpu = nn.Linear(hidden_dim, hidden_dim)
        self.proj_memory = nn.Linear(hidden_dim, hidden_dim)
        self.proj_load = nn.Linear(hidden_dim, hidden_dim)

        # Three isolated memory modules
        self.mem_cpu = GatedFastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=memory_dim,
            decay=decay,
            update_scale=update_scale,
            gate_slope=gate_slope,
            gate_bias=gate_bias,
        )
        self.mem_memory = GatedFastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=memory_dim,
            decay=decay,
            update_scale=update_scale,
            gate_slope=gate_slope,
            gate_bias=gate_bias,
        )
        self.mem_load = GatedFastAssociativeMemory(
            hidden_dim=hidden_dim,
            memory_dim=memory_dim,
            decay=decay,
            update_scale=update_scale,
            gate_slope=gate_slope,
            gate_bias=gate_bias,
        )

    def reset_state(self) -> None:
        """Resets all three persistent memory matrices to zero and clears histories."""
        self.mem_cpu.reset_state()
        self.mem_memory.reset_state()
        self.mem_load.reset_state()

    def retrieve(self, z_t: torch.Tensor) -> dict[str, torch.Tensor]:
        """
        Non-mutating memory retrieval for each isolated target channel.
        Returns dict containing:
        - "cpu": [B, hidden_dim]
        - "memory": [B, hidden_dim]
        - "load_1m": [B, hidden_dim]
        Does NOT modify any persistent memory state.
        """
        is_single = (z_t.ndim == 1)
        if is_single:
            z_t = z_t.unsqueeze(0)

        z_c = self.proj_cpu(z_t)
        z_m = self.proj_memory(z_t)
        z_l = self.proj_load(z_t)

        m_cpu = self.mem_cpu.retrieve(z_c)
        m_memory = self.mem_memory.retrieve(z_m)
        m_load = self.mem_load.retrieve(z_l)

        if is_single:
            m_cpu = m_cpu.squeeze(0)
            m_memory = m_memory.squeeze(0)
            m_load = m_load.squeeze(0)

        return {
            "cpu": m_cpu,
            "memory": m_memory,
            "load_1m": m_load,
        }

    def update_target(
        self,
        target_name: str,
        z_t: torch.Tensor,
        error_signal: float | torch.Tensor | None = None,
        gate_value: float | torch.Tensor | None = None,
    ) -> float:
        """
        Updates ONLY the specified target channel's isolated memory matrix.
        Zero cross-channel mutation guaranteed.
        """
        if z_t.ndim == 1:
            z_t = z_t.unsqueeze(0)

        if target_name == "cpu":
            z_proj = self.proj_cpu(z_t)
            return self.mem_cpu.update(z_proj, error_signal=error_signal, gate_value=gate_value)
        elif target_name in ["memory", "ram"]:
            z_proj = self.proj_memory(z_t)
            return self.mem_memory.update(z_proj, error_signal=error_signal, gate_value=gate_value)
        elif target_name in ["load", "load_1m"]:
            z_proj = self.proj_load(z_t)
            return self.mem_load.update(z_proj, error_signal=error_signal, gate_value=gate_value)
        else:
            raise ValueError(f"Unknown target channel name: {target_name}")

    def get_memory_norms(self) -> dict[str, float]:
        """Returns Frobenius norm for each isolated target memory matrix."""
        return {
            "cpu": self.mem_cpu.get_memory_norm(),
            "memory": self.mem_memory.get_memory_norm(),
            "load_1m": self.mem_load.get_memory_norm(),
        }

    def get_gate_stats(self) -> dict[str, dict]:
        """Returns gate audit history and stats for each target channel."""
        return {
            "cpu": self.mem_cpu.get_gate_stats(),
            "memory": self.mem_memory.get_gate_stats(),
            "load_1m": self.mem_load.get_gate_stats(),
        }
