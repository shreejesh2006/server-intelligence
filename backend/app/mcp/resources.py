"""
MCP Resource definitions (URIs for infrastructure telemetry & intelligence).
"""
from typing import Dict, Any
from app.mcp.tools import get_server_status, query_metrics, get_forecast, get_anomaly

RESOURCE_SCHEMAS = {
    "server://{host}": "Host hardware state, uptime, and summary telemetry",
    "telemetry://{host}/{metric}": "Raw metric time series for cpu, memory, disk, load_1m",
    "forecast://{host}": "Member 1 ML/BDH future metric trajectory",
    "anomaly://{host}": "Member 1 Isolation Forest/BDH anomaly score and alerts",
}


async def read_resource(uri: str) -> Dict[str, Any]:
    """Resolves MCP URI schemes to live backend telemetry."""
    if uri.startswith("server://"):
        host = uri.replace("server://", "").strip()
        return await get_server_status(host=host)

    if uri.startswith("forecast://"):
        host = uri.replace("forecast://", "").strip()
        return await get_forecast(host=host)

    if uri.startswith("anomaly://"):
        host = uri.replace("anomaly://", "").strip()
        return await get_anomaly(host=host)

    if uri.startswith("telemetry://"):
        parts = uri.replace("telemetry://", "").split("/")
        host = parts[0] if len(parts) > 0 else "ubuntu"
        metric = parts[1] if len(parts) > 1 else "cpu"
        return await query_metrics(host=host, metric=metric)

    return {"error": f"Unsupported MCP resource URI: {uri}"}