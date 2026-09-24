# BDH Dataset Pipeline — Technical Architecture & Reference Guide

This document describes the sequence dataset foundation for the **BDH Intelligence / ML** workstream (Member 1). The pipeline converts historical **Ubuntu server telemetry** into standardized multivariate time-series sequence tensors `[N, T, 14]` suitable for future BDH forecasting and anomaly detection models.

---

## 1. System Overview

```text
Ubuntu Telemetry (30s sampling)
             ↓
VictoriaMetrics / PostgreSQL DB
             ↓
ml/bdh/fetcher.py (fetch_ubuntu_telemetry_history)
             ↓
ml/bdh/dataset.py (create_sequence_windows)
  - Chronological sorting
  - Segment gap detection (>90s)
  - Sliding window construction [N, T, 14]
             ↓
ml/bdh/preprocessor.py (BDHPreprocessor)
  - log1p transform on throughput
  - RobustScaler normalization
             ↓
.npz Archive Output (ml/data/bdh_datasets/ubuntu_seq60.npz)
```

---

## 2. Canonical Telemetry Feature Schema (14 Dimensions)

The BDH dataset pipeline uses a **deterministic feature ordering**. All exported sequence tensors `[N, T, 14]` map features to index positions as follows:

| Feature Index | Feature Name | PromQL Name | Data Type | Units / Range | Normalization Strategy |
|---|---|---|---|---|---|
| `0` | `cpu` | `server_cpu_usage_percent` | `float32` | 0.0 – 100.0% | `RobustScaler` |
| `1` | `memory` | `server_memory_usage_percent` | `float32` | 0.0 – 100.0% | `RobustScaler` |
| `2` | `disk` | `server_disk_usage_percent` | `float32` | 0.0 – 100.0% | `RobustScaler` |
| `3` | `swap` | `server_swap_usage_percent` | `float32` | 0.0 – 100.0% | `RobustScaler` |
| `4` | `load_1m` | `server_load_1m` | `float32` | load units | `RobustScaler` |
| `5` | `load_5m` | `server_load_5m` | `float32` | load units | `RobustScaler` |
| `6` | `load_15m` | `server_load_15m` | `float32` | load units | `RobustScaler` |
| `7` | `network_rx` | `server_network_rx_bytes_per_second` | `float32` | Bytes/sec | `log1p` + `RobustScaler` |
| `8` | `network_tx` | `server_network_tx_bytes_per_second` | `float32` | Bytes/sec | `log1p` + `RobustScaler` |
| `9` | `disk_read` | `server_disk_read_bytes_per_second` | `float32` | Bytes/sec | `log1p` + `RobustScaler` |
| `10` | `disk_write` | `server_disk_write_bytes_per_second` | `float32` | Bytes/sec | `log1p` + `RobustScaler` |
| `11` | `process_count` | `server_process_count` | `float32` | count | `RobustScaler` |
| `12` | `iowait` | `server_cpu_iowait_percent` | `float32` | 0.0 – 100.0% | `RobustScaler` |
| `13` | `uptime` | `server_uptime_seconds` | `float32` | seconds | `RobustScaler` |

---

## 3. Sequence Construction & Temporal Gap Policy

### Sampling & Window Configuration
- **Sampling Interval:** 30 seconds.
- **Configurable Sequence Length ($T$):**
  - $T=30 \rightarrow$ 15 minutes context window.
  - $T=60 \rightarrow$ 30 minutes context window (Default).
  - $T=120 \rightarrow$ 60 minutes context window.

### Gap Detection Policy
1. Samples are sorted chronologically by timestamp ascending.
2. Consecutive timestamp deltas $\Delta t_i = t_i - t_{i-1}$ are evaluated.
3. If $\Delta t_i > 90$ seconds ($> 3$ missed samples), a **gap boundary** is declared.
4. Telemetry is partitioned into contiguous segments.
5. Sequence windows of length $T$ are constructed **only within continuous segments**.
6. Sliding windows **never bridge across server offline/downtime gaps**.

### Validity Mask & Timestamps
- `timestamps`: `[N, T]` array of ISO 8601 UTC timestamp strings.
- `validity_mask`: `[N, T]` boolean array (`True` for real observations).

---

## 4. Preprocessing & Normalization Interface (`BDHPreprocessor`)

The dataset layer includes a serializable preprocessor (`ml/bdh/preprocessor.py`):

```python
from ml.bdh.preprocessor import BDHPreprocessor

preprocessor = BDHPreprocessor()
preprocessor.fit(df)
X_norm = preprocessor.transform(X_raw)

# Serialization
meta_dict = preprocessor.to_dict()
reconstructed_prep = BDHPreprocessor.from_dict(meta_dict)
```

- **Heavy-Tailed Features (`network_rx`, `network_tx`, `disk_read`, `disk_write`):** Applies $\ln(1 + \max(0, x))$.
- **Robust Scaling:** Applies `RobustScaler` across all 14 feature channels.
- **Reversibility:** Reverses scaling via `inverse_transform(X_norm)`.

---

## 5. Output Data Format (`.npz`)

The exporter saves a compressed NumPy `.npz` archive containing:

```text
.npz Archive
├── X_raw                    [N, T, 14] float32  (Unscaled telemetry tensor)
├── X_normalized             [N, T, 14] float32  (Normalized telemetry tensor)
├── timestamps               [N, T] string       (UTC timestamp grid)
├── validity_mask            [N, T] bool         (Observation validity grid)
├── target_cpu_5m            [N] float32         (Future target value)
├── target_cpu_15m           [N] float32
├── target_memory_5m         [N] float32
├── ...
└── metadata_json            string              (JSON string containing preprocessor & generation metadata)
```

---

## 6. CLI Exporter Usage

Export 7 days of Ubuntu telemetry into sequence windows of length $T=60$:

```bash
python -m ml.scripts.export_bdh_dataset \
    --host ubuntu \
    --sequence-length 60 \
    --lookback-days 7 \
    --stride 1 \
    --output ml/data/bdh_datasets/ubuntu_seq60.npz
```

### CLI Options

| Flag | Short | Default | Description |
|---|---|---|---|
| `--host` | | `ubuntu` | Monitored host target. Must be `ubuntu`. |
| `--sequence-length` | `-t` | `60` | Window length $T$ in 30s steps. |
| `--lookback-days` | | `7` | Historical lookback window in days. |
| `--stride` | | `1` | Sliding window step stride. |
| `--output` | `-o` | `ml/data/bdh_datasets/ubuntu_seq<T>.npz` | Target `.npz` export path. |
| `--vm-url` | | `http://localhost:8428` | VictoriaMetrics URL. |

---

## 7. Future BDH Model Binding Strategy

The exported dataset foundation is designed for seamless attachment of dual heads in future phases:

### Forecasting Head Attachment
```text
X_normalized [N, T, 14]  →  BDH Encoder  →  Latent State Z [N, 128]  →  Forecast Head  →  Y_pred [N, 3, 5]
```
Forecast targets (`cpu`, `memory`, `load_1m` at `5m`, `15m`, `30m`, `1h`, `3h`) are pre-computed in `dataset.targets`.

### Anomaly Head Attachment
```text
X_normalized [N, T, 14]  →  BDH Encoder  →  Latent State Z [N, 128]  →  Anomaly Head  →  Reconstruction Error / Residual
```
Anomaly detection can evaluate sequence reconstruction residual $|X - \hat{X}|$ or latent space Mahalanobis distance.
