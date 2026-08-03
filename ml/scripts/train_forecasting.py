import os
import json
import argparse
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

# Configuration & Constants
HORIZON_STEPS_MAP = {
    '5m': 10,    # 5 * 60 / 30s = 10 steps
    '15m': 30,   # 15 * 60 / 30s = 30 steps
    '30m': 60,   # 30 * 60 / 30s = 60 steps
    '1h': 120,   # 60 * 60 / 30s = 120 steps
    '3h': 360,   # 180 * 60 / 30s = 360 steps
}

TARGET_COLUMNS = ['cpu', 'memory', 'load_1m']
TRAIN_RATIO = 0.80

DEFAULT_DATASET_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'telemetry.csv')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models', 'forecasting')


def prepare_features(df: pd.DataFrame, target_col: str):
    """
    Construct lag and rolling window features for time-series forecasting.
    Avoids target leakage by using past observations up to time t only.
    """
    data = df.copy()
    
    # Target lags (t, t-1, t-2, t-4, t-8, t-12)
    lags = [0, 1, 2, 4, 8, 12]
    feature_cols = []
    
    for lag in lags:
        col_name = f"{target_col}_lag_{lag}"
        data[col_name] = data[target_col].shift(lag)
        feature_cols.append(col_name)
        
    # Auxiliary metric current values (if present in dataframe)
    aux_metrics = ['cpu', 'memory', 'load_1m', 'load_5m', 'network_rx', 'network_tx', 'iowait']
    for aux in aux_metrics:
        if aux in data.columns and aux != target_col:
            col_name = f"aux_{aux}_t"
            data[col_name] = data[aux]
            feature_cols.append(col_name)
            
    # Rolling statistics over target
    data[f"{target_col}_roll_mean_5"] = data[target_col].rolling(window=5, min_periods=1).mean()
    data[f"{target_col}_roll_std_5"] = data[target_col].rolling(window=5, min_periods=1).std().fillna(0)
    feature_cols.extend([f"{target_col}_roll_mean_5", f"{target_col}_roll_std_5"])
    
    return data, feature_cols


