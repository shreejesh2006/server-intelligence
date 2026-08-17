from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.permissions import require_admin, require_viewer
from app.database.database import get_db
from app.database.models import AISetting, User
from app.schemas.ai import AISettingResponse, AISettingUpdate
from app.services.ai.credentials import create_key_preview, encrypt_api_key


router = APIRouter(
    prefix="/settings/ai",
    tags=["AI Settings"],
)


def _get_or_create_ai_setting(db: Session) -> AISetting:
    setting = db.scalar(select(AISetting).order_by(AISetting.id))

    if setting is None:
        setting = AISetting(
            provider="ollama",
            model="qwen3:1.7b",
            encrypted_api_key=None,
            key_preview=None,
            is_enabled=True,
            updated_by=None,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


@router.get(
    "",
    response_model=AISettingResponse,
    dependencies=[Depends(require_viewer)],
)
def get_ai_settings(
    db: Session = Depends(get_db),
):
    setting = _get_or_create_ai_setting(db)

    provider = (setting.provider or "ollama").strip().lower()
    model = setting.model or "qwen3:1.7b"

    # Local Ollama does not require an API key.
    if provider == "ollama":
        is_configured = True
    else:
        is_configured = bool(
            setting.encrypted_api_key
            and setting.encrypted_api_key.strip()
        )

    return AISettingResponse(
        provider=provider,
        model=model,
        configured=is_configured,
        enabled=setting.is_enabled,
        key_preview=setting.key_preview,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
    )


@router.put(
    "",
    response_model=AISettingResponse,
    dependencies=[Depends(require_admin)],
)
def update_ai_settings(
    payload: AISettingUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    setting = _get_or_create_ai_setting(db)

    setting.provider = payload.provider.strip().lower()
    setting.model = payload.model.strip()
    setting.is_enabled = payload.enabled
    setting.updated_by = current_admin.username
    setting.updated_at = datetime.now(timezone.utc)

    if payload.api_key is not None and payload.api_key.strip():
        raw_key = payload.api_key.strip()

        try:
            setting.encrypted_api_key = encrypt_api_key(raw_key)
            setting.key_preview = create_key_preview(raw_key)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(err),
            )

    # Ollama is local and doesn't require credentials.
    elif setting.provider == "ollama":
        setting.encrypted_api_key = None
        setting.key_preview = None

    db.commit()
    db.refresh(setting)

    provider = setting.provider.lower()

    is_configured = (
        True
        if provider == "ollama"
        else bool(
            setting.encrypted_api_key
            and setting.encrypted_api_key.strip()
        )
    )

    return AISettingResponse(
        provider=provider,
        model=setting.model,
        configured=is_configured,
        enabled=setting.is_enabled,
        key_preview=setting.key_preview,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
    )


@router.delete(
    "/key",
    response_model=AISettingResponse,
    dependencies=[Depends(require_admin)],
)
def remove_ai_api_key(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    setting = _get_or_create_ai_setting(db)

    setting.encrypted_api_key = None
    setting.key_preview = None
    setting.updated_by = current_admin.username
    setting.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(setting)

    provider = setting.provider.lower()

    return AISettingResponse(
        provider=provider,
        model=setting.model,
        configured=provider == "ollama",
        enabled=setting.is_enabled,
        key_preview=None,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
    )
