"""
Unit Tests for PatchTSTModel, BDHPatchTSTHybrid, and PatchTST Adapters
"""

import unittest
import numpy as np
import torch

from ml.bdh.model_patchtst import PatchTSTModel, BDHPatchTSTHybrid
from ml.bdh.adapters_patchtst import PatchTSTAdapter, BDHPatchTSTHybridAdapter


class TestPatchTST(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        np.random.seed(42)

    def test_patch_extraction_shape(self):
        """Verifies unfolding sequence length T=60 into N_p=11 patches of length P=10, stride S=5."""
        model = PatchTSTModel(input_dim=14, sequence_length=60, patch_len=10, stride=5, hidden_dim=64)
        x = torch.randn(8, 60, 14)
        patches = model.extract_patches(x)
        # N_p = (60 - 10) // 5 + 1 = 11
        # patch_dim = 10 * 14 = 140
        self.assertEqual(patches.shape, (8, 11, 140))

    def test_patchtst_forward_shapes(self):
        """Verifies PatchTSTModel forward pass output shape [B, 3, 5] for batch and single windows."""
        model = PatchTSTModel(input_dim=14, sequence_length=60, hidden_dim=64)

        # Batch input
        x_batch = torch.randn(4, 60, 14)
        out_batch = model(x_batch)
        self.assertEqual(out_batch.shape, (4, 3, 5))

        # Single window input [60, 14]
        x_single = torch.randn(60, 14)
        out_single = model(x_single)
        self.assertEqual(out_single.shape, (3, 5))

    def test_hybrid_forward_shapes(self):
        """Verifies BDHPatchTSTHybrid forward pass output shape [B, 3, 5] for batch and single windows."""
        model = BDHPatchTSTHybrid(input_dim=14, sequence_length=60, hidden_dim=64)

        # Batch input
        x_batch = torch.randn(4, 60, 14)
        out_batch = model(x_batch)
        self.assertEqual(out_batch.shape, (4, 3, 5))

        # Single window input [60, 14]
        x_single = torch.randn(60, 14)
        out_single = model(x_single)
        self.assertEqual(out_single.shape, (3, 5))

    def test_parameter_counting(self):
        """Verifies total and trainable parameter counts."""
        patchtst = PatchTSTModel(input_dim=14, sequence_length=60, hidden_dim=64)
        tot_p, train_p = patchtst.get_parameter_counts()
        self.assertGreater(tot_p, 0)
        self.assertEqual(tot_p, train_p)

        hybrid = BDHPatchTSTHybrid(input_dim=14, sequence_length=60, hidden_dim=64)
        tot_h, train_h = hybrid.get_parameter_counts()
        self.assertGreater(tot_h, tot_p)
        self.assertEqual(tot_h, train_h)

    def test_deterministic_seed_behavior(self):
        """Verifies model initialization and forward passes are deterministic given random_state."""
        adapter1 = PatchTSTAdapter(input_dim=14, hidden_dim=64, random_state=42)
        adapter2 = PatchTSTAdapter(input_dim=14, hidden_dim=64, random_state=42)

        x = np.random.randn(5, 60, 14).astype(np.float32)
        p1 = adapter1.predict_tensor(x)
        p2 = adapter2.predict_tensor(x)

        np.testing.assert_allclose(p1, p2, atol=1e-6)

    def test_adapter_fit_predict_integration(self):
        """Verifies PatchTST and Hybrid adapters fit on small dataset and return prediction tensors."""
        targets_mock = {
            t: {h: np.random.randn(30).astype(np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        train_ds = {"X": np.random.randn(30, 60, 14).astype(np.float32), "targets": targets_mock}
        val_ds = {"X": np.random.randn(10, 60, 14).astype(np.float32), "targets": targets_mock}

        # 1. PatchTST Adapter
        adapter_p = PatchTSTAdapter(input_dim=14, hidden_dim=64, random_state=42)
        summary_p = adapter_p.fit(train_ds, val_dataset=val_ds, epochs=2)
        self.assertTrue(adapter_p.is_fitted_)
        pred_p = adapter_p.predict_tensor(val_ds["X"])
        self.assertEqual(pred_p.shape, (10, 3, 5))

        # 2. Hybrid Adapter
        adapter_h = BDHPatchTSTHybridAdapter(input_dim=14, hidden_dim=64, random_state=42)
        summary_h = adapter_h.fit(train_ds, val_dataset=val_ds, epochs=2)
        self.assertTrue(adapter_h.is_fitted_)
        pred_h = adapter_h.predict_tensor(val_ds["X"])
        self.assertEqual(pred_h.shape, (10, 3, 5))


if __name__ == "__main__":
    unittest.main()
