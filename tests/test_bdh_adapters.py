"""
Unit Tests for Phase 2B BDH Benchmark Adapters (Persistence & HGB) and Metrics
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd

from ml.bdh.adapters import (
    BaseModelAdapter,
    PersistenceAdapter,
    HGBAdapter,
    TARGET_COLUMNS,
    HORIZONS,
)
from ml.bdh.metrics import compute_mae, compute_rmse, compute_mase, evaluate_forecast_dict
from ml.bdh.config import FEATURE_COLUMNS


def generate_synthetic_benchmark_dataset(n_samples: int = 120, sequence_length: int = 60) -> dict:
    """Generates synthetic dataset dictionary conforming to common benchmark contract."""
    np.random.seed(42)
    N = n_samples - sequence_length + 1
    T = sequence_length
    D = len(FEATURE_COLUMNS)

    X_raw = np.random.uniform(10, 80, (N, T, D)).astype(np.float32)
    X_normalized = X_raw.copy()

    targets = {t: {} for t in TARGET_COLUMNS}
    for target in TARGET_COLUMNS:
        for horizon in HORIZONS:
            # Generate target array with occasional NaNs at end
            arr = np.random.uniform(10, 80, (N,)).astype(np.float32)
            arr[-5:] = np.nan
            targets[target][horizon] = arr

    return {
        "X": X_raw,
        "X_raw": X_raw,
        "X_normalized": X_normalized,
        "targets": targets,
        "sequence_length": sequence_length,
    }


class TestBDHAdapters(unittest.TestCase):

    def test_adapter_inheritance(self):
        """Verify concrete adapters subclass BaseModelAdapter."""
        p_adapter = PersistenceAdapter()
        hgb_adapter = HGBAdapter()

        self.assertIsInstance(p_adapter, BaseModelAdapter)
        self.assertIsInstance(hgb_adapter, BaseModelAdapter)

    def test_persistence_adapter_predictions(self):
        """Verify PersistenceAdapter predicts latest observed value at T-1 across all targets and horizons."""
        dataset = generate_synthetic_benchmark_dataset(n_samples=100, sequence_length=60)
        X = dataset["X"]
        N, T, D = X.shape

        adapter = PersistenceAdapter()
        fit_meta = adapter.fit(dataset)
        self.assertEqual(fit_meta["model_name"], "PersistenceAdapter")
        self.assertFalse(fit_meta["trained"])

        # Predict dict
        preds = adapter.predict(X)
        self.assertIn("cpu", preds)
        self.assertIn("memory", preds)
        self.assertIn("load_1m", preds)

        # CPU is at index 0 in FEATURE_COLUMNS
        cpu_latest_expected = X[:, T - 1, 0]
        for horizon in HORIZONS:
            self.assertEqual(preds["cpu"][horizon].shape, (N,))
            np.testing.assert_array_almost_equal(preds["cpu"][horizon], cpu_latest_expected)

        # Predict tensor shape [N, 3, 5]
        pred_tensor = adapter.predict_tensor(X)
        self.assertEqual(pred_tensor.shape, (N, 3, 5))
        np.testing.assert_array_almost_equal(pred_tensor[:, 0, 0], cpu_latest_expected)

    def test_hgb_adapter_fit_predict_save_load(self):
        """Verify HGBAdapter fits on dataset, predicts shape [N, 3, 5], and round-trips via save/load."""
        dataset = generate_synthetic_benchmark_dataset(n_samples=100, sequence_length=60)
        X = dataset["X"]
        N = X.shape[0]

        adapter = HGBAdapter(random_state=42)
        fit_meta = adapter.fit(dataset)

        self.assertTrue(adapter.is_fitted_)
        self.assertEqual(fit_meta["model_name"], "HGBAdapter")
        self.assertEqual(fit_meta["trained_models"], 15)  # 3 targets * 5 horizons

        # Predict dict
        preds = adapter.predict(X)
        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:
                self.assertEqual(preds[target][horizon].shape, (N,))
                self.assertTrue(np.all(preds[target][horizon] >= 0.0))

        # Predict tensor
        pred_tensor = adapter.predict_tensor(X)
        self.assertEqual(pred_tensor.shape, (N, 3, 5))

        # Save and Load Serialization
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "hgb_benchmark.joblib"
            adapter.save(model_path)
            self.assertTrue(model_path.exists())

            loaded_adapter = HGBAdapter()
            loaded_adapter.load(model_path)
            self.assertTrue(loaded_adapter.is_fitted_)
            self.assertEqual(len(loaded_adapter.models), 15)

            # Assert deterministic predictions match
            loaded_tensor = loaded_adapter.predict_tensor(X)
            np.testing.assert_array_almost_equal(pred_tensor, loaded_tensor)

    def test_metrics_evaluation(self):
        """Verify MAE, RMSE, MASE and evaluate_forecast_dict calculation."""
        y_true = np.array([10.0, 20.0, 30.0, np.nan], dtype=np.float32)
        y_pred = np.array([12.0, 18.0, 33.0, 25.0], dtype=np.float32)

        # Absolute diffs: |10-12|=2, |20-18|=2, |30-33|=3 -> mean = 7/3 = 2.3333
        mae = compute_mae(y_true, y_pred)
        self.assertAlmostEqual(mae, 7.0 / 3.0, places=4)

        # Squared diffs: 4 + 4 + 9 = 17 -> mean = 17/3 -> sqrt = 2.3805
        rmse = compute_rmse(y_true, y_pred)
        self.assertAlmostEqual(rmse, np.sqrt(17.0 / 3.0), places=4)

        # MASE with in-sample series [10, 15, 20, 25] (mean abs diff = 5.0)
        in_sample = np.array([10.0, 15.0, 20.0, 25.0], dtype=np.float32)
        mase = compute_mase(y_true, y_pred, in_sample_series=in_sample)
        self.assertAlmostEqual(mase, (7.0 / 3.0) / 5.0, places=4)

        # Dict evaluation
        y_true_dict = {"cpu": {"5m": y_true}, "memory": {"5m": y_true}, "load_1m": {"5m": y_true}}
        y_pred_dict = {"cpu": {"5m": y_pred}, "memory": {"5m": y_pred}, "load_1m": {"5m": y_pred}}
        eval_res = evaluate_forecast_dict(y_true_dict, y_pred_dict)

        self.assertIn("cpu", eval_res)
        self.assertIn("5m", eval_res["cpu"])
        self.assertAlmostEqual(eval_res["cpu"]["5m"]["mae"], 2.3333, places=3)


if __name__ == "__main__":
    unittest.main()
