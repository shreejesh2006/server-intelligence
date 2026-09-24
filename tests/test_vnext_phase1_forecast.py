"""
Unit Tests for NOKIA vNext Phase 1 — iTransformer Primary & HGB Fallback Forecasting
"""

import unittest
from unittest.mock import AsyncMock, patch, MagicMock
import numpy as np
import pandas as pd

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.ml.forecast import ForecastService, extract_context_window
from app.services.ml.loader import ml_loader, TARGET_COLUMNS, HORIZONS
from ml.bdh.adapters_itransformer import iTransformerAdapter


class TestVNextPhase1Forecasting(unittest.TestCase):
    def setUp(self):
        self.service = ForecastService()
        self.service.clear_cache()

        # Build mock 30-minute telemetry history (60 samples @ 30s step)
        dates = pd.date_range("2026-09-23 12:00:00", periods=60, freq="30s", tz="UTC")
        data = {
            "cpu": np.linspace(20.0, 45.0, 60),
            "memory": np.linspace(50.0, 65.0, 60),
            "disk": np.full(60, 30.0),
            "swap": np.full(60, 5.0),
            "load_1m": np.linspace(1.0, 2.5, 60),
            "load_5m": np.linspace(1.2, 2.3, 60),
            "load_15m": np.linspace(1.5, 2.0, 60),
            "network_rx": np.full(60, 1000.0),
            "network_tx": np.full(60, 2000.0),
            "disk_read": np.full(60, 500.0),
            "disk_write": np.full(60, 600.0),
            "processes": np.full(60, 150.0),
            "iowait": np.full(60, 0.5),
            "uptime": np.linspace(3600.0, 5400.0, 60),
        }
        self.mock_df_history = pd.DataFrame(data, index=dates)
        self.mock_obs_ts = "2026-09-23T12:30:00+00:00"

        self.mock_live_metrics = {
            "cpu": 45.0,
            "memory": 65.0,
            "load_1m": 2.5,
        }

    def test_extract_context_window_shape(self):
        ctx = extract_context_window(self.mock_df_history, sequence_length=60)
        self.assertEqual(ctx.shape, (60, 14))
        self.assertEqual(ctx.dtype, np.float32)

    def test_extract_context_window_short_history_padding(self):
        short_df = self.mock_df_history.head(20)
        ctx = extract_context_window(short_df, sequence_length=60)
        self.assertEqual(ctx.shape, (60, 14))
        np.testing.assert_allclose(ctx[0], ctx[39])

    def test_itransformer_primary_path(self):
        self.service.clear_cache()
        self.service.victoria.get_current_metrics = AsyncMock(return_value=(self.mock_live_metrics, self.mock_obs_ts))
        self.service.victoria.get_all_metrics_history = AsyncMock(return_value=(self.mock_df_history, self.mock_obs_ts))

        import asyncio
        response = asyncio.run(self.service.get_forecasts(host="ubuntu"))

        self.assertEqual(response["host"], "ubuntu")
        self.assertEqual(response["primary_model"], "iTransformer")
        self.assertFalse(response["fallback_used"])
        self.assertIn("vNext-Phase1-iTransformer", response["model_version"])

        for target in TARGET_COLUMNS:
            self.assertIn(target, response)
            target_resp = response[target]
            self.assertIn("current", target_resp)
            self.assertEqual(target_resp["strategy"], "iTransformer")
            self.assertIn("predictions", target_resp)

            preds = target_resp["predictions"]
            for horizon in HORIZONS:
                self.assertIn(horizon, preds)
                self.assertIsInstance(preds[horizon], (int, float))
                self.assertGreaterEqual(preds[horizon], 0.0)

    def test_hgb_fallback_path(self):
        self.service.clear_cache()
        self.service.victoria.get_current_metrics = AsyncMock(return_value=(self.mock_live_metrics, self.mock_obs_ts))
        self.service.victoria.get_all_metrics_history = AsyncMock(return_value=(self.mock_df_history, self.mock_obs_ts))

        with patch.object(ml_loader, "get_itransformer_model", return_value=None):
            import asyncio
            response = asyncio.run(self.service.get_forecasts(host="ubuntu"))

            self.assertEqual(response["primary_model"], "iTransformer")
            self.assertTrue(response["fallback_used"])
            self.assertEqual(response["model_version"], "vNext-Phase1-HGB-fallback")

            for target in TARGET_COLUMNS:
                self.assertIn(target, response)
                target_resp = response[target]
                self.assertIn("predictions", target_resp)
                preds = target_resp["predictions"]
                for horizon in HORIZONS:
                    self.assertIn(horizon, preds)

    def test_itransformer_inference_exception_triggers_fallback(self):
        self.service.clear_cache()
        self.service.victoria.get_current_metrics = AsyncMock(return_value=(self.mock_live_metrics, self.mock_obs_ts))
        self.service.victoria.get_all_metrics_history = AsyncMock(return_value=(self.mock_df_history, self.mock_obs_ts))

        failing_adapter = MagicMock()
        failing_adapter.predict.side_effect = RuntimeError("Simulated GPU OOM or PyTorch error")

        with patch.object(ml_loader, "get_itransformer_model", return_value=failing_adapter):
            import asyncio
            response = asyncio.run(self.service.get_forecasts(host="ubuntu"))

            self.assertEqual(response["primary_model"], "iTransformer")
            self.assertTrue(response["fallback_used"])
            self.assertEqual(response["model_version"], "vNext-Phase1-HGB-fallback")

    def test_malformed_model_checkpoint_loading(self):
        adapter = iTransformerAdapter(
            input_dim=14, sequence_length=60, hidden_dim=64, num_layers=2, nhead=4
        )
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as tmp:
            tmp.write(b"CORRUPTED_CHECKPOINT_BYTES_12345")
            tmp_path = tmp.name

        try:
            with self.assertRaises(Exception):
                adapter.load(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_insufficient_history_handling(self):
        service = ForecastService()
        service.clear_cache()
        service.victoria.get_current_metrics = AsyncMock(return_value=(self.mock_live_metrics, self.mock_obs_ts))
        service.victoria.get_all_metrics_history = AsyncMock(return_value=(self.mock_df_history.head(5), self.mock_obs_ts))

        import asyncio
        response = asyncio.run(service.get_forecasts(host="ubuntu"))

        self.assertEqual(response["model_status"], "unavailable")
        self.assertTrue(response["is_stale"])
        self.assertEqual(response["telemetry_status"], "insufficient_history")
        for target in TARGET_COLUMNS:
            self.assertEqual(response[target]["strategy"], "unavailable")
            self.assertEqual(response[target]["predictions"], {})


if __name__ == "__main__":
    unittest.main()
