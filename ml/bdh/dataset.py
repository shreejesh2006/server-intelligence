"""
BDH Sequence Dataset — Sliding Window Construction, Temporal Gap Policy, and Target Binding
"""

import json
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

from ml.bdh.config import (
    CANONICAL_HOST,
    FEATURE_COLUMNS,
    DEFAULT_SAMPLING_INTERVAL_SECONDS,
    DEFAULT_MAX_GAP_SECONDS,
    DEFAULT_SEQUENCE_LENGTH,
    TARGET_COLUMNS,
    HORIZONS_MAP,
    validate_host,
)
from ml.bdh.preprocessor import BDHPreprocessor

logger = logging.getLogger(__name__)


def create_sequence_windows(
    df: pd.DataFrame,
    sequence_length: int = DEFAULT_SEQUENCE_LENGTH,
    stride: int = 1,
    max_gap_seconds: float = DEFAULT_MAX_GAP_SECONDS,
    sampling_interval_seconds: float = DEFAULT_SAMPLING_INTERVAL_SECONDS,
    target_columns: list[str] | None = None,
    horizons_map: dict[str, int] | None = None,
) -> dict:
    """
    Transforms continuous server telemetry into standardized sequence windows [N, T, 14].

    Temporal Correctness & Gap Policy:
    1. Sorts telemetry chronologically by timestamp.
    2. Detects timestamp gaps (> max_gap_seconds). Telemetry is segmented into contiguous sub-series.
    3. Windows are constructed ONLY within contiguous segments (no bridging across offline periods).
    4. Preserves timestamps and explicit validity_mask [N, T] for observed vs interpolated samples.
    """
    if df.empty:
        return _empty_window_result(sequence_length)

    df_clean = df.copy()

    # 1. Normalize timestamp column to datetime UTC and sort chronologically
    if "timestamp" in df_clean.columns:
        df_clean["dt_timestamp"] = pd.to_datetime(df_clean["timestamp"], utc=True)
    else:
        # Index assumed to be timestamp
        df_clean["dt_timestamp"] = pd.to_datetime(df_clean.index, utc=True)

    df_clean.sort_values("dt_timestamp", inplace=True)
    df_clean.reset_index(drop=True, inplace=True)

    # 2. Normalize process count feature name if named 'processes'
    if "processes" in df_clean.columns and "process_count" not in df_clean.columns:
        df_clean["process_count"] = df_clean["processes"]

    # 3. Ensure all 14 canonical features exist
    for col in FEATURE_COLUMNS:
        if col not in df_clean.columns:
            df_clean[col] = 0.0

    target_cols = target_columns or TARGET_COLUMNS
    h_map = horizons_map or HORIZONS_MAP

    # 4. Detect timestamp gaps and segment data into continuous blocks
    time_diffs = df_clean["dt_timestamp"].diff().dt.total_seconds()
    gap_mask = time_diffs > max_gap_seconds
    segment_ids = gap_mask.cumsum()

    windows_X = []
    windows_timestamps = []
    windows_validity = []
    windows_targets = {target: {h: [] for h in h_map.keys()} for target in target_cols}

    # 5. Extract sliding windows within each contiguous segment
    for _, segment_df in df_clean.groupby(segment_ids):
        seg_len = len(segment_df)
        if seg_len < sequence_length:
            continue

        # Extract features matrix [Seg_Len, 14] in exact canonical column order
        feat_matrix = segment_df[FEATURE_COLUMNS].values.astype(np.float32)
        ts_strings = segment_df["dt_timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ").values

        # Validity mask: True for real observations
        valid_mask = np.ones(seg_len, dtype=bool)

        for start_idx in range(0, seg_len - sequence_length + 1, stride):
            end_idx = start_idx + sequence_length

            w_x = feat_matrix[start_idx:end_idx]            # [T, 14]
            w_ts = ts_strings[start_idx:end_idx]            # [T]
            w_val = valid_mask[start_idx:end_idx]           # [T]

            windows_X.append(w_x)
            windows_timestamps.append(w_ts)
            windows_validity.append(w_val)

            # Optional future forecasting targets
            last_window_idx = end_idx - 1
            for target in target_cols:
                target_series = segment_df[target].values
                for horizon_name, horizon_steps in h_map.items():
                    target_idx = last_window_idx + horizon_steps
                    if target_idx < seg_len:
                        windows_targets[target][horizon_name].append(float(target_series[target_idx]))
                    else:
                        windows_targets[target][horizon_name].append(np.nan)

    if not windows_X:
        return _empty_window_result(sequence_length)

    X_arr = np.array(windows_X, dtype=np.float32)                 # [N, T, 14]
    timestamps_arr = np.array(windows_timestamps, dtype=str)      # [N, T]
    validity_arr = np.array(windows_validity, dtype=bool)         # [N, T]

    # Convert targets to NumPy arrays
    formatted_targets = {}
    for target in target_cols:
        formatted_targets[target] = {}
        for h in h_map.keys():
            formatted_targets[target][h] = np.array(windows_targets[target][h], dtype=np.float32)

    return {
        "X": X_arr,
        "timestamps": timestamps_arr,
        "validity_mask": validity_arr,
        "targets": formatted_targets,
        "num_windows": len(X_arr),
        "sequence_length": sequence_length,
        "feature_count": len(FEATURE_COLUMNS),
    }


