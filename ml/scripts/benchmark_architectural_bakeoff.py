"""
NOKIA Forecasting Research — Experiment 1: Architectural Bake-off Benchmark Runner

Evaluates 6 distinct forecasting architectures:
  1. Persistence Baseline
  2. HistGradientBoosting (HGB)
  3. XGBoost
  4. PatchTST (Patch Time Series Transformer)
  5. TimeMixer (Decomposable Multiscale Mixing)
  6. iTransformer (Inverted Cross-Variable Attention Transformer)

Note: ms-Mamba was excluded due to computational/implementation feasibility constraints.

Protocol:
  - Dataset: Historical Ubuntu Telemetry (44,614 rows / 43,957 sequence windows [60, 14])
  - Chronological 70% Train, 15% Validation, 15% Test split with boundary purging
  - Preprocessing: RobustScaler + log1p fitted ONLY on training sequence data
  - 3 Random Seeds for Neural Models (42, 43, 44)
  - Outputs machine-readable JSON: ml/data/bdh_datasets/architectural_bakeoff_results.json
"""

import json
import logging
import time
from pathlib import Path
import numpy as np
import pandas as pd

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS, HORIZONS_MAP
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.dataset import BDHSequenceDataset
from ml.bdh.adapters import PersistenceAdapter, HGBAdapter, XGBoostAdapter, HORIZONS
from ml.bdh.adapters_patchtst import PatchTSTAdapter
from ml.bdh.adapters_timemixer import TimeMixerAdapter
from ml.bdh.adapters_itransformer import iTransformerAdapter
from ml.bdh.metrics import evaluate_forecast_dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("architectural_bakeoff")

CSV_PATH = Path("ml/data/bdh/ubuntu_telemetry_history.csv")
NPZ_PATH = Path("ml/data/bdh_datasets/ubuntu_history_seq60.npz")
OUTPUT_PATH = Path("ml/data/bdh_datasets/architectural_bakeoff_results.json")

SEEDS = [42, 43, 44]


