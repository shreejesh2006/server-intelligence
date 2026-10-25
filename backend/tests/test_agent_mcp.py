import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import pytest
except ImportError:
    class MockPytest:
        class raises:
            def __init__(self, expected_exception):
                self.expected_exception = expected_exception
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                if exc_type is None:
                    raise AssertionError(f"Expected {self.expected_exception} but nothing was raised")
                if issubclass(exc_type, self.expected_exception):
                    self.value = exc_val
                    return True
                return False
    pytest = MockPytest()

import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from app.mcp.auth import authorize_tool_call
from app.mcp.tools import AVAILABLE_TOOLS, TOOL_REGISTRY, get_server_status, query_metrics, get_forecast, get_anomaly
from app.mcp.resources import read_resource
from app.agent.memory import ConversationMemory


def test_mcp_auth_read_tools_allowed():
    """Verify safe monitoring tools are executable by any authenticated viewer."""
    assert authorize_tool_call("get_server_status", user_role="viewer") is True
    assert authorize_tool_call("query_metrics", user_role="viewer") is True
    assert authorize_tool_call("get_forecast", user_role="viewer") is True
    assert authorize_tool_call("get_anomaly", user_role="viewer") is True


def test_mcp_auth_execute_tools_denied_for_viewers():
    """Verify destructive/privileged tools raise HTTP 403 for viewers or unconfirmed requests."""
    with pytest.raises(HTTPException) as excinfo:
        authorize_tool_call("execute_remediation", user_role="viewer", confirmed=False)
    assert excinfo.value.status_code == 403

    with pytest.raises(HTTPException) as excinfo_unconfirmed:
        authorize_tool_call("execute_remediation", user_role="admin", confirmed=False)
    assert excinfo_unconfirmed.value.status_code == 403


def test_mcp_auth_execute_tools_allowed_for_confirmed_admin():
    """Verify privileged operations proceed only when both role and explicit confirmation exist."""
    assert authorize_tool_call("execute_remediation", user_role="admin", confirmed=True) is True


def test_tool_manifest_registered():
    """Verify all tool definitions exist in the execution registry."""
    tool_names = {t["function"]["name"] for t in AVAILABLE_TOOLS}
    assert "get_server_status" in tool_names
    assert "query_metrics" in tool_names
    assert "get_forecast" in tool_names
    assert "get_anomaly" in tool_names
    assert len(tool_names) == len(TOOL_REGISTRY)


def test_conversation_memory_entity_tracking():
    """Verify entity memory tracks target host across pronoun-based turns."""
    mem = ConversationMemory(max_history=5)
    session_id = "test_session_123"

    mem.track_host(session_id, "ubuntu")
    assert mem.get_tracked_host(session_id) == "ubuntu"

    # User switches host target
    mem.track_host(session_id, "node-2")
    assert mem.get_tracked_host(session_id) == "node-2"

    # Message trimming check
    for i in range(10):
        mem.add_message(session_id, "user", f"query {i}")

    messages = mem.get_messages(session_id)
    assert len(messages) <= 5
    assert messages[-1]["content"] == "query 9"


