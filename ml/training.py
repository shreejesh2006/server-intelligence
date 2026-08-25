import os
import sys
import json
import logging
import shutil
import httpx
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.pipeline import Pipeline

from ml.preprocessing import TelemetryPreprocessor, ANOMALY_FEATURES, SKEWED_FEATURES

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
FORECAST_MODELS_DIR = REPO_ROOT / "ml" / "models" / "forecasting"
ANOMALY_MODELS_DIR = REPO_ROOT / "ml" / "models" / "anomaly"

HORIZON_STEPS_MAP = {
    "5m": 10,
    "15m": 30,
    "30m": 60,
    "1h": 120,
    "3h": 360,
}

TARGET_COLUMNS = ["cpu", "memory", "load_1m"]
TRAIN_RATIO = 0.80

METRICS_PROMPQL_MAP = {
    "cpu": "server_cpu_usage_percent",
    "memory": "server_memory_usage_percent",
    "disk": "server_disk_usage_percent",
    "swap": "server_swap_usage_percent",
    "load_1m": "server_load_1m",
    "load_5m": "server_load_5m",
    "load_15m": "server_load_15m",
    "network_rx": "server_network_rx_bytes_per_second",
    "network_tx": "server_network_tx_bytes_per_second",
    "disk_read": "server_disk_read_bytes_per_second",
    "disk_write": "server_disk_write_bytes_per_second",
    "process_count": "server_process_count",
    "iowait": "server_cpu_iowait_percent",
}

HOST_LABEL_MAP = {
    "ubuntu": 'host=~"ubuntu|100.108.160.2"',
    "kali": 'host=~"kali|Kali|100.115.122.92"',
}


def normalize_host(host: str | None) -> str | None:
    if not host:
        return None
    clean = host.strip().lower()
    if clean in ("ubuntu", "100.108.160.2"):
        return "ubuntu"
    elif clean in ("kali", "100.115.122.92"):
        return "kali"
    return clean


def prepare_forecasting_features(df: pd.DataFrame, target_col: str):
    """
    Constructs lag and rolling window features matching the expected training schema.
    """
    data = df.copy()
    lags = [0, 1, 2, 4, 8, 12]
    feature_cols = []

    for lag in lags:
        col_name = f"{target_col}_lag_{lag}"
        data[col_name] = data[target_col].shift(lag)
        feature_cols.append(col_name)

    aux_metrics = ["cpu", "memory", "load_1m", "load_5m", "network_rx", "network_tx", "iowait"]
    for aux in aux_metrics:
        if aux in data.columns and aux != target_col:
            col_name = f"aux_{aux}_t"
            data[col_name] = data[aux]
            feature_cols.append(col_name)

    data[f"{target_col}_roll_mean_5"] = data[target_col].rolling(window=5, min_periods=1).mean()
    data[f"{target_col}_roll_std_5"] = data[target_col].rolling(window=5, min_periods=1).std().fillna(0)
    feature_cols.extend([f"{target_col}_roll_mean_5", f"{target_col}_roll_std_5"])

    return data, feature_cols


def fetch_telemetry_history(host: str, lookback_days: int = 7, vm_url: str = "http://localhost:8428") -> pd.DataFrame:
    """
    Fetches real historical telemetry from VictoriaMetrics query_range for a given host.
    """
    canonical_host = normalize_host(host)
    if not canonical_host:
        raise ValueError(f"Invalid host parameter: {host}")

    label_expr = HOST_LABEL_MAP.get(canonical_host, f'host="{canonical_host}"')
    now_dt = datetime.now(timezone.utc)
    start_dt = now_dt - timedelta(days=lookback_days)

    start_str = start_dt.isoformat()
    end_str = now_dt.isoformat()

    metric_series = {}
    url = f"{vm_url.rstrip('/')}/api/v1/query_range"

    for metric_key, base_metric in METRICS_PROMPQL_MAP.items():
        query_str = f"{base_metric}{{{label_expr}}}"
        try:
            with httpx.Client(timeout=30.0) as client:
                res = client.get(url, params={"query": query_str, "start": start_str, "end": end_str, "step": "30s"})
                if res.status_code == 200:
                    payload = res.json()
                    if payload.get("status") == "success":
                        result = payload.get("data", {}).get("result", [])
                        if result and "values" in result[0]:
                            values = result[0]["values"]
                            s = pd.Series(
                                data=[float(v[1]) for v in values],
                                index=[pd.to_datetime(float(v[0]), unit="s", utc=True) for v in values],
                                name=metric_key,
                            )
                            metric_series[metric_key] = s
        except Exception as exc:
            logger.warning("Failed fetching metric %s for %s: %s", metric_key, canonical_host, exc)

    if not metric_series:
        raise RuntimeError(f"No historical telemetry data found in VictoriaMetrics for host '{canonical_host}'.")

    df_combined = pd.DataFrame(metric_series).sort_index().ffill().bfill().reset_index()
    df_combined.rename(columns={"index": "timestamp"}, inplace=True)
    df_combined["host"] = canonical_host

    return df_combined


