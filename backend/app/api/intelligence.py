from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.permissions import require_viewer
from app.services.ml.forecast import ForecastService
from app.services.ml.anomaly import AnomalyService

router = APIRouter(
    prefix="/intelligence",
    tags=["Intelligence"],
    dependencies=[Depends(require_viewer)],
)

forecast_service = ForecastService()
anomaly_service = AnomalyService()


def validate_host(host: str | None) -> str | None:
    if host is not None:
        clean = host.strip()
        if not clean.replace("_", "").replace("-", "").isalnum():
            raise HTTPException(
                status_code=400,
                detail="Invalid host parameter",
            )
        return clean
    return None


@router.get("/forecast")
async def get_forecast(
    host: str | None = Query(
        None,
        description="Optional target hostname filter (e.g. ubuntu, kali)",
    )
):
    """
    Returns 5m, 15m, 30m, 1h, 3h predictions for CPU, Memory, and Load 1m.
    Supports host-aware filtering.
    """
    clean_host = validate_host(host)
    return await forecast_service.get_forecasts(host=clean_host)


@router.get("/anomaly")
async def get_anomaly(
    host: str | None = Query(
        None,
        description="Optional target hostname filter (e.g. ubuntu, kali)",
    )
):
    """
    Returns server anomaly score, severity, and anomaly classification.
    Supports host-aware filtering.
    """
    clean_host = validate_host(host)
    return await anomaly_service.get_anomaly_score(host=clean_host)
