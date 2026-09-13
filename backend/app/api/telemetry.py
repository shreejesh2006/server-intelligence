import gzip
import json
import os
import time
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status

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
        # If no secret token is configured on Mac, authentication is disabled/skipped for development
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
    if content_encoding == "gzip" or raw_body.startswith(b"\x1f\x8b"):
        try:
            decompressed_body = gzip.decompress(raw_body)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to decompress gzip body: {exc}",
            ) from exc
    else:
        decompressed_body = raw_body

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

    for sample in samples:
        sample_hostname = sample.get("hostname", batch_hostname)
        ts_str = sample.get("timestamp")
        ts_ms = parse_timestamp_ms(ts_str) if ts_str else int(time.time() * 1000)

        for json_key, prom_name in METRIC_NAME_MAP.items():
            if json_key in sample and sample[json_key] is not None:
                val = sample[json_key]
                line = f'{prom_name}{{host="{sample_hostname}"}} {val} {ts_ms}'
                prom_lines.append(line)

    if not prom_lines:
        return {"status": "success", "samples_ingested": 0, "metrics_processed": 0}

    prometheus_payload = "\n".join(prom_lines).encode("utf-8")
    import_url = f"{VICTORIAMETRICS_URL}/api/v1/import/prometheus"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                import_url,
                content=prometheus_payload,
                headers={"Content-Type": "text/plain"},
            )
            if resp.status_code not in (200, 204):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"VictoriaMetrics import error HTTP {resp.status_code}: {resp.text}",
                )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VictoriaMetrics at {import_url}: {exc}",
        ) from exc

    return {
        "status": "success",
        "hostname": batch_hostname,
        "batch_version": batch_payload.get("version", "1.0"),
        "samples_ingested": len(samples),
        "metrics_processed": len(prom_lines),
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
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
