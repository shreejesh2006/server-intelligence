"""
Tests for NETRA INTELLIGENCE Integrated Architecture.
Validates:
1. VictoriaLogs integration (ingestion, query, sanitization, SQLite fallback, and log correlation).
2. NetBox infrastructure inventory integration (host resolution, caching, fallback profiles, device lookup).
3. Resource-capacity intelligence and exhaustion estimation calculations.
4. Unified incident correlation across metrics, logs, and NetBox inventory.
5. Extended MCP tools (search_logs, get_infrastructure_inventory, correlate_incident).
6. Static validation of all Kubernetes manifests and service contracts.
"""

import os
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
import yaml

from app.services.victorialogs import VictoriaLogsService, sanitize_log_message
from app.services.netbox import NetBoxService, CANONICAL_INVENTORY_PROFILES
from app.services.ml.forecast import ForecastService
from app.mcp.tools import TOOL_REGISTRY, AVAILABLE_TOOLS
from app.database.database import Base, engine, SessionLocal
from app.database.models import SystemLogRecord


class TestVictoriaLogsIntegration(unittest.TestCase):
    """Unit and fallback tests for VictoriaLogs centralized log service."""

    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.service = VictoriaLogsService(base_url="http://mock-victorialogs:9428")
        with SessionLocal() as db:
            db.query(SystemLogRecord).delete()
            db.commit()

    def tearDown(self):
        with SessionLocal() as db:
            db.query(SystemLogRecord).delete()
            db.commit()

    def test_log_sanitization_removes_secrets(self):
        raw = "User admin logged in with token=ghp_secretpassword123456 and api_key=ak_9988776655"
        clean = sanitize_log_message(raw)
        self.assertNotIn("ghp_secretpassword123456", clean)
        self.assertNotIn("ak_9988776655", clean)
        self.assertIn("[REDACTED]", clean)

    def test_sqlite_fallback_on_victorialogs_offline(self):
        import asyncio
        async def run_test():
            # Ingest logs without live VictoriaLogs container -> persists in SQLite
            now_iso = datetime.now(timezone.utc).isoformat()
            logs = [
                {
                    "timestamp": now_iso,
                    "host": "ubuntu",
                    "service": "kernel",
                    "level": "ERROR",
                    "message": "Out of memory event occurred on pid 1024"
                }
            ]
            result = await self.service.ingest_logs(logs)
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["ingested_count"], 1)

            # Query should fallback to SQLite and return the record
            query_res = await self.service.query_logs(
                host="ubuntu",
                level="ERROR",
                query="Out of memory",
                start="-1h"
            )
            self.assertEqual(query_res["status"], "success")
            self.assertEqual(query_res["source"], "database")
            self.assertEqual(len(query_res["logs"]), 1)
            self.assertEqual(query_res["logs"][0]["host"], "ubuntu")
            self.assertIn("Out of memory", query_res["logs"][0]["message"])

        asyncio.run(run_test())

    @patch("httpx.AsyncClient.post")
    def test_batch_ingestion_http_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.is_success = True
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        import asyncio
        async def run_test():
            logs = [
                {"timestamp": "2026-10-22T10:01:00Z", "host": "ubuntu", "source": "sshd", "level": "INFO", "message": "Accepted publickey"},
                {"timestamp": "2026-10-22T10:01:05Z", "host": "ubuntu", "source": "cron", "level": "INFO", "message": "CMD (backup.sh)"}
            ]
            result = await self.service.ingest_logs(logs)
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["ingested_count"], 2)
            self.assertTrue(result["victorialogs_delivered"])

        asyncio.run(run_test())

    def test_correlate_logs_with_timestamp(self):
        import asyncio
        async def run_test():
            ts = "2026-10-22T12:00:00Z"
            await self.service.ingest_logs([
                {
                    "timestamp": ts,
                    "host": "ubuntu",
                    "source": "systemd",
                    "level": "CRITICAL",
                    "message": "Out of memory killer triggered"
                }
            ])

            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            correlated = await self.service.correlate_logs(
                host="ubuntu",
                timestamp=dt,
                window_minutes=15
            )
            self.assertEqual(correlated["status"], "success")
            self.assertTrue(len(correlated["logs"]) >= 1)
            self.assertIn("memory", correlated["logs"][0]["message"].lower())

        asyncio.run(run_test())


