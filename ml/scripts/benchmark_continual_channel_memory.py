"""
NOKIA — Continual Learning ML Benchmark (Experiment D: Channel-Isolated Fast Memory)

Evaluates whether channel isolation (M_cpu, M_memory, M_load) eliminates cross-channel interference
between CPU, RAM, and System Load telemetry while preserving long-horizon memory adaptation.

Protocols Evaluated:
    1. Frozen PatchTST (Standalone PatchTST, trained once, zero online updates)
    2. PatchTST + Gated Shared Memory (Experiment C-Fix, single shared M matrix)
    3. PatchTST + Gated Channel-Isolated Memory (Experiment D, three isolated M_cpu, M_memory, M_load matrices)

Zero Leakage Guarantee:
    Online memory updates consume ONLY the 5m target observation Y_(t+5m).
    Future target labels (15m, 30m, 1h, 3h) are strictly excluded from online memory updates.
"""

import json
import time
from pathlib import Path
import numpy as np

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS, HORIZONS_MAP
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.adapters import HORIZONS
from ml.bdh.adapters_patchtst import PatchTSTAdapter
from ml.bdh.adapters_patchtst_gated_memory import PatchTSTGatedMemoryAdapter
from ml.bdh.adapters_patchtst_channel_memory import PatchTSTChannelMemoryAdapter
from ml.bdh.metrics import evaluate_forecast_dict


DATASET_PATH = Path("ml/data/bdh_datasets/ubuntu_history_seq60.npz")
OUTPUT_PATH = Path("ml/data/bdh_datasets/continual_channel_memory_benchmark.json")


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
        "N": len(X_raw),
        "T": X_raw.shape[1],
        "D": X_raw.shape[2],
    }


