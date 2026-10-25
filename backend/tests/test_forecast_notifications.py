"""
Unit and Integration Tests for Forecast-Driven Notifications (Phase 4)
Verifies:
1. A genuine forecast breach creates a predictive alert.
2. A forecast below threshold does not create an alert.
3. An unavailable forecast does not create an alert.
4. Repeated evaluation deduplicates active alerts.
5. Existing alert context updates when severity/value changes.
6. Recovery follows the intended predictive alert lifecycle (auto-resolves active alert).
7. Reactive alerts are unaffected by predictive recovery.
8. Different hosts and metrics do not collide in deduplication.
9. Database or notification delivery failures are handled safely.
10. Manual evaluation enforces authorization (VIEWER forbidden, OPERATOR allowed).
11. Scheduler startup does not create duplicate workers.
12. Existing acknowledgement and resolution behavior remains correct (acknowledged not auto-resolved).
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database.database import Base, get_db
from app.database.models import (
    Alert,
    AlertRule,
    AlertSeverity,
    AlertStatus,
    Notification,
    User,
    UserRole,
)
from app.auth.dependencies import get_current_user
from app.api.alerts import router as alerts_router
from app.services.predictive_alerts import (
    PREDICTIVE_SOURCE,
    evaluate_predictive_alerts,
)
from app.services.notifications import dispatch_notification
from app.services.scheduler import PredictiveScheduler


class TestPredictiveAlertsBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        cls.app = FastAPI()
        cls.app.include_router(alerts_router, prefix="/api")

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        cls.app.dependency_overrides[get_db] = override_get_db

        cls.mock_user = User(
            id=1,
            username="operator_user",
            role=UserRole.OPERATOR.value,
            password_hash="fakehash",
        )

        def override_get_current_user():
            return cls.mock_user

        cls.app.dependency_overrides[get_current_user] = override_get_current_user
        cls.client = TestClient(cls.app)

    def setUp(self):
        db = self.TestingSessionLocal()
        db.query(Notification).delete()
        db.query(AlertRule).delete()
        db.query(Alert).delete()
        db.commit()
        db.close()

        self.mock_user.role = UserRole.OPERATOR.value


class TestForecastDrivenAlertEvaluation(TestPredictiveAlertsBase):
    """Tests core forecast breach detection, thresholding, and lifecycle."""

    async def _mock_forecast(self, cpu_5m=50.0, mem_5m=60.0, strategy="HGB", status="fresh"):
        return {
            "model_status": status,
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 45.0,
                "strategy": strategy,
                "predictions": {
                    "5m": cpu_5m,
                    "15m": cpu_5m,
                    "30m": cpu_5m,
                    "1h": cpu_5m,
                    "3h": cpu_5m,
                },
            },
            "memory": {
                "current": 55.0,
                "strategy": strategy,
                "predictions": {
                    "5m": mem_5m,
                    "15m": mem_5m,
                    "30m": mem_5m,
                    "1h": mem_5m,
                    "3h": mem_5m,
                },
            },
        }

    def test_genuine_forecast_breach_creates_alert(self):
        """1. A genuine forecast breach creates a predictive alert."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "iTransformer",
                "predictions": {"5m": 88.5, "15m": 60.0, "30m": 60.0, "1h": 60.0, "3h": 60.0},
            },
            "memory": {
                "current": 50.0,
                "strategy": "iTransformer",
                "predictions": {"5m": 50.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
            },
        }

        import asyncio
        res = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["alerts_created"], 1)

        # Verify alert in DB
        alerts = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.metric, "cpu")
        self.assertEqual(alert.server, "ubuntu")
        self.assertEqual(alert.severity, AlertSeverity.WARNING.value)
        self.assertIn("88.5%", alert.message)
        self.assertIn("(5m)", alert.title)

        # Verify notification was persisted
        notifs = db.query(Notification).all()
        self.assertEqual(len(notifs), 1)
        self.assertIn(f"alert:{alert.id}", notifs[0].target)
        db.close()

    def test_forecast_below_threshold_does_not_create_alert(self):
        """2. A forecast below threshold does not create an alert."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "iTransformer",
                "predictions": {"5m": 65.0, "15m": 65.0, "30m": 65.0, "1h": 65.0, "3h": 65.0},
            },
            "memory": {
                "current": 50.0,
                "strategy": "iTransformer",
                "predictions": {"5m": 70.0, "15m": 70.0, "30m": 70.0, "1h": 70.0, "3h": 70.0},
            },
        }

        import asyncio
        res = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))

        self.assertEqual(res["alerts_created"], 0)
        alerts = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(alerts), 0)
        db.close()

    def test_unavailable_or_persistence_forecast_does_not_create_alert(self):
        """3. An unavailable or persistence_fallback forecast does not create an alert."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        # Strategy persistence_fallback should be skipped
        mock_svc.get_forecasts.return_value = {
            "model_status": "unavailable",
            "is_stale": True,
            "host": "ubuntu",
            "cpu": {
                "current": 95.0,
                "strategy": "persistence_fallback",
                "predictions": {"5m": 96.0, "15m": 97.0, "30m": 98.0, "1h": 99.0, "3h": 100.0},
            },
        }

        import asyncio
        res = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))

        self.assertEqual(res["alerts_created"], 0)
        alerts = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(alerts), 0)
        db.close()

    def test_repeated_evaluation_deduplicates_active_alert(self):
        """4. Repeated evaluation deduplicates active alerts without creating duplicates."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "HGB",
                "predictions": {"5m": 85.0, "15m": 60.0, "30m": 60.0, "1h": 60.0, "3h": 60.0},
            },
        }

        import asyncio
        # First cycle: creates alert
        res1 = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        self.assertEqual(res1["alerts_created"], 1)

        # Second cycle: deduplicates (no new alert created)
        res2 = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        self.assertEqual(res2["alerts_created"], 0)

        # Verify only 1 alert in DB
        alerts = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(alerts), 1)
        db.close()

    def test_existing_alert_context_updates_on_severity_escalation(self):
        """5. Existing alert context updates when predicted severity escalates from WARNING to CRITICAL."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        # 1st cycle: WARNING breach (85%)
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "HGB",
                "predictions": {"5m": 85.0, "15m": 60.0, "30m": 60.0, "1h": 60.0, "3h": 60.0},
            },
        }

        import asyncio
        asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        alert = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).first()
        self.assertEqual(alert.severity, AlertSeverity.WARNING.value)

        # 2nd cycle: CRITICAL breach (96%)
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 70.0,
                "strategy": "HGB",
                "predictions": {"5m": 96.0, "15m": 60.0, "30m": 60.0, "1h": 60.0, "3h": 60.0},
            },
        }

        res2 = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        self.assertEqual(res2["alerts_updated"], 1)

        db.refresh(alert)
        self.assertEqual(alert.severity, AlertSeverity.CRITICAL.value)
        self.assertIn("96.0%", alert.message)
        db.close()

    def test_recovery_auto_resolves_predictive_alert(self):
        """6. Recovery follows intended lifecycle: auto-resolves ACTIVE predictive alert when forecast drops."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        # 1st cycle: breach
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "HGB",
                "predictions": {"5m": 85.0, "15m": 60.0, "30m": 60.0, "1h": 60.0, "3h": 60.0},
            },
        }

        import asyncio
        asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        alert = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).first()
        self.assertEqual(alert.status, AlertStatus.ACTIVE.value)

        # 2nd cycle: recovered (forecast drops to 50%)
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 40.0,
                "strategy": "HGB",
                "predictions": {"5m": 50.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
            },
        }

        res2 = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        self.assertEqual(res2["alerts_resolved"], 1)

        db.refresh(alert)
        self.assertEqual(alert.status, AlertStatus.RESOLVED.value)
        self.assertIsNotNone(alert.resolved_at)
        db.close()

    def test_reactive_alerts_unaffected_by_predictive_recovery(self):
        """7. Reactive alerts (threshold, anomaly) are NOT resolved by predictive recovery."""
        db = self.TestingSessionLocal()

        # Seed an active reactive alert
        reactive_alert = Alert(
            title="High CPU Utilization (90%) on ubuntu",
            message="Host 'ubuntu' CPU is at 90%",
            severity=AlertSeverity.WARNING.value,
            status=AlertStatus.ACTIVE.value,
            source="threshold_monitor",
            metric="cpu",
            server="ubuntu",
        )
        db.add(reactive_alert)
        db.commit()

        # Run predictive evaluation where forecast is safe (40%)
        mock_svc = AsyncMock()
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 40.0,
                "strategy": "HGB",
                "predictions": {"5m": 40.0, "15m": 40.0, "30m": 40.0, "1h": 40.0, "3h": 40.0},
            },
        }

        import asyncio
        asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))

        db.refresh(reactive_alert)
        self.assertEqual(reactive_alert.status, AlertStatus.ACTIVE.value)
        self.assertIsNone(reactive_alert.resolved_at)
        db.close()

    def test_multi_host_and_multi_metric_deduplication_isolation(self):
        """8. Different hosts and metrics do not collide in deduplication."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()

        async def fake_get_forecasts(host=None):
            return {
                "model_status": "fresh",
                "is_stale": False,
                "host": host or "ubuntu",
                "cpu": {
                    "current": 50.0,
                    "strategy": "HGB",
                    "predictions": {"5m": 88.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
                },
                "memory": {
                    "current": 50.0,
                    "strategy": "HGB",
                    "predictions": {"5m": 92.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
                },
            }

        mock_svc.get_forecasts.side_effect = fake_get_forecasts

        import asyncio
        res_ubuntu = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        res_windows = asyncio.run(evaluate_predictive_alerts(db=db, host="windows", forecast_service=mock_svc))
        res_unknown = asyncio.run(evaluate_predictive_alerts(db=db, host="centos", forecast_service=mock_svc))

        self.assertEqual(res_ubuntu["alerts_created"], 2)  # CPU 5m and Memory 5m for ubuntu
        self.assertEqual(res_windows["alerts_created"], 2) # CPU 5m and Memory 5m for windows
        self.assertEqual(res_unknown["status"], "error")    # centos is rejected as unknown host
        self.assertIn("Unknown host", res_unknown["detail"])

        alerts = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).all()
        self.assertEqual(len(alerts), 4)

        ubuntu_alerts = [a for a in alerts if a.server == "ubuntu"]
        self.assertEqual(len(ubuntu_alerts), 2)
        windows_alerts = [a for a in alerts if a.server == "windows"]
        self.assertEqual(len(windows_alerts), 2)
        db.close()

    def test_acknowledged_alerts_not_auto_resolved(self):
        """12. An alert explicitly acknowledged by an operator is NOT auto-resolved by subsequent recovery."""
        db = self.TestingSessionLocal()

        mock_svc = AsyncMock()
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 50.0,
                "strategy": "HGB",
                "predictions": {"5m": 85.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
            },
        }

        import asyncio
        asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        alert = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE).first()
        alert.status = AlertStatus.ACKNOWLEDGED.value
        db.commit()

        # Recovery forecast
        mock_svc.get_forecasts.return_value = {
            "model_status": "fresh",
            "is_stale": False,
            "host": "ubuntu",
            "cpu": {
                "current": 40.0,
                "strategy": "HGB",
                "predictions": {"5m": 50.0, "15m": 50.0, "30m": 50.0, "1h": 50.0, "3h": 50.0},
            },
        }

        res = asyncio.run(evaluate_predictive_alerts(db=db, host="ubuntu", forecast_service=mock_svc))
        self.assertEqual(res["alerts_resolved"], 0)

        db.refresh(alert)
        self.assertEqual(alert.status, AlertStatus.ACKNOWLEDGED.value)
        db.close()


