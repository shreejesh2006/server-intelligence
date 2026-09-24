"""
Unit Tests for Experiment 1 Architectural Bake-off Models & Adapters
Tests TimeMixer and iTransformer for shape integrity, forward pass, non-NaN output, and adapter contract.
"""

import unittest
import numpy as np
import torch

from ml.bdh.model_timemixer import TimeMixerModel
from ml.bdh.adapters_timemixer import TimeMixerAdapter
from ml.bdh.model_itransformer import iTransformerModel
from ml.bdh.adapters_itransformer import iTransformerAdapter
from ml.bdh.config import TARGET_COLUMNS, HORIZONS_MAP


class TestTimeMixerArchitecture(unittest.TestCase):
    def setUp(self):
        self.batch_size = 4
        self.seq_len = 60
        self.input_dim = 14
        self.output_targets = 3
        self.output_horizons = 5
        self.model = TimeMixerModel(
            input_dim=self.input_dim,
            sequence_length=self.seq_len,
            hidden_dim=32,
            num_layers=2,
            down_sampling_layers=2,
            down_sampling_window=2,
        )

    def test_forward_pass_batch(self):
        x = torch.randn(self.batch_size, self.seq_len, self.input_dim)
        out = self.model(x)
        self.assertEqual(out.shape, (self.batch_size, self.output_targets, self.output_horizons))
        self.assertFalse(torch.isnan(out).any(), "TimeMixer output contains NaNs")

    def test_forward_pass_single_window(self):
        x = torch.randn(self.seq_len, self.input_dim)
        out = self.model(x)
        self.assertEqual(out.shape, (self.output_targets, self.output_horizons))
        self.assertFalse(torch.isnan(out).any(), "TimeMixer output contains NaNs")

    def test_adapter_fit_predict(self):
        adapter = TimeMixerAdapter(
            input_dim=14, sequence_length=60, hidden_dim=32, random_state=42
        )
        N = 32
        X_train = np.random.randn(N, 60, 14).astype(np.float32)
        targets = {
            target: {h: np.random.rand(N).astype(np.float32) for h in HORIZONS_MAP.keys()}
            for target in TARGET_COLUMNS
        }
        train_ds = {"X": X_train, "targets": targets}

        fit_summary = adapter.fit(train_ds, epochs=2, batch_size=16)
        self.assertTrue(adapter.is_fitted_)
        self.assertIn("total_parameters", fit_summary)

        # Test predict dict
        preds = adapter.predict(X_train[:4])
        for target in TARGET_COLUMNS:
            for h in HORIZONS_MAP.keys():
                self.assertEqual(preds[target][h].shape, (4,))
                self.assertFalse(np.isnan(preds[target][h]).any())

        # Test predict_tensor
        pred_tensor = adapter.predict_tensor(X_train[:4])
        self.assertEqual(pred_tensor.shape, (4, 3, 5))
        self.assertFalse(np.isnan(pred_tensor).any())


class TestiTransformerArchitecture(unittest.TestCase):
    def setUp(self):
        self.batch_size = 4
        self.seq_len = 60
        self.input_dim = 14
        self.output_targets = 3
        self.output_horizons = 5
        self.model = iTransformerModel(
            input_dim=self.input_dim,
            sequence_length=self.seq_len,
            hidden_dim=32,
            num_layers=2,
            nhead=4,
        )

    def test_forward_pass_batch(self):
        x = torch.randn(self.batch_size, self.seq_len, self.input_dim)
        out = self.model(x)
        self.assertEqual(out.shape, (self.batch_size, self.output_targets, self.output_horizons))
        self.assertFalse(torch.isnan(out).any(), "iTransformer output contains NaNs")

    def test_forward_pass_single_window(self):
        x = torch.randn(self.seq_len, self.input_dim)
        out = self.model(x)
        self.assertEqual(out.shape, (self.output_targets, self.output_horizons))
        self.assertFalse(torch.isnan(out).any(), "iTransformer output contains NaNs")

    def test_adapter_fit_predict(self):
        adapter = iTransformerAdapter(
            input_dim=14, sequence_length=60, hidden_dim=32, random_state=42
        )
        N = 32
        X_train = np.random.randn(N, 60, 14).astype(np.float32)
        targets = {
            target: {h: np.random.rand(N).astype(np.float32) for h in HORIZONS_MAP.keys()}
            for target in TARGET_COLUMNS
        }
        train_ds = {"X": X_train, "targets": targets}

        fit_summary = adapter.fit(train_ds, epochs=2, batch_size=16)
        self.assertTrue(adapter.is_fitted_)
        self.assertIn("total_parameters", fit_summary)

        preds = adapter.predict(X_train[:4])
        for target in TARGET_COLUMNS:
            for h in HORIZONS_MAP.keys():
                self.assertEqual(preds[target][h].shape, (4,))
                self.assertFalse(np.isnan(preds[target][h]).any())

        pred_tensor = adapter.predict_tensor(X_train[:4])
        self.assertEqual(pred_tensor.shape, (4, 3, 5))
        self.assertFalse(np.isnan(pred_tensor).any())


if __name__ == "__main__":
    unittest.main()
