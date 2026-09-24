from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.database import get_db
from app.database.models import AlertRule, User, UserRole
from app.schemas.alert_rules import (
    AlertRuleCreate,
    AlertRuleResponse,
    AlertRuleUpdate,
)
from app.services.alerts import evaluate_alert_rules


router = APIRouter(
    prefix="/alert-rules",
    tags=["Alert Rules"],
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
    response_model=AlertRuleResponse,
)
def create_alert_rule(
    data: AlertRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    rule = AlertRule(
        name=data.name,
        host=data.host,
        metric=data.metric,
        operator=data.operator,
        threshold=data.threshold,
        duration_seconds=data.duration_seconds,
        severity=data.severity,
        cooldown_seconds=data.cooldown_seconds,
        enabled=data.enabled,
        action=data.action,
        notification_target=data.notification_target,
    )

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule


@router.get(
    "",
    response_model=list[AlertRuleResponse],
)
def list_alert_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    return (
        db.query(AlertRule)
        .order_by(AlertRule.created_at.desc())
        .all()
    )
    
@router.post(
    "/evaluate",
)
def evaluate_rules(
    host: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    alerts = evaluate_alert_rules(
        db=db,
        host=host,
    )

    return {
        "status": "success",
        "host": host,
        "new_alerts_created": len(alerts),
        "alerts": [
            {
                "id": alert.id,
                "title": alert.title,
                "message": alert.message,
                "severity": alert.severity,
                "status": alert.status,
                "metric": alert.metric,
                "server": alert.server,
            }
            for alert in alerts
        ],
    }


@router.get(
    "/{rule_id}",
    response_model=AlertRuleResponse,
)
def get_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    rule = (
        db.query(AlertRule)
        .filter(AlertRule.id == rule_id)
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Alert rule not found",
        )

    return rule


@router.patch(
    "/{rule_id}",
    response_model=AlertRuleResponse,
)
def update_alert_rule(
    rule_id: int,
    data: AlertRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    rule = (
        db.query(AlertRule)
        .filter(AlertRule.id == rule_id)
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Alert rule not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)

    return rule


@router.delete(
    "/{rule_id}",
)
def delete_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    rule = (
        db.query(AlertRule)
        .filter(AlertRule.id == rule_id)
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Alert rule not found",
        )

    db.delete(rule)
    db.commit()

    return {
        "message": "Alert rule deleted successfully",
        "rule_id": rule_id,
    }