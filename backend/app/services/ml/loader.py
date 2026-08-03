import os
import sys
import json
import logging
from pathlib import Path
import joblib

logger = logging.getLogger(__name__)

# Ensure repository root is in sys.path so ml package can be imported
REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FORECAST_MODELS_DIR = REPO_ROOT / "ml" / "models" / "forecasting"
ANOMALY_MODELS_DIR = REPO_ROOT / "ml" / "models" / "anomaly"

TARGET_COLUMNS = ['cpu', 'memory', 'load_1m']
HORIZONS = ['5m', '15m', '30m', '1h', '3h']


class MLLoader:
    """
    Singleton Loader for ML Models.
    Models and metadata are loaded once during FastAPI startup.
    """
    def __init__(self):
        self.forecasting_metadata = {}
        self.forecasting_models = {}
        self.forecasting_loaded = False

        self.anomaly_detector = None
        self.anomaly_loaded = False

    def load_all(self):
        self.load_forecasting_models()
        self.load_anomaly_detector()

    def load_forecasting_models(self):
        self.forecasting_metadata.clear()
        self.forecasting_models.clear()
        self.forecasting_loaded = False

        loaded_count = 0
        if FORECAST_MODELS_DIR.exists():
            for target in TARGET_COLUMNS:
                for horizon in HORIZONS:
                    meta_path = FORECAST_MODELS_DIR / f"{target}_{horizon}_meta.json"
                    model_path = FORECAST_MODELS_DIR / f"{target}_{horizon}.joblib"

                    if meta_path.exists():
                        try:
                            with open(meta_path, 'r') as f:
                                meta = json.load(f)
                            key = (target, horizon)
                            self.forecasting_metadata[key] = meta

                            # Load model joblib if present
                            if model_path.exists():
                                try:
                                    model = joblib.load(model_path)
                                    self.forecasting_models[key] = model
                                except Exception as err:
                                    logger.warning(f"Could not load forecast model joblib for {key}: {err}")

                            loaded_count += 1
                        except Exception as err:
                            logger.warning(f"Could not load forecast metadata for {target}_{horizon}: {err}")

        if loaded_count > 0 or len(self.forecasting_metadata) > 0:
            self.forecasting_loaded = True
            print("Loaded forecasting models.")
            logger.info("Loaded forecasting models.")
        else:
            logger.info("Forecasting models not found or not initialized.")

    def load_anomaly_detector(self):
        self.anomaly_detector = None
        self.anomaly_loaded = False

        try:
            from ml.anomaly import AnomalyDetector
            detector = AnomalyDetector(
                model_path=str(ANOMALY_MODELS_DIR / "isolation_forest.joblib"),
                meta_path=str(ANOMALY_MODELS_DIR / "anomaly_metadata.json")
            )
            if detector.is_loaded():
                self.anomaly_detector = detector
                self.anomaly_loaded = True
                print("Loaded anomaly detector.")
                logger.info("Loaded anomaly detector.")
            else:
                logger.info("Anomaly detector model files not available yet.")
        except Exception as err:
            logger.info(f"Anomaly detector initialization skipped: {err}")

    def is_forecast_available(self) -> bool:

        return self.forecasting_loaded and len(self.forecasting_metadata) > 0

    def is_anomaly_available(self) -> bool:
        return self.anomaly_loaded and self.anomaly_detector is not None

    def get_forecast_meta(self, target: str, horizon: str) -> dict | None:
        return self.forecasting_metadata.get((target, horizon))

    def get_forecast_model(self, target: str, horizon: str):
        return self.forecasting_models.get((target, horizon))

    def get_anomaly_detector(self):
        return self.anomaly_detector


# Global Singleton Instance
ml_loader = MLLoader()
