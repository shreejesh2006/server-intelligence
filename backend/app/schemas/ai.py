from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AISettingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str
    model: str
    configured: bool
    enabled: bool
    key_preview: str | None = None
    updated_by: str | None = None
    updated_at: datetime | None = None


class AISettingUpdate(BaseModel):
    provider: str = Field(default="ollama")
    model: str = Field(default="qwen3:1.7b")


    api_key: str | None = Field(default=None)
    enabled: bool = Field(default=True)


class ChatMessage(BaseModel):
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


class ChatResponse(BaseModel):
    message: str
    provider: str
    model: str
