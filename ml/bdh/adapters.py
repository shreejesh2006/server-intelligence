"""
BDH Model Adapters — Common Benchmark Adapter Foundation (Persistence & HGB)
"""

import json
import logging
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor

from ml.bdh.config import FEATURE_COLUMNS, SKEWED_FEATURES

logger = logging.getLogger(__name__)

# Common Benchmark Contract Constants
TARGET_COLUMNS = ["cpu", "memory", "load_1m"]
HORIZONS = ["5m", "15m", "30m", "1h", "3h", "6h", "12h", "24h", "48h", "72h"]
HORIZON_STEPS_MAP = {
    "5m": 10,
    "15m": 30,
    "30m": 60,
    "1h": 120,
    "3h": 360,
    "6h": 720,
    "12h": 1440,
    "24h": 2880,
    "48h": 5760,
    "72h": 8640,
}

# Index mapping for canonical features
FEATURE_INDEX_MAP = {feat: idx for idx, feat in enumerate(FEATURE_COLUMNS)}
TARGET_INDEX_MAP = {target: idx for idx, target in enumerate(TARGET_COLUMNS)}
HORIZON_INDEX_MAP = {horizon: idx for idx, horizon in enumerate(HORIZONS)}


class BaseModelAdapter:
    """
    Abstract Base Class for Common Model Benchmark Adapters.
    Hides internal model-specific implementations behind a standardized evaluation API.
    """

    def fit(self, train_dataset: dict, val_dataset: dict | None = None) -> dict:
        """
        Fits model adapter on benchmark sequence dataset.
        train_dataset: dict containing "X" (or "X_raw"/"X_normalized") [N, T, 14] and "targets" {target: {horizon: array[N]}}.
        """
        raise NotImplementedError

    def predict(self, context_window: np.ndarray) -> dict:
        """
        Predicts future targets for input context window.
        context_window: np.ndarray of shape [N, T, 14] or [T, 14].
        Returns structured dictionary: { "cpu": {"5m": array[N], ...}, "memory": ..., "load_1m": ... }
        """
        raise NotImplementedError

    def predict_tensor(self, context_window: np.ndarray) -> np.ndarray:
        """
        Predicts future targets returning 3D array of shape [N, M=3, H=5].
        Axis 1: Target (0=cpu, 1=memory, 2=load_1m)
        Axis 2: Horizon (0=5m, 1=15m, 2=30m, 3=1h, 4=3h)
        """
        pred_dict = self.predict(context_window)
        N = self._extract_batch_size(context_window)
        tensor = np.zeros((N, len(TARGET_COLUMNS), len(HORIZONS)), dtype=np.float32)

        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                tensor[:, m_idx, h_idx] = pred_dict[target][horizon]

        return tensor

    def save(self, model_path: str | Path) -> None:
        """Serializes adapter artifacts."""
        raise NotImplementedError

    def load(self, model_path: str | Path) -> None:
        """Deserializes adapter artifacts."""
        raise NotImplementedError

    def _extract_batch_size(self, context_window: np.ndarray) -> int:
        if context_window.ndim == 2:
            return 1
        elif context_window.ndim == 3:
            return context_window.shape[0]
        else:
            raise ValueError(f"Expected 2D or 3D context window array, got shape {context_window.shape}")

    def _format_context(self, context_window: np.ndarray) -> tuple[np.ndarray, bool]:
        if context_window.ndim == 2:
            return context_window[np.newaxis, :, :], True
        elif context_window.ndim == 3:
            return context_window, False
        else:
            raise ValueError(f"Expected 2D or 3D context window array, got shape {context_window.shape}")


