import os
import sys
import numpy as np
import pandas as pd

# Add project root to python path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml.scripts.train_anomaly import train_anomaly_pipeline, ANOMALY_FEATURES
from ml.anomaly import AnomalyDetector

# Synthetic Offline Test Scenarios
SYNTHETIC_SCENARIOS = [
    {
        "scenario": "01_NORMAL_BASELINE",
        "data": {
            "cpu": 2.1,
            "memory": 47.5,
            "load_1m": 0.18,
            "load_5m": 0.20,
            "load_15m": 0.22,
            "network_rx": 1200.0,
            "network_tx": 2400.0,
            "disk_read": 0.0,
            "disk_write": 4096.0,
            "process_count": 125,
            "iowait": 0.0
        }
    },
    {
        "scenario": "02_CPU_SPIKE",
        "data": {
            "cpu": 96.5,
            "memory": 48.0,
            "load_1m": 4.50,
            "load_5m": 2.10,
            "load_15m": 1.05,
            "network_rx": 1500.0,
            "network_tx": 3000.0,
            "disk_read": 0.0,
            "disk_write": 8192.0,
            "process_count": 140,
            "iowait": 0.2
        }
    },
    {
        "scenario": "03_MEMORY_SPIKE",
        "data": {
            "cpu": 4.5,
            "memory": 98.2,
            "load_1m": 0.85,
            "load_5m": 0.60,
            "load_15m": 0.40,
            "network_rx": 2000.0,
            "network_tx": 4000.0,
            "disk_read": 0.0,
            "disk_write": 1024.0,
            "process_count": 180,
            "iowait": 0.0
        }
    },
    {
        "scenario": "04_LOAD_SPIKE",
        "data": {
            "cpu": 15.0,
            "memory": 52.0,
            "load_1m": 14.80,
            "load_5m": 8.50,
            "load_15m": 4.20,
            "network_rx": 3000.0,
            "network_tx": 5000.0,
            "disk_read": 0.0,
            "disk_write": 2048.0,
            "process_count": 380,
            "iowait": 0.5
        }
    },
    {
        "scenario": "05_NETWORK_SPIKE",
        "data": {
            "cpu": 8.0,
            "memory": 50.0,
            "load_1m": 0.45,
            "load_5m": 0.35,
            "load_15m": 0.25,
            "network_rx": 85000000.0, # ~85 MB/s
            "network_tx": 45000000.0,
            "disk_read": 0.0,
            "disk_write": 1024.0,
            "process_count": 130,
            "iowait": 0.0
        }
    },
    {
        "scenario": "06_DISK_IO_SPIKE",
        "data": {
            "cpu": 12.0,
            "memory": 55.0,
            "load_1m": 1.20,
            "load_5m": 0.80,
            "load_15m": 0.50,
            "network_rx": 2000.0,
            "network_tx": 3000.0,
            "disk_read": 45000000.0,
            "disk_write": 120000000.0, # ~120 MB/s
            "process_count": 135,
            "iowait": 28.5
        }
    },
    {
        "scenario": "07_COMBINED_EXTREME_PRESSURE",
        "data": {
            "cpu": 99.2,
            "memory": 96.8,
            "load_1m": 22.50,
            "load_5m": 16.20,
            "load_15m": 11.00,
            "network_rx": 120000000.0,
            "network_tx": 95000000.0,
            "disk_read": 80000000.0,
            "disk_write": 150000000.0,
            "process_count": 520,
            "iowait": 42.0
        }
    }
]


def create_mock_training_set(num_samples=300):
    """
    Generates a small in-memory mock dataframe matching target feature distributions
    if real telemetry.csv is not present locally on Mac.
    """
    np.random.seed(42)
    data = {
        "cpu": np.random.exponential(scale=2.0, size=num_samples),
        "memory": np.random.normal(loc=47.5, scale=3.0, size=num_samples),
        "load_1m": np.random.exponential(scale=0.2, size=num_samples),
        "load_5m": np.random.exponential(scale=0.2, size=num_samples),
        "load_15m": np.random.exponential(scale=0.2, size=num_samples),
        "network_rx": np.random.exponential(scale=5000.0, size=num_samples),
        "network_tx": np.random.exponential(scale=8000.0, size=num_samples),
        "disk_read": np.where(np.random.rand(num_samples) > 0.8, np.random.exponential(10000), 0.0),
        "disk_write": np.where(np.random.rand(num_samples) > 0.7, np.random.exponential(20000), 0.0),
        "process_count": np.random.randint(110, 140, size=num_samples).astype(float),
        "iowait": np.where(np.random.rand(num_samples) > 0.7, np.random.exponential(0.5), 0.0)
    }
    return pd.DataFrame(data)


def run_sanity_test():
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'models', 'anomaly')
    model_file = os.path.join(model_dir, "isolation_forest.joblib")

    # If model is not trained yet, train on mock in-memory data for sanity check
    if not os.path.exists(model_file):
        print("[SANITY TEST] Model file not found. Generating temporary in-memory training set for validation...")
        mock_df = create_mock_training_set()
        train_anomaly_pipeline(mock_df, model_dir)

    detector = AnomalyDetector()

    print("==========================================================================================")
    print("ISOLATION FOREST ANOMALY DETECTION — SYNTHETIC SANITY TEST REPORT")
    print("==========================================================================================")
    print(f"{'SCENARIO':<32} | {'SCORE':<8} | {'IS_ANOMALY':<10} | {'SEVERITY':<10}")
    print("------------------------------------------------------------------------------------------")

    for item in SYNTHETIC_SCENARIOS:
        name = item["scenario"]
        obs = item["data"]
        result = detector.score_telemetry(obs)

        score_str = f"{result['anomaly_score']:.4f}"
        anom_str = "TRUE" if result["is_anomaly"] else "FALSE"
        sev_str = result["severity"]

        print(f"{name:<32} | {score_str:<8} | {anom_str:<10} | {sev_str:<10}")

    print("==========================================================================================")
    print("Sanity test complete.")


if __name__ == '__main__':
    run_sanity_test()
