"""
BDH Intelligence Package — Sequence Dataset Foundation & Common Benchmark Adapters
"""

from ml.bdh.config import (
    CANONICAL_HOST,
    FEATURE_COLUMNS,
    DEFAULT_SAMPLING_INTERVAL_SECONDS,
    DEFAULT_MAX_GAP_SECONDS,
    DEFAULT_SEQUENCE_LENGTH,
    SKEWED_FEATURES,
    TARGET_COLUMNS,
    HORIZONS_MAP,
)
from ml.bdh.preprocessor import BDHPreprocessor
from ml.bdh.dataset import BDHSequenceDataset, create_sequence_windows
from ml.bdh.adapters import BaseModelAdapter, PersistenceAdapter, HGBAdapter, XGBoostAdapter
from ml.bdh.metrics import compute_mae, compute_rmse, compute_mase, evaluate_forecast_dict


def __getattr__(name: str):
    if name == "fetch_ubuntu_telemetry_history":
        from ml.bdh.fetcher import fetch_ubuntu_telemetry_history
        return fetch_ubuntu_telemetry_history
    if name == "BDHInspiredSequenceModel":
        from ml.bdh.model import BDHInspiredSequenceModel
        return BDHInspiredSequenceModel
    if name == "BDHAdapter":
        from ml.bdh.adapters_bdh import BDHAdapter
        return BDHAdapter
    if name == "PatchTSTModel":
        from ml.bdh.model_patchtst import PatchTSTModel
        return PatchTSTModel
    if name == "BDHPatchTSTHybrid":
        from ml.bdh.model_patchtst import BDHPatchTSTHybrid
        return BDHPatchTSTHybrid
    if name == "PatchTSTAdapter":
        from ml.bdh.adapters_patchtst import PatchTSTAdapter
        return PatchTSTAdapter
    if name == "BDHPatchTSTHybridAdapter":
        from ml.bdh.adapters_patchtst import BDHPatchTSTHybridAdapter
        return BDHPatchTSTHybridAdapter
    if name == "PatchTSTHGBResidualAdapter":
        from ml.bdh.adapters_hybrid import PatchTSTHGBResidualAdapter
        return PatchTSTHGBResidualAdapter
    if name == "FastAssociativeMemory":
        from ml.bdh.fast_memory import FastAssociativeMemory
        return FastAssociativeMemory
    if name == "PatchTSTFastMemoryModel":
        from ml.bdh.model_patchtst_memory import PatchTSTFastMemoryModel
        return PatchTSTFastMemoryModel
    if name == "PatchTSTFastMemoryAdapter":
        from ml.bdh.adapters_patchtst_memory import PatchTSTFastMemoryAdapter
        return PatchTSTFastMemoryAdapter
    if name == "GatedFastAssociativeMemory":
        from ml.bdh.gated_fast_memory import GatedFastAssociativeMemory
        return GatedFastAssociativeMemory
    if name == "PatchTSTGatedMemoryModel":
        from ml.bdh.model_patchtst_gated_memory import PatchTSTGatedMemoryModel
        return PatchTSTGatedMemoryModel
    if name == "PatchTSTGatedMemoryAdapter":
        from ml.bdh.adapters_patchtst_gated_memory import PatchTSTGatedMemoryAdapter
        return PatchTSTGatedMemoryAdapter
    if name == "ChannelIsolatedFastAssociativeMemory":
        from ml.bdh.channel_isolated_memory import ChannelIsolatedFastAssociativeMemory
        return ChannelIsolatedFastAssociativeMemory
    if name == "PatchTSTChannelMemoryModel":
        from ml.bdh.model_patchtst_channel_memory import PatchTSTChannelMemoryModel
        return PatchTSTChannelMemoryModel
    if name == "PatchTSTChannelMemoryAdapter":
        from ml.bdh.adapters_patchtst_channel_memory import PatchTSTChannelMemoryAdapter
        return PatchTSTChannelMemoryAdapter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "CANONICAL_HOST",
    "FEATURE_COLUMNS",
    "DEFAULT_SAMPLING_INTERVAL_SECONDS",
    "DEFAULT_MAX_GAP_SECONDS",
    "DEFAULT_SEQUENCE_LENGTH",
    "SKEWED_FEATURES",
    "TARGET_COLUMNS",
    "HORIZONS_MAP",
    "BDHPreprocessor",
    "BDHSequenceDataset",
    "create_sequence_windows",
    "fetch_ubuntu_telemetry_history",
    "BaseModelAdapter",
    "PersistenceAdapter",
    "HGBAdapter",
    "XGBoostAdapter",
    "BDHInspiredSequenceModel",
    "BDHAdapter",
    "PatchTSTModel",
    "BDHPatchTSTHybrid",
    "PatchTSTAdapter",
    "BDHPatchTSTHybridAdapter",
    "PatchTSTHGBResidualAdapter",
    "FastAssociativeMemory",
    "PatchTSTFastMemoryModel",
    "PatchTSTFastMemoryAdapter",
    "GatedFastAssociativeMemory",
    "PatchTSTGatedMemoryModel",
    "PatchTSTGatedMemoryAdapter",
    "ChannelIsolatedFastAssociativeMemory",
    "PatchTSTChannelMemoryModel",
    "PatchTSTChannelMemoryAdapter",
    "compute_mae",
    "compute_rmse",
    "compute_mase",
    "evaluate_forecast_dict",
]

