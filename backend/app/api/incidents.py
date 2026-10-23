from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.database import get_db
from app.database.models import (
    Alert,
    Incident,
    IncidentStatus,
    User,
    UserRole,
)
from app.schemas.incidents import IncidentCreate, IncidentUpdate, IncidentResponse

def require_operator(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role not in (
        UserRole.ADMIN.value,
        UserRole.OPERATOR.value,
    ):
        raise HTTPException(
            status_code=403,
            detail="Operator access required",
        )

    return current_user


router = APIRouter(
    prefix="/incidents",
    tags=["Incidents"],
)


@router.post(
    "",
    response_model=IncidentResponse,
)
def create_incident(
    data: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    if data.alert_id is not None:
        alert = db.query(Alert).filter(Alert.id == data.alert_id).first()

        if not alert:
            raise HTTPException(
                status_code=404,
                detail="Alert not found",
            )

    incident = Incident(
        title=data.title,
        description=data.description,
        severity=data.severity,
        server=data.server,
        alert_id=data.alert_id,
        status=IncidentStatus.OPEN.value,
    )

    db.add(incident)
    db.commit()
    db.refresh(incident)

    return incident

@router.patch(
    "/{incident_id}",
    response_model=IncidentResponse,
)
def update_incident(
    incident_id: int,
    data: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    if data.title is not None:
        incident.title = data.title

    if data.description is not None:
        incident.description = data.description

    if data.severity is not None:
        incident.severity = data.severity

    if data.status is not None:
        incident.status = data.status
        if data.status == IncidentStatus.ACKNOWLEDGED.value and not incident.acknowledged_at:
            incident.acknowledged_at = datetime.now(timezone.utc)
        elif data.status == IncidentStatus.RESOLVED.value and not incident.resolved_at:
            incident.resolved_at = datetime.now(timezone.utc)

    if data.server is not None:
        incident.server = data.server

    db.commit()
    db.refresh(incident)

    return incident


@router.get(
    "",
    response_model=list[IncidentResponse],
)
def list_incidents(
    status: str | None = None,
    severity: str | None = None,
    server: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Incident)
    if status:
        query = query.filter(Incident.status == status)
    if severity:
        query = query.filter(Incident.severity == severity)
    if server:
        query = query.filter(Incident.server == server)
    return (
        query
        .order_by(Incident.created_at.desc())
        .all()
    )


@router.get(
    "/{incident_id}",
    response_model=IncidentResponse,
)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    return incident


@router.delete(
    "/{incident_id}",
)
def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    db.delete(incident)
    db.commit()

    return {
        "message": "Incident deleted successfully",
        "incident_id": incident_id,
    }


@router.post(
    "/{incident_id}/acknowledge",
    response_model=IncidentResponse,
)
def acknowledge_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    incident.status = IncidentStatus.ACKNOWLEDGED.value
    incident.acknowledged_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(incident)

    return incident


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentResponse,
)
def resolve_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    incident.status = IncidentStatus.RESOLVED.value
    incident.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(incident)

    return incident