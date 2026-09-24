"""
Unit Tests for BDHInspiredSequenceModel and BDHAdapter
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch

from ml.bdh.model import BDHInspiredSequenceModel, BDHInspiredBlock
from ml.bdh.adapters_bdh import BDHAdapter


class TestBDHInspiredModel(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        np.random.seed(42)

    def test_output_shapes(self):
        """Tests forward pass shape [B, 60, 14] -> [B, 3, 5] for batch sizes 1, 2, 4."""
        model = BDHInspiredSequenceModel(input_dim=14, hidden_dim=64, num_layers=2)
        for b_size in [1, 2, 4]:
            x = torch.randn(b_size, 60, 14)
            out = model(x)
            self.assertEqual(out.shape, (b_size, 3, 5))

    def test_single_window_2d_shape(self):
        """Tests single 2D context window [60, 14] -> [3, 5]."""
        model = BDHInspiredSequenceModel(input_dim=14, hidden_dim=64, num_layers=2)
        x = torch.randn(60, 14)
        out = model(x)
        self.assertEqual(out.shape, (3, 5))

    def test_finite_output(self):
        """Verifies output contains finite numbers (no NaN or Inf)."""
        model = BDHInspiredSequenceModel(input_dim=14, hidden_dim=64, num_layers=2)
        x = torch.randn(4, 60, 14)
        out = model(x)
        self.assertTrue(torch.isfinite(out).all().item())

    def test_parameter_budget(self):
        """Verifies model parameter count is < 2,000,000."""
        model = BDHInspiredSequenceModel(input_dim=14, hidden_dim=64, num_layers=2)
        total_p, train_p = model.get_parameter_counts()
        self.assertLess(total_p, 2_000_000)
        self.assertEqual(total_p, train_p)
        print(f"\n[Test Parameter Count] Total Parameters: {total_p:,}")

    def test_backpropagation(self):
        """Verifies forward/backward pass updates gradients."""
        model = BDHInspiredSequenceModel(input_dim=14, hidden_dim=64, num_layers=2)
        x = torch.randn(2, 60, 14, requires_grad=True)
        target = torch.randn(2, 3, 5)

        out = model(x)
        loss = torch.mean((out - target) ** 2)
        loss.backward()

        self.assertIsNotNone(x.grad)
        for name, param in model.named_parameters():
            if param.requires_grad:
                self.assertIsNotNone(param.grad, f"Gradient missing for {name}")

    def test_causal_behavior(self):
        """
        Verifies lower-triangular causal masking:
        Modifying input at timestep t2 > t1 must NOT alter the hidden representation at timestep t1.
        """
        block = BDHInspiredBlock(hidden_dim=64)
        block.eval()

        T = 10
        x1 = torch.randn(1, T, 64)
        x2 = x1.clone()
        # Modify future timestep t = 8
        x2[0, 8, :] = x2[0, 8, :] + 10.0

        with torch.no_grad():
            out1 = block(x1)
            out2 = block(x2)

        # Check that timesteps t=0 to t=7 remain identical
        diff_past = torch.max(torch.abs(out1[0, :8, :] - out2[0, :8, :])).item()
        self.assertAlmostEqual(diff_past, 0.0, places=5)

        # Check that future timestep t=8 does change
        diff_future = torch.max(torch.abs(out1[0, 8, :] - out2[0, 8, :])).item()
        self.assertGreater(diff_future, 1e-3)

    def test_adapter_fit_predict_save_load(self):
        """Verifies BDHAdapter training, prediction, serialization, and deserialization."""
        N, T, D = 32, 60, 14
        X_train = np.random.randn(N, T, D).astype(np.float32)

        targets_dict = {
            "cpu": {"5m": np.random.randn(N).astype(np.float32), "15m": np.random.randn(N).astype(np.float32), "30m": np.random.randn(N).astype(np.float32), "1h": np.random.randn(N).astype(np.float32), "3h": np.random.randn(N).astype(np.float32)},
            "memory": {"5m": np.random.randn(N).astype(np.float32), "15m": np.random.randn(N).astype(np.float32), "30m": np.random.randn(N).astype(np.float32), "1h": np.random.randn(N).astype(np.float32), "3h": np.random.randn(N).astype(np.float32)},
            "load_1m": {"5m": np.random.randn(N).astype(np.float32), "15m": np.random.randn(N).astype(np.float32), "30m": np.random.randn(N).astype(np.float32), "1h": np.random.randn(N).astype(np.float32), "3h": np.random.randn(N).astype(np.float32)},
        }

        train_dataset = {"X": X_train, "targets": targets_dict}

        adapter = BDHAdapter(input_dim=14, hidden_dim=64, num_layers=2)
        fit_summary = adapter.fit(train_dataset, epochs=2, batch_size=16)

        self.assertTrue(adapter.is_fitted_)
        self.assertEqual(fit_summary["model_name"], "BDHAdapter")

        # Predict
        pred_dict = adapter.predict(X_train[:2])
        self.assertIn("cpu", pred_dict)
        self.assertIn("5m", pred_dict["cpu"])
        self.assertEqual(len(pred_dict["cpu"]["5m"]), 2)

        pred_tensor = adapter.predict_tensor(X_train[:2])
        self.assertEqual(pred_tensor.shape, (2, 3, 5))

        # Save and Load
        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "bdh_model.pt"
            adapter.save(ckpt_path)
            self.assertTrue(ckpt_path.exists())

            reloaded_adapter = BDHAdapter(input_dim=14, hidden_dim=64, num_layers=2)
            reloaded_adapter.load(ckpt_path)
            self.assertTrue(reloaded_adapter.is_fitted_)

            reloaded_tensor = reloaded_adapter.predict_tensor(X_train[:2])
            np.testing.assert_allclose(pred_tensor, reloaded_tensor, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
