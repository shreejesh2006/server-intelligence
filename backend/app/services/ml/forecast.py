import time
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.services.ml.loader import ml_loader, TARGET_COLUMNS, HORIZONS, normalize_host
from app.services.victoriametrics import VictoriaMetricsService
from ml.training import prepare_forecasting_features

logger = logging.getLogger(__name__)
CACHE_TTL_SECONDS = 30.0
MIN_REQUIRED_HISTORICAL_SAMPLES = 13  # Minimum 13 30-second steps (6 minutes) required for lag_12 feature


class ForecastService:
    """
    Service for generating telemetry forecasts using real historical telemetry from VictoriaMetrics.
    Uses per-host 30-second TTL cache to prevent repeated inference.
    """
    def __init__(self):
        self.victoria = VictoriaMetricsService()
        self._cache = {}
        self._cache_timestamps = {}

    def clear_cache(self, host: str | None = None):
        """Clears forecast cache for a specific host or all hosts."""
        canonical = normalize_host(host)
        if canonical and canonical in self._cache:
            self._cache.pop(canonical, None)
            self._cache_timestamps.pop(canonical, None)
            logger.info("Cleared forecast cache for host '%s'", canonical)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()
            logger.info("Cleared forecast cache for all hosts")

    async def get_forecasts(self, host: str | None = None) -> dict:
        canonical_host = normalize_host(host)
        if not canonical_host:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Host parameter is required (e.g. ?host=ubuntu or ?host=kali).",
            )

        now = time.time()
        cache_key = canonical_host

        # Check 30-second per-host TTL cache
        if (
            cache_key in self._cache
            and (now - self._cache_timestamps.get(cache_key, 0.0)) < CACHE_TTL_SECONDS
        ):
            return self._cache[cache_key]

        # Ensure ML loader is initialized
        ml_loader.ensure_loaded()

        # Retrieve real 30-minute historical telemetry window from VictoriaMetrics
        try:
            df_history, obs_timestamp = await self.victoria.get_all_metrics_history(
                host=canonical_host,
                lookback_minutes=30,
                step="30s",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed retrieving telemetry history from VictoriaMetrics: {exc}",
            ) from exc

        freshness_info = ml_loader.check_model_freshness(host=canonical_host)
        generated_at = datetime.now(timezone.utc).isoformat()

        response = {
            "telemetry_timestamp": obs_timestamp,
            "generated_at": generated_at,
            "model_trained_at": freshness_info.get("trained_at"),
            "model_status": freshness_info.get("status", "unavailable"),
            "is_stale": freshness_info.get("is_stale", False),
            "host": canonical_host,
        }

        # STRICT PRODUCTION RULE: If historical telemetry is missing or insufficient,
        # DO NOT duplicate current value into lag features or generate fake forecasts.
        if df_history.empty or len(df_history) < MIN_REQUIRED_HISTORICAL_SAMPLES:
            current_live_metrics = {}
            try:
                current_live_metrics, obs_timestamp = await self.victoria.get_current_metrics(host=canonical_host)
                response["telemetry_timestamp"] = obs_timestamp
            except Exception:
                pass

            response["model_status"] = "unavailable"
            response["is_stale"] = True
            response["telemetry_status"] = "insufficient_history"
            response["detail"] = (
                f"Historical telemetry for host '{canonical_host}' is unavailable or insufficient "
                f"(found {len(df_history)} samples, required {MIN_REQUIRED_HISTORICAL_SAMPLES})."
            )

            for target in TARGET_COLUMNS:
                current_val = float(current_live_metrics.get(target, 0.0) or 0.0)
                response[target] = {
                    "current": round(current_val, 2),
                    "strategy": "unavailable",
                    "predictions": {},
                }

            # Cache per-host unavailable response
            self._cache[cache_key] = response
            self._cache_timestamps[cache_key] = now
            return response

        # Real historical feature extraction and model inference
        for target in TARGET_COLUMNS:
            current_val = float(df_history[target].iloc[-1])

            meta_5m = ml_loader.get_forecast_meta(target, "5m", host=canonical_host)
            target_strategy = meta_5m.get("strategy", "persistence") if meta_5m else "persistence"

            predictions = {}
            for horizon in HORIZONS:
                meta = ml_loader.get_forecast_meta(target, horizon, host=canonical_host)
                strategy = meta.get("strategy", "persistence") if meta else "persistence"

                if strategy == "persistence":
                    predictions[horizon] = round(current_val, 2)
                elif strategy == "model":
                    model = ml_loader.get_forecast_model(target, horizon, host=canonical_host)
                    if model is not None and meta and "feature_columns" in meta:
                        try:
                            feature_cols = meta["feature_columns"]
                            prepared_df, _ = prepare_forecasting_features(df_history, target)
                            clean_df = prepared_df.dropna(subset=feature_cols)

                            if not clean_df.empty:
                                X_df = clean_df.iloc[[-1]][feature_cols]
                                pred_val = float(model.predict(X_df)[0])
                                predictions[horizon] = round(max(0.0, pred_val), 2)
                            else:
                                predictions[horizon] = round(current_val, 2)
                        except Exception as err:
                            logger.warning("Inference error for %s %s on %s: %s", target, horizon, canonical_host, err)
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

        # Cache host result
        self._cache[cache_key] = response
        self._cache_timestamps[cache_key] = now

        return response
