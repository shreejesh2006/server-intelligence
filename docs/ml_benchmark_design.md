# NOKIA Server Intelligence — Common ML Benchmark & Evaluation Framework

**Workstream:** BDH & Hybrid Intelligence (Member 1)  
**Phase:** 2A — Common Model Benchmark Foundation  
**Host Target:** `ubuntu` ONLY (Active monitored production host)  
**Status:** Architecture & Framework Specification  

---

## 1. Objective & Scope

The purpose of this framework is to establish a **rigorous, unified experimental benchmark** for evaluating and comparing diverse model families in the NOKIA Server Intelligence Platform.

Rather than assuming a single neural network architecture (e.g. BDH) will solve all intelligence tasks, this framework enables objective empirical comparison across candidate model families:

- **Baseline:** `Persistence` (Trivial current-value baseline)
- **Production Baseline (Classical):** `HistGradientBoostingRegressor` (HGB) & `IsolationForest`
- **Foundation / Pretrained Time-Series:** `TTM` (Tiny Time Mixer) zero-shot / few-shot
- **Lightweight Sequence / SSM:** `Tiny Mamba` / State Space Models
- **Recurrent / Block-Diagonal Research:** `BDH` (Block-Diagonal Hierarchy)
- **Hybrid Architectures:** `HGB + Residual` (e.g. `HGB + TTM`, `HGB + Mamba`, `HGB + BDH`)

---

## 2. Common Experiment Data Contract

All candidate models in the benchmark consume a standardized dataset representation derived from `ml/bdh/dataset.py` (`ubuntu_seq60_verified.npz`).

### 2.1 Input Data Specification

```text
Input Context Window: X_raw / X_norm ∈ ℝ^[N × T × D]
```

- **Host Target:** `ubuntu`
- **Sequence Length ($T$):** 60 steps (30 minutes of history at 30-second sampling resolution). Supports $T \in \{30, 60, 120\}$.
- **Feature Dimension ($D$):** 14 canonical telemetry features in deterministic order:

```python
FEATURE_COLUMNS = [
    "cpu",           # Index 0:  CPU Usage %
    "memory",        # Index 1:  Memory Usage %
    "disk",          # Index 2:  Disk Usage %
    "swap",          # Index 3:  Swap Usage %
    "load_1m",       # Index 4:  1-minute Load Average
    "load_5m",       # Index 5:  5-minute Load Average
    "load_15m",      # Index 6:  15-minute Load Average
    "network_rx",    # Index 7:  Network RX Bytes/sec (log1p transformed)
    "network_tx",    # Index 8:  Network TX Bytes/sec (log1p transformed)
    "disk_read",     # Index 9:  Disk Read Bytes/sec (log1p transformed)
    "disk_write",    # Index 10: Disk Write Bytes/sec (log1p transformed)
    "process_count", # Index 11: Process Count
    "iowait",        # Index 12: CPU I/O Wait %
    "uptime",        # Index 13: Uptime Seconds
]
```

- **Auxiliary Tensor Grids:**
  - `timestamps` $\in \text{str}^{N \times T}$: UTC ISO 8601 timestamps for every step.
  - `validity_mask` $\in \text{bool}^{N \times T}$: `True` for actual observed samples, `False` for interpolated steps.

### 2.2 Target Specification

Production forecasting targets and horizons (at 30-second sampling interval):

- **Target Metrics ($M=3$):** `cpu`, `memory`, `load_1m`
- **Forecast Horizons ($H=5$):**
  - `5m`  $\rightarrow 10$ steps ahead
  - `15m` $\rightarrow 30$ steps ahead
  - `30m` $\rightarrow 60$ steps ahead
  - `1h`  $\rightarrow 120$ steps ahead
  - `3h`  $\rightarrow 360$ steps ahead

Target ground-truth tensor: $Y \in \mathbb{R}^{N \times M \times H}$.

---

## 3. Target Generation & Multi-Horizon Mechanisms

