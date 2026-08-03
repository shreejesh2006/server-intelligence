import os
import argparse
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

# Configuration & Constants (Matching ml/scripts/train_forecasting.py)
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
DEFAULT_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'baseline_results.csv')


def prepare_features(df: pd.DataFrame, target_col: str):
    """
    Construct lag and rolling window features for time-series forecasting.
    Matches feature creation in train_forecasting.py.
    """
    data = df.copy()
    
    # Target lags (t, t-1, t-2, t-4, t-8, t-12)
    lags = [0, 1, 2, 4, 8, 12]
    feature_cols = []
    
    for lag in lags:
        col_name = f"{target_col}_lag_{lag}"
        data[col_name] = data[target_col].shift(lag)
        feature_cols.append(col_name)
        
    # Auxiliary metric current values
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


def evaluate_persistence_baseline(df: pd.DataFrame, target_col: str, horizon_name: str, horizon_steps: int):
    """
    Evaluates persistence baseline: prediction y_hat(t+h) = target(t)
    using the exact same chronological split + embargo validation set as train_forecasting.py.
    """
    prepared_df, feature_cols = prepare_features(df, target_col)
    feature_clean_df = prepared_df.dropna(subset=feature_cols + [target_col]).reset_index(drop=True)
    
    N = len(feature_clean_df)
    if N < 100:
        raise ValueError(f"Insufficient feature data points ({N}) to evaluate target '{target_col}' horizon '{horizon_name}'.")

    # Fixed Chronological Validation Start Position
    val_start_pos = int(N * TRAIN_RATIO)
    training_cutoff_pos = val_start_pos - horizon_steps

    if training_cutoff_pos <= 0:
        raise ValueError(f"Horizon steps ({horizon_steps}) exceeds available training cutoff ({val_start_pos}).")

    # Future target y(t+h)
    feature_clean_df['target_future'] = feature_clean_df[target_col].shift(-horizon_steps)

    # Training and Validation Sets
    train_data = feature_clean_df.iloc[:training_cutoff_pos].dropna(subset=['target_future'])
    val_data = feature_clean_df.iloc[val_start_pos:].dropna(subset=['target_future'])

    y_val = val_data['target_future']
    y_val_baseline = val_data[target_col].values  # Persistence: y_hat(t+h) = y(t)

    mae = float(mean_absolute_error(y_val, y_val_baseline))
    rmse = float(root_mean_squared_error(y_val, y_val_baseline))

    cutoff_ts = str(feature_clean_df['timestamp'].iloc[training_cutoff_pos - 1]) if 'timestamp' in feature_clean_df.columns else f"index_{training_cutoff_pos - 1}"

    return {
        "target": target_col,
        "horizon": horizon_name,
        "horizon_steps": horizon_steps,
        "training_cutoff": cutoff_ts,
        "training_samples": len(train_data),
        "validation_samples": len(val_data),
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "val_start_pos": val_start_pos,
        "total_rows": N
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate Persistence Baseline on Telemetry Data.")
    parser.add_argument('--dataset', type=str, default=DEFAULT_DATASET_PATH, help="Path to telemetry CSV dataset.")
    parser.add_argument('--output', type=str, default=DEFAULT_OUTPUT_PATH, help="Path to output baseline_results.csv.")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    if not os.path.exists(args.dataset):
        print(f"Dataset file not found at {args.dataset}. Ensure telemetry.csv exists or specify --dataset.")
        return

    df = pd.read_csv(args.dataset)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp').reset_index(drop=True)

    results = []

    print("=========================================================")
    print("SERVER INTELLIGENCE — FORECAST BASELINE")
    print("=========================================================")

    sample_target = TARGET_COLUMNS[0]
    sample_prep, sample_features = prepare_features(df, sample_target)
    sample_clean = sample_prep.dropna(subset=sample_features + [sample_target])
    n_rows = len(sample_clean)
    val_start = int(n_rows * TRAIN_RATIO)

    print(f"Rows: {n_rows}")
    print(f"Validation start: {val_start}")
    print("Split policy: Chronological split (80/20) with horizon embargo")
    print("=========================================================\n")

    for target in TARGET_COLUMNS:
        if target not in df.columns:
            print(f"Skipping target '{target}' (not in dataset).")
            continue

        print(f"TARGET: {target.upper()}")
        for horizon_name, horizon_steps in HORIZON_STEPS_MAP.items():
            res = evaluate_persistence_baseline(df, target, horizon_name, horizon_steps)
            results.append({
                "target": res["target"],
                "horizon": res["horizon"],
                "horizon_steps": res["horizon_steps"],
                "training_cutoff": res["training_cutoff"],
                "training_samples": res["training_samples"],
                "validation_samples": res["validation_samples"],
                "mae": res["mae"],
                "rmse": res["rmse"]
            })
            print(f"  {horizon_name:<5} ({horizon_steps:<3} steps) | Train: {res['training_samples']:<5} | Val: {res['validation_samples']:<5} | MAE: {res['mae']:.4f} | RMSE: {res['rmse']:.4f}")
        print()

    # Save to baseline_results.csv
    results_df = pd.DataFrame(results)
    results_df.to_csv(args.output, index=False)
    print("=========================================================")
    print(f"Baseline evaluation complete. Results saved to:\n  - {args.output}")
    print("=========================================================")


if __name__ == '__main__':
    main()
