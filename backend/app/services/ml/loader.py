import sys
import json
import logging
from pathlib import Path

import joblib

logger = logging.getLogger(__name__)

# Docker layout:
#
# /app/
# ├── app/
# │   └── services/ml/loader.py
# └── ml/
#     ├── anomaly.py
#     └── models/
#
# /app/app/services/ml/loader.py
# parents[3] == /app

REPO_ROOT = Path(__file__).resolve().parents[3]

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FORECAST_MODELS_DIR = REPO_ROOT / "ml" / "models" / "forecasting"
ANOMALY_MODELS_DIR = REPO_ROOT / "ml" / "models" / "anomaly"

TARGET_COLUMNS = ["cpu", "memory", "load_1m"]
HORIZONS = ["5m", "15m", "30m", "1h", "3h"]


class MLLoader:

    def __init__(self):
        self.forecasting_metadata = {}
        self.forecasting_models = {}
        self.forecasting_loaded = False

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
            "forecast_metadata=%d forecast_models=%d anomaly=%s",
            len(self.forecasting_metadata),
            len(self.forecasting_models),
            self.anomaly_detector is not None,
        )

    def load_forecasting_models(self):

        self.forecasting_metadata.clear()
        self.forecasting_models.clear()
        self.forecasting_loaded = False

        if not FORECAST_MODELS_DIR.exists():
            logger.error(
                "Forecast directory missing: %s",
                FORECAST_MODELS_DIR,
            )
            return

        metadata_count = 0
        model_count = 0

        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:

                key = (target, horizon)

                meta_path = (
                    FORECAST_MODELS_DIR
                    / f"{target}_{horizon}_meta.json"
                )

                model_path = (
                    FORECAST_MODELS_DIR
                    / f"{target}_{horizon}.joblib"
                )

                if meta_path.exists():
                    try:
                        with meta_path.open(
                            "r",
                            encoding="utf-8",
                        ) as f:
                            meta = json.load(f)

                        self.forecasting_metadata[key] = meta
                        metadata_count += 1

                    except Exception:
                        logger.exception(
                            "Failed loading metadata: %s",
                            meta_path,
                        )

                if model_path.exists():
                    try:
                        model = joblib.load(model_path)

                        self.forecasting_models[key] = model
                        model_count += 1

                    except Exception:
                        logger.exception(
                            "Failed loading model: %s",
                            model_path,
                        )

        self.forecasting_loaded = metadata_count > 0

        logger.warning(
            "Forecast loading result: metadata=%d models=%d available=%s",
            metadata_count,
            model_count,
            self.forecasting_loaded,
        )

    def load_anomaly_detector(self):

        self.anomaly_detector = None
        self.anomaly_loaded = False

        model_path = (
            ANOMALY_MODELS_DIR /
            "isolation_forest.joblib"
        )

        meta_path = (
            ANOMALY_MODELS_DIR /
            "anomaly_metadata.json"
        )

        if not model_path.exists():
            logger.error(
                "Anomaly model missing: %s",
                model_path,
            )
            return

        if not meta_path.exists():
            logger.error(
                "Anomaly metadata missing: %s",
                meta_path,
            )
            return

        try:
            from ml.anomaly import AnomalyDetector

            detector = AnomalyDetector(
                model_path=str(model_path),
                meta_path=str(meta_path),
            )

            if detector.is_loaded():

                self.anomaly_detector = detector
                self.anomaly_loaded = True

                logger.warning(
                    "Anomaly detector loaded successfully"
                )

            else:
                logger.error(
                    "AnomalyDetector.is_loaded() returned False"
                )

        except Exception:
            logger.exception(
                "Failed to initialize anomaly detector"
            )

    def ensure_loaded(self):

        if not self.is_forecast_available() or not self.is_anomaly_available():
            logger.warning(
                "ML not initialized correctly. "
                "Attempting lazy ML initialization..."
            )

            self.load_all()

    def is_forecast_available(self) -> bool:
        return (
            self.forecasting_loaded
            and len(self.forecasting_metadata) > 0
        )

    def is_anomaly_available(self) -> bool:
        return (
            self.anomaly_loaded
            and self.anomaly_detector is not None
        )

    def get_forecast_meta(
        self,
        target: str,
        horizon: str,
    ):
        return self.forecasting_metadata.get(
            (target, horizon)
        )

    def get_forecast_model(
        self,
        target: str,
        horizon: str,
    ):
        return self.forecasting_models.get(
            (target, horizon)
        )

    def get_anomaly_detector(self):
        return self.anomaly_detector


ml_loader = MLLoader()
