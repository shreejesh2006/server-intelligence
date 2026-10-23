from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.database import get_db
from app.database.models import (
    Alert,
    AuditEvent,
    Automation,
    AutomationRun,
    AutomationStatus,
    User,
    UserRole,
)
from app.schemas.automations import (
    AutomationCreate,
    AutomationExecuteRequest,
    AutomationResponse,
    AutomationRunResponse,
    AutomationUpdate,
)
from app.services.automation_engine import (
    ALLOWLISTED_ACTIONS,
    PROHIBITED_ACTIONS,
    SUPPORTED_TRIGGERS,
    is_action_allowed,
    normalize_action_type,
    run_automation,
    sanitize_text,
)

router = APIRouter(
    prefix="/automations",
    tags=["Automations"],
)


def require_operator(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role not in (
        UserRole.ADMIN.value,
        UserRole.OPERATOR.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator access required",
        )
    return current_user


@router.get(
    "",
    response_model=list[AutomationResponse],
)
def list_automations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all configured automation rules."""
    return (
        db.query(Automation)
        .order_by(Automation.created_at.desc())
        .all()
    )


@router.post(
    "",
    response_model=AutomationResponse,
)
def create_automation(
    data: AutomationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Creates a new automation rule with strict action allowlist validation."""
    action_clean = normalize_action_type(data.action_type)

    if action_clean in PROHIBITED_ACTIONS or not is_action_allowed(action_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Action '{data.action_type}' is not permitted. "
                f"Automated execution is restricted to safe diagnostic/proposal actions: {sorted(ALLOWLISTED_ACTIONS)}"
            ),
        )

    trigger_clean = data.trigger_type.strip().lower()
    if trigger_clean not in SUPPORTED_TRIGGERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid trigger_type. Must be one of: {sorted(SUPPORTED_TRIGGERS)}",
        )

    automation = Automation(
        name=data.name.strip(),
        trigger_type=trigger_clean,
        action_type=action_clean,
        status=AutomationStatus.ENABLED.value,
    )

    db.add(automation)
    db.commit()
    db.refresh(automation)

    # Record audit event
    audit = AuditEvent(
        action="AUTOMATION_CREATED",
        actor=current_user.username,
        details=sanitize_text(f"Created automation #{automation.id} '{automation.name}' with action {action_clean}"),
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    return automation


@router.get(
    "/runs",
    response_model=list[AutomationRunResponse],
)
def list_all_runs(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists recent execution runs across all automations."""
    return (
        db.query(AutomationRun)
        .order_by(AutomationRun.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get(
    "/runs/{run_id}",
    response_model=AutomationRunResponse,
)
def get_run_details(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gets details for a specific automation run."""
    run = db.query(AutomationRun).filter(AutomationRun.id == run_id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation run not found",
        )
    return run


@router.get(
    "/{automation_id}",
    response_model=AutomationResponse,
)
def get_automation(
    automation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gets a single automation rule by ID."""
    automation = (
        db.query(Automation)
        .filter(Automation.id == automation_id)
        .first()
    )
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )
    return automation


@router.patch(
    "/{automation_id}",
    response_model=AutomationResponse,
)
def update_automation(
    automation_id: int,
    data: AutomationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Updates an automation rule (name, status, action_type)."""
    automation = (
        db.query(Automation)
        .filter(Automation.id == automation_id)
        .first()
    )
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    if data.name is not None:
        automation.name = data.name.strip()

    if data.trigger_type is not None:
        trig = data.trigger_type.strip().lower()
        if trig not in SUPPORTED_TRIGGERS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid trigger_type. Must be one of: {sorted(SUPPORTED_TRIGGERS)}",
            )
        automation.trigger_type = trig

    if data.action_type is not None:
        act = normalize_action_type(data.action_type)
        if not is_action_allowed(act):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Action '{act}' is not permitted. Allowed: {sorted(ALLOWLISTED_ACTIONS)}",
            )
        automation.action_type = act

    if data.status is not None:
        stat = data.status.strip().upper()
        if stat not in (AutomationStatus.ENABLED.value, AutomationStatus.DISABLED.value):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status '{data.status}'. Allowed: ENABLED, DISABLED",
            )
        automation.status = stat

    db.commit()
    db.refresh(automation)

    audit = AuditEvent(
        action="AUTOMATION_UPDATED",
        actor=current_user.username,
        details=sanitize_text(f"Updated automation #{automation.id} ('{automation.name}'): status={automation.status}"),
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    return automation


@router.delete(
    "/{automation_id}",
)
def delete_automation(
    automation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Deletes an automation rule."""
    automation = (
        db.query(Automation)
        .filter(Automation.id == automation_id)
        .first()
    )
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    name = automation.name
    db.delete(automation)
    db.commit()

    audit = AuditEvent(
        action="AUTOMATION_DELETED",
        actor=current_user.username,
        details=sanitize_text(f"Deleted automation #{automation_id} ('{name}')"),
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    return {
        "message": "Automation deleted successfully",
        "automation_id": automation_id,
    }


@router.post(
    "/{automation_id}/execute",
    response_model=AutomationRunResponse,
)
async def execute_automation_manually(
    automation_id: int,
    payload: AutomationExecuteRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Manually triggers an automation run for diagnostic / verification purposes."""
    automation = (
        db.query(Automation)
        .filter(Automation.id == automation_id)
        .first()
    )
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    alert: Alert | None = None
    target_host = "ubuntu"

    if payload:
        if payload.alert_id:
            alert = db.query(Alert).filter(Alert.id == payload.alert_id).first()
        if payload.host:
            target_host = payload.host

    run = await run_automation(
        automation=automation,
        db=db,
        alert=alert,
        target_host=target_host,
        manual=True,
        actor=f"operator:{current_user.username}",
    )

    return run


@router.get(
    "/{automation_id}/runs",
    response_model=list[AutomationRunResponse],
)
def list_runs_for_automation(
    automation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists execution history for a specific automation rule."""
    return (
        db.query(AutomationRun)
        .filter(AutomationRun.automation_id == automation_id)
        .order_by(AutomationRun.created_at.desc())
        .limit(limit)
        .all()
    )
