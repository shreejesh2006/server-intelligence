"""
BDH Model Adapter — TimeMixer Benchmark Integration
"""

import copy
import logging
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from ml.bdh.adapters import BaseModelAdapter, TARGET_COLUMNS, HORIZONS
from ml.bdh.model_timemixer import TimeMixerModel

logger = logging.getLogger(__name__)


class TimeMixerAdapter(BaseModelAdapter):
    """
    Common Benchmark Adapter for TimeMixerModel.
    Subclasses BaseModelAdapter to evaluate TimeMixer against baseline models.
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        hidden_dim: int = 64,
        num_layers: int = 2,
        down_sampling_layers: int = 2,
        down_sampling_window: int = 2,
        decomp_kernel_size: int = 5,
        device: str = "cpu",
        random_state: int = 42,
    ):
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.down_sampling_layers = down_sampling_layers
        self.down_sampling_window = down_sampling_window
        self.decomp_kernel_size = decomp_kernel_size
        self.device = torch.device(device)
        self.random_state = random_state

        torch.manual_seed(random_state)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(random_state)

        self.model = TimeMixerModel(
            input_dim=input_dim,
            sequence_length=sequence_length,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            down_sampling_layers=down_sampling_layers,
            down_sampling_window=down_sampling_window,
            decomp_kernel_size=decomp_kernel_size,
            output_targets=len(TARGET_COLUMNS),
            output_horizons=len(HORIZONS),
        ).to(self.device)

        self.target_stds_ = np.ones(len(TARGET_COLUMNS), dtype=np.float32)
        self.is_fitted_ = False

    def _extract_dataset_arrays(self, dataset: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Extracts feature array X [N, T, 14], target array Y [N, 3, 5], and validity mask [N, 3, 5]."""
        X = dataset.get("X")
        if X is None:
            X = dataset.get("X_normalized", dataset.get("X_raw"))

        if X is None or len(X) == 0:
            raise ValueError("Dataset X array is empty or missing.")

        N = len(X)
        Y = np.zeros((N, len(TARGET_COLUMNS), len(HORIZONS)), dtype=np.float32)
        valid_mask = np.zeros((N, len(TARGET_COLUMNS), len(HORIZONS)), dtype=np.float32)

        targets_dict = dataset.get("targets", {})

        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                target_series = targets_dict.get(target, {}).get(horizon)
                if target_series is not None and len(target_series) == N:
                    is_valid = ~np.isnan(target_series)
                    valid_mask[:, m_idx, h_idx] = is_valid.astype(np.float32)
                    Y[:, m_idx, h_idx] = np.where(is_valid, target_series, 0.0)

        return X.astype(np.float32), Y, valid_mask

    def _compute_target_scale_stds(self, Y: np.ndarray, M: np.ndarray) -> np.ndarray:
        """Computes target standard deviations across valid training samples."""
        stds = np.ones(len(TARGET_COLUMNS), dtype=np.float32)
        for m_idx in range(len(TARGET_COLUMNS)):
            valid_vals = Y[:, m_idx, :][M[:, m_idx, :] > 0]
            if len(valid_vals) > 0:
                std_val = float(np.std(valid_vals))
                stds[m_idx] = max(1e-3, std_val)
        return stds

    def fit(
        self,
        train_dataset: dict,
        val_dataset: dict | None = None,
        epochs: int = 25,
        lr: float = 1e-3,
        batch_size: int = 64,
        patience: int = 5,
    ) -> dict:
        """Fits TimeMixer model with target scale equalization and validation early stopping."""
        X_train, Y_train, M_train = self._extract_dataset_arrays(train_dataset)
        self.target_stds_ = self._compute_target_scale_stds(Y_train, M_train)

        Y_train_scaled = Y_train / self.target_stds_[np.newaxis, :, np.newaxis]

        train_ds = TensorDataset(
            torch.from_numpy(X_train),
            torch.from_numpy(Y_train_scaled),
            torch.from_numpy(M_train),
        )
        train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)

        val_loader = None
        if val_dataset is not None:
            X_val, Y_val, M_val = self._extract_dataset_arrays(val_dataset)
            Y_val_scaled = Y_val / self.target_stds_[np.newaxis, :, np.newaxis]
            val_ds = TensorDataset(
                torch.from_numpy(X_val),
                torch.from_numpy(Y_val_scaled),
                torch.from_numpy(M_val),
            )
            val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

        optimizer = torch.optim.AdamW(self.model.parameters(), lr=lr, weight_decay=1e-4)
        criterion = nn.HuberLoss(reduction="none")

        best_val_loss = float("inf")
        best_state = None
        patience_counter = 0

        initial_loss = float("nan")
        final_loss = float("nan")

        for epoch in range(epochs):
            self.model.train()
            epoch_loss_sum = 0.0
            epoch_valid_count = 0.0

            for bx, by, bm in train_loader:
                bx = bx.to(self.device)
                by = by.to(self.device)
                bm = bm.to(self.device)

                optimizer.zero_grad()
                pred = self.model(bx)

                elem_loss = criterion(pred, by)
                masked_loss = torch.sum(elem_loss * bm) / torch.clamp(torch.sum(bm), min=1.0)

                if torch.sum(bm) > 0:
                    masked_loss.backward()
                    nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                    optimizer.step()

                epoch_loss_sum += masked_loss.item() * torch.sum(bm).item()
                epoch_valid_count += torch.sum(bm).item()

            train_loss = epoch_loss_sum / max(1.0, epoch_valid_count)
            if epoch == 0:
                initial_loss = train_loss
            final_loss = train_loss

            if val_loader is not None:
                self.model.eval()
                val_loss_sum = 0.0
                val_valid_count = 0.0

                with torch.no_grad():
                    for bx, by, bm in val_loader:
                        bx = bx.to(self.device)
                        by = by.to(self.device)
                        bm = bm.to(self.device)
                        pred = self.model(bx)
                        elem_loss = criterion(pred, by)
                        val_loss_sum += torch.sum(elem_loss * bm).item()
                        val_valid_count += torch.sum(bm).item()

                val_loss = val_loss_sum / max(1.0, val_valid_count)
                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    best_state = copy.deepcopy(self.model.state_dict())
                    patience_counter = 0
                else:
                    patience_counter += 1
                    if patience_counter >= patience:
                        logger.info(f"Early stopping triggered at epoch {epoch + 1}")
                        break

        if best_state is not None:
            self.model.load_state_dict(best_state)

        self.is_fitted_ = True
        tot_p, train_p = self.model.get_parameter_counts()

        return {
            "model_name": "TimeMixerAdapter",
            "total_parameters": tot_p,
            "trainable_parameters": train_p,
            "epochs_trained": epoch + 1 if 'epoch' in locals() else epochs,
            "initial_loss": round(initial_loss, 6),
            "final_loss": round(final_loss, 6),
            "best_val_loss": round(best_val_loss, 6) if best_val_loss < float("inf") else None,
        }

    def predict(self, context_window: np.ndarray) -> dict:
        """Predicts future targets for input context window. Returns dict in RAW telemetry units."""
        pred_tensor = self.predict_tensor(context_window)
        predictions = {t: {} for t in TARGET_COLUMNS}
        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                predictions[target][horizon] = pred_tensor[:, m_idx, h_idx]
        return predictions

    def predict_tensor(self, context_window: np.ndarray) -> np.ndarray:
        """Predicts future targets returning 3D array [N, M=3, H=5] in RAW telemetry units."""
        X, single_window = self._format_context(context_window)
        X_tensor = torch.from_numpy(X.astype(np.float32)).to(self.device)

        self.model.eval()
        with torch.no_grad():
            pred_scaled = self.model(X_tensor)

        out_scaled_np = pred_scaled.cpu().numpy()
        out_raw_np = out_scaled_np * self.target_stds_[np.newaxis, :, np.newaxis]
        return out_raw_np

    def save(self, filepath: str | Path) -> None:
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        tot_p, train_p = self.model.get_parameter_counts()
        checkpoint = {
            "model_name": "TimeMixerAdapter",
            "input_dim": self.input_dim,
            "sequence_length": self.sequence_length,
            "hidden_dim": self.hidden_dim,
            "num_layers": self.num_layers,
            "down_sampling_layers": self.down_sampling_layers,
            "down_sampling_window": self.down_sampling_window,
            "decomp_kernel_size": self.decomp_kernel_size,
            "target_stds_": self.target_stds_,
            "state_dict": self.model.state_dict(),
            "is_fitted_": self.is_fitted_,
            "total_parameters": tot_p,
            "trainable_parameters": train_p,
        }
        torch.save(checkpoint, filepath)

    def load(self, filepath: str | Path) -> None:
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Checkpoint file not found: {filepath}")

        checkpoint = torch.load(filepath, map_location=self.device, weights_only=False)
        self.input_dim = checkpoint["input_dim"]
        self.sequence_length = checkpoint["sequence_length"]
        self.hidden_dim = checkpoint["hidden_dim"]
        self.num_layers = checkpoint["num_layers"]
        self.down_sampling_layers = checkpoint["down_sampling_layers"]
        self.down_sampling_window = checkpoint["down_sampling_window"]
        self.decomp_kernel_size = checkpoint["decomp_kernel_size"]
        self.target_stds_ = checkpoint["target_stds_"]

        self.model = TimeMixerModel(
            input_dim=self.input_dim,
            sequence_length=self.sequence_length,
            hidden_dim=self.hidden_dim,
            num_layers=self.num_layers,
            down_sampling_layers=self.down_sampling_layers,
            down_sampling_window=self.down_sampling_window,
            decomp_kernel_size=self.decomp_kernel_size,
            output_targets=len(TARGET_COLUMNS),
            output_horizons=len(HORIZONS),
        ).to(self.device)

        self.model.load_state_dict(checkpoint["state_dict"])
        self.is_fitted_ = checkpoint.get("is_fitted_", True)
