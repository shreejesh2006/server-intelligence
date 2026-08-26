import os
import json
import logging
import numpy as np
import pandas as pd
import joblib

from ml.preprocessing import TelemetryPreprocessor, ANOMALY_FEATURES, SKEWED_FEATURES

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'anomaly', 'isolation_forest.joblib')
DEFAULT_META_PATH = os.path.join(os.path.dirname(__file__), 'models', 'anomaly', 'anomaly_metadata.json')

METRIC_DISPLAY_NAMES = {
    "cpu": "CPU Utilization",
    "memory": "Memory Usage",
    "load_1m": "System Load (1m)",
    "load_5m": "System Load (5m)",
    "load_15m": "System Load (15m)",
    "network_rx": "Network Receive (RX)",
    "network_tx": "Network Transmit (TX)",
    "disk_read": "Disk Read Speed",
    "disk_write": "Disk Write Speed",
    "process_count": "Process Count",
    "iowait": "CPU I/O Wait",
}

METRIC_UNITS = {
    "cpu": "%",
    "memory": "%",
    "load_1m": "",
    "load_5m": "",
    "load_15m": "",
    "network_rx": "B/s",
    "network_tx": "B/s",
    "disk_read": "B/s",
    "disk_write": "B/s",
    "process_count": "processes",
    "iowait": "%",
}


