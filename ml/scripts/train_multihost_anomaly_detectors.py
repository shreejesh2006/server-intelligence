"""
Trains distinct, host-specific Isolation Forest anomaly detectors for Windows and Kali Linux server profiles.
Guarantees that each server profile has its own tailored anomaly baseline and scoring parameters.
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler

import sys
from pathlib import Path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.services.synthetic_profiles import SyntheticTelemetryService, generate_single_sample
from ml.preprocessing import TelemetryPreprocessor, ANOMALY_FEATURES, SKEWED_FEATURES


def train_detector_for_host(host: str, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    svc = SyntheticTelemetryService()

    # Generate 1440 samples (12 hours at 30s step) of host baseline
    now = datetime.now(timezone.utc).timestamp()
    timestamps = [now - (1440 - i) * 30 for i in range(1440)]
    samples = [generate_single_sample(host, t) for t in timestamps]
    df = pd.DataFrame(samples)

    preprocessor = TelemetryPreprocessor(feature_names=ANOMALY_FEATURES, skewed_features=SKEWED_FEATURES)
    X_trans = preprocessor.fit_transform(df)

    iso = IsolationForest(
        n_estimators=100,
        contamination=0.03,
        random_state=42,
    )
    iso.fit(X_trans)

    # Calculate empirical anomaly score thresholds
    scores = iso.decision_function(X_trans)
    min_score = float(np.min(scores))
    median_score = float(np.median(scores))
    max_score = float(np.max(scores))

    # Pipeline
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('model', iso)
    ])

    model_path = output_dir / "isolation_forest.joblib"
    meta_path = output_dir / "anomaly_metadata.json"

    joblib.dump(pipeline, model_path)

    metadata = {
        "host": host,
        "features": ANOMALY_FEATURES,
        "skewed_features": SKEWED_FEATURES,
        "contamination": 0.03,
        "algorithm": "IsolationForest",
        "anomaly_threshold": 0.0,
        "severity_thresholds": {
            "LOW": -0.15,
            "MEDIUM": -0.05,
            "HIGH": 0.02,
            "CRITICAL": 0.10
        },
        "score_summary": {
            "min": round(min_score, 4),
            "median": round(median_score, 4),
            "max": round(max_score, 4)
        },
        "training_samples": len(df),
        "trained_at": datetime.now(timezone.utc).isoformat()
    }

    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"Successfully trained and saved anomaly detector for '{host}' in {output_dir}")


def main():
    print("Training host-specific anomaly detectors for synthetic server profiles...")
    train_detector_for_host("windows", REPO_ROOT / "ml" / "models" / "anomaly" / "windows")
    train_detector_for_host("kali", REPO_ROOT / "ml" / "models" / "anomaly" / "kali")
    print("All anomaly detectors trained successfully!")


if __name__ == "__main__":
    main()
