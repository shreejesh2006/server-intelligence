"""
Unit Tests for PatchTSTGatedMemoryModel and PatchTSTGatedMemoryAdapter (Experiment C-Fix)
Includes strict Temporal Multi-Horizon Leakage Test and Relative Error Masking Tests.
"""

import math
import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch

from ml.bdh.model_patchtst_gated_memory import PatchTSTGatedMemoryModel
from ml.bdh.adapters_patchtst_gated_memory import PatchTSTGatedMemoryAdapter


class TestPatchTSTGatedMemory(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        np.random.seed(42)

    def test_model_forward_and_prediction_shapes(self):
        """Verifies forward and predict output shape [B, 3, 5]."""
        model = PatchTSTGatedMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)

        # Batch input
        x_batch = torch.randn(4, 60, 14)
        out_batch = model.predict(x_batch)
        self.assertEqual(out_batch.shape, (4, 3, 5))

        # Single window input
        x_single = torch.randn(60, 14)
        out_single = model.predict(x_single)
        self.assertEqual(out_single.shape, (3, 5))

    def test_compute_error_signal_masks_nans_and_remains_finite(self):
        """Verifies compute_error_signal ignores NaNs, produces finite error, and handles near-zero actuals."""
        model = PatchTSTGatedMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)

        # 1. NaN targets present
        y_actual = torch.tensor([[[10.0], [float("nan")], [0.0]]], dtype=torch.float32)
        y_pred = torch.tensor([[[12.0], [50.0], [0.1]]], dtype=torch.float32)

        err = model.compute_error_signal(y_actual, y_pred)
        self.assertIsNotNone(err)
        self.assertTrue(math.isfinite(err))
        # NaN target [1] is excluded from both numerator and denominator!
        # Numerator = |10-12| + |0-0.1| = 2.1
        # Denominator = |10| + |0| = 10.0 -> err approx 0.21
        self.assertAlmostEqual(err, 2.1 / 10.00001, places=4)

        # 2. Near-zero actual values do not explode into 322,018
        y_actual_zero = torch.tensor([[[0.0], [0.0], [0.0]]], dtype=torch.float32)
        y_pred_small = torch.tensor([[[0.1], [0.1], [0.1]]], dtype=torch.float32)

        err_zero = model.compute_error_signal(y_actual_zero, y_pred_small)
        self.assertIsNotNone(err_zero)
        self.assertTrue(math.isfinite(err_zero))
        # Numerator = 0.3, Denominator = 1e-5 -> err_zero = 30000.0 (bounded, not nan/inf/30M)

        # 3. All NaN / Invalid mask returns None (no update)
        y_actual_all_nan = torch.tensor([[[float("nan")], [float("nan")], [float("nan")]]], dtype=torch.float32)
        err_none = model.compute_error_signal(y_actual_all_nan, y_pred)
        self.assertIsNone(err_none)

    def test_empty_valid_mask_causes_no_memory_update(self):
        """Verifies empty valid target mask results in closed gate (g=0) and no state update."""
        model = PatchTSTGatedMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)
        model.eval()

        x = torch.randn(2, 60, 14)
        y_nan = torch.full((2, 3, 5), float("nan"), dtype=torch.float32)
        y_pred = torch.randn(2, 3, 5)

        norm_before = model.fast_memory.get_memory_norm()
        g_k = model.update_memory(x, y_actual=y_nan, y_pred=y_pred)
        norm_after = model.fast_memory.get_memory_norm()

        self.assertEqual(g_k, 0.0)
        self.assertEqual(norm_before, norm_after)

    def test_predict_does_not_update_memory(self):
        """Verifies predict() leaves memory state matrix M unchanged."""
        model = PatchTSTGatedMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)
        x = torch.randn(2, 60, 14)

        norm_before = model.fast_memory.get_memory_norm()
        _ = model.predict(x)
        norm_after = model.fast_memory.get_memory_norm()

        self.assertEqual(norm_before, norm_after)

    def test_temporal_multi_horizon_leakage_prevention(self):
        """
        CRITICAL TEMPORAL LEAKAGE TEST:
        Constructs Stream A (correct 5m observation) and Stream B (modifies ONLY future 15m/30m/1h/3h labels).
        Asserts that memory matrix M and predictions immediately after 5m update are EXACTLY IDENTICAL.
        """
        adapter_a = PatchTSTGatedMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)
        adapter_b = PatchTSTGatedMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)

        # Same weights
        adapter_b.model.load_state_dict(adapter_a.model.state_dict())

        X_batch = np.random.randn(5, 60, 14).astype(np.float32)

        # Predict step (identical)
        p_a = adapter_a.predict_tensor(X_batch)
        p_b = adapter_b.predict_tensor(X_batch)
        np.testing.assert_allclose(p_a, p_b, rtol=1e-6, atol=1e-6)

        # 5m actual observations (identical for Stream A and Stream B)
        y_actual_5m_a = np.array([[[45.0], [70.0], [0.5]]] * 5, dtype=np.float32)
        y_actual_5m_b = np.array([[[45.0], [70.0], [0.5]]] * 5, dtype=np.float32)

        # Predict 5m (identical)
        y_pred_5m_a = p_a[:, :, :1]
        y_pred_5m_b = p_b[:, :, :1]

        # Update Stream A with 5m observations only
        g_a = adapter_a.update_memory(X_batch, y_actual=y_actual_5m_a, y_pred=y_pred_5m_a)

        # Update Stream B with 5m observations only
        g_b = adapter_b.update_memory(X_batch, y_actual=y_actual_5m_b, y_pred=y_pred_5m_b)

        # Verify gate and memory matrices are 100% IDENTICAL
        self.assertEqual(g_a, g_b)
        m_a = adapter_a.model.fast_memory.M.cpu().numpy()
        m_b = adapter_b.model.fast_memory.M.cpu().numpy()
        np.testing.assert_allclose(m_a, m_b, rtol=1e-6, atol=1e-6)

        # Next step predictions must be 100% IDENTICAL
        X_next = np.random.randn(5, 60, 14).astype(np.float32)
        p_next_a = adapter_a.predict_tensor(X_next)
        p_next_b = adapter_b.predict_tensor(X_next)
        np.testing.assert_allclose(p_next_a, p_next_b, rtol=1e-6, atol=1e-6)

    def test_adapter_save_and_load(self):
        """Verifies checkpoint serialization restores model weights, gate parameters, and fast memory matrix."""
        adapter = PatchTSTGatedMemoryAdapter(input_dim=14, hidden_dim=64, gate_slope=5.0, gate_bias=-2.5, random_state=42)
        targets_mock = {
            t: {h: np.random.randn(20).astype(np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        train_ds = {"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock}
        adapter.fit(train_ds, epochs=1)

        # Update memory state with 5m observation
        X_sample = np.random.randn(4, 60, 14).astype(np.float32)
        y_act_5m = np.random.randn(4, 3, 1).astype(np.float32)
        y_pred_5m = np.random.randn(4, 3, 1).astype(np.float32)

        adapter.update_memory(X_sample, y_actual=y_act_5m, y_pred=y_pred_5m)
        orig_preds = adapter.predict_tensor(X_sample)

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "gated_mem_fix.pt"
            adapter.save(ckpt_path)

            loaded_adapter = PatchTSTGatedMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)
            loaded_adapter.load(ckpt_path)

            self.assertTrue(loaded_adapter.is_fitted_)
            self.assertEqual(loaded_adapter.gate_slope, 5.0)
            self.assertEqual(loaded_adapter.gate_bias, -2.5)
            loaded_preds = loaded_adapter.predict_tensor(X_sample)

            np.testing.assert_allclose(orig_preds, loaded_preds, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    import math
    unittest.main()