class PersistenceAdapter(BaseModelAdapter):
    """
    Trivial Naive Persistence Baseline Adapter.
    Predicts forecast(target, horizon) = latest observed target value at step T-1.
    Requires no training.
    """

    def __init__(self):
        self.is_fitted_ = True

    def fit(self, train_dataset: dict, val_dataset: dict | None = None) -> dict:
        """Returns baseline metadata without training."""
        return {
            "model_name": "PersistenceAdapter",
            "trained": False,
            "targets": TARGET_COLUMNS,
            "horizons": HORIZONS,
            "samples_seen": len(train_dataset.get("X", train_dataset.get("X_raw", []))),
        }

    def predict(self, context_window: np.ndarray) -> dict:
        X, single_window = self._format_context(context_window)
        N, T, D = X.shape

        predictions = {t: {} for t in TARGET_COLUMNS}

        for target in TARGET_COLUMNS:
            feat_idx = FEATURE_INDEX_MAP[target]
            # Latest observed target value at step T-1
            latest_vals = X[:, T - 1, feat_idx]

            if single_window:
                latest_vals = latest_vals[0]

            for horizon in HORIZONS:
                predictions[target][horizon] = np.copy(latest_vals)

        return predictions

    def save(self, model_path: str | Path) -> None:
        path = Path(model_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        meta = {"model_name": "PersistenceAdapter", "is_fitted": True}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    def load(self, model_path: str | Path) -> None:
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"Adapter artifact missing: {path}")
        self.is_fitted_ = True