The target generation mechanism (`ml/bdh/dataset.py`) attaches multi-horizon targets directly to each context window end $t_{\text{end}} = i + T - 1$:

1. **Direct Multi-Horizon Forecasting:**
   For a window ending at step $t_{\text{end}}$, target value for metric $m$ at horizon $h$ is:
   $$y_{m, h} = x_{m, t_{\text{end}} + \text{steps}(h)}$$
2. **Segment Boundary Safety:**
   If $t_{\text{end}} + \text{steps}(h)$ crosses a continuous segment boundary (e.g. server downtime gap), $y_{m, h}$ is set to `NaN` and excluded from loss/metric computation.
3. **Extensibility:**
   Target generation supports expanding beyond CPU/memory/load to secondary metrics (`network_rx`, `disk_write`, `process_count`) without altering window construction.

---

## 4. Leakage-Safe Chronological Splitting Policy

### 4.1 Data Leakage Hazard in Overlapping Sequences
With sliding window `stride=1`, window $i$ ($t_0 \dots t_{59}$) and window $i+1$ ($t_1 \dots t_{60}$) share 59 out of 60 observations (98.3% overlap).  
**Randomly splitting overlapping windows across train/val/test splits causes catastrophic temporal data leakage.**

### 4.2 Leakage-Safe Block Split Algorithm
1. **Contiguous Segment Partitioning:** Telemetry is split into continuous time blocks.
2. **Chronological Block Split:**
   - **Train:** First 70% of continuous time
   - **Validation:** Next 15% of continuous time
   - **Test:** Final 15% of continuous time
3. **Safety Purging Buffer:** A buffer zone of $T + H_{\text{max}} = 60 + 360 = 420$ steps (3.5 hours) is purged between train/val/test boundaries so no train window context or target overlaps with validation/test evaluations.

### 4.3 Data Sufficiency Audit
- Current dataset size: **890 raw samples (6.4 hours)** $\rightarrow 772$ overlapping windows.
- **Statistical Viability Assessment:** The current 6.4-hour dataset is **statistically INSUFFICIENT for chronological train/validation/test generalization splits**. Attempting a 70/15/15 split on 6 hours would yield test blocks spanning less than 50 minutes, which cannot evaluate diurnal or multi-day performance.

---

## 5. Model Adapter Interface Specification

All candidate model implementations must wrap their internal logic inside a standardized `BaseModelAdapter` interface:

```python
class BaseModelAdapter:
    """Common Adapter Interface for Benchmark Models."""
    
    def fit(self, train_dataset: dict, val_dataset: dict | None = None) -> dict:
        """Fits model on normalized training sequence windows."""
        raise NotImplementedError

    def predict(self, context_window: np.ndarray) -> dict:
        """
        Input: context_window [B, T, D]
        Output: dict containing predictions per target and horizon:
                { "cpu": {"5m": array[B], ...}, "memory": ..., "load_1m": ... }
        """
        raise NotImplementedError

    def save(self, model_path: str) -> None:
        """Serializes model artifacts."""
        raise NotImplementedError

    def load(self, model_path: str) -> None:
        """Deserializes model artifacts."""
        raise NotImplementedError
```

### Implemented Benchmark Adapters (`ml/bdh/adapters.py`)
- `BaseModelAdapter`: Framework-independent abstract base class defining `fit()`, `predict()`, `predict_tensor()`, `save()`, `load()`.
- `PersistenceAdapter`: Implemented. Returns latest observed target value $x_{m, t_{\text{end}}}$ at step $T-1$ for all 5 horizons. Supports 3D tensor output $[N, 3, 5]$.
- `HGBAdapter`: Implemented. Benchmark-only wrapper for 15 independent `HistGradientBoostingRegressor(random_state=42)` models (3 targets × 5 horizons), extracting 15 tabular features per window. Serializes via `save()`/`load()`.

