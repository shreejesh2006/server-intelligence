from fastapi import APIRouter, HTTPException, Query

from app.services.victoriametrics import VictoriaMetricsService, normalize_host, KNOWN_HOSTS


router = APIRouter(
    prefix="/metrics",
    tags=["Metrics"],
)

victoria = VictoriaMetricsService()


SUPPORTED_METRICS = {
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

    "processes": "server_process_count",
    "process_count": "server_process_count",

    "iowait": "server_cpu_iowait_percent",
    "cpu_iowait": "server_cpu_iowait_percent",

    "uptime": "server_uptime_seconds",
    "uptime_seconds": "server_uptime_seconds",
}


def build_query(metric: str, host: str | None) -> str:
    if not host:
        return metric
    return victoria.build_metric_query(metric, host)


@router.get("/")
async def list_metrics():
    return {
        "metrics": list(SUPPORTED_METRICS.keys())
    }


from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import Depends
from app.database.database import get_db
from app.database.models import TelemetrySample

METRIC_DB_COLUMN_MAP = {
    "cpu": "cpu_usage_percent",
    "memory": "memory_usage_percent",
    "disk": "disk_usage_percent",
    "swap": "swap_usage_percent",
    "load_1m": "load_1m",
    "load_5m": "load_5m",
    "load_15m": "load_15m",
    "network_rx": "network_rx_bytes_sec",
    "network_tx": "network_tx_bytes_sec",
    "disk_read": "disk_read_bytes_sec",
    "disk_write": "disk_write_bytes_sec",
    "processes": "process_count",
    "process_count": "process_count",
    "iowait": "cpu_iowait_percent",
    "cpu_iowait": "cpu_iowait_percent",
    "uptime": "uptime_seconds",
    "uptime_seconds": "uptime_seconds",
}


@router.get("/current")
async def current_metrics(
    host: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    result = {}
    if host is not None:
        target_canonical = normalize_host(host)
        if not target_canonical:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS}",
            )
    else:
        target_canonical = "ubuntu"

    # 1. Try querying VictoriaMetrics first
    try:
        vm_has_data = False
        for name, metric in SUPPORTED_METRICS.items():
            query = build_query(metric, host)
            data = await victoria.query(query)
            if data:
                if target_canonical:
                    matching = [
                        item
                        for item in data
                        if normalize_host(item.get("metric", {}).get("host")) == target_canonical
                    ]
                    if matching:
                        result[name] = float(matching[0]["value"][1])
                        vm_has_data = True
                        continue
                else:
                    result[name] = float(data[0]["value"][1])
                    vm_has_data = True
                    continue
            result[name] = None

        if vm_has_data:
            return {
                "status": "success",
                "host": host or target_canonical,
                "provenance": "live_agent",
                "environment": "Live Infrastructure",
                "is_connected_agent": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metrics": result,
            }
    except Exception:
        pass

    # 2. Fall back to database query (Render / Supabase environment)
    stmt = (
        select(TelemetrySample)
        .where(TelemetrySample.host == target_canonical)
        .order_by(TelemetrySample.timestamp.desc())
        .limit(1)
    )
    latest_sample = db.scalar(stmt)

    if latest_sample:
        for name, col in METRIC_DB_COLUMN_MAP.items():
            val = getattr(latest_sample, col, None)
            result[name] = float(val) if val is not None else 0.0

        return {
            "status": "success",
            "host": host or target_canonical,
            "provenance": "live_agent",
            "environment": "Live Infrastructure",
            "is_connected_agent": True,
            "source": "database",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sample_timestamp": latest_sample.timestamp.isoformat() if latest_sample.timestamp else None,
            "metrics": result,
        }

    return {
        "status": "unavailable",
        "host": host or target_canonical,
        "provenance": "live_agent",
        "environment": "Live Infrastructure",
        "metrics": None,
        "detail": f"No telemetry available for host '{host}' in VictoriaMetrics or database.",
    }


import time
import re

def parse_relative_time(time_str: str) -> str:
    """Converts relative time range strings ('-15m', '-1h', '-6h', '-24h', '-7d', 'now') into explicit epoch seconds."""
    if not time_str or time_str == "now":
        return str(int(time.time()))
    if time_str.startswith("-"):
        match = re.match(r"^-(\d+)([smhd])$", time_str)
        if match:
            val, unit = int(match.group(1)), match.group(2)
            seconds_map = {"s": 1, "m": 60, "h": 3600, "d": 86400}
            delta = val * seconds_map.get(unit, 1)
            return str(int(time.time()) - delta)
    return time_str


