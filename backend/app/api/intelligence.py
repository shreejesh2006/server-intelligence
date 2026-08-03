from fastapi import APIRouter, Depends

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


@router.get("/forecast")
async def get_forecast():
    """
    Returns 5m, 15m, 30m, 1h, 3h predictions for CPU, Memory, and Load 1m.
    Respects saved strategy ('persistence' vs 'model') from metadata.
    """
    return await forecast_service.get_forecasts()


@router.get("/anomaly")
async def get_anomaly():
    """
    Returns current server anomaly score, severity, and anomaly classification.
    Evaluated using trained Isolation Forest pipeline.
    """
    return await anomaly_service.get_anomaly_score()
