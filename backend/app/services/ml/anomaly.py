import time
import logging
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.services.ml.loader import ml_loader, normalize_host
from app.services.victoriametrics import VictoriaMetricsService
from ml.anomaly import METRIC_DISPLAY_NAMES, METRIC_UNITS

logger = logging.getLogger(__name__)
CACHE_TTL_SECONDS = 30.0

LOOKBACK_MINUTES_MAP = {
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "3h": 180,
    "6h": 360,
    "12h": 720,
    "1d": 1440,
    "7d": 10080,
}


class AnomalyService:
    """
    Service for scoring server telemetry anomalies using Isolation Forest.
    Supports host isolation, multi-metric explainability, deterministic primary reasoning,
    targeted recommendations, and historical timeline evaluation.
    """
    def __init__(self):
        self.victoria = VictoriaMetricsService()
        self._cache = {}
        self._cache_timestamps = {}

    def clear_cache(self, host: str | None = None):
        """Clears anomaly cache for a specific host or all hosts."""
        canonical = normalize_host(host)
        if canonical and canonical in self._cache:
            self._cache.pop(canonical, None)
            self._cache_timestamps.pop(canonical, None)
            logger.info("Cleared anomaly cache for host '%s'", canonical)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()
            logger.info("Cleared anomaly cache for all hosts")

    async def get_anomaly_score(self, host: str | None = None) -> dict:
        canonical_host = normalize_host(host)
        if not canonical_host:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Host parameter is required (e.g. ?host=ubuntu or ?host=kali).",
            )

        now = time.time()
        cache_key = canonical_host

        # Return cached anomaly result for this host if within 30-second TTL
        if (
            cache_key in self._cache
            and (now - self._cache_timestamps.get(cache_key, 0.0)) < CACHE_TTL_SECONDS
        ):
            return self._cache[cache_key]

        # Ensure ML artifacts are loaded
        ml_loader.ensure_loaded()

        # Fetch current live telemetry metrics and actual timestamp for host
        try:
            live_metrics, obs_timestamp = await self.victoria.get_current_metrics(host=canonical_host)
        except Exception as exc:
            live_metrics, obs_timestamp = {}, datetime.now(timezone.utc).isoformat()

        observation = {
            "cpu": float(live_metrics.get("cpu", 0.0) or 0.0),
            "memory": float(live_metrics.get("memory", 0.0) or 0.0),
            "load_1m": float(live_metrics.get("load_1m", 0.0) or 0.0),
            "load_5m": float(live_metrics.get("load_5m", 0.0) or 0.0),
            "load_15m": float(live_metrics.get("load_15m", 0.0) or 0.0),
            "network_rx": float(live_metrics.get("network_rx", 0.0) or 0.0),
            "network_tx": float(live_metrics.get("network_tx", 0.0) or 0.0),
            "disk_read": float(live_metrics.get("disk_read", 0.0) or 0.0),
            "disk_write": float(live_metrics.get("disk_write", 0.0) or 0.0),
            "process_count": float(live_metrics.get("processes", 0.0) or 0.0),
            "iowait": float(live_metrics.get("iowait", 0.0) or 0.0),
        }

        detector = ml_loader.get_anomaly_detector(host=canonical_host)
        if detector is None or not detector.is_loaded():
            freshness_info = ml_loader.check_model_freshness(host=canonical_host)
            fallback_metrics = [
                {
                    "metric": k,
                    "display_name": METRIC_DISPLAY_NAMES.get(k, k.upper()),
                    "current_value": round(v, 2),
                    "baseline_value": 0.0,
                    "absolute_deviation": 0.0,
                    "scaled_deviation": 0.0,
                    "deviation_percent": None,
                    "status": "NORMAL",
                    "unit": METRIC_UNITS.get(k, ""),
                    "reason": f"{METRIC_DISPLAY_NAMES.get(k, k.upper())} live value is {v:.1f} (Model unavailable).",
                }
                for k, v in observation.items()
            ]

            return {
                "host": canonical_host,
                "telemetry_timestamp": obs_timestamp,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_trained_at": freshness_info.get("trained_at"),
                "model_status": "unavailable",
                "is_stale": True,
                "telemetry_status": "model_unavailable",
                "is_anomaly": False,
                "severity": "NORMAL",
                "anomaly_score": 0.0,
                "features_evaluated": 11,
                "primary_reason": f"Anomaly detection model is unavailable for host '{canonical_host}'. Showing live telemetry values.",
                "contributing_signals": [],
                "all_metrics_evaluated": fallback_metrics,
                "recommendations": ["Train anomaly detector model for this host using real telemetry."],
                "model_metadata": {"algorithm": "IsolationForest", "host": canonical_host},
            }

        try:
            result = detector.score_telemetry(observation)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Anomaly scoring error: {exc}",
            ) from exc

        freshness_info = ml_loader.check_model_freshness(host=canonical_host)
        generated_at = datetime.now(timezone.utc).isoformat()

        response = {
            "host": canonical_host,
            "telemetry_timestamp": obs_timestamp,
            "generated_at": generated_at,
            "model_trained_at": freshness_info.get("trained_at"),
            "model_status": freshness_info.get("status", "unavailable"),
            "is_stale": freshness_info.get("is_stale", False),
            "telemetry_status": "ok",
            "is_anomaly": result.get("is_anomaly", False),
            "severity": result.get("severity", "NORMAL"),
            "anomaly_score": result.get("anomaly_score", 0.0),
            "features_evaluated": result.get("features_evaluated", 11),
            "primary_reason": result.get("primary_reason", ""),
            "contributing_signals": result.get("contributing_signals", []),
            "all_metrics_evaluated": result.get("all_metrics_evaluated", []),
            "recommendations": result.get("recommendations", []),
            "model_metadata": result.get("model_metadata", {}),
        }

        # Cache per-host result
        self._cache[cache_key] = response
        self._cache_timestamps[cache_key] = now

        return response

    async def get_anomaly_history(self, host: str | None = None, lookback: str = "1h") -> dict:
        """
        Evaluates real continuous historical telemetry range from VictoriaMetrics for a host,
        scoring each timestamp using the host's trained anomaly detector.
        """
        canonical_host = normalize_host(host)
        if not canonical_host:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Host parameter is required (e.g. ?host=ubuntu or ?host=kali).",
            )

        lookback_mins = LOOKBACK_MINUTES_MAP.get(lookback.lower(), 60)

        # Select step based on lookback to limit payload size
        if lookback_mins <= 60:
            step = "30s"
        elif lookback_mins <= 360:
            step = "2m"
        elif lookback_mins <= 1440:
            step = "5m"
        else:
            step = "15m"

        ml_loader.ensure_loaded()
        detector = ml_loader.get_anomaly_detector(host=canonical_host)

        try:
            df_history, obs_timestamp = await self.victoria.get_all_metrics_history(
                host=canonical_host,
                lookback_minutes=lookback_mins,
                step=step,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed retrieving historical telemetry from VictoriaMetrics: {exc}",
            ) from exc

        if df_history.empty or detector is None or not detector.is_loaded():
            return {
                "host": canonical_host,
                "lookback": lookback,
                "telemetry_status": "insufficient_history" if df_history.empty else "model_unavailable",
                "detail": f"Historical telemetry or anomaly detector for host '{canonical_host}' is unavailable.",
                "points": [],
            }

        points = []
        # Score historical points
        for timestamp, row in df_history.iterrows():
            obs = {
                "cpu": float(row.get("cpu", 0.0) or 0.0),
                "memory": float(row.get("memory", 0.0) or 0.0),
                "load_1m": float(row.get("load_1m", 0.0) or 0.0),
                "load_5m": float(row.get("load_5m", 0.0) or 0.0),
                "load_15m": float(row.get("load_15m", 0.0) or 0.0),
                "network_rx": float(row.get("network_rx", 0.0) or 0.0),
                "network_tx": float(row.get("network_tx", 0.0) or 0.0),
                "disk_read": float(row.get("disk_read", 0.0) or 0.0),
                "disk_write": float(row.get("disk_write", 0.0) or 0.0),
                "process_count": float(row.get("processes", 0.0) or 0.0),
                "iowait": float(row.get("iowait", 0.0) or 0.0),
            }

            try:
                res = detector.score_telemetry(obs)
                ts_str = timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp)
                points.append({
                    "timestamp": ts_str,
                    "score": res.get("anomaly_score", 0.0),
                    "is_anomaly": res.get("is_anomaly", False),
                    "severity": res.get("severity", "NORMAL"),
                    "cpu": round(obs["cpu"], 1),
                    "memory": round(obs["memory"], 1),
                    "load_1m": round(obs["load_1m"], 2),
                })
            except Exception:
                pass

        return {
            "host": canonical_host,
            "lookback": lookback,
            "telemetry_status": "ok",
            "evaluated_points_count": len(points),
            "points": points,
        }
