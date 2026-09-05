import os
import json
import logging
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

from ml.anomaly import AnomalyDetector
from ml.preprocessing import ANOMALY_FEATURES

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ANOMALY_MODELS_DIR = REPO_ROOT / "ml" / "models" / "anomaly"
DEFAULT_UBUNTU_BACKEND_URL = "http://100.108.160.2:8000"


def normalize_host(host: str | None) -> str | None:
    if not host:
        return None
    clean = str(host).strip().lower()
    if clean in ("ubuntu", "100.108.160.2"):
        return "ubuntu"
    elif clean in ("kali", "100.115.122.92"):
        return "kali"
    return clean


class MacAnomalyInferenceService:
    """
    Mac-side ML inference client for Server Intelligence Platform.
    Fetches real live telemetry from Ubuntu VM backend over HTTP (Tailscale)
    and executes host-specific Isolation Forest anomaly detection locally on Mac.
    """
    def __init__(
        self,
        backend_url: str = DEFAULT_UBUNTU_BACKEND_URL,
        models_dir: str | Path | None = None,
    ):
        self.backend_url = str(backend_url).rstrip("/")
        self.models_dir = Path(models_dir) if models_dir else DEFAULT_ANOMALY_MODELS_DIR
        self.detectors = {}

    def get_remote_host_param(self, canonical_host: str) -> str:
        """
        Maps canonical ML host names to backend VictoriaMetrics host parameters.
        Canonical 'ubuntu' -> 'ubuntu'
        Canonical 'kali' -> 'Kali' (VictoriaMetrics uses capital K for Kali node)
        """
        if canonical_host == "kali":
            return "Kali"
        return canonical_host

    def get_detector(self, host: str) -> AnomalyDetector | None:
        """
        Retrieves or lazily loads the host-specific AnomalyDetector instance.
        STRICT HOST ISOLATION: Never falls back to another host or legacy global model.
        """
        canonical = normalize_host(host)
        if not canonical:
            return None

        if canonical in self.detectors:
            return self.detectors[canonical]

        host_dir = self.models_dir / canonical
        model_path = host_dir / "isolation_forest.joblib"
        meta_path = host_dir / "anomaly_metadata.json"

        if model_path.exists() and meta_path.exists():
            try:
                detector = AnomalyDetector(model_path=str(model_path), meta_path=str(meta_path))
                if detector.is_loaded():
                    self.detectors[canonical] = detector
                    logger.info("Loaded Mac-side anomaly detector for host '%s' from %s", canonical, host_dir)
                    return detector
            except Exception as exc:
                logger.error("Failed loading Mac-side anomaly detector for host '%s': %s", canonical, exc)

        logger.warning("No host-specific anomaly model artifact found for host '%s' in %s", canonical, host_dir)
        return None

    def fetch_live_telemetry(self, host: str, timeout_seconds: float = 5.0) -> tuple[dict, str]:
        """
        Fetches live server telemetry metrics from Ubuntu backend via HTTP GET.
        Returns tuple of (metrics_dict, observation_timestamp_iso).
        """
        canonical = normalize_host(host)
        if not canonical:
            raise ValueError(f"Invalid host identifier: '{host}'")

        remote_param = self.get_remote_host_param(canonical)
        url = f"{self.backend_url}/api/metrics/current?host={remote_param}"

        req = urllib.request.Request(url, headers={"User-Agent": "MacInferenceClient/2.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                if resp.status != 200:
                    raise IOError(f"HTTP error {resp.status} fetching telemetry from {url}")
                raw_bytes = resp.read()
                data = json.loads(raw_bytes.decode("utf-8"))

            metrics = data.get("metrics", {})
            obs_ts = datetime.now(timezone.utc).isoformat()
            return metrics, obs_ts

        except urllib.error.URLError as err:
            logger.error("Failed reaching Ubuntu backend at %s: %s", url, err)
            raise IOError(f"Failed reaching Ubuntu backend at {url}: {err}") from err
        except Exception as exc:
            logger.error("Error parsing telemetry from %s: %s", url, exc)
            raise IOError(f"Error parsing telemetry from {url}: {exc}") from exc

    def check_model_freshness(self, detector: AnomalyDetector, max_age_hours: int = 168) -> dict:
        """Evaluates model trained_at timestamp age against threshold (default 7 days)."""
        if not detector or not detector.metadata:
            return {"status": "unavailable", "is_stale": True, "trained_at": None, "age_hours": None}

        trained_at_str = detector.metadata.get("trained_at") or detector.metadata.get("created_at")
        if not trained_at_str:
            return {"status": "stale", "is_stale": True, "trained_at": None, "age_hours": None}

        try:
            trained_dt = datetime.fromisoformat(trained_at_str.replace("Z", "+00:00"))
            if trained_dt.tzinfo is None:
                trained_dt = trained_dt.replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            age_hours = (now_dt - trained_dt).total_seconds() / 3600.0

            is_stale = age_hours > max_age_hours
            status_str = "stale" if is_stale else "fresh"

            return {
                "status": status_str,
                "is_stale": is_stale,
                "trained_at": trained_at_str,
                "age_hours": round(age_hours, 2),
            }
        except Exception:
            return {"status": "stale", "is_stale": True, "trained_at": trained_at_str, "age_hours": None}

    def predict_anomaly(self, host: str) -> dict:
        """
        Executes local Mac-side Isolation Forest anomaly inference on live remote telemetry.
        Returns complete explainability JSON structure.
        """
        canonical = normalize_host(host)
        if not canonical:
            return {
                "host": str(host),
                "telemetry_timestamp": datetime.now(timezone.utc).isoformat(),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_trained_at": None,
                "model_status": "unavailable",
                "is_stale": True,
                "telemetry_status": "model_unavailable",
                "is_anomaly": False,
                "severity": "NORMAL",
                "anomaly_score": 0.0,
                "features_evaluated": 0,
                "primary_reason": f"Invalid or unknown host identifier '{host}'.",
                "contributing_signals": [],
                "all_metrics_evaluated": [],
                "recommendations": ["Specify a valid host identifier ('ubuntu' or 'kali')."],
                "model_metadata": {"algorithm": "IsolationForest", "host": str(host)},
            }

        detector = self.get_detector(canonical)
        if detector is None or not detector.is_loaded():
            return {
                "host": canonical,
                "telemetry_timestamp": datetime.now(timezone.utc).isoformat(),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_trained_at": None,
                "model_status": "unavailable",
                "is_stale": True,
                "telemetry_status": "model_unavailable",
                "is_anomaly": False,
                "severity": "NORMAL",
                "anomaly_score": 0.0,
                "features_evaluated": 0,
                "primary_reason": f"No host-specific anomaly model artifact found for '{canonical}'.",
                "contributing_signals": [],
                "all_metrics_evaluated": [],
                "recommendations": [f"Train anomaly detector model for host '{canonical}'."],
                "model_metadata": {"algorithm": "IsolationForest", "host": canonical},
            }

        # Fetch live telemetry from remote Ubuntu backend
        try:
            live_metrics, obs_timestamp = self.fetch_live_telemetry(canonical)
        except Exception as exc:
            return {
                "host": canonical,
                "telemetry_timestamp": datetime.now(timezone.utc).isoformat(),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model_trained_at": detector.metadata.get("trained_at") if detector else None,
                "model_status": "available",
                "is_stale": False,
                "telemetry_status": "telemetry_error",
                "is_anomaly": False,
                "severity": "NORMAL",
                "anomaly_score": 0.0,
                "features_evaluated": 0,
                "primary_reason": f"Failed retrieving live telemetry from Ubuntu backend: {exc}",
                "contributing_signals": [],
                "all_metrics_evaluated": [],
                "recommendations": ["Check Ubuntu backend connectivity and Tailscale VPN status."],
                "model_metadata": detector.metadata if detector else {},
            }

        # Map processes -> process_count
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

        # Local inference on Mac
        result = detector.score_telemetry(observation)
        freshness_info = self.check_model_freshness(detector)

        return {
            "host": canonical,
            "telemetry_timestamp": obs_timestamp,
            "generated_at": datetime.now(timezone.utc).isoformat(),
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