def _empty_window_result(sequence_length: int) -> dict:
    return {
        "X": np.empty((0, sequence_length, len(FEATURE_COLUMNS)), dtype=np.float32),
        "timestamps": np.empty((0, sequence_length), dtype=str),
        "validity_mask": np.empty((0, sequence_length), dtype=bool),
        "targets": {t: {h: np.empty((0,), dtype=np.float32) for h in HORIZONS_MAP.keys()} for t in TARGET_COLUMNS},
        "num_windows": 0,
        "sequence_length": sequence_length,
        "feature_count": len(FEATURE_COLUMNS),
    }


class BDHSequenceDataset:
    """
    Encapsulated BDH Dataset Foundation for Ubuntu Telemetry.
    Manages raw sequence generation, feature preprocessing, metadata serialization, and .npz storage.
    """
    def __init__(
        self,
        host: str = CANONICAL_HOST,
        sequence_length: int = DEFAULT_SEQUENCE_LENGTH,
        stride: int = 1,
        max_gap_seconds: float = DEFAULT_MAX_GAP_SECONDS,
        sampling_interval_seconds: float = DEFAULT_SAMPLING_INTERVAL_SECONDS,
        preprocessor: BDHPreprocessor | None = None,
    ):
        self.host = validate_host(host)
        self.sequence_length = sequence_length
        self.stride = stride
        self.max_gap_seconds = max_gap_seconds
        self.sampling_interval_seconds = sampling_interval_seconds
        self.preprocessor = preprocessor or BDHPreprocessor(feature_columns=FEATURE_COLUMNS)

        self.X_raw = None
        self.X_normalized = None
        self.timestamps = None
        self.validity_mask = None
        self.targets = None
        self.generation_meta = {}

    def build_from_dataframe(self, df: pd.DataFrame, fit_preprocessor: bool = True) -> "BDHSequenceDataset":
        """
        Builds sequence dataset from continuous telemetry DataFrame.
        """
        window_data = create_sequence_windows(
            df,
            sequence_length=self.sequence_length,
            stride=self.stride,
            max_gap_seconds=self.max_gap_seconds,
            sampling_interval_seconds=self.sampling_interval_seconds,
        )

        self.X_raw = window_data["X"]
        self.timestamps = window_data["timestamps"]
        self.validity_mask = window_data["validity_mask"]
        self.targets = window_data["targets"]

        if self.X_raw.shape[0] > 0:
            if fit_preprocessor or not self.preprocessor.is_fitted_:
                self.preprocessor.fit(df[FEATURE_COLUMNS])

            self.X_normalized = self.preprocessor.transform(self.X_raw)
        else:
            self.X_normalized = self.X_raw.copy()

        self.generation_meta = {
            "host": self.host,
            "feature_columns": FEATURE_COLUMNS,
            "feature_count": len(FEATURE_COLUMNS),
            "sequence_length": self.sequence_length,
            "stride": self.stride,
            "num_windows": len(self.X_raw),
            "max_gap_seconds": self.max_gap_seconds,
            "sampling_interval_seconds": self.sampling_interval_seconds,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "window_start_time": self.timestamps[0, 0] if len(self.timestamps) > 0 else None,
            "window_end_time": self.timestamps[-1, -1] if len(self.timestamps) > 0 else None,
        }
        return self

    def save_npz(self, output_path: str | Path) -> Path:
        """
        Saves dataset, normalized tensors, validity masks, targets, and metadata into a compressed .npz archive.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        meta_payload = {
            "generation_metadata": self.generation_meta,
            "preprocessor_metadata": self.preprocessor.to_dict(),
        }

        # Flatten target arrays for npz storage
        save_dict = {
            "X_raw": self.X_raw if self.X_raw is not None else np.empty((0, self.sequence_length, 14)),
            "X_normalized": self.X_normalized if self.X_normalized is not None else np.empty((0, self.sequence_length, 14)),
            "timestamps": self.timestamps if self.timestamps is not None else np.empty((0, self.sequence_length)),
            "validity_mask": self.validity_mask if self.validity_mask is not None else np.empty((0, self.sequence_length)),
            "metadata_json": np.array(json.dumps(meta_payload, indent=2)),
        }

        if self.targets:
            for target_name, horizons in self.targets.items():
                for horizon_name, target_arr in horizons.items():
                    key = f"target_{target_name}_{horizon_name}"
                    save_dict[key] = target_arr

        np.savez_compressed(path, **save_dict)
        logger.info("Saved BDH sequence dataset to %s (%d windows)", path, len(self.X_raw) if self.X_raw is not None else 0)
        return path

    @classmethod
    def load_npz(cls, input_path: str | Path) -> "BDHSequenceDataset":
        """
        Loads BDH sequence dataset from a compressed .npz archive.
        """
        path = Path(input_path)
        if not path.exists():
            raise FileNotFoundError(f"BDH dataset file not found: {path}")

        data = np.load(path, allow_pickle=True)
        meta_json_str = str(data["metadata_json"])
        meta_payload = json.loads(meta_json_str)

        gen_meta = meta_payload.get("generation_metadata", {})
        prep_meta = meta_payload.get("preprocessor_metadata", {})

        preprocessor = BDHPreprocessor.from_dict(prep_meta)
        inst = cls(
            host=gen_meta.get("host", CANONICAL_HOST),
            sequence_length=gen_meta.get("sequence_length", DEFAULT_SEQUENCE_LENGTH),
            stride=gen_meta.get("stride", 1),
            max_gap_seconds=gen_meta.get("max_gap_seconds", DEFAULT_MAX_GAP_SECONDS),
            sampling_interval_seconds=gen_meta.get("sampling_interval_seconds", DEFAULT_SAMPLING_INTERVAL_SECONDS),
            preprocessor=preprocessor,
        )

        inst.X_raw = data["X_raw"]
        inst.X_normalized = data["X_normalized"]
        inst.timestamps = data["timestamps"]
        inst.validity_mask = data["validity_mask"]
        inst.generation_meta = gen_meta

        # Reconstruct targets
        inst.targets = {t: {} for t in TARGET_COLUMNS}
        for t in TARGET_COLUMNS:
            for h in HORIZONS_MAP.keys():
                key = f"target_{t}_{h}"
                if key in data:
                    inst.targets[t][h] = data[key]

        return inst
