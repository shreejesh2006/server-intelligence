"""
BDH Telemetry Fetcher — Robust Retrieval for Monitored Ubuntu Server
"""

import os
import logging
import httpx
import pandas as pd
from datetime import datetime, timezone, timedelta

from ml.bdh.config import (
    CANONICAL_HOST,
    FEATURE_COLUMNS,
    validate_host,
)

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logger = logging.getLogger(__name__)

DEFAULT_VM_URL = os.getenv("VICTORIAMETRICS_URL", "http://localhost:8428")

METRICS_PROMPQL_MAP = {
    "cpu": "server_cpu_usage_percent",
    "memory": "server_memory_usage_percent",
    "disk": "server_disk_usage_percent",
    "swap": "server_swap_usage_percent",
    "load_1m": "server_load_1m",
    "load_5m": "server_load_5m",
    "load_15m": "server_load_15m",
    "network_rx": "server_network_rx_bytes_per_second",
    "network_tx": "server_network_tx_bytes_per_second",
    "disk_read": "server_disk_read_bytes_per_second",
    "disk_write": "server_disk_write_bytes_per_second",
    "process_count": "server_process_count",
    "iowait": "server_cpu_iowait_percent",
    "uptime": "server_uptime_seconds",
}

HOST_LABEL_EXPR = 'host=~"ubuntu|100.108.160.2"'


def fetch_ubuntu_telemetry_history(
    host: str = CANONICAL_HOST,
    lookback_days: int = 7,
    step: str = "30s",
    vm_url: str = DEFAULT_VM_URL,
) -> pd.DataFrame:
    """
    Fetches continuous historical telemetry for the canonical Ubuntu host.
    Queries VictoriaMetrics /api/v1/query_range and falls back to relational database (TelemetrySample)
    if VictoriaMetrics is uncontactable.
    """
    canonical = validate_host(host)  # Raises ValueError if host != "ubuntu"

    now_dt = datetime.now(timezone.utc)
    start_dt = now_dt - timedelta(days=lookback_days)

    start_str = start_dt.isoformat()
    end_str = now_dt.isoformat()

    metric_series = {}
    url = f"{vm_url.rstrip('/')}/api/v1/query_range"

    # 1. Try querying VictoriaMetrics
    for feature_name in FEATURE_COLUMNS:
        base_metric = METRICS_PROMPQL_MAP.get(feature_name)
        if not base_metric:
            continue

        query_str = f"{base_metric}{{{HOST_LABEL_EXPR}}}"
        try:
            with httpx.Client(timeout=30.0) as client:
                res = client.get(
                    url,
                    params={
                        "query": query_str,
                        "start": start_str,
                        "end": end_str,
                        "step": step,
                    },
                )
                if res.status_code == 200:
                    payload = res.json()
                    if payload.get("status") == "success":
                        result = payload.get("data", {}).get("result", [])
                        if result and "values" in result[0]:
                            values = result[0]["values"]
                            s = pd.Series(
                                data=[float(v[1]) for v in values],
                                index=[pd.to_datetime(float(v[0]), unit="s", utc=True) for v in values],
                                name=feature_name,
                            )
                            metric_series[feature_name] = s
        except Exception as exc:
            logger.debug("VM fetch notice for feature '%s': %s", feature_name, exc)

    if metric_series:
        df_combined = pd.DataFrame(metric_series).sort_index().ffill().bfill().reset_index()
        df_combined.rename(columns={"index": "timestamp"}, inplace=True)
        df_combined["host"] = canonical
        logger.info("Successfully fetched %d telemetry rows from VictoriaMetrics for host '%s'", len(df_combined), canonical)
        return df_combined

    # 2. Fall back to relational Database (TelemetrySample via SQLAlchemy)
    logger.info("VictoriaMetrics unavailable or empty. Attempting database fallback for host '%s'...", canonical)
    try:
        from app.database.database import SessionLocal
        from app.database.models import TelemetrySample
        from sqlalchemy import select

        from ml.bdh.config import SUPPORTED_HOST_ALIASES

        db = SessionLocal()
        try:
            stmt = (
                select(TelemetrySample)
                .where(
                    TelemetrySample.host.in_(SUPPORTED_HOST_ALIASES),
                    TelemetrySample.timestamp >= start_dt,
                )
                .order_by(TelemetrySample.timestamp.asc())
            )
            samples = db.scalars(stmt).all()

            if samples:
                data_rows = []
                for s in samples:
                    data_rows.append({
                        "timestamp": pd.to_datetime(s.timestamp, utc=True),
                        "host": canonical,
                        "cpu": float(s.cpu_usage_percent or 0.0),
                        "memory": float(s.memory_usage_percent or 0.0),
                        "disk": float(s.disk_usage_percent or 0.0),
                        "swap": float(s.swap_usage_percent or 0.0),
                        "load_1m": float(s.load_1m or 0.0),
                        "load_5m": float(s.load_5m or 0.0),
                        "load_15m": float(s.load_15m or 0.0),
                        "network_rx": float(s.network_rx_bytes_sec or 0.0),
                        "network_tx": float(s.network_tx_bytes_sec or 0.0),
                        "disk_read": float(s.disk_read_bytes_sec or 0.0),
                        "disk_write": float(s.disk_write_bytes_sec or 0.0),
                        "process_count": float(s.process_count or 0.0),
                        "iowait": float(s.cpu_iowait_percent or 0.0),
                        "uptime": float(s.uptime_seconds or 0.0),
                    })
                df_db = pd.DataFrame(data_rows).sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last").ffill().bfill().reset_index(drop=True)
                logger.info("Successfully fetched %d telemetry rows from Database fallback for host '%s'", len(df_db), canonical)
                return df_db
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Database fallback error for host '%s': %s", canonical, exc)

    logger.warning("No historical telemetry found for host '%s'. Returning empty DataFrame.", canonical)
    return pd.DataFrame(columns=["timestamp", "host"] + FEATURE_COLUMNS)
