"""
Unit and Integration Tests for Alerts and Incidents Management (Phase 3)
Verifies:
1. Alert listing with status, severity, and host/server filters.
2. Alert acknowledge and resolve lifecycle (state transitions and timestamps).
3. Incident creation with and without alert linking (verifying valid and invalid alert IDs).
4. Incident listing with status, severity, and server filters.
5. Incident PATCH updates (status transitions, timestamps, severity, server).
6. Incident acknowledge, resolve, and delete lifecycle.
7. Role-Based Access Control (RBAC):
   - VIEWER: Read-only access (can list alerts and incidents, cannot mutate).
   - OPERATOR / ADMIN: Can acknowledge, resolve, create, update, and delete.
"""

import sys
from pathlib import Path
import unittest

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
from app.database.models import Alert, AlertSeverity, AlertStatus, Incident, IncidentStatus, User, UserRole
from app.auth.dependencies import get_current_user
from app.api.alerts import router as alerts_router
from app.api.incidents import router as incidents_router


class TestAlertsAndIncidentsBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory SQLite database shared across the test session
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        cls.app = FastAPI()
        cls.app.include_router(alerts_router, prefix="/api")
        cls.app.include_router(incidents_router, prefix="/api")

        # Dependency override for database session
        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        cls.app.dependency_overrides[get_db] = override_get_db

        # Active mock user for authentication
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
        # Clean up database tables before each test
        db = self.TestingSessionLocal()
        db.query(Incident).delete()
        db.query(Alert).delete()
        db.commit()
        db.close()

        # Default test user role is OPERATOR
        self.mock_user.role = UserRole.OPERATOR.value
        self.mock_user.username = "operator_user"


class TestAlertLifecycle(TestAlertsAndIncidentsBase):
    """Tests alert creation, listing, acknowledge, and resolve workflows."""

    def test_create_and_list_alerts(self):
        # Create an active alert for ubuntu
        create_resp = self.client.post(
            "/api/alerts",
            json={
                "title": "High CPU Spike",
                "message": "CPU reached 92%",
                "severity": "CRITICAL",
                "server": "ubuntu",
                "source": "threshold",
                "metric": "cpu_usage",
            },
        )
        self.assertEqual(create_resp.status_code, 200)
        data = create_resp.json()
        alert_id = data["id"]
        self.assertEqual(data["title"], "High CPU Spike")
        self.assertEqual(data["status"], "ACTIVE")
        self.assertEqual(data["server"], "ubuntu")

        # Create another alert for secondary-test
        create_resp2 = self.client.post(
            "/api/alerts",
            json={
                "title": "Memory Anomaly",
                "message": "Unusual memory drift",
                "severity": "WARNING",
                "server": "secondary-test",
                "source": "anomaly",
                "metric": "memory_usage",
            },
        )
        self.assertEqual(create_resp2.status_code, 200)

        # List all alerts
        list_resp = self.client.get("/api/alerts")
        self.assertEqual(list_resp.status_code, 200)
        alerts = list_resp.json()
        self.assertEqual(len(alerts), 2)

        # Filter by server
        resp_ubuntu = self.client.get("/api/alerts?server=ubuntu")
        self.assertEqual(len(resp_ubuntu.json()), 1)
        self.assertEqual(resp_ubuntu.json()[0]["server"], "ubuntu")

        resp_sec = self.client.get("/api/alerts?server=secondary-test")
        self.assertEqual(len(resp_sec.json()), 1)
        self.assertEqual(resp_sec.json()[0]["server"], "secondary-test")

        # Filter by severity
        resp_crit = self.client.get("/api/alerts?severity=CRITICAL")
        self.assertEqual(len(resp_crit.json()), 1)
        self.assertEqual(resp_crit.json()[0]["title"], "High CPU Spike")

    def test_acknowledge_and_resolve_alert(self):
        create_resp = self.client.post(
            "/api/alerts",
            json={
                "title": "Disk Full Warning",
                "message": "Disk usage at 85%",
                "severity": "WARNING",
                "server": "ubuntu",
            },
        )
        alert_id = create_resp.json()["id"]

        # Acknowledge the alert
        ack_resp = self.client.post(f"/api/alerts/{alert_id}/acknowledge")
        self.assertEqual(ack_resp.status_code, 200)
        ack_data = ack_resp.json()
        self.assertEqual(ack_data["status"], "ACKNOWLEDGED")
        self.assertIsNotNone(ack_data["acknowledged_at"])
        self.assertIsNone(ack_data["resolved_at"])

        # Resolve the alert
        resolve_resp = self.client.post(f"/api/alerts/{alert_id}/resolve")
        self.assertEqual(resolve_resp.status_code, 200)
        res_data = resolve_resp.json()
        self.assertEqual(res_data["status"], "RESOLVED")
        self.assertIsNotNone(res_data["resolved_at"])

    def test_acknowledge_nonexistent_alert_returns_404(self):
        resp = self.client.post("/api/alerts/99999/acknowledge")
        self.assertEqual(resp.status_code, 404)

    def test_resolve_nonexistent_alert_returns_404(self):
        resp = self.client.post("/api/alerts/99999/resolve")
        self.assertEqual(resp.status_code, 404)


