"""
BDH Benchmark Adapter — PyTorch BDHInspiredSequenceModel Integration
"""

import logging
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from ml.bdh.adapters import BaseModelAdapter, TARGET_COLUMNS, HORIZONS, TARGET_INDEX_MAP, HORIZON_INDEX_MAP
from ml.bdh.model import BDHInspiredSequenceModel

logger = logging.getLogger(__name__)


class BDHAdapter(BaseModelAdapter):
    """
    Common Benchmark Adapter for BDHInspiredSequenceModel.

    Subclasses BaseModelAdapter to evaluate the lightweight PyTorch BDH-inspired sequence model
    against standard benchmark persistence & HistGradientBoosting baselines.
    """

    def __init__(
        self,
        input_dim: int = 14,
        hidden_dim: int = 64,
        num_layers: int = 2,
        device: str = "cpu",
        random_state: int = 42,
    ):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.device = torch.device(device)
        self.random_state = random_state

        torch.manual_seed(random_state)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(random_state)

        self.model = BDHInspiredSequenceModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            output_targets=len(TARGET_COLUMNS),
            output_horizons=len(HORIZONS),
        ).to(self.device)

        self.is_fitted_ = False

    def _extract_dataset_arrays(self, dataset: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Extracts feature array X [N, T, 14], target array Y [N, 3, 5], and validity mask [N, 3, 5].
        """
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
                    # Replace NaNs with 0.0 for numerical safety in tensor operations
                    Y[:, m_idx, h_idx] = np.where(is_valid, target_series, 0.0)

        return X.astype(np.float32), Y, valid_mask

    def fit(
        self,
        train_dataset: dict,
        val_dataset: dict | None = None,
        epochs: int = 20,
        lr: float = 1e-3,
        batch_size: int = 32,
    ) -> dict:
        """
        Fits the BDHInspiredSequenceModel using masked Huber loss over chronological training windows.
        """
        X_train, Y_train, M_train = self._extract_dataset_arrays(train_dataset)

        dataset = TensorDataset(
            torch.from_numpy(X_train),
            torch.from_numpy(Y_train),
            torch.from_numpy(M_train),
        )

        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        optimizer = torch.optim.AdamW(self.model.parameters(), lr=lr, weight_decay=1e-4)
        criterion = nn.HuberLoss(reduction="none")

        self.model.train()
        initial_loss = float("nan")
        final_loss = float("nan")

        for epoch in range(epochs):
            epoch_loss_sum = 0.0
            epoch_valid_count = 0.0

            for bx, by, bm in dataloader:
                bx = bx.to(self.device)
                by = by.to(self.device)
                bm = bm.to(self.device)

                optimizer.zero_grad()
                pred = self.model(bx)  # [B, 3, 5]

                elem_loss = criterion(pred, by)
                masked_loss = torch.sum(elem_loss * bm) / torch.clamp(torch.sum(bm), min=1.0)

                if torch.sum(bm) > 0:
                    masked_loss.backward()
                    nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                    optimizer.step()

                epoch_loss_sum += masked_loss.item() * torch.sum(bm).item()
                epoch_valid_count += torch.sum(bm).item()

            avg_loss = epoch_loss_sum / max(1.0, epoch_valid_count)
            if epoch == 0:
                initial_loss = avg_loss
            final_loss = avg_loss

        self.is_fitted_ = True
        tot_p, train_p = self.model.get_parameter_counts()

        return {
            "model_name": "BDHAdapter",
            "total_parameters": tot_p,
            "trainable_parameters": train_p,
            "epochs_trained": epochs,
            "initial_loss": round(initial_loss, 6),
            "final_loss": round(final_loss, 6),
        }

    def predict(self, context_window: np.ndarray) -> dict:
        """
        Predicts future targets for input context window.
        context_window: np.ndarray [N, T, 14] or [T, 14].
        Returns structured dict: { "cpu": {"5m": array[N], ...}, "memory": ..., "load_1m": ... }
        """
        if not self.is_fitted_:
            logger.warning("BDHAdapter.predict called before fit; model predictions will be uncalibrated.")

        pred_tensor = self.predict_tensor(context_window)  # [N, 3, 5]
        N = pred_tensor.shape[0]

        predictions = {t: {} for t in TARGET_COLUMNS}
        for m_idx, target in enumerate(TARGET_COLUMNS):
            for h_idx, horizon in enumerate(HORIZONS):
                predictions[target][horizon] = pred_tensor[:, m_idx, h_idx]

        return predictions

    def predict_tensor(self, context_window: np.ndarray) -> np.ndarray:
        """
        Predicts future targets returning 3D numpy array of shape [N, M=3, H=5].
        """
        X, single_window = self._format_context(context_window)
        X_tensor = torch.from_numpy(X.astype(np.float32)).to(self.device)

        self.model.eval()
        with torch.no_grad():
            pred = self.model(X_tensor)  # [N, 3, 5]

        out_np = pred.cpu().numpy()
        return out_np

    def save(self, filepath: str | Path) -> None:
        """Serializes BDHAdapter model checkpoint and hyperparams."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        tot_p, train_p = self.model.get_parameter_counts()
        checkpoint = {
            "model_name": "BDHAdapter",
            "input_dim": self.input_dim,
            "hidden_dim": self.hidden_dim,
            "num_layers": self.num_layers,
            "state_dict": self.model.state_dict(),
            "is_fitted_": self.is_fitted_,
            "total_parameters": tot_p,
            "trainable_parameters": train_p,
        }
        torch.save(checkpoint, filepath)

    def load(self, filepath: str | Path) -> None:
        """Deserializes BDHAdapter model checkpoint."""
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Checkpoint file not found: {filepath}")

        checkpoint = torch.load(filepath, map_location=self.device, weights_only=False)
        self.input_dim = checkpoint["input_dim"]
        self.hidden_dim = checkpoint["hidden_dim"]
        self.num_layers = checkpoint["num_layers"]

        self.model = BDHInspiredSequenceModel(
            input_dim=self.input_dim,
            hidden_dim=self.hidden_dim,
            num_layers=self.num_layers,
            output_targets=len(TARGET_COLUMNS),
            output_horizons=len(HORIZONS),
        ).to(self.device)

        self.model.load_state_dict(checkpoint["state_dict"])
        self.is_fitted_ = checkpoint.get("is_fitted_", True)
