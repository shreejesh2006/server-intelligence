import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database.models import Alert, AlertSeverity, AlertStatus
from app.services.victoriametrics import normalize_host, VictoriaMetricsService
from app.services.ml.anomaly import AnomalyService

logger = logging.getLogger(__name__)


def create_alert(
    db: Session,
    title: str,
    message: str,
    severity: str = AlertSeverity.INFO.value,
    source: str = "system",
    metric: str | None = None,
    server: str | None = None,
) -> Alert:
    canonical_server = normalize_host(server) if server else None

    alert = Alert(
        title=title,
        message=message,
        severity=severity,
        status=AlertStatus.ACTIVE.value,
        source=source,
        metric=metric,
        server=canonical_server or server,
    )

    db.add(alert)
    db.commit()
    db.refresh(alert)

    return alert


def get_alerts(
    db: Session,
    status: str | None = None,
    severity: str | None = None,
    server: str | None = None,
) -> list[Alert]:
    query = db.query(Alert)

    if status:
        query = query.filter(Alert.status == status)

    if severity:
        query = query.filter(Alert.severity == severity)

    if server:
        canonical = normalize_host(server)
        query = query.filter(
            (Alert.server == canonical) | (Alert.server == server)
        )

    return query.order_by(Alert.created_at.desc()).all()


def get_alert(
    db: Session,
    alert_id: int,
) -> Alert | None:
    return db.query(Alert).filter(Alert.id == alert_id).first()


def acknowledge_alert(
    db: Session,
    alert_id: int,
) -> Alert | None:
    alert = get_alert(db, alert_id)

    if alert is None:
        return None

    alert.status = AlertStatus.ACKNOWLEDGED.value
    alert.acknowledged_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(alert)

    return alert


def resolve_alert(
    db: Session,
    alert_id: int,
) -> Alert | None:
    alert = get_alert(db, alert_id)

    if alert is None:
        return None

    alert.status = AlertStatus.RESOLVED.value
    alert.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(alert)

    return alert


async def evaluate_host_alerts(
    db: Session,
    host: str,
    anomaly_service: AnomalyService | None = None,
    victoria_service: VictoriaMetricsService | None = None,
) -> list[Alert]:
    """
    Evaluates real threshold rules and Isolation Forest anomalies for a specific host.
    Uses existing host-aware ML metadata without fabricating scores or assuming fake telemetry.
    """
    canonical = normalize_host(host)
    if not canonical:
        logger.warning("Alert evaluation requested for invalid or unnormalized host: '%s'", host)
        return []

    created_alerts = []
    if anomaly_service is None:
        anomaly_service = AnomalyService()

    if victoria_service is None:
        victoria_service = VictoriaMetricsService()

    # 1. Evaluate Live Metrics Threshold Breaches (No telemetry fabrication)
    try:
        live_metrics, _ = await victoria_service.get_current_metrics(host=canonical)

        cpu_raw = live_metrics.get("cpu")
        if cpu_raw is None:
            logger.info("Skipping CPU threshold evaluation for host '%s': CPU metric unavailable", canonical)
        else:
            cpu_val = float(cpu_raw)
            if cpu_val > 85.0:
                existing = (
                    db.query(Alert)
                    .filter(
                        Alert.server == canonical,
                        Alert.metric == "cpu",
                        Alert.status == AlertStatus.ACTIVE.value,
                    )
                    .first()
                )
                if not existing:
                    a = create_alert(
                        db=db,
                        title=f"High CPU Utilization ({cpu_val:.1f}%) on {canonical}",
                        message=f"Host '{canonical}' CPU load is {cpu_val:.1f}%, exceeding threshold of 85%.",
                        severity=AlertSeverity.CRITICAL.value if cpu_val > 95.0 else AlertSeverity.WARNING.value,
                        source="threshold_monitor",
                        metric="cpu",
                        server=canonical,
                    )
                    created_alerts.append(a)

        mem_raw = live_metrics.get("memory")
        if mem_raw is None:
            logger.info("Skipping Memory threshold evaluation for host '%s': Memory metric unavailable", canonical)
        else:
            mem_val = float(mem_raw)
            if mem_val > 90.0:
                existing = (
                    db.query(Alert)
                    .filter(
                        Alert.server == canonical,
                        Alert.metric == "memory",
                        Alert.status == AlertStatus.ACTIVE.value,
                    )
                    .first()
                )
                if not existing:
                    a = create_alert(
                        db=db,
                        title=f"High Memory Consumption ({mem_val:.1f}%) on {canonical}",
                        message=f"Host '{canonical}' memory usage is {mem_val:.1f}%, exceeding threshold of 90%.",
                        severity=AlertSeverity.CRITICAL.value,
                        source="threshold_monitor",
                        metric="memory",
                        server=canonical,
                    )
                    created_alerts.append(a)
    except Exception as exc:
        logger.warning("Live metrics query failed during alert evaluation for host '%s': %s", canonical, exc)

    # 2. Evaluate Isolation Forest ML Anomaly against ML Productionization contract
    # Contract: model_status is 'fresh', 'stale', or 'unavailable'. Only trigger when usable/fresh and is_anomaly == True.
    try:
        anomaly_res = await anomaly_service.get_anomaly_score(host=canonical)

        model_status = anomaly_res.get("model_status", "unavailable")
        is_stale = anomaly_res.get("is_stale", True)
        is_anomaly = anomaly_res.get("is_anomaly", False)
        score = anomaly_res.get("anomaly_score", 0.0)

        is_usable_model = (model_status == "fresh" or (model_status != "unavailable" and not is_stale))

        if is_usable_model and is_anomaly:
            existing_anomaly = (
                db.query(Alert)
                .filter(
                    Alert.server == canonical,
                    Alert.metric == "anomaly_score",
                    Alert.status == AlertStatus.ACTIVE.value,
                )
                .first()
            )
            if not existing_anomaly:
                primary_reason = anomaly_res.get("primary_reason", f"Multivariate anomaly detected on host '{canonical}'.")
                anomaly_severity = anomaly_res.get("severity", "WARNING").upper()
                if anomaly_severity not in ("INFO", "WARNING", "CRITICAL"):
                    anomaly_severity = "WARNING"

                a = create_alert(
                    db=db,
                    title=f"Isolation Forest Anomaly ({anomaly_severity}) on {canonical}",
                    message=(
                        f"{primary_reason} "
                        f"(Anomaly score: {score:.4f}, Model status: {model_status})."
                    ),
                    severity=anomaly_severity,
                    source="isolation_forest",
                    metric="anomaly_score",
                    server=canonical,
                )
                created_alerts.append(a)

        else:
            if not is_usable_model:
                logger.info(
                    "Skipping anomaly alert trigger for host '%s': Model status is '%s' (is_stale=%s)",
                    canonical, model_status, is_stale
                )
    except Exception as exc:
        logger.warning("ML Anomaly evaluation skipped during alert evaluation for host '%s': %s", canonical, exc)

    return created_alerts
