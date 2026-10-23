"""
MCP Tools Implementation for Server Intelligence Platform.
"""
import re
import time
from typing import Dict, Any
from pydantic import BaseModel, Field

from app.database.database import SessionLocal

# Input Schemas
class HostInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target host name (e.g. 'ubuntu')")

class MetricQueryInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target host name")
    metric: str = Field(description="Metric name: 'cpu', 'memory', 'disk', 'swap', 'load_1m', 'load_5m', 'load_15m', 'network_rx', 'network_tx', 'disk_read', 'disk_write', 'processes', 'iowait', 'uptime'")
    duration: str = Field(default="1h", description="Time window, e.g. '15m', '30m', '1h', '3h', '6h', '12h', '24h'")

class PredictiveAlertQueryInput(BaseModel):
    host: str | None = Field(default=None, description="Optional target server host filter ('ubuntu')")
    status: str | None = Field(default=None, description="Optional status filter ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')")
    limit: int = Field(default=10, description="Max alerts to return (1-50)")

class ForecastBreachExplanationInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target server host ('ubuntu')")
    metric: str = Field(default="cpu", description="Metric to explain: 'cpu' or 'memory'")

class RemediationRecommendationInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target server host ('ubuntu')")
    metric: str = Field(default="cpu", description="Metric name ('cpu', 'memory')")
    alert_id: int | None = Field(default=None, description="Optional alert ID to ground recommendation")

class AutomationHistoryInput(BaseModel):
    automation_id: int | None = Field(default=None, description="Optional automation rule ID")
    limit: int = Field(default=10, description="Max runs to return (1-50)")

class SearchLogsInput(BaseModel):
    host: str | None = Field(default=None, description="Optional host filter ('ubuntu')")
    query: str | None = Field(default=None, description="Search term or phrase in log messages")
    level: str | None = Field(default=None, description="Optional level: 'INFO', 'WARN', 'ERROR', 'CRITICAL'")
    limit: int = Field(default=20, description="Max log entries to retrieve (1-100)")

class InfrastructureInventoryInput(BaseModel):
    host: str | None = Field(default=None, description="Optional host filter ('ubuntu')")

class CorrelateIncidentInput(BaseModel):
    host: str = Field(default="ubuntu", description="Target server host ('ubuntu')")
    window_minutes: int = Field(default=15, description="Time window in minutes around latest telemetry")

class EmptyInput(BaseModel):
    pass

