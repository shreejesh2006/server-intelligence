"""
Unit Tests for Phase 4A Benchmark Runner, Chronological Purging, and Leakage Checks
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np

from ml.bdh.adapters import PersistenceAdapter, HGBAdapter, XGBoostAdapter
from ml.bdh.adapters_bdh import BDHAdapter
from ml.bdh.adapters_patchtst import PatchTSTAdapter, BDHPatchTSTHybridAdapter
from ml.bdh.benchmark import load_verified_dataset, split_chronological_dataset, run_benchmark
from ml.bdh.metrics import compute_mae, compute_rmse, compute_mase, evaluate_forecast_dict


class TestBenchmarkPipeline(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)

    def test_chronological_split_and_purge(self):
        """Verifies chronological 70/15/15 split and purge bounds."""
        raw_ds = load_verified_dataset()
        train_ds, val_ds, test_ds, split_meta = split_chronological_dataset(raw_ds)

        N = raw_ds["N"]
        self.assertEqual(split_meta["total_windows"], N)
        self.assertEqual(split_meta["train_windows"], int(np.floor(0.70 * N)))
        self.assertEqual(split_meta["val_windows"], int(np.floor(0.85 * N)) - int(np.floor(0.70 * N)))
        self.assertEqual(split_meta["test_windows"], N - int(np.floor(0.85 * N)))

        # Verify array lengths
        self.assertEqual(len(train_ds["X"]), split_meta["train_windows"])
        self.assertEqual(len(val_ds["X"]), split_meta["val_windows"])
        self.assertEqual(len(test_ds["X"]), split_meta["test_windows"])

    def test_no_data_leakage_in_split(self):
        """Verifies purged windows in val and test contain NaNs to prevent target leakage."""
        raw_ds = load_verified_dataset()
        train_ds, val_ds, test_ds, split_meta = split_chronological_dataset(raw_ds)

        # Check 5m horizon (10 steps purge)
        val_cpu_5m = val_ds["targets"]["cpu"]["5m"]
        test_cpu_5m = test_ds["targets"]["cpu"]["5m"]

        # First 10 samples of val target must be NaN due to purging
        self.assertTrue(np.all(np.isnan(val_cpu_5m[:10])))
        self.assertTrue(np.all(np.isnan(test_cpu_5m[:10])))

    def test_adapter_tensor_shapes(self):
        """Verifies Persistence, HGB, BDH, PatchTST, and Hybrid adapters output [N, 3, 5] prediction tensors."""
        X_sample = np.random.randn(10, 60, 14).astype(np.float32)

        # 1. Persistence
        p_adapter = PersistenceAdapter()
        p_tensor = p_adapter.predict_tensor(X_sample)
        self.assertEqual(p_tensor.shape, (10, 3, 5))

        # 2. HGB
        hgb_adapter = HGBAdapter(random_state=42)
        # Mock simple fit dataset
        targets_mock = {
            t: {h: np.random.randn(20).astype(np.float32) for h in ["5m", "15m", "30m", "1h", "3h"]}
            for t in ["cpu", "memory", "load_1m"]
        }
        hgb_adapter.fit({"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock})
        hgb_tensor = hgb_adapter.predict_tensor(X_sample)
        self.assertEqual(hgb_tensor.shape, (10, 3, 5))

        # 3. XGBoost
        xgb_adapter = XGBoostAdapter(random_state=42)
        xgb_adapter.fit({"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock})
        xgb_tensor = xgb_adapter.predict_tensor(X_sample)
        self.assertEqual(xgb_tensor.shape, (10, 3, 5))

        # 4. BDH
        bdh_adapter = BDHAdapter(input_dim=14, hidden_dim=64, num_layers=2)
        bdh_adapter.fit({"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock}, epochs=1)
        bdh_tensor = bdh_adapter.predict_tensor(X_sample)
        self.assertEqual(bdh_tensor.shape, (10, 3, 5))

        # 5. PatchTST
        patchtst_adapter = PatchTSTAdapter(input_dim=14, hidden_dim=64, num_layers=2)
        patchtst_adapter.fit({"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock}, epochs=1)
        patchtst_tensor = patchtst_adapter.predict_tensor(X_sample)
        self.assertEqual(patchtst_tensor.shape, (10, 3, 5))

        # 6. Hybrid
        hybrid_adapter = BDHPatchTSTHybridAdapter(input_dim=14, hidden_dim=64, num_encoder_layers=2, num_bdh_layers=2)
        hybrid_adapter.fit({"X": np.random.randn(20, 60, 14).astype(np.float32), "targets": targets_mock}, epochs=1)
        hybrid_tensor = hybrid_adapter.predict_tensor(X_sample)
        self.assertEqual(hybrid_tensor.shape, (10, 3, 5))

    def test_metrics_calculation_and_nans(self):
        """Verifies MAE, RMSE, MASE correctly filter NaNs."""
        y_true = np.array([1.0, 2.0, np.nan, 4.0, 5.0], dtype=np.float32)
        y_pred = np.array([1.1, 1.9, 3.0, 4.2, 4.8], dtype=np.float32)

        mae = compute_mae(y_true, y_pred)
        rmse = compute_rmse(y_true, y_pred)
        mase = compute_mase(y_true, y_pred, in_sample_series=1.0)

        self.assertFalse(np.isnan(mae))
        self.assertFalse(np.isnan(rmse))
        self.assertFalse(np.isnan(mase))
        self.assertAlmostEqual(mae, 0.15, places=3)

    def test_evaluate_forecast_dict_schema(self):
        """Verifies evaluate_forecast_dict outputs proper target/horizon nested dict schema."""
        y_true_dict = {
            "cpu": {"5m": np.array([1.0, 2.0]), "15m": np.array([1.5, 2.5])},
            "memory": {"5m": np.array([50.0, 55.0])},
            "load_1m": {"5m": np.array([0.5, 0.6])},
        }
        y_pred_dict = {
            "cpu": {"5m": np.array([1.1, 1.9]), "15m": np.array([1.4, 2.6])},
            "memory": {"5m": np.array([51.0, 54.0])},
            "load_1m": {"5m": np.array([0.5, 0.6])},
        }

        res = evaluate_forecast_dict(y_true_dict, y_pred_dict)
        self.assertIn("cpu", res)
        self.assertIn("5m", res["cpu"])
        self.assertIn("mae", res["cpu"]["5m"])
        self.assertIn("rmse", res["cpu"]["5m"])
        self.assertIn("mase", res["cpu"]["5m"])


if __name__ == "__main__":
    unittest.main()