class TestAgentMCP(unittest.IsolatedAsyncioTestCase):
    def test_mcp_auth_read_tools_allowed(self):
        test_mcp_auth_read_tools_allowed()

    def test_mcp_auth_execute_tools_denied_for_viewers(self):
        test_mcp_auth_execute_tools_denied_for_viewers()

    def test_mcp_auth_execute_tools_allowed_for_confirmed_admin(self):
        test_mcp_auth_execute_tools_allowed_for_confirmed_admin()

    def test_tool_manifest_registered(self):
        test_tool_manifest_registered()

    def test_conversation_memory_entity_tracking(self):
        test_conversation_memory_entity_tracking()

    async def test_get_server_status_execution(self):
        """Verify get_server_status calls get_current_metrics and returns structured telemetry."""
        mock_metrics = {
            "cpu": 32.5,
            "memory": 64.0,
            "disk": 45.0,
            "load_1m": 1.25,
        }
        mock_ts = "2026-10-22T10:00:00+00:00"
        with patch("app.services.victoriametrics.VictoriaMetricsService.get_current_metrics", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = (mock_metrics, mock_ts)
            res = await get_server_status(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "online")
            self.assertEqual(res["timestamp"], mock_ts)
            self.assertEqual(res["telemetry"]["cpu"], 32.5)
            mock_get.assert_awaited_once_with(host="ubuntu")

    async def test_get_server_status_failure_handled(self):
        """Verify get_server_status traps exceptions cleanly and returns error contract."""
        with patch("app.services.victoriametrics.VictoriaMetricsService.get_current_metrics", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = RuntimeError("VictoriaMetrics unreachable")
            res = await get_server_status(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "error")
            self.assertIn("VictoriaMetrics unreachable", res["error"])

    async def test_query_metrics_execution(self):
        """Verify query_metrics constructs safe PromQL, bounds range, and parses series values."""
        mock_vm_result = [
            {
                "metric": {"host": "ubuntu", "__name__": "server_cpu_usage_percent"},
                "values": [[1700000000, "15.5"], [1700000030, "16.0"]],
            }
        ]
        with patch("app.services.victoriametrics.VictoriaMetricsService.query_range", new_callable=AsyncMock) as mock_qr:
            mock_qr.return_value = mock_vm_result
            res = await query_metrics(host="ubuntu", metric="cpu", duration="15m")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["metric"], "cpu")
            self.assertEqual(res["duration"], "15m")
            self.assertEqual(res["data_points"], 2)
            self.assertEqual(len(res["history"]), 2)
            self.assertEqual(res["history"][0]["value"], 15.5)
            mock_qr.assert_awaited_once()
            called_kwargs = mock_qr.call_args.kwargs
            self.assertIn("server_cpu_usage_percent", called_kwargs["query"])
            self.assertEqual(called_kwargs["step"], "30s")

    async def test_query_metrics_unsupported_metric_rejected(self):
        """Verify query_metrics rejects unapproved metrics and does not execute query_range."""
        with patch("app.services.victoriametrics.VictoriaMetricsService.query_range", new_callable=AsyncMock) as mock_qr:
            res = await query_metrics(host="ubuntu", metric="malicious_injection; drop table", duration="1h")
            self.assertEqual(res["status"], "error")
            self.assertIn("Unsupported metric", res["error"])
            mock_qr.assert_not_awaited()

    async def test_query_metrics_duration_bounded(self):
        """Verify query_metrics caps excessively large duration windows to safe bounds."""
        with patch("app.services.victoriametrics.VictoriaMetricsService.query_range", new_callable=AsyncMock) as mock_qr:
            mock_qr.return_value = []
            res = await query_metrics(host="ubuntu", metric="memory", duration="999d")
            called_kwargs = mock_qr.call_args.kwargs
            start = int(called_kwargs["start"])
            end = int(called_kwargs["end"])
            # Maximum allowed window is 7 days (604800s)
            self.assertLessEqual(end - start, 604800)
            self.assertEqual(called_kwargs["step"], "5m")

    async def test_query_metrics_failure_handled(self):
        """Verify query_metrics handles service exceptions gracefully."""
        with patch("app.services.victoriametrics.VictoriaMetricsService.query_range", new_callable=AsyncMock) as mock_qr:
            mock_qr.side_effect = RuntimeError("Query timeout")
            res = await query_metrics(host="ubuntu", metric="cpu", duration="1h")
            self.assertEqual(res["status"], "error")
            self.assertIn("Query timeout", res["error"])

    async def test_get_forecast_execution(self):
        """Verify get_forecast calls ForecastService.get_forecasts with host."""
        mock_forecast = {
            "host": "ubuntu",
            "model_status": "fresh",
            "cpu": {"current": 25.0, "predictions": {"5m": 26.0, "15m": 27.0}},
            "memory": {"current": 50.0, "predictions": {"5m": 50.5}},
            "load_1m": {"current": 1.1, "predictions": {"5m": 1.2}},
        }
        with patch("app.services.ml.forecast.ForecastService.get_forecasts", new_callable=AsyncMock) as mock_fc:
            mock_fc.return_value = mock_forecast
            res = await get_forecast(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["forecast"]["cpu"]["predictions"]["5m"], 26.0)
            mock_fc.assert_awaited_once_with(host="ubuntu")

    async def test_get_forecast_failure_handled(self):
        """Verify get_forecast traps exceptions and returns error contract."""
        with patch("app.services.ml.forecast.ForecastService.get_forecasts", new_callable=AsyncMock) as mock_fc:
            mock_fc.side_effect = ValueError("Forecast model missing")
            res = await get_forecast(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "error")
            self.assertIn("Forecast service error", res["error"])

    async def test_get_anomaly_execution(self):
        """Verify get_anomaly calls AnomalyService.get_anomaly_score with host."""
        mock_anomaly = {
            "host": "ubuntu",
            "anomaly_score": 0.0345,
            "is_anomaly": False,
            "severity": "NORMAL",
            "features": {"cpu": 25.0},
        }
        with patch("app.services.ml.anomaly.AnomalyService.get_anomaly_score", new_callable=AsyncMock) as mock_anom:
            mock_anom.return_value = mock_anomaly
            res = await get_anomaly(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["anomaly"]["anomaly_score"], 0.0345)
            mock_anom.assert_awaited_once_with(host="ubuntu")

    async def test_get_anomaly_failure_handled(self):
        """Verify get_anomaly traps exceptions and returns error contract."""
        with patch("app.services.ml.anomaly.AnomalyService.get_anomaly_score", new_callable=AsyncMock) as mock_anom:
            mock_anom.side_effect = RuntimeError("Feature extraction error")
            res = await get_anomaly(host="ubuntu")
            self.assertEqual(res["host"], "ubuntu")
            self.assertEqual(res["status"], "error")
            self.assertIn("Anomaly service error", res["error"])

    async def test_read_mcp_resources(self):
        """Verify read_resource dispatches all URI schemes to corresponding tools."""
        with patch("app.mcp.resources.get_server_status", new_callable=AsyncMock) as mock_status, \
             patch("app.mcp.resources.query_metrics", new_callable=AsyncMock) as mock_query, \
             patch("app.mcp.resources.get_forecast", new_callable=AsyncMock) as mock_fc, \
             patch("app.mcp.resources.get_anomaly", new_callable=AsyncMock) as mock_anom:

            mock_status.return_value = {"host": "ubuntu", "status": "online"}
            mock_query.return_value = {"host": "ubuntu", "metric": "cpu", "data_points": 10}
            mock_fc.return_value = {"host": "ubuntu", "status": "success"}
            mock_anom.return_value = {"host": "ubuntu", "status": "success"}

            res_server = await read_resource("server://ubuntu")
            self.assertEqual(res_server["status"], "online")
            mock_status.assert_awaited_once_with(host="ubuntu")

            res_telemetry = await read_resource("telemetry://ubuntu/cpu")
            self.assertEqual(res_telemetry["metric"], "cpu")
            mock_query.assert_awaited_once_with(host="ubuntu", metric="cpu")

            res_fc = await read_resource("forecast://ubuntu")
            self.assertEqual(res_fc["status"], "success")
            mock_fc.assert_awaited_once_with(host="ubuntu")

            res_anom = await read_resource("anomaly://ubuntu")
            self.assertEqual(res_anom["status"], "success")
            mock_anom.assert_awaited_once_with(host="ubuntu")

            res_invalid = await read_resource("unknown://uri")
            self.assertIn("error", res_invalid)


if __name__ == "__main__":
    unittest.main()