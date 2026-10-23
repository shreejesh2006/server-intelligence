import uuid
import logging
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status

from app.auth.permissions import require_viewer, require_operator
from app.services.ml.forecast import ForecastService
from app.services.ml.anomaly import AnomalyService
from app.services.ml.loader import ml_loader, normalize_host, KNOWN_HOSTS
from ml.training import train_host_models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/intelligence",
    tags=["Intelligence"],
    dependencies=[Depends(require_viewer)],
)

forecast_service = ForecastService()
anomaly_service = AnomalyService()

# In-memory background retraining job status tracker
retrain_jobs = {}
retrain_lock = asyncio.Lock()


def validate_host(host: str | None) -> str | None:
    if host is not None:
        clean = host.strip()
        if not clean.replace("_", "").replace("-", "").replace(".", "").isalnum():
            raise HTTPException(
                status_code=400,
                detail="Invalid host parameter",
            )
        canonical = normalize_host(clean)
        if not canonical:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS}",
            )
        return canonical
    return None


async def run_retraining_background_job(job_id: str, host_input: str, lookback_days: int):
    """
    Background worker that runs real telemetry model retraining, updates artifacts,
    triggers ML loader hot reload, and flushes forecast/anomaly caches.
    """
    async with retrain_lock:
        retrain_jobs[job_id]["status"] = "running"
        retrain_jobs[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()

        target_hosts = list(KNOWN_HOSTS) if host_input.lower() == "all" else [normalize_host(host_input)]

        errors = []
        completed_hosts = []

        for h in target_hosts:
            if not h:
                continue
            try:
                # Run synchronous model training in thread pool to avoid blocking event loop
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    train_host_models,
                    h,
                    lookback_days,
                )
                # Hot-reload newly trained artifacts in loader
                ml_loader.reload_host(h)
                # Flush caches for host
                forecast_service.clear_cache(h)
                anomaly_service.clear_cache(h)
                completed_hosts.append(h)
            except Exception as exc:
                logger.exception("Retraining error for host '%s'", h)
                errors.append(f"{h}: {str(exc)}")

        retrain_jobs[job_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
        if errors and not completed_hosts:
            retrain_jobs[job_id]["status"] = "failed"
            retrain_jobs[job_id]["error"] = "; ".join(errors)
        else:
            retrain_jobs[job_id]["status"] = "completed"
            retrain_jobs[job_id]["completed_hosts"] = completed_hosts
            if errors:
                retrain_jobs[job_id]["warnings"] = "; ".join(errors)


@router.get("/forecast")
async def get_forecast(
    host: str | None = Query(
        None,
        description="Optional target hostname filter (e.g. ubuntu, 100.108.160.2)",
    )
):
    """
    Returns 5m, 15m, 30m, 1h, 3h predictions for CPU, Memory, and Load 1m.
    Driven by real VictoriaMetrics historical telemetry and supports host-aware filtering.
    """
    clean_host = validate_host(host)
    return await forecast_service.get_forecasts(host=clean_host)


@router.get("/anomaly/history")
async def get_anomaly_history(
    host: str | None = Query(
        None,
        description="Target host filter (e.g. ubuntu)",
    ),
    lookback: str = Query(
        "1h",
        description="Lookback window (5m, 15m, 30m, 1h, 3h, 6h, 12h, 1d, 7d)",
    ),
):
    """
    Returns continuous historical anomaly evaluation points for a host across the requested lookback window.
    Evaluates real VictoriaMetrics range telemetry with the host-specific anomaly detector.
    """
    clean_host = validate_host(host)
    return await anomaly_service.get_anomaly_history(host=clean_host, lookback=lookback)


@router.get("/anomaly")
async def get_anomaly(
    host: str | None = Query(
        None,
        description="Optional target hostname filter (e.g. ubuntu, 100.108.160.2)",
    )
):
    """
    Returns server anomaly score, severity, anomaly classification, and multi-metric explainability analysis.
    Supports host-aware filtering and exposes model freshness metadata.
    """
    clean_host = validate_host(host)
    return await anomaly_service.get_anomaly_score(host=clean_host)



@router.post("/retrain", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_operator)])
async def trigger_retraining(
    background_tasks: BackgroundTasks,
    host: str = Query("all", description="Target host to retrain ('ubuntu' or 'all')"),
    lookback_days: int = Query(7, ge=1, le=90, description="Rolling lookback window in days"),
):
    """
    Triggers asynchronous background retraining for forecasting and anomaly models
    using real telemetry from VictoriaMetrics. Retrained models are hot-reloaded automatically.
    """
    target_host = host.strip()
    if target_host.lower() != "all" and not normalize_host(target_host):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target host identifier: '{host}'. Supported hosts: {KNOWN_HOSTS} or 'all'",
        )

    job_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    retrain_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "host": target_host,
        "lookback_days": lookback_days,
        "created_at": now_iso,
    }

    background_tasks.add_task(run_retraining_background_job, job_id, target_host, lookback_days)

    return {
        "message": "Retraining job submitted successfully.",
        "job_id": job_id,
        "status": "queued",
        "host": target_host,
        "lookback_days": lookback_days,
        "submitted_at": now_iso,
    }


