"""
BDH Hybrid Model Adapters — PatchTST + HGB Residual Correction (Experiment A)
"""

import copy
import logging
from pathlib import Path
import numpy as np
import joblib
import torch
from sklearn.ensemble import HistGradientBoostingRegressor

from ml.bdh.adapters import (
    BaseModelAdapter,
    HGBAdapter,
    TARGET_COLUMNS,
    HORIZONS,
    FEATURE_INDEX_MAP,
)
from ml.bdh.config import HORIZONS_MAP
from ml.bdh.adapters_patchtst import PatchTSTAdapter
from ml.bdh.adapters_itransformer import iTransformerAdapter

logger = logging.getLogger(__name__)


class PatchTSTHGBResidualAdapter(BaseModelAdapter):
    """
    Experiment A — PatchTST + HGB Residual Correction Adapter.

    Pipeline:
    1. PatchTST generates base multi-horizon forecasts: Ŷ_PatchTST
    2. Training residuals are calculated on RAW telemetry scale:
       R_train = Y_train - Ŷ_PatchTST_train
    3. 15 independent HistGradientBoosting regressors learn residual error patterns:
       R̂_HGB = HGB_residual_model(X_tabular)
    4. Final Forecast:
       Ŷ_final = Ŷ_PatchTST + R̂_HGB
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        patch_len: int = 10,
        stride: int = 5,
        hidden_dim: int = 64,
        num_layers: int = 2,
        nhead: int = 4,
        device: str = "cpu",
        random_state: int = 42,
    ):
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.patch_len = patch_len
        self.stride = stride
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.nhead = nhead
        self.device = device
        self.random_state = random_state

        self.patchtst_adapter = PatchTSTAdapter(
            input_dim=input_dim,
            sequence_length=sequence_length,
            patch_len=patch_len,
            stride=stride,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            nhead=nhead,
            device=device,
            random_state=random_state,
        )

        self.hgb_helper = HGBAdapter(random_state=random_state)
        self.residual_models = {}
        self.is_fitted_ = False

    def fit(
        self,
        train_dataset: dict,
        val_dataset: dict | None = None,
        epochs: int = 25,
        lr: float = 1e-3,
        batch_size: int = 64,
        patience: int = 5,
    ) -> dict:
        """
        Fits PatchTST sequence model first, then fits 15 HGB residual regressors on training error residuals.
        Strictly leak-free: validation/test targets are never seen during residual model fitting.
        """
        X_train = train_dataset.get("X")
        if X_train is None:
            X_train = train_dataset.get("X_raw", train_dataset.get("X_normalized"))

        if X_train is None or len(X_train) == 0:
            raise ValueError("Training dataset X is empty or missing.")

        # Stage 1: Fit PatchTST model on training dataset
        logger.info("Fitting base PatchTST adapter for residual hybrid model...")
        patchtst_summary = self.patchtst_adapter.fit(
            train_dataset,
            val_dataset=val_dataset,
            epochs=epochs,
            lr=lr,
            batch_size=batch_size,
            patience=patience,
        )

        # Stage 2: Generate training predictions on RAW telemetry scale
        pred_patchtst_train = self.patchtst_adapter.predict(X_train)

        # Stage 3: Calculate raw training residuals R_train = Y_train - Ŷ_PatchTST_train
        targets_dict = train_dataset.get("targets", {})
        trained_residual_models = 0

        for target in TARGET_COLUMNS:
            X_tab = self.hgb_helper._extract_tabular_features(X_train, target)

            for horizon in HORIZONS:
                y_raw_train = targets_dict.get(target, {}).get(horizon)
                if y_raw_train is None or len(y_raw_train) != len(X_train):
                    logger.warning("Target missing or length mismatch for %s %s", target, horizon)
                    continue

                y_pred_patchtst = pred_patchtst_train[target][horizon]

                # Filter valid non-NaN target samples
                valid_mask = ~np.isnan(y_raw_train)
                if np.sum(valid_mask) < 10:
                    logger.warning("Insufficient valid samples (%d) for residual %s %s", np.sum(valid_mask), target, horizon)
                    continue

                # Calculate residual on RAW target scale
                r_valid = y_raw_train[valid_mask] - y_pred_patchtst[valid_mask]
                X_tab_valid = X_tab[valid_mask]

                model = HistGradientBoostingRegressor(
                    max_iter=100,
                    learning_rate=0.05,
                    max_depth=6,
                    random_state=self.random_state,
                )
                model.fit(X_tab_valid, r_valid)
                self.residual_models[(target, horizon)] = model
                trained_residual_models += 1

        self.is_fitted_ = self.patchtst_adapter.is_fitted_ and (trained_residual_models > 0)
        tot_p, train_p = self.patchtst_adapter.model.get_parameter_counts()

        return {
            "model_name": "PatchTSTHGBResidualAdapter",
            "total_parameters": tot_p + (trained_residual_models * 100),
            "trainable_parameters": train_p,
            "patchtst_summary": patchtst_summary,
            "trained_residual_models": trained_residual_models,
        }

    def predict(self, context_window: np.ndarray) -> dict:
        """
        Calculates Ŷ_final = Ŷ_PatchTST + R̂_HGB on RAW target scale.
        """
        if not self.is_fitted_:
            raise RuntimeError("PatchTSTHGBResidualAdapter must be fitted before predict.")

        # Stage 1: Get PatchTST prediction dictionary (RAW target scale)
        pred_patchtst = self.patchtst_adapter.predict(context_window)

        X, _ = self._format_context(context_window)
        N = X.shape[0]

        predictions = {t: {} for t in TARGET_COLUMNS}

        for target in TARGET_COLUMNS:
            X_tab = self.hgb_helper._extract_tabular_features(X, target)

            for horizon in HORIZONS:
                p_base = pred_patchtst[target][horizon]
                model_key = (target, horizon)
                residual_model = self.residual_models.get(model_key)

                if residual_model is not None:
                    r_pred = residual_model.predict(X_tab)
                else:
                    r_pred = np.zeros(N, dtype=np.float32)

                predictions[target][horizon] = p_base + r_pred

        return predictions

    def predict_tensor(self, context_window: np.ndarray) -> np.ndarray:
        """Predicts future targets returning 3D numpy array [N, M=3, H=5] on RAW target scale."""
        pred_dict = self.predict(context_window)
        N = self._extract_batch_size(context_window)
        tensor = np.zeros((N, len(TARGET_COLUMNS), len(HORIZONS)), dtype=np.float32)

        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                tensor[:, m_idx, h_idx] = pred_dict[target][horizon]

        return tensor

    def save(self, filepath: str | Path) -> None:
        """Serializes PatchTSTHGBResidualAdapter checkpoint and residual models."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save PatchTST internal adapter
        patchtst_path = filepath.with_suffix(".patchtst.pt")
        self.patchtst_adapter.save(patchtst_path)

        checkpoint = {
            "model_name": "PatchTSTHGBResidualAdapter",
            "input_dim": self.input_dim,
            "sequence_length": self.sequence_length,
            "patch_len": self.patch_len,
            "stride": self.stride,
            "hidden_dim": self.hidden_dim,
            "num_layers": self.num_layers,
            "nhead": self.nhead,
            "device": self.device,
            "random_state": self.random_state,
            "residual_models": self.residual_models,
            "is_fitted_": self.is_fitted_,
            "patchtst_checkpoint": str(patchtst_path),
        }
        joblib.dump(checkpoint, filepath)

    def load(self, filepath: str | Path) -> None:
        """Deserializes PatchTSTHGBResidualAdapter checkpoint."""
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Checkpoint file not found: {filepath}")

        checkpoint = joblib.load(filepath)
        self.input_dim = checkpoint["input_dim"]
        self.sequence_length = checkpoint["sequence_length"]
        self.patch_len = checkpoint["patch_len"]
        self.stride = checkpoint["stride"]
        self.hidden_dim = checkpoint["hidden_dim"]
        self.num_layers = checkpoint["num_layers"]
        self.nhead = checkpoint["nhead"]
        self.device = checkpoint.get("device", "cpu")
        self.random_state = checkpoint.get("random_state", 42)

        self.patchtst_adapter = PatchTSTAdapter(
            input_dim=self.input_dim,
            sequence_length=self.sequence_length,
            patch_len=self.patch_len,
            stride=self.stride,
            hidden_dim=self.hidden_dim,
            num_layers=self.num_layers,
            nhead=self.nhead,
            device=self.device,
            random_state=self.random_state,
        )

        patchtst_path = Path(checkpoint["patchtst_checkpoint"])
        if patchtst_path.exists():
            self.patchtst_adapter.load(patchtst_path)

        self.residual_models = checkpoint["residual_models"]
        self.is_fitted_ = checkpoint.get("is_fitted_", True)