def chronological_split(dataset):
    """Splits dataset chronologically into 70% Train, 15% Validation, 15% Test with per-horizon purge."""
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
    """Fit preprocessing ONLY on training telemetry timesteps."""
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
    """Extracts raw in-sample target series from training data for MASE scaling."""
    result = {}
    target_indices = {"cpu": 0, "memory": 1, "load_1m": 4}

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
    print("=" * 80)
    print("NOKIA — CONTINUAL LEARNING BENCHMARK (EXPERIMENT D: CHANNEL-ISOLATED FAST MEMORY)")
    print("=" * 80)

    dataset = load_dataset()
    splits = chronological_split(dataset)
    splits, preprocessor = preprocess_splits(splits)

    train = splits["train"]
    val = splits["val"]
    test = splits["test"]

    in_sample = in_sample_targets(train)
    N_test = len(test["X"])

    # 1. Initial Offline Training Phase
    print("\n[Phase 1] Fitting initial offline models on training set...")

    # Model A: Standalone Frozen PatchTST
    patchtst_frozen = PatchTSTAdapter(
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
    t0_tr = time.perf_counter()
    patchtst_frozen.fit(train, val_dataset=val, epochs=25, lr=1e-3, batch_size=64, patience=5)
    train_t_a = time.perf_counter() - t0_tr

    # Model B: PatchTST + Gated Shared Memory Adapter (Experiment C-Fix Control)
    patchtst_gated_adapter = PatchTSTGatedMemoryAdapter(
        input_dim=dataset["D"],
        sequence_length=dataset["T"],
        patch_len=10,
        stride=5,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        memory_decay=0.95,
        memory_update_scale=0.1,
        gate_slope=5.0,
        gate_bias=-2.5,
        device="cpu",
        random_state=42,
    )
    t0_tr = time.perf_counter()
    patchtst_gated_adapter.fit(train, val_dataset=val, epochs=25, lr=1e-3, batch_size=64, patience=5)
    train_t_b = time.perf_counter() - t0_tr

    # Model C: PatchTST + Gated Channel-Isolated Memory Adapter (Experiment D)
    patchtst_channel_adapter = PatchTSTChannelMemoryAdapter(
        input_dim=dataset["D"],
        sequence_length=dataset["T"],
        patch_len=10,
        stride=5,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        memory_decay=0.95,
        memory_update_scale=0.1,
        gate_slope=5.0,
        gate_bias=-2.5,
        device="cpu",
        random_state=42,
    )
    t0_tr = time.perf_counter()
    patchtst_channel_adapter.fit(train, val_dataset=val, epochs=25, lr=1e-3, batch_size=64, patience=5)
    train_t_c = time.perf_counter() - t0_tr

    print("Initial offline training complete.")

    # 2. Sequential Continual Evaluation Phase over Test Set
    batch_size = 64
    num_batches = (N_test + batch_size - 1) // batch_size

    print(f"\n[Phase 2] Simulating continual evaluation over {N_test:,} test windows ({num_batches} batches)...")

    # Arrays to accumulate predictions
    preds_a = {t: {h: np.zeros(N_test, dtype=np.float32) for h in HORIZONS} for t in TARGET_COLUMNS}
    preds_b_gated_shared = {t: {h: np.zeros(N_test, dtype=np.float32) for h in HORIZONS} for t in TARGET_COLUMNS}
    preds_c_channel_isolated = {t: {h: np.zeros(N_test, dtype=np.float32) for h in HORIZONS} for t in TARGET_COLUMNS}

    # Model A prediction (no memory)
    pred_a_all = patchtst_frozen.predict(test["X"])
    for t in TARGET_COLUMNS:
        for h in HORIZONS:
            preds_a[t][h] = pred_a_all[t][h]

    # Sequential continual evaluation for Model B (Gated Shared Memory C-Fix)
    patchtst_gated_adapter.reset_memory()
    t0_seq = time.perf_counter()

    for b in range(num_batches):
        start_idx = b * batch_size
        end_idx = min(N_test, (b + 1) * batch_size)
        X_batch = test["X"][start_idx:end_idx]

        # STEP 1: PREDICT (Uses current persistent shared memory M_b WITHOUT updating)
        pred_b_batch = patchtst_gated_adapter.predict(X_batch)

        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:
                preds_b_gated_shared[target][horizon][start_idx:end_idx] = pred_b_batch[target][horizon]

        # STEP 2: Assembling ONLY the 5m target observation (5m)
        Y_actual_5m = np.zeros((end_idx - start_idx, len(TARGET_COLUMNS), 1), dtype=np.float32)
        Y_pred_5m = np.zeros((end_idx - start_idx, len(TARGET_COLUMNS), 1), dtype=np.float32)

        for m_idx, target in enumerate(TARGET_COLUMNS):
            raw_5m = test["targets"][target]["5m"][start_idx:end_idx]
            Y_actual_5m[:, m_idx, 0] = raw_5m
            Y_pred_5m[:, m_idx, 0] = pred_b_batch[target]["5m"]

        # STEP 3: UPDATE
        patchtst_gated_adapter.update_memory(X_batch, y_actual=Y_actual_5m, y_pred=Y_pred_5m)

    # Sequential continual evaluation for Model C (Experiment D: Gated Channel-Isolated Memory)
    patchtst_channel_adapter.reset_memory()

    for b in range(num_batches):
        start_idx = b * batch_size
        end_idx = min(N_test, (b + 1) * batch_size)
        X_batch = test["X"][start_idx:end_idx]

        # STEP 1: PREDICT (Uses current isolated channel memory matrices WITHOUT updating)
        pred_c_batch = patchtst_channel_adapter.predict(X_batch)

        for target in TARGET_COLUMNS:
            for horizon in HORIZONS:
                preds_c_channel_isolated[target][horizon][start_idx:end_idx] = pred_c_batch[target][horizon]

        # STEP 2: Assembling ONLY the 5m target observation (5m)
        Y_actual_5m = np.zeros((end_idx - start_idx, len(TARGET_COLUMNS), 1), dtype=np.float32)
        Y_pred_5m = np.zeros((end_idx - start_idx, len(TARGET_COLUMNS), 1), dtype=np.float32)

        for m_idx, target in enumerate(TARGET_COLUMNS):
            raw_5m = test["targets"][target]["5m"][start_idx:end_idx]
            Y_actual_5m[:, m_idx, 0] = raw_5m
            Y_pred_5m[:, m_idx, 0] = pred_c_batch[target]["5m"]

        # STEP 3: UPDATE (Channel-Isolated updates: CPU -> M_cpu, RAM -> M_memory, Load -> M_load)
        patchtst_channel_adapter.update_memory(X_batch, y_actual=Y_actual_5m, y_pred=Y_pred_5m)

    continual_eval_time = time.perf_counter() - t0_seq

    # 3. Compute Metrics
    metrics_a = evaluate_forecast_dict(test["targets"], preds_a, in_sample)
    metrics_b_shared = evaluate_forecast_dict(test["targets"], preds_b_gated_shared, in_sample)
    metrics_c_channel = evaluate_forecast_dict(test["targets"], preds_c_channel_isolated, in_sample)

    # Segment Adaptation Metrics: First 20% vs Last 20% of test stream
    seg_size = int(N_test * 0.20)
    early_test_targets = {t: {h: test["targets"][t][h][:seg_size] for h in HORIZONS} for t in TARGET_COLUMNS}
    late_test_targets = {t: {h: test["targets"][t][h][-seg_size:] for h in HORIZONS} for t in TARGET_COLUMNS}

    early_preds_a = {t: {h: preds_a[t][h][:seg_size] for h in HORIZONS} for t in TARGET_COLUMNS}
    late_preds_a = {t: {h: preds_a[t][h][-seg_size:] for h in HORIZONS} for t in TARGET_COLUMNS}

    early_preds_b = {t: {h: preds_b_gated_shared[t][h][:seg_size] for h in HORIZONS} for t in TARGET_COLUMNS}
    late_preds_b = {t: {h: preds_b_gated_shared[t][h][-seg_size:] for h in HORIZONS} for t in TARGET_COLUMNS}

    early_preds_c = {t: {h: preds_c_channel_isolated[t][h][:seg_size] for h in HORIZONS} for t in TARGET_COLUMNS}
    late_preds_c = {t: {h: preds_c_channel_isolated[t][h][-seg_size:] for h in HORIZONS} for t in TARGET_COLUMNS}

    early_metrics_a = evaluate_forecast_dict(early_test_targets, early_preds_a, in_sample)
    late_metrics_a = evaluate_forecast_dict(late_test_targets, late_preds_a, in_sample)

    early_metrics_b = evaluate_forecast_dict(early_test_targets, early_preds_b, in_sample)
    late_metrics_b = evaluate_forecast_dict(late_test_targets, late_preds_b, in_sample)

    early_metrics_c = evaluate_forecast_dict(early_test_targets, early_preds_c, in_sample)
    late_metrics_c = evaluate_forecast_dict(late_test_targets, late_preds_c, in_sample)

    print_metrics("Frozen PatchTST (No Memory)", metrics_a)
    print_metrics("PatchTST + Gated Shared Memory (Experiment C-Fix)", metrics_b_shared)
    print_metrics("PatchTST + Gated Channel-Isolated Memory (Experiment D)", metrics_c_channel)

    channel_gate_stats = patchtst_channel_adapter.get_gate_stats()
    channel_memory_norms = patchtst_channel_adapter.get_memory_norms()

    # 4. Comparative Summary Table
    print("\n" + "=" * 80)
    print("        CONTINUAL LEARNING BENCHMARK COMPARISON TABLE (5m Horizon)         ")
    print("=" * 80)
    print(f"{'Protocol':<45} | {'CPU MAE':<10} | {'Mem MAE':<10} | {'Load MAE':<10} | {'Mean MAE':<10}")
    print("-" * 80)

    for label, res_dict in [
        ("Frozen PatchTST (No Memory)", metrics_a),
        ("PatchTST + Gated Shared Memory (C-Fix)", metrics_b_shared),
        ("PatchTST + Channel-Isolated Memory (Exp D)", metrics_c_channel),
    ]:
        c_mae = res_dict["cpu"]["5m"]["mae"]
        m_mae = res_dict["memory"]["5m"]["mae"]
        l_mae = res_dict["load_1m"]["5m"]["mae"]
        valid_maes = [v for v in [c_mae, m_mae, l_mae] if not np.isnan(v)]
        mean_mae = np.mean(valid_maes) if valid_maes else float("nan")

        print(f"{label:<45} | {c_mae:<10.4f} | {m_mae:<10.4f} | {l_mae:<10.4f} | {mean_mae:<10.4f}")

    print("=" * 80)

    print("\n" + "=" * 80)
    print("            ADAPTATION OVER TIME (First 20% vs Last 20% Test Stream)       ")
    print("=" * 80)
    print(f"{'Model Protocol':<40} | {'Early CPU':<10} | {'Late CPU':<10} | {'Early Mem':<10} | {'Late Mem':<10}")
    print("-" * 80)

    e_c_a = early_metrics_a["cpu"]["5m"]["mae"]
    l_c_a = late_metrics_a["cpu"]["5m"]["mae"]
    e_m_a = early_metrics_a["memory"]["5m"]["mae"]
    l_m_a = late_metrics_a["memory"]["5m"]["mae"]

    e_c_b = early_metrics_b["cpu"]["5m"]["mae"]
    l_c_b = late_metrics_b["cpu"]["5m"]["mae"]
    e_m_b = early_metrics_b["memory"]["5m"]["mae"]
    l_m_b = late_metrics_b["memory"]["5m"]["mae"]

    e_c_c = early_metrics_c["cpu"]["5m"]["mae"]
    l_c_c = late_metrics_c["cpu"]["5m"]["mae"]
    e_m_c = early_metrics_c["memory"]["5m"]["mae"]
    l_m_c = late_metrics_c["memory"]["5m"]["mae"]

    print(f"{'Frozen PatchTST':<40} | {e_c_a:<10.4f} | {l_c_a:<10.4f} | {e_m_a:<10.4f} | {l_m_a:<10.4f}")
    print(f"{'PatchTST + Shared Memory (C-Fix)':<40} | {e_c_b:<10.4f} | {l_c_b:<10.4f} | {e_m_b:<10.4f} | {l_m_b:<10.4f}")
    print(f"{'PatchTST + Channel-Isolated Memory (Exp D)':<40} | {e_c_c:<10.4f} | {l_c_c:<10.4f} | {e_m_c:<10.4f} | {l_m_c:<10.4f}")
    print("=" * 80)

    print("\n" + "=" * 80)
    print("           EXPERIMENT D: CHANNEL-ISOLATED MEMORY DIAGNOSTICS               ")
    print("=" * 80)
    print(f"{'Target Channel':<16} | {'||M_c||_F Norm':<16} | {'Mean Gate (g_c)':<16} | {'Max Gate (g_c)':<16}")
    print("-" * 80)

    for t_name in ["cpu", "memory", "load_1m"]:
        norm_val = channel_memory_norms.get(t_name, 0.0)
        c_stats = channel_gate_stats.get(t_name, {})
        mean_g = c_stats.get("mean_gate", 0.0)
        max_g = c_stats.get("max_gate", 0.0)
        print(f"{t_name:<16} | {norm_val:<16.4f} | {mean_g:<16.4f} | {max_g:<16.4f}")

    print("=" * 80)

    report = {
        "dataset": str(DATASET_PATH),
        "protocol": "Experiment D (Channel-Isolated Fast Memory: M_cpu, M_memory, M_load)",
        "test_windows": N_test,
        "batch_size": batch_size,
        "eval_batches": num_batches,
        "continual_eval_time_seconds": continual_eval_time,
        "results": {
            "FrozenPatchTST": metrics_a,
            "PatchTSTGatedMemory_CFix": metrics_b_shared,
            "PatchTSTChannelMemory_ExpD": metrics_c_channel,
        },
        "adaptation_analysis": {
            "early_test_stream_20pct": {
                "FrozenPatchTST": early_metrics_a,
                "SharedGatedMemoryCFix": early_metrics_b,
                "ChannelIsolatedMemoryExpD": early_metrics_c,
            },
            "late_test_stream_20pct": {
                "FrozenPatchTST": late_metrics_a,
                "SharedGatedMemoryCFix": late_metrics_b,
                "ChannelIsolatedMemoryExpD": late_metrics_c,
            },
        },
        "channel_memory_norms": channel_memory_norms,
        "channel_gate_statistics": channel_gate_stats,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w") as f:
        json.dump(report, f, indent=2, default=lambda x: float(x))

    print(f"\nSaved report: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
