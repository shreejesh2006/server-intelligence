from fastapi import APIRouter, HTTPException, Query

from app.services.victoriametrics import VictoriaMetricsService


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

    # Hostnames are restricted to safe PromQL label characters.
    if not host.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Invalid host",
        )

    return f'{metric}{{host="{host}"}}'


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

    try:
        for name, metric in SUPPORTED_METRICS.items():

            query = build_query(metric, host)

            data = await victoria.query(query)

            if not data:
                result[name] = None
                continue

            # When a host was explicitly requested, select that exact series.
            if host:
                matching = [
                    item
                    for item in data
                    if item.get("metric", {}).get("host") == host
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


@router.get("/{metric_name}")
async def metric_history(
    metric_name: str,
    host: str | None = Query(default=None),
    start: str = Query(default="-1h"),
    end: str = Query(default="now"),
    step: str = Query(default="30s"),
):
    metric = SUPPORTED_METRICS.get(metric_name)

    if metric is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric: {metric_name}",
        )

    try:
        query = build_query(metric, host)

        data = await victoria.query_range(
            query=query,
            start=start,
            end=end,
            step=step,
        )

        if not data:
            return {
                "metric": metric_name,
                "host": host,
                "values": [],
            }

        if host:
            matching = [
                item
                for item in data
                if item.get("metric", {}).get("host") == host
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