class iTransformerHGBResidualAdapter(BaseModelAdapter):
    """
    iTransformer + HistGradientBoosting Residual Correction Hybrid Adapter.

    Architecture & Pipeline:
    1. Base Model: iTransformer
       Embeds lookback sequence across channels and applies inverted cross-variable
       attention to capture multivariate dependencies. Produces base forecast Ŷ_base.
    2. Residual Correction: HistGradientBoosting
       15 independent gradient-boosted decision trees learn residual error patterns
       R = Y - Ŷ_base on the raw telemetry scale.
    3. Leakage Prevention:
       In 'out_of_sample' mode, the training partition is split into a base training fold
       (e.g. 70%) and an out-of-sample calibration fold (e.g. 30%), with per-horizon
       boundary purging. iTransformer is trained strictly on the base fold, produces
       out-of-sample predictions on the calibration fold, and HGB models are trained on
       these true out-of-sample residuals. Test and validation data are never accessed.
    4. Features Available at Forecast Time:
       15 domain tabular features (6 lags, 7 aux metrics, 2 rolling stats) + base Ŷ_base.
    5. Final Output:
       Ŷ_final = np.clip(Ŷ_base + R̂_HGB, 0.0, None)
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        hidden_dim: int = 64,
        num_layers: int = 2,
        nhead: int = 4,
        device: str = "cpu",
        random_state: int = 42,
        residual_mode: str = "out_of_sample",
        sub_train_ratio: float = 0.70,
        include_base_forecast: bool = True,
    ):
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.nhead = nhead
        self.device = device
        self.random_state = random_state
        self.residual_mode = residual_mode
        self.sub_train_ratio = sub_train_ratio
        self.include_base_forecast = include_base_forecast

        self.itransformer_adapter = iTransformerAdapter(
            input_dim=input_dim,
            sequence_length=sequence_length,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            nhead=nhead,
            device=device,
            random_state=random_state,
        )
        self.hgb_helper = HGBAdapter(random_state=random_state)
        self.residual_models = {}
        self.is_fitted_ = False

    def fit(
        self,
        train_dataset: dict,
        val_dataset: dict | None = None,
        epochs: int = 25,
        lr: float = 1e-3,
        batch_size: int = 64,
        patience: int = 5,
    ) -> dict:
        """
        Fits iTransformer base sequence model and HGB residual regressors.
        Strictly leak-free: validation/test data are never seen during residual fitting.
        """
        X_train = train_dataset.get("X")
        if X_train is None:
            X_train = train_dataset.get("X_raw", train_dataset.get("X_normalized"))

        if X_train is None or len(X_train) == 0:
            raise ValueError("Training dataset X is empty or missing.")

        N = len(X_train)
        targets_dict = train_dataset.get("targets", {})

        if self.residual_mode == "out_of_sample" and N >= 20:
            # Chronological sub-split: base train (first sub_train_ratio) & calibration (remainder)
            N_base = max(10, int(np.floor(self.sub_train_ratio * N)))
            
            sub_train_ds = {
                "X": X_train[:N_base],
                "targets": {
                    t: {h: targets_dict[t][h][:N_base] for h in HORIZONS if h in targets_dict.get(t, {})}
                    for t in TARGET_COLUMNS if t in targets_dict
                },
            }

            # Enforce boundary purging on calibration targets
            sub_calib_targets = {}
            for t in TARGET_COLUMNS:
                sub_calib_targets[t] = {}
                for h in HORIZONS:
                    if h in targets_dict.get(t, {}):
                        full_series = targets_dict[t][h]
                        h_steps = HORIZONS_MAP.get(h, 10)
                        calib_len = N - N_base
                        arr = np.full(calib_len, np.nan, dtype=np.float32)
                        if h_steps < calib_len:
                            arr[h_steps:] = full_series[N_base + h_steps:N]
                        sub_calib_targets[t][h] = arr

            sub_calib_ds = {
                "X": X_train[N_base:],
                "targets": sub_calib_targets,
            }

            logger.info("Fitting base iTransformer adapter on sub-train split (%d samples)...", N_base)
            itrans_summary = self.itransformer_adapter.fit(
                sub_train_ds,
                val_dataset=val_dataset,
                epochs=epochs,
                lr=lr,
                batch_size=batch_size,
                patience=patience,
            )

            # Generate true OUT-OF-SAMPLE predictions on calibration split
            pred_calib = self.itransformer_adapter.predict(sub_calib_ds["X"])
            X_res_train = sub_calib_ds["X"]
            targets_res = sub_calib_ds["targets"]
        else:
            # In-sample residual fallback / ablation
            logger.info("Fitting base iTransformer adapter on full training dataset (%d samples)...", N)
            itrans_summary = self.itransformer_adapter.fit(
                train_dataset,
                val_dataset=val_dataset,
                epochs=epochs,
                lr=lr,
                batch_size=batch_size,
                patience=patience,
            )
            pred_calib = self.itransformer_adapter.predict(X_train)
            X_res_train = X_train
            targets_res = targets_dict

        trained_residual_models = 0

        for target in TARGET_COLUMNS:
            X_tab = self.hgb_helper._extract_tabular_features(X_res_train, target)

            for horizon in HORIZONS:
                y_raw = targets_res.get(target, {}).get(horizon)
                if y_raw is None or len(y_raw) != len(X_res_train):
                    continue

                y_pred_base = pred_calib[target][horizon]
                if isinstance(y_pred_base, (list, tuple)):
                    y_pred_base = np.array(y_pred_base, dtype=np.float32)

                valid_mask = ~np.isnan(y_raw) & ~np.isnan(y_pred_base)
                if np.sum(valid_mask) < 5:
                    # If calibration split is too small for this horizon (e.g. tiny synthetic test), fallback to in-sample
                    y_raw_full = targets_dict.get(target, {}).get(horizon)
                    if y_raw_full is not None and len(y_raw_full) == len(X_train):
                        pred_full = self.itransformer_adapter.predict(X_train)[target][horizon]
                        valid_full = ~np.isnan(y_raw_full) & ~np.isnan(pred_full)
                        if np.sum(valid_full) >= 5:
                            r_valid = y_raw_full[valid_full] - pred_full[valid_full]
                            X_tab_full = self.hgb_helper._extract_tabular_features(X_train, target)
                            X_tab_valid = X_tab_full[valid_full]
                            if self.include_base_forecast:
                                X_features = np.column_stack([X_tab_valid, pred_full[valid_full].reshape(-1, 1)])
                            else:
                                X_features = X_tab_valid
                        else:
                            logger.warning("Insufficient valid samples (%d) for residual %s %s", np.sum(valid_mask), target, horizon)
                            continue
                    else:
                        logger.warning("Insufficient valid samples (%d) for residual %s %s", np.sum(valid_mask), target, horizon)
                        continue
                else:
                    # Calculate residual error on raw scale: R = Y - Ŷ_base
                    r_valid = y_raw[valid_mask] - y_pred_base[valid_mask]
                    X_tab_valid = X_tab[valid_mask]

                    if self.include_base_forecast:
                        base_feat = y_pred_base[valid_mask].reshape(-1, 1)
                        X_features = np.column_stack([X_tab_valid, base_feat])
                    else:
                        X_features = X_tab_valid

                model = HistGradientBoostingRegressor(
                    max_iter=100,
                    learning_rate=0.05,
                    max_depth=6,
                    random_state=self.random_state,
                )
                model.fit(X_features, r_valid)
                self.residual_models[(target, horizon)] = model
                trained_residual_models += 1

        self.is_fitted_ = self.itransformer_adapter.is_fitted_ and (trained_residual_models > 0)
        tot_p, train_p = self.itransformer_adapter.model.get_parameter_counts()

        return {
            "model_name": "iTransformerHGBResidualAdapter",
            "residual_mode": self.residual_mode,
            "total_parameters": tot_p + (trained_residual_models * 100),
            "trainable_parameters": train_p,
            "itransformer_summary": itrans_summary,
            "trained_residual_models": trained_residual_models,
        }

    def predict(self, context_window: np.ndarray) -> dict:
        """
        Calculates Ŷ_final = np.clip(Ŷ_iTransformer + R̂_HGB, 0.0, None) on RAW target scale.
        """
        if not self.is_fitted_:
            raise RuntimeError("iTransformerHGBResidualAdapter must be fitted before predict.")

        pred_itrans = self.itransformer_adapter.predict(context_window)
        X, single_window = self._format_context(context_window)
        N = X.shape[0]

        predictions = {t: {} for t in TARGET_COLUMNS}

        for target in TARGET_COLUMNS:
            X_tab = self.hgb_helper._extract_tabular_features(X, target)

            for horizon in HORIZONS:
                p_base = pred_itrans[target][horizon]
                if isinstance(p_base, (float, int)):
                    p_base = np.array([p_base], dtype=np.float32)

                model_key = (target, horizon)
                residual_model = self.residual_models.get(model_key)

                if residual_model is not None:
                    if self.include_base_forecast:
                        X_features = np.column_stack([X_tab, p_base.reshape(-1, 1)])
                    else:
                        X_features = X_tab
                    r_pred = residual_model.predict(X_features)
                else:
                    r_pred = np.zeros(N, dtype=np.float32)

                p_final = np.clip(p_base + r_pred, a_min=0.0, a_max=None)

                if single_window:
                    predictions[target][horizon] = float(p_final[0])
                else:
                    predictions[target][horizon] = p_final.astype(np.float32)

        return predictions

    def predict_tensor(self, context_window: np.ndarray) -> np.ndarray:
        pred_dict = self.predict(context_window)
        N = self._extract_batch_size(context_window)
        tensor = np.zeros((N, len(TARGET_COLUMNS), len(HORIZONS)), dtype=np.float32)

        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                val = pred_dict[target][horizon]
                if isinstance(val, (float, int)):
                    tensor[:, m_idx, h_idx] = float(val)
                else:
                    tensor[:, m_idx, h_idx] = val

        return tensor

    def save(self, filepath: str | Path) -> None:
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        itrans_path = filepath.with_suffix(".itransformer.pt")
        self.itransformer_adapter.save(itrans_path)

        checkpoint = {
            "model_name": "iTransformerHGBResidualAdapter",
            "input_dim": self.input_dim,
            "sequence_length": self.sequence_length,
            "hidden_dim": self.hidden_dim,
            "num_layers": self.num_layers,
            "nhead": self.nhead,
            "device": self.device,
            "random_state": self.random_state,
            "residual_mode": self.residual_mode,
            "sub_train_ratio": self.sub_train_ratio,
            "include_base_forecast": self.include_base_forecast,
            "residual_models": self.residual_models,
            "is_fitted_": self.is_fitted_,
            "itransformer_checkpoint": str(itrans_path),
        }
        joblib.dump(checkpoint, filepath)

    def load(self, filepath: str | Path) -> None:
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Checkpoint file not found: {filepath}")

        checkpoint = joblib.load(filepath)
        self.input_dim = checkpoint["input_dim"]
        self.sequence_length = checkpoint["sequence_length"]
        self.hidden_dim = checkpoint["hidden_dim"]
        self.num_layers = checkpoint["num_layers"]
        self.nhead = checkpoint["nhead"]
        self.device = checkpoint.get("device", "cpu")
        self.random_state = checkpoint.get("random_state", 42)
        self.residual_mode = checkpoint.get("residual_mode", "out_of_sample")
        self.sub_train_ratio = checkpoint.get("sub_train_ratio", 0.70)
        self.include_base_forecast = checkpoint.get("include_base_forecast", True)

        self.itransformer_adapter = iTransformerAdapter(
            input_dim=self.input_dim,
            sequence_length=self.sequence_length,
            hidden_dim=self.hidden_dim,
            num_layers=self.num_layers,
            nhead=self.nhead,
            device=self.device,
            random_state=self.random_state,
        )

        itrans_path = Path(checkpoint["itransformer_checkpoint"])
        if itrans_path.exists():
            self.itransformer_adapter.load(itrans_path)

        self.residual_models = checkpoint["residual_models"]
        self.is_fitted_ = checkpoint.get("is_fitted_", True)

