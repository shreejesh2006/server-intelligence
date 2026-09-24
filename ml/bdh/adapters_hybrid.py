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
from ml.bdh.adapters_patchtst import PatchTSTAdapter

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
