"""
Unit tests for DUET Architecture & Adapter Integration (Experiment 2)
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS
from ml.bdh.adapters import HORIZONS
from ml.bdh.model_duet import DUETModel
from ml.bdh.adapters_duet import DUETAdapter


class TestDUETArchitecture(unittest.TestCase):
    """Tests DUET PyTorch Module shapes, gradients, and forward pass functionality."""

    def setUp(self):
        self.batch_size = 8
        self.seq_len = 60
        self.num_features = 14
        self.dummy_batch = torch.randn(self.batch_size, self.seq_len, self.num_features)
        self.dummy_single = torch.randn(self.seq_len, self.num_features)

    def test_duet_forward_pass_shapes(self):
        """Tests that DUETModel returns outputs of shape [B, 3, 5] and [3, 5] for single input."""
        model = DUETModel(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            num_temporal_clusters=3,
            num_channel_clusters=3,
            num_layers=2,
            nhead=2,
        )
        model.eval()

        with torch.no_grad():
            out_batch = model(self.dummy_batch)
            out_single = model(self.dummy_single)

        self.assertEqual(out_batch.shape, (self.batch_size, 3, 5))
        self.assertEqual(out_single.shape, (3, 5))
        self.assertFalse(torch.isnan(out_batch).any())
        self.assertFalse(torch.isnan(out_single).any())

    def test_duet_gradient_flow(self):
        """Tests backpropagation and parameter gradient updating."""
        model = DUETModel(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            num_temporal_clusters=2,
            num_channel_clusters=2,
            num_layers=1,
            nhead=2,
        )
        model.train()

        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        optimizer.zero_grad()

        out = model(self.dummy_batch)
        target = torch.randn_like(out)
        loss = torch.mean((out - target) ** 2)

        loss.backward()
        optimizer.step()

        self.assertTrue(torch.isfinite(loss))
        # Verify gradients on active parameters (tcm, ccm, fusion_layers, target_heads)
        active_grad_count = 0
        for name, param in model.named_parameters():
            if param.requires_grad and "fallback_seq_embedding" not in name:
                self.assertIsNotNone(param.grad, f"Gradient missing for parameter {name}")
                active_grad_count += 1
        self.assertGreaterThan(active_grad_count, 0) if hasattr(self, 'assertGreaterThan') else self.assertTrue(active_grad_count > 0)

    def test_duet_ablation_flags(self):
        """Tests DUET forward pass with ablation flags (no temporal clustering / no channel clustering)."""
        model_no_tc = DUETModel(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            use_temporal_clustering=False,
            use_channel_clustering=True,
        )
        model_no_cc = DUETModel(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            use_temporal_clustering=True,
            use_channel_clustering=False,
        )

        with torch.no_grad():
            out_no_tc = model_no_tc(self.dummy_batch)
            out_no_cc = model_no_cc(self.dummy_batch)

        self.assertEqual(out_no_tc.shape, (self.batch_size, 3, 5))
        self.assertEqual(out_no_cc.shape, (self.batch_size, 3, 5))
        self.assertFalse(torch.isnan(out_no_tc).any())
        self.assertFalse(torch.isnan(out_no_cc).any())


class TestDUETAdapter(unittest.TestCase):
    """Tests DUETAdapter fit, predict, and serialization."""

    def setUp(self):
        self.n_samples = 32
        self.seq_len = 60
        self.num_features = 14

        np.random.seed(42)
        X = np.random.randn(self.n_samples, self.seq_len, self.num_features).astype(np.float32)

        targets = {
            target: {
                h: np.random.randn(self.n_samples).astype(np.float32)
                for h in HORIZONS
            }
            for target in TARGET_COLUMNS
        }

        self.train_dataset = {"X": X, "targets": targets}
        self.val_dataset = {"X": X[:8], "targets": {t: {h: targets[t][h][:8] for h in HORIZONS} for t in TARGET_COLUMNS}}

    def test_adapter_fit_predict(self):
        """Tests adapter fit cycle, prediction formatting, and raw values."""
        adapter = DUETAdapter(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            num_layers=1,
            nhead=2,
            random_state=42,
        )

        fit_summary = adapter.fit(
            train_dataset=self.train_dataset,
            val_dataset=self.val_dataset,
            epochs=2,
            batch_size=8,
            patience=2,
        )

        self.assertTrue(adapter.is_fitted_)
        self.assertIn("total_parameters", fit_summary)

        # Predict single context window
        context_window = np.random.randn(self.seq_len, self.num_features).astype(np.float32)
        preds = adapter.predict(context_window)

        self.assertIn("cpu", preds)
        self.assertIn("5m", preds["cpu"])
        self.assertEqual(preds["cpu"]["5m"].shape, (1,))

        # Predict tensor batch
        batch_context = np.random.randn(10, self.seq_len, self.num_features).astype(np.float32)
        pred_tensor = adapter.predict_tensor(batch_context)
        self.assertEqual(pred_tensor.shape, (10, 3, 5))
        self.assertFalse(np.isnan(pred_tensor).any())

    def test_adapter_serialization(self):
        """Tests adapter checkpoint saving and loading consistency."""
        adapter = DUETAdapter(
            input_dim=self.num_features,
            sequence_length=self.seq_len,
            hidden_dim=32,
            random_state=42,
        )
        adapter.fit(self.train_dataset, epochs=1, batch_size=16)

        context_window = np.random.randn(5, self.seq_len, self.num_features).astype(np.float32)
        pred_before = adapter.predict_tensor(context_window)

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "duet_test.pt"
            adapter.save(ckpt_path)

            loaded_adapter = DUETAdapter()
            loaded_adapter.load(ckpt_path)

            pred_after = loaded_adapter.predict_tensor(context_window)

            np.testing.assert_allclose(pred_before, pred_after, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
