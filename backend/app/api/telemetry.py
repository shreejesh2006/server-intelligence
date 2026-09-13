import gzip
import json
import os
import time
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status

from app.database.database import SessionLocal
from app.database.models import TelemetrySample
from app.services.forwarder import forward_spool_manager, FORWARD_TELEMETRY_URL

VICTORIAMETRICS_URL = os.getenv("VICTORIAMETRICS_URL", "http://localhost:8428").rstrip("/")
TELEMETRY_SECRET_TOKEN = os.getenv("TELEMETRY_SECRET_TOKEN", "")

router = APIRouter(
    prefix="/v1/telemetry",
    tags=["Telemetry Ingestion"],
)

METRIC_NAME_MAP = {
    "cpu_usage_percent": "server_cpu_usage_percent",
    "memory_usage_percent": "server_memory_usage_percent",
    "disk_usage_percent": "server_disk_usage_percent",
    "swap_usage_percent": "server_swap_usage_percent",
    "load_1m": "server_load_1m",
    "load_5m": "server_load_5m",
    "load_15m": "server_load_15m",
    "network_rx_bytes_sec": "server_network_rx_bytes_per_second",
    "network_tx_bytes_sec": "server_network_tx_bytes_per_second",
    "disk_read_bytes_sec": "server_disk_read_bytes_per_second",
    "disk_write_bytes_sec": "server_disk_write_bytes_per_second",
    "process_count": "server_process_count",
    "cpu_iowait_percent": "server_cpu_iowait_percent",
    "uptime_seconds": "server_uptime_seconds",
}


def verify_authentication(auth_header: str | None, token_header: str | None):
    expected_token = os.getenv("TELEMETRY_SECRET_TOKEN", TELEMETRY_SECRET_TOKEN)
    if not expected_token:
        # If no secret token is configured, authentication is skipped for development
        return

    provided_token = None
    if auth_header and auth_header.startswith("Bearer "):
        provided_token = auth_header[7:].strip()
    elif token_header:
        provided_token = token_header.strip()

    if not provided_token or provided_token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing telemetry secret token.",
        )


def parse_timestamp_ms(ts_str: str) -> int:
    """Converts an ISO timestamp string into epoch milliseconds."""
    try:
        dt = datetime.fromisoformat(ts_str)
        return int(dt.timestamp() * 1000)
    except Exception:
        return int(time.time() * 1000)


@router.post("/ingest")
async def ingest_batch(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
    x_telemetry_token: str | None = Header(default=None),
):
    verify_authentication(authorization, x_telemetry_token)

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty request body.",
        )

    # Check for gzip encoding or magic bytes \x1f\x8b
    content_encoding = request.headers.get("Content-Encoding", "").lower()
    is_gzip = content_encoding == "gzip" or raw_body.startswith(b"\x1f\x8b")
    if is_gzip:
        try:
            decompressed_body = gzip.decompress(raw_body)
            compressed_body = raw_body
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to decompress gzip body: {exc}",
            ) from exc
    else:
        decompressed_body = raw_body
        compressed_body = gzip.compress(raw_body)

    try:
        batch_payload = json.loads(decompressed_body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {exc}",
        ) from exc

    samples = batch_payload.get("samples")
    if not samples or not isinstance(samples, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload must contain a non-empty 'samples' list.",
        )

    batch_hostname = batch_payload.get("hostname", "unknown")
    prom_lines = []

    # 1. Save samples to relational Database (Supabase PostgreSQL / SQLite)
    db = SessionLocal()
    try:
        for sample in samples:
            sample_hostname = sample.get("hostname", batch_hostname)
            ts_str = sample.get("timestamp")

            try:
                dt_ts = datetime.fromisoformat(ts_str) if ts_str else datetime.now(timezone.utc)
            except Exception:
                dt_ts = datetime.now(timezone.utc)

            ts_record = TelemetrySample(
                host=sample_hostname,
                timestamp=dt_ts,
                cpu_usage_percent=sample.get("cpu_usage_percent"),
                memory_usage_percent=sample.get("memory_usage_percent"),
                disk_usage_percent=sample.get("disk_usage_percent"),
                swap_usage_percent=sample.get("swap_usage_percent"),
                load_1m=sample.get("load_1m"),
                load_5m=sample.get("load_5m"),
                load_15m=sample.get("load_15m"),
                network_rx_bytes_sec=sample.get("network_rx_bytes_sec"),
                network_tx_bytes_sec=sample.get("network_tx_bytes_sec"),
                disk_read_bytes_sec=sample.get("disk_read_bytes_sec"),
                disk_write_bytes_sec=sample.get("disk_write_bytes_sec"),
                process_count=sample.get("process_count"),
                cpu_iowait_percent=sample.get("cpu_iowait_percent"),
                uptime_seconds=sample.get("uptime_seconds"),
            )
            db.add(ts_record)

            ts_ms = int(dt_ts.timestamp() * 1000)
            for json_key, prom_name in METRIC_NAME_MAP.items():
                if json_key in sample and sample[json_key] is not None:
                    val = sample[json_key]
                    line = f'{prom_name}{{host="{sample_hostname}"}} {val} {ts_ms}'
                    prom_lines.append(line)

        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[DB ERROR] Failed saving telemetry samples: {exc}", flush=True)
    finally:
        db.close()

    # 2. Ingest to VictoriaMetrics if available locally
    if prom_lines:
        prometheus_payload = "\n".join(prom_lines).encode("utf-8")
        import_url = f"{VICTORIAMETRICS_URL}/api/v1/import/prometheus"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    import_url,
                    content=prometheus_payload,
                    headers={"Content-Type": "text/plain"},
                )
                if resp.status_code not in (200, 204):
                    print(f"[VM INGEST WARNING] VictoriaMetrics status HTTP {resp.status_code}", flush=True)
        except Exception as exc:
            print(f"[VM INGEST NOTICE] VictoriaMetrics uncontactable at {import_url}: {exc}", flush=True)

    # 3. Durable & Retryable forwarding to Render
    target_fwd_url = os.getenv("FORWARD_TELEMETRY_URL", FORWARD_TELEMETRY_URL)
    if target_fwd_url:
        forward_spool_manager.enqueue(compressed_body)
        background_tasks.add_task(forward_spool_manager.flush)

    return {
        "status": "success",
        "hostname": batch_hostname,
        "batch_version": batch_payload.get("version", "1.0"),
        "samples_ingested": len(samples),
        "forwarding_enabled": bool(target_fwd_url),
    }


@router.get("/health")
async def telemetry_health(
    authorization: str | None = Header(default=None),
    x_telemetry_token: str | None = Header(default=None),
):
    vm_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{VICTORIAMETRICS_URL}/health")
            if resp.status_code == 200:
                vm_status = "healthy"
            else:
                vm_status = f"unhealthy (HTTP {resp.status_code})"
    except Exception as exc:
        vm_status = f"unreachable ({exc})"

    return {
        "status": "healthy",
        "receiver": "online",
        "victoriametrics_url": VICTORIAMETRICS_URL,
        "victoriametrics_status": vm_status,
        "forwarding_url": os.getenv("FORWARD_TELEMETRY_URL", FORWARD_TELEMETRY_URL) or None,
        "spooled_forward_batches": len(forward_spool_manager.get_spooled_files()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
