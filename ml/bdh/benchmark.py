"""
Phase 4A — Standardized Baseline Benchmark Comparison Pipeline
Evaluates PersistenceAdapter, HGBAdapter, and BDHAdapter on ubuntu_seq60_verified.npz.
"""

import json
import logging
import time
from pathlib import Path
import numpy as np

from ml.bdh.config import TARGET_COLUMNS, HORIZONS_MAP
from ml.bdh.adapters import PersistenceAdapter, HGBAdapter, HORIZONS
from ml.bdh.adapters_bdh import BDHAdapter
from ml.bdh.metrics import evaluate_forecast_dict

logger = logging.getLogger(__name__)

DATASET_PATH = Path("ml/data/bdh_datasets/ubuntu_seq60_verified.npz")
OUTPUT_REPORT_PATH = Path("ml/data/bdh_datasets/phase4a_benchmark.json")


def load_verified_dataset(filepath: str | Path = DATASET_PATH) -> dict:
    """Loads verified Ubuntu telemetry sequence dataset."""
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Dataset file not found at {filepath}")

    data = np.load(filepath, allow_pickle=True)
    X_norm = data["X_normalized"].astype(np.float32)
    N, T, D = X_norm.shape

    targets = {}
    for key in data.files:
        if key.startswith("target_"):
            for horizon in HORIZONS:
                if key.endswith(f"_{horizon}"):
                    target_metric = key[len("target_") : -len(f"_{horizon}")]
                    if target_metric not in targets:
                        targets[target_metric] = {}
                    targets[target_metric][horizon] = data[key].astype(np.float32)

    return {
        "X": X_norm,
        "targets": targets,
        "timestamps": data["timestamps"] if "timestamps" in data else None,
        "N": N,
        "T": T,
        "D": D,
    }


def split_chronological_dataset(
    dataset: dict,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
) -> tuple[dict, dict, dict, dict]:
    """
    Splits dataset chronologically into 70% Train, 15% Validation, 15% Test.
    Applies per-horizon purging to prevent data leakage across boundaries.
    """
    X = dataset["X"]
    targets = dataset["targets"]
    N = dataset["N"]

    train_end = int(np.floor(train_ratio * N))  # 540
    val_end = int(np.floor((train_ratio + val_ratio) * N))  # 656

    train_slice = slice(0, train_end)
    val_raw_slice = slice(train_end, val_end)
    test_raw_slice = slice(val_end, N)

    train_dataset = {"X": X[train_slice], "targets": {}}
    val_dataset_raw = {"X": X[val_raw_slice], "targets": {}}
    test_dataset_raw = {"X": X[test_raw_slice], "targets": {}}

    purge_info = {}

    for target in TARGET_COLUMNS:
        train_dataset["targets"][target] = {}
        val_dataset_raw["targets"][target] = {}
        test_dataset_raw["targets"][target] = {}

        for horizon, h_steps in HORIZONS_MAP.items():
            t_series = targets[target][horizon]

            # Train targets (0..539)
            train_dataset["targets"][target][horizon] = t_series[train_slice]

            # Per-horizon purge between train and val
            val_start_purged = train_end + h_steps
            if val_start_purged < val_end:
                val_target_arr = np.full(val_end - train_end, np.nan, dtype=np.float32)
                valid_val_len = val_end - val_start_purged
                val_target_arr[-valid_val_len:] = t_series[val_start_purged:val_end]
                val_dataset_raw["targets"][target][horizon] = val_target_arr
            else:
                val_dataset_raw["targets"][target][horizon] = np.full(val_end - train_end, np.nan, dtype=np.float32)

            # Per-horizon purge between val and test
            test_start_purged = val_end + h_steps
            if test_start_purged < N:
                test_target_arr = np.full(N - val_end, np.nan, dtype=np.float32)
                valid_test_len = N - test_start_purged
                test_target_arr[-valid_test_len:] = t_series[test_start_purged:N]
                test_dataset_raw["targets"][target][horizon] = test_target_arr
            else:
                test_dataset_raw["targets"][target][horizon] = np.full(N - val_end, np.nan, dtype=np.float32)

            purge_info[f"{target}_{horizon}"] = {
                "horizon_steps": h_steps,
                "train_valid_count": int(np.sum(~np.isnan(train_dataset["targets"][target][horizon]))),
                "val_valid_count": int(np.sum(~np.isnan(val_dataset_raw["targets"][target][horizon]))),
                "test_valid_count": int(np.sum(~np.isnan(test_dataset_raw["targets"][target][horizon]))),
            }

    split_meta = {
        "total_windows": N,
        "train_windows": train_end,
        "val_windows": val_end - train_end,
        "test_windows": N - val_end,
        "purge_info": purge_info,
    }

    return train_dataset, val_dataset_raw, test_dataset_raw, split_meta


