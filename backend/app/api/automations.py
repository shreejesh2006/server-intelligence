from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.database import get_db
from app.database.models import (
    Automation,
    AutomationStatus,
    User,
    UserRole,
)
from app.schemas.automations import (
    AutomationCreate,
    AutomationResponse,
)

router = APIRouter(
    prefix="/automations",
    tags=["Automations"],
)


def require_operator(
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (
        UserRole.ADMIN.value,
        UserRole.OPERATOR.value,
    ):
        raise HTTPException(
            status_code=403,
            detail="Operator access required",
        )

    return current_user

    
@router.post(
    "",
    response_model=AutomationResponse,
)
def create_automation(
    data: AutomationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    automation = Automation(
        name=data.name,
        trigger_type=data.trigger_type,
        action_type=data.action_type,
        status=AutomationStatus.ENABLED.value,
    )

    db.add(automation)
    db.commit()
    db.refresh(automation)

    return automation
@router.get(
    "",
    response_model=list[AutomationResponse],
)
def list_automations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    return (
        db.query(Automation)
        .order_by(Automation.created_at.desc())
        .all()
    )
