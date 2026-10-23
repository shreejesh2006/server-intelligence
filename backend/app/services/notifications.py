"""
Notification Dispatcher Service

Handles internal Notification persistence and optional external webhook delivery.
Applies safe timeouts, handles network failures gracefully, avoids exposing credentials,
and ensures alert evaluation remains unblocked.
"""

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.database.models import Notification

logger = logging.getLogger(__name__)

# Webhook configuration from environment
# E.g., NOTIFICATION_WEBHOOK_URL="https://hooks.slack.com/services/..."
NOTIFICATION_WEBHOOK_URL = os.getenv("NOTIFICATION_WEBHOOK_URL", "")
NOTIFICATION_WEBHOOK_TIMEOUT_SECONDS = float(os.getenv("NOTIFICATION_WEBHOOK_TIMEOUT", "5.0"))


def _sanitize_error_message(text: str, max_len: int = 500) -> str:
    """Removes URLs, bearer tokens, and secrets from error strings."""
    if not text:
        return ""
    clean = re.sub(r"https?://[^\s,;]+", "[URL]", text)
    clean = re.sub(r"(Bearer\s+)[^\s,;]+", r"\1[REDACTED]", clean, flags=re.IGNORECASE)
    clean = re.sub(
        r"((?:password|secret|api_key|token)\s*=\s*)[^\s,;]+",
        r"\1[REDACTED]",
        clean,
        flags=re.IGNORECASE,
    )
    return clean[:max_len]


async def dispatch_notification(
    db: Session,
    target: str,
    message: str,
    alert_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Persists a Notification record to the database and optionally sends to
    configured external webhook without exposing credentials or throwing unhandled errors.

    Accurately records lifecycle status:
    - CREATED (persisted internally, no webhook configured)
    - DELIVERED (external webhook call succeeded with 2xx status)
    - FAILED (external webhook timed out or returned non-2xx status)

    Returns:
        dict: {"persisted": bool, "delivered_external": bool, "notification_id": int | None, "status": str}
    """
    result = {
        "persisted": False,
        "delivered_external": False,
        "notification_id": None,
        "status": "CREATED",
    }

    # 1. Persist initial notification to database
    try:
        notification = Notification(
            target=target,
            message=message[:1000],  # DB column limit is String(1000)
            status="CREATED",
            delivered_at=None,
            error=None,
            sent_at=datetime.now(timezone.utc),
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        result["persisted"] = True
        result["notification_id"] = notification.id
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist notification to database: %s", exc)
        return result

    # 2. External Webhook Delivery (if configured)
    webhook_url = NOTIFICATION_WEBHOOK_URL.strip()
    if webhook_url:
        masked_url = webhook_url.split("?")[0]
        try:
            import httpx

            payload = {
                "target": target,
                "message": message,
                "alert_id": alert_id,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }
            if metadata:
                payload["metadata"] = metadata

            async with httpx.AsyncClient(timeout=NOTIFICATION_WEBHOOK_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    webhook_url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Netra-Notification-Dispatcher/1.0",
                    },
                )
                if resp.is_success:
                    result["delivered_external"] = True
                    result["status"] = "DELIVERED"
                    notification.status = "DELIVERED"
                    notification.delivered_at = datetime.now(timezone.utc)
                    notification.error = None
                    db.commit()
                    logger.info("External notification webhook delivered to %s", masked_url)
                else:
                    err_msg = f"Webhook HTTP error status {resp.status_code}"
                    result["delivered_external"] = False
                    result["status"] = "FAILED"
                    notification.status = "FAILED"
                    notification.delivered_at = None
                    notification.error = err_msg
                    db.commit()
                    logger.warning(
                        "External notification webhook failed with status %d for %s",
                        resp.status_code,
                        masked_url,
                    )
        except Exception as exc:
            safe_error = _sanitize_error_message(f"{exc.__class__.__name__}: {exc}")
            result["delivered_external"] = False
            result["status"] = "FAILED"
            try:
                notification.status = "FAILED"
                notification.delivered_at = None
                notification.error = safe_error
                db.commit()
            except Exception as db_exc:
                logger.error("Failed to record notification delivery failure: %s", db_exc)
            logger.warning("External notification webhook delivery error for %s: %s", masked_url, safe_error)

    return result