def measure_inference_latency(adapter, X_sample: np.ndarray, num_runs: int = 50) -> dict:
    """Measures inference latency (P50, P95, P99 in ms) for a given context window array."""
    latencies_ms = []
    # Warmup
    for _ in range(5):
        _ = adapter.predict(X_sample)

    for _ in range(num_runs):
        t0 = time.perf_counter()
        _ = adapter.predict(X_sample)
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    latencies_ms = np.array(latencies_ms)
    return {
        "p50_ms": round(float(np.percentile(latencies_ms, 50)), 3),
        "p95_ms": round(float(np.percentile(latencies_ms, 95)), 3),
        "p99_ms": round(float(np.percentile(latencies_ms, 99)), 3),
        "mean_ms": round(float(np.mean(latencies_ms)), 3),
    }


def run_benchmark():
    """Runs Phase 4A Standardized Baseline Benchmark Comparison."""
    print("=========================================================")
    print("  PHASE 4A — STANDARDIZED BASELINE BENCHMARK COMPARISON  ")
    print("=========================================================")

    # 1. Load Dataset
    raw_dataset = load_verified_dataset()
    N, T, D = raw_dataset["N"], raw_dataset["T"], raw_dataset["D"]
    total_hours = (N * 30) / 3600.0

    print(f"Dataset File:             {DATASET_PATH}")
    print(f"Total Sequence Windows:   {N} [T={T}, D={D}]")
    print(f"Raw Telemetry Duration:   ~{total_hours:.2f} hours")

    # 2. Chronological Split & Leakage Audit
    train_ds, val_ds, test_ds, split_meta = split_chronological_dataset(raw_dataset)

    print("\n--- CHRONOLOGICAL SPLIT & PURGE AUDIT ---")
    print(f"Train Windows:       {split_meta['train_windows']} (70%)")
    print(f"Validation Windows:  {split_meta['val_windows']} (15%)")
    print(f"Test Windows:        {split_meta['test_windows']} (15%)")

    # Print sample counts table
    print("\nValid Target Counts Per Split / Horizon:")
    print(f"{'Target':<10} | {'Horizon':<8} | {'Purge Steps':<12} | {'Train Valid':<12} | {'Val Valid':<10} | {'Test Valid':<10}")
    print("-" * 75)
    for target in TARGET_COLUMNS:
        for horizon in HORIZONS:
            info = split_meta["purge_info"][f"{target}_{horizon}"]
            print(f"{target:<10} | {horizon:<8} | {info['horizon_steps']:<12} | {info['train_valid_count']:<12} | {info['val_valid_count']:<10} | {info['test_valid_count']:<10}")

    # Extract in-sample target series for MASE calculation
    in_sample_dict = {}
    for target in TARGET_COLUMNS:
        # Extract target index from FEATURE_COLUMNS
        target_idx = {"cpu": 0, "memory": 1, "load_1m": 4}[target]
        in_sample_dict[target] = train_ds["X"][:, -1, target_idx]

    benchmark_results = {}

    # 3. Model 1: Persistence Adapter
    print("\n[1/3] Evaluating Persistence Baseline...")
    pers_adapter = PersistenceAdapter()
    pers_preds = pers_adapter.predict(test_ds["X"])
    pers_metrics = evaluate_forecast_dict(test_ds["targets"], pers_preds, in_sample_dict)
    pers_lat_b1 = measure_inference_latency(pers_adapter, test_ds["X"][:1])
    pers_lat_b32 = measure_inference_latency(pers_adapter, test_ds["X"][:32])

    benchmark_results["Persistence"] = {
        "model_name": "Persistence",
        "parameters": 0,
        "fit_time_seconds": 0.0,
        "metrics": pers_metrics,
        "latency_b1": pers_lat_b1,
        "latency_b32": pers_lat_b32,
    }

    # 4. Model 2: HGB Adapter
    print("\n[2/3] Fitting & Evaluating HGB Baseline...")
    t0_hgb = time.perf_counter()
    hgb_adapter = HGBAdapter(random_state=42)
    hgb_fit_summary = hgb_adapter.fit(train_ds)
    fit_time_hgb = time.perf_counter() - t0_hgb

    hgb_preds = hgb_adapter.predict(test_ds["X"])
    hgb_metrics = evaluate_forecast_dict(test_ds["targets"], hgb_preds, in_sample_dict)
    hgb_lat_b1 = measure_inference_latency(hgb_adapter, test_ds["X"][:1])
    hgb_lat_b32 = measure_inference_latency(hgb_adapter, test_ds["X"][:32])

    benchmark_results["HGB"] = {
        "model_name": "HistGradientBoosting",
        "parameters": hgb_fit_summary["trained_models"] * 100,  # ~15 models * 100 trees
        "fit_time_seconds": round(fit_time_hgb, 3),
        "metrics": hgb_metrics,
        "latency_b1": hgb_lat_b1,
        "latency_b32": hgb_lat_b32,
    }

    # 5. Model 3: BDH-Inspired Sequence Model
    print("\n[3/3] Fitting & Evaluating BDH-Inspired Sequence Model...")
    t0_bdh = time.perf_counter()
    bdh_adapter = BDHAdapter(input_dim=D, hidden_dim=64, num_layers=2, device="cpu", random_state=42)
    bdh_fit_summary = bdh_adapter.fit(train_ds, epochs=20, lr=1e-3, batch_size=32)
    fit_time_bdh = time.perf_counter() - t0_bdh

    bdh_preds = bdh_adapter.predict(test_ds["X"])
    bdh_metrics = evaluate_forecast_dict(test_ds["targets"], bdh_preds, in_sample_dict)
    bdh_lat_b1 = measure_inference_latency(bdh_adapter, test_ds["X"][:1])
    bdh_lat_b32 = measure_inference_latency(bdh_adapter, test_ds["X"][:32])

    tot_p, _ = bdh_adapter.model.get_parameter_counts()
    benchmark_results["BDHInspired"] = {
        "model_name": "BDHInspiredSequenceModel",
        "parameters": tot_p,
        "fit_time_seconds": round(fit_time_bdh, 3),
        "metrics": bdh_metrics,
        "latency_b1": bdh_lat_b1,
        "latency_b32": bdh_lat_b32,
    }

    # 6. Format Detailed Results Table
    print("\n==========================================================================================")
    print("                      PHASE 4A BENCHMARK METRIC COMPARISON TABLE                          ")
    print("==========================================================================================")
    print(f"{'Model':<15} | {'Target':<8} | {'Horizon':<8} | {'MAE':<8} | {'RMSE':<8} | {'MASE':<8} | {'Evaluated N':<12}")
    print("-" * 88)

    for model_key in ["Persistence", "HGB", "BDHInspired"]:
        m_data = benchmark_results[model_key]
        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:
                met = m_data["metrics"][target][horizon]
                mae_str = f"{met['mae']:.4f}" if not np.isnan(met['mae']) else "N/A"
                rmse_str = f"{met['rmse']:.4f}" if not np.isnan(met['rmse']) else "N/A"
                mase_str = f"{met['mase']:.4f}" if not np.isnan(met['mase']) else "N/A"
                eval_n = met.get("evaluated_samples", 0)
                print(f"{m_data['model_name']:<15} | {target:<8} | {horizon:<8} | {mae_str:<8} | {rmse_str:<8} | {mase_str:<8} | {eval_n:<12}")
        print("-" * 88)

    # 7. Format Compact Metric Summary Table
    print("\n==========================================================================================")
    print("                             COMPACT MODEL SUMMARY TABLE                                  ")
    print("==========================================================================================")
    print(f"{'Model':<24} | {'CPU MAE (5m)':<12} | {'Mem MAE (5m)':<12} | {'Load MAE (5m)':<12} | {'Mean MAE (5m)':<12}")
    print("-" * 85)

    for model_key in ["Persistence", "HGB", "BDHInspired"]:
        m_data = benchmark_results[model_key]
        c_mae = m_data["metrics"]["cpu"]["5m"]["mae"]
        m_mae = m_data["metrics"]["memory"]["5m"]["mae"]
        l_mae = m_data["metrics"]["load_1m"]["5m"]["mae"]

        valid_maes = [v for v in [c_mae, m_mae, l_mae] if not np.isnan(v)]
        mean_mae = np.mean(valid_maes) if valid_maes else float("nan")

        print(f"{m_data['model_name']:<24} | {c_mae:<12.4f} | {m_mae:<12.4f} | {l_mae:<12.4f} | {mean_mae:<12.4f}")

    print("-" * 85)

    # 8. Format System Performance Table
    print("\n==========================================================================================")
    print("                            SYSTEM PERFORMANCE & LATENCY TABLE                             ")
    print("==========================================================================================")
    print(f"{'Model':<24} | {'Parameters':<12} | {'Fit Time (s)':<12} | {'P50 Lat (B=1)':<14} | {'P50 Lat (B=32)':<14}")
    print("-" * 85)

    for model_key in ["Persistence", "HGB", "BDHInspired"]:
        m_data = benchmark_results[model_key]
        params_str = f"{m_data['parameters']:,}" if m_data['parameters'] > 0 else "0"
        fit_str = f"{m_data['fit_time_seconds']:.2f}s"
        b1_str = f"{m_data['latency_b1']['p50_ms']:.2f} ms"
        b32_str = f"{m_data['latency_b32']['p50_ms']:.2f} ms"

        print(f"{m_data['model_name']:<24} | {params_str:<12} | {fit_str:<12} | {b1_str:<14} | {b32_str:<14}")

    print("-" * 85)

    # 9. Save JSON Result
    json_output = {
        "experiment_id": "phase4a_baseline_benchmark",
        "status": "EARLY_LIMITED_DATA_BENCHMARK",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset": {
            "path": str(DATASET_PATH),
            "total_windows": N,
            "sequence_length": T,
            "features": D,
            "raw_duration_hours": round(total_hours, 2),
        },
        "split": split_meta,
        "results": benchmark_results,
    }

    OUTPUT_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_REPORT_PATH, "w") as f:
        json.dump(json_output, f, indent=2)

    print(f"\nSaved machine-readable JSON report to {OUTPUT_REPORT_PATH}")
    print("=========================================================")


if __name__ == "__main__":
    run_benchmark()