class TestNotificationDispatcher(TestPredictiveAlertsBase):
    """Tests notification persistence and safe external delivery."""

    def test_notification_persists_to_database(self):
        """9. Notification persists to DB safely."""
        db = self.TestingSessionLocal()
        import asyncio

        res = asyncio.run(
            dispatch_notification(
                db=db,
                target="alert:42",
                message="Test predictive alert notification",
                alert_id=42,
            )
        )

        self.assertTrue(res["persisted"])
        self.assertIsNotNone(res["notification_id"])

        notifs = db.query(Notification).filter(Notification.target == "alert:42").all()
        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].message, "Test predictive alert notification")
        db.close()

    def test_notification_external_webhook_safe_failure(self):
        """9b. Notification external webhook failure is handled safely without raising."""
        db = self.TestingSessionLocal()
        import asyncio

        with patch("app.services.notifications.NOTIFICATION_WEBHOOK_URL", "http://nonexistent-webhook.invalid/hook"):
            res = asyncio.run(
                dispatch_notification(
                    db=db,
                    target="alert:43",
                    message="Webhook failure test",
                )
            )

        # Database record should still be persisted
        self.assertTrue(res["persisted"])
        self.assertFalse(res["delivered_external"])
        db.close()


class TestSchedulerAndAuthorization(TestPredictiveAlertsBase):
    """Tests scheduler lifecycle and API authorization."""

    def test_scheduler_no_duplicate_workers(self):
        """11. Scheduler startup does not create duplicate workers."""
        sched = PredictiveScheduler()
        first_started = sched.start()
        self.assertTrue(first_started)
        self.assertTrue(sched.is_running)

        second_started = sched.start()
        self.assertFalse(second_started)  # Already running

        sched.stop()
        self.assertFalse(sched.is_running)

    def test_manual_evaluation_endpoint_authorization(self):
        """10. Manual evaluation enforces authorization (VIEWER forbidden 403, OPERATOR allowed 200)."""
        # Test VIEWER role
        self.mock_user.role = UserRole.VIEWER.value
        resp_viewer = self.client.post("/api/alerts/evaluate-predictive?host=ubuntu")
        self.assertEqual(resp_viewer.status_code, 403)

        # Test OPERATOR role
        self.mock_user.role = UserRole.OPERATOR.value
        with patch("app.services.predictive_alerts.evaluate_predictive_alerts") as mock_eval:
            mock_eval.return_value = {"status": "success", "alerts_created": 0}
            resp_operator = self.client.post("/api/alerts/evaluate-predictive?host=ubuntu")
            self.assertEqual(resp_operator.status_code, 200)


if __name__ == "__main__":
    unittest.main()
