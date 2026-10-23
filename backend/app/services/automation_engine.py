"""
Automation Engine Service for NETRA INTELLIGENCE (Phase 5).

Provides safe, auditable automation execution for predictive alerts and operator diagnostics.
Enforces strict allowlists (LOG_EVENT, COLLECT_DIAGNOSTICS, RECOMMEND_REMEDIATION),
bounds diagnostic outputs, ensures idempotency, and records full audit trails.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.database.models import (
    Alert,
    AuditEvent,
    Automation,
    AutomationRun,
    AutomationStatus,
)
from app.services.ml.loader import normalize_host, KNOWN_HOSTS

logger = logging.getLogger(__name__)

# Concurrency guard: serialize automation evaluations for alerts
_auto_lock: asyncio.Lock | None = None
_auto_lock_loop = None


def _get_auto_lock() -> asyncio.Lock:
    global _auto_lock, _auto_lock_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _auto_lock is None or _auto_lock_loop != current_loop:
        _auto_lock = asyncio.Lock()
        _auto_lock_loop = current_loop
    return _auto_lock

# ── Safe Allowlisted Actions ──────────────────────────────────
ACTION_LOG_EVENT = "LOG_EVENT"
ACTION_COLLECT_DIAGNOSTICS = "COLLECT_DIAGNOSTICS"
ACTION_RECOMMEND_REMEDIATION = "RECOMMEND_REMEDIATION"

ALLOWLISTED_ACTIONS: set[str] = {
    ACTION_LOG_EVENT,
    ACTION_COLLECT_DIAGNOSTICS,
    ACTION_RECOMMEND_REMEDIATION,
}

# Explicitly prohibited automated actions in current safety tier
PROHIBITED_ACTIONS: set[str] = {
    "RESTART_SERVICE",
    "PURGE_CACHE",
    "SCALE_WORKERS",
    "KILL_PROCESS",
    "EXECUTE_SHELL",
    "MODIFY_FIREWALL",
}

SUPPORTED_TRIGGERS: set[str] = {
    "predictive_alert",
    "threshold",
    "anomaly",
    "all",
}


def normalize_action_type(action: str) -> str:
    """Normalize action string to uppercase standard format."""
    return action.strip().upper().replace(" ", "_")


def is_action_allowed(action: str) -> bool:
    """Check if action is in the safe allowlist."""
    norm = normalize_action_type(action)
    return norm in ALLOWLISTED_ACTIONS


import re

def sanitize_text(text: str, max_len: int | None = None) -> str:
    """Sanitizes text to redact credentials and optionally truncate length."""
    if not text:
        return ""
    clean = re.sub(r'(Bearer\s+)[^\s,;]+', r'\1[REDACTED]', text, flags=re.IGNORECASE)
    clean = re.sub(r'((?:password|secret|api_key|token)\s*=\s*)[^\s,;]+', r'\1[REDACTED]', clean, flags=re.IGNORECASE)
    if max_len is not None and len(clean) > max_len:
        return clean[: max_len - 3] + "..."
    return clean


async def execute_action_log_event(
    alert: Alert | None,
    host: str,
    metric: str,
    db: Session,
) -> dict[str, Any]:
    """Action: Persist an audit event and return structured event log."""
    now_iso = datetime.now(timezone.utc).isoformat()
    alert_info = (
        f"Alert #{alert.id} ({alert.severity}): {alert.title}"
        if alert
        else "Manual diagnostic trigger"
    )

    details = {
        "timestamp": now_iso,
        "host": host,
        "metric": metric,
        "alert_id": alert.id if alert else None,
        "alert_title": alert.title if alert else None,
        "alert_source": alert.source if alert else None,
        "action": ACTION_LOG_EVENT,
        "summary": f"Automation event logged for {host} on metric '{metric}'. {alert_info}",
    }

    # Record AuditEvent
    audit = AuditEvent(
        action="AUTOMATION_LOG_EVENT",
        actor="system:automation_engine",
        details=sanitize_text(json.dumps(details, default=str)),
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    return details


async def execute_action_collect_diagnostics(
    alert: Alert | None,
    host: str,
    metric: str,
) -> dict[str, Any]:
    """
    Action: Read-only diagnostic telemetry collection.
    Applies timeouts and bounds output size. Does not run shell commands.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    diag: dict[str, Any] = {
        "timestamp": now_iso,
        "host": host,
        "metric": metric,
        "action": ACTION_COLLECT_DIAGNOSTICS,
        "execution_type": "READ_ONLY_TELEMETRY",
        "live_metrics": {},
        "anomaly_status": {},
        "summary": "",
    }

    # 1. Fetch live metrics from VictoriaMetrics
    try:
        from app.services.victoriametrics import VictoriaMetricsService
        vm = VictoriaMetricsService()
        metrics, _ = await vm.get_current_metrics(host=host)
        if metrics:
            # Bound metrics to key signals only
            key_signals = ["cpu", "memory", "load_1m", "load_5m", "disk", "uptime"]
            diag["live_metrics"] = {
                k: round(float(metrics[k]), 2)
                for k in key_signals
                if k in metrics and isinstance(metrics[k], (int, float))
            }
    except Exception as exc:
        diag["live_metrics_error"] = str(exc)

    # 2. Fetch anomaly status
    try:
        from app.services.ml.anomaly import AnomalyService
        anomaly_svc = AnomalyService()
        anomaly_data = await anomaly_svc.get_anomaly_score(host=host)
        diag["anomaly_status"] = {
            "score": anomaly_data.get("anomaly_score"),
            "severity": anomaly_data.get("severity"),
            "status": anomaly_data.get("model_status"),
        }
    except Exception as exc:
        diag["anomaly_status_error"] = str(exc)

    diag["summary"] = (
        f"Read-only diagnostics for {host}: "
        f"CPU={diag['live_metrics'].get('cpu', 'N/A')}%, "
        f"Mem={diag['live_metrics'].get('memory', 'N/A')}%, "
        f"Load={diag['live_metrics'].get('load_1m', 'N/A')}, "
        f"Anomaly={diag['anomaly_status'].get('score', 'N/A')}"
    )

    return diag


