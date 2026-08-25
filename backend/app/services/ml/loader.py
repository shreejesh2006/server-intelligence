import sys
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

import joblib

logger = logging.getLogger(__name__)

_resolved_file = Path(__file__).resolve()
if len(_resolved_file.parents) > 4 and _resolved_file.parents[3].name == "backend":
    REPO_ROOT = _resolved_file.parents[4]
else:
    REPO_ROOT = _resolved_file.parents[3]

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FORECAST_MODELS_DIR = REPO_ROOT / "ml" / "models" / "forecasting"
ANOMALY_MODELS_DIR = REPO_ROOT / "ml" / "models" / "anomaly"

TARGET_COLUMNS = ["cpu", "memory", "load_1m"]
HORIZONS = ["5m", "15m", "30m", "1h", "3h"]
KNOWN_HOSTS = ["ubuntu", "kali"]


def normalize_host(host: str | None) -> str | None:
    if not host:
        return None
    clean = host.strip().lower()
    if clean in ("ubuntu", "100.108.160.2"):
        return "ubuntu"
    elif clean in ("kali", "100.115.122.92"):
        return "kali"
    return clean


class MLLoader:

    def __init__(self):
        self.forecasting_metadata = {}
        self.forecasting_models = {}
        self.forecasting_loaded = False

        self.anomaly_detectors = {}
        self.anomaly_detector = None
        self.anomaly_loaded = False

    def load_all(self):
        logger.warning("=== STARTING ML LOAD ===")
        logger.warning("REPO_ROOT: %s", REPO_ROOT)
        logger.warning("FORECAST_DIR: %s", FORECAST_MODELS_DIR)
        logger.warning("ANOMALY_DIR: %s", ANOMALY_MODELS_DIR)

        self.load_forecasting_models()
        self.load_anomaly_detector()

        logger.warning(
            "=== ML LOAD COMPLETE === "
            "forecast_metadata=%d forecast_models=%d host_anomaly=%d legacy_anomaly=%s",
            len(self.forecasting_metadata),
            len(self.forecasting_models),
            len(self.anomaly_detectors),
            self.anomaly_detector is not None,
        )

    def load_forecasting_models(self):
        self.forecasting_metadata.clear()
        self.forecasting_models.clear()
        self.forecasting_loaded = False

        if not FORECAST_MODELS_DIR.exists():
            logger.error("Forecast directory missing: %s", FORECAST_MODELS_DIR)
            return

        metadata_count = 0
        model_count = 0

        # 1. Load host-specific forecasting models (e.g. ml/models/forecasting/ubuntu/)
        for host in KNOWN_HOSTS:
            host_dir = FORECAST_MODELS_DIR / host
            if host_dir.exists() and host_dir.is_dir():
                for target in TARGET_COLUMNS:
                    for horizon in HORIZONS:
                        key = (host, target, horizon)
                        meta_path = host_dir / f"{target}_{horizon}_meta.json"
                        model_path = host_dir / f"{target}_{horizon}.joblib"

                        if meta_path.exists():
                            try:
                                with meta_path.open("r", encoding="utf-8") as f:
                                    self.forecasting_metadata[key] = json.load(f)
                                metadata_count += 1
                            except Exception:
                                logger.exception("Failed loading metadata: %s", meta_path)

                        if model_path.exists():
                            try:
                                self.forecasting_models[key] = joblib.load(model_path)
                                model_count += 1
                            except Exception:
                                logger.exception("Failed loading model: %s", model_path)

        # 2. Load legacy root forecasting models (fallback)
        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:
                key = (target, horizon)
                meta_path = FORECAST_MODELS_DIR / f"{target}_{horizon}_meta.json"
                model_path = FORECAST_MODELS_DIR / f"{target}_{horizon}.joblib"

                if meta_path.exists():
                    try:
                        with meta_path.open("r", encoding="utf-8") as f:
                            self.forecasting_metadata[key] = json.load(f)
                        metadata_count += 1
                    except Exception:
                        pass

                if model_path.exists():
                    try:
                        self.forecasting_models[key] = joblib.load(model_path)
                        model_count += 1
                    except Exception:
                        pass

        self.forecasting_loaded = metadata_count > 0

        logger.warning(
            "Forecast loading result: metadata=%d models=%d available=%s",
            metadata_count,
            model_count,
            self.forecasting_loaded,
        )

    def load_anomaly_detector(self):
        self.anomaly_detectors.clear()
        self.anomaly_detector = None
        self.anomaly_loaded = False

        from ml.anomaly import AnomalyDetector

        # 1. Load host-specific anomaly detectors (e.g. ml/models/anomaly/ubuntu/)
        for host in KNOWN_HOSTS:
            host_dir = ANOMALY_MODELS_DIR / host
            if host_dir.exists() and host_dir.is_dir():
                model_path = host_dir / "isolation_forest.joblib"
                meta_path = host_dir / "anomaly_metadata.json"
                if model_path.exists() and meta_path.exists():
                    try:
                        detector = AnomalyDetector(model_path=str(model_path), meta_path=str(meta_path))
                        if detector.is_loaded():
                            self.anomaly_detectors[host] = detector
                            logger.warning("Loaded host-specific anomaly detector for '%s'", host)
                    except Exception:
                        logger.exception("Failed loading anomaly detector for host '%s'", host)

        # 2. Load legacy root anomaly detector
        model_path = ANOMALY_MODELS_DIR / "isolation_forest.joblib"
        meta_path = ANOMALY_MODELS_DIR / "anomaly_metadata.json"

        if model_path.exists() and meta_path.exists():
            try:
                detector = AnomalyDetector(model_path=str(model_path), meta_path=str(meta_path))
                if detector.is_loaded():
                    self.anomaly_detector = detector
            except Exception:
                pass

        self.anomaly_loaded = len(self.anomaly_detectors) > 0 or self.anomaly_detector is not None

    def reload_host(self, host: str | None = None):
        """Hot-reloads model artifacts for a specific host (or all) without process restart."""
        canonical = normalize_host(host)
        if not canonical:
            self.load_all()
            return

        logger.warning("Hot-reloading models for host '%s'...", canonical)

        # Reload host forecasting
        host_dir = FORECAST_MODELS_DIR / canonical
        if host_dir.exists() and host_dir.is_dir():
            for target in TARGET_COLUMNS:
                for horizon in HORIZONS:
                    key = (canonical, target, horizon)
                    meta_path = host_dir / f"{target}_{horizon}_meta.json"
                    model_path = host_dir / f"{target}_{horizon}.joblib"

                    if meta_path.exists():
                        try:
                            with meta_path.open("r", encoding="utf-8") as f:
                                self.forecasting_metadata[key] = json.load(f)
                        except Exception:
                            pass

                    if model_path.exists():
                        try:
                            self.forecasting_models[key] = joblib.load(model_path)
                        except Exception:
                            pass

        # Reload host anomaly
        host_anomaly_dir = ANOMALY_MODELS_DIR / canonical
        if host_anomaly_dir.exists() and host_anomaly_dir.is_dir():
            model_path = host_anomaly_dir / "isolation_forest.joblib"
            meta_path = host_anomaly_dir / "anomaly_metadata.json"
            if model_path.exists() and meta_path.exists():
                try:
                    from ml.anomaly import AnomalyDetector
                    detector = AnomalyDetector(model_path=str(model_path), meta_path=str(meta_path))
                    if detector.is_loaded():
                        self.anomaly_detectors[canonical] = detector
                except Exception:
                    pass

    def ensure_loaded(self):
        if not self.is_forecast_available() or not self.is_anomaly_available():
            logger.warning("ML not initialized correctly. Attempting lazy ML initialization...")
            self.load_all()

    def is_forecast_available(self, host: str | None = None) -> bool:
        if not self.forecasting_loaded:
            return False
        canonical = normalize_host(host)
        if canonical:
            # Check if host-specific model exists for at least cpu_5m
            if (canonical, "cpu", "5m") in self.forecasting_metadata:
                return True
        return len(self.forecasting_metadata) > 0

    def is_anomaly_available(self, host: str | None = None) -> bool:
        if not self.anomaly_loaded:
            return False
        canonical = normalize_host(host)
        if canonical and canonical in self.anomaly_detectors:
            return True
        return self.anomaly_detector is not None

    def get_forecast_meta(self, target: str, horizon: str, host: str | None = None):
        canonical = normalize_host(host)
        if canonical and (canonical, target, horizon) in self.forecasting_metadata:
            return self.forecasting_metadata[(canonical, target, horizon)]
        return self.forecasting_metadata.get((target, horizon))

    def get_forecast_model(self, target: str, horizon: str, host: str | None = None):
        canonical = normalize_host(host)
        if canonical and (canonical, target, horizon) in self.forecasting_models:
            return self.forecasting_models[(canonical, target, horizon)]
        return self.forecasting_models.get((target, horizon))

    def get_anomaly_detector(self, host: str | None = None):
        canonical = normalize_host(host)
        if canonical and canonical in self.anomaly_detectors:
            return self.anomaly_detectors[canonical]
        return self.anomaly_detector

    def check_model_freshness(self, host: str | None = None, target: str = "cpu", horizon: str = "5m", max_age_hours: int = 168) -> dict:
        """
        Evaluates model age against max_age_hours (default 168h / 7 days).
        Returns dict with status ('fresh', 'stale', 'unavailable'), is_stale bool, and trained_at timestamp.
        """
        meta = self.get_forecast_meta(target, horizon, host=host)
        if not meta:
            # Check anomaly metadata fallback
            detector = self.get_anomaly_detector(host=host)
            meta = detector.metadata if detector else None

        if not meta:
            return {"status": "unavailable", "is_stale": True, "trained_at": None, "age_hours": None}

        trained_at_str = meta.get("trained_at") or meta.get("created_at")
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


ml_loader = MLLoader()
