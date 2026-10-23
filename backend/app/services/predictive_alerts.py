"""
Predictive Forecast Alert Evaluation Service

Evaluates forecasts from the ForecastService for supported hosts and metrics,
creates predictive alerts when thresholds are breached, deduplicates repeated
evaluations, auto-resolves recovered predictions, and persists notifications.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database.models import Alert, AlertRule, AlertSeverity, AlertStatus
from app.services.alerts import create_alert
from app.services.ml.loader import normalize_host, KNOWN_HOSTS
from app.services.notifications import dispatch_notification

logger = logging.getLogger(__name__)

# Concurrency guard: serialize predictive evaluations within the same process
_eval_lock: asyncio.Lock | None = None
_eval_lock_loop = None


def _get_eval_lock() -> asyncio.Lock:
    global _eval_lock, _eval_lock_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _eval_lock is None or _eval_lock_loop != current_loop:
        _eval_lock = asyncio.Lock()
        _eval_lock_loop = current_loop
    return _eval_lock

# ── Source identifier for predictive alerts ────────────────────
PREDICTIVE_SOURCE = "predictive_forecast"

# ── Metrics evaluated for predictive alerting ─────────────────
# Maps forecast response key → human-readable label
PREDICTIVE_METRICS: dict[str, str] = {
    "cpu": "CPU Utilization",
    "memory": "Memory Utilization",
}

# ── Forecast horizons produced by the ForecastService ─────────
FORECAST_HORIZONS: list[str] = ["5m", "15m", "30m", "1h", "3h"]

# ── Default predictive thresholds (configurable via env) ──────
# Override with PREDICTIVE_CPU_WARNING, PREDICTIVE_CPU_CRITICAL,
# PREDICTIVE_MEMORY_WARNING, PREDICTIVE_MEMORY_CRITICAL
DEFAULT_PREDICTIVE_THRESHOLDS: dict[str, dict[str, float]] = {
    "cpu": {
        "warning": float(os.getenv("PREDICTIVE_CPU_WARNING", "80.0")),
        "critical": float(os.getenv("PREDICTIVE_CPU_CRITICAL", "95.0")),
    },
    "memory": {
        "warning": float(os.getenv("PREDICTIVE_MEMORY_WARNING", "85.0")),
        "critical": float(os.getenv("PREDICTIVE_MEMORY_CRITICAL", "95.0")),
    },
}


def _dedup_key(host: str, metric: str, horizon: str) -> str:
    """Generate a stable deduplication identity for a predictive alert."""
    return f"{PREDICTIVE_SOURCE}:{host}:{metric}:{horizon}"


def _find_existing_predictive_alert(
    db: Session,
    host: str,
    metric: str,
    horizon: str,
) -> Alert | None:
    """
    Find an existing active or acknowledged predictive alert matching the
    deduplication dimensions: source, server, metric, and horizon in title.
    """
    return (
        db.query(Alert)
        .filter(
            Alert.source == PREDICTIVE_SOURCE,
            Alert.server == host,
            Alert.metric == metric,
            Alert.status.in_([AlertStatus.ACTIVE.value, AlertStatus.ACKNOWLEDGED.value]),
            Alert.title.contains(f"({horizon})"),
        )
        .first()
    )


def _get_applicable_thresholds(db: Session, host: str, metric: str) -> dict[str, float]:
    """
    Retrieves thresholds from configured database AlertRules if present,
    falling back to DEFAULT_PREDICTIVE_THRESHOLDS.
    """
    thresholds = dict(DEFAULT_PREDICTIVE_THRESHOLDS.get(metric, {"warning": 80.0, "critical": 95.0}))

    try:
        # Check if there is an enabled user-defined rule for this metric and host
        matching_rules = (
            db.query(AlertRule)
            .filter(
                AlertRule.enabled == True,
                AlertRule.metric == metric,
                (AlertRule.host == host) | (AlertRule.host == None),
            )
            .all()
        )
        for r in matching_rules:
            sev = str(r.severity).upper()
            if sev == AlertSeverity.CRITICAL.value:
                thresholds["critical"] = float(r.threshold)
            elif sev == AlertSeverity.WARNING.value:
                thresholds["warning"] = float(r.threshold)
    except Exception as exc:
        logger.debug("Using default predictive thresholds (rule lookup: %s)", exc)

    return thresholds


def _determine_severity(value: float, thresholds: dict[str, float]) -> str | None:
    """
    Determine severity based on predicted value against thresholds.
    Returns None if no threshold is breached.
    """
    if value >= thresholds["critical"]:
        return AlertSeverity.CRITICAL.value
    elif value >= thresholds["warning"]:
        return AlertSeverity.WARNING.value
    return None


async def evaluate_predictive_alerts(
    db: Session,
    host: str | None = None,
    forecast_service=None,
) -> dict:
    """
    Evaluate predictive alerts for one or all supported hosts with concurrency lock.
    """
    async with _get_eval_lock():
        return await _evaluate_predictive_alerts_internal(
            db=db,
            host=host,
            forecast_service=forecast_service,
        )


async def _evaluate_predictive_alerts_internal(
    db: Session,
    host: str | None = None,
    forecast_service=None,
) -> dict:
    """
    Evaluate predictive alerts for one or all supported hosts.

    For each host × metric × horizon:
    1. Obtain genuine forecast from ForecastService.
    2. Check predicted value against applicable thresholds.
    3. Create or update predictive alert if threshold is breached.
    4. Auto-resolve stale predictive alerts when forecast recovers.
    5. Persist notification records for new alerts and dispatch external webhook if configured.

    Returns a summary dict with created, updated, resolved, and skipped counts.
    """
    from app.services.ml.forecast import ForecastService

    if forecast_service is None:
        forecast_service = ForecastService()

    # Determine target hosts
    if host:
        canonical = normalize_host(host)
        if canonical is None:
            logger.warning("Predictive alert evaluation requested for unknown host: '%s'", host)
            return {"status": "error", "detail": f"Unknown host: {host}", "hosts_evaluated": []}
        target_hosts = [canonical]
    else:
        target_hosts = list(KNOWN_HOSTS)

    result = {
        "status": "success",
        "hosts_evaluated": target_hosts,
        "alerts_created": 0,
        "alerts_updated": 0,
        "alerts_resolved": 0,
        "alerts_skipped": 0,
        "notifications_created": 0,
        "details": [],
    }

    for eval_host in target_hosts:
        try:
            forecasts = await forecast_service.get_forecasts(host=eval_host)
        except Exception as exc:
            logger.error(
                "Failed to obtain forecasts for host '%s' during predictive evaluation: %s",
                eval_host, exc,
            )
            result["details"].append({
                "host": eval_host,
                "status": "forecast_error",
                "detail": str(exc),
            })
            # Do NOT auto-resolve existing alerts on forecast failure
            continue

        model_status = forecasts.get("model_status", "unavailable")

        for metric, label in PREDICTIVE_METRICS.items():
            metric_data = forecasts.get(metric)
            if not metric_data or not isinstance(metric_data, dict):
                result["alerts_skipped"] += 1
                continue

            predictions = metric_data.get("predictions")
            if not predictions or not isinstance(predictions, dict):
                result["alerts_skipped"] += 1
                continue

            strategy = metric_data.get("strategy", "unknown")
            thresholds = _get_applicable_thresholds(db, eval_host, metric)

            for horizon in FORECAST_HORIZONS:
                predicted_value = predictions.get(horizon)
                if predicted_value is None:
                    result["alerts_skipped"] += 1
                    continue

                try:
                    predicted_value = float(predicted_value)
                except (TypeError, ValueError):
                    result["alerts_skipped"] += 1
                    continue

                # Skip persistence_fallback predictions — these are not genuine model outputs
                if strategy == "persistence_fallback":
                    result["alerts_skipped"] += 1
                    continue

                severity = _determine_severity(predicted_value, thresholds)
                existing = _find_existing_predictive_alert(db, eval_host, metric, horizon)

                if severity is not None:
                    # Threshold breached — create or update alert
                    threshold_val = (
                        thresholds["critical"] if severity == AlertSeverity.CRITICAL.value
                        else thresholds["warning"]
                    )

                    alert_title = (
                        f"Predicted {label} {severity} on {eval_host} ({horizon})"
                    )
                    alert_message = (
                        f"Forecast model ({strategy}) predicts {label} on '{eval_host}' "
                        f"will reach {predicted_value:.1f}% in {horizon} "
                        f"(threshold: {threshold_val:.1f}%). "
                        f"Model status: {model_status}."
                    )

                    if existing:
                        # Update existing alert context if severity or value changed
                        changed = False
                        if existing.severity != severity:
                            existing.severity = severity
                            changed = True
                        if existing.message != alert_message:
                            existing.message = alert_message
                            changed = True
                        if existing.title != alert_title:
                            existing.title = alert_title
                            changed = True

                        if changed:
                            db.commit()
                            db.refresh(existing)
                            result["alerts_updated"] += 1
                            result["details"].append({
                                "host": eval_host,
                                "metric": metric,
                                "horizon": horizon,
                                "action": "updated",
                                "alert_id": existing.id,
                                "predicted_value": predicted_value,
                                "severity": severity,
                            })
                        else:
                            result["alerts_skipped"] += 1
                    else:
                        # Create new predictive alert
                        alert = create_alert(
                            db=db,
                            title=alert_title,
                            message=alert_message,
                            severity=severity,
                            source=PREDICTIVE_SOURCE,
                            metric=metric,
                            server=eval_host,
                        )
                        result["alerts_created"] += 1
                        result["details"].append({
                            "host": eval_host,
                            "metric": metric,
                            "horizon": horizon,
                            "action": "created",
                            "alert_id": alert.id,
                            "predicted_value": predicted_value,
                            "severity": severity,
                        })

                        # Dispatch notification via Dispatcher
                        try:
                            dispatch_res = await dispatch_notification(
                                db=db,
                                target=f"alert:{alert.id}",
                                message=(
                                    f"[{severity}] {alert_title}: "
                                    f"{label} predicted at {predicted_value:.1f}% "
                                    f"in {horizon} on {eval_host}"
                                ),
                                alert_id=alert.id,
                                metadata={
                                    "host": eval_host,
                                    "metric": metric,
                                    "horizon": horizon,
                                    "predicted_value": predicted_value,
                                    "threshold": threshold_val,
                                },
                            )
                            if dispatch_res.get("persisted"):
                                result["notifications_created"] += 1
                        except Exception as notify_exc:
                            logger.error(
                                "Failed to dispatch notification for alert %d: %s",
                                alert.id, notify_exc,
                            )
                            # Alert remains usable even if notification fails

                        # Trigger matching automations (non-blocking, failure-safe)
                        try:
                            from app.services.automation_engine import trigger_automations_for_predictive_alert
                            await trigger_automations_for_predictive_alert(alert=alert, db=db)
                        except Exception as auto_exc:
                            logger.error(
                                "Failed to trigger automations for alert %d: %s",
                                alert.id, auto_exc,
                            )
                else:
                    # No threshold breach — auto-resolve existing predictive alert
                    if existing and existing.status == AlertStatus.ACTIVE.value:
                        existing.status = AlertStatus.RESOLVED.value
                        existing.resolved_at = datetime.now(timezone.utc)
                        db.commit()
                        db.refresh(existing)
                        result["alerts_resolved"] += 1
                        result["details"].append({
                            "host": eval_host,
                            "metric": metric,
                            "horizon": horizon,
                            "action": "auto_resolved",
                            "alert_id": existing.id,
                            "predicted_value": predicted_value,
                        })
                    # Do NOT auto-resolve ACKNOWLEDGED alerts — operator explicitly acknowledged

    return result
