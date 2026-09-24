"""
Unit Tests for PatchTSTFastMemoryModel and PatchTSTFastMemoryAdapter
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch

from ml.bdh.model_patchtst_memory import PatchTSTFastMemoryModel
from ml.bdh.adapters_patchtst_memory import PatchTSTFastMemoryAdapter


class TestPatchTSTMemory(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        np.random.seed(42)

    def test_model_forward_and_prediction_shapes(self):
        """Verifies forward and predict output shape [B, 3, 5]."""
        model = PatchTSTFastMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)

        # Batch input
        x_batch = torch.randn(4, 60, 14)
        out_batch = model.predict(x_batch)
        self.assertEqual(out_batch.shape, (4, 3, 5))

        # Single window input
        x_single = torch.randn(60, 14)
        out_single = model.predict(x_single)
        self.assertEqual(out_single.shape, (3, 5))

    def test_prediction_changes_with_updated_memory_state(self):
        """Verifies that same input X produces different outputs when memory state M changes."""
        model = PatchTSTFastMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)
        model.eval()

        x = torch.randn(2, 60, 14)

        # 1. Prediction with zero memory state M_0
        pred_before = model.predict(x)

        # 2. Update memory state with observations
        x_obs = torch.randn(5, 60, 14)
        model.update_memory(x_obs)

        # 3. Prediction with updated memory state M_1
        pred_after = model.predict(x)

        # Predictions should differ due to persistent memory influence
        self.assertFalse(torch.allclose(pred_before, pred_after, atol=1e-5))

    def test_predict_does_not_update_memory(self):
        """Verifies predict() leaves memory state matrix M unchanged."""
        model = PatchTSTFastMemoryModel(input_dim=14, sequence_length=60, hidden_dim=64)
        x = torch.randn(2, 60, 14)

        norm_before = model.fast_memory.get_memory_norm()
        _ = model.predict(x)
        norm_after = model.fast_memory.get_memory_norm()

        self.assertEqual(norm_before, norm_after)

    def test_adapter_fit_and_continual_update_protocol(self):
        """Verifies PatchTSTFastMemoryAdapter fit, predict, update_memory, and reset_memory workflow."""
        targets_mock = {
            t: {h: np.random.randn(30).astype(np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        train_ds = {"X": np.random.randn(30, 60, 14).astype(np.float32), "targets": targets_mock}
        val_ds = {"X": np.random.randn(10, 60, 14).astype(np.float32), "targets": targets_mock}

        adapter = PatchTSTFastMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)
        summary = adapter.fit(train_ds, val_dataset=val_ds, epochs=2)
        self.assertTrue(adapter.is_fitted_)

        # Predict batch 1
        X_batch1 = np.random.randn(5, 60, 14).astype(np.float32)
        p1 = adapter.predict_tensor(X_batch1)
        self.assertEqual(p1.shape, (5, 3, 5))

        # Update memory with observed batch 1
        norm_before = adapter.model.fast_memory.get_memory_norm()
        adapter.update_memory(X_batch1)
        norm_after = adapter.model.fast_memory.get_memory_norm()
        self.assertGreater(norm_after, norm_before)

        # Reset memory
        adapter.reset_memory()
        self.assertEqual(adapter.model.fast_memory.get_memory_norm(), 0.0)

    def test_adapter_save_and_load(self):
        """Verifies checkpoint serialization restores model weights and fast memory matrix."""
        adapter = PatchTSTFastMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)
        targets_mock = {
            t: {h: np.random.randn(20).astype(np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        train_ds = {"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock}
        adapter.fit(train_ds, epochs=1)

        # Update memory state
        X_sample = np.random.randn(4, 60, 14).astype(np.float32)
        adapter.update_memory(X_sample)
        orig_preds = adapter.predict_tensor(X_sample)

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "fast_mem.pt"
            adapter.save(ckpt_path)

            loaded_adapter = PatchTSTFastMemoryAdapter(input_dim=14, hidden_dim=64, random_state=42)
            loaded_adapter.load(ckpt_path)

            self.assertTrue(loaded_adapter.is_fitted_)
            loaded_preds = loaded_adapter.predict_tensor(X_sample)

            np.testing.assert_allclose(orig_preds, loaded_preds, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
