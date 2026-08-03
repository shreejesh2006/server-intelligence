import os
import httpx

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


class VictoriaMetricsService:
    def __init__(self, base_url: str = VICTORIAMETRICS_URL):
        self.base_url = base_url.rstrip("/")

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
            raise RuntimeError(
                "VictoriaMetrics query was unsuccessful"
            )

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
            raise RuntimeError(
                "VictoriaMetrics range query was unsuccessful"
            )

        return payload["data"]["result"]

    async def get_current_metrics(self) -> dict:
        """Fetches current values for all server telemetry metrics."""
        result = {}
        for name, query_str in METRICS_MAP.items():
            try:
                data = await self.query(query_str)
                if data and len(data) > 0 and "value" in data[0]:
                    result[name] = float(data[0]["value"][1])
                else:
                    result[name] = 0.0
            except Exception:
                result[name] = 0.0
        return result
