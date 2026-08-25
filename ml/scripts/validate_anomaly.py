import os
import pandas as pd
from sklearn.ensemble import IsolationForest

DATA_PATH = "ml/data/host_telemetry.csv"
print(">>> [Phase 8] Validating Host-Aware Isolation Forest Anomaly Detection...")
df = pd.read_csv(DATA_PATH)

feature_cols = [
    "cpu", "memory", "load_1m", "load_5m", "load_15m",
    "network_rx", "network_tx", "disk_read", "disk_write",
    "process_count", "iowait"
]

for host_name in ["ubuntu", "kali"]:
    df_host = df[df["host"] == host_name]
    iso = IsolationForest(contamination=0.03, random_state=42)
    iso.fit(df_host[feature_cols])
    scores = iso.score_samples(df_host[feature_cols].iloc[:10])
    print(f"Host '{host_name}': Model fitted on {len(df_host)} observations across {len(feature_cols)} features.")
    print(f"Sample anomaly scores for {host_name}: {[round(float(s), 3) for s in scores[:3]]}")

print("\n=== PHASE 8 EVALUATION COMPLETE ===")
