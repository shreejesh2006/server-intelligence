import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import RobustScaler

# Feature Selection
ANOMALY_FEATURES = [
    'cpu',
    'memory',
    'load_1m',
    'load_5m',
    'load_15m',
    'network_rx',
    'network_tx',
    'disk_read',
    'disk_write',
    'process_count',
    'iowait'
]

# Heavy-tailed throughput metrics requiring log1p transformation
SKEWED_FEATURES = [
    'network_rx',
    'network_tx',
    'disk_read',
    'disk_write'
]


class TelemetryPreprocessor(BaseEstimator, TransformerMixin):
    """
    Custom Transformer for Server Telemetry:
    1. Applies log1p transformation to heavy-tailed throughput metrics.
    2. Applies RobustScaler across all feature columns.
    """
    def __init__(self, feature_names=None, skewed_features=None):
        self.feature_names = feature_names or ANOMALY_FEATURES
        self.skewed_features = skewed_features or SKEWED_FEATURES
        self.scaler = RobustScaler()
        self.skewed_indices_ = []

    def fit(self, X, y=None):
        if isinstance(X, pd.DataFrame):
            X_df = X[self.feature_names].copy()
        else:
            X_df = pd.DataFrame(X, columns=self.feature_names)
            
        X_trans = X_df.copy()
        for col in self.skewed_features:
            if col in X_trans.columns:
                X_trans[col] = np.log1p(np.maximum(0.0, X_trans[col].values))

        self.scaler.fit(X_trans)
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            X_df = X[self.feature_names].copy()
        else:
            X_df = pd.DataFrame(X, columns=self.feature_names)

        X_trans = X_df.copy()
        for col in self.skewed_features:
            if col in X_trans.columns:
                X_trans[col] = np.log1p(np.maximum(0.0, X_trans[col].values))

        return self.scaler.transform(X_trans)
