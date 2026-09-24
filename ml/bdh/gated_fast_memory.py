"""
BDH-Inspired Persistent Gated Fast-Weight Associative Memory Module (Experiment C-Fix)
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class GatedFastAssociativeMemory(nn.Module):
    """
    BDH-Inspired Gated Fast-Weight / Hebbian Associative Memory Module (Experiment C-Fix).

    Key principles:
    1. Maintains a persistent outer-product memory state M [memory_dim, memory_dim].
    2. Controlled error/novelty write gating: g_k = sigmoid(gate_slope * e_k + gate_bias) in (0, 1).
       Preserves strict hyperparameters: gate_slope = 5.0, gate_bias = -2.5, decay = 0.95, update_scale = 0.1.
    3. Invalid / Empty Mask Handling: If no valid finite observations exist (error_signal is None),
       gate is set to 0.0 and memory update is skipped (M_t = M_(t-1)).
    4. Incremental Gated Hebbian update: M_t = decay * M_(t-1) + g_k * update_scale * (k_t^T @ v_t).
    5. Non-mutating retrieval: m_t = LayerNorm(ReLU(q_t @ M_t)).
    6. Audit History Tracking: Maintains audit log of gate values g_k, relative errors e_k, and Frobenius norms ||M||_F.
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
        self.decay = decay
        self.update_scale = update_scale
        self.gate_slope = gate_slope
        self.gate_bias = gate_bias

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

        # Internal history tracking for gate diagnostic audit
        self.gate_history: list[float] = []
        self.error_history: list[float] = []
        self.norm_history: list[float] = []

    def reset_state(self) -> None:
        """Resets persistent memory matrix M to zeros and clears audit histories."""
        self.M.zero_()
        self.gate_history.clear()
        self.error_history.clear()
        self.norm_history.clear()

    def compute_gate(
        self, error_signal: float | torch.Tensor | None = None, gate_value: float | torch.Tensor | None = None
    ) -> torch.Tensor:
        """
        Computes write gate g_k in [0, 1].
        If explicit gate_value is supplied, clamps to [0, 1].
        If error_signal is None (no valid observations), returns 0.0 (gate closed).
        Otherwise computes g_k = sigmoid(gate_slope * error_signal + gate_bias).
        """
        if gate_value is not None:
            if isinstance(gate_value, torch.Tensor):
                return torch.clamp(gate_value, 0.0, 1.0)
            return torch.tensor(float(gate_value), dtype=torch.float32, device=self.M.device).clamp(0.0, 1.0)

        if error_signal is None or (isinstance(error_signal, float) and math.isnan(error_signal)):
            return torch.tensor(0.0, dtype=torch.float32, device=self.M.device)

        if isinstance(error_signal, torch.Tensor):
            err = float(error_signal.detach().mean().item())
        else:
            err = float(error_signal)

        # Sigmoid gate formulation: g = sigmoid(5.0 * e - 2.5)
        logit = self.gate_slope * err + self.gate_bias
        gate_val = 1.0 / (1.0 + math.exp(-logit))
        return torch.tensor(gate_val, dtype=torch.float32, device=self.M.device)

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

    def update(
        self,
        z_t: torch.Tensor,
        error_signal: float | torch.Tensor | None = None,
        gate_value: float | torch.Tensor | None = None,
    ) -> float:
        """
        Incremental Gated Hebbian associative memory state update.
        Input z_t: [B, hidden_dim] or [hidden_dim]
        If error_signal is None (no valid observations), skips memory state update (g_k = 0.0).
        Updates persistent memory matrix M_t = decay * M_(t-1) + g_k * update_scale * (k_t^T @ v_t).
        Returns computed gate value g_k.
        """
        if z_t.ndim == 1:
            z_t = z_t.unsqueeze(0)

        B, D = z_t.shape

        if error_signal is None and gate_value is None:
            # Empty / invalid batch: do NOT update memory, do NOT open gate
            with torch.no_grad():
                current_norm = float(torch.norm(self.M, p="fro").item())
                self.gate_history.append(0.0)
                self.error_history.append(float("nan"))
                self.norm_history.append(current_norm)
            return 0.0

        # Compute gate value g_k
        g_tensor = self.compute_gate(error_signal=error_signal, gate_value=gate_value)
        g_k = float(g_tensor.item())

        if error_signal is not None:
            err_val = float(error_signal.detach().mean().item()) if isinstance(error_signal, torch.Tensor) else float(error_signal)
        else:
            err_val = float("nan")

        with torch.no_grad():
            if g_k > 0.0:
                k_t = self.key_proj(z_t)  # [B, memory_dim]
                v_t = self.val_proj(z_t)  # [B, memory_dim]

                # Average outer-product matrix across batch samples -> [memory_dim, memory_dim]
                delta_M = torch.matmul(k_t.transpose(0, 1), v_t) / max(1.0, float(B))

                # Gated memory update: decay old state + add gated association
                effective_scale = self.update_scale * g_k
                self.M.mul_(self.decay).add_(delta_M, alpha=effective_scale)

                # Bound matrix values for numerical stability
                torch.clamp_(self.M, min=-10.0, max=10.0)

            # Record gate audit statistics
            current_norm = float(torch.norm(self.M, p="fro").item())
            self.gate_history.append(g_k)
            self.error_history.append(err_val)
            self.norm_history.append(current_norm)

        return g_k

    def forward(self, z_t: torch.Tensor) -> torch.Tensor:
        """Forward pass defaults to non-mutating memory retrieval."""
        return self.retrieve(z_t)

    def get_memory_norm(self) -> float:
        """Returns Frobenius norm of current persistent memory matrix M."""
        return float(torch.norm(self.M, p="fro").item())

    def get_gate_stats(self) -> dict:
        """Returns summary dictionary of gate audit history."""
        if not self.gate_history:
            return {
                "total_updates": 0,
                "mean_gate": 0.0,
                "min_gate": 0.0,
                "max_gate": 0.0,
                "latest_gate": 0.0,
                "mean_error": 0.0,
                "latest_norm": self.get_memory_norm(),
            }

        gates = self.gate_history
        valid_errors = [e for e in self.error_history if not math.isnan(e)]
        return {
            "total_updates": len(gates),
            "mean_gate": float(sum(gates) / len(gates)),
            "min_gate": float(min(gates)),
            "max_gate": float(max(gates)),
            "latest_gate": float(gates[-1]),
            "mean_error": float(sum(valid_errors) / len(valid_errors)) if valid_errors else 0.0,
            "latest_norm": self.get_memory_norm(),
        }
