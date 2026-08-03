import os
import json
import numpy as np
import pandas as pd
import joblib

# Import TelemetryPreprocessor for unpickling joblib pipeline
from ml.preprocessing import TelemetryPreprocessor, ANOMALY_FEATURES, SKEWED_FEATURES


DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'anomaly', 'isolation_forest.joblib')
DEFAULT_META_PATH = os.path.join(os.path.dirname(__file__), 'models', 'anomaly', 'anomaly_metadata.json')


class AnomalyDetector:
    """
    Reusable Inference Engine for Server Telemetry Anomaly Detection.
    Uses trained Isolation Forest Pipeline and Severity Thresholds.
    """
    def __init__(self, model_path: str = DEFAULT_MODEL_PATH, meta_path: str = DEFAULT_META_PATH):
        self.model_path = model_path
        self.meta_path = meta_path
        self.pipeline = None
        self.metadata = None
        self._load_artifacts()

    def _load_artifacts(self):
        if os.path.exists(self.model_path) and os.path.exists(self.meta_path):
            try:
                self.pipeline = joblib.load(self.model_path)
                with open(self.meta_path, 'r') as f:
                    self.metadata = json.load(f)
            except Exception as err:
                print(f"Warning: Failed to load anomaly model artifacts: {err}")
                self.pipeline = None
                self.metadata = None

    def is_loaded(self) -> bool:

        return self.pipeline is not None and self.metadata is not None

    def score_telemetry(self, observation: dict | pd.DataFrame) -> dict:
        """
        Scores a telemetry observation and determines anomaly status & severity.
        Returns:
            {
                "is_anomaly": bool,
                "anomaly_score": float (higher = more anomalous),
                "severity": "NORMAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                "features_evaluated": int
            }
        """
        if isinstance(observation, dict):
            df_obs = pd.DataFrame([observation])
        elif isinstance(observation, pd.DataFrame):
            df_obs = observation.copy()
        else:
            raise TypeError("Observation must be a dictionary or pandas DataFrame.")

        # Ensure all required features exist (default missing to 0.0)
        features = self.metadata.get("features", ANOMALY_FEATURES) if self.metadata else ANOMALY_FEATURES
        for col in features:
            if col not in df_obs.columns:
                df_obs[col] = 0.0

        X_df = df_obs[features].iloc[[0]]

        if self.pipeline is not None:
            preprocessor = self.pipeline.named_steps['preprocessor']
            model = self.pipeline.named_steps['model']
            
            X_processed = preprocessor.transform(X_df)
            
            # score_samples or -decision_function where HIGHER = MORE ANOMALOUS
            # sklearn decision_function: > 0 is inlier, <= 0 is outlier.
            # -decision_function: < 0 is inlier, >= 0 is outlier.
            anomaly_score = float(-model.decision_function(X_processed)[0])
            is_anomaly = bool(model.predict(X_processed)[0] == -1)
        else:
            # Fallback heuristic if artifacts not loaded yet
            anomaly_score = 0.0
            is_anomaly = False

        # Determine Severity Category using learned training score thresholds
        thresholds = self.metadata.get("severity_thresholds", {}) if self.metadata else {}
        low_t = thresholds.get("LOW", 0.0)
        med_t = thresholds.get("MEDIUM", 0.15)
        high_t = thresholds.get("HIGH", 0.30)
        crit_t = thresholds.get("CRITICAL", 0.45)

        if anomaly_score >= crit_t:
            severity = "CRITICAL"
        elif anomaly_score >= high_t:
            severity = "HIGH"
        elif anomaly_score >= med_t:
            severity = "MEDIUM"
        elif anomaly_score >= low_t:
            severity = "LOW"
        else:
            severity = "NORMAL"

        return {
            "is_anomaly": is_anomaly,
            "anomaly_score": round(anomaly_score, 4),
            "severity": severity,
            "features_evaluated": len(features)
        }


def predict_anomaly(observation: dict) -> dict:
    """Helper function to score a single telemetry dictionary."""
    detector = AnomalyDetector()
    return detector.score_telemetry(observation)
