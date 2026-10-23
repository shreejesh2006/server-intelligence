"""
Phase 6: End-to-End Integration, Reliability, and Operational Readiness Tests

Validates hardening, concurrency guards, failure recovery, notification lifecycle,
and empty telemetry semantics across all integrated subsystems.
"""

import asyncio
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.database import Base
from app.database.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    Automation,
    AutomationRun,
    AutomationStatus,
    Notification,
    TelemetrySample,
    User,
    UserRole,
)
from app.services.notifications import dispatch_notification
from app.services.predictive_alerts import (
    PREDICTIVE_SOURCE,
    evaluate_predictive_alerts,
)
from app.services.automation_engine import (
    trigger_automations_for_predictive_alert,
    is_alert_already_executed_by_automation,
    run_automation,
)
from app.services.scheduler import PredictiveScheduler
from app.mcp.tools import get_server_status


class TestPhase6HardeningBase(unittest.TestCase):
    """Sets up an isolated in-memory SQLite database for hardening tests."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )

    def setUp(self):
        Base.metadata.drop_all(bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = self.TestingSessionLocal()

    def tearDown(self):
        self.db.close()


class TestNotificationHardening(TestPhase6HardeningBase):
    """Validates Notification delivery tracking, status recording, and failure safety."""

    def test_notification_created_without_webhook(self):
        """Notification without external webhook records status CREATED, delivered_at=None."""
        res = asyncio.run(
            dispatch_notification(
                db=self.db,
                target="alert:101",
                message="High CPU utilization forecasted",
                alert_id=101,
            )
        )
        self.assertTrue(res["persisted"])
        self.assertFalse(res["delivered_external"])
        self.assertEqual(res["status"], "CREATED")

        notif = self.db.query(Notification).filter_by(id=res["notification_id"]).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "CREATED")
        self.assertIsNone(notif.delivered_at)
        self.assertIsNone(notif.error)

    def test_notification_webhook_success_lifecycle(self):
        """Notification with successful webhook records status DELIVERED with delivered_at timestamp."""
        mock_resp = MagicMock()
        mock_resp.is_success = True
        mock_resp.status_code = 200

        with patch("app.services.notifications.NOTIFICATION_WEBHOOK_URL", "https://alerts.netra.local/webhook?token=supersecret123"), \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            res = asyncio.run(
                dispatch_notification(
                    db=self.db,
                    target="alert:102",
                    message="Critical anomaly detected",
                    alert_id=102,
                )
            )

        self.assertTrue(res["persisted"])
        self.assertTrue(res["delivered_external"])
        self.assertEqual(res["status"], "DELIVERED")

        notif = self.db.query(Notification).filter_by(id=res["notification_id"]).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "DELIVERED")
        self.assertIsNotNone(notif.delivered_at)
        self.assertIsNone(notif.error)

    def test_notification_webhook_http_failure_recorded(self):
        """Notification with HTTP 500 error records status FAILED, delivered_at=None, and error message."""
        mock_resp = MagicMock()
        mock_resp.is_success = False
        mock_resp.status_code = 502

        with patch("app.services.notifications.NOTIFICATION_WEBHOOK_URL", "https://alerts.netra.local/webhook"), \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            res = asyncio.run(
                dispatch_notification(
                    db=self.db,
                    target="alert:103",
                    message="Threshold breached",
                    alert_id=103,
                )
            )

        self.assertTrue(res["persisted"])
        self.assertFalse(res["delivered_external"])
        self.assertEqual(res["status"], "FAILED")

        notif = self.db.query(Notification).filter_by(id=res["notification_id"]).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "FAILED")
        self.assertIsNone(notif.delivered_at)
        self.assertIn("502", notif.error)

    def test_notification_webhook_exception_sanitizes_credentials(self):
        """Notification webhook connection error masks URLs and secrets in error field."""
        with patch("app.services.notifications.NOTIFICATION_WEBHOOK_URL", "https://hooks.slack.com/services/T00/B00/SECRET_TOKEN"), \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = RuntimeError("Connection failed to https://hooks.slack.com/services/T00/B00/SECRET_TOKEN with Bearer mysecret")

            res = asyncio.run(
                dispatch_notification(
                    db=self.db,
                    target="alert:104",
                    message="Disk space critical",
                    alert_id=104,
                )
            )

        self.assertTrue(res["persisted"])
        self.assertFalse(res["delivered_external"])
        self.assertEqual(res["status"], "FAILED")

        notif = self.db.query(Notification).filter_by(id=res["notification_id"]).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "FAILED")
        self.assertIsNone(notif.delivered_at)
        # Verify secrets and raw URL are redacted
        self.assertNotIn("SECRET_TOKEN", notif.error)
        self.assertNotIn("mysecret", notif.error)


class TestTelemetryUnavailableSemantics(TestPhase6HardeningBase):
    """Validates that empty/missing telemetry returns unavailable semantics rather than fabricating 0.0."""

    def test_metrics_current_returns_unavailable_when_no_data(self):
        """Endpoint /api/metrics/current returns status='unavailable' when neither VM nor DB has samples."""
        from app.api.metrics import router as metrics_router
        from app.auth.permissions import require_viewer

        app = FastAPI()
        app.include_router(metrics_router, prefix="/api")
        app.dependency_overrides[require_viewer] = lambda: {"username": "tester", "role": "OPERATOR"}

        # Patch get_db to use test in-memory DB
        from app.database.database import get_db
        app.dependency_overrides[get_db] = lambda: self.db

        client = TestClient(app)

        # Ensure VictoriaMetrics is offline/returns error
        with patch("app.services.victoriametrics.VictoriaMetricsService.query", side_effect=RuntimeError("Offline")):
            resp = client.get("/api/metrics/current?host=ubuntu")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "unavailable")
            self.assertIsNone(data["metrics"])
            self.assertIn("No telemetry available", data["detail"])

    def test_mcp_get_server_status_unreachable_on_empty_telemetry(self):
        """MCP get_server_status tool returns 'unreachable' when telemetry has no positive readings."""
        with patch("app.services.victoriametrics.VictoriaMetricsService.get_current_metrics", new_callable=AsyncMock) as mock_get:
            # Telemetry returns empty dictionary or zeros
            mock_get.return_value = ({}, "2026-10-22T19:00:00+00:00")
            res = asyncio.run(get_server_status(host="ubuntu"))
            self.assertEqual(res["status"], "unreachable")
            self.assertEqual(res["host"], "ubuntu")


class TestConcurrencyAndDeduplication(TestPhase6HardeningBase):
    """Validates concurrency serialization and duplicate prevention under load."""

    def test_concurrent_predictive_evaluation_serialized(self):
        """Overlapping concurrent evaluation cycles do not duplicate predictive alerts."""
        mock_forecast_service = MagicMock()
        mock_forecasts = {
            "model_status": "ready",
            "cpu": {
                "predictions": {"5m": 92.5, "15m": 88.0, "30m": 85.0, "1h": 82.0, "3h": 75.0},
                "strategy": "HistGradientBoostingRegressor",
            },
            "memory": {
                "predictions": {"5m": 70.0, "15m": 72.0, "30m": 74.0, "1h": 75.0, "3h": 76.0},
                "strategy": "HistGradientBoostingRegressor",
            },
        }
        mock_forecast_service.get_forecasts = AsyncMock(return_value=mock_forecasts)

        async def run_parallel_evaluations():
            # Launch 3 simultaneous evaluations for the same host
            t1 = evaluate_predictive_alerts(db=self.db, host="ubuntu", forecast_service=mock_forecast_service)
            t2 = evaluate_predictive_alerts(db=self.db, host="ubuntu", forecast_service=mock_forecast_service)
            t3 = evaluate_predictive_alerts(db=self.db, host="ubuntu", forecast_service=mock_forecast_service)
            return await asyncio.gather(t1, t2, t3)

        results = asyncio.run(run_parallel_evaluations())

        # Check total created across all 3 concurrent runs
        total_created = sum(r["alerts_created"] for r in results)
        total_updated_or_skipped = sum(r["alerts_updated"] + r["alerts_skipped"] for r in results)

        # There are 4 breaches (cpu 5m, 15m, 30m, 1h are >= 80.0 warning)
        # Exactly 4 alerts should be created total, the rest should be updated or skipped
        active_alerts = self.db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(active_alerts), 4)
        self.assertEqual(total_created, 4)
        self.assertGreater(total_updated_or_skipped, 0)

    def test_concurrent_automation_triggers_idempotent(self):
        """Concurrent automation triggers for the same predictive alert execute exactly once."""
        auto = Automation(
            name="Log Predictive Spike",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.ENABLED.value,
        )
        self.db.add(auto)
        self.db.commit()
        self.db.refresh(auto)

        alert = Alert(
            title="Predicted CPU Spike on ubuntu (5m)",
            message="CPU forecast to reach 96%",
            severity=AlertSeverity.CRITICAL.value,
            source=PREDICTIVE_SOURCE,
            server="ubuntu",
            metric="cpu",
            status=AlertStatus.ACTIVE.value,
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)

        async def run_parallel_triggers():
            t1 = trigger_automations_for_predictive_alert(alert=alert, db=self.db)
            t2 = trigger_automations_for_predictive_alert(alert=alert, db=self.db)
            return await asyncio.gather(t1, t2)

        runs_group1, runs_group2 = asyncio.run(run_parallel_triggers())
        all_runs = runs_group1 + runs_group2

        # Exactly 1 execution should succeed; the concurrent one is skipped due to idempotency
        self.assertEqual(len(all_runs), 1)

        db_runs = self.db.query(AutomationRun).filter_by(automation_id=auto.id).all()
        self.assertEqual(len(db_runs), 1)
        self.assertEqual(db_runs[0].status, "SUCCESS")


class TestSchedulerLifecycleHardening(TestPhase6HardeningBase):
    """Validates scheduler lifecycle, start/stop idempotency, and task cleanup."""

    def test_scheduler_graceful_stop_and_cleanup(self):
        """Scheduler start creates worker; astop cancels and waits cleanly without leaking tasks."""
        sched = PredictiveScheduler()

        async def test_sched():
            started = sched.start()
            self.assertTrue(started)
            self.assertTrue(sched.is_running)

            # Stopping via astop should await task completion
            await sched.astop()
            self.assertFalse(sched.is_running)

        asyncio.run(test_sched())

    def test_duplicate_scheduler_start_rejected(self):
        """Scheduler cannot be started twice concurrently."""
        sched = PredictiveScheduler()

        async def test_duplicate():
            sched.start()
            self.assertTrue(sched.is_running)
            duplicate_started = sched.start()
            self.assertFalse(duplicate_started)
            await sched.astop()

        asyncio.run(test_duplicate())


if __name__ == "__main__":
    unittest.main()