class HGBAdapter(BaseModelAdapter):
    """
    Benchmark-Only HistGradientBoostingRegressor Adapter.
    Wraps 15 independent HGB models (3 targets × 5 horizons) trained on benchmark sequence datasets.
    Does NOT modify production model artifacts or production services.
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.models = {}
        self.is_fitted_ = False

    def _extract_tabular_features(self, X: np.ndarray, target: str) -> np.ndarray:
        """
        Extracts 15 tabular features per window for a given target metric:
        - 6 target lags: t, t-1, t-2, t-4, t-8, t-12 (where step 1 = 30s)
        - 7 auxiliary features at step t: aux_cpu_t, aux_memory_t, aux_load_1m_t, aux_load_5m_t, aux_network_rx_t, aux_network_tx_t, aux_iowait_t
        - 2 rolling statistics: 5-step rolling mean and std of target metric.
        """
        N, T, D = X.shape
        target_idx = FEATURE_INDEX_MAP[target]

        # Target time series per window [N, T]
        t_series = X[:, :, target_idx]

        # 6 Lags relative to end of window T-1
        lags = [0, 1, 2, 4, 8, 12]
        lag_features = []
        for lag in lags:
            step_idx = max(0, T - 1 - lag)
            lag_features.append(t_series[:, step_idx])

        # 7 Auxiliary metrics at step T-1
        aux_metrics = ["cpu", "memory", "load_1m", "load_5m", "network_rx", "network_tx", "iowait"]
        aux_features = []
        for aux in aux_metrics:
            aux_idx = FEATURE_INDEX_MAP[aux]
            aux_features.append(X[:, T - 1, aux_idx])

        # 2 Rolling stats over last 5 steps of target metric
        last_5 = t_series[:, -5:]
        roll_mean = np.mean(last_5, axis=1)
        roll_std = np.std(last_5, axis=1)

        feature_matrix = np.column_stack(lag_features + aux_features + [roll_mean, roll_std])
        return feature_matrix.astype(np.float32)

    def fit(self, train_dataset: dict, val_dataset: dict | None = None) -> dict:
        X_train = train_dataset.get("X")
        if X_train is None:
            X_train = train_dataset.get("X_raw", train_dataset.get("X_normalized"))

        if X_train is None or len(X_train) == 0:
            raise ValueError("Training dataset X is empty or missing.")

        targets_dict = train_dataset.get("targets", {})

        summary = {"model_name": "HGBAdapter", "trained_models": 0, "model_details": {}}

        for target in TARGET_COLUMNS:
            X_tab = self._extract_tabular_features(X_train, target)

            for horizon in HORIZONS:
                model_key = (target, horizon)
                y_train = targets_dict.get(target, {}).get(horizon)

                if y_train is None or len(y_train) != len(X_train):
                    logger.warning("Target missing or length mismatch for %s %s", target, horizon)
                    continue

                # Filter out NaN targets
                valid_mask = ~np.isnan(y_train)
                if np.sum(valid_mask) < 10:
                    logger.warning("Insufficient valid samples (%d) for %s %s", np.sum(valid_mask), target, horizon)
                    continue

                X_valid = X_tab[valid_mask]
                y_valid = y_train[valid_mask]

                model = HistGradientBoostingRegressor(
                    max_iter=100,
                    learning_rate=0.05,
                    max_depth=6,
                    random_state=self.random_state,
                )
                model.fit(X_valid, y_valid)
                self.models[model_key] = model
                summary["trained_models"] += 1
                summary["model_details"][f"{target}_{horizon}"] = {
                    "training_samples": int(np.sum(valid_mask)),
                }

        self.is_fitted_ = len(self.models) > 0
        return summary

    def predict(self, context_window: np.ndarray) -> dict:
        if not self.is_fitted_:
            raise RuntimeError("HGBAdapter must be fitted or loaded before predict.")

        X, single_window = self._format_context(context_window)
        N, T, D = X.shape

        predictions = {t: {} for t in TARGET_COLUMNS}

        for target in TARGET_COLUMNS:
            X_tab = self._extract_tabular_features(X, target)
            target_idx = FEATURE_INDEX_MAP[target]
            current_vals = X[:, T - 1, target_idx]

            for horizon in HORIZONS:
                model_key = (target, horizon)
                model = self.models.get(model_key)

                if model is not None:
                    try:
                        preds = model.predict(X_tab)
                        preds = np.clip(preds, a_min=0.0, a_max=None)
                    except Exception:
                        preds = np.copy(current_vals)
                else:
                    preds = np.copy(current_vals)

                if single_window:
                    predictions[target][horizon] = float(preds[0])
                else:
                    predictions[target][horizon] = preds.astype(np.float32)

        return predictions

    def save(self, model_path: str | Path) -> None:
        path = Path(model_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "model_name": "HGBAdapter",
            "random_state": self.random_state,
            "models": self.models,
            "is_fitted": self.is_fitted_,
        }
        joblib.dump(payload, path)
        logger.info("Saved HGBAdapter to %s (%d models)", path, len(self.models))

    def load(self, model_path: str | Path) -> None:
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"HGBAdapter artifact missing: {path}")

        payload = joblib.load(path)
        self.random_state = payload.get("random_state", 42)
        self.models = payload.get("models", {})
        self.is_fitted_ = payload.get("is_fitted", True)
        logger.info("Loaded HGBAdapter from %s (%d models)", path, len(self.models))


class XGBoostAdapter(BaseModelAdapter):
    """
    Benchmark-Only XGBoostRegressor Adapter.
    Wraps 15 independent XGBoost models (3 targets × 5 horizons) trained on benchmark sequence datasets.
    Uses identical 15 tabular features per window as HGBAdapter for fair baseline comparison.
    Does NOT modify production model artifacts or production services.
    """

    def __init__(
        self,
        random_state: int = 42,
        n_estimators: int = 50,
        max_depth: int = 5,
        learning_rate: float = 0.05,
    ):
        self.random_state = random_state
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.models = {}
        self.is_fitted_ = False

    def _extract_tabular_features(self, X: np.ndarray, target: str) -> np.ndarray:
        """
        Extracts 15 tabular features per window for a given target metric:
        - 6 target lags: t, t-1, t-2, t-4, t-8, t-12 (where step 1 = 30s)
        - 7 auxiliary features at step t: aux_cpu_t, aux_memory_t, aux_load_1m_t, aux_load_5m_t, aux_network_rx_t, aux_network_tx_t, aux_iowait_t
        - 2 rolling statistics: 5-step rolling mean and std of target metric.
        """
        N, T, D = X.shape
        target_idx = FEATURE_INDEX_MAP[target]

        t_series = X[:, :, target_idx]

        lags = [0, 1, 2, 4, 8, 12]
        lag_features = []
        for lag in lags:
            step_idx = max(0, T - 1 - lag)
            lag_features.append(t_series[:, step_idx])

        aux_metrics = ["cpu", "memory", "load_1m", "load_5m", "network_rx", "network_tx", "iowait"]
        aux_features = []
        for aux in aux_metrics:
            aux_idx = FEATURE_INDEX_MAP[aux]
            aux_features.append(X[:, T - 1, aux_idx])

        last_5 = t_series[:, -5:]
        roll_mean = np.mean(last_5, axis=1)
        roll_std = np.std(last_5, axis=1)

        feature_matrix = np.column_stack(lag_features + aux_features + [roll_mean, roll_std])
        return feature_matrix.astype(np.float32)

    def fit(self, train_dataset: dict, val_dataset: dict | None = None) -> dict:
        import xgboost as xgb

        X_train = train_dataset.get("X")
        if X_train is None:
            X_train = train_dataset.get("X_raw", train_dataset.get("X_normalized"))

        if X_train is None or len(X_train) == 0:
            raise ValueError("Training dataset X is empty or missing.")

        targets_dict = train_dataset.get("targets", {})

        summary = {"model_name": "XGBoostAdapter", "trained_models": 0, "model_details": {}}

        for target in TARGET_COLUMNS:
            X_tab = self._extract_tabular_features(X_train, target)

            for horizon in HORIZONS:
                model_key = (target, horizon)
                y_train = targets_dict.get(target, {}).get(horizon)

                if y_train is None or len(y_train) != len(X_train):
                    logger.warning("Target missing or length mismatch for %s %s", target, horizon)
                    continue

                valid_mask = ~np.isnan(y_train)
                if np.sum(valid_mask) < 10:
                    logger.warning("Insufficient valid samples (%d) for %s %s", np.sum(valid_mask), target, horizon)
                    continue

                X_valid = X_tab[valid_mask]
                y_valid = y_train[valid_mask]

                model = xgb.XGBRegressor(
                    n_estimators=self.n_estimators,
                    learning_rate=self.learning_rate,
                    max_depth=self.max_depth,
                    random_state=self.random_state,
                    n_jobs=1,
                    tree_method="hist",
                )
                model.fit(X_valid, y_valid)
                self.models[model_key] = model
                summary["trained_models"] += 1
                summary["model_details"][f"{target}_{horizon}"] = {
                    "training_samples": int(np.sum(valid_mask)),
                }

        self.is_fitted_ = len(self.models) > 0
        return summary

    def predict(self, context_window: np.ndarray) -> dict:
        if not self.is_fitted_:
            raise RuntimeError("XGBoostAdapter must be fitted or loaded before predict.")

        X, single_window = self._format_context(context_window)
        N, T, D = X.shape

        predictions = {t: {} for t in TARGET_COLUMNS}

        for target in TARGET_COLUMNS:
            X_tab = self._extract_tabular_features(X, target)
            target_idx = FEATURE_INDEX_MAP[target]
            current_vals = X[:, T - 1, target_idx]

            for horizon in HORIZONS:
                model_key = (target, horizon)
                model = self.models.get(model_key)

                if model is not None:
                    try:
                        preds = model.predict(X_tab)
                        preds = np.clip(preds, a_min=0.0, a_max=None)
                    except Exception:
                        preds = np.copy(current_vals)
                else:
                    preds = np.copy(current_vals)

                if single_window:
                    predictions[target][horizon] = float(preds[0])
                else:
                    predictions[target][horizon] = preds.astype(np.float32)

        return predictions

    def save(self, model_path: str | Path) -> None:
        path = Path(model_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "model_name": "XGBoostAdapter",
            "random_state": self.random_state,
            "models": self.models,
            "is_fitted": self.is_fitted_,
        }
        joblib.dump(payload, path)
        logger.info("Saved XGBoostAdapter to %s (%d models)", path, len(self.models))

    def load(self, model_path: str | Path) -> None:
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"XGBoostAdapter artifact missing: {path}")

        payload = joblib.load(path)
        self.random_state = payload.get("random_state", 42)
        self.models = payload.get("models", {})
        self.is_fitted_ = payload.get("is_fitted", True)
        logger.info("Loaded XGBoostAdapter from %s (%d models)", path, len(self.models))

