from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import AlertSeverity, AlertStatus
from app.services.alerts import (
    acknowledge_alert,
    create_alert,
    get_alert,
    get_alerts,
    resolve_alert,
)


router = APIRouter(
    prefix="/alerts",
    tags=["alerts"],
)


class AlertCreate(BaseModel):
    title: str
    message: str
    severity: str = AlertSeverity.INFO.value
    source: str = "system"
    metric: str | None = None
    server: str | None = None


class AlertResponse(BaseModel):
    id: int
    title: str
    message: str
    severity: str
    status: str
    source: str
    metric: str | None
    server: str | None
    created_at: str
    acknowledged_at: str | None
    resolved_at: str | None


def alert_to_response(alert):
    return AlertResponse(
        id=alert.id,
        title=alert.title,
        message=alert.message,
        severity=alert.severity,
        status=alert.status,
        source=alert.source,
        metric=alert.metric,
        server=alert.server,
        created_at=alert.created_at.isoformat(),
        acknowledged_at=(
            alert.acknowledged_at.isoformat()
            if alert.acknowledged_at
            else None
        ),
        resolved_at=(
            alert.resolved_at.isoformat()
            if alert.resolved_at
            else None
        ),
    )


@router.post("")
def create_new_alert(
    payload: AlertCreate,
    db: Session = Depends(get_db),
):
    alert = create_alert(
        db=db,
        title=payload.title,
        message=payload.message,
        severity=payload.severity,
        source=payload.source,
        metric=payload.metric,
        server=payload.server,
    )

    return alert_to_response(alert)


@router.get("")
def list_alerts(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    alerts = get_alerts(
        db=db,
        status=status,
        severity=severity,
    )

    return [alert_to_response(alert) for alert in alerts]


@router.get("/{alert_id}")
def read_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = get_alert(db, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return alert_to_response(alert)


@router.post("/{alert_id}/acknowledge")
def acknowledge_existing_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = acknowledge_alert(db, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return alert_to_response(alert)


@router.post("/{alert_id}/resolve")
def resolve_existing_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = resolve_alert(db, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return alert_to_response(alert)