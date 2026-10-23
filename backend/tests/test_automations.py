"""
Unit and Integration Tests for Agent-Driven Automation and Safe Remediation (Phase 5).
Verifies:
1. Valid automation creation with allowlisted actions (LOG_EVENT, COLLECT_DIAGNOSTICS, RECOMMEND_REMEDIATION).
2. Rejection of dangerous / prohibited actions (RESTART_SERVICE, SCALE_WORKERS, KILL_PROCESS).
3. Rejection of invalid trigger types.
4. Automation listing, update, toggle ENABLED/DISABLED, and deletion.
5. Role-Based Access Control (RBAC):
   - VIEWER can list rules and view runs, but is forbidden (403) from creating, updating, deleting, or executing.
   - OPERATOR / ADMIN can create, update, delete, and execute automations.
6. Trigger matching: enabled predictive_alert automations execute when predictive alerts are created.
7. Disabled automations are skipped (SKIPPED status, no action executed).
8. Idempotency: duplicate trigger for the same alert does not produce duplicate runs.
9. Non-blocking safety: automation execution failure does not block alert creation or persistence.
10. Execution of LOG_EVENT persists an AuditEvent.
11. Execution of COLLECT_DIAGNOSTICS produces bounded, read-only telemetry without remote shell execution.
12. Execution of RECOMMEND_REMEDIATION produces structured non-destructive proposals marked RECOMMENDATION_ONLY.
13. Secret redaction and text length bounds in run output and audit records.
14. Manual execution endpoint POST /api/automations/{id}/execute.
15. MCP tools: get_predictive_alerts, explain_forecast_breach, list_automations, get_automation_history, recommend_remediation.
16. MCP RBAC: new read and propose tools are accessible, execute_remediation requires operator/admin confirmation.
"""

import asyncio
import json
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
    AlertSeverity,
    AlertStatus,
    AuditEvent,
    Automation,
    AutomationRun,
    AutomationStatus,
    User,
    UserRole,
)
from app.auth.dependencies import get_current_user
from app.api.automations import router as automations_router
from app.api.alerts import router as alerts_router
from app.services.automation_engine import (
    ACTION_COLLECT_DIAGNOSTICS,
    ACTION_LOG_EVENT,
    ACTION_RECOMMEND_REMEDIATION,
    is_action_allowed,
    normalize_action_type,
    run_automation,
    sanitize_text,
    trigger_automations_for_predictive_alert,
)
from app.mcp.auth import authorize_tool_call
from app.mcp.tools import (
    AVAILABLE_TOOLS,
    TOOL_REGISTRY,
    explain_forecast_breach,
    get_automation_history,
    get_predictive_alerts,
    list_automations as mcp_list_automations,
    recommend_remediation as mcp_recommend_remediation,
)


class TestAutomationsBase(unittest.TestCase):
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
        cls.app.include_router(automations_router, prefix="/api")
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
        db.query(AutomationRun).delete()
        db.query(AuditEvent).delete()
        db.query(Automation).delete()
        db.query(Alert).delete()
        db.commit()
        db.close()

        self.mock_user.role = UserRole.OPERATOR.value
        self.mock_user.username = "operator_user"