# Supported Metric Mappings (Canonical to Prometheus metric name)
SUPPORTED_METRICS_MAP = {
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

DURATION_SECONDS_MAP = {
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "3h": 10800,
    "6h": 21600,
    "12h": 43200,
    "24h": 86400,
    "1d": 86400,
    "7d": 604800,
}


def parse_and_bound_duration(duration_str: str) -> tuple[int, str]:
    """Parses duration string and returns (duration_seconds, step), bounded safely between 60s and 7d."""
    clean = (duration_str or "1h").strip().lower()
    if clean.startswith("-"):
        clean = clean[1:]

    if clean in DURATION_SECONDS_MAP:
        duration_seconds = DURATION_SECONDS_MAP[clean]
    else:
        match = re.match(r"^(\d+)([smhd])$", clean)
        if match:
            val, unit = int(match.group(1)), match.group(2)
            unit_map = {"s": 1, "m": 60, "h": 3600, "d": 86400}
            duration_seconds = val * unit_map.get(unit, 60)
        else:
            duration_seconds = 3600

    # Strict bounds: minimum 60s, maximum 7 days (604800s) to prevent unbounded queries
    duration_seconds = max(60, min(duration_seconds, 604800))

    if duration_seconds <= 3600:
        step = "30s"
    elif duration_seconds <= 21600:
        step = "1m"
    elif duration_seconds <= 86400:
        step = "2m"
    else:
        step = "5m"

    return duration_seconds, step


# Tool Implementations with Lazy Imports
async def get_server_status(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves current telemetry, load, and health state for a server."""
    try:
        from app.services.victoriametrics import VictoriaMetricsService, normalize_host
        canonical = normalize_host(host)
        if host and not canonical:
            return {"host": host, "status": "error", "error": f"Unknown host: '{host}'"}
        vm_service = VictoriaMetricsService()
        metrics, obs_timestamp = await vm_service.get_current_metrics(host=host)
        is_online = bool(metrics and any(v > 0.0 for v in metrics.values()))
        return {
            "host": host,
            "status": "online" if is_online else "unreachable",
            "timestamp": obs_timestamp,
            "telemetry": metrics or {}
        }
    except Exception as e:
        return {"host": host, "status": "error", "error": str(e)}


async def query_metrics(host: str = "ubuntu", metric: str = "cpu", duration: str = "1h") -> Dict[str, Any]:
    """Retrieves time-series metrics from VictoriaMetrics for trend analysis."""
    try:
        from app.services.victoriametrics import VictoriaMetricsService, normalize_host
        canonical = normalize_host(host)
        if host and not canonical:
            return {"host": host, "metric": metric, "status": "error", "error": f"Unknown host: '{host}'"}

        metric_key = (metric or "").strip().lower()
        if metric_key not in SUPPORTED_METRICS_MAP:
            return {
                "host": host,
                "metric": metric,
                "status": "error",
                "error": f"Unsupported metric: '{metric}'. Supported metrics: {sorted(list(set(SUPPORTED_METRICS_MAP.keys())))}"
            }

        duration_sec, step = parse_and_bound_duration(duration)
        now_sec = int(time.time())
        start_sec = now_sec - duration_sec

        vm_service = VictoriaMetricsService()
        prom_metric_name = SUPPORTED_METRICS_MAP[metric_key]
        query = vm_service.build_metric_query(prom_metric_name, host=host)

        data = await vm_service.query_range(
            query=query,
            start=str(start_sec),
            end=str(now_sec),
            step=step,
        )

        target_canonical = canonical or "ubuntu"
        if data and target_canonical:
            matching = [
                item
                for item in data
                if normalize_host(item.get("metric", {}).get("host")) == target_canonical
            ]
            if matching:
                data = matching
            elif any(item.get("metric", {}).get("host") for item in data):
                data = []

        points = []
        if data and len(data) > 0 and "values" in data[0]:
            points = [
                {
                    "timestamp": float(timestamp),
                    "value": float(value),
                }
                for timestamp, value in data[0]["values"]
            ]

        # Fallback to database if VictoriaMetrics returned no points
        if not points:
            try:
                from app.database.database import SessionLocal
                from app.database.models import TelemetrySample
                from sqlalchemy import select
                from datetime import datetime, timezone

                db = SessionLocal()
                try:
                    dt_start = datetime.fromtimestamp(start_sec, tz=timezone.utc)
                    dt_end = datetime.fromtimestamp(now_sec, tz=timezone.utc)
                    db_col_map = {
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
                    col_attr = db_col_map.get(metric_key)
                    if col_attr:
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
                        if db_samples:
                            points = [
                                {
                                    "timestamp": s.timestamp.timestamp(),
                                    "value": float(getattr(s, col_attr, 0.0) or 0.0),
                                }
                                for s in db_samples
                            ]
                finally:
                    db.close()
            except Exception:
                pass

        return {
            "host": host,
            "metric": metric_key,
            "duration": duration,
            "start": str(start_sec),
            "end": str(now_sec),
            "step": step,
            "data_points": len(points),
            "history": points
        }
    except Exception as e:
        return {"host": host, "metric": metric, "status": "error", "error": str(e)}


async def get_forecast(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves predictive forecasts (Member 1 ML/BDH engine contract)."""
    try:
        from app.services.ml.forecast import ForecastService
        forecast_service = ForecastService()
        forecast = await forecast_service.get_forecasts(host=host)
        return {
            "host": host,
            "status": "success",
            "forecast": forecast or {}
        }
    except Exception as e:
        return {"host": host, "status": "error", "error": f"Forecast service error: {str(e)}"}


async def get_anomaly(host: str = "ubuntu") -> Dict[str, Any]:
    """Retrieves anomaly scores and detected abnormal behavior (Member 1 contract)."""
    try:
        from app.services.ml.anomaly import AnomalyService
        anomaly_service = AnomalyService()
        anomaly = await anomaly_service.get_anomaly_score(host=host)
        return {
            "host": host,
            "status": "success",
            "anomaly": anomaly or {}
        }
    except Exception as e:
        return {"host": host, "status": "error", "error": f"Anomaly service error: {str(e)}"}


async def get_predictive_alerts(host: str | None = None, status: str | None = None, limit: int = 10) -> Dict[str, Any]:
    """Queries real predictive forecast alerts and their model evidence."""
    try:
        from app.database.models import Alert
        from app.services.ml.loader import normalize_host
        from app.services.predictive_alerts import PREDICTIVE_SOURCE

        canonical = normalize_host(host) if host else None
        db = SessionLocal()
        try:
            query = db.query(Alert).filter(Alert.source == PREDICTIVE_SOURCE)
            if canonical:
                query = query.filter((Alert.server == canonical) | (Alert.server == host))
            if status:
                query = query.filter(Alert.status == status.upper())

            bounded_limit = min(max(int(limit), 1), 50)
            alerts = query.order_by(Alert.created_at.desc()).limit(bounded_limit).all()
            return {
                "status": "success",
                "count": len(alerts),
                "alerts": [
                    {
                        "id": a.id,
                        "title": a.title,
                        "severity": a.severity,
                        "status": a.status,
                        "metric": a.metric,
                        "server": a.server,
                        "message": a.message,
                        "created_at": a.created_at.isoformat() if a.created_at else None,
                    }
                    for a in alerts
                ],
            }
        finally:
            db.close()
    except Exception as e:
        return {"status": "error", "error": f"Failed to retrieve predictive alerts: {str(e)}"}


async def explain_forecast_breach(host: str = "ubuntu", metric: str = "cpu") -> Dict[str, Any]:
    """Explains why a forecast model projects a threshold breach for a server metric."""
    try:
        from app.services.ml.forecast import ForecastService
        from app.services.ml.loader import normalize_host
        from app.services.predictive_alerts import DEFAULT_PREDICTIVE_THRESHOLDS

        canonical = normalize_host(host) or "ubuntu"
        metric_clean = "memory" if "mem" in metric.lower() else "cpu"

        forecast_service = ForecastService()
        forecasts = await forecast_service.get_forecasts(host=canonical)

        metric_data = forecasts.get(metric_clean, {})
        current_val = metric_data.get("current")
        predictions = metric_data.get("predictions", {})
        strategy = metric_data.get("strategy", "unknown")
        model_status = forecasts.get("model_status", "unavailable")

        thresholds = DEFAULT_PREDICTIVE_THRESHOLDS.get(metric_clean, {"warning": 80.0, "critical": 95.0})

        breaches = []
        for h, pred in predictions.items():
            if pred is not None and isinstance(pred, (int, float)):
                if pred >= thresholds["critical"]:
                    breaches.append({"horizon": h, "predicted_value": pred, "severity": "CRITICAL", "threshold": thresholds["critical"]})
                elif pred >= thresholds["warning"]:
                    breaches.append({"horizon": h, "predicted_value": pred, "severity": "WARNING", "threshold": thresholds["warning"]})

        explanation = (
            f"Host '{canonical}' {metric_clean.upper()} is currently at {current_val}%. "
            f"The ML model ({strategy}, status: {model_status}) projects {len(breaches)} impending breach(es) "
            f"across supported horizons. Thresholds: Warning={thresholds['warning']}%, Critical={thresholds['critical']}%."
        )

        return {
            "status": "success",
            "host": canonical,
            "metric": metric_clean,
            "current_value": current_val,
            "predictions": predictions,
            "strategy": strategy,
            "model_status": model_status,
            "thresholds": thresholds,
            "impending_breaches": breaches,
            "explanation": explanation,
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed to explain forecast breach: {str(e)}"}


async def list_automations() -> Dict[str, Any]:
    """Lists enabled and configured automation rules."""
    try:
        from app.database.models import Automation

        db = SessionLocal()
        try:
            automations = db.query(Automation).order_by(Automation.created_at.desc()).all()
            return {
                "status": "success",
                "count": len(automations),
                "automations": [
                    {
                        "id": auto.id,
                        "name": auto.name,
                        "trigger_type": auto.trigger_type,
                        "action_type": auto.action_type,
                        "status": auto.status,
                        "created_at": auto.created_at.isoformat() if auto.created_at else None,
                    }
                    for auto in automations
                ],
            }
        finally:
            db.close()
    except Exception as e:
        return {"status": "error", "error": f"Failed to list automations: {str(e)}"}


async def get_automation_history(automation_id: int | None = None, limit: int = 10) -> Dict[str, Any]:
    """Reads execution history records from AutomationRun."""
    try:
        from app.database.models import AutomationRun

        db = SessionLocal()
        try:
            query = db.query(AutomationRun)
            if automation_id:
                query = query.filter(AutomationRun.automation_id == int(automation_id))

            bounded_limit = min(max(int(limit), 1), 50)
            runs = query.order_by(AutomationRun.created_at.desc()).limit(bounded_limit).all()
            return {
                "status": "success",
                "count": len(runs),
                "runs": [
                    {
                        "id": r.id,
                        "automation_id": r.automation_id,
                        "status": r.status,
                        "output": r.output,
                        "created_at": r.created_at.isoformat() if r.created_at else None,
                    }
                    for r in runs
                ],
            }
        finally:
            db.close()
    except Exception as e:
        return {"status": "error", "error": f"Failed to get automation history: {str(e)}"}


async def recommend_remediation(host: str = "ubuntu", metric: str = "cpu", alert_id: int | None = None) -> Dict[str, Any]:
    """Generates a structured, non-destructive remediation recommendation for an operator."""
    try:
        from app.database.models import Alert
        from app.services.ml.loader import normalize_host
        from app.services.automation_engine import execute_action_recommend_remediation

        canonical = normalize_host(host) or "ubuntu"
        alert = None

        if alert_id:
            db = SessionLocal()
            try:
                alert = db.query(Alert).filter(Alert.id == int(alert_id)).first()
            finally:
                db.close()

        rec = execute_action_recommend_remediation(alert=alert, host=canonical, metric=metric)
        return {
            "status": "success",
            "host": canonical,
            "metric": metric,
            "alert_id": alert_id,
            "recommendation": rec,
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed to generate remediation recommendation: {str(e)}"}


async def search_logs(host: str | None = None, query: str | None = None, level: str | None = None, limit: int = 20) -> Dict[str, Any]:
    """Searches operational logs from VictoriaLogs with database fallback."""
    try:
        from app.services.victorialogs import victorialogs_service
        from app.services.ml.loader import normalize_host
        canonical = normalize_host(host) if host else None
        bounded_limit = max(1, min(limit, 100))
        return await victorialogs_service.query_logs(
            host=canonical,
            query=query,
            level=level,
            limit=bounded_limit,
        )
    except Exception as e:
        return {"status": "error", "error": f"Failed searching logs: {str(e)}"}


async def get_infrastructure_inventory(host: str | None = None) -> Dict[str, Any]:
    """Retrieves physical/virtual infrastructure inventory details from NetBox."""
    try:
        from app.services.netbox import netbox_service
        from app.services.ml.loader import normalize_host
        if host:
            canonical = normalize_host(host) or host
            dev = await netbox_service.get_device_by_host(canonical)
            return {"status": "success", "host": host, "device": dev}
        else:
            devices = await netbox_service.get_all_devices()
            return {"status": "success", "total": len(devices), "devices": devices}
    except Exception as e:
        return {"status": "error", "error": f"Failed retrieving inventory: {str(e)}"}


async def correlate_incident(host: str = "ubuntu", window_minutes: int = 15) -> Dict[str, Any]:
    """Correlates metrics, forecasts, anomalies, VictoriaLogs, and NetBox inventory for unified investigation."""
    try:
        from app.services.victoriametrics import VictoriaMetricsService
        from app.services.ml.forecast import ForecastService
        from app.services.ml.anomaly import AnomalyService
        from app.services.victorialogs import victorialogs_service
        from app.services.netbox import netbox_service
        from app.services.ml.loader import normalize_host

        canonical = normalize_host(host) or "ubuntu"
        vm = VictoriaMetricsService()
        fc = ForecastService()
        ano = AnomalyService()

        try:
            metrics, obs_ts = await vm.get_current_metrics(host=canonical)
        except Exception:
            metrics, obs_ts = {}, ""

        try:
            capacity = await fc.get_capacity_intelligence(host=canonical)
        except Exception as exc:
            capacity = {"status": "unavailable", "detail": str(exc)}

        try:
            anomaly = await ano.get_anomaly_score(host=canonical)
        except Exception as exc:
            anomaly = {"status": "unavailable", "detail": str(exc)}

        try:
            logs = await victorialogs_service.correlate_logs(
                host=canonical,
                timestamp=obs_ts or "now",
                window_minutes=window_minutes,
            )
        except Exception as exc:
            logs = {"status": "unavailable", "logs": []}

        try:
            dev = await netbox_service.get_device_by_host(canonical)
        except Exception:
            dev = None

        return {
            "status": "success",
            "host": canonical,
            "telemetry": metrics,
            "capacity_intelligence": capacity,
            "anomaly": anomaly,
            "correlated_logs": logs.get("logs", [])[:20],
            "inventory": dev,
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed correlating incident: {str(e)}"}


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
    },
    {
        "type": "function",
        "function": {
            "name": "get_predictive_alerts",
            "description": "Query predictive forecast alerts and their model evidence.",
            "parameters": PredictiveAlertQueryInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "explain_forecast_breach",
            "description": "Explain why a forecast projects an impending metric threshold breach.",
            "parameters": ForecastBreachExplanationInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_automations",
            "description": "Inspect configured automation and diagnostic rules.",
            "parameters": EmptyInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_automation_history",
            "description": "Read recent automation and diagnostic execution runs.",
            "parameters": AutomationHistoryInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_remediation",
            "description": "Generate a non-destructive remediation recommendation for an impending problem.",
            "parameters": RemediationRecommendationInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_logs",
            "description": "Query operational logs from VictoriaLogs with database fallback.",
            "parameters": SearchLogsInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_infrastructure_inventory",
            "description": "Retrieve physical/virtual infrastructure inventory details from NetBox.",
            "parameters": InfrastructureInventoryInput.model_json_schema()
        }
    },
    {
        "type": "function",
        "function": {
            "name": "correlate_incident",
            "description": "Correlate metrics, forecasts, anomalies, VictoriaLogs, and NetBox inventory for unified investigation.",
            "parameters": CorrelateIncidentInput.model_json_schema()
        }
    }
]

TOOL_REGISTRY = {
    "get_server_status": get_server_status,
    "query_metrics": query_metrics,
    "get_forecast": get_forecast,
    "get_anomaly": get_anomaly,
    "get_predictive_alerts": get_predictive_alerts,
    "explain_forecast_breach": explain_forecast_breach,
    "list_automations": list_automations,
    "get_automation_history": get_automation_history,
    "recommend_remediation": recommend_remediation,
    "search_logs": search_logs,
    "get_infrastructure_inventory": get_infrastructure_inventory,
    "correlate_incident": correlate_incident,
}