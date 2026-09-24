"""
Unit Tests for BDH Sequence Dataset Foundation (Ubuntu Telemetry)
"""

import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd

from ml.bdh.config import (
    CANONICAL_HOST,
    FEATURE_COLUMNS,
    validate_host,
)
from ml.bdh.dataset import create_sequence_windows, BDHSequenceDataset
from ml.bdh.preprocessor import BDHPreprocessor


def generate_synthetic_telemetry(
    n_samples: int = 150,
    host: str = CANONICAL_HOST,
    step_seconds: int = 30,
    gap_after_step: int | None = None,
    gap_duration_seconds: int = 300,
) -> pd.DataFrame:
    """Helper function to construct synthetic telemetry DataFrames with known timestamps."""
    start_time = pd.Timestamp("2026-09-13 00:00:00", tz="UTC")
    timestamps = []

    curr_time = start_time
    for i in range(n_samples):
        if gap_after_step is not None and i == gap_after_step:
            curr_time += pd.Timedelta(seconds=gap_duration_seconds)
        else:
            curr_time += pd.Timedelta(seconds=step_seconds)
        timestamps.append(curr_time)

    data = {
        "timestamp": timestamps,
        "host": host,
        "cpu": np.random.uniform(10, 90, n_samples),
        "memory": np.random.uniform(20, 80, n_samples),
        "disk": np.random.uniform(30, 70, n_samples),
        "swap": np.random.uniform(0, 10, n_samples),
        "load_1m": np.random.uniform(0.1, 4.0, n_samples),
        "load_5m": np.random.uniform(0.1, 3.5, n_samples),
        "load_15m": np.random.uniform(0.1, 3.0, n_samples),
        "network_rx": np.random.exponential(100000, n_samples),
        "network_tx": np.random.exponential(50000, n_samples),
        "disk_read": np.random.exponential(20000, n_samples),
        "disk_write": np.random.exponential(15000, n_samples),
        "process_count": np.random.randint(100, 200, n_samples),
        "iowait": np.random.uniform(0, 5, n_samples),
        "uptime": np.linspace(1000, 1000 + n_samples * 30, n_samples),
    }
    return pd.DataFrame(data)


class TestBDHDatasetFoundation(unittest.TestCase):

    def test_host_validation(self):
        """Verify host validation allows 'ubuntu' and rejects unsupported host labels."""
        self.assertEqual(validate_host("ubuntu"), "ubuntu")
        self.assertEqual(validate_host("100.108.160.2"), "ubuntu")

        with self.assertRaises(ValueError):
            validate_host("kali")

        with self.assertRaises(ValueError):
            validate_host("unknown_server")

    def test_feature_ordering_and_shape(self):
        """Verify feature ordering maps deterministically to 14 canonical columns and correct tensor shape."""
        df = generate_synthetic_telemetry(n_samples=100)
        res = create_sequence_windows(df, sequence_length=60, stride=1)

        X = res["X"]
        self.assertEqual(X.ndim, 3)
        N, T, D = X.shape
        self.assertEqual(T, 60)
        self.assertEqual(D, 14)
        self.assertEqual(N, 100 - 60 + 1)  # 41 windows for 100 samples with stride 1

        # Check feature value consistency for first sample at step 0
        first_row_cpu = df["cpu"].iloc[0]
        self.assertAlmostEqual(X[0, 0, 0], np.float32(first_row_cpu), places=4)

    def test_sequence_lengths(self):
        """Verify sequence construction supports T=30, T=60, T=120 without code changes."""
        df = generate_synthetic_telemetry(n_samples=200)

        for T in [30, 60, 120]:
            res = create_sequence_windows(df, sequence_length=T, stride=1)
            X = res["X"]
            self.assertEqual(X.shape[1], T)
            self.assertEqual(X.shape[2], 14)
            self.assertEqual(X.shape[0], 200 - T + 1)

    def test_chronological_ordering(self):
        """Verify unordered input DataFrames are automatically sorted chronologically before windowing."""
        df = generate_synthetic_telemetry(n_samples=100)
        df_shuffled = df.sample(frac=1.0, random_state=42).reset_index(drop=True)

        res_orig = create_sequence_windows(df, sequence_length=60)
        res_shuffled = create_sequence_windows(df_shuffled, sequence_length=60)

        np.testing.assert_array_almost_equal(res_orig["X"], res_shuffled["X"])
        np.testing.assert_array_equal(res_orig["timestamps"], res_shuffled["timestamps"])

    def test_gap_detection(self):
        """Verify large timestamp gaps (>90s) prevent bridging and split continuous segments."""
        # 100 samples total, but a 10-minute gap after sample index 40
        df = generate_synthetic_telemetry(
            n_samples=100,
            gap_after_step=40,
            gap_duration_seconds=600,
        )

        res = create_sequence_windows(df, sequence_length=30, max_gap_seconds=90)
        X = res["X"]
        # Segment 1: 41 samples (index 0..40) -> 41 - 30 + 1 = 12 windows
        # Segment 2: 59 samples (index 41..99) -> 59 - 30 + 1 = 30 windows
        # Total expected windows = 12 + 30 = 42 windows
        self.assertEqual(X.shape[0], 42)

    def test_insufficient_data(self):
        """Verify data with fewer samples than sequence_length T returns 0 windows cleanly."""
        df = generate_synthetic_telemetry(n_samples=20)
        res = create_sequence_windows(df, sequence_length=60)

        X = res["X"]
        self.assertEqual(X.shape[0], 0)
        self.assertEqual(X.shape[1], 60)
        self.assertEqual(X.shape[2], 14)

    def test_preprocessor_and_npz_serialization(self):
        """Verify BDHSequenceDataset builds, transforms, and round-trips via .npz storage."""
        df = generate_synthetic_telemetry(n_samples=80)
        dataset = BDHSequenceDataset(host="ubuntu", sequence_length=30)
        dataset.build_from_dataframe(df)

        self.assertEqual(dataset.X_raw.shape, (51, 30, 14))
        self.assertEqual(dataset.X_normalized.shape, (51, 30, 14))
        self.assertEqual(dataset.validity_mask.shape, (51, 30))

        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = Path(tmpdir) / "test_ubuntu_seq30.npz"
            dataset.save_npz(out_file)
            self.assertTrue(out_file.exists())

            loaded_ds = BDHSequenceDataset.load_npz(out_file)
            self.assertEqual(loaded_ds.host, "ubuntu")
            self.assertEqual(loaded_ds.sequence_length, 30)
            np.testing.assert_array_almost_equal(loaded_ds.X_raw, dataset.X_raw)
            np.testing.assert_array_almost_equal(loaded_ds.X_normalized, dataset.X_normalized)
            np.testing.assert_array_equal(loaded_ds.timestamps, dataset.timestamps)


if __name__ == "__main__":
    unittest.main()
