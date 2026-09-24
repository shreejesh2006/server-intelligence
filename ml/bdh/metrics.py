"""
BDH Benchmark Metrics — Comprehensive Forecasting Evaluation (MAE, RMSE, MASE)
"""

import numpy as np

from ml.bdh.config import TARGET_COLUMNS, HORIZONS_MAP


def compute_mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Computes Mean Absolute Error ignoring NaNs."""
    valid_mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not np.any(valid_mask):
        return float("nan")
    return float(np.mean(np.abs(y_true[valid_mask] - y_pred[valid_mask])))


def compute_rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Computes Root Mean Squared Error ignoring NaNs."""
    valid_mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not np.any(valid_mask):
        return float("nan")
    return float(np.sqrt(np.mean((y_true[valid_mask] - y_pred[valid_mask]) ** 2)))


def compute_mase(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    in_sample_series: np.ndarray | float | None = None,
) -> float:
    """
    Computes Mean Absolute Scaled Error (MASE).
    Scales MAE by the mean absolute 1-step naive difference of the in-sample target series.
    MASE < 1.0 indicates model outperforms 1-step naive persistence.
    """
    valid_mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not np.any(valid_mask):
        return float("nan")

    mae = float(np.mean(np.abs(y_true[valid_mask] - y_pred[valid_mask])))

    if isinstance(in_sample_series, (int, float)) and in_sample_series > 0:
        scale = float(in_sample_series)
    elif isinstance(in_sample_series, np.ndarray) and len(in_sample_series) > 1:
        diffs = np.abs(np.diff(in_sample_series))
        valid_diffs = diffs[~np.isnan(diffs)]
        scale = float(np.mean(valid_diffs)) if len(valid_diffs) > 0 and np.mean(valid_diffs) > 0 else 1.0
    else:
        scale = 1.0

    return mae / scale


def evaluate_forecast_dict(
    y_true_dict: dict,
    y_pred_dict: dict,
    in_sample_series_dict: dict | None = None,
) -> dict:
    """
    Evaluates predictions against true targets per-target and per-horizon.

    y_true_dict & y_pred_dict structure:
        { "cpu": {"5m": array[N], ...}, "memory": ..., "load_1m": ... }

    Returns structured metrics dict:
        {
          "cpu": {
            "5m": {"mae": ..., "rmse": ..., "mase": ..., "evaluated_samples": ...},
            ...
          },
          ...
        }
    """
    results = {}
    for target in TARGET_COLUMNS:
        results[target] = {}
        target_in_sample = in_sample_series_dict.get(target) if in_sample_series_dict else None

        for horizon in HORIZONS_MAP.keys():
            y_t = y_true_dict.get(target, {}).get(horizon)
            y_p = y_pred_dict.get(target, {}).get(horizon)

            if y_t is None or y_p is None:
                results[target][horizon] = {"mae": float("nan"), "rmse": float("nan"), "mase": float("nan"), "evaluated_samples": 0}
                continue

            mae = compute_mae(y_t, y_p)
            rmse = compute_rmse(y_t, y_p)
            mase = compute_mase(y_t, y_p, in_sample_series=target_in_sample)

            results[target][horizon] = {
                "mae": round(mae, 4),
                "rmse": round(rmse, 4),
                "mase": round(mase, 4),
                "evaluated_samples": int(np.sum(~np.isnan(y_t) & ~np.isnan(y_p))),
            }

    return results