class TestNetBoxIntegration(unittest.TestCase):
    """Unit and fallback tests for NetBox DCIM/IPAM inventory service."""

    def setUp(self):
        self.service = NetBoxService(base_url="http://mock-netbox:8080", token="test_token")

    def test_fallback_profile_generation(self):
        import asyncio
        async def run_fallback():
            dev_ubuntu = await self.service.get_device_by_host("ubuntu")
            self.assertIsNotNone(dev_ubuntu)
            self.assertEqual(dev_ubuntu["name"], "ubuntu-monitored-server")
            self.assertEqual(dev_ubuntu["site"], "NMIT Data Center")
            self.assertEqual(dev_ubuntu["primary_ip"], "100.108.160.2")

            dev_unknown = await self.service.get_device_by_host("100.115.122.92")
            self.assertIsNone(dev_unknown)

        asyncio.run(run_fallback())

    def test_cache_ttl(self):
        now = 100000.0
        self.service._cached_devices = [{"name": "cached-server", "canonical_host": "ubuntu"}]
        self.service._cache_timestamp = now

        import time
        with patch("time.time", return_value=now + 50.0): # within 300s TTL
            import asyncio
            async def run_cache():
                devices = await self.service.get_all_devices()
                self.assertEqual(len(devices), 1)
                self.assertEqual(devices[0]["name"], "cached-server")
            asyncio.run(run_cache())


from app.services.ml.forecast import ForecastService


class TestCapacityIntelligence(unittest.TestCase):
    """Tests for multi-horizon capacity forecasting and exhaustion estimation."""

    def setUp(self):
        self.service = ForecastService()

    @patch("app.services.ml.forecast.ForecastService.get_forecasts")
    def test_get_capacity_intelligence_growing_trajectory(self, mock_get_forecasts):
        mock_get_forecasts.return_value = {
            "host": "ubuntu",
            "model_version": "test-v1",
            "cpu": {
                "current": 60.0,
                "strategy": "HistGradientBoosting",
                "predictions": {"5m": 65.0, "15m": 75.0, "30m": 90.0, "60m": 98.0}
            },
            "memory": {
                "current": 50.0,
                "strategy": "HistGradientBoosting",
                "predictions": {"5m": 50.0, "15m": 50.0, "30m": 50.0, "60m": 50.0}
            },
            "load_1m": {
                "current": 1.5,
                "strategy": "HistGradientBoosting",
                "predictions": {"5m": 1.6, "15m": 1.7, "30m": 1.8, "60m": 1.9}
            }
        }

        import asyncio
        async def run_test():
            report = await self.service.get_capacity_intelligence(host="ubuntu")
            self.assertEqual(report["host"], "ubuntu")
            self.assertIn("resources", report)

            # Check CPU resource calculations
            cpu = report["resources"]["cpu"]
            self.assertEqual(cpu["current"], 60.0)
            self.assertEqual(cpu["headroom_warning"], 20.0)
            self.assertEqual(cpu["headroom_critical"], 35.0)
            self.assertEqual(cpu["headroom_exhaustion"], 40.0)
            self.assertGreater(cpu["growth_rate_per_minute"], 0)
            self.assertIsNotNone(cpu["estimated_minutes_to_warning"])
            self.assertIsNotNone(cpu["estimated_minutes_to_critical"])
            self.assertEqual(cpu["capacity_risk"], "CRITICAL")

            # Check Memory nominal resource calculations
            mem = report["resources"]["memory"]
            self.assertEqual(mem["capacity_risk"], "NOMINAL")
            self.assertEqual(mem["growth_rate_per_minute"], 0.0)
            self.assertIsNone(mem["estimated_minutes_to_exhaustion"])

        asyncio.run(run_test())


