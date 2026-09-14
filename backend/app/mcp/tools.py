"""
MCP Tools Implementation for Server Intelligence Platform.
"""
from typing import Dict, Any
from pydantic import BaseModel, Field

# Input Schemas
class HostInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target host name (e.g. 'ubuntu', 'kali')")

class MetricQueryInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target host name")
    metric: str = Field(description="Metric name: 'cpu', 'memory', 'disk', or 'load_1m'")
    duration: str = Field(default="1h", description="Time window, e.g. '15m', '1h', '6h'")

# Tool Implementations with Lazy Imports
async def get_server_status(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves current telemetry, load, and health state for a server."""
    try:
        from app.services.victoriametrics import vm_service
        metrics = await vm_service.get_latest_metrics(host=host)
        return {
            "host": host,
            "status": "online" if metrics else "unreachable",
            "telemetry": metrics or {}
        }
    except Exception as e:
        return {"host": host, "status": "error", "error": str(e)}

async def query_metrics(host: str = "ubuntu", metric: str = "cpu", duration: str = "1h") -> Dict[str, Any]:
    """Retrieves time-series metrics from VictoriaMetrics for trend analysis."""
    try:
        from app.services.victoriametrics import vm_service
        history = await vm_service.query_range(host=host, metric=metric, duration=duration)
        return {
            "host": host,
            "metric": metric,
            "duration": duration,
            "data_points": len(history) if isinstance(history, list) else 0,
            "history": history
        }
    except Exception as e:
        return {"host": host, "metric": metric, "error": str(e)}

async def get_forecast(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves predictive forecasts (Member 1 ML/BDH engine contract)."""
    try:
        from app.services.ml.forecast import ForecastService
        forecast_service = ForecastService()
        forecast = await forecast_service.get_host_forecast(host=host)
        return {
            "host": host,
            "forecast": forecast or {}
        }
    except Exception as e:
        return {"host": host, "error": f"Forecast service error: {str(e)}"}

async def get_anomaly(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves anomaly scores and detected abnormal behavior (Member 1 contract)."""
    try:
        from app.services.ml.anomaly import AnomalyService
        anomaly_service = AnomalyService()
        anomaly = await anomaly_service.detect_host_anomaly(host=host)
        return {
            "host": host,
            "anomaly": anomaly or {}
        }
    except Exception as e:
        return {"host": host, "error": f"Anomaly service error: {str(e)}"}

# JSON Schemas for LLM Tool Calling
AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_server_status",
            "description": "Get current real-time metrics, health, and status for a server host.",
            "parameters": HostInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_metrics",
            "description": "Fetch historical metric time-series to check trends (CPU, memory, disk, load).",
            "parameters": MetricQueryInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": "Fetch ML future metric trend projections (5m, 15m, 30m, 1h, 3h).",
            "parameters": HostInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_anomaly",
            "description": "Fetch real-time anomaly scores, contributing signals, and severity level.",
            "parameters": HostInput.model_json_schema()
        }
    }
]

TOOL_REGISTRY = {
    "get_server_status": get_server_status,
    "query_metrics": query_metrics,
    "get_forecast": get_forecast,
    "get_anomaly": get_anomaly,
}