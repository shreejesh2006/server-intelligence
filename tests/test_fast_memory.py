"""
Unit Tests for FastAssociativeMemory Module
"""

import unittest
import numpy as np
import torch

from ml.bdh.fast_memory import FastAssociativeMemory


class TestFastAssociativeMemory(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)

    def test_initialization_and_zero_state(self):
        """Verifies memory matrix M is initialized to zeros and Frobenius norm is 0."""
        mem = FastAssociativeMemory(hidden_dim=64, memory_dim=64)
        self.assertEqual(mem.M.shape, (64, 64))
        self.assertEqual(mem.get_memory_norm(), 0.0)

    def test_reset_state(self):
        """Verifies reset_state clears matrix M back to zero."""
        mem = FastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)
        mem.update(z)
        self.assertGreater(mem.get_memory_norm(), 0.0)

        mem.reset_state()
        self.assertEqual(mem.get_memory_norm(), 0.0)

    def test_retrieve_does_not_mutate_state(self):
        """Verifies retrieve() performs non-mutating read."""
        mem = FastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)
        norm_before = mem.get_memory_norm()

        _ = mem.retrieve(z)
        norm_after = mem.get_memory_norm()

        self.assertEqual(norm_before, norm_after)

    def test_update_modifies_state(self):
        """Verifies update() modifies memory state persistent norm."""
        mem = FastAssociativeMemory(hidden_dim=64, memory_dim=64, decay=0.9, update_scale=0.2)
        z1 = torch.randn(4, 64)
        mem.update(z1)
        norm1 = mem.get_memory_norm()
        self.assertGreater(norm1, 0.0)

        z2 = torch.randn(4, 64)
        mem.update(z2)
        norm2 = mem.get_memory_norm()
        self.assertGreater(norm2, 0.0)
        self.assertNotEqual(norm1, norm2)

    def test_retrieval_numerical_stability(self):
        """Verifies retrieve output contains no NaNs or Infs."""
        mem = FastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(8, 64) * 100.0  # Large inputs
        mem.update(z)

        out = mem.retrieve(z)
        self.assertEqual(out.shape, (8, 64))
        self.assertFalse(torch.isnan(out).any())
        self.assertFalse(torch.isinf(out).any())


if __name__ == "__main__":
    unittest.main()