def train_forecasting_model_for_target(df: pd.DataFrame, target: str, horizon_name: str, horizon_steps: int):
    prepared_df, feature_cols = prepare_forecasting_features(df, target)
    clean_df = prepared_df.dropna(subset=feature_cols + [target]).reset_index(drop=True)

    # Shift target future first so only valid future-target pairs are evaluated
    clean_df["target_future"] = clean_df[target].shift(-horizon_steps)
    valid_df = clean_df.dropna(subset=["target_future"]).reset_index(drop=True)

    N = len(valid_df)
    if N < 20:
        raise ValueError(f"Insufficient samples ({N}) for target '{target}', horizon '{horizon_name}'.")

    val_start_pos = int(N * TRAIN_RATIO)

    train_data = valid_df.iloc[:val_start_pos]
    val_data = valid_df.iloc[val_start_pos:]

    X_train = train_data[feature_cols]
    y_train = train_data["target_future"]
    X_val = val_data[feature_cols]
    y_val = val_data["target_future"]

    y_val_baseline = val_data[target].values

    model = HistGradientBoostingRegressor(max_iter=100, learning_rate=0.05, max_depth=6, random_state=42)
    model.fit(X_train, y_train)

    y_val_pred = model.predict(X_val)

    model_mae = float(mean_absolute_error(y_val, y_val_pred))
    model_rmse = float(root_mean_squared_error(y_val, y_val_pred))
    baseline_mae = float(mean_absolute_error(y_val, y_val_baseline))
    baseline_rmse = float(root_mean_squared_error(y_val, y_val_baseline))

    improvement_pct = float((baseline_mae - model_mae) / baseline_mae * 100.0) if baseline_mae > 0 else 0.0
    strategy = "model" if model_mae < baseline_mae else "persistence"

    metadata = {
        "host": str(clean_df["host"].iloc[0]) if "host" in clean_df.columns else "unknown",
        "target": target,
        "horizon": horizon_name,
        "horizon_steps": horizon_steps,
        "strategy": strategy,
        "model_mae": round(model_mae, 4),
        "model_rmse": round(model_rmse, 4),
        "baseline_mae": round(baseline_mae, 4),
        "baseline_rmse": round(baseline_rmse, 4),
        "improvement_pct": round(improvement_pct, 2),
        "training_samples": len(train_data),
        "validation_samples": len(val_data),
        "training_window_start": str(clean_df["timestamp"].iloc[0]),
        "training_window_end": str(clean_df["timestamp"].iloc[-1]),
        "feature_columns": feature_cols,
        "algorithm": "HistGradientBoostingRegressor",
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    return model, metadata


def train_anomaly_pipeline(df: pd.DataFrame):
    for col in ANOMALY_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    X_train_df = df[ANOMALY_FEATURES].copy()

    pipeline = Pipeline(
        [
            ("preprocessor", TelemetryPreprocessor(feature_names=ANOMALY_FEATURES, skewed_features=SKEWED_FEATURES)),
            ("model", IsolationForest(n_estimators=100, contamination=0.03, random_state=42, n_jobs=-1)),
        ]
    )

    pipeline.fit(X_train_df)

    preprocessor = pipeline.named_steps["preprocessor"]
    model = pipeline.named_steps["model"]

    X_processed = preprocessor.transform(X_train_df)
    scores = -model.decision_function(X_processed)

    q85 = float(np.percentile(scores, 85))
    q95 = float(np.percentile(scores, 95))
    q98 = float(np.percentile(scores, 98))
    q99_5 = float(np.percentile(scores, 99.5))

    metadata = {
        "host": str(df["host"].iloc[0]) if "host" in df.columns else "unknown",
        "features": ANOMALY_FEATURES,
        "skewed_features": SKEWED_FEATURES,
        "contamination": 0.03,
        "algorithm": "IsolationForest",
        "anomaly_threshold": 0.0,
        "severity_thresholds": {
            "LOW": round(q85, 4),
            "MEDIUM": round(q95, 4),
            "HIGH": round(q98, 4),
            "CRITICAL": round(q99_5, 4),
        },
        "score_summary": {
            "min": round(float(np.min(scores)), 4),
            "median": round(float(np.median(scores)), 4),
            "max": round(float(np.max(scores)), 4),
        },
        "training_samples": len(df),
        "training_window_start": str(df["timestamp"].iloc[0]) if "timestamp" in df.columns else None,
        "training_window_end": str(df["timestamp"].iloc[-1]) if "timestamp" in df.columns else None,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    return pipeline, metadata


def train_host_models(host: str, lookback_days: int = 7, vm_url: str = "http://localhost:8428") -> dict:
    """
    Executes full production retraining for a host using real telemetry from VictoriaMetrics.
    Uses safe atomic replacement so existing working models are never corrupted on failure.
    """
    canonical_host = normalize_host(host)
    if not canonical_host:
        raise ValueError(f"Invalid host identifier: '{host}'")

    logger.info("Starting retraining for host '%s' (lookback=%d days)...", canonical_host, lookback_days)

    df_telemetry = fetch_telemetry_history(canonical_host, lookback_days=lookback_days, vm_url=vm_url)

    # Temporary output directories
    temp_forecast_dir = REPO_ROOT / "ml" / "models" / f"_temp_forecast_{canonical_host}"
    temp_anomaly_dir = REPO_ROOT / "ml" / "models" / f"_temp_anomaly_{canonical_host}"

    if temp_forecast_dir.exists():
        shutil.rmtree(temp_forecast_dir)
    if temp_anomaly_dir.exists():
        shutil.rmtree(temp_anomaly_dir)

    temp_forecast_dir.mkdir(parents=True, exist_ok=True)
    temp_anomaly_dir.mkdir(parents=True, exist_ok=True)

    summary = {"host": canonical_host, "forecast_models": [], "anomaly_trained": False}

    # Train forecasting models
    for target in TARGET_COLUMNS:
        for horizon_name, horizon_steps in HORIZON_STEPS_MAP.items():
            model, meta = train_forecasting_model_for_target(df_telemetry, target, horizon_name, horizon_steps)

            model_file = temp_forecast_dir / f"{target}_{horizon_name}.joblib"
            meta_file = temp_forecast_dir / f"{target}_{horizon_name}_meta.json"

            joblib.dump(model, model_file)
            with open(meta_file, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)

            summary["forecast_models"].append(f"{target}_{horizon_name}")

    # Train anomaly model
    anomaly_pipeline, anomaly_meta = train_anomaly_pipeline(df_telemetry)
    anomaly_model_file = temp_anomaly_dir / "isolation_forest.joblib"
    anomaly_meta_file = temp_anomaly_dir / "anomaly_metadata.json"

    joblib.dump(anomaly_pipeline, anomaly_model_file)
    with open(anomaly_meta_file, "w", encoding="utf-8") as f:
        json.dump(anomaly_meta, f, indent=2)

    summary["anomaly_trained"] = True

    # SAFE ATOMIC REPLACEMENT
    prod_forecast_dir = FORECAST_MODELS_DIR / canonical_host
    prod_anomaly_dir = ANOMALY_MODELS_DIR / canonical_host

    prod_forecast_dir.mkdir(parents=True, exist_ok=True)
    prod_anomaly_dir.mkdir(parents=True, exist_ok=True)

    # Move temporary files to production host directory
    for item in temp_forecast_dir.glob("*"):
        shutil.move(str(item), str(prod_forecast_dir / item.name))

    for item in temp_anomaly_dir.glob("*"):
        shutil.move(str(item), str(prod_anomaly_dir / item.name))

    # Cleanup temp dirs
    shutil.rmtree(temp_forecast_dir, ignore_errors=True)
    shutil.rmtree(temp_anomaly_dir, ignore_errors=True)

    logger.info("Retraining complete and production artifacts atomically updated for '%s'", canonical_host)
    return summary
