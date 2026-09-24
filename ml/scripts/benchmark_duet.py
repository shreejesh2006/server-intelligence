"""
NOKIA Forecasting Research — Experiment 2: DUET / Dynamic Workload Regime Modeling Benchmark

Evaluates DUET against iTransformer baseline across 3 random seeds (42, 43, 44) under strict chronological split (70/15/15) with boundary purging.
Includes regime breakdown (NORMAL, CPU_BURST, MEMORY_PRESSURE, DISK_IO, NETWORK, MIXED, STEADY_STATE vs TRANSITION) and ablation studies.
"""

import json
import logging
import time
from pathlib import Path
import numpy as np
import pandas as pd

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS, HORIZONS_MAP
from ml.bdh.adapters import HORIZONS
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.dataset import BDHSequenceDataset
from ml.bdh.adapters_itransformer import iTransformerAdapter
from ml.bdh.adapters_duet import DUETAdapter
from ml.bdh.metrics import compute_mae, compute_rmse, compute_mase

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("benchmark_duet")

CSV_PATH = Path("ml/data/bdh/ubuntu_telemetry_history.csv")
NPZ_PATH = Path("ml/data/bdh_datasets/ubuntu_history_seq60.npz")
OUTPUT_JSON_PATH = Path("ml/data/bdh_datasets/duet_benchmark_results.json")

SEEDS = [42, 43, 44]


def load_dataset() -> dict:
    """Loads historical dataset from .npz or CSV if .npz is missing."""
    if NPZ_PATH.exists():
        logger.info("Loading verified historical dataset from %s", NPZ_PATH)
        d = np.load(NPZ_PATH, allow_pickle=True)
        X_raw = d["X_raw"].astype(np.float32)

        targets = {}
        for target in TARGET_COLUMNS:
            targets[target] = {}
            for horizon in HORIZONS:
                key = f"target_{target}_{horizon}"
                if key in d:
                    targets[target][horizon] = d[key].astype(np.float32)

        return {
            "X_raw": X_raw,
            "targets": targets,
            "N": len(X_raw),
            "T": X_raw.shape[1],
            "D": X_raw.shape[2],
        }

    logger.info("NPZ archive missing. Building sequence dataset from CSV: %s", CSV_PATH)
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Telemetry history CSV not found: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    dataset_inst = BDHSequenceDataset(sequence_length=60).build_from_dataframe(df)
    dataset_inst.save_npz(NPZ_PATH)

    return {
        "X_raw": dataset_inst.X_raw,
        "targets": dataset_inst.targets,
        "N": len(dataset_inst.X_raw),
        "T": dataset_inst.sequence_length,
        "D": len(FEATURE_COLUMNS),
    }


def chronological_split(dataset: dict) -> dict:
    """Splits dataset chronologically into 70% Train, 15% Validation, 15% Test with boundary purging."""
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


def preprocess_splits(splits: dict) -> tuple[dict, BDHPreprocessor]:
    """Fit preprocessing ONLY on training telemetry."""
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


def extract_in_sample_targets(train_split: dict) -> dict:
    """Extracts raw in-sample target series from training data for MASE scaling."""
    target_indices = {"cpu": 0, "memory": 1, "load_1m": 4}
    return {target: train_split["X_raw"][:, -1, idx] for target, idx in target_indices.items()}


def classify_context_regimes(X_raw_window: np.ndarray) -> tuple[str, str]:
    """
    Classifies a 60-timestep historical context window into operating regimes using historical data ONLY.

    Returns:
        - workload_regime: NORMAL, CPU_BURST, MEMORY_PRESSURE, DISK_IO, NETWORK, or MIXED
        - dynamics_regime: STEADY_STATE or TRANSITION
    """
    cpu_idx = FEATURE_COLUMNS.index("cpu")
    mem_idx = FEATURE_COLUMNS.index("memory")
    load_idx = FEATURE_COLUMNS.index("load_1m")
    rx_idx = FEATURE_COLUMNS.index("network_rx")
    tx_idx = FEATURE_COLUMNS.index("network_tx")
    read_idx = FEATURE_COLUMNS.index("disk_read")
    write_idx = FEATURE_COLUMNS.index("disk_write")

    latest = X_raw_window[-1]
    cpu_val = latest[cpu_idx]
    mem_val = latest[mem_idx]
    load_val = latest[load_idx]
    io_val = latest[read_idx] + latest[write_idx]
    net_val = latest[rx_idx] + latest[tx_idx]

    cpu_std = float(np.std(X_raw_window[:, cpu_idx]))
    cpu_delta = float(np.max(X_raw_window[:, cpu_idx]) - np.min(X_raw_window[:, cpu_idx]))

    is_cpu = (cpu_val >= 75.0) or (cpu_delta >= 30.0)
    is_mem = (mem_val >= 75.0)
    is_io = (io_val >= 1000.0)
    is_net = (net_val >= 1000.0)

    active_count = sum([is_cpu, is_mem, is_io, is_net])

    if active_count > 1:
        workload_regime = "MIXED"
    elif is_cpu:
        workload_regime = "CPU_BURST"
    elif is_mem:
        workload_regime = "MEMORY_PRESSURE"
    elif is_io:
        workload_regime = "DISK_IO"
    elif is_net:
        workload_regime = "NETWORK"
    else:
        workload_regime = "NORMAL"

    if cpu_std >= 5.0 or cpu_delta >= 15.0:
        dynamics_regime = "TRANSITION"
    else:
        dynamics_regime = "STEADY_STATE"

    return workload_regime, dynamics_regime


