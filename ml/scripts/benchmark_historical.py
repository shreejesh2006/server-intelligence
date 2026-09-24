"""
Full Historical Ubuntu ML Benchmark — Focused Baselines & Experiment B

Leak-free chronological benchmark on historical Ubuntu telemetry dataset.

Competitors (5 Essential Models):
    1. Persistence
    2. HistGradientBoosting (HGB)
    3. PatchTST (PyTorch)
    4. PatchTST + HGB Residual (Experiment A)
    5. PatchTST + Fast Memory (Experiment B — Static/Frozen Memory)

Preprocessing:
    RobustScaler + log1p for skewed features.
    FIT ON TRAINING DATA ONLY.
"""

import json
import time
from pathlib import Path
import numpy as np

from ml.bdh.config import (
    FEATURE_COLUMNS,
    TARGET_COLUMNS,
    HORIZONS_MAP,
)
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.adapters import (
    PersistenceAdapter,
    HGBAdapter,
    HORIZONS,
)
from ml.bdh.adapters_patchtst import PatchTSTAdapter
from ml.bdh.adapters_hybrid import PatchTSTHGBResidualAdapter
from ml.bdh.adapters_patchtst_memory import PatchTSTFastMemoryAdapter
from ml.bdh.metrics import evaluate_forecast_dict


DATASET_PATH = Path("ml/data/bdh_datasets/ubuntu_history_seq60.npz")
OUTPUT_PATH = Path("ml/data/bdh_datasets/historical_benchmark.json")


def load_dataset():
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Historical dataset missing: {DATASET_PATH}")

    d = np.load(DATASET_PATH, allow_pickle=True)
    X_raw = d["X_raw"].astype(np.float32)

    targets = {}
    for target in TARGET_COLUMNS:
        targets[target] = {}
        for horizon in HORIZONS:
            key = f"target_{target}_{horizon}"
            if key not in d:
                raise RuntimeError(f"Missing target key: {key}")
            targets[target][horizon] = d[key].astype(np.float32)

    return {
        "X_raw": X_raw,
        "targets": targets,
        "timestamps": d["timestamps"] if "timestamps" in d else None,
        "N": len(X_raw),
        "T": X_raw.shape[1],
        "D": X_raw.shape[2],
    }


def chronological_split(dataset):
    """
    Splits dataset chronologically into 70% Train, 15% Validation, 15% Test.
    Applies per-horizon purging to prevent label overlap across boundaries.
    """
    X = dataset["X_raw"]
    targets = dataset["targets"]
    N = dataset["N"]

    train_end = int(N * 0.70)
    val_end = int(N * 0.85)

    splits = {
        "train": (0, train_end),
        "val": (train_end, val_end),
        "test": (val_end, N),
    }

    result = {}

    for name, (start, end) in splits.items():
        result[name] = {
            "X_raw": X[start:end],
            "targets": {},
        }

        for target in TARGET_COLUMNS:
            result[name]["targets"][target] = {}

            for horizon, h_steps in HORIZONS_MAP.items():
                source = targets[target][horizon]
                arr = np.full(end - start, np.nan, dtype=np.float32)

                if name == "train":
                    valid_start = start
                else:
                    valid_start = start + h_steps

                if valid_start < end:
                    local_start = valid_start - start
                    arr[local_start:] = source[valid_start:end]

                result[name]["targets"][target][horizon] = arr

    return result


def preprocess_splits(splits):
    """
    Fit preprocessing ONLY on training telemetry.
    RobustScaler is fitted on every raw timestep belonging to training windows,
    then applied to val/test without modifying raw target features.
    """
    preprocessor = BDHPreprocessor(feature_columns=FEATURE_COLUMNS)
    X_train_raw = splits["train"]["X_raw"]

    flat_train = X_train_raw.reshape(-1, X_train_raw.shape[-1])
    preprocessor.fit(flat_train)

    processed = {}
    for name, split in splits.items():
        X_raw = split["X_raw"]
        processed[name] = {
            "X_raw": X_raw,
            "X": preprocessor.transform(X_raw),
            "targets": split["targets"],
        }

    return processed, preprocessor


def in_sample_targets(train):
    """
    Extracts raw in-sample target series from training data for MASE scaling.
    Must use RAW telemetry features (not normalized features).
    """
    result = {}
    target_indices = {
        "cpu": 0,
        "memory": 1,
        "load_1m": 4,
    }

    for target, idx in target_indices.items():
        result[target] = train["X_raw"][:, -1, idx]

    return result


def print_metrics(model_name, metrics):
    print(f"\n===== {model_name} =====")
    for target in TARGET_COLUMNS:
        for horizon in HORIZONS:
            m = metrics[target][horizon]
            n_samples = m.get("evaluated_samples", 0)
            mae_str = f"{m['mae']:.6f}" if not np.isnan(m["mae"]) else "N/A"
            rmse_str = f"{m['rmse']:.6f}" if not np.isnan(m["rmse"]) else "N/A"
            mase_str = f"{m['mase']:.6f}" if not np.isnan(m["mase"]) else "N/A"

            print(
                f"{target:8s} "
                f"{horizon:5s} "
                f"MAE={mae_str} "
                f"RMSE={rmse_str} "
                f"MASE={mase_str} "
                f"N={n_samples}"
            )


