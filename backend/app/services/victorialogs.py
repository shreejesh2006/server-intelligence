"""
VictoriaLogs Service for NETRA INTELLIGENCE

Provides log ingestion, LogSQL querying, and metric/alert correlation.
Connects to VictoriaLogs (port 9428) with transparent fallback to relational database (SystemLogRecord)
when the external VictoriaLogs container is uncontactable or during local development.
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.database.database import SessionLocal
from app.database.models import SystemLogRecord
from app.services.ml.loader import normalize_host, KNOWN_HOSTS

logger = logging.getLogger(__name__)

VICTORIALOGS_URL = os.getenv("VICTORIALOGS_URL", "http://localhost:9428").rstrip("/")
DEFAULT_LOG_QUERY_TIMEOUT = float(os.getenv("VICTORIALOGS_TIMEOUT", "5.0"))
MAX_LOG_QUERY_LIMIT = 500


def sanitize_log_message(msg: str) -> str:
    """Removes sensitive credentials, tokens, or private keys from log entries."""
    if not msg:
        return ""
    clean = re.sub(r"(Bearer\s+)[^\s,;]+", r"\1[REDACTED]", msg, flags=re.IGNORECASE)
    clean = re.sub(
        r"((?:password|secret|api_key|token|auth_token)\s*=\s*)[^\s,;]+",
        r"\1[REDACTED]",
        clean,
        flags=re.IGNORECASE,
    )
    return clean[:2000]


def parse_time_bound(time_str: str | None, default_delta: timedelta) -> datetime:
    """Parses relative or ISO time string into a timezone-aware UTC datetime."""
    now = datetime.now(timezone.utc)
    if not time_str or time_str == "now":
        return now

    time_str = time_str.strip()
    if time_str.startswith("-"):
        match = re.match(r"^-(\d+)([smhd])$", time_str)
        if match:
            val, unit = int(match.group(1)), match.group(2)
            seconds_map = {"s": 1, "m": 60, "h": 3600, "d": 86400}
            return now - timedelta(seconds=val * seconds_map.get(unit, 60))
        return now - default_delta

    try:
        clean = time_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return now - default_delta


class VictoriaLogsService:
    """Client for VictoriaLogs log ingestion and LogSQL queries with database fallback."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or VICTORIALOGS_URL).rstrip("/")

    async def check_health(self) -> dict[str, Any]:
        """Checks if VictoriaLogs server is reachable."""
        url = f"{self.base_url}/health"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return {"status": "connected", "url": self.base_url}
        except Exception:
            pass
        return {"status": "unavailable", "url": self.base_url}

    async def ingest_logs(
        self,
        logs: list[dict[str, Any]],
        db: Session | None = None,
    ) -> dict[str, Any]:
        """
        Ingests a batch of log records into VictoriaLogs (/insert/jsonline)
        and persists them into the relational database fallback table.
        """
        if not logs:
            return {"status": "success", "ingested_count": 0, "victorialogs_delivered": False}

        prepared_records = []
        jsonlines = []
        now = datetime.now(timezone.utc)

        for entry in logs:
            raw_msg = entry.get("message") or entry.get("_msg") or entry.get("msg") or ""
            safe_msg = sanitize_log_message(str(raw_msg))
            if not safe_msg.strip():
                continue

            raw_host = entry.get("host") or entry.get("hostname") or "ubuntu"
            canonical_host = normalize_host(raw_host) or raw_host.strip().lower()

            raw_level = str(entry.get("level") or entry.get("severity") or "INFO").upper()
            level = raw_level if raw_level in ("DEBUG", "INFO", "WARN", "WARNING", "ERROR", "CRITICAL") else "INFO"

            source = str(entry.get("source") or entry.get("service") or "system").strip()

            raw_ts = entry.get("timestamp") or entry.get("_time")
            try:
                if raw_ts:
                    clean_ts = str(raw_ts).replace("Z", "+00:00")
                    ts = datetime.fromisoformat(clean_ts)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                else:
                    ts = now
            except Exception:
                ts = now

            record = {
                "timestamp": ts,
                "host": canonical_host,
                "level": level,
                "source": source,
                "message": safe_msg,
            }
            prepared_records.append(record)

            # Format for VictoriaLogs JSON line protocol
            vl_obj = {
                "_time": ts.isoformat(),
                "_msg": safe_msg,
                "host": canonical_host,
                "level": level,
                "source": source,
            }
            jsonlines.append(json.dumps(vl_obj))

        if not prepared_records:
            return {"status": "success", "ingested_count": 0, "victorialogs_delivered": False}

        # 1. Persist to database fallback table
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            for rec in prepared_records:
                db_record = SystemLogRecord(
                    timestamp=rec["timestamp"],
                    host=rec["host"],
                    level=rec["level"],
                    source=rec["source"],
                    message=rec["message"],
                )
                db.add(db_record)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("Failed persisting logs to database: %s", exc)
        finally:
            if should_close_db:
                db.close()

        # 2. Transmit to VictoriaLogs HTTP API
        vl_delivered = False
        if jsonlines:
            payload = "\n".join(jsonlines).encode("utf-8")
            insert_url = f"{self.base_url}/insert/jsonline"
            try:
                async with httpx.AsyncClient(timeout=DEFAULT_LOG_QUERY_TIMEOUT) as client:
                    resp = await client.post(
                        insert_url,
                        content=payload,
                        headers={"Content-Type": "application/stream+json"},
                    )
                    if resp.is_success:
                        vl_delivered = True
                    else:
                        logger.warning("VictoriaLogs ingest returned status %d: %s", resp.status_code, resp.text)
            except Exception as exc:
                logger.info("VictoriaLogs ingest uncontactable, fallback active: %s", exc)

        return {
            "status": "success",
            "ingested_count": len(prepared_records),
            "victorialogs_delivered": vl_delivered,
        }

    async def query_logs(
        self,
        host: str | None = None,
        start: str | None = "-1h",
        end: str | None = "now",
        level: str | None = None,
        source: str | None = None,
        query: str | None = None,
        limit: int = 100,
        db: Session | None = None,
    ) -> dict[str, Any]:
        """
        Queries logs from VictoriaLogs using LogSQL. Falls back to database when VictoriaLogs is unavailable.
        """
        canonical_host = normalize_host(host) if host else None
        bounded_limit = max(1, min(limit, MAX_LOG_QUERY_LIMIT))

        start_dt = parse_time_bound(start, timedelta(hours=1))
        end_dt = parse_time_bound(end, timedelta(seconds=0))

        # 1. Attempt VictoriaLogs LogSQL Query
        logsql_terms = []
        if canonical_host:
            logsql_terms.append(f'host:"{canonical_host}"')
        if level:
            logsql_terms.append(f'level:"{level.upper()}"')
        if source:
            logsql_terms.append(f'source:"{source}"')
        if query:
            clean_q = sanitize_log_message(query.strip())
            if clean_q:
                logsql_terms.append(f'"{clean_q}"')

        filter_expr = " AND ".join(logsql_terms) if logsql_terms else "*"

        try:
            url = f"{self.base_url}/select/logsql/query"
            params = {
                "query": filter_expr,
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
                "limit": str(bounded_limit),
            }
            async with httpx.AsyncClient(timeout=DEFAULT_LOG_QUERY_TIMEOUT) as client:
                resp = await client.get(url, params=params)
                if resp.is_success:
                    vl_records = []
                    for line in resp.text.splitlines():
                        if not line.strip():
                            continue
                        try:
                            item = json.loads(line)
                            vl_records.append({
                                "timestamp": item.get("_time"),
                                "host": item.get("host", canonical_host or "unknown"),
                                "level": item.get("level", "INFO"),
                                "source": item.get("source", "system"),
                                "message": item.get("_msg", ""),
                            })
                        except Exception:
                            continue

                    return {
                        "status": "success",
                        "source": "victorialogs",
                        "host": canonical_host,
                        "total": len(vl_records),
                        "logs": vl_records,
                    }
        except Exception as exc:
            logger.debug("VictoriaLogs query fallback triggered: %s", exc)

        # 2. Database Fallback Query
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            stmt = select(SystemLogRecord).where(
                and_(
                    SystemLogRecord.timestamp >= start_dt,
                    SystemLogRecord.timestamp <= end_dt,
                )
            )
            if canonical_host:
                stmt = stmt.where(SystemLogRecord.host == canonical_host)
            if level:
                stmt = stmt.where(SystemLogRecord.level == level.upper())
            if source:
                stmt = stmt.where(SystemLogRecord.source == source)
            if query:
                stmt = stmt.where(SystemLogRecord.message.ilike(f"%{query.strip()}%"))

            stmt = stmt.order_by(SystemLogRecord.timestamp.desc()).limit(bounded_limit)
            rows = db.scalars(stmt).all()

            db_logs = [
                {
                    "id": r.id,
                    "timestamp": r.timestamp.isoformat(),
                    "host": r.host,
                    "level": r.level,
                    "source": r.source,
                    "message": r.message,
                }
                for r in rows
            ]

            return {
                "status": "success",
                "source": "database",
                "host": canonical_host,
                "total": len(db_logs),
                "logs": db_logs,
            }
        except Exception as db_exc:
            logger.error("Database log query failed: %s", db_exc)
            return {
                "status": "unavailable",
                "source": "none",
                "host": canonical_host,
                "total": 0,
                "logs": [],
                "detail": f"Log query error: {str(db_exc)}",
            }
        finally:
            if should_close_db:
                db.close()

    async def correlate_logs(
        self,
        host: str,
        timestamp: datetime | str,
        window_minutes: int = 15,
        level: str | None = None,
        db: Session | None = None,
    ) -> dict[str, Any]:
        """
        Retrieves logs surrounding an event (predictive alert, anomaly, incident)
        within ±window_minutes.
        """
        canonical_host = normalize_host(host) or host.strip().lower()

        if isinstance(timestamp, str):
            clean = timestamp.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = timestamp

        start_dt = dt - timedelta(minutes=window_minutes)
        end_dt = dt + timedelta(minutes=window_minutes)

        result = await self.query_logs(
            host=canonical_host,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            level=level,
            limit=50,
            db=db,
        )
        result["correlation_center"] = dt.isoformat()
        result["window_minutes"] = window_minutes
        return result


victorialogs_service = VictoriaLogsService()