@router.get("/{metric_name}")
async def metric_history(
    metric_name: str,
    host: str | None = Query(default=None),
    start: str = Query(default="-1h"),
    end: str = Query(default="now"),
    step: str = Query(default="30s"),
    db: Session = Depends(get_db),
):
    if host is not None:
        target_canonical = normalize_host(host)
        if not target_canonical:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS}",
            )
    else:
        target_canonical = "ubuntu"

    metric = SUPPORTED_METRICS.get(metric_name)
    if metric is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric: {metric_name}",
        )

    # 1. Try VictoriaMetrics range query
    try:
        query = build_query(metric, host)
        start_eval = parse_relative_time(start)
        end_eval = parse_relative_time(end)

        data = await victoria.query_range(
            query=query,
            start=start_eval,
            end=end_eval,
            step=step,
        )

        if data:
            if target_canonical:
                matching = [
                    item
                    for item in data
                    if normalize_host(item.get("metric", {}).get("host")) == target_canonical
                ]
                if matching:
                    data = matching
                elif any(item.get("metric", {}).get("host") for item in data):
                    data = []

            if data and len(data) > 0 and "values" in data[0]:
                values = [
                    {
                        "timestamp": float(timestamp),
                        "value": float(value),
                    }
                    for timestamp, value in data[0]["values"]
                ]

                return {
                    "metric": metric_name,
                    "host": host or target_canonical,
                    "provenance": "live_agent",
                    "environment": "Live Infrastructure",
                    "start": start,
                    "end": end,
                    "step": step,
                    "values": values,
                }
    except Exception:
        pass

    # 2. Fall back to database metrics query
    col_name = METRIC_DB_COLUMN_MAP.get(metric_name)
    if not col_name:
        return {"metric": metric_name, "host": host, "values": []}

    now_epoch = time.time()
    try:
        start_ts = float(parse_relative_time(start))
        end_ts = float(parse_relative_time(end))
    except Exception:
        start_ts = now_epoch - 3600
        end_ts = now_epoch

    duration_seconds = max(60, int(end_ts - start_ts))

    dt_start = datetime.fromtimestamp(start_ts, tz=timezone.utc)
    dt_end = datetime.fromtimestamp(end_ts, tz=timezone.utc)

    # 2a. Query wall-clock window
    stmt = (
        select(TelemetrySample)
        .where(
            TelemetrySample.host == target_canonical,
            TelemetrySample.timestamp >= dt_start,
            TelemetrySample.timestamp <= dt_end,
        )
        .order_by(TelemetrySample.timestamp.asc())
    )
    db_samples = list(db.scalars(stmt).all())

    # 2b. If no samples exist in requested wall-clock window, find the latest recorded sample
    # and extract the exact window of length `duration_seconds` up to latest recorded sample.
    is_time_shifted = False
    time_offset = 0.0

    if not db_samples:
        stmt_latest = (
            select(TelemetrySample)
            .where(TelemetrySample.host == target_canonical)
            .order_by(TelemetrySample.timestamp.desc())
            .limit(1)
        )
        latest_sample = db.scalar(stmt_latest)
        if latest_sample and latest_sample.timestamp:
            max_dt = latest_sample.timestamp
            if max_dt.tzinfo is None:
                max_dt = max_dt.replace(tzinfo=timezone.utc)
            min_dt = max_dt - timedelta(seconds=duration_seconds)

            stmt_window = (
                select(TelemetrySample)
                .where(
                    TelemetrySample.host == target_canonical,
                    TelemetrySample.timestamp >= min_dt,
                    TelemetrySample.timestamp <= max_dt,
                )
                .order_by(TelemetrySample.timestamp.asc())
            )
            db_samples = list(db.scalars(stmt_window).all())
            is_time_shifted = True
            time_offset = end_ts - max_dt.timestamp()

    # Step downsampling: calculate step in seconds
    step_seconds = 30
    if step:
        m_step = re.match(r"^(\d+)([smhd])$", step)
        if m_step:
            val, unit = int(m_step.group(1)), m_step.group(2)
            seconds_map = {"s": 1, "m": 60, "h": 3600, "d": 86400}
            step_seconds = max(1, val * seconds_map.get(unit, 1))

    values = []
    last_emitted_ts = -float("inf")

    for s in db_samples:
        ts = s.timestamp.timestamp()
        if is_time_shifted:
            ts = ts + time_offset

        if (ts - last_emitted_ts) >= (step_seconds * 0.9):
            val = getattr(s, col_name, 0.0)
            values.append({
                "timestamp": round(ts, 2),
                "value": float(val or 0.0),
            })
            last_emitted_ts = ts

    # Ensure the very latest sample is always included
    if db_samples and values and (db_samples[-1].timestamp.timestamp() + (time_offset if is_time_shifted else 0.0)) > values[-1]["timestamp"]:
        s_last = db_samples[-1]
        ts_last = s_last.timestamp.timestamp() + (time_offset if is_time_shifted else 0.0)
        val_last = getattr(s_last, col_name, 0.0)
        values.append({
            "timestamp": round(ts_last, 2),
            "value": float(val_last or 0.0),
        })

    return {
        "metric": metric_name,
        "host": host or target_canonical,
        "provenance": "live_agent",
        "environment": "Live Infrastructure",
        "source": "database",
        "start": start,
        "end": end,
        "step": step,
        "values": values,
    }