class AnomalyDetector:
    """
    Reusable Inference Engine for Server Telemetry Anomaly Detection.
    Combines Isolation Forest multivariate score with metric-level baseline extraction,
    safe deviation metrics (avoiding misleading near-zero percentage divisions),
    deterministic primary reasoning, and targeted recommendations.
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
                with open(self.meta_path, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
            except Exception as err:
                logger.warning("Failed to load anomaly model artifacts from %s: %s", self.model_path, err)
                self.pipeline = None
                self.metadata = None

    def is_loaded(self) -> bool:
        return self.pipeline is not None and self.metadata is not None

    def score_telemetry(self, observation: dict | pd.DataFrame) -> dict:
        """
        Scores a telemetry observation and determines multivariate anomaly status,
        metric-level baseline deviations, deterministic explanations, and recommendations.
        """
        if isinstance(observation, dict):
            df_obs = pd.DataFrame([observation])
        elif isinstance(observation, pd.DataFrame):
            df_obs = observation.copy()
        else:
            raise TypeError("Observation must be a dictionary or pandas DataFrame.")

        features = self.metadata.get("features", ANOMALY_FEATURES) if self.metadata else ANOMALY_FEATURES
        skewed = self.metadata.get("skewed_features", SKEWED_FEATURES) if self.metadata else SKEWED_FEATURES

        for col in features:
            if col not in df_obs.columns:
                df_obs[col] = 0.0

        X_df = df_obs[features].iloc[[0]]

        anomaly_score = 0.0
        is_anomaly = False
        preprocessor = None
        model = None

        if self.pipeline is not None:
            try:
                preprocessor = self.pipeline.named_steps['preprocessor']
                model = self.pipeline.named_steps['model']

                X_processed = preprocessor.transform(X_df)
                anomaly_score = float(-model.decision_function(X_processed)[0])
                is_anomaly = bool(model.predict(X_processed)[0] == -1)
            except Exception as exc:
                logger.warning("Anomaly inference pipeline scoring error: %s", exc)

        # 1. Determine Overall Severity Category from learned training score thresholds
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

        # 2. Extract Baselines & Evaluate Metric-Level Deviations
        metric_evaluations = []
        flagged_signals = []

        scaler_centers = None
        scaler_scales = None
        if preprocessor is not None and hasattr(preprocessor, "scaler"):
            scaler_centers = getattr(preprocessor.scaler, "center_", None)
            scaler_scales = getattr(preprocessor.scaler, "scale_", None)

        for i, col in enumerate(features):
            current_val = float(df_obs[col].iloc[0])

            # Reconstruct baseline from RobustScaler center
            if scaler_centers is not None and i < len(scaler_centers):
                raw_center = float(scaler_centers[i])
                if col in skewed:
                    baseline_val = float(np.expm1(np.maximum(0.0, raw_center)))
                else:
                    baseline_val = raw_center
            else:
                baseline_val = 0.0

            scale_val = float(scaler_scales[i]) if (scaler_scales is not None and i < len(scaler_scales)) else 1.0
            scale_val = max(scale_val, 1e-5)

            # Transformed value for scaled deviation
            if col in skewed:
                trans_val = float(np.log1p(np.maximum(0.0, current_val)))
                trans_center = float(scaler_centers[i]) if scaler_centers is not None else 0.0
            else:
                trans_val = current_val
                trans_center = baseline_val

            abs_dev = abs(current_val - baseline_val)
            scaled_dev = abs(trans_val - trans_center) / scale_val

            # SAFE PERCENTAGE DEVIATION RULE:
            # Return None (null in JSON) when baseline is zero or near zero (< 1.0)
            if baseline_val >= 1.0:
                dev_pct = round(((current_val - baseline_val) / baseline_val) * 100.0, 2)
            else:
                dev_pct = None

            # Determine Metric-Level Status
            m_status = "NORMAL"
            if scaled_dev >= 4.0 or (col == "cpu" and current_val > 95) or (col == "memory" and current_val > 95):
                m_status = "CRITICAL"
            elif scaled_dev >= 3.0 or (col == "cpu" and current_val > 85) or (col == "memory" and current_val > 90):
                m_status = "HIGH"
            elif scaled_dev >= 2.0:
                m_status = "MEDIUM"
            elif scaled_dev >= 1.2:
                m_status = "LOW"

            display_name = METRIC_DISPLAY_NAMES.get(col, col.upper())
            unit_str = METRIC_UNITS.get(col, "")

            # Construct Metric Explanation Reason
            dir_str = "above" if current_val >= baseline_val else "below"
            if m_status != "NORMAL":
                if dev_pct is not None:
                    reason_str = f"{display_name} ({current_val:.1f}{unit_str}) is significantly {dir_str} learned baseline ({baseline_val:.1f}{unit_str}, {dev_pct:+.1f}%)."
                else:
                    reason_str = f"{display_name} ({current_val:.1f}{unit_str}) shows strong deviation (scaled diff: +{scaled_dev:.1f}σ) relative to learned baseline ({baseline_val:.1f}{unit_str})."
            else:
                reason_str = f"{display_name} is operating within nominal learned baseline range."

            sig_item = {
                "metric": col,
                "display_name": display_name,
                "current_value": round(current_val, 2),
                "baseline_value": round(baseline_val, 2),
                "absolute_deviation": round(abs_dev, 2),
                "scaled_deviation": round(scaled_dev, 2),
                "deviation_percent": dev_pct,
                "status": m_status,
                "unit": unit_str,
                "reason": reason_str,
            }

            metric_evaluations.append(sig_item)
            if m_status in ("MEDIUM", "HIGH", "CRITICAL"):
                flagged_signals.append(sig_item)

        # 3. Deterministic Primary Reason Generation
        if not flagged_signals:
            primary_reason = "Telemetry is operating within the learned baseline range."
        elif len(flagged_signals) == 1:
            sig = flagged_signals[0]
            dir_str = "above" if sig["current_value"] >= sig["baseline_value"] else "below"
            primary_reason = f"{sig['display_name']} is significantly {dir_str} the learned operating baseline."
        else:
            names = [s['display_name'] for s in flagged_signals[:3]]
            if len(flagged_signals) == 2:
                names_str = f"{names[0]} and {names[1]}"
            else:
                names_str = f"{names[0]}, {names[1]}, and {names[2]}"
            primary_reason = f"Multiple telemetry signals ({names_str}) show significant deviation from learned operating baselines."

        # 4. Deterministic Recommendations Generation
        recommendations = []
        flagged_metrics = {s['metric'] for s in flagged_signals}

        if "cpu" in flagged_metrics:
            recommendations.append("Inspect CPU-intensive processes and check for sustained workload growth.")
        if "memory" in flagged_metrics:
            recommendations.append("Inspect memory-intensive processes and monitor for memory leaks or buffer/cache pressure.")
        if "load_1m" in flagged_metrics or "load_5m" in flagged_metrics or "load_15m" in flagged_metrics:
            recommendations.append("Inspect CPU/process saturation and investigate workload spikes.")
        if "network_rx" in flagged_metrics or "network_tx" in flagged_metrics:
            recommendations.append("Inspect network traffic sources and check for unexpected throughput spikes.")
        if "disk_read" in flagged_metrics or "disk_write" in flagged_metrics:
            recommendations.append("Inspect active I/O workloads and identify processes generating sustained disk traffic.")
        if "process_count" in flagged_metrics:
            recommendations.append("Inspect process/thread growth and identify unexpected process creation.")
        if "iowait" in flagged_metrics:
            recommendations.append("Inspect storage latency and I/O contention.")

        if not recommendations:
            recommendations.append("Telemetry is operating within nominal learned bounds. No immediate action required.")

        # Expose model metadata for UI
        model_meta = {
            "algorithm": self.metadata.get("algorithm", "IsolationForest") if self.metadata else "IsolationForest",
            "features_count": len(features),
            "features": features,
            "contamination": self.metadata.get("contamination", 0.03) if self.metadata else 0.03,
            "training_samples": self.metadata.get("training_samples", 0) if self.metadata else 0,
            "training_window_start": self.metadata.get("training_window_start") if self.metadata else None,
            "training_window_end": self.metadata.get("training_window_end") if self.metadata else None,
            "trained_at": self.metadata.get("trained_at") or (self.metadata.get("created_at") if self.metadata else None),
            "host": self.metadata.get("host", "unknown") if self.metadata else "unknown",
        }

        return {
            "is_anomaly": is_anomaly,
            "anomaly_score": round(anomaly_score, 4),
            "severity": severity,
            "features_evaluated": len(features),
            "primary_reason": primary_reason,
            "contributing_signals": flagged_signals,
            "all_metrics_evaluated": metric_evaluations,
            "recommendations": recommendations,
            "model_metadata": model_meta,
        }


def predict_anomaly(observation: dict) -> dict:
    """Helper function to score a single telemetry dictionary."""
    detector = AnomalyDetector()
    return detector.score_telemetry(observation)