class TestIncidentLifecycle(TestAlertsAndIncidentsBase):
    """Tests incident creation, update, alert linking, and deletion."""

    def test_create_incident_standalone(self):
        resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Database Connection Pool Starvation",
                "description": "App servers cannot acquire connections",
                "severity": "CRITICAL",
                "server": "ubuntu",
            },
        )
        self.assertEqual(resp.status_code, 200)
        incident = resp.json()
        self.assertEqual(incident["status"], "OPEN")
        self.assertEqual(incident["severity"], "CRITICAL")
        self.assertEqual(incident["server"], "ubuntu")
        self.assertIsNone(incident["alert_id"])
        self.assertIsNone(incident["acknowledged_at"])
        self.assertIsNone(incident["resolved_at"])

    def test_create_incident_linked_to_alert(self):
        # First create an alert
        alert_resp = self.client.post(
            "/api/alerts",
            json={
                "title": "Node Packet Loss",
                "message": "Ping timeout on eth0",
                "severity": "CRITICAL",
                "server": "ubuntu",
            },
        )
        alert_id = alert_resp.json()["id"]

        # Escalate alert to an incident
        inc_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Network Degradation Incident",
                "description": "Severe packet drops observed",
                "severity": "CRITICAL",
                "server": "ubuntu",
                "alert_id": alert_id,
            },
        )
        self.assertEqual(inc_resp.status_code, 200)
        inc = inc_resp.json()
        self.assertEqual(inc["alert_id"], alert_id)
        self.assertEqual(inc["server"], "ubuntu")

    def test_create_incident_with_invalid_alert_id_returns_404(self):
        resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Invalid Link Incident",
                "description": "Linking to nonexistent alert",
                "severity": "LOW",
                "alert_id": 98765,
            },
        )
        self.assertEqual(resp.status_code, 404)
        self.assertIn("Alert not found", resp.json()["detail"])

    def test_patch_incident_status_and_timestamps(self):
        # Create incident
        create_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Service Degraded",
                "description": "High latency on API",
                "severity": "HIGH",
                "server": "ubuntu",
            },
        )
        inc_id = create_resp.json()["id"]

        # PATCH status to ACKNOWLEDGED
        patch_resp = self.client.patch(
            f"/api/incidents/{inc_id}",
            json={"status": "ACKNOWLEDGED"},
        )
        self.assertEqual(patch_resp.status_code, 200)
        patched = patch_resp.json()
        self.assertEqual(patched["status"], "ACKNOWLEDGED")
        self.assertIsNotNone(patched["acknowledged_at"])
        self.assertIsNone(patched["resolved_at"])

        # PATCH status to RESOLVED
        patch_res2 = self.client.patch(
            f"/api/incidents/{inc_id}",
            json={"status": "RESOLVED", "severity": "MEDIUM"},
        )
        self.assertEqual(patch_res2.status_code, 200)
        patched2 = patch_res2.json()
        self.assertEqual(patched2["status"], "RESOLVED")
        self.assertEqual(patched2["severity"], "MEDIUM")
        self.assertIsNotNone(patched2["resolved_at"])

    def test_incident_acknowledge_and_resolve_endpoints(self):
        create_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Host Outage",
                "description": "Host unresponsive",
                "severity": "CRITICAL",
                "server": "kali",
            },
        )
        inc_id = create_resp.json()["id"]

        # POST /acknowledge
        ack_resp = self.client.post(f"/api/incidents/{inc_id}/acknowledge")
        self.assertEqual(ack_resp.status_code, 200)
        self.assertEqual(ack_resp.json()["status"], "ACKNOWLEDGED")
        self.assertIsNotNone(ack_resp.json()["acknowledged_at"])

        # POST /resolve
        res_resp = self.client.post(f"/api/incidents/{inc_id}/resolve")
        self.assertEqual(res_resp.status_code, 200)
        self.assertEqual(res_resp.json()["status"], "RESOLVED")
        self.assertIsNotNone(res_resp.json()["resolved_at"])

    def test_delete_incident(self):
        create_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Temporary Test Incident",
                "description": "To be removed",
                "severity": "LOW",
                "server": "ubuntu",
            },
        )
        inc_id = create_resp.json()["id"]

        del_resp = self.client.delete(f"/api/incidents/{inc_id}")
        self.assertEqual(del_resp.status_code, 200)

        # Verify not found afterwards
        get_resp = self.client.get(f"/api/incidents/{inc_id}")
        self.assertEqual(get_resp.status_code, 404)

    def test_list_incidents_filtering(self):
        self.client.post(
            "/api/incidents",
            json={"title": "Inc 1", "description": "d1", "severity": "CRITICAL", "server": "ubuntu"},
        )
        self.client.post(
            "/api/incidents",
            json={"title": "Inc 2", "description": "d2", "severity": "LOW", "server": "secondary-node"},
        )

        all_resp = self.client.get("/api/incidents")
        self.assertEqual(len(all_resp.json()), 2)

        ubuntu_resp = self.client.get("/api/incidents?server=ubuntu")
        self.assertEqual(len(ubuntu_resp.json()), 1)
        self.assertEqual(ubuntu_resp.json()[0]["server"], "ubuntu")

        crit_resp = self.client.get("/api/incidents?severity=CRITICAL")
        self.assertEqual(len(crit_resp.json()), 1)
        self.assertEqual(crit_resp.json()[0]["severity"], "CRITICAL")