def evaluate_adapter(adapter, test_dataset: dict, in_sample_targets: dict) -> dict:
    """Evaluates adapter on test dataset and measures MAE, RMSE, MASE, latency, and regime breakdown."""
    X_test = test_dataset["X"]
    N = len(X_test)

    # Measure latency over sample
    sample_context = X_test[:1]
    latencies = []
    for _ in range(5):
        _ = adapter.predict_tensor(sample_context)
    for _ in range(20):
        t0 = time.perf_counter()
        _ = adapter.predict_tensor(sample_context)
        latencies.append((time.perf_counter() - t0) * 1000.0)
    p50_latency_ms = float(np.percentile(latencies, 50))

    Y_pred_tensor = adapter.predict_tensor(X_test)  # [N, 3, 5]

    X_raw_test = test_dataset["X_raw"]
    regime_labels = [classify_context_regimes(X_raw_test[i]) for i in range(N)]
    workload_regimes = [r[0] for r in regime_labels]
    dynamics_regimes = [r[1] for r in regime_labels]

    results = {
        "overall": {},
        "regimes": {},
        "dynamics": {},
        "latency_ms": round(p50_latency_ms, 3),
    }

    targets_dict = test_dataset["targets"]

    for m_idx, target in enumerate(TARGET_COLUMNS):
        results["overall"][target] = {}
        insample_y = in_sample_targets[target]

        for h_idx, horizon in enumerate(HORIZONS):
            y_true = targets_dict[target][horizon]
            y_pred = Y_pred_tensor[:, m_idx, h_idx]

            valid_mask = ~np.isnan(y_true)
            if np.sum(valid_mask) > 0:
                y_true_v = y_true[valid_mask]
                y_pred_v = y_pred[valid_mask]

                mae = compute_mae(y_true_v, y_pred_v)
                rmse = compute_rmse(y_true_v, y_pred_v)
                mase = compute_mase(y_true_v, y_pred_v, insample_y)
            else:
                mae, rmse, mase = float("nan"), float("nan"), float("nan")

            results["overall"][target][horizon] = {"mae": mae, "rmse": rmse, "mase": mase}

    # Per Workload Regime breakdown
    unique_workloads = set(workload_regimes)
    for wr in unique_workloads:
        wr_indices = np.array([i for i, r in enumerate(workload_regimes) if r == wr])
        results["regimes"][wr] = {"count": int(len(wr_indices)), "metrics": {}}

        for m_idx, target in enumerate(TARGET_COLUMNS):
            results["regimes"][wr]["metrics"][target] = {}
            for h_idx, horizon in enumerate(HORIZONS):
                y_true = targets_dict[target][horizon][wr_indices]
                y_pred = Y_pred_tensor[wr_indices, m_idx, h_idx]

                valid_mask = ~np.isnan(y_true)
                if np.sum(valid_mask) > 0:
                    mae = compute_mae(y_true[valid_mask], y_pred[valid_mask])
                else:
                    mae = float("nan")

                results["regimes"][wr]["metrics"][target][horizon] = mae

    # Per Dynamics Regime breakdown
    unique_dynamics = set(dynamics_regimes)
    for dr in unique_dynamics:
        dr_indices = np.array([i for i, r in enumerate(dynamics_regimes) if r == dr])
        results["dynamics"][dr] = {"count": int(len(dr_indices)), "metrics": {}}

        for m_idx, target in enumerate(TARGET_COLUMNS):
            results["dynamics"][dr]["metrics"][target] = {}
            for h_idx, horizon in enumerate(HORIZONS):
                y_true = targets_dict[target][horizon][dr_indices]
                y_pred = Y_pred_tensor[dr_indices, m_idx, h_idx]

                valid_mask = ~np.isnan(y_true)
                if np.sum(valid_mask) > 0:
                    mae = compute_mae(y_true[valid_mask], y_pred[valid_mask])
                else:
                    mae = float("nan")

                results["dynamics"][dr]["metrics"][target][horizon] = mae

    return results