@router.get("/retrain/status", dependencies=[Depends(require_viewer)])
async def get_retraining_status(
    job_id: str | None = Query(None, description="Optional job_id filter"),
):
    """
    Returns background retraining job status information.
    """
    if job_id:
        if job_id not in retrain_jobs:
            raise HTTPException(status_code=404, detail="Job ID not found")
        return retrain_jobs[job_id]

    return {
        "active_jobs_count": len([j for j in retrain_jobs.values() if j.get("status") in ("queued", "running")]),
        "jobs": list(retrain_jobs.values())[-10:],
    }


@router.get("/capacity")
async def get_capacity(
    host: str | None = Query(
        None,
        description="Optional target hostname filter (e.g. ubuntu)",
    )
):
    """
    Returns resource-capacity intelligence and projected exhaustion estimates.
    Distinguishes current utilization, forecasted values, threshold breaches, and headroom.
    """
    canonical_host = validate_host(host)
    return await forecast_service.get_capacity_intelligence(host=canonical_host)


@router.get("/correlate")
async def correlate_host_intelligence(
    host: str = Query(..., description="Target server host (e.g. ubuntu)"),
    window_minutes: int = Query(default=15, ge=1, le=120, description="Log correlation window in minutes"),
):
    """
    Unified operational correlation for investigation:
    Combines live metrics, multi-horizon forecasts, multivariate anomaly score,
    nearby operational logs from VictoriaLogs, and NetBox infrastructure inventory.
    """
    canonical_host = validate_host(host) or "ubuntu"

    # 1. Fetch live metrics
    from app.services.victoriametrics import VictoriaMetricsService
    vm = VictoriaMetricsService()
    try:
        current_metrics, obs_ts = await vm.get_current_metrics(host=canonical_host)
    except Exception:
        current_metrics, obs_ts = {}, datetime.now(timezone.utc).isoformat()

    # 2. Fetch forecast and capacity
    try:
        capacity = await forecast_service.get_capacity_intelligence(host=canonical_host)
    except Exception as exc:
        capacity = {"status": "unavailable", "detail": str(exc)}

    # 3. Fetch anomaly score
    try:
        anomaly = await anomaly_service.get_anomaly_score(host=canonical_host)
    except Exception as exc:
        anomaly = {"status": "unavailable", "detail": str(exc)}

    # 4. Fetch nearby operational logs from VictoriaLogs
    from app.services.victorialogs import victorialogs_service
    try:
        logs_res = await victorialogs_service.correlate_logs(
            host=canonical_host,
            timestamp=obs_ts,
            window_minutes=window_minutes,
        )
    except Exception as exc:
        logs_res = {"status": "unavailable", "detail": str(exc), "logs": []}

    # 5. Fetch NetBox infrastructure inventory
    from app.services.netbox import netbox_service
    try:
        inventory_device = await netbox_service.get_device_by_host(canonical_host)
    except Exception as exc:
        inventory_device = None

    return {
        "status": "success",
        "host": canonical_host,
        "correlated_at": datetime.now(timezone.utc).isoformat(),
        "telemetry": {
            "timestamp": obs_ts,
            "metrics": current_metrics,
        },
        "forecast_capacity": capacity,
        "anomaly": anomaly,
        "logs": {
            "source": logs_res.get("source", "none"),
            "total": logs_res.get("total", 0),
            "entries": logs_res.get("logs", []),
            "window_minutes": window_minutes,
        },
        "inventory": inventory_device,
    }

