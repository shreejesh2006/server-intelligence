"""
Unit and Integration Tests for Real Multi-Host Telemetry (Phase 2)
Verifies:
1. Host normalization for Ubuntu and Kali (including Tailscale IP aliases)
2. Unknown host rejection (no silent defaulting to Ubuntu)
3. Model artifact isolation (Ubuntu vs Kali models loaded from distinct files, no cross-host leakage)
4. Per-host forecast and anomaly availability
5. VictoriaMetrics PromQL query generation with host selectors
6. API endpoint validation and 400 Bad Request on unknown hosts
"""

import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.ml.loader import (
    ml_loader,
    normalize_host as loader_normalize_host,
    KNOWN_HOSTS as LOADER_KNOWN_HOSTS,
)
from app.services.victoriametrics import (
    VictoriaMetricsService,
    normalize_host as vm_normalize_host,
    KNOWN_HOSTS as VM_KNOWN_HOSTS,
    HOST_LABEL_MAP,
)
from app.services.ml.forecast import ForecastService
from app.services.ml.anomaly import AnomalyService
from app.api.metrics import router as metrics_router
from app.api.intelligence import validate_host, router as intelligence_router
from fastapi import FastAPI


class TestMultiHostNormalization(unittest.TestCase):
    """Verifies canonical host resolution and alias mapping."""

    def test_ubuntu_aliases(self):
        for alias in ["ubuntu", "Ubuntu", "UBUNTU", "100.108.160.2", "192.168.1.10", "my-ubuntu-server"]:
            self.assertEqual(loader_normalize_host(alias), "ubuntu")
            self.assertEqual(vm_normalize_host(alias), "ubuntu")

    def test_decommissioned_kali_treated_as_unknown(self):
        for alias in ["kali", "Kali", "KALI", "100.115.122.92", "kali-security"]:
            self.assertIsNone(loader_normalize_host(alias))
            self.assertIsNone(vm_normalize_host(alias))

    def test_unknown_hosts_return_none(self):
        for unknown in ["windows", "Windows", "192.168.1.100", "centos", "debian", ""]:
            self.assertIsNone(loader_normalize_host(unknown))
            self.assertIsNone(vm_normalize_host(unknown))
        self.assertIsNone(loader_normalize_host(None))
        self.assertIsNone(vm_normalize_host(None))

    def test_known_hosts_constants(self):
        self.assertEqual(LOADER_KNOWN_HOSTS, ["ubuntu"])
        self.assertNotIn("kali", LOADER_KNOWN_HOSTS)
        self.assertNotIn("windows", LOADER_KNOWN_HOSTS)
        self.assertEqual(LOADER_KNOWN_HOSTS, VM_KNOWN_HOSTS)


class TestModelArtifactIsolation(unittest.TestCase):
    """Verifies that ML model artifacts are loaded exclusively for Ubuntu."""

    @classmethod
    def setUpClass(cls):
        ml_loader.load_all()

    def test_per_host_forecast_availability(self):
        self.assertTrue(ml_loader.is_forecast_available("ubuntu"))
        self.assertFalse(ml_loader.is_forecast_available("kali"))
        self.assertFalse(ml_loader.is_forecast_available("windows"))
        self.assertFalse(ml_loader.is_forecast_available("nonexistent_host"))

    def test_per_host_anomaly_availability(self):
        self.assertTrue(ml_loader.is_anomaly_available("ubuntu"))
        self.assertFalse(ml_loader.is_anomaly_available("kali"))
        self.assertFalse(ml_loader.is_anomaly_available("windows"))
        self.assertFalse(ml_loader.is_anomaly_available("nonexistent_host"))

    def test_forecast_models_ubuntu_only(self):
        ubuntu_cpu = ml_loader.get_forecast_model("cpu", "5m", host="ubuntu")
        kali_cpu = ml_loader.get_forecast_model("cpu", "5m", host="kali")
        windows_cpu = ml_loader.get_forecast_model("cpu", "5m", host="windows")

        self.assertIsNotNone(ubuntu_cpu, "Ubuntu CPU 5m model must exist")
        self.assertIsNone(kali_cpu, "Kali forecast model must be None")
        self.assertIsNone(windows_cpu, "Windows forecast model must be None")

    def test_anomaly_detectors_ubuntu_only(self):
        ubuntu_det = ml_loader.get_anomaly_detector(host="ubuntu")
        kali_det = ml_loader.get_anomaly_detector(host="kali")
        windows_det = ml_loader.get_anomaly_detector(host="windows")

        self.assertIsNotNone(ubuntu_det, "Ubuntu anomaly detector must exist")
        self.assertIsNone(kali_det, "Kali anomaly detector must be None")
        self.assertIsNone(windows_det, "Windows anomaly detector must be None")