def run_duet_benchmark():
    logger.info("Loading dataset for Experiment 2 DUET Benchmark...")
    raw_dataset = load_dataset()
    splits = chronological_split(raw_dataset)
    processed_splits, preprocessor = preprocess_splits(splits)

    train_ds = processed_splits["train"]
    val_ds = processed_splits["val"]
    test_ds = processed_splits["test"]

    in_sample_targets = extract_in_sample_targets(train_ds)

    logger.info(
        f"Dataset splits ready — Train: {len(train_ds['X'])}, Val: {len(val_ds['X'])}, Test: {len(test_ds['X'])}"
    )

    model_configs = {
        "iTransformer": lambda seed: iTransformerAdapter(hidden_dim=64, num_layers=2, nhead=4, random_state=seed),
        "DUET": lambda seed: DUETAdapter(hidden_dim=64, num_layers=2, nhead=4, random_state=seed),
        "DUET_no_TCM": lambda seed: DUETAdapter(
            hidden_dim=64, num_layers=2, nhead=4, use_temporal_clustering=False, random_state=seed
        ),
        "DUET_no_CCM": lambda seed: DUETAdapter(
            hidden_dim=64, num_layers=2, nhead=4, use_channel_clustering=False, random_state=seed
        ),
    }

    benchmark_runs = {m: [] for m in model_configs}

    for model_name, adapter_factory in model_configs.items():
        logger.info(f"\n==================== Benchmarking Model: {model_name} ====================")
        for seed in SEEDS:
            logger.info(f"--- Running {model_name} (Seed {seed}) ---")
            adapter = adapter_factory(seed)

            fit_start = time.perf_counter()
            fit_info = adapter.fit(train_ds, val_dataset=val_ds, epochs=15, batch_size=128, patience=4)
            fit_time = time.perf_counter() - fit_start

            eval_res = evaluate_adapter(adapter, test_ds, in_sample_targets)
            eval_res["fit_time_s"] = round(fit_time, 2)
            eval_res["parameters"] = fit_info["total_parameters"]
            eval_res["seed"] = seed

            benchmark_runs[model_name].append(eval_res)
            logger.info(
                f"[{model_name} Seed {seed}] CPU 5m MAE: {eval_res['overall']['cpu']['5m']['mae']:.4f}, "
                f"Load 5m MAE: {eval_res['overall']['load_1m']['5m']['mae']:.4f}, Fit Time: {fit_time:.2f}s"
            )

    # Aggregate Summary Statistics
    summary_results = {}
    for model_name, runs in benchmark_runs.items():
        summary_results[model_name] = {
            "parameters": runs[0]["parameters"],
            "avg_fit_time_s": float(np.mean([r["fit_time_s"] for r in runs])),
            "avg_latency_ms": float(np.mean([r["latency_ms"] for r in runs])),
            "metrics": {},
            "regimes": {},
            "dynamics": {},
        }

        # Aggregated overall metrics
        for target in TARGET_COLUMNS:
            summary_results[model_name]["metrics"][target] = {}
            for horizon in HORIZONS:
                maes = [r["overall"][target][horizon]["mae"] for r in runs]
                rmses = [r["overall"][target][horizon]["rmse"] for r in runs]
                mases = [r["overall"][target][horizon]["mase"] for r in runs]

                summary_results[model_name]["metrics"][target][horizon] = {
                    "mae_mean": round(float(np.mean(maes)), 4),
                    "mae_std": round(float(np.std(maes)), 4),
                    "rmse_mean": round(float(np.mean(rmses)), 4),
                    "mase_mean": round(float(np.mean(mases)), 4),
                }

        # Aggregated Workload Regime metrics
        for wr in runs[0]["regimes"]:
            summary_results[model_name]["regimes"][wr] = {}
            for target in TARGET_COLUMNS:
                summary_results[model_name]["regimes"][wr][target] = {}
                for horizon in HORIZONS:
                    maes = [r["regimes"][wr]["metrics"][target][horizon] for r in runs]
                    summary_results[model_name]["regimes"][wr][target][horizon] = {
                        "mae_mean": round(float(np.mean(maes)), 4),
                        "mae_std": round(float(np.std(maes)), 4),
                    }

        # Aggregated Dynamics Regime metrics (STEADY_STATE vs TRANSITION)
        for dr in runs[0]["dynamics"]:
            summary_results[model_name]["dynamics"][dr] = {}
            for target in TARGET_COLUMNS:
                summary_results[model_name]["dynamics"][dr][target] = {}
                for horizon in HORIZONS:
                    maes = [r["dynamics"][dr]["metrics"][target][horizon] for r in runs]
                    summary_results[model_name]["dynamics"][dr][target][horizon] = {
                        "mae_mean": round(float(np.mean(maes)), 4),
                        "mae_std": round(float(np.std(maes)), 4),
                    }

    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w") as f:
        json.dump(summary_results, f, indent=2)

    logger.info(f"\nDUET Benchmark complete! Results saved to {OUTPUT_JSON_PATH}")


if __name__ == "__main__":
    run_duet_benchmark()
