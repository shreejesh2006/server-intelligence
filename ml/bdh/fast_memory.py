"""
BDH-Inspired Persistent Fast-Weight Associative Memory Module
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class FastAssociativeMemory(nn.Module):
    """
    BDH-Inspired Fast-Weight / Hebbian Associative Memory Module.

    Key principles:
    1. Maintains a persistent outer-product memory state M [memory_dim, memory_dim].
    2. Incremental Hebbian update: M_t = decay * M_(t-1) + update_scale * (k_t^T @ v_t).
    3. Memory retrieval: m_t = LayerNorm(ReLU(q_t @ M_t)).
    4. Predict/Update Separation: `retrieve()` performs non-mutating memory read;
       `update()` modifies persistent matrix M_t incrementally.
    """

    def __init__(
        self,
        hidden_dim: int = 64,
        memory_dim: int = 64,
        decay: float = 0.95,
        update_scale: float = 0.1,
    ):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.memory_dim = memory_dim
        self.decay = decay
        self.update_scale = update_scale

        # Key, Value, Query projections
        self.key_proj = nn.Linear(hidden_dim, memory_dim, bias=False)
        self.val_proj = nn.Linear(hidden_dim, memory_dim, bias=False)
        self.query_proj = nn.Linear(hidden_dim, memory_dim, bias=False)

        # Output projection back to hidden dimension
        self.out_proj = nn.Linear(memory_dim, hidden_dim)

        self.norm1 = nn.LayerNorm(hidden_dim)
        self.norm_mem = nn.LayerNorm(memory_dim)

        # Persistent fast-weight associative matrix state M [memory_dim, memory_dim]
        self.register_buffer("M", torch.zeros(memory_dim, memory_dim))

    def reset_state(self) -> None:
        """Resets persistent memory matrix M to zeros."""
        self.M.zero_()

    def retrieve(self, z_t: torch.Tensor) -> torch.Tensor:
        """
        Non-mutating memory retrieval.
        Input z_t: [B, hidden_dim] or [hidden_dim]
        Returns memory-enhanced representation: [B, hidden_dim] or [hidden_dim]
        Does NOT modify persistent memory state M.
        """
        is_single = (z_t.ndim == 1)
        if is_single:
            z_t = z_t.unsqueeze(0)  # [1, hidden_dim]

        B, D = z_t.shape
        q_t = self.query_proj(z_t)  # [B, memory_dim]

        # Retrieve raw memory representation q_t @ M -> [B, memory_dim]
        m_raw = torch.matmul(q_t, self.M)

        # BDH-inspired non-negative score activation (ReLU) & LayerNorm
        m_act = F.relu(m_raw)
        m_norm = self.norm_mem(m_act)

        # Residual integration with input representation z_t
        out = self.norm1(z_t + self.out_proj(m_norm))

        if is_single:
            out = out.squeeze(0)

        return out

    def update(self, z_t: torch.Tensor) -> None:
        """
        Incremental Hebbian associative memory state update.
        Input z_t: [B, hidden_dim] or [hidden_dim]
        Updates persistent memory matrix M_t = decay * M_(t-1) + update_scale * (k_t^T @ v_t).
        """
        if z_t.ndim == 1:
            z_t = z_t.unsqueeze(0)

        B, D = z_t.shape
        with torch.no_grad():
            k_t = self.key_proj(z_t)  # [B, memory_dim]
            v_t = self.val_proj(z_t)  # [B, memory_dim]

            # Average outer-product matrix across batch samples -> [memory_dim, memory_dim]
            delta_M = torch.matmul(k_t.transpose(0, 1), v_t) / max(1.0, float(B))

            # Persistent memory update: decay old state + add new association
            self.M.mul_(self.decay).add_(delta_M, alpha=self.update_scale)

            # Bound matrix values for numerical stability
            torch.clamp_(self.M, min=-10.0, max=10.0)

    def forward(self, z_t: torch.Tensor) -> torch.Tensor:
        """Forward pass defaults to non-mutating memory retrieval."""
        return self.retrieve(z_t)

    def get_memory_norm(self) -> float:
        """Returns Frobenius norm of current persistent memory matrix M."""
        return float(torch.norm(self.M, p="fro").item())
