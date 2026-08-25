import time
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.services.ml.loader import ml_loader, TARGET_COLUMNS, HORIZONS
from app.services.victoriametrics import VictoriaMetricsService

CACHE_TTL_SECONDS = 30.0


class ForecastService:
    """
    Service for generating telemetry forecasts.
    Respects saved metadata strategies ('persistence' vs 'model').
    Uses per-host 30-second TTL cache to prevent repeated inference.
    """
    def __init__(self):
        self.victoria = VictoriaMetricsService()
        self._cache = {}
        self._cache_timestamps = {}

    async def get_forecasts(self, host: str | None = None) -> dict:
        now = time.time()
        cache_key = host or "default"

        # Return cached forecast for this host if within 30-second TTL
        if (
            cache_key in self._cache
            and (now - self._cache_timestamps.get(cache_key, 0.0)) < CACHE_TTL_SECONDS
        ):
            return self._cache[cache_key]

        # Ensure ML artifacts are loaded
        ml_loader.ensure_loaded()

        if not ml_loader.is_forecast_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Forecast models not available",
            )

        # Fetch current live telemetry metrics for the requested host
        try:
            live_metrics = await self.victoria.get_current_metrics(host=host)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid telemetry: {exc}",
            ) from exc

        generated_at = datetime.now(timezone.utc).isoformat()
        response = {
            "generated_at": generated_at,
            "host": host or "all",
        }

        for target in TARGET_COLUMNS:
            current_val = float(live_metrics.get(target, 0.0) or 0.0)

            meta_5m = ml_loader.get_forecast_meta(target, '5m')
            target_strategy = meta_5m.get('strategy', 'persistence') if meta_5m else 'persistence'

            predictions = {}
            for horizon in HORIZONS:
                meta = ml_loader.get_forecast_meta(target, horizon)
                strategy = meta.get('strategy', 'persistence') if meta else 'persistence'

                if strategy == 'persistence':
                    predictions[horizon] = round(current_val, 2)
                elif strategy == 'model':
                    model = ml_loader.get_forecast_model(target, horizon)
                    if model is not None and meta and "feature_columns" in meta:
                        try:
                            feat_dict = {}
                            feature_cols = meta["feature_columns"]
                            for col in feature_cols:
                                if col.startswith(f"{target}_lag_") or col.startswith(f"{target}_roll_"):
                                    feat_dict[col] = current_val
                                elif col.startswith("aux_"):
                                    aux_name = col.replace("aux_", "").replace("_t", "")
                                    feat_dict[col] = float(live_metrics.get(aux_name, 0.0) or 0.0)
                                else:
                                    feat_dict[col] = current_val

                            X_df = pd.DataFrame([feat_dict])[feature_cols]
                            pred_val = float(model.predict(X_df)[0])
                            predictions[horizon] = round(max(0.0, pred_val), 2)
                        except Exception:
                            predictions[horizon] = round(current_val, 2)
                    else:
                        predictions[horizon] = round(current_val, 2)
                else:
                    predictions[horizon] = round(current_val, 2)

            response[target] = {
                "current": round(current_val, 2),
                "strategy": target_strategy,
                "predictions": predictions,
            }

        # Cache per-host result
        self._cache[cache_key] = response
        self._cache_timestamps[cache_key] = now

        return response
