"""
Unit Tests for GatedFastAssociativeMemory Module (Experiment C-Fix)
"""

import math
import unittest
import numpy as np
import torch

from ml.bdh.gated_fast_memory import GatedFastAssociativeMemory


class TestGatedFastAssociativeMemory(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)

    def test_initialization_and_zero_state(self):
        """Verifies memory matrix M is initialized to zeros and Frobenius norm is 0."""
        mem = GatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        self.assertEqual(mem.M.shape, (64, 64))
        self.assertEqual(mem.get_memory_norm(), 0.0)
        stats = mem.get_gate_stats()
        self.assertEqual(stats["total_updates"], 0)

    def test_gate_computation_bounds_and_monotonicity(self):
        """Verifies gate g_k is strictly bounded in [0, 1] and monotonic with error signal."""
        mem = GatedFastAssociativeMemory(hidden_dim=64, memory_dim=64, gate_slope=5.0, gate_bias=-2.5)

        g_low = float(mem.compute_gate(error_signal=0.1).item())
        g_mid = float(mem.compute_gate(error_signal=0.5).item())
        g_high = float(mem.compute_gate(error_signal=1.0).item())

        self.assertGreaterEqual(g_low, 0.0)
        self.assertLessEqual(g_high, 1.0)
        self.assertLess(g_low, g_mid)
        self.assertLess(g_mid, g_high)

    def test_empty_or_nan_error_causes_no_memory_update(self):
        """Verifies None or NaN error signal closes gate (g_k = 0) and skips memory matrix M update."""
        mem = GatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        # Update with None error
        g_val = mem.update(z, error_signal=None)
        self.assertEqual(g_val, 0.0)
        self.assertEqual(mem.get_memory_norm(), 0.0)

        # Update with NaN error
        g_val_nan = mem.update(z, error_signal=float("nan"))
        self.assertEqual(g_val_nan, 0.0)
        self.assertEqual(mem.get_memory_norm(), 0.0)

    def test_reset_state_clears_history(self):
        """Verifies reset_state clears matrix M back to zero and resets gate history."""
        mem = GatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)
        mem.update(z, error_signal=0.5)

        self.assertEqual(len(mem.gate_history), 1)
        self.assertGreater(mem.get_memory_norm(), 0.0)

        mem.reset_state()
        self.assertEqual(mem.get_memory_norm(), 0.0)
        self.assertEqual(len(mem.gate_history), 0)
        stats = mem.get_gate_stats()
        self.assertEqual(stats["total_updates"], 0)

    def test_retrieve_does_not_mutate_state(self):
        """Verifies retrieve() performs non-mutating read."""
        mem = GatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)
        norm_before = mem.get_memory_norm()

        _ = mem.retrieve(z)
        norm_after = mem.get_memory_norm()

        self.assertEqual(norm_before, norm_after)


if __name__ == "__main__":
    unittest.main()
