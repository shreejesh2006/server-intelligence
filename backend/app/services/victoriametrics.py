import os
import logging
import httpx
import pandas as pd
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

VICTORIAMETRICS_URL = os.getenv(
    "VICTORIAMETRICS_URL",
    "http://localhost:8428",
)

METRICS_MAP = {
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
    "iowait": "server_cpu_iowait_percent",
    "uptime": "server_uptime_seconds",
}

HOST_LABEL_MAP = {
    "ubuntu": 'host=~"ubuntu|100.108.160.2"',
    "kali": 'host=~"kali|Kali|100.115.122.92"',
}


def normalize_host(host: str | None) -> str | None:
    """
    Normalizes host identifiers and Tailscale IPs into canonical host strings:
    - 'ubuntu' or '100.108.160.2' -> 'ubuntu'
    - 'kali', 'Kali', or '100.115.122.92' -> 'kali'
    """
    if not host:
        return None

    clean = host.strip().lower()
    if clean in ("ubuntu", "100.108.160.2"):
        return "ubuntu"
    elif clean in ("kali", "100.115.122.92"):
        return "kali"
    return clean


from sqlalchemy import select
from app.database.database import SessionLocal
from app.database.models import TelemetrySample


class VictoriaMetricsService:
    def __init__(self, base_url: str = VICTORIAMETRICS_URL):
        self.base_url = base_url.rstrip("/")

    def build_metric_query(self, metric_name: str, host: str | None = None) -> str:
        """Formats Prometheus/VictoriaMetrics metric selector with explicit host label selector."""
        canonical = normalize_host(host)
        if not canonical:
            return metric_name

        if canonical in HOST_LABEL_MAP:
            label_expr = HOST_LABEL_MAP[canonical]
            return f"{metric_name}{{{label_expr}}}"

        return f'{metric_name}{{host="{canonical}"}}'

    async def query(self, query: str):
        url = f"{self.base_url}/api/v1/query"

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params={"query": query},
            )
            response.raise_for_status()
            payload = response.json()

        if payload.get("status") != "success":
            raise RuntimeError("VictoriaMetrics query was unsuccessful")

        return payload["data"]["result"]

    async def query_range(
        self,
        query: str,
        start: str,
        end: str,
        step: str = "30s",
    ):
        url = f"{self.base_url}/api/v1/query_range"

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params={
                    "query": query,
                    "start": start,
                    "end": end,
                    "step": step,
                },
            )
            response.raise_for_status()
            payload = response.json()

        if payload.get("status") != "success":
            raise RuntimeError("VictoriaMetrics range query was unsuccessful")

        return payload["data"]["result"]

    async def get_current_metrics(self, host: str | None = None) -> tuple[dict, str | None]:
        """
        Fetches current values for all server telemetry metrics for a given host.
        Falls back to relational database (Supabase/SQLite) if VictoriaMetrics is uncontactable.
        """
        canonical = normalize_host(host) or "ubuntu"

        result = {}
        latest_ts = None

        # 1. Try querying VictoriaMetrics
        for name, base_metric in METRICS_MAP.items():
            query_str = self.build_metric_query(base_metric, canonical)
            try:
                data = await self.query(query_str)
                if data and len(data) > 0 and "value" in data[0]:
                    ts_val = data[0]["value"][0]
                    val = float(data[0]["value"][1])
                    result[name] = val
                    if latest_ts is None or ts_val > latest_ts:
                        latest_ts = ts_val
                else:
                    result[name] = 0.0
            except Exception:
                result[name] = 0.0

        if latest_ts is not None and any(v > 0.0 for v in result.values()):
            obs_timestamp = datetime.fromtimestamp(float(latest_ts), tz=timezone.utc).isoformat()
            return result, obs_timestamp

        # 2. Fall back to database query (Render / Supabase environment)
        db = SessionLocal()
        try:
            stmt = (
                select(TelemetrySample)
                .where(TelemetrySample.host == canonical)
                .order_by(TelemetrySample.timestamp.desc())
                .limit(1)
            )
            sample = db.scalar(stmt)
            if sample:
                result = {
                    "cpu": float(sample.cpu_usage_percent or 0.0),
                    "memory": float(sample.memory_usage_percent or 0.0),
                    "disk": float(sample.disk_usage_percent or 0.0),
                    "swap": float(sample.swap_usage_percent or 0.0),
                    "load_1m": float(sample.load_1m or 0.0),
                    "load_5m": float(sample.load_5m or 0.0),
                    "load_15m": float(sample.load_15m or 0.0),
                    "network_rx": float(sample.network_rx_bytes_sec or 0.0),
                    "network_tx": float(sample.network_tx_bytes_sec or 0.0),
                    "disk_read": float(sample.disk_read_bytes_sec or 0.0),
                    "disk_write": float(sample.disk_write_bytes_sec or 0.0),
                    "processes": float(sample.process_count or 0.0),
                    "iowait": float(sample.cpu_iowait_percent or 0.0),
                    "uptime": float(sample.uptime_seconds or 0.0),
                }
                ts_iso = sample.timestamp.isoformat() if hasattr(sample.timestamp, "isoformat") else str(sample.timestamp)
                return result, ts_iso
        except Exception as exc:
            logger.warning("Database fallback for current_metrics error: %s", exc)
        finally:
            db.close()

        obs_timestamp = datetime.now(timezone.utc).isoformat()
        return {name: 0.0 for name in METRICS_MAP.keys()}, obs_timestamp

    async def get_all_metrics_history(
        self,
        host: str | None,
        lookback_minutes: int = 30,
        step: str = "30s",
    ) -> tuple[pd.DataFrame, str | None]:
        """
        Fetches continuous historical telemetry for the requested host.
        Falls back to relational database (Supabase/SQLite) if VictoriaMetrics is uncontactable.
        """
        canonical = normalize_host(host) or "ubuntu"

        now_dt = datetime.now(timezone.utc)
        end_dt = now_dt
        start_dt = now_dt - timedelta(minutes=lookback_minutes)

        start_str = start_dt.isoformat()
        end_str = now_dt.isoformat()

        metric_series = {}
        latest_ts = None

        # 1. Try querying VictoriaMetrics
        for name, base_metric in METRICS_MAP.items():
            query_str = self.build_metric_query(base_metric, canonical)
            try:
                data = await self.query_range(query_str, start=start_str, end=end_str, step=step)
                if data and len(data) > 0 and "values" in data[0]:
                    values = data[0]["values"]
                    s = pd.Series(
                        data=[float(v[1]) for v in values],
                        index=[pd.to_datetime(float(v[0]), unit="s", utc=True) for v in values],
                        name=name,
                    )
                    metric_series[name] = s
                    if len(values) > 0:
                        last_ts = values[-1][0]
                        if latest_ts is None or last_ts > latest_ts:
                            latest_ts = last_ts
            except Exception:
                pass

        if metric_series:
            df_history = pd.DataFrame(metric_series).sort_index().ffill().bfill()
            obs_ts = (
                datetime.fromtimestamp(float(latest_ts), tz=timezone.utc).isoformat()
                if latest_ts is not None
                else now_dt.isoformat()
            )
            return df_history, obs_ts

        # 2. Fall back to database query (Render / Supabase environment)
        db = SessionLocal()
        try:
            stmt = (
                select(TelemetrySample)
                .where(TelemetrySample.host == canonical)
                .order_by(TelemetrySample.timestamp.desc())
                .limit(100)
            )
            db_samples = list(reversed(db.scalars(stmt).all()))

            if db_samples:
                data_rows = []
                timestamps = []
                for s in db_samples:
                    ts_val = pd.to_datetime(s.timestamp, utc=True)
                    timestamps.append(ts_val)
                    data_rows.append({
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
                        "processes": float(s.process_count or 0.0),
                        "iowait": float(s.cpu_iowait_percent or 0.0),
                        "uptime": float(s.uptime_seconds or 0.0),
                    })

                df_history = pd.DataFrame(data_rows, index=timestamps).sort_index().ffill().bfill()
                latest_ts_iso = db_samples[-1].timestamp.isoformat() if hasattr(db_samples[-1].timestamp, "isoformat") else str(db_samples[-1].timestamp)
                return df_history, latest_ts_iso

        except Exception as exc:
            logger.warning("Database fallback for get_all_metrics_history error: %s", exc)
        finally:
            db.close()

        df = pd.DataFrame()
        obs_ts = now_dt.isoformat()
        return df, obs_ts
