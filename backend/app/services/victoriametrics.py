import os
import httpx
import pandas as pd
from datetime import datetime, timezone, timedelta

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
        Returns tuple of (metrics_dict, observation_timestamp_iso).
        """
        canonical = normalize_host(host)
        if not canonical:
            raise ValueError("Host parameter is required for intelligence metric queries.")

        result = {}
        latest_ts = None

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

        obs_timestamp = (
            datetime.fromtimestamp(float(latest_ts), tz=timezone.utc).isoformat()
            if latest_ts is not None
            else datetime.now(timezone.utc).isoformat()
        )

        return result, obs_timestamp

    async def get_all_metrics_history(
        self,
        host: str | None,
        lookback_minutes: int = 30,
        step: str = "30s",
    ) -> tuple[pd.DataFrame, str | None]:
        """
        Fetches continuous historical telemetry for the requested host using query_range.
        Returns (df_history, latest_observation_timestamp_iso).
        """
        canonical = normalize_host(host)
        if not canonical:
            raise ValueError("Host parameter is required for historical telemetry queries.")

        now_dt = datetime.now(timezone.utc)
        start_dt = now_dt - timedelta(minutes=lookback_minutes)

        start_str = start_dt.isoformat()
        end_str = now_dt.isoformat()

        metric_series = {}
        latest_ts = None

        for name, base_metric in METRICS_MAP.items():
            query_str = self.build_metric_query(base_metric, canonical)
            try:
                data = await self.query_range(query_str, start=start_str, end=end_str, step=step)
                if data and len(data) > 0 and "values" in data[0]:
                    values = data[0]["values"]  # list of [ts, val_str]
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

        if not metric_series:
            df = pd.DataFrame()
            obs_ts = now_dt.isoformat()
            return df, obs_ts

        df_history = pd.DataFrame(metric_series).sort_index().ffill().bfill()

        obs_ts = (
            datetime.fromtimestamp(float(latest_ts), tz=timezone.utc).isoformat()
            if latest_ts is not None
            else now_dt.isoformat()
        )

        return df_history, obs_ts
