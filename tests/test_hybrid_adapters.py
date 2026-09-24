"""
Unit Tests for Experiment A: PatchTST + HGB Residual Hybrid Adapter
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch

from ml.bdh.adapters_patchtst import PatchTSTAdapter
from ml.bdh.adapters_hybrid import PatchTSTHGBResidualAdapter


class TestPatchTSTHGBResidualAdapter(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        np.random.seed(42)

        # Create small synthetic dataset [N=30, T=60, D=14]
        self.N = 30
        self.X_train = np.random.randn(self.N, 60, 14).astype(np.float32)
        self.X_val = np.random.randn(10, 60, 14).astype(np.float32)
        self.X_test = np.random.randn(10, 60, 14).astype(np.float32)

        self.targets_train = {
            t: {h: np.random.randn(self.N).astype(np.float32) * 5.0 + 50.0 for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        self.targets_val = {
            t: {h: np.random.randn(10).astype(np.float32) * 5.0 + 50.0 for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        self.targets_test = {
            t: {h: np.random.randn(10).astype(np.float32) * 5.0 + 50.0 for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }

        self.train_ds = {"X": self.X_train, "X_raw": self.X_train, "targets": self.targets_train}
        self.val_ds = {"X": self.X_val, "X_raw": self.X_val, "targets": self.targets_val}
        self.test_ds = {"X": self.X_test, "X_raw": self.X_test, "targets": self.targets_test}

    def test_adapter_construction_and_defaults(self):
        """Verifies construction and default hyperparameter setup."""
        adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
        self.assertFalse(adapter.is_fitted_)
        self.assertEqual(adapter.input_dim, 14)
        self.assertEqual(adapter.hidden_dim, 64)

    def test_fit_and_prediction_tensor_shape(self):
        """Verifies fit on synthetic data and prediction tensor shape [N, 3, 5]."""
        adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
        summary = adapter.fit(self.train_ds, val_dataset=self.val_ds, epochs=2)

        self.assertTrue(adapter.is_fitted_)
        self.assertEqual(summary["trained_residual_models"], 15)

        # Test predict_tensor output shape [10, 3, 5]
        pred_tensor = adapter.predict_tensor(self.X_test)
        self.assertEqual(pred_tensor.shape, (10, 3, 5))

    def test_residual_addition_correctness(self):
        """Verifies final prediction = PatchTST prediction + HGB residual prediction."""
        adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
        adapter.fit(self.train_ds, val_dataset=self.val_ds, epochs=2)

        pred_final_dict = adapter.predict(self.X_test)
        pred_patchtst_dict = adapter.patchtst_adapter.predict(self.X_test)

        # Verify per target & horizon: final - patchtst == hgb residual prediction
        for target in ["cpu", "memory", "load_1m"]:
            X_tab = adapter.hgb_helper._extract_tabular_features(self.X_test, target)
            for horizon in ["5m", "15m", "30m", "1h", "3h"]:
                hgb_model = adapter.residual_models[(target, horizon)]
                expected_r = hgb_model.predict(X_tab)

                expected_final = pred_patchtst_dict[target][horizon] + expected_r
                actual_final = pred_final_dict[target][horizon]

                np.testing.assert_allclose(actual_final, expected_final, rtol=1e-5, atol=1e-5)

    def test_no_target_leakage_during_fit(self):
        """Verifies validation and test dataset target values are never accessed or leaked during fit."""
        # Create val_ds with poisoned target values (NaN or infinity)
        poisoned_val_targets = {
            t: {h: np.full(10, np.nan, dtype=np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        poisoned_val_ds = {"X": self.X_val, "X_raw": self.X_val, "targets": poisoned_val_targets}

        adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
        # Fitting should succeed without error even with poisoned validation targets
        summary = adapter.fit(self.train_ds, val_dataset=poisoned_val_ds, epochs=2)
        self.assertTrue(adapter.is_fitted_)

        # Verify predictions on test set run cleanly
        pred_tensor = adapter.predict_tensor(self.X_test)
        self.assertFalse(np.isnan(pred_tensor).any())

    def test_save_and_load_serialization(self):
        """Verifies checkpoint saving and loading restores predictions exactly."""
        adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
        adapter.fit(self.train_ds, val_dataset=self.val_ds, epochs=2)
        orig_preds = adapter.predict_tensor(self.X_test)

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "hybrid_residual.joblib"
            adapter.save(ckpt_path)

            loaded_adapter = PatchTSTHGBResidualAdapter(input_dim=14, hidden_dim=64, random_state=42)
            loaded_adapter.load(ckpt_path)

            self.assertTrue(loaded_adapter.is_fitted_)
            loaded_preds = loaded_adapter.predict_tensor(self.X_test)

            np.testing.assert_allclose(orig_preds, loaded_preds, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
