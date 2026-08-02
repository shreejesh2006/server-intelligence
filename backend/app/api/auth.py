from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
)
from app.auth.permissions import (
    require_admin,
    require_operator,
    require_viewer,
)
from app.auth.security import verify_password
from app.database.database import get_db
from app.database.models import User
from app.schemas.auth import (
    AuthenticatedUser,
    LoginRequest,
    TokenResponse,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(
            User.username == credentials.username
        )
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not verify_password(
        credentials.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    access_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get(
    "/me",
    response_model=AuthenticatedUser,
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return AuthenticatedUser(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        is_active=current_user.is_active,
    )


@router.get("/test/viewer")
def test_viewer_access(
    current_user: User = Depends(require_viewer),
):
    return {
        "access": "granted",
        "required_role": "VIEWER",
        "username": current_user.username,
        "role": current_user.role,
    }


@router.get("/test/operator")
def test_operator_access(
    current_user: User = Depends(require_operator),
):
    return {
        "access": "granted",
        "required_role": "OPERATOR",
        "username": current_user.username,
        "role": current_user.role,
    }


@router.get("/test/admin")
def test_admin_access(
    current_user: User = Depends(require_admin),
):
    return {
        "access": "granted",
        "required_role": "ADMIN",
        "username": current_user.username,
        "role": current_user.role,
    }