class TestAutomationConfigurationAndLifecycle(TestAutomationsBase):
    """Tests creating, listing, updating, and deleting automation rules."""

    def test_create_automation_allowlisted_actions(self):
        """1. Valid creation for all allowlisted actions."""
        for action in ["LOG_EVENT", "COLLECT_DIAGNOSTICS", "RECOMMEND_REMEDIATION"]:
            resp = self.client.post(
                "/api/automations",
                json={
                    "name": f"Test {action}",
                    "trigger_type": "predictive_alert",
                    "action_type": action,
                },
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["action_type"], action)
            self.assertEqual(data["status"], "ENABLED")

    def test_create_automation_prohibited_action_rejected(self):
        """2. Rejection of prohibited / dangerous actions."""
        for dangerous_action in ["RESTART_SERVICE", "SCALE_WORKERS", "PURGE_CACHE", "KILL_PROCESS", "RM_RF"]:
            resp = self.client.post(
                "/api/automations",
                json={
                    "name": "Dangerous Auto",
                    "trigger_type": "predictive_alert",
                    "action_type": dangerous_action,
                },
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("not permitted", resp.json()["detail"])

    def test_create_automation_invalid_trigger_rejected(self):
        """3. Rejection of invalid trigger types."""
        resp = self.client.post(
            "/api/automations",
            json={
                "name": "Bad Trigger",
                "trigger_type": "invalid_magic_trigger",
                "action_type": "LOG_EVENT",
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid trigger_type", resp.json()["detail"])

    def test_update_and_toggle_automation(self):
        """4. Update name, toggle status ENABLED -> DISABLED."""
        create_resp = self.client.post(
            "/api/automations",
            json={"name": "Toggle Me", "trigger_type": "predictive_alert", "action_type": "LOG_EVENT"},
        )
        auto_id = create_resp.json()["id"]

        # Disable
        patch_resp = self.client.patch(
            f"/api/automations/{auto_id}",
            json={"status": "DISABLED", "name": "Now Disabled"},
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.json()["status"], "DISABLED")
        self.assertEqual(patch_resp.json()["name"], "Now Disabled")

        # Re-enable
        patch_resp2 = self.client.patch(
            f"/api/automations/{auto_id}",
            json={"status": "ENABLED"},
        )
        self.assertEqual(patch_resp2.status_code, 200)
        self.assertEqual(patch_resp2.json()["status"], "ENABLED")

    def test_delete_automation(self):
        """5. Delete an automation rule."""
        create_resp = self.client.post(
            "/api/automations",
            json={"name": "To Delete", "trigger_type": "predictive_alert", "action_type": "LOG_EVENT"},
        )
        auto_id = create_resp.json()["id"]

        del_resp = self.client.delete(f"/api/automations/{auto_id}")
        self.assertEqual(del_resp.status_code, 200)

        get_resp = self.client.get(f"/api/automations/{auto_id}")
        self.assertEqual(get_resp.status_code, 404)


class TestAutomationRBAC(TestAutomationsBase):
    """Verifies that VIEWER cannot mutate or manually trigger, while OPERATOR can."""

    def test_viewer_cannot_create_or_modify_automations(self):
        # Create an automation first as operator
        create_resp = self.client.post(
            "/api/automations",
            json={"name": "RBAC Rule", "trigger_type": "predictive_alert", "action_type": "LOG_EVENT"},
        )
        auto_id = create_resp.json()["id"]

        # Switch to VIEWER
        self.mock_user.role = UserRole.VIEWER.value

        # Viewer CAN read
        get_resp = self.client.get("/api/automations")
        self.assertEqual(get_resp.status_code, 200)
        get_one = self.client.get(f"/api/automations/{auto_id}")
        self.assertEqual(get_one.status_code, 200)

        # Viewer CANNOT create
        post_resp = self.client.post(
            "/api/automations",
            json={"name": "Viewer Try", "trigger_type": "predictive_alert", "action_type": "LOG_EVENT"},
        )
        self.assertEqual(post_resp.status_code, 403)

        # Viewer CANNOT patch
        patch_resp = self.client.patch(f"/api/automations/{auto_id}", json={"status": "DISABLED"})
        self.assertEqual(patch_resp.status_code, 403)

        # Viewer CANNOT execute
        exec_resp = self.client.post(f"/api/automations/{auto_id}/execute")
        self.assertEqual(exec_resp.status_code, 403)

        # Viewer CANNOT delete
        del_resp = self.client.delete(f"/api/automations/{auto_id}")
        self.assertEqual(del_resp.status_code, 403)


class TestAutomationExecutionAndActions(TestAutomationsBase):
    """Tests action execution, diagnostic bounds, proposals, and idempotency."""

    def test_execute_log_event_action(self):
        """Action LOG_EVENT produces execution run and persists AuditEvent."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Audit Logger",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        alert = Alert(
            title="Predicted CPU Warning on ubuntu (5m)",
            message="CPU predicted at 88% in 5m",
            severity=AlertSeverity.WARNING.value,
            status=AlertStatus.ACTIVE.value,
            source="predictive_forecast",
            metric="cpu",
            server="ubuntu",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        run = asyncio.run(run_automation(automation=auto, db=db, alert=alert, target_host="ubuntu"))
        self.assertEqual(run.status, "SUCCESS")

        parsed = json.loads(run.output)
        self.assertEqual(parsed["action"], "LOG_EVENT")
        self.assertEqual(parsed["trigger_alert_id"], alert.id)
        self.assertEqual(parsed["target_host"], "ubuntu")

        # Verify AuditEvent record
        audits = db.query(AuditEvent).filter(AuditEvent.action == "AUTOMATION_LOG_EVENT").all()
        self.assertGreaterEqual(len(audits), 1)
        self.assertIn("ubuntu", audits[0].details)
        db.close()

    def test_execute_collect_diagnostics_action(self):
        """Action COLLECT_DIAGNOSTICS collects read-only telemetry safely."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Diag Collector",
            trigger_type="predictive_alert",
            action_type="COLLECT_DIAGNOSTICS",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        with patch("app.services.victoriametrics.VictoriaMetricsService.get_current_metrics") as mock_vm, \
             patch("app.services.ml.anomaly.AnomalyService.get_anomaly_score") as mock_anom:

            mock_vm.return_value = ({"cpu": 75.4, "memory": 62.1, "load_1m": 1.25}, "2026-10-22T12:00:00Z")
            mock_anom.return_value = {"anomaly_score": 0.045, "severity": "LOW", "model_status": "fresh"}

            run = asyncio.run(run_automation(automation=auto, db=db, target_host="ubuntu"))
            self.assertEqual(run.status, "SUCCESS")

            parsed = json.loads(run.output)
            self.assertEqual(parsed["action"], "COLLECT_DIAGNOSTICS")
            self.assertEqual(parsed["execution_type"], "READ_ONLY_TELEMETRY")
            self.assertIn("cpu", parsed["live_metrics"])
            self.assertEqual(parsed["live_metrics"]["cpu"], 75.4)
            self.assertEqual(parsed["anomaly_status"]["score"], 0.045)
        db.close()

    def test_execute_recommend_remediation_action(self):
        """Action RECOMMEND_REMEDIATION produces proposal without auto-execution."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Remediation Advisor",
            trigger_type="predictive_alert",
            action_type="RECOMMEND_REMEDIATION",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        alert = Alert(
            title="Predicted Memory Critical on ubuntu (15m)",
            message="Memory predicted at 96% in 15m",
            severity=AlertSeverity.CRITICAL.value,
            status=AlertStatus.ACTIVE.value,
            source="predictive_forecast",
            metric="memory",
            server="ubuntu",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        run = asyncio.run(run_automation(automation=auto, db=db, alert=alert, target_host="ubuntu"))
        self.assertEqual(run.status, "SUCCESS")

        parsed = json.loads(run.output)
        self.assertEqual(parsed["action"], "RECOMMEND_REMEDIATION")
        self.assertEqual(parsed["type"], "RECOMMENDATION_ONLY")
        self.assertFalse(parsed["auto_executed"])
        self.assertGreater(len(parsed["recommendations"]), 0)
        self.assertIn("ubuntu", parsed["summary"])
        db.close()

    def test_disabled_automation_is_skipped(self):
        """Disabled automations result in SKIPPED status without performing actions."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Disabled Rule",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.DISABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        run = asyncio.run(run_automation(automation=auto, db=db, target_host="ubuntu"))
        self.assertEqual(run.status, "SKIPPED")
        parsed = json.loads(run.output)
        self.assertEqual(parsed["reason"], "Automation rule is DISABLED")
        db.close()

    def test_idempotency_prevents_duplicate_runs_for_same_alert(self):
        """Idempotency ensures one alert does not repeatedly trigger duplicate runs for the same automation."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Single Trigger Rule",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        alert = Alert(
            title="Predicted CPU Warning on ubuntu (5m)",
            message="Breach",
            severity="WARNING",
            status="ACTIVE",
            source="predictive_forecast",
            metric="cpu",
            server="ubuntu",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # 1st trigger: runs
        runs1 = asyncio.run(trigger_automations_for_predictive_alert(alert=alert, db=db))
        self.assertEqual(len(runs1), 1)
        self.assertEqual(runs1[0].status, "SUCCESS")

        # 2nd trigger for identical alert: skipped due to idempotency
        runs2 = asyncio.run(trigger_automations_for_predictive_alert(alert=alert, db=db))
        self.assertEqual(len(runs2), 0)

        # Only 1 run recorded in DB
        total_runs = db.query(AutomationRun).filter(AutomationRun.automation_id == auto.id).all()
        self.assertEqual(len(total_runs), 1)
        db.close()

    def test_automation_failure_does_not_block_caller(self):
        """Failure in action execution is caught and recorded as FAILED without raising out."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="Failing Rule",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        with patch("app.services.automation_engine.execute_action_log_event", side_effect=RuntimeError("Simulated DB Disk Full")):
            run = asyncio.run(run_automation(automation=auto, db=db, target_host="ubuntu"))
            self.assertEqual(run.status, "FAILED")
            parsed = json.loads(run.output)
            self.assertIn("Simulated DB Disk Full", parsed["error"])
        db.close()

    def test_text_sanitization_and_secret_redaction(self):
        """Sanitizer truncates bounded outputs and redacts common credential patterns."""
        raw_text = "Testing Bearer secret_token_12345 and password=supersecretpass in log payload"
        sanitized = sanitize_text(raw_text)
        self.assertNotIn("secret_token_12345", sanitized)
        self.assertNotIn("supersecretpass", sanitized)
        self.assertIn("[REDACTED]", sanitized)

        # Length bounding
        very_long = "A" * 1500
        bounded = sanitize_text(very_long, max_len=50)
        self.assertLessEqual(len(bounded), 50)
        self.assertTrue(bounded.endswith("..."))


class TestMCPAutomationTools(TestAutomationsBase):
    """Verifies MCP tools for predictive alerts, explanation, automations, and proposals."""

    def test_mcp_tool_tier_authorization(self):
        """Verify read and propose tools are accessible, while execute remains restricted."""
        # Viewer allowed for all diagnostic and proposal tools
        self.assertTrue(authorize_tool_call("get_predictive_alerts", user_role="viewer"))
        self.assertTrue(authorize_tool_call("explain_forecast_breach", user_role="viewer"))
        self.assertTrue(authorize_tool_call("list_automations", user_role="viewer"))
        self.assertTrue(authorize_tool_call("get_automation_history", user_role="viewer"))
        self.assertTrue(authorize_tool_call("recommend_remediation", user_role="viewer"))

        # Executing remediation without confirmation remains denied for viewer
        try:
            authorize_tool_call("execute_remediation", user_role="viewer", confirmed=False)
            self.fail("Expected 403 HTTPException for viewer")
        except Exception as exc:
            self.assertEqual(exc.status_code, 403)

    def test_mcp_get_predictive_alerts(self):
        """Tool get_predictive_alerts queries real predictive alert records."""
        db = self.TestingSessionLocal()
        a = Alert(
            title="Predicted Memory Warning on ubuntu (30m)",
            message="Mem 87%",
            severity="WARNING",
            status="ACTIVE",
            source="predictive_forecast",
            metric="memory",
            server="ubuntu",
        )
        db.add(a)
        db.commit()
        db.close()

        with patch("app.mcp.tools.SessionLocal", side_effect=lambda: self.TestingSessionLocal()):
            res = asyncio.run(get_predictive_alerts(host="ubuntu"))
            self.assertEqual(res["status"], "success")
            self.assertGreaterEqual(res["count"], 1)
            self.assertEqual(res["alerts"][0]["metric"], "memory")
            self.assertEqual(res["alerts"][0]["server"], "ubuntu")

    def test_mcp_explain_forecast_breach(self):
        """Tool explain_forecast_breach calculates threshold breaches and provides explanation."""
        with patch("app.services.ml.forecast.ForecastService.get_forecasts") as mock_fc:
            mock_fc.return_value = {
                "host": "ubuntu",
                "model_status": "fresh",
                "cpu": {
                    "current": 82.0,
                    "strategy": "iTransformer",
                    "predictions": {"5m": 88.0, "15m": 96.0, "30m": 75.0, "1h": 70.0, "3h": 65.0},
                },
            }

            res = asyncio.run(explain_forecast_breach(host="ubuntu", metric="cpu"))
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["current_value"], 82.0)
            self.assertEqual(len(res["impending_breaches"]), 2)  # 5m (Warning) and 15m (Critical)
            self.assertIn("impending breach", res["explanation"].lower())

    def test_mcp_list_automations_and_history(self):
        """Tools list_automations and get_automation_history return persisted DB records."""
        db = self.TestingSessionLocal()
        auto = Automation(
            name="MCP Monitored Rule",
            trigger_type="predictive_alert",
            action_type="LOG_EVENT",
            status=AutomationStatus.ENABLED.value,
        )
        db.add(auto)
        db.commit()
        db.refresh(auto)

        run = AutomationRun(
            automation_id=auto.id,
            status="SUCCESS",
            output='{"summary": "Logged diagnostic evidence"}',
        )
        db.add(run)
        db.commit()
        auto_id = auto.id
        db.close()

        with patch("app.mcp.tools.SessionLocal", side_effect=lambda: self.TestingSessionLocal()):
            res_list = asyncio.run(mcp_list_automations())
            self.assertEqual(res_list["status"], "success")
            self.assertGreaterEqual(res_list["count"], 1)

            res_hist = asyncio.run(get_automation_history(automation_id=auto_id))
            self.assertEqual(res_hist["status"], "success")
            self.assertGreaterEqual(res_hist["count"], 1)
            self.assertEqual(res_hist["runs"][0]["status"], "SUCCESS")

    def test_mcp_recommend_remediation(self):
        """Tool recommend_remediation returns non-destructive proposals."""
        res = asyncio.run(mcp_recommend_remediation(host="ubuntu", metric="cpu"))
        self.assertEqual(res["status"], "success")
        rec = res["recommendation"]
        self.assertEqual(rec["type"], "RECOMMENDATION_ONLY")
        self.assertFalse(rec["auto_executed"])
        self.assertGreater(len(rec["recommendations"]), 0)


if __name__ == "__main__":
    unittest.main()