### Feasibility Assessment: TTM (Tiny Time Mixer) — Phase 3A Audit
- **Status:** **BLOCKED (Stop Condition Triggered)**
- **Dependency Audit:** `torch`, `transformers`, and `tsfm_public` are not installed in the environment.
- **Context Length Mismatch:** Standard TTM pretrained checkpoints (`ttm-1m-512-96`) expect context length $T=512$, whereas the benchmark uses $T=60$ (30 minutes).
- **Horizon Mismatch Blocker:** Standard TTM pretrained checkpoints output maximum $H=96$ or $H=192$ steps, failing to natively support the required 3-hour horizon ($H=360$ steps at 30s sampling).
- **Multivariate Dynamics:** TTM uses Channel Independence (CI), processing each channel in isolation without cross-channel attention.
- **Mamba / BDH Candidate:** Lightweight Mamba / BDH state space models remain the primary candidates for sequence learning when PyTorch dependencies are introduced.

---

## 6. Hybrid Architecture Framework

The framework supports evaluating hybrid residual pipelines:

$$\hat{y}_{\text{hybrid}} = \hat{y}_{\text{HGB}} + \hat{r}_{\text{Neural}}$$

Where:
- $\hat{y}_{\text{HGB}}$ provides a stable, interpretable classical baseline prediction.
- $\hat{r}_{\text{Neural}}$ (from TTM, Mamba, or BDH) models fine-grained non-linear residual dynamics:
  $$r = y_{\text{actual}} - \hat{y}_{\text{HGB}}$$

This ensures the system never performs worse than the production HGB baseline.

---

## 7. Comprehensive Evaluation Metrics

### 7.1 Accuracy & Error Metrics (Per-Target, Per-Horizon)

1. **Mean Absolute Error (MAE):**
   $$\text{MAE}_{m, h} = \frac{1}{N} \sum_{i=1}^N |y_{i, m, h} - \hat{y}_{i, m, h}|$$
2. **Root Mean Squared Error (RMSE):**
   $$\text{RMSE}_{m, h} = \sqrt{\frac{1}{N} \sum_{i=1}^N (y_{i, m, h} - \hat{y}_{i, m, h})^2}$$
3. **Mean Absolute Scaled Error (MASE):**
   Scale-independent metric comparing model MAE against in-sample 1-step naive persistence MAE:
   $$\text{MASE}_{m, h} = \frac{\text{MAE}_{m, h}}{\frac{1}{N-1} \sum_{i=2}^N |x_{i, m} - x_{i-1, m}|}$$

### 7.2 System & Operational Metrics

| Metric | Target / Limit | Description |
|---|---|---|
| **Inference Latency (P50 / P95 / P99)** | **$< 50$ ms** | Per-window inference latency in milliseconds |
| **Peak Memory (RAM RSS)** | **$< 256$ MB** | Peak Resident Set Size during batch inference |
| **Model Footprint** | **$< 50$ MB** | Disk size of serialized model artifact |
| **Cold Start Load Time** | **$< 1000$ ms** | Time required to deserialize model from disk to RAM |
| **Inference Throughput** | **$> 100$ req/sec** | Windows scored per second |

---

## 8. Regime-Segmented Evaluation

To determine which model family performs best under specific server workloads, evaluation results will be segmented by operational regime:

- **IDLE:** CPU $< 15\%$, Load 1m $< 0.5$, Low I/O
- **NORMAL:** CPU $15\% - 70\%$, Load 1m $0.5 - 2.0$
- **CPU-BOUND:** CPU $> 85\%$ sustained
- **MEMORY-PRESSURE:** Memory $> 85\%$, Swap $> 20\%$
- **IO-BOUND:** CPU I/O Wait $> 10\%$, Disk Read/Write $> 50$ MB/s
- **NETWORK-BURST:** Network RX/TX $> 100$ MB/s
- **BURST:** Rapid load delta $\Delta \text{load\_1m} > 1.0$ in $< 2$ minutes

*Note: Ground-truth regime labels will be supplied dynamically via telemetry threshold tagging during evaluation.*

---

## 9. Machine-Readable Experiment Result Schema (`JSON`)

