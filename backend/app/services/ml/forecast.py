import time
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from fastapi import HTTPException, status

import sys
from pathlib import Path

_resolved_file = Path(__file__).resolve()
if len(_resolved_file.parents) > 4 and _resolved_file.parents[3].name == "backend":
    REPO_ROOT = _resolved_file.parents[4]
else:
    REPO_ROOT = _resolved_file.parents[3]

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.ml.loader import ml_loader, TARGET_COLUMNS, HORIZONS, normalize_host
from app.services.victoriametrics import VictoriaMetricsService
from ml.training import prepare_forecasting_features

logger = logging.getLogger(__name__)
CACHE_TTL_SECONDS = 30.0
MIN_REQUIRED_HISTORICAL_SAMPLES = 13  # Minimum 13 30-second steps (6 minutes) required for lag_12 feature


def extract_context_window(df_history: pd.DataFrame, sequence_length: int = 60) -> np.ndarray:
    """
    Extracts a [T=60, D=14] float32 context window from telemetry DataFrame.
    Pads with earliest values or zeros if <60 steps available, truncates to last 60 if >60 steps.
    """
    from ml.bdh.config import FEATURE_COLUMNS
    column_mapping = {
        "process_count": "processes" if "processes" in df_history.columns and "process_count" not in df_history.columns else "process_count"
    }

    feature_series_list = []
    for feat in FEATURE_COLUMNS:
        col = column_mapping.get(feat, feat)
        if col in df_history.columns:
            series = df_history[col].astype(np.float32)
        elif feat in df_history.columns:
            series = df_history[feat].astype(np.float32)
        else:
            series = pd.Series(0.0, index=df_history.index, dtype=np.float32)
        feature_series_list.append(series)

    df_features = pd.concat(feature_series_list, axis=1)
    df_features = df_features.ffill().bfill().fillna(0.0)

    arr = df_features.values.astype(np.float32)

    if len(arr) < sequence_length:
        pad_count = sequence_length - len(arr)
        first_row = arr[[0]] if len(arr) > 0 else np.zeros((1, len(FEATURE_COLUMNS)), dtype=np.float32)
        pad_rows = np.repeat(first_row, pad_count, axis=0)
        arr = np.vstack([pad_rows, arr])
    elif len(arr) > sequence_length:
        arr = arr[-sequence_length:]

    return arr


