from fastapi import APIRouter, HTTPException, Query

from app.services.victoriametrics import VictoriaMetricsService, normalize_host


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

    "iowait": "server_cpu_iowait_percent",

    "uptime": "server_uptime_seconds",
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


@router.get("/current")
async def current_metrics(
    host: str | None = Query(default=None),
):
    result = {}
    target_canonical = normalize_host(host)

    try:
        for name, metric in SUPPORTED_METRICS.items():

            query = build_query(metric, host)

            data = await victoria.query(query)

            if not data:
                result[name] = None
                continue

            # Select matching host series using host normalization
            if target_canonical:
                matching = [
                    item
                    for item in data
                    if normalize_host(item.get("metric", {}).get("host")) == target_canonical
                ]

                if not matching:
                    result[name] = None
                    continue

                data = matching

            result[name] = float(
                data[0]["value"][1]
            )

        return {
            "status": "success",
            "host": host,
            "metrics": result,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Metrics backend unavailable: {exc}",
        ) from exc


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
):
    metric = SUPPORTED_METRICS.get(metric_name)
    target_canonical = normalize_host(host)

    if metric is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric: {metric_name}",
        )

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

        if not data:
            return {
                "metric": metric_name,
                "host": host,
                "values": [],
            }

        if target_canonical:
            matching = [
                item
                for item in data
                if normalize_host(item.get("metric", {}).get("host")) == target_canonical
            ]

            if not matching:
                return {
                    "metric": metric_name,
                    "host": host,
                    "values": [],
                }

            data = matching

        values = [
            {
                "timestamp": float(timestamp),
                "value": float(value),
            }
            for timestamp, value
            in data[0]["values"]
        ]

        return {
            "metric": metric_name,
            "host": host,
            "start": start,
            "end": end,
            "step": step,
            "values": values,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Metrics backend unavailable: {exc}",
        ) from exc