from app.mcp.tools import TOOL_REGISTRY, AVAILABLE_TOOLS


class TestExtendedMCPTools(unittest.TestCase):
    """Tests for the new MCP tool handlers (search_logs, get_infrastructure_inventory, correlate_incident)."""

    def test_tool_declarations_exist(self):
        tool_names = [t["function"]["name"] for t in AVAILABLE_TOOLS]
        self.assertIn("search_logs", tool_names)
        self.assertIn("get_infrastructure_inventory", tool_names)
        self.assertIn("correlate_incident", tool_names)

    def test_execute_search_logs_tool(self):
        import asyncio
        async def run_tool():
            handler = TOOL_REGISTRY["search_logs"]
            res = await handler(host="ubuntu", limit=5)
            self.assertEqual(res["status"], "success")
            self.assertIn("logs", res)

        asyncio.run(run_tool())

    def test_execute_get_infrastructure_inventory_tool(self):
        import asyncio
        async def run_tool():
            handler = TOOL_REGISTRY["get_infrastructure_inventory"]
            res = await handler(host="ubuntu")
            self.assertEqual(res["status"], "success")
            self.assertIn("device", res)
            self.assertEqual(res["device"]["name"], "ubuntu-monitored-server")

        asyncio.run(run_tool())

    def test_execute_correlate_incident_tool(self):
        import asyncio
        async def run_tool():
            handler = TOOL_REGISTRY["correlate_incident"]
            res = await handler(host="ubuntu", window_minutes=15)
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["host"], "ubuntu")
            self.assertIn("inventory", res)
            self.assertIn("correlated_logs", res)

        asyncio.run(run_tool())


class TestKubernetesManifestIntegrity(unittest.TestCase):
    """Static validation of Kubernetes manifests in k8s/."""

    def test_all_manifests_are_valid_yaml(self):
        k8s_dir = "/Users/shreejesh2006/Projects/server-intelligence/k8s"
        manifest_files = []
        for root, _, files in os.walk(k8s_dir):
            for file in files:
                if file.endswith((".yaml", ".yml")):
                    manifest_files.append(os.path.join(root, file))

        self.assertGreater(len(manifest_files), 10, "Expected at least 10 Kubernetes manifest files")

        for mf in manifest_files:
            with open(mf, "r") as f:
                docs = list(yaml.safe_load_all(f))
                for doc in docs:
                    if doc is not None:
                        if "kind" in doc and doc.get("kind") != "Kustomization":
                            self.assertIn("apiVersion", doc, f"{mf} missing apiVersion")
                            self.assertIn("metadata", doc, f"{mf} missing metadata")

    def test_service_ports_alignment(self):
        k8s_dir = "/Users/shreejesh2006/Projects/server-intelligence/k8s"
        services = {}
        for root, _, files in os.walk(k8s_dir):
            for file in files:
                if file.endswith((".yaml", ".yml")):
                    with open(os.path.join(root, file), "r") as f:
                        for doc in yaml.safe_load_all(f):
                            if doc and doc.get("kind") == "Service":
                                s_name = doc["metadata"]["name"]
                                port = doc["spec"]["ports"][0]["port"]
                                services[s_name] = port

        # Assert key architectural services and expected ports
        self.assertEqual(services.get("server-intelligence-backend"), 8000)
        self.assertEqual(services.get("server-intelligence-frontend"), 80)
        self.assertEqual(services.get("victoriametrics"), 8428)
        self.assertEqual(services.get("victorialogs"), 9428)
        self.assertEqual(services.get("netbox"), 8080)


if __name__ == "__main__":
    unittest.main()