def main():
    print("=" * 72)
    print("NOKIA — HISTORICAL ML BENCHMARK (5 ESSENTIAL MODELS)")
    print("=" * 72)

    dataset = load_dataset()

    print(f"\nDataset: {DATASET_PATH}")
    print(f"Windows: {dataset['N']:,}")
    print(f"Shape:   {dataset['X_raw'].shape}")

    # 1. Chronological Split
    splits = chronological_split(dataset)

    print("\n===== CHRONOLOGICAL SPLIT =====")
    for name, split in splits.items():
        print(f"{name:5s}: {len(split['X_raw']):,} windows")

    # 2. Leak-Free Preprocessing
    print("\nFitting RobustScaler on TRAINING data only...")
    splits, preprocessor = preprocess_splits(splits)
    print("Preprocessing complete.")

    train = splits["train"]
    val = splits["val"]
    test = splits["test"]

    in_sample = in_sample_targets(train)
    results = {}

    # ------------------------------------------------------------
    # 1. Persistence Baseline (Uses RAW Telemetry Values)
    # ------------------------------------------------------------
    print("\n[1/5] Persistence")
    persistence = PersistenceAdapter()

    t0 = time.perf_counter()
    pred_pers = persistence.predict(test["X_raw"])
    latency_pers = time.perf_counter() - t0

    metrics_pers = evaluate_forecast_dict(
        test["targets"],
        pred_pers,
        in_sample,
    )

    results["Persistence"] = {
        "model_name": "Persistence",
        "parameters": 0,
        "fit_time_seconds": 0.0,
        "prediction_time_seconds": latency_pers,
        "metrics": metrics_pers,
    }
    print_metrics("Persistence", metrics_pers)

    # ------------------------------------------------------------
    # 2. HistGradientBoosting Baseline
    # ------------------------------------------------------------
    print("\n[2/5] HistGradientBoosting")
    hgb = HGBAdapter(random_state=42)

    t0 = time.perf_counter()
    fit_summary_hgb = hgb.fit(train)
    fit_time_hgb = time.perf_counter() - t0

    t0_pred = time.perf_counter()
    pred_hgb = hgb.predict(test["X"])
    latency_hgb = time.perf_counter() - t0_pred

    metrics_hgb = evaluate_forecast_dict(
        test["targets"],
        pred_hgb,
        in_sample,
    )

    results["HGB"] = {
        "model_name": "HistGradientBoosting",
        "parameters": fit_summary_hgb["trained_models"] * 100,
        "fit_time_seconds": fit_time_hgb,
        "prediction_time_seconds": latency_hgb,
        "trained_models": fit_summary_hgb["trained_models"],
        "metrics": metrics_hgb,
    }
    print(f"Fit time: {fit_time_hgb:.2f}s | Models: {fit_summary_hgb['trained_models']}")
    print_metrics("HistGradientBoosting", metrics_hgb)

    # ------------------------------------------------------------
    # 3. PatchTST Sequence Model
    # ------------------------------------------------------------
    print("\n[3/5] PatchTST Sequence Model")
    patchtst = PatchTSTAdapter(
        input_dim=dataset["D"],
        sequence_length=dataset["T"],
        patch_len=10,
        stride=5,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        device="cpu",
        random_state=42,
    )

    t0 = time.perf_counter()
    fit_summary_patchtst = patchtst.fit(
        train,
        val_dataset=val,
        epochs=25,
        lr=1e-3,
        batch_size=64,
        patience=5,
    )
    fit_time_patchtst = time.perf_counter() - t0

    t0_pred = time.perf_counter()
    pred_patchtst = patchtst.predict(test["X"])
    latency_patchtst = time.perf_counter() - t0_pred

    metrics_patchtst = evaluate_forecast_dict(
        test["targets"],
        pred_patchtst,
        in_sample,
    )

    params_p, trainable_p = patchtst.model.get_parameter_counts()

    results["PatchTST"] = {
        "model_name": "PatchTSTModel",
        "parameters": params_p,
        "trainable_parameters": trainable_p,
        "fit_time_seconds": fit_time_patchtst,
        "prediction_time_seconds": latency_patchtst,
        "epochs_trained": fit_summary_patchtst.get("epochs_trained"),
        "best_val_loss": fit_summary_patchtst.get("best_val_loss"),
        "metrics": metrics_patchtst,
    }
    print(f"Fit time: {fit_time_patchtst:.2f}s | Parameters: {params_p:,}")
    print_metrics("PatchTST", metrics_patchtst)

    # ------------------------------------------------------------
    # 4. Experiment A — PatchTST + HGB Residual Model
    # ------------------------------------------------------------
    print("\n[4/5] PatchTST + HGB Residual (Experiment A)")
    patchtst_hgb_residual = PatchTSTHGBResidualAdapter(
        input_dim=dataset["D"],
        sequence_length=dataset["T"],
        patch_len=10,
        stride=5,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        device="cpu",
        random_state=42,
    )

    t0 = time.perf_counter()
    fit_summary_exp_a = patchtst_hgb_residual.fit(
        train,
        val_dataset=val,
        epochs=25,
        lr=1e-3,
        batch_size=64,
        patience=5,
    )
    fit_time_exp_a = time.perf_counter() - t0

    t0_pred = time.perf_counter()
    pred_exp_a = patchtst_hgb_residual.predict(test["X"])
    latency_exp_a = time.perf_counter() - t0_pred

    metrics_exp_a = evaluate_forecast_dict(
        test["targets"],
        pred_exp_a,
        in_sample,
    )

    tot_p_exp_a = fit_summary_exp_a.get("total_parameters", 0)

    results["PatchTSTHGBResidual"] = {
        "model_name": "PatchTST + HGB Residual (Experiment A)",
        "parameters": tot_p_exp_a,
        "fit_time_seconds": fit_time_exp_a,
        "prediction_time_seconds": latency_exp_a,
        "trained_residual_models": fit_summary_exp_a.get("trained_residual_models"),
        "metrics": metrics_exp_a,
    }
    print(f"Fit time: {fit_time_exp_a:.2f}s | Parameters: {tot_p_exp_a:,}")
    print_metrics("PatchTST + HGB Residual", metrics_exp_a)

    # ------------------------------------------------------------
    # 5. Experiment B — PatchTST + Fast Memory (Static / Frozen Memory)
    # ------------------------------------------------------------
    print("\n[5/5] PatchTST + Fast Memory (Experiment B — Static/Frozen Memory)")
    patchtst_fast_mem = PatchTSTFastMemoryAdapter(
        input_dim=dataset["D"],
        sequence_length=dataset["T"],
        patch_len=10,
        stride=5,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        memory_decay=0.95,
        memory_update_scale=0.1,
        device="cpu",
        random_state=42,
    )

    t0 = time.perf_counter()
    fit_summary_exp_b = patchtst_fast_mem.fit(
        train,
        val_dataset=val,
        epochs=25,
        lr=1e-3,
        batch_size=64,
        patience=5,
    )
    fit_time_exp_b = time.perf_counter() - t0

    t0_pred = time.perf_counter()
    pred_exp_b = patchtst_fast_mem.predict(test["X"])
    latency_exp_b = time.perf_counter() - t0_pred

    metrics_exp_b = evaluate_forecast_dict(
        test["targets"],
        pred_exp_b,
        in_sample,
    )

    tot_p_exp_b, trainable_exp_b = patchtst_fast_mem.model.get_parameter_counts()

    results["PatchTSTFastMemory_Static"] = {
        "model_name": "PatchTST + Fast Memory (Static/Frozen)",
        "parameters": tot_p_exp_b,
        "trainable_parameters": trainable_exp_b,
        "fit_time_seconds": fit_time_exp_b,
        "prediction_time_seconds": latency_exp_b,
        "epochs_trained": fit_summary_exp_b.get("epochs_trained"),
        "best_val_loss": fit_summary_exp_b.get("best_val_loss"),
        "metrics": metrics_exp_b,
    }
    print(f"Fit time: {fit_time_exp_b:.2f}s | Parameters: {tot_p_exp_b:,}")
    print_metrics("PatchTST + Fast Memory (Static)", metrics_exp_b)

    # ------------------------------------------------------------
    # Summary Table
    # ------------------------------------------------------------
    print("\n" + "=" * 80)
    print("                HISTORICAL BENCHMARK SUMMARY TABLE (5m Horizon)                 ")
    print("=" * 80)
    print(f"{'Model':<38} | {'CPU MAE':<10} | {'Mem MAE':<10} | {'Load MAE':<10} | {'Mean MAE':<10} | {'Fit Time':<8}")
    print("-" * 80)

    for model_key in ["Persistence", "HGB", "PatchTST", "PatchTSTHGBResidual", "PatchTSTFastMemory_Static"]:
        data = results[model_key]
        c_mae = data["metrics"]["cpu"]["5m"]["mae"]
        m_mae = data["metrics"]["memory"]["5m"]["mae"]
        l_mae = data["metrics"]["load_1m"]["5m"]["mae"]
        valid_maes = [v for v in [c_mae, m_mae, l_mae] if not np.isnan(v)]
        mean_mae = np.mean(valid_maes) if valid_maes else float("nan")
        fit_t = data.get("fit_time_seconds", 0.0)

        print(f"{data['model_name']:<38} | {c_mae:<10.4f} | {m_mae:<10.4f} | {l_mae:<10.4f} | {mean_mae:<10.4f} | {fit_t:<8.2f}s")

    print("=" * 80)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "dataset": str(DATASET_PATH),
        "windows": dataset["N"],
        "sequence_length": dataset["T"],
        "features": dataset["D"],
        "train_windows": len(train["X"]),
        "test_windows": len(test["X"]),
        "preprocessing": {
            "method": "log1p + RobustScaler",
            "fit_scope": "training_windows_only",
        },
        "results": results,
    }

    with OUTPUT_PATH.open("w") as f:
        json.dump(
            report,
            f,
            indent=2,
            default=lambda x: float(x),
        )

    print(f"\nSaved report: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
