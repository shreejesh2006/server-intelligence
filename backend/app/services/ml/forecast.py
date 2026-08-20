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
    Uses 30-second TTL cache to prevent repeated inference.
    """
    def __init__(self):
        self.victoria = VictoriaMetricsService()
        self._cache = None
        self._cache_timestamp = 0.0

    async def get_forecasts(self) -> dict:
        now = time.time()
        # Return cached forecast if within 30-second TTL
        if self._cache is not None and (now - self._cache_timestamp) < CACHE_TTL_SECONDS:
            return self._cache

        # Ensure ML artifacts are available even if startup loading
        # was skipped or the container was started unusually.
        ml_loader.ensure_loaded()

        if not ml_loader.is_forecast_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Forecast models not available",
            )

        # Fetch current live telemetry metrics using VictoriaMetricsService
        try:
            live_metrics = await self.victoria.get_current_metrics()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid telemetry: {exc}",
            ) from exc

        generated_at = datetime.now(timezone.utc).isoformat()
        response = {"generated_at": generated_at}

        for target in TARGET_COLUMNS:
            current_val = float(live_metrics.get(target, 0.0) or 0.0)

            # Determine dominant strategy from metadata (e.g. if 5m is model)
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
                            # Construct single observation feature DataFrame matching metadata feature_columns
                            feat_dict = {}
                            feature_cols = meta["feature_columns"]
                            for col in feature_cols:
                                if col.startswith(f"{target}_lag_"):
                                    feat_dict[col] = current_val
                                elif col.startswith(f"{target}_roll_"):
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
                            # Fall back to current value persistence if feature engineering encounters missing values
                            predictions[horizon] = round(current_val, 2)
                    else:
                        predictions[horizon] = round(current_val, 2)
                else:
                    predictions[horizon] = round(current_val, 2)

            response[target] = {
                "current": round(current_val, 2),
                "strategy": target_strategy,
                "predictions": predictions
            }

        # Cache result for 30 seconds
        self._cache = response
        self._cache_timestamp = now

        return response
