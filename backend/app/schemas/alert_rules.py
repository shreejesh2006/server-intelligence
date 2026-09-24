from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertRuleCreate(BaseModel):
    name: str
    host: str | None = None
    metric: str
    operator: str
    threshold: float
    duration_seconds: int = 0
    severity: str = "WARNING"
    cooldown_seconds: int = 300
    enabled: bool = True
    action: str | None = None
    notification_target: str | None = None


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    metric: str | None = None
    operator: str | None = None
    threshold: float | None = None
    duration_seconds: int | None = None
    severity: str | None = None
    cooldown_seconds: int | None = None
    enabled: bool | None = None
    action: str | None = None
    notification_target: str | None = None


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    host: str | None
    metric: str
    operator: str
    threshold: float
    duration_seconds: int
    severity: str
    cooldown_seconds: int
    enabled: bool
    action: str | None
    notification_target: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)