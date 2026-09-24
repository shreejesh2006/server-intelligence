from datetime import datetime

from pydantic import BaseModel


class AutomationCreate(BaseModel):
    name: str
    trigger_type: str
    action_type: str


class AutomationResponse(BaseModel):
    id: int
    name: str
    trigger_type: str
    action_type: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True