class ForecastService:
    """
    Service for generating telemetry forecasts using real historical telemetry from VictoriaMetrics.
    Uses per-host 30-second TTL cache to prevent repeated inference.
    Primary model: iTransformer (vNext Phase 1)
    Fallback model: HistGradientBoosting (HGB)
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
                detail="Host parameter is required (e.g. ?host=ubuntu).",
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

        # Fetch current live telemetry metrics and actual observation timestamp
        live_metrics = {}
        live_obs_ts = None
        try:
            live_metrics, live_obs_ts = await self.victoria.get_current_metrics(host=canonical_host)
        except Exception as exc:
            logger.warning("Failed retrieving current metrics for host '%s': %s", canonical_host, exc)

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
        telemetry_timestamp = live_obs_ts or obs_timestamp

        response = {
            "telemetry_timestamp": telemetry_timestamp,
            "generated_at": generated_at,
            "model_trained_at": freshness_info.get("trained_at"),
            "model_status": freshness_info.get("status", "unavailable"),
            "is_stale": freshness_info.get("is_stale", False),
            "host": canonical_host,
        }

        # STRICT PRODUCTION RULE: If historical telemetry is missing or insufficient,
        # DO NOT duplicate current value into lag features or generate fake forecasts.
        if df_history.empty or len(df_history) < MIN_REQUIRED_HISTORICAL_SAMPLES:
            response["model_status"] = "unavailable"
            response["is_stale"] = True
            response["telemetry_status"] = "insufficient_history"
            response["detail"] = (
                f"Historical telemetry for host '{canonical_host}' is unavailable or insufficient "
                f"(found {len(df_history)} samples, required {MIN_REQUIRED_HISTORICAL_SAMPLES})."
            )

            for target in TARGET_COLUMNS:
                current_val = float(live_metrics.get(target, 0.0) or 0.0)
                response[target] = {
                    "current": round(current_val, 2),
                    "strategy": "unavailable",
                    "predictions": {},
                }

            # Cache per-host unavailable response
            self._cache[cache_key] = response
            self._cache_timestamps[cache_key] = now
            return response

        # ---------------------------------------------------------------------
        # Primary Path: iTransformer Architecture
        # ---------------------------------------------------------------------
        itransformer_adapter = ml_loader.get_itransformer_model(host=canonical_host)
        itransformer_success = False
        itransformer_preds = None

        if itransformer_adapter is not None:
            try:
                context_window = extract_context_window(df_history, sequence_length=60)
                itransformer_preds = itransformer_adapter.predict(context_window)

                if (
                    isinstance(itransformer_preds, dict)
                    and all(t in itransformer_preds for t in TARGET_COLUMNS)
                ):
                    has_nan = False
                    for t in TARGET_COLUMNS:
                        for h in HORIZONS:
                            val = itransformer_preds[t].get(h)
                            if val is None or np.isnan(val).any():
                                has_nan = True
                                break
                        if has_nan:
                            break

                    if not has_nan:
                        itransformer_success = True
            except Exception as exc:
                logger.warning(
                    "iTransformer primary forecast inference failed for host '%s': %s",
                    canonical_host,
                    exc,
                )

        if itransformer_success and itransformer_preds is not None:
            logger.info("Successfully generated forecasts using primary model 'iTransformer' for host '%s'", canonical_host)
            response["primary_model"] = "iTransformer"
            response["fallback_used"] = False
            response["model_version"] = "vNext-Phase1-iTransformer"

            for target in TARGET_COLUMNS:
                hist_latest = float(df_history[target].iloc[-1]) if target in df_history.columns else 0.0
                current_val = float(live_metrics.get(target, hist_latest) if live_metrics.get(target) is not None else hist_latest)

                predictions = {}
                for horizon in HORIZONS:
                    pred_val = itransformer_preds[target][horizon]
                    if isinstance(pred_val, (np.ndarray, list)):
                        pred_val = float(pred_val.flat[0])
                    predictions[horizon] = round(max(0.0, float(pred_val)), 2)

                response[target] = {
                    "current": round(current_val, 2),
                    "strategy": "iTransformer",
                    "predictions": predictions,
                }
        else:
            # -----------------------------------------------------------------
            # Fallback Path: HistGradientBoosting (HGB) Mechanism
            # -----------------------------------------------------------------
            logger.warning(
                "Primary model 'iTransformer' unavailable or failed for host '%s'. Executing HGB fallback path.",
                canonical_host,
            )
            response["primary_model"] = "iTransformer"
            response["fallback_used"] = True
            response["model_version"] = "vNext-Phase1-HGB-fallback"

            for target in TARGET_COLUMNS:
                hist_latest = float(df_history[target].iloc[-1]) if target in df_history.columns else 0.0
                current_val = float(live_metrics.get(target, hist_latest) if live_metrics.get(target) is not None else hist_latest)

                meta_5m = ml_loader.get_forecast_meta(target, "5m", host=canonical_host)
                target_strategy = meta_5m.get("strategy", "persistence") if meta_5m else "persistence"
                strategy_name = "HGB" if target_strategy == "model" else target_strategy

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
                                logger.warning("HGB inference error for %s %s on %s: %s", target, horizon, canonical_host, err)
                                predictions[horizon] = round(current_val, 2)
                        else:
                            predictions[horizon] = round(current_val, 2)
                    else:
                        predictions[horizon] = round(current_val, 2)

                response[target] = {
                    "current": round(current_val, 2),
                    "strategy": strategy_name,
                    "predictions": predictions,
                }

        # Cache host result
        self._cache[cache_key] = response
        self._cache_timestamps[cache_key] = now

        return response