def execute_action_recommend_remediation(
    alert: Alert | None,
    host: str,
    metric: str,
) -> dict[str, Any]:
    """
    Action: Generate structured remediation recommendation for an operator.
    Does NOT automatically execute remediation (safety guarantee).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    rec: dict[str, Any] = {
        "timestamp": now_iso,
        "host": host,
        "metric": metric,
        "action": ACTION_RECOMMEND_REMEDIATION,
        "type": "RECOMMENDATION_ONLY",
        "auto_executed": False,
        "recommendations": [],
        "evidence": {},
        "summary": "",
    }

    if alert:
        rec["evidence"] = {
            "alert_id": alert.id,
            "title": alert.title,
            "severity": alert.severity,
            "message": alert.message,
            "source": alert.source,
        }

    # Generate metric-specific recommendation options for operators
    metric_clean = (metric or "").lower()
    if "cpu" in metric_clean:
        rec["recommendations"] = [
            "Review top CPU-consuming processes (e.g. via htop or process telemetry).",
            "Evaluate thread utilization on worker processes.",
            "If sustained, prepare horizontal workload distribution or pod scaling.",
            "Verify whether scheduled batch jobs or cron tasks are colliding.",
        ]
        rec["summary"] = f"Impending CPU saturation predicted on {host}. Operator review of active process utilization recommended."
    elif "mem" in metric_clean:
        rec["recommendations"] = [
            "Check for potential memory leak patterns in application buffers.",
            "Inspect cache consumption and buffer cache growth.",
            "Plan graceful restart of non-critical caching daemons during maintenance window.",
            "Verify swap usage and OOM-killer log history.",
        ]
        rec["summary"] = f"Impending memory exhaustion predicted on {host}. Operator inspection of buffer allocations recommended."
    else:
        rec["recommendations"] = [
            f"Inspect recent telemetry trends for metric '{metric}' on host {host}.",
            "Verify correlated anomaly scores and system error logs.",
            "Acknowledge the alert if this is expected workload variation.",
        ]
        rec["summary"] = f"Predictive breach warning for '{metric}' on {host}. Manual diagnostic inspection advised."

    return rec


async def run_automation(
    automation: Automation,
    db: Session,
    alert: Alert | None = None,
    target_host: str | None = None,
    manual: bool = False,
    actor: str = "system",
) -> AutomationRun:
    """
    Executes an automation rule and records a persistent AutomationRun lifecycle record.
    Tracks QUEUED -> RUNNING -> SUCCESS / FAILED / SKIPPED.
    """
    host = normalize_host(target_host or (alert.server if alert else "ubuntu")) or "ubuntu"
    metric = alert.metric if alert else "system"
    action_type = normalize_action_type(automation.action_type)

    start_time = datetime.now(timezone.utc)

    # 1. Check if automation is disabled
    if automation.status != AutomationStatus.ENABLED.value and not manual:
        skip_payload = {
            "status": "SKIPPED",
            "reason": "Automation rule is DISABLED",
            "trigger_alert_id": alert.id if alert else None,
            "target_host": host,
            "action": action_type,
            "timestamp": start_time.isoformat(),
        }
        run = AutomationRun(
            automation_id=automation.id,
            status="SKIPPED",
            output=sanitize_text(json.dumps(skip_payload, default=str)),
            created_at=start_time,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    # 2. Check allowlisted action
    if not is_action_allowed(action_type):
        fail_payload = {
            "status": "FAILED",
            "reason": f"Action '{action_type}' is not allowed in current safety tier. Allowed: {sorted(ALLOWLISTED_ACTIONS)}",
            "trigger_alert_id": alert.id if alert else None,
            "target_host": host,
            "action": action_type,
            "timestamp": start_time.isoformat(),
        }
        run = AutomationRun(
            automation_id=automation.id,
            status="FAILED",
            output=sanitize_text(json.dumps(fail_payload, default=str)),
            created_at=start_time,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    # 3. Create initial persistent execution record in RUNNING state
    run = AutomationRun(
        automation_id=automation.id,
        status="RUNNING",
        output=sanitize_text(json.dumps({
            "status": "RUNNING",
            "trigger_alert_id": alert.id if alert else None,
            "target_host": host,
            "action": action_type,
            "start_time": start_time.isoformat(),
        })),
        created_at=start_time,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # 4. Execute action safely
    try:
        output_data: dict[str, Any]
        if action_type == ACTION_LOG_EVENT:
            output_data = await execute_action_log_event(alert, host, metric, db)
        elif action_type == ACTION_COLLECT_DIAGNOSTICS:
            output_data = await execute_action_collect_diagnostics(alert, host, metric)
        elif action_type == ACTION_RECOMMEND_REMEDIATION:
            output_data = execute_action_recommend_remediation(alert, host, metric)
        else:
            raise ValueError(f"Unsupported action: {action_type}")

        finish_time = datetime.now(timezone.utc)
        output_data.update({
            "status": "SUCCESS",
            "trigger_alert_id": alert.id if alert else None,
            "target_host": host,
            "action": action_type,
            "start_time": start_time.isoformat(),
            "finish_time": finish_time.isoformat(),
            "duration_ms": round((finish_time - start_time).total_seconds() * 1000, 2),
            "manual": manual,
            "actor": actor,
        })

        run.status = "SUCCESS"
        run.output = sanitize_text(json.dumps(output_data, default=str))
        db.commit()
        db.refresh(run)

        # Audit consequential operations
        audit = AuditEvent(
            action=f"AUTOMATION_RUN_{action_type}",
            actor=actor,
            details=sanitize_text(
                f"Automation #{automation.id} ('{automation.name}') executed action {action_type} on {host}. Status: SUCCESS."
            ),
            timestamp=finish_time,
        )
        db.add(audit)
        db.commit()

        logger.info(
            "Automation #%d ('%s') completed successfully (run #%d) for host '%s'",
            automation.id, automation.name, run.id, host,
        )
        return run

    except Exception as exc:
        finish_time = datetime.now(timezone.utc)
        error_msg = sanitize_text(str(exc))
        logger.error(
            "Automation #%d execution failed: %s",
            automation.id, error_msg,
        )
        error_payload = {
            "status": "FAILED",
            "error": error_msg,
            "trigger_alert_id": alert.id if alert else None,
            "target_host": host,
            "action": action_type,
            "start_time": start_time.isoformat(),
            "finish_time": finish_time.isoformat(),
            "manual": manual,
        }
        run.status = "FAILED"
        run.output = sanitize_text(json.dumps(error_payload, default=str))
        db.commit()
        db.refresh(run)
        return run


def is_alert_already_executed_by_automation(
    db: Session,
    automation_id: int,
    alert_id: int,
) -> bool:
    """
    Idempotency check: returns True if an AutomationRun already processed this alert_id
    for this automation.
    """
    search_str = f'"trigger_alert_id": {alert_id}'
    existing = (
        db.query(AutomationRun)
        .filter(
            AutomationRun.automation_id == automation_id,
            AutomationRun.output.contains(search_str),
        )
        .first()
    )
    return existing is not None


async def trigger_automations_for_predictive_alert(
    alert: Alert,
    db: Session,
) -> list[AutomationRun]:
    """
    Matches an incoming predictive alert against enabled automations and executes them with concurrency lock.
    """
    async with _get_auto_lock():
        return await _trigger_automations_for_predictive_alert_internal(alert=alert, db=db)


async def _trigger_automations_for_predictive_alert_internal(
    alert: Alert,
    db: Session,
) -> list[AutomationRun]:
    """
    Internal execution: matches alert against automations and ensures idempotency.
    """
    runs: list[AutomationRun] = []

    # Find automations with trigger_type matching 'predictive_alert' or 'all'
    automations = (
        db.query(Automation)
        .filter(
            Automation.status == AutomationStatus.ENABLED.value,
            Automation.trigger_type.in_(["predictive_alert", "all"]),
        )
        .all()
    )

    if not automations:
        return runs

    for auto in automations:
        # Check idempotency: avoid duplicate runs for same alert
        if is_alert_already_executed_by_automation(db, auto.id, alert.id):
            logger.debug(
                "Skipping duplicate automation trigger for automation #%d on alert #%d",
                auto.id, alert.id,
            )
            continue

        try:
            run = await run_automation(
                automation=auto,
                db=db,
                alert=alert,
                target_host=alert.server,
                manual=False,
                actor="system:predictive_alert",
            )
            runs.append(run)
        except Exception as exc:
            logger.error(
                "Error triggering automation #%d for alert #%d: %s",
                auto.id, alert.id, exc,
            )
            # Never let automation failure block or fail alert persistence

    return runs