def load_dataset() -> dict:
    """Loads historical dataset from .npz or CSV if .npz is not present."""
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
    """
    Splits dataset chronologically into 70% Train, 15% Validation, 15% Test.
    Applies per-horizon boundary purging.
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


def measure_inference_latency(adapter, X_sample: np.ndarray, num_runs: int = 50) -> dict:
    """Measures P50 and P95 inference latency in milliseconds."""
    latencies_ms = []
    for _ in range(5):  # Warmup
        _ = adapter.predict(X_sample)

    for _ in range(num_runs):
        t0 = time.perf_counter()
        _ = adapter.predict(X_sample)
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    latencies_ms = np.array(latencies_ms)
    return {
        "p50_ms": round(float(np.percentile(latencies_ms, 50)), 3),
        "p95_ms": round(float(np.percentile(latencies_ms, 95)), 3),
    }


def aggregate_seed_results(seed_runs: list[dict]) -> dict:
    """Computes mean ± std across random seeds for all metrics."""
    aggregated_metrics = {target: {h: {} for h in HORIZONS} for target in TARGET_COLUMNS}

    for target in TARGET_COLUMNS:
        for horizon in HORIZONS:
            maes = [run["metrics"][target][horizon]["mae"] for run in seed_runs if not np.isnan(run["metrics"][target][horizon]["mae"])]
            rmses = [run["metrics"][target][horizon]["rmse"] for run in seed_runs if not np.isnan(run["metrics"][target][horizon]["rmse"])]
            mases = [run["metrics"][target][horizon]["mase"] for run in seed_runs if not np.isnan(run["metrics"][target][horizon]["mase"])]

            aggregated_metrics[target][horizon] = {
                "mae_mean": round(float(np.mean(maes)), 4) if maes else float("nan"),
                "mae_std": round(float(np.std(maes)), 4) if maes else float("nan"),
                "rmse_mean": round(float(np.mean(rmses)), 4) if rmses else float("nan"),
                "rmse_std": round(float(np.std(rmses)), 4) if rmses else float("nan"),
                "mase_mean": round(float(np.mean(mases)), 4) if mases else float("nan"),
                "mase_std": round(float(np.std(mases)), 4) if mases else float("nan"),
            }

    mean_fit_time = float(np.mean([r["fit_time_seconds"] for r in seed_runs]))
    mean_p50_lat = float(np.mean([r["latency"]["p50_ms"] for r in seed_runs]))
    mean_p95_lat = float(np.mean([r["latency"]["p95_ms"] for r in seed_runs]))
    param_count = seed_runs[0]["parameters"]

    return {
        "parameters": param_count,
        "fit_time_seconds": round(mean_fit_time, 2),
        "latency_p50_ms": round(mean_p50_lat, 3),
        "latency_p95_ms": round(mean_p95_lat, 3),
        "aggregated_metrics": aggregated_metrics,
        "seed_runs": seed_runs,
    }


def main():
    print("==========================================================================================")
    print("      NOKIA FORECASTING RESEARCH — EXPERIMENT 1: ARCHITECTURAL BAKE-OFF BENCHMARK         ")
    print("==========================================================================================")

    dataset = load_dataset()
    print(f"Dataset Windows: {dataset['N']:,} [T={dataset['T']}, D={dataset['D']}]")

    splits = chronological_split(dataset)
    print(f"Train Windows:  {len(splits['train']['X_raw']):,} (70%)")
    print(f"Val Windows:    {len(splits['val']['X_raw']):,} (15%)")
    print(f"Test Windows:   {len(splits['test']['X_raw']):,} (15%)")

    splits, _ = preprocess_splits(splits)
    train, val, test = splits["train"], splits["val"], splits["test"]
    in_sample = extract_in_sample_targets(train)

    bakeoff_results = {}

    # -------------------------------------------------------------------------
    # 1. Persistence Baseline
    # -------------------------------------------------------------------------
    print("\n[1/6] Evaluating Persistence Baseline...")
    pers_adapter = PersistenceAdapter()
    pers_preds = pers_adapter.predict(test["X_raw"])
    pers_metrics = evaluate_forecast_dict(test["targets"], pers_preds, in_sample)
    pers_lat = measure_inference_latency(pers_adapter, test["X_raw"][:32])

    bakeoff_results["Persistence"] = {
        "model_name": "Persistence Baseline",
        "parameters": 0,
        "fit_time_seconds": 0.0,
        "latency_p50_ms": pers_lat["p50_ms"],
        "latency_p95_ms": pers_lat["p95_ms"],
        "aggregated_metrics": {
            target: {
                h: {
                    "mae_mean": pers_metrics[target][h]["mae"],
                    "mae_std": 0.0,
                    "rmse_mean": pers_metrics[target][h]["rmse"],
                    "rmse_std": 0.0,
                    "mase_mean": pers_metrics[target][h]["mase"],
                    "mase_std": 0.0,
                }
                for h in HORIZONS
            }
            for target in TARGET_COLUMNS
        },
        "seed_runs": [{"seed": 42, "metrics": pers_metrics, "fit_time_seconds": 0.0, "latency": pers_lat}],
    }

    # -------------------------------------------------------------------------
    # 2. HistGradientBoosting Baseline
    # -------------------------------------------------------------------------
    print("\n[2/6] Evaluating HistGradientBoosting (HGB)...")
    hgb_adapter = HGBAdapter(random_state=42)
    t0 = time.perf_counter()
    hgb_summary = hgb_adapter.fit(train)
    fit_time_hgb = time.perf_counter() - t0
    hgb_preds = hgb_adapter.predict(test["X"])
    hgb_metrics = evaluate_forecast_dict(test["targets"], hgb_preds, in_sample)
    hgb_lat = measure_inference_latency(hgb_adapter, test["X"][:32])

    bakeoff_results["HGB"] = {
        "model_name": "HistGradientBoosting",
        "parameters": hgb_summary["trained_models"] * 100,
        "fit_time_seconds": round(fit_time_hgb, 2),
        "latency_p50_ms": hgb_lat["p50_ms"],
        "latency_p95_ms": hgb_lat["p95_ms"],
        "aggregated_metrics": {
            target: {
                h: {
                    "mae_mean": hgb_metrics[target][h]["mae"],
                    "mae_std": 0.0,
                    "rmse_mean": hgb_metrics[target][h]["rmse"],
                    "rmse_std": 0.0,
                    "mase_mean": hgb_metrics[target][h]["mase"],
                    "mase_std": 0.0,
                }
                for h in HORIZONS
            }
            for target in TARGET_COLUMNS
        },
        "seed_runs": [{"seed": 42, "metrics": hgb_metrics, "fit_time_seconds": fit_time_hgb, "latency": hgb_lat}],
    }

    # -------------------------------------------------------------------------
    # 3. XGBoost Baseline
    # -------------------------------------------------------------------------
    print("\n[3/6] Evaluating XGBoost...")
    xgb_adapter = XGBoostAdapter(random_state=42, n_estimators=50, max_depth=5)
    t0 = time.perf_counter()
    xgb_summary = xgb_adapter.fit(train)
    fit_time_xgb = time.perf_counter() - t0
    xgb_preds = xgb_adapter.predict(test["X"])
    xgb_metrics = evaluate_forecast_dict(test["targets"], xgb_preds, in_sample)
    xgb_lat = measure_inference_latency(xgb_adapter, test["X"][:32])

    bakeoff_results["XGBoost"] = {
        "model_name": "XGBoost",
        "parameters": xgb_summary["trained_models"] * 50 * 31,
        "fit_time_seconds": round(fit_time_xgb, 2),
        "latency_p50_ms": xgb_lat["p50_ms"],
        "latency_p95_ms": xgb_lat["p95_ms"],
        "aggregated_metrics": {
            target: {
                h: {
                    "mae_mean": xgb_metrics[target][h]["mae"],
                    "mae_std": 0.0,
                    "rmse_mean": xgb_metrics[target][h]["rmse"],
                    "rmse_std": 0.0,
                    "mase_mean": xgb_metrics[target][h]["mase"],
                    "mase_std": 0.0,
                }
                for h in HORIZONS
            }
            for target in TARGET_COLUMNS
        },
        "seed_runs": [{"seed": 42, "metrics": xgb_metrics, "fit_time_seconds": fit_time_xgb, "latency": xgb_lat}],
    }

    # Helper for training neural models across 3 seeds
    def run_neural_bakeoff(model_name: str, adapter_cls, adapter_kwargs: dict, batch_size: int = 128, epochs: int = 15):
        print(f"\nEvaluating {model_name} across {len(SEEDS)} random seeds...")
        seed_runs = []

        for seed in SEEDS:
            logger.info("Running %s (seed=%d)...", model_name, seed)
            kw = dict(adapter_kwargs)
            kw["random_state"] = seed
            adapter = adapter_cls(**kw)

            t0 = time.perf_counter()
            _ = adapter.fit(train, val_dataset=val, epochs=epochs, lr=1e-3, batch_size=batch_size, patience=4)
            fit_time = time.perf_counter() - t0

            preds = adapter.predict(test["X"])
            metrics = evaluate_forecast_dict(test["targets"], preds, in_sample)
            lat = measure_inference_latency(adapter, test["X"][:32])
            tot_p, _ = adapter.model.get_parameter_counts()

            seed_runs.append({
                "seed": seed,
                "parameters": tot_p,
                "fit_time_seconds": round(fit_time, 2),
                "metrics": metrics,
                "latency": lat,
            })

        return aggregate_seed_results(seed_runs)

    # -------------------------------------------------------------------------
    # 4. PatchTST
    # -------------------------------------------------------------------------
    bakeoff_results["PatchTST"] = run_neural_bakeoff(
        "PatchTST",
        PatchTSTAdapter,
        {"input_dim": dataset["D"], "sequence_length": dataset["T"], "patch_len": 10, "stride": 5, "hidden_dim": 64, "num_layers": 2, "nhead": 4},
        batch_size=128,
        epochs=15,
    )

    # -------------------------------------------------------------------------
    # 5. TimeMixer
    # -------------------------------------------------------------------------
    bakeoff_results["TimeMixer"] = run_neural_bakeoff(
        "TimeMixer",
        TimeMixerAdapter,
        {"input_dim": dataset["D"], "sequence_length": dataset["T"], "hidden_dim": 64, "num_layers": 2, "down_sampling_layers": 2, "down_sampling_window": 2},
        batch_size=128,
        epochs=15,
    )

    # -------------------------------------------------------------------------
    # 6. iTransformer
    # -------------------------------------------------------------------------
    bakeoff_results["iTransformer"] = run_neural_bakeoff(
        "iTransformer",
        iTransformerAdapter,
        {"input_dim": dataset["D"], "sequence_length": dataset["T"], "hidden_dim": 64, "num_layers": 2, "nhead": 4},
        batch_size=128,
        epochs=15,
    )

    # Print Summary Tables
    print("\n==========================================================================================")
    print("                      EXPERIMENT 1 BENCHMARK SUMMARY (5m Horizon)                         ")
    print("==========================================================================================")
    print(f"{'Model':<18} | {'CPU MAE (5m)':<16} | {'Mem MAE (5m)':<16} | {'Load MAE (5m)':<16} | {'P50 Latency':<12}")
    print("-" * 88)

    for m_name in ["Persistence", "HGB", "XGBoost", "PatchTST", "TimeMixer", "iTransformer"]:
        res = bakeoff_results[m_name]
        c_m = res["aggregated_metrics"]["cpu"]["5m"]
        m_m = res["aggregated_metrics"]["memory"]["5m"]
        l_m = res["aggregated_metrics"]["load_1m"]["5m"]

        c_str = f"{c_m['mae_mean']:.4f} ± {c_m['mae_std']:.4f}"
        m_str = f"{m_m['mae_mean']:.4f} ± {m_m['mae_std']:.4f}"
        l_str = f"{l_m['mae_mean']:.4f} ± {l_m['mae_std']:.4f}"
        lat_str = f"{res['latency_p50_ms']:.2f} ms"

        print(f"{m_name:<18} | {c_str:<16} | {m_str:<16} | {l_str:<16} | {lat_str:<12}")

    print("==========================================================================================")

    # Save Machine-Readable JSON Output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    report_json = {
        "experiment": "Experiment 1: Architectural Bake-off",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset": {
            "path": str(NPZ_PATH),
            "csv_path": str(CSV_PATH),
            "num_windows": dataset["N"],
            "sequence_length": dataset["T"],
            "num_features": dataset["D"],
            "train_windows": len(train["X_raw"]),
            "val_windows": len(val["X_raw"]),
            "test_windows": len(test["X_raw"]),
        },
        "seeds_evaluated": SEEDS,
        "excluded_models": ["ms-Mamba"],
        "exclusion_reason": "ms-Mamba excluded due to computational/implementation feasibility constraints.",
        "results": bakeoff_results,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(report_json, f, indent=2, default=lambda x: float(x))

    print(f"\nSaved machine-readable JSON results to {OUTPUT_PATH}")
    print("==========================================================================================")


if __name__ == "__main__":
    main()