def train_and_evaluate_forecasting(df: pd.DataFrame, target_col: str, horizon_name: str, horizon_steps: int):
    """
    Train ML model for a target & horizon using chronological feature timeline split + horizon embargo.
    Evaluates ML model and persistence baseline on identical validation observations.
    """
    prepared_df, feature_cols = prepare_features(df, target_col)
    
    # Clean initial boundary NaN rows resulting from lag shifts
    feature_clean_df = prepared_df.dropna(subset=feature_cols + [target_col]).reset_index(drop=True)
    
    N = len(feature_clean_df)
    if N < 100:
        raise ValueError(f"Insufficient feature data points ({N}) to evaluate target '{target_col}' horizon '{horizon_name}'.")

    # 1. Fixed Chronological Validation Start Position across all horizons
    val_start_pos = int(N * TRAIN_RATIO)
    
    # 2. Horizon Embargo & Training Cutoff: training features must end before (val_start_pos - horizon_steps)
    training_cutoff_pos = val_start_pos - horizon_steps
    if training_cutoff_pos <= 0:
        raise ValueError(f"Horizon steps ({horizon_steps}) exceeds available training cutoff ({val_start_pos}).")

    # Create target_future: target(t + h)
    feature_clean_df['target_future'] = feature_clean_df[target_col].shift(-horizon_steps)

    # 3. Training Set: feature positions t < training_cutoff_pos
    train_data = feature_clean_df.iloc[:training_cutoff_pos].dropna(subset=['target_future'])

    # 4. Validation Set: feature positions t >= val_start_pos (where target_future is non-null, i.e. t + h < N)
    val_data = feature_clean_df.iloc[val_start_pos:].dropna(subset=['target_future'])

    X_train = train_data[feature_cols]
    y_train = train_data['target_future']

    X_val = val_data[feature_cols]
    y_val = val_data['target_future']

    # Persistence Baseline Prediction: prediction at t+h = observed value at t
    y_val_baseline = val_data[target_col].values

    # Train Model
    model = HistGradientBoostingRegressor(
        max_iter=100,
        learning_rate=0.05,
        max_depth=6,
        random_state=42
    )
    model.fit(X_train, y_train)

    # ML Model Prediction on Validation Set
    y_val_pred = model.predict(X_val)

    # Calculate MAE and RMSE
    model_mae = float(mean_absolute_error(y_val, y_val_pred))
    model_rmse = float(root_mean_squared_error(y_val, y_val_pred))

    baseline_mae = float(mean_absolute_error(y_val, y_val_baseline))
    baseline_rmse = float(root_mean_squared_error(y_val, y_val_baseline))

    # Calculate Improvement Percentage
    if baseline_mae > 0:
        improvement_percent = float((baseline_mae - model_mae) / baseline_mae * 100.0)
    else:
        improvement_percent = 0.0

    # Strategy Selection Rule: model ONLY if model_mae < baseline_mae
    strategy = "model" if model_mae < baseline_mae else "persistence"

    # Validation start & cutoff timestamp strings
    val_start_ts = str(feature_clean_df['timestamp'].iloc[val_start_pos]) if 'timestamp' in feature_clean_df.columns else f"index_{val_start_pos}"
    cutoff_ts = str(feature_clean_df['timestamp'].iloc[training_cutoff_pos - 1]) if 'timestamp' in feature_clean_df.columns else f"index_{training_cutoff_pos - 1}"

    metadata = {
        "target": target_col,
        "horizon": horizon_name,
        "horizon_steps": horizon_steps,
        "strategy": strategy,
        "model_mae": round(model_mae, 4),
        "model_rmse": round(model_rmse, 4),
        "baseline_mae": round(baseline_mae, 4),
        "baseline_rmse": round(baseline_rmse, 4),
        "improvement_percent": round(improvement_percent, 2),
        "validation_start_position": val_start_pos,
        "training_cutoff_position": training_cutoff_pos,
        "embargo_steps": horizon_steps,
        "validation_start_timestamp": val_start_ts,
        "training_cutoff_timestamp": cutoff_ts,
        "training_samples": len(train_data),
        "validation_samples": len(val_data),
        "feature_columns": feature_cols,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    return model, metadata, {
        "target": target_col,
        "horizon": horizon_name,
        "horizon_steps": horizon_steps,
        "strategy": strategy,
        "model_mae": round(model_mae, 4),
        "model_rmse": round(model_rmse, 4),
        "baseline_mae": round(baseline_mae, 4),
        "baseline_rmse": round(baseline_rmse, 4),
        "improvement_pct": round(improvement_percent, 2),
        "train_samples": len(train_data),
        "val_samples": len(val_data)
    }


def main():
    parser = argparse.ArgumentParser(description="Train and evaluate forecasting models vs persistence baseline.")
    parser.add_argument('--dataset', type=str, default=DEFAULT_DATASET_PATH, help="Path to telemetry CSV dataset.")
    parser.add_argument('--output-dir', type=str, default=MODEL_DIR, help="Directory to save model artifacts.")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    if not os.path.exists(args.dataset):
        print(f"Dataset file not found at {args.dataset}. Run script with --dataset or ensure telemetry.csv exists.")
        return

    df = pd.read_csv(args.dataset)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp').reset_index(drop=True)

    results_summary = []

    print("==================================================")
    print("STARTING FORECAST MODEL VS BASELINE EVALUATION")
    print("==================================================")

    for target in TARGET_COLUMNS:
        if target not in df.columns:
            print(f"Skipping target '{target}' (not found in dataset).")
            continue

        for horizon_name, horizon_steps in HORIZON_STEPS_MAP.items():
            print(f"Evaluating Target: {target:<10} | Horizon: {horizon_name:<5} ({horizon_steps} steps)...")
            model, metadata, summary_row = train_and_evaluate_forecasting(df, target, horizon_name, horizon_steps)

            # Save model artifact (always save trained model artifact)
            model_file = os.path.join(args.output_dir, f"{target}_{horizon_name}.joblib")
            joblib.dump(model, model_file)

            # Save metadata JSON
            meta_file = os.path.join(args.output_dir, f"{target}_{horizon_name}_meta.json")
            with open(meta_file, 'w') as f:
                json.dump(metadata, f, indent=2)

            results_summary.append(summary_row)
            print(f"  -> Strategy: {summary_row['strategy'].upper():<11} | Model MAE: {summary_row['model_mae']:.4f} | Base MAE: {summary_row['baseline_mae']:.4f} | Impr: {summary_row['improvement_pct']:+.2f}%")

    # Save summary CSV
    summary_df = pd.DataFrame(results_summary)
    summary_csv_path = os.path.join(args.output_dir, "forecast_results.csv")
    summary_df.to_csv(summary_csv_path, index=False)
    
    # Also save to ml/forecast_results.csv if output-dir is inside ml/models/forecasting
    ml_root_csv = os.path.join(os.path.dirname(__file__), '..', 'forecast_results.csv')
    summary_df.to_csv(ml_root_csv, index=False)

    print("==================================================")
    print(f"Forecasting evaluation complete. Summary saved to:\n  - {summary_csv_path}\n  - {ml_root_csv}")
    print("==================================================")


if __name__ == '__main__':
    main()
