from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class AutomationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    trigger_type: str = Field(default="predictive_alert", max_length=50)
    action_type: str = Field(..., max_length=50)


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    trigger_type: str | None = Field(default=None, max_length=50)
    action_type: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=20)


class AutomationExecuteRequest(BaseModel):
    host: str | None = Field(default="ubuntu", max_length=100)
    alert_id: int | None = None


class AutomationResponse(BaseModel):
    id: int
    name: str
    trigger_type: str
    action_type: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationRunResponse(BaseModel):
    id: int
    automation_id: int
    status: str
    output: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)