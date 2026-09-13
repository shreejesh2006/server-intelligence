# Server Intelligence Telemetry Architecture

This document describes the telemetry pipeline architecture for the **Server Intelligence** platform, detailing the migration from local per-server ingestion to a centralized **Ubuntu → Mac** batch-push architecture over **Tailscale**.

---

## 1. Architecture Overview

```
                          UBUNTU MONITORED SERVER
                 ┌───────────────────────────────────────┐
                 │ SystemMetrics (30s collection)       │
                 │   └─ Wall-clock aligned (:00, :30)    │
                 │ TelemetryBatcher                      │
                 │   └─ 10 samples / 5-min batches       │
                 │   └─ gzip payload compression (v1.0)  │
                 │ TelemetryPublisher                    │
                 │   └─ Retry Spool Queue (disk backup)  │
                 └──────────────────┬────────────────────┘
                                    │
                         Tailscale Network (HTTPS/HTTP)
                         Bearer Token Authentication
                                    │
                                    ▼
                          MAC CENTRAL SERVER
                 ┌───────────────────────────────────────┐
                 │ Backend Receiver                      │
                 │   └─ POST /api/v1/telemetry/ingest    │
                 │ Prometheus Line Formatter             │
                 │ VictoriaMetrics Ingestion             │
                 │   └─ POST /api/v1/import/prometheus   │
                 └──────────────────┬────────────────────┘
                                    │
                                    ▼
                         VictoriaMetrics Database
                         (Local on Mac :8428)
```

---

## 2. Configuration & Environment Variables

### Ubuntu Monitored Server (`collector/.env` or system environment)

| Variable | Default Value | Description |
|---|---|---|
| `MAC_RECEIVER_URL` | `http://<MAC_TAILSCALE_IP>:8000/api/v1/telemetry/ingest` | Central Mac receiver API endpoint. |
| `TELEMETRY_SECRET_TOKEN` | *Required in Production* | Shared authentication token sent in `Authorization: Bearer <token>`. |
| `ENABLE_LOCAL_PUBLISH` | `false` | Set to `true` during migration to dual-publish to local Ubuntu VictoriaMetrics. |
| `COLLECTION_INTERVAL_SECONDS` | `30` | Collection loop frequency (aligned to `:00` and `:30`). |
| `BATCH_SIZE` | `10` | Number of 30-second samples per batch (10 samples = 5 minutes). |
| `SPOOL_DIR` | `./spool` | Directory path for offline retry queue files. |
| `MAX_SPOOL_FILES` | `288` | Maximum spooled batch files allowed (288 files = 24 hours). |

### Mac Central Server (`backend/.env` or Docker Compose environment)

| Variable | Default Value | Description |
|---|---|---|
| `TELEMETRY_SECRET_TOKEN` | *Required in Production* | Shared secret token expected from collectors. |
| `VICTORIAMETRICS_URL` | `http://localhost:8428` | Local VictoriaMetrics instance URL. |

---

## 3. Operations & Quickstart

### Running on Mac (Central Server)

1. Start VictoriaMetrics and Backend API:
   ```bash
   docker-compose up -d victoriametrics backend
   ```
2. Verify Mac Receiver Health:
   ```bash
   curl -H "Authorization: Bearer <TELEMETRY_SECRET_TOKEN>" http://localhost:8000/api/v1/telemetry/health
   ```

### Running on Ubuntu (Monitored Node)

1. Configure environment variables:
   ```bash
   export MAC_RECEIVER_URL="http://100.x.y.z:8000/api/v1/telemetry/ingest"
   export TELEMETRY_SECRET_TOKEN="your-shared-secret-token"
   export ENABLE_LOCAL_PUBLISH="false"
   ```
2. Run health check against Mac:
   ```bash
   python3 -m collector.check_health
   ```
3. Start the collector daemon:
   ```bash
   python3 collector/collector.py
   ```

---

## 4. Resilience & Failure Handling

- **Network Interruption**: If Mac is unreachable or returns HTTP errors, the collector saves the compressed batch to `./spool/batch_<timestamp>_<uuid>.json.gz` without stopping the 30s collection loop.
- **Automatic Retry**: Upon every batch window (5 mins), the collector attempts to flush spooled batches in chronological order before uploading the current batch.
- **Bounded Spooling**: Storage is bounded by `MAX_SPOOL_FILES` (default 288 files = 24 hours of data), protecting system disk space.

---

## 5. Metric Schema

All 14 core metrics are preserved:
- `server_cpu_usage_percent`
- `server_memory_usage_percent`
- `server_disk_usage_percent`
- `server_swap_usage_percent`
- `server_load_1m`
- `server_load_5m`
- `server_load_15m`
- `server_network_rx_bytes_per_second`
- `server_network_tx_bytes_per_second`
- `server_disk_read_bytes_per_second`
- `server_disk_write_bytes_per_second`
- `server_process_count`
- `server_cpu_iowait_percent`
- `server_uptime_seconds`

---

## 6. Rollback Procedure

If needed to revert temporarily to direct local Ubuntu VictoriaMetrics publishing:
1. Set `ENABLE_LOCAL_PUBLISH="true"` on Ubuntu.
2. Unset or leave `MAC_RECEIVER_URL` empty to disable remote push.
3. Restart `collector.py`.