class TestVictoriaMetricsHostQueries(unittest.TestCase):
    """Verifies that PromQL metric queries include host selectors and prevent leakage."""

    def setUp(self):
        self.vm = VictoriaMetricsService(base_url="http://mock-vm:8428")

    def test_ubuntu_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="ubuntu")
        self.assertIn('host=~"ubuntu|100.108.160.2|192.168.1.10|.*ubuntu.*"', query)

    def test_unknown_host_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="custom-node")
        self.assertEqual(query, 'server_cpu_usage_percent{host="custom-node"}')
        kali_query = self.vm.build_metric_query("server_cpu_usage_percent", host="kali")
        self.assertEqual(kali_query, 'server_cpu_usage_percent{host="kali"}')

    def test_no_host_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host=None)
        self.assertEqual(query, "server_cpu_usage_percent")


class TestServiceHostValidation(unittest.IsolatedAsyncioTestCase):
    """Verifies ForecastService and AnomalyService validate host and reject unknown hosts."""

    def setUp(self):
        self.forecast_service = ForecastService()
        self.anomaly_service = AnomalyService()

    async def test_forecast_unknown_host_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.forecast_service.get_forecasts(host="windows")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown host identifier", str(ctx.exception.detail))

    async def test_anomaly_unknown_host_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.anomaly_service.get_anomaly_score(host="windows")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown host identifier", str(ctx.exception.detail))

    async def test_anomaly_history_unknown_host_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.anomaly_service.get_anomaly_history(host="windows")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown host identifier", str(ctx.exception.detail))


class TestApiValidation(unittest.TestCase):
    """Verifies API endpoints reject unknown host parameters with 400 Bad Request."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(metrics_router, prefix="/api")

        from app.auth.permissions import require_viewer
        # Override require_viewer to allow test requests
        app.dependency_overrides[require_viewer] = lambda: {"username": "tester", "role": "ADMIN"}
        app.include_router(intelligence_router, prefix="/api")

        cls.client = TestClient(app)

    def test_current_metrics_unknown_host(self):
        response = self.client.get("/api/metrics/current?host=windows")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_metric_history_unknown_host(self):
        response = self.client.get("/api/metrics/cpu?host=windows")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_intelligence_forecast_unknown_host(self):
        response = self.client.get("/api/intelligence/forecast?host=windows")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_intelligence_anomaly_unknown_host(self):
        response = self.client.get("/api/intelligence/anomaly?host=windows")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_validate_host_helper(self):
        self.assertEqual(validate_host("ubuntu"), "ubuntu")
        self.assertEqual(validate_host("100.108.160.2"), "ubuntu")
        self.assertEqual(validate_host("192.168.1.10"), "ubuntu")
        self.assertIsNone(validate_host(None))
        with self.assertRaises(HTTPException):
            validate_host("kali")
        with self.assertRaises(HTTPException):
            validate_host("100.115.122.92")
        with self.assertRaises(HTTPException):
            validate_host("windows")


if __name__ == "__main__":
    unittest.main()
