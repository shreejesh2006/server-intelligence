import time
import logging
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.services.ml.loader import ml_loader, normalize_host
from app.services.victoriametrics import VictoriaMetricsService

logger = logging.getLogger(__name__)
CACHE_TTL_SECONDS = 30.0


class AnomalyService:
    """
    Service for scoring server telemetry anomalies using Isolation Forest.
    Uses per-host 30-second TTL cache to prevent repeated inference.
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

        if not ml_loader.is_anomaly_available(host=canonical_host):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Anomaly model not available for host '{canonical_host}'",
            )

        detector = ml_loader.get_anomaly_detector(host=canonical_host)
        if detector is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Anomaly model not available for host '{canonical_host}'",
            )

        # Fetch current live telemetry metrics and actual timestamp for host
        try:
            live_metrics, obs_timestamp = await self.victoria.get_current_metrics(host=canonical_host)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed querying VictoriaMetrics: {exc}",
            ) from exc

        # Format observation dict matching ANOMALY_FEATURES expected by Isolation Forest
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
            "telemetry_timestamp": obs_timestamp,
            "generated_at": generated_at,
            "model_trained_at": freshness_info.get("trained_at"),
            "model_status": freshness_info.get("status", "unavailable"),
            "is_stale": freshness_info.get("is_stale", False),
            "host": canonical_host,
            "is_anomaly": result.get("is_anomaly", False),
            "severity": result.get("severity", "NORMAL"),
            "anomaly_score": result.get("anomaly_score", 0.0),
            "features_evaluated": result.get("features_evaluated", 11),
        }

        # Cache per-host result
        self._cache[cache_key] = response
        self._cache_timestamps[cache_key] = now

        return response
