import os
import json
import argparse
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline

from ml.preprocessing import TelemetryPreprocessor, ANOMALY_FEATURES, SKEWED_FEATURES

DEFAULT_DATASET_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'telemetry.csv')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models', 'anomaly')

# Operational Assumption for Isolation Forest (3% expected statistical outliers)
CONTAMINATION = 0.03
RANDOM_STATE = 42


def train_anomaly_pipeline(df: pd.DataFrame, output_dir: str):
    """
    Trains Isolation Forest anomaly detector with log1p + RobustScaler preprocessing pipeline,
    and derives severity quantile thresholds from training anomaly score distribution.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Ensure all required features exist in dataframe (fill missing optional with defaults if testing)
    for col in ANOMALY_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    X_train_df = df[ANOMALY_FEATURES].copy()

    # Define combined sklearn Pipeline
    pipeline = Pipeline([
        ('preprocessor', TelemetryPreprocessor(feature_names=ANOMALY_FEATURES, skewed_features=SKEWED_FEATURES)),
        ('model', IsolationForest(
            n_estimators=100,
            contamination=CONTAMINATION,
            random_state=RANDOM_STATE,
            n_jobs=-1
        ))
    ])

    print("Fitting Telemetry Preprocessor & Isolation Forest Model...")
    pipeline.fit(X_train_df)

    # Extract fitted components for score evaluation
    preprocessor = pipeline.named_steps['preprocessor']
    model = pipeline.named_steps['model']

    X_processed = preprocessor.transform(X_train_df)

    # Score calculation: higher score = more anomalous
    scores = -model.decision_function(X_processed)

    # Calculate severity thresholds based on training anomaly score distribution
    q85 = float(np.percentile(scores, 85))
    q95 = float(np.percentile(scores, 95))
    q98 = float(np.percentile(scores, 98))
    q99_5 = float(np.percentile(scores, 99.5))

    # Anomaly decision threshold is where decision_function <= 0 => score >= 0.0
    anomaly_threshold = 0.0

    metadata = {
        "features": ANOMALY_FEATURES,
        "skewed_features": SKEWED_FEATURES,
        "contamination": CONTAMINATION,
        "random_state": RANDOM_STATE,
        "anomaly_threshold": round(anomaly_threshold, 4),
        "severity_thresholds": {
            "LOW": round(q85, 4),
            "MEDIUM": round(q95, 4),
            "HIGH": round(q98, 4),
            "CRITICAL": round(q99_5, 4)
        },
        "score_summary": {
            "min": round(float(np.min(scores)), 4),
            "median": round(float(np.median(scores)), 4),
            "max": round(float(np.max(scores)), 4)
        },
        "training_samples": len(df),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "note": "Contamination=0.03 is an operational assumption, NOT a measured anomaly prevalence. Model detects statistical outliers in telemetry."
    }

    # Save Pipeline Joblib Artifact
    model_path = os.path.join(output_dir, "isolation_forest.joblib")
    joblib.dump(pipeline, model_path)

    # Save Metadata JSON
    meta_path = os.path.join(output_dir, "anomaly_metadata.json")
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print("==================================================")
    print("ANOMALY DETECTION MODEL TRAINING COMPLETE")
    print("==================================================")
    print(f"Artifacts Saved:")
    print(f"  - Pipeline Model: {model_path}")
    print(f"  - Metadata JSON:  {meta_path}")
    print(f"Severity Thresholds (Higher Score = More Anomalous):")
    print(f"  - LOW      (>= 85th pct):  {q85:.4f}")
    print(f"  - MEDIUM   (>= 95th pct):  {q95:.4f}")
    print(f"  - HIGH     (>= 98th pct):  {q98:.4f}")
    print(f"  - CRITICAL (>= 99.5th pct): {q99_5:.4f}")
    print("==================================================")

    return pipeline, metadata


def main():
    parser = argparse.ArgumentParser(description="Train Isolation Forest Anomaly Detection Pipeline.")
    parser.add_argument('--dataset', type=str, default=DEFAULT_DATASET_PATH, help="Path to telemetry CSV dataset.")
    parser.add_argument('--output-dir', type=str, default=MODEL_DIR, help="Directory to save anomaly artifacts.")
    args = parser.parse_args()

    if not os.path.exists(args.dataset):
        print(f"Dataset file not found at {args.dataset}. Ensure telemetry.csv exists or provide --dataset.")
        return

    df = pd.read_csv(args.dataset)
    train_anomaly_pipeline(df, args.output_dir)


if __name__ == '__main__':
    main()
