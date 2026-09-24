"""
BDH Preprocessor — Configurable Per-Feature Normalization & Metadata Serialization
"""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import RobustScaler

from ml.bdh.config import FEATURE_COLUMNS, SKEWED_FEATURES


class BDHPreprocessor(BaseEstimator, TransformerMixin):
    """
    Configurable Preprocessor for BDH Telemetry Sequences:
    1. Applies log1p transformation to heavy-tailed throughput metrics (network/disk bytes/sec).
    2. Applies RobustScaler across all 14 feature columns.
    3. Provides serializable metadata export/import for reproducible sequence processing.
    """
    def __init__(self, feature_columns=None, skewed_features=None, strategy="robust"):
        self.feature_columns = list(feature_columns or FEATURE_COLUMNS)
        self.skewed_features = list(skewed_features or SKEWED_FEATURES)
        self.strategy = strategy
        self.scaler = RobustScaler()
        self.is_fitted_ = False
        self.center_ = None
        self.scale_ = None

    def fit(self, X, y=None):
        X_df = self._to_dataframe(X)
        X_trans = X_df[self.feature_columns].copy()

        for col in self.skewed_features:
            if col in X_trans.columns:
                X_trans[col] = np.log1p(np.maximum(0.0, X_trans[col].values))

        self.scaler.fit(X_trans)
        self.center_ = [float(c) for c in self.scaler.center_]
        self.scale_ = [float(s) for s in self.scaler.scale_]
        self.is_fitted_ = True
        return self

    def transform(self, X):
        if not self.is_fitted_:
            raise RuntimeError("BDHPreprocessor must be fitted before transform.")

        is_3d = isinstance(X, np.ndarray) and X.ndim == 3
        if is_3d:
            N, T, D = X.shape
            X_flat = X.reshape(-1, D)
            X_df = pd.DataFrame(X_flat, columns=self.feature_columns)
        else:
            X_df = self._to_dataframe(X)

        X_trans = X_df[self.feature_columns].copy()
        for col in self.skewed_features:
            if col in X_trans.columns:
                X_trans[col] = np.log1p(np.maximum(0.0, X_trans[col].values))

        scaled = self.scaler.transform(X_trans)
        if is_3d:
            return scaled.reshape(N, T, D).astype(np.float32)
        return scaled.astype(np.float32)

    def inverse_transform(self, X):
        if not self.is_fitted_:
            raise RuntimeError("BDHPreprocessor must be fitted before inverse_transform.")

        is_3d = isinstance(X, np.ndarray) and X.ndim == 3
        if is_3d:
            N, T, D = X.shape
            X_flat = X.reshape(-1, D)
        else:
            X_flat = np.asarray(X)

        unscaled = self.scaler.inverse_transform(X_flat)
        df_res = pd.DataFrame(unscaled, columns=self.feature_columns)

        for col in self.skewed_features:
            if col in df_res.columns:
                df_res[col] = np.expm1(np.maximum(0.0, df_res[col].values))

        res_arr = df_res.values
        if is_3d:
            return res_arr.reshape(N, T, D).astype(np.float32)
        return res_arr.astype(np.float32)

    def _to_dataframe(self, X):
        if isinstance(X, pd.DataFrame):
            df = X.copy()
        elif isinstance(X, np.ndarray):
            if X.ndim == 2:
                df = pd.DataFrame(X, columns=self.feature_columns)
            else:
                raise ValueError("3D NumPy array handling is performed in transform/inverse_transform.")
        else:
            raise TypeError(f"Unsupported data type for preprocessor: {type(X)}")

        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0.0

        return df

    def to_dict(self) -> dict:
        return {
            "feature_columns": self.feature_columns,
            "skewed_features": self.skewed_features,
            "strategy": self.strategy,
            "is_fitted": self.is_fitted_,
            "center": self.center_,
            "scale": self.scale_,
        }

    @classmethod
    def from_dict(cls, data: dict):
        inst = cls(
            feature_columns=data.get("feature_columns"),
            skewed_features=data.get("skewed_features"),
            strategy=data.get("strategy", "robust"),
        )
        if data.get("is_fitted"):
            inst.center_ = data.get("center")
            inst.scale_ = data.get("scale")
            inst.scaler.center_ = np.array(inst.center_)
            inst.scaler.scale_ = np.array(inst.scale_)
            inst.is_fitted_ = True
        return inst
