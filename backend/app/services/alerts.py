from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database.models import Alert, AlertSeverity, AlertStatus


def create_alert(
    db: Session,
    title: str,
    message: str,
    severity: str = AlertSeverity.INFO.value,
    source: str = "system",
    metric: str | None = None,
    server: str | None = None,
) -> Alert:
    alert = Alert(
        title=title,
        message=message,
        severity=severity,
        status=AlertStatus.ACTIVE.value,
        source=source,
        metric=metric,
        server=server,
    )

    db.add(alert)
    db.commit()
    db.refresh(alert)

    return alert


def get_alerts(
    db: Session,
    status: str | None = None,
    severity: str | None = None,
) -> list[Alert]:
    query = db.query(Alert)

    if status:
        query = query.filter(Alert.status == status)

    if severity:
        query = query.filter(Alert.severity == severity)

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