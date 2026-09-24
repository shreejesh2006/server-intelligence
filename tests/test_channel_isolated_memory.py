"""
Unit Tests for ChannelIsolatedFastAssociativeMemory Module (Experiment D)
Includes direct Cross-Contamination Test proving target isolation.
"""

import math
import unittest
import numpy as np
import torch

from ml.bdh.channel_isolated_memory import ChannelIsolatedFastAssociativeMemory


class TestChannelIsolatedMemory(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)

    def test_three_independent_memory_states_exist(self):
        """Verifies M_cpu, M_memory, M_load exist independently and default to Frobenius norm 0.0."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        norms = mem.get_memory_norms()

        self.assertEqual(norms["cpu"], 0.0)
        self.assertEqual(norms["memory"], 0.0)
        self.assertEqual(norms["load_1m"], 0.0)

    def test_cpu_update_does_not_modify_memory_or_load(self):
        """Verifies updating CPU modifies M_cpu ONLY and causes ZERO mutation to M_memory or M_load."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        g_val = mem.update_target("cpu", z, error_signal=0.5)
        self.assertGreater(g_val, 0.0)

        norms = mem.get_memory_norms()
        self.assertGreater(norms["cpu"], 0.0)
        self.assertEqual(norms["memory"], 0.0)
        self.assertEqual(norms["load_1m"], 0.0)

    def test_ram_update_does_not_modify_cpu_or_load(self):
        """Verifies updating RAM modifies M_memory ONLY and causes ZERO mutation to M_cpu or M_load."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        g_val = mem.update_target("memory", z, error_signal=0.6)
        self.assertGreater(g_val, 0.0)

        norms = mem.get_memory_norms()
        self.assertEqual(norms["cpu"], 0.0)
        self.assertGreater(norms["memory"], 0.0)
        self.assertEqual(norms["load_1m"], 0.0)

    def test_load_update_does_not_modify_cpu_or_memory(self):
        """Verifies updating Load modifies M_load ONLY and causes ZERO mutation to M_cpu or M_memory."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        g_val = mem.update_target("load_1m", z, error_signal=0.4)
        self.assertGreater(g_val, 0.0)

        norms = mem.get_memory_norms()
        self.assertEqual(norms["cpu"], 0.0)
        self.assertEqual(norms["memory"], 0.0)
        self.assertGreater(norms["load_1m"], 0.0)

    def test_retrieve_does_not_mutate_any_memory(self):
        """Verifies retrieve() performs non-mutating read on all three channel memories."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        norms_before = mem.get_memory_norms()
        _ = mem.retrieve(z)
        norms_after = mem.get_memory_norms()

        self.assertEqual(norms_before, norms_after)

    def test_reset_state_resets_all_three_memories(self):
        """Verifies reset_state clears M_cpu, M_memory, and M_load back to zero."""
        mem = ChannelIsolatedFastAssociativeMemory(hidden_dim=64, memory_dim=64)
        z = torch.randn(4, 64)

        mem.update_target("cpu", z, error_signal=0.5)
        mem.update_target("memory", z, error_signal=0.5)
        mem.update_target("load_1m", z, error_signal=0.5)

        mem.reset_state()
        norms = mem.get_memory_norms()

        self.assertEqual(norms["cpu"], 0.0)
        self.assertEqual(norms["memory"], 0.0)
        self.assertEqual(norms["load_1m"], 0.0)


if __name__ == "__main__":
    unittest.main()