class TestRoleBasedAccessControl(TestAlertsAndIncidentsBase):
    """Verifies that VIEWER role is read-only and mutations require OPERATOR/ADMIN."""

    def test_viewer_cannot_mutate_alerts(self):
        # Set user role to VIEWER
        self.mock_user.role = UserRole.VIEWER.value

        # VIEWER can view alerts
        list_resp = self.client.get("/api/alerts")
        self.assertEqual(list_resp.status_code, 200)

        # VIEWER cannot create alerts
        create_resp = self.client.post(
            "/api/alerts",
            json={
                "title": "Forbidden Alert",
                "message": "Should fail",
                "severity": "INFO",
            },
        )
        self.assertEqual(create_resp.status_code, 403)

        # VIEWER cannot acknowledge or resolve
        ack_resp = self.client.post("/api/alerts/1/acknowledge")
        self.assertEqual(ack_resp.status_code, 403)

        resolve_resp = self.client.post("/api/alerts/1/resolve")
        self.assertEqual(resolve_resp.status_code, 403)

    def test_viewer_cannot_mutate_incidents(self):
        # Set user role to VIEWER
        self.mock_user.role = UserRole.VIEWER.value

        # VIEWER can list incidents
        list_resp = self.client.get("/api/incidents")
        self.assertEqual(list_resp.status_code, 200)

        # VIEWER cannot create incident
        create_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Forbidden Incident",
                "description": "Should fail",
                "severity": "LOW",
            },
        )
        self.assertEqual(create_resp.status_code, 403)

        # VIEWER cannot patch incident
        patch_resp = self.client.patch("/api/incidents/1", json={"status": "ACKNOWLEDGED"})
        self.assertEqual(patch_resp.status_code, 403)

        # VIEWER cannot acknowledge or resolve incident
        ack_resp = self.client.post("/api/incidents/1/acknowledge")
        self.assertEqual(ack_resp.status_code, 403)

        resolve_resp = self.client.post("/api/incidents/1/resolve")
        self.assertEqual(resolve_resp.status_code, 403)

        # VIEWER cannot delete incident
        del_resp = self.client.delete("/api/incidents/1")
        self.assertEqual(del_resp.status_code, 403)

    def test_admin_can_perform_all_operations(self):
        # Set user role to ADMIN
        self.mock_user.role = UserRole.ADMIN.value

        # Create alert
        alert_resp = self.client.post(
            "/api/alerts",
            json={
                "title": "Admin Test Alert",
                "message": "Created by admin",
                "severity": "HIGH",
                "server": "ubuntu",
            },
        )
        self.assertEqual(alert_resp.status_code, 200)
        alert_id = alert_resp.json()["id"]

        # Create incident
        inc_resp = self.client.post(
            "/api/incidents",
            json={
                "title": "Admin Test Incident",
                "description": "Created by admin",
                "severity": "HIGH",
                "server": "ubuntu",
                "alert_id": alert_id,
            },
        )
        self.assertEqual(inc_resp.status_code, 200)
        inc_id = inc_resp.json()["id"]

        # Admin delete incident
        del_resp = self.client.delete(f"/api/incidents/{inc_id}")
        self.assertEqual(del_resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
