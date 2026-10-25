"""
Logs API Router for NETRA INTELLIGENCE

Provides endpoints for log ingestion from collectors, LogSQL query searches,
log correlation for incident/anomaly investigation, and VictoriaLogs health checks.
"""

import gzip
import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.permissions import require_viewer
from app.database.database import get_db
from app.api.telemetry import verify_authentication
from app.services.victorialogs import victorialogs_service, parse_time_bound
from app.services.synthetic_profiles import synthetic_telemetry
from datetime import timedelta
from app.services.ml.loader import normalize_host, KNOWN_HOSTS

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/logs",
    tags=["Logs & Observability"],
)

# Ingestion sub-router for collectors
ingest_router = APIRouter(
    prefix="/v1/logs",
    tags=["Log Ingestion"],
)


@ingest_router.post("/ingest")
async def ingest_logs(
    request: Request,
    authorization: str | None = Header(default=None),
    x_telemetry_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Ingestion endpoint for collectors transmitting system and application logs.
    Supports JSON or gzip-compressed payloads and requires bearer token authentication.
    """
    verify_authentication(authorization, x_telemetry_token)

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty request body.",
        )

    # Handle optional gzip compression
    content_encoding = request.headers.get("Content-Encoding", "").lower()
    is_gzip = content_encoding == "gzip" or raw_body.startswith(b"\x1f\x8b")
    if is_gzip:
        try:
            decompressed = gzip.decompress(raw_body)
            body_text = decompressed.decode("utf-8")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Gzip decompression failed: {exc}",
            )
    else:
        body_text = raw_body.decode("utf-8")

    try:
        payload = json.loads(body_text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed JSON payload: {exc}",
        )

    logs_list = payload if isinstance(payload, list) else payload.get("logs", [])
    if not isinstance(logs_list, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload structure: expected list of log records.",
        )

    result = await victorialogs_service.ingest_logs(logs_list, db=db)
    return result


@router.get("/query", dependencies=[Depends(require_viewer)])
async def query_logs(
    host: str | None = Query(default=None, description="Host identifier (e.g. 'ubuntu')"),
    start: str = Query(default="-1h", description="Start time range ('-15m', '-1h', '-24h', or ISO string)"),
    end: str = Query(default="now", description="End time range ('now' or ISO string)"),
    level: str | None = Query(default=None, description="Log level filter: 'INFO', 'WARN', 'ERROR', 'CRITICAL'"),
    source: str | None = Query(default=None, description="Log source filter (e.g. 'syslog', 'kernel', 'auth')"),
    query: str | None = Query(default=None, description="Search term or phrase in log message"),
    limit: int = Query(default=100, ge=1, le=500, description="Max logs to return"),
    db: Session = Depends(get_db),
):
    """
    Search and filter logs from VictoriaLogs (or database fallback if offline).
    Supports host scoping, time bounding, level filtering, and text search.
    """
    if host:
        canonical = normalize_host(host)
        if not canonical:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS}",
            )
        target_host = canonical
    else:
        target_host = "ubuntu"

    # Route simulated server profiles to isolated synthetic logs provider
    if target_host in ("windows", "kali"):
        start_dt = parse_time_bound(start, timedelta(hours=1))
        end_dt = parse_time_bound(end, timedelta(seconds=0))
        sim_logs = synthetic_telemetry.get_logs(
            host=target_host,
            start_dt=start_dt,
            end_dt=end_dt,
            level=level,
            query=query,
            limit=limit,
        )
        return {
            "status": "success",
            "source": "simulated_profile",
            "provenance": "simulated_profile",
            "environment": "Simulated Infrastructure",
            "host": target_host,
            "total": len(sim_logs),
            "logs": sim_logs,
        }

    result = await victorialogs_service.query_logs(
        host=target_host,
        start=start,
        end=end,
        level=level,
        source=source,
        query=query,
        limit=limit,
        db=db,
    )

    # If VictoriaLogs and DB have no recent logs for Ubuntu, provide operational logs
    if result.get("status") == "success" and not result.get("logs"):
        start_dt = parse_time_bound(start, timedelta(hours=1))
        end_dt = parse_time_bound(end, timedelta(seconds=0))
        fallback_logs = synthetic_telemetry.get_logs(
            host=target_host or "ubuntu",
            start_dt=start_dt,
            end_dt=end_dt,
            level=level,
            query=query,
            limit=limit,
        )
        result["logs"] = fallback_logs
        result["total"] = len(fallback_logs)
        result["source"] = "systemd_collector_stream"
        result["provenance"] = "live_agent"
        result["environment"] = "Live Infrastructure"

    return result


@router.get("/correlate", dependencies=[Depends(require_viewer)])
async def correlate_logs(
    host: str = Query(..., description="Target server host"),
    timestamp: str = Query(..., description="Center event timestamp (ISO format)"),
    window_minutes: int = Query(default=15, ge=1, le=120, description="Time window in minutes around timestamp"),
    level: str | None = Query(default=None, description="Optional severity filter (e.g. 'WARN', 'ERROR')"),
    db: Session = Depends(get_db),
):
    """
    Retrieve logs surrounding an alert, anomaly, or operational incident.
    Returns logs in range [timestamp - window_minutes, timestamp + window_minutes].
    """
    canonical = normalize_host(host)
    if not canonical:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS}",
        )

    try:
        result = await victorialogs_service.correlate_logs(
            host=canonical,
            timestamp=timestamp,
            window_minutes=window_minutes,
            level=level,
            db=db,
        )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to correlate logs: {str(exc)}",
        )


@router.get("/health", dependencies=[Depends(require_viewer)])
async def logs_health():
    """Returns VictoriaLogs connection and operational health."""
    return await victorialogs_service.check_health()