All benchmark runs will export standardized JSON reports:

```json
{
  "experiment_id": "exp_20260913_hgb_vs_bdh",
  "timestamp": "2026-09-13T22:55:00Z",
  "host": "ubuntu",
  "dataset": "ubuntu_seq60_verified.npz",
  "model_family": "bdh",
  "adapter": "BDHAdapter",
  "parameters": {
    "sequence_length": 60,
    "hidden_dim": 128,
    "stride": 1
  },
  "metrics": {
    "cpu": {
      "5m": {"mae": 1.42, "rmse": 2.10, "mase": 0.85},
      "15m": {"mae": 2.15, "rmse": 3.05, "mase": 0.88},
      "30m": {"mae": 3.10, "rmse": 4.20, "mase": 0.91},
      "1h": {"mae": 4.50, "rmse": 6.10, "mase": 0.95},
      "3h": {"mae": 6.20, "rmse": 8.40, "mase": 0.98}
    },
    "memory": { ... },
    "load_1m": { ... }
  },
  "system_metrics": {
    "latency_p50_ms": 4.2,
    "latency_p95_ms": 8.5,
    "latency_p99_ms": 14.1,
    "peak_rss_mb": 42.5,
    "model_size_mb": 3.8,
    "cold_start_ms": 120.0,
    "throughput_samples_per_sec": 238.0
  },
  "data_sufficiency_gate_passed": false
}
```

---

## 10. Master Experiment Matrix

| Candidate Model | Architectural Purpose | Input Tensor | Target Output | Primary Strengths | System Footprint |
|---|---|---|---|---|---|
| **Persistence** | Trivial Baseline | $x_{m, t_{\text{end}}}$ | Single point | 0 ms latency, 0 MB memory | 0 MB |
| **HistGradientBoosting** | Production Classical Baseline | 15 tabular features | 1 point per horizon | Fast CPU fit, interpretable, robust tabular accuracy | ~1.5 MB per host |
| **TTM (Tiny Time Mixer)** | Foundation Pretrained | $[B, 60, 14]$ | $[B, M, H]$ | Pretrained zero-shot generalization across workloads | ~5–15 MB |
| **Tiny Mamba / SSM** | State Space Sequence | $[B, 60, 14]$ | $[B, M, H]$ | Linear $O(T)$ complexity, strong long-context tracking | ~10–20 MB |
| **BDH** | Recurrent Block-Diagonal | $[B, 60, 14]$ | $[B, M, H]$ | Structured latent space, dual forecasting & anomaly heads | ~5–15 MB |
| **HGB + TTM Residual** | Hybrid Classical + Neural | Tabular + Sequence | Base + Residual | Guaranteed baseline safety + non-linear residual boost | ~15 MB |

---

## 11. Data Sufficiency Gate & Scientific Validation Rules

To prevent premature conclusions or overfitting, experiments are strictly gated by data volume:

### ✅ Scientifically VALID Right Now (Current 772 Windows / 6.4h Dataset)
- Pipeline validation & tensor shape verification.
- Model forward-pass sanity checks.
- System metrics (P50/P95 latency, Peak RSS RAM, model size).
- Pretrained zero-shot evaluation (TTM zero-shot inference).
- Persistence baseline evaluation.
- Existing production HGB evaluation on available telemetry.

### 🛑 NOT Scientifically Valid Yet (Requires 7 to 30 Days of Telemetry)
- Training Mamba or BDH neural models **from scratch**.
- Claiming production generalization or final model selection across model families.
- Diurnal/weekly regime shift evaluation.

---

## 12. Verification

1. **Existing Dataset Compatibility:** Verified that `ubuntu_seq60_verified.npz` (`X_norm = (772, 60, 14)`) fully satisfies the Input Data Specification ($T=60, D=14$).
2. **Unit Tests:** Ran `python3 -m unittest tests/test_bdh_dataset.py` $\rightarrow$ **7 tests passed in 0.128s**.
