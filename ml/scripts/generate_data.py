import os
import numpy as np
import pandas as pd

np.random.seed(42)

DATA_DIR = "ml/data"
os.makedirs(DATA_DIR, exist_ok=True)

print(">>> Generating dual-host telemetry dataset (Ubuntu & Kali)...")
n_samples = 10080  # 7 days at 1-min intervals
timestamps = pd.date_range("2026-08-15 00:00:00", periods=n_samples, freq="min")

# Ubuntu profile (steady workload)
ubuntu_cpu = 15.0 + 5.0 * np.sin(np.linspace(0, 50, n_samples)) + np.random.normal(0, 1.5, n_samples)
ubuntu_mem = 45.0 + 2.0 * np.cos(np.linspace(0, 30, n_samples)) + np.random.normal(0, 0.5, n_samples)
ubuntu_load = 0.5 + 0.2 * np.sin(np.linspace(0, 50, n_samples)) + np.random.normal(0, 0.05, n_samples)

df_ubuntu = pd.DataFrame({
    "timestamp": timestamps,
    "host": "ubuntu",
    "cpu": np.clip(ubuntu_cpu, 0, 100),
    "memory": np.clip(ubuntu_mem, 0, 100),
    "load_1m": np.clip(ubuntu_load, 0, 16),
    "load_5m": np.clip(ubuntu_load * 0.95, 0, 16),
    "load_15m": np.clip(ubuntu_load * 0.90, 0, 16),
    "network_rx": np.random.exponential(50000, n_samples),
    "network_tx": np.random.exponential(70000, n_samples),
    "disk_read": np.random.exponential(10000, n_samples),
    "disk_write": np.random.exponential(15000, n_samples),
    "process_count": np.random.randint(110, 130, n_samples),
    "iowait": np.random.uniform(0.1, 1.2, n_samples)
})

# Kali profile (bursty security testing)
kali_cpu = 25.0 + 15.0 * np.sin(np.linspace(0, 100, n_samples)) + np.random.normal(0, 4.0, n_samples)
kali_mem = 60.0 + 8.0 * np.sin(np.linspace(0, 70, n_samples)) + np.random.normal(0, 1.0, n_samples)
kali_load = 1.2 + 0.8 * np.sin(np.linspace(0, 100, n_samples)) + np.random.normal(0, 0.15, n_samples)

df_kali = pd.DataFrame({
    "timestamp": timestamps,
    "host": "kali",
    "cpu": np.clip(kali_cpu, 0, 100),
    "memory": np.clip(kali_mem, 0, 100),
    "load_1m": np.clip(kali_load, 0, 16),
    "load_5m": np.clip(kali_load * 0.95, 0, 16),
    "load_15m": np.clip(kali_load * 0.90, 0, 16),
    "network_rx": np.random.exponential(150000, n_samples),
    "network_tx": np.random.exponential(200000, n_samples),
    "disk_read": np.random.exponential(30000, n_samples),
    "disk_write": np.random.exponential(45000, n_samples),
    "process_count": np.random.randint(140, 190, n_samples),
    "iowait": np.random.uniform(0.5, 3.5, n_samples)
})

df_combined = pd.concat([df_ubuntu, df_kali], ignore_index=True)
csv_path = os.path.join(DATA_DIR, "host_telemetry.csv")
df_combined.to_csv(csv_path, index=False)
print(f"Generated {len(df_combined)} telemetry samples saved to {csv_path}")
