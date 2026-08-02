from pydantic import BaseModel, Field

from app.database.models import UserRole


class LoginRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
    )

    password: str = Field(
        min_length=1,
        max_length=128,
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthenticatedUser(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
