"""
Unit and Integration Tests for Real Multi-Host Infrastructure Profiles
Verifies:
1. Host normalization for Ubuntu (Live), Windows (Simulated), and Kali (Simulated)
2. Unknown host rejection (e.g. centos, debian, arbitrary IPs raise 400)
3. Model artifact isolation (Ubuntu, Windows, Kali have their own models or profiles)
4. Per-host forecast and anomaly availability with provenance tagging
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
    ACTUAL_HOSTS as LOADER_ACTUAL_HOSTS,
    SIMULATED_HOSTS as LOADER_SIMULATED_HOSTS,
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

    def test_windows_aliases(self):
        for alias in ["windows", "Windows", "WINDOWS", "win2022", "10.0.12.44"]:
            self.assertEqual(loader_normalize_host(alias), "windows")
            self.assertEqual(vm_normalize_host(alias), "windows")

    def test_kali_aliases(self):
        for alias in ["kali", "Kali", "KALI", "10.0.14.88", "kali-security"]:
            self.assertEqual(loader_normalize_host(alias), "kali")
            self.assertEqual(vm_normalize_host(alias), "kali")

    def test_unknown_hosts_return_none(self):
        for unknown in ["centos", "debian", "redhat", "192.168.1.100", ""]:
            self.assertIsNone(loader_normalize_host(unknown))
            self.assertIsNone(vm_normalize_host(unknown))
        self.assertIsNone(loader_normalize_host(None))
        self.assertIsNone(vm_normalize_host(None))

    def test_known_hosts_constants(self):
        self.assertEqual(LOADER_KNOWN_HOSTS, ["ubuntu", "windows", "kali"])
        self.assertEqual(LOADER_ACTUAL_HOSTS, ["ubuntu"])
        self.assertEqual(LOADER_SIMULATED_HOSTS, ["windows", "kali"])
        self.assertEqual(LOADER_KNOWN_HOSTS, VM_KNOWN_HOSTS)


class TestModelArtifactIsolation(unittest.TestCase):
    """Verifies that ML model artifacts and anomaly detectors are loaded for all hosts."""

    @classmethod
    def setUpClass(cls):
        ml_loader.load_all()

    def test_per_host_forecast_availability(self):
        self.assertTrue(ml_loader.is_forecast_available("ubuntu"))
        self.assertFalse(ml_loader.is_forecast_available("nonexistent_host"))

    def test_per_host_anomaly_availability(self):
        self.assertTrue(ml_loader.is_anomaly_available("ubuntu"))
        self.assertTrue(ml_loader.is_anomaly_available("windows"))
        self.assertTrue(ml_loader.is_anomaly_available("kali"))
        self.assertFalse(ml_loader.is_anomaly_available("nonexistent_host"))

    def test_forecast_models_ubuntu(self):
        ubuntu_cpu = ml_loader.get_forecast_model("cpu", "5m", host="ubuntu")
        self.assertIsNotNone(ubuntu_cpu, "Ubuntu CPU 5m model must exist")

    def test_anomaly_detectors_per_host(self):
        ubuntu_det = ml_loader.get_anomaly_detector(host="ubuntu")
        kali_det = ml_loader.get_anomaly_detector(host="kali")
        windows_det = ml_loader.get_anomaly_detector(host="windows")

        self.assertIsNotNone(ubuntu_det, "Ubuntu anomaly detector must exist")
        self.assertIsNotNone(kali_det, "Kali anomaly detector must exist")
        self.assertIsNotNone(windows_det, "Windows anomaly detector must exist")
        self.assertIsNone(ml_loader.get_anomaly_detector(host="centos"))


class TestVictoriaMetricsHostQueries(unittest.TestCase):
    """Verifies that PromQL metric queries include host selectors and prevent leakage."""

    def setUp(self):
        self.vm = VictoriaMetricsService(base_url="http://mock-vm:8428")

    def test_ubuntu_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="ubuntu")
        self.assertIn('host=~"ubuntu|100.108.160.2|192.168.1.10|.*ubuntu.*"', query)

    def test_windows_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="windows")
        self.assertIn('host=~"windows|10.0.12.44|.*win.*"', query)

    def test_kali_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="kali")
        self.assertIn('host=~"kali|10.0.14.88|.*kali.*"', query)

    def test_unknown_host_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host="custom-node")
        self.assertEqual(query, 'server_cpu_usage_percent{host="custom-node"}')

    def test_no_host_metric_query(self):
        query = self.vm.build_metric_query("server_cpu_usage_percent", host=None)
        self.assertEqual(query, "server_cpu_usage_percent")


class TestServiceHostValidation(unittest.IsolatedAsyncioTestCase):
    """Verifies ForecastService and AnomalyService validate host and reject unknown hosts."""

    def setUp(self):
        self.forecast_service = ForecastService()
        self.anomaly_service = AnomalyService()

    async def test_forecast_simulated_hosts_succeed(self):
        # Windows simulated profile forecast
        res_win = await self.forecast_service.get_forecasts(host="windows")
        self.assertEqual(res_win["host"], "windows")
        self.assertEqual(res_win["provenance"], "simulated_profile")
        self.assertEqual(res_win["primary_model"], "iTransformer")
        self.assertIn("5m", res_win["cpu"]["predictions"])
        self.assertIn("72h", res_win["cpu"]["predictions"])

        # Kali simulated profile forecast
        res_kali = await self.forecast_service.get_forecasts(host="kali")
        self.assertEqual(res_kali["host"], "kali")
        self.assertEqual(res_kali["provenance"], "simulated_profile")
        self.assertEqual(res_kali["primary_model"], "iTransformer")
        self.assertIn("5m", res_kali["cpu"]["predictions"])
        self.assertIn("72h", res_kali["cpu"]["predictions"])

    async def test_forecast_unknown_host_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.forecast_service.get_forecasts(host="centos")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown host identifier", str(ctx.exception.detail))

    async def test_anomaly_simulated_hosts_succeed(self):
        win_anom = await self.anomaly_service.get_anomaly_score(host="windows")
        self.assertEqual(win_anom["host"], "windows")
        self.assertEqual(win_anom["provenance"], "simulated_profile")

        kali_anom = await self.anomaly_service.get_anomaly_score(host="kali")
        self.assertEqual(kali_anom["host"], "kali")
        self.assertEqual(kali_anom["provenance"], "simulated_profile")

    async def test_anomaly_unknown_host_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.anomaly_service.get_anomaly_score(host="centos")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown host identifier", str(ctx.exception.detail))


class TestApiValidation(unittest.TestCase):
    """Verifies API endpoints handle known hosts and reject unknown host parameters with 400."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(metrics_router, prefix="/api")

        from app.auth.permissions import require_viewer
        # Override require_viewer to allow test requests
        app.dependency_overrides[require_viewer] = lambda: {"username": "tester", "role": "ADMIN"}
        app.include_router(intelligence_router, prefix="/api")

        cls.client = TestClient(app)

    def test_current_metrics_simulated_hosts(self):
        res_win = self.client.get("/api/metrics/current?host=windows")
        self.assertEqual(res_win.status_code, 200)
        self.assertEqual(res_win.json()["host"], "windows")
        self.assertEqual(res_win.json()["provenance"], "simulated_profile")

        res_kali = self.client.get("/api/metrics/current?host=kali")
        self.assertEqual(res_kali.status_code, 200)
        self.assertEqual(res_kali.json()["host"], "kali")
        self.assertEqual(res_kali.json()["provenance"], "simulated_profile")

    def test_current_metrics_unknown_host(self):
        response = self.client.get("/api/metrics/current?host=centos")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_metric_history_simulated_host(self):
        response = self.client.get("/api/metrics/cpu?host=windows&start=-30m&step=30s")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["host"], "windows")
        self.assertEqual(response.json()["provenance"], "simulated_profile")

    def test_metric_history_unknown_host(self):
        response = self.client.get("/api/metrics/cpu?host=centos")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_intelligence_forecast_simulated_host(self):
        response = self.client.get("/api/intelligence/forecast?host=windows")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["host"], "windows")
        self.assertEqual(response.json()["provenance"], "simulated_profile")

    def test_intelligence_forecast_unknown_host(self):
        response = self.client.get("/api/intelligence/forecast?host=centos")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_intelligence_anomaly_simulated_host(self):
        response = self.client.get("/api/intelligence/anomaly?host=windows")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["host"], "windows")
        self.assertEqual(response.json()["provenance"], "simulated_profile")

    def test_intelligence_anomaly_unknown_host(self):
        response = self.client.get("/api/intelligence/anomaly?host=centos")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown host identifier", response.json()["detail"])

    def test_validate_host_helper(self):
        self.assertEqual(validate_host("ubuntu"), "ubuntu")
        self.assertEqual(validate_host("100.108.160.2"), "ubuntu")
        self.assertEqual(validate_host("192.168.1.10"), "ubuntu")
        self.assertEqual(validate_host("windows"), "windows")
        self.assertEqual(validate_host("10.0.12.44"), "windows")
        self.assertEqual(validate_host("kali"), "kali")
        self.assertEqual(validate_host("10.0.14.88"), "kali")
        self.assertIsNone(validate_host(None))
        with self.assertRaises(HTTPException):
            validate_host("centos")
        with self.assertRaises(HTTPException):
            validate_host("192.168.99.99")


if __name__ == "__main__":
    unittest.main()
