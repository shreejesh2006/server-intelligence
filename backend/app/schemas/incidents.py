from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IncidentCreate(BaseModel):
    title: str
    description: str
    severity: str = "WARNING"
    server: str | None = None
    alert_id: int | None = None
    
class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: str | None = None
    server: str | None = None


class IncidentResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str
    severity: str
    server: str | None
    alert_id: int | None
    created_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None

    model_config = ConfigDict(from_attributes=True)