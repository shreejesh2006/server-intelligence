"""
Production Training Script for Long-Range Pure iTransformer Forecasting Model
Supports 10 Horizons: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 48h, 72h
Evaluates chronological validation metrics and exports production weights with uncertainty bounds.
"""

import sys
import os
import json
import time
import logging
from pathlib import Path
import numpy as np
import pandas as pd
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS, HORIZONS_MAP
from ml.bdh.adapters import HORIZONS
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.dataset import create_sequence_windows
from ml.bdh.adapters_itransformer import iTransformerAdapter
from ml.bdh.metrics import evaluate_forecast_dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_itransformer_production")

CSV_PATH = REPO_ROOT / "ml" / "data" / "bdh" / "ubuntu_telemetry_history.csv"
NPZ_10H_PATH = REPO_ROOT / "ml" / "data" / "bdh_datasets" / "ubuntu_history_seq60_10h.npz"
UBUNTU_MODEL_DIR = REPO_ROOT / "ml" / "models" / "forecasting" / "ubuntu"
ROOT_MODEL_DIR = REPO_ROOT / "ml" / "models" / "forecasting"


def load_or_build_10h_dataset() -> dict:
    if NPZ_10H_PATH.exists():
        logger.info("Loading existing 10-horizon dataset from %s", NPZ_10H_PATH)
        data = np.load(NPZ_10H_PATH, allow_pickle=True)
        X_raw = data["X_raw"].astype(np.float32)
        targets = {}
        for target in TARGET_COLUMNS:
            targets[target] = {}
            for horizon in HORIZONS:
                key = f"target_{target}_{horizon}"
                if key in data:
                    targets[target][horizon] = data[key].astype(np.float32)
        return {"X_raw": X_raw, "targets": targets}

    logger.info("Building 10-horizon sequence dataset from telemetry CSV: %s", CSV_PATH)
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Telemetry history CSV not found at {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    logger.info("Loaded CSV with %d rows. Creating sliding windows...", len(df))
    window_data = create_sequence_windows(df, sequence_length=60, stride=1, horizons_map=HORIZONS_MAP)

    save_dict = {"X_raw": window_data["X"]}
    for target in TARGET_COLUMNS:
        for horizon in HORIZONS:
            save_dict[f"target_{target}_{horizon}"] = window_data["targets"][target][horizon]

    NPZ_10H_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(NPZ_10H_PATH, **save_dict)
    logger.info("Saved 10-horizon dataset archive to %s", NPZ_10H_PATH)

    return {"X_raw": window_data["X"], "targets": window_data["targets"]}


def main():
    logger.info("Starting Production 10-Horizon iTransformer Pipeline...")
    logger.info("Horizons: %s", HORIZONS)

    dataset = load_or_build_10h_dataset()
    X_raw = dataset["X_raw"]
    targets = dataset["targets"]
    N = len(X_raw)
    logger.info("Loaded %d sequence windows [T=%d, D=%d]", N, X_raw.shape[1], X_raw.shape[2])

    # Chronological Split: 80% train, 20% validation
    split_idx = int(N * 0.80)
    X_train_raw = X_raw[:split_idx]
    X_val_raw = X_raw[split_idx:]

    train_targets = {t: {h: targets[t][h][:split_idx] for h in HORIZONS} for t in TARGET_COLUMNS}
    val_targets = {t: {h: targets[t][h][split_idx:] for h in HORIZONS} for t in TARGET_COLUMNS}

    logger.info("Fitting BDHPreprocessor on %d training windows...", len(X_train_raw))
    preprocessor = BDHPreprocessor(feature_columns=FEATURE_COLUMNS)
    flat_train = X_train_raw.reshape(-1, X_train_raw.shape[-1])
    preprocessor.fit(flat_train)

    X_train = preprocessor.transform(X_train_raw)
    X_val = preprocessor.transform(X_val_raw)

    train_dataset = {"X": X_train, "targets": train_targets}
    val_dataset = {"X": X_val, "targets": val_targets}

    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Initializing iTransformerAdapter (output_horizons=%d) on %s...", len(HORIZONS), device)

    adapter = iTransformerAdapter(
        input_dim=14,
        sequence_length=60,
        hidden_dim=64,
        num_layers=2,
        nhead=4,
        device=device,
        random_state=42,
    )

    t0 = time.perf_counter()
    train_summary = adapter.fit(
        train_dataset=train_dataset,
        val_dataset=val_dataset,
        epochs=15,
        lr=1e-3,
        batch_size=128,
        patience=4,
    )
    fit_duration = time.perf_counter() - t0
    logger.info("Training completed in %.2f seconds: %s", fit_duration, train_summary)

    # Evaluate validation metrics across all 10 horizons
    logger.info("Evaluating validation split metrics across all 10 horizons...")
    val_preds = adapter.predict(X_val, is_raw=False)

    in_sample_targets = {
        "cpu": X_train_raw[:, -1, 0],
        "memory": X_train_raw[:, -1, 1],
        "load_1m": X_train_raw[:, -1, 4],
    }
    metrics = evaluate_forecast_dict(val_targets, val_preds, in_sample_targets)

    horizon_uncertainties = {}
    for target in TARGET_COLUMNS:
        horizon_uncertainties[target] = {}
        for horizon in HORIZONS:
            m = metrics[target][horizon]
            logger.info("[%s %4s] MAE: %7.4f | RMSE: %7.4f | MASE: %7.4f", target, horizon, m["mae"], m["rmse"], m["mase"])
            # Record residual RMSE as empirical 1-sigma uncertainty bound
            horizon_uncertainties[target][horizon] = round(float(m["rmse"]), 4)

    adapter.horizon_uncertainties_ = horizon_uncertainties
    adapter.preprocessor = preprocessor

    # Ensure model is serialized on CPU for universal compatibility
    adapter.model.to("cpu")
    adapter.device = torch.device("cpu")

    UBUNTU_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    ROOT_MODEL_DIR.mkdir(parents=True, exist_ok=True)

    dest_ubuntu = UBUNTU_MODEL_DIR / "itransformer.pt"
    dest_root = ROOT_MODEL_DIR / "itransformer.pt"

    logger.info("Saving production checkpoint to: %s", dest_ubuntu)
    adapter.save(dest_ubuntu)

    logger.info("Saving root fallback checkpoint to: %s", dest_root)
    adapter.save(dest_root)

    meta_info = {
        "model_name": "iTransformer",
        "architecture": "Inverted Transformer (iTransformer)",
        "input_dim": 14,
        "sequence_length": 60,
        "hidden_dim": 64,
        "num_layers": 2,
        "nhead": 4,
        "output_horizons": len(HORIZONS),
        "horizons": HORIZONS,
        "total_parameters": train_summary["total_parameters"],
        "trainable_parameters": train_summary["trainable_parameters"],
        "training_duration_seconds": round(fit_duration, 2),
        "validation_metrics": metrics,
        "uncertainties_rmse": horizon_uncertainties,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    meta_ubuntu = UBUNTU_MODEL_DIR / "itransformer_meta.json"
    with meta_ubuntu.open("w", encoding="utf-8") as f:
        json.dump(meta_info, f, indent=2)

    logger.info("10-Horizon Production iTransformer model export completed successfully!")


if __name__ == "__main__":
    main()
