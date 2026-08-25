# ML Intelligence Production Architecture & Operational Guide

## 1. Architecture Overview & Data Ingestion
- **Time-Series Telemetry Engine:** VictoriaMetrics (`/api/v1/query` and `/api/v1/query_range`).
- **Host Isolation & Query Strategy:** `VictoriaMetricsService.build_metric_query()` formats explicit PromQL selectors with label expressions (`{host=~"ubuntu|100.108.160.2"}` or `{host=~"kali|Kali|100.115.122.92"}`). Unfiltered queries require host context to prevent cross-host telemetry leakage.
- **Canonical Host Identifiers:**
  - **Ubuntu:** `ubuntu` (Tailscale IP: `100.108.160.2`)
  - **Kali:** `kali` (Tailscale IP: `100.115.122.92`)

---

## 2. Multi-Horizon Forecasting Engine

- **Model Architecture:** Scikit-learn `HistGradientBoostingRegressor` trained independently per target (`cpu`, `memory`, `load_1m`) and horizon (`5m`, `15m`, `30m`, `1h`, `3h`).
- **Real Historical Feature Extraction:** Inference fetches a 30-minute real telemetry history window from VictoriaMetrics via `query_range` (`step=30s`). Features are extracted dynamically:
  - Lags over target metric: $t$, $t-1$ (30s ago), $t-2$ (1m ago), $t-4$ (2m ago), $t-8$ (4m ago), $t-12$ (6m ago).
  - Auxiliary metric current values: `aux_cpu_t`, `aux_memory_t`, `aux_load_1m_t`, `aux_load_5m_t`, `aux_network_rx_t`, `aux_network_tx_t`, `aux_iowait_t`.
  - Target rolling statistics: 5-period rolling mean (`roll_mean_5`) and rolling standard deviation (`roll_std_5`).
- **Per-Host Model Artifacts:**
  - `ml/models/forecasting/ubuntu/{target}_{horizon}.joblib` & `_meta.json`
  - `ml/models/forecasting/kali/{target}_{horizon}.joblib` & `_meta.json`

---

## 3. Anomaly Detection Pipeline

- **Model Architecture:** `IsolationForest` pipeline wrapped with `TelemetryPreprocessor` (`log1p` transformation on skewed bytes/process features + `RobustScaler` scaling).
- **Features Evaluated (11 Dimensions):**
  `["cpu", "memory", "load_1m", "load_5m", "load_15m", "network_rx", "network_tx", "disk_read", "disk_write", "process_count", "iowait"]`
- **Severity Scoring:** Classifies observations into `NORMAL`, `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL` using quantile thresholds calibrated from training anomaly score distribution.
- **Per-Host Artifacts:**
  - `ml/models/anomaly/ubuntu/isolation_forest.joblib` & `anomaly_metadata.json`
  - `ml/models/anomaly/kali/isolation_forest.joblib` & `anomaly_metadata.json`

---

## 4. Retraining & Hot Reload Architecture

- **Real Telemetry Pipeline (`ml/training.py` & `ml/scripts/train_real_data.py`):**
  1. Queries VictoriaMetrics `/api/v1/query_range` over a configurable rolling lookback window (default 7 days).
  2. Constructs lag and rolling feature vectors.
  3. Trains `HistGradientBoostingRegressor` and `IsolationForest` pipelines.
  4. Performs **safe atomic replacement**: writes to temporary directory `ml/models/_temp_{host}/`, validates artifacts, and atomically replaces production host directories.
- **Retraining API Endpoint (`POST /api/v1/intelligence/retrain`):**
  - Protected with `require_operator` permissions.
  - Asynchronous non-blocking background execution via FastAPI `BackgroundTasks` + process-level `asyncio.Lock`.
  - Automatically triggers `MLLoader.reload_host(host)` and flushes forecast/anomaly caches upon completion.
  - Job status tracked via `GET /api/v1/intelligence/retrain/status`.

---

## 5. Model Freshness, Staleness & Timestamp Consistency

- **Freshness Metadata:** Every model metadata file stores `trained_at`, `training_window_start`, `training_window_end`, `number_of_samples`, and `feature_schema`.
- **Staleness Evaluation:** Models older than **168 hours (7 days)** return `is_stale: true` and `model_status: "stale"`.
- **Timestamp Semantics:**
  - `telemetry_timestamp`: Exact timestamp of the latest observation $t$ from VictoriaMetrics used for feature extraction and current metric value.
  - `generated_at`: System API response timestamp.
  - `model_trained_at`: Timestamp when the active model artifact was trained.
