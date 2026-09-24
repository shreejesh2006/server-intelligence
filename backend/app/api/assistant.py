from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.permissions import require_viewer
from app.database.database import get_db
from app.database.models import AISetting, User
from app.schemas.ai import ChatRequest, ChatResponse
from app.services.ai.credentials import decrypt_api_key
from app.services.ai.manager import AIManager
from app.agent.orchestrator import AgentOrchestrator


router = APIRouter(
    prefix="/assistant",
    tags=["AI Assistant"],
    dependencies=[Depends(require_viewer)],
)


@router.post(
    "/chat",
    response_model=ChatResponse,
)
async def chat_with_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_viewer),
):
    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Messages list cannot be empty.",
        )

    last_msg = payload.messages[-1]
    if last_msg.role != "user" or not last_msg.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last message must be from user with non-empty content.",
        )

    setting = db.scalar(select(AISetting).order_by(AISetting.id))
    if setting is None or not setting.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "AI_NOT_CONFIGURED",
                "message": "AI Assistant is currently disabled.",
            },
        )

    provider_name = (setting.provider or "ollama").strip().lower()
    api_key = ""

    if provider_name != "ollama":
        if not setting.encrypted_api_key or not setting.encrypted_api_key.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "AI_NOT_CONFIGURED",
                    "message": "AI Assistant API credentials have not been configured.",
                },
            )
        try:
            api_key = decrypt_api_key(setting.encrypted_api_key)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(err),
            )

    try:
        provider = AIManager.get_provider(provider_name)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

    messages_payload = [
        {"role": m.role, "content": m.content}
        for m in payload.messages
    ]

    session_id = str(current_user.id)
    user_role = getattr(current_user, "role", "viewer")

    orchestrator = AgentOrchestrator(
        provider=provider,
        model=setting.model or "qwen3:1.7b",
        api_key=api_key,
    )

    try:
        reply_text = await orchestrator.run(
            session_id=session_id,
            messages=messages_payload,
            default_host="ubuntu",
            user_role=user_role,
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent orchestration failed: {str(err)}",
        )

    return ChatResponse(
        message=reply_text,
        provider=provider_name,
        model=setting.model or "qwen3:1.7b",
    )