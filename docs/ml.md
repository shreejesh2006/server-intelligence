# ML Intelligence Architecture & Evaluation Report

## 1. Overview & Data Ingestion
- **Time-Series Backend:** VictoriaMetrics storage with metric aggregation across `server_*` metrics.
- **Host Query Strategy:** Dynamically injects `{host="<host_name>"}` label selectors into PromQL queries, ensuring query-level isolation for telemetry pipelines.
- **Dataset:** 7-day dual-host time series (`ml/data/host_telemetry.csv`, 20,160 samples at 1-minute intervals) modeling distinct baseline and burst behavior for `ubuntu` and `kali`.

## 2. Multi-Horizon Forecasting Engine (PatchTST & Regressors)
- **Patching Strategy:** Sub-series window patching ($L=60$, $P=12$, $S=6$) preserves local temporal correlations while projecting sequence patches to transformer embedding spaces.
- **Supported Horizons:** 5m, 15m, 30m, 1h, 3h.
- **Target Metrics:** CPU Usage (`%`), Memory Usage (`%`), Load 1m.
- **Benchmark Evaluation Summary:**
  - Evaluated 30 combinations across targets, horizons, and hosts (`ml/evaluation_results.csv`).
  - Baseline ML reduces prediction error by **~14%** over persistence.
  - PatchTST transformer architecture achieves **~23% MAE / RMSE reduction** relative to baseline persistence.

## 3. Anomaly Detection Pipeline
- **Model:** Isolation Forest fitted on 11-dimensional system telemetry:
  `["cpu", "memory", "load_1m", "load_5m", "load_15m", "network_rx", "network_tx", "disk_read", "disk_write", "process_count", "iowait"]`
- **Severity Scoring:** Classifies anomalies into `NORMAL`, `WARNING`, and `CRITICAL` levels using contamination-calibrated decision functions.

## 4. API & Cache Layer
- **Endpoints:** `/intelligence/forecast` and `/intelligence/anomaly` accept optional sanitized `?host=` query parameters.
- **In-Memory Caching:** 30-second per-host TTL cache eliminates duplicate inference overhead during concurrent dashboard refreshes.
