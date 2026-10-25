"""
BDH Configuration — Canonical Feature Schema & System Constants for Ubuntu Telemetry
"""

CANONICAL_HOST = "ubuntu"
SUPPORTED_HOST_ALIASES = ("ubuntu", "100.108.160.2")

# Canonical 14 telemetry features in deterministic order
FEATURE_COLUMNS = [
    "cpu",
    "memory",
    "disk",
    "swap",
    "load_1m",
    "load_5m",
    "load_15m",
    "network_rx",
    "network_tx",
    "disk_read",
    "disk_write",
    "process_count",
    "iowait",
    "uptime",
]

# Heavy-tailed throughput metrics requiring log1p transformation
SKEWED_FEATURES = [
    "network_rx",
    "network_tx",
    "disk_read",
    "disk_write",
]

# Forecasting targets and steps (at 30s sampling interval)
TARGET_COLUMNS = ["cpu", "memory", "load_1m"]
HORIZONS_MAP = {
    "5m": 10,
    "15m": 30,
    "30m": 60,
    "1h": 120,
    "3h": 360,
    "6h": 720,
    "12h": 1440,
    "24h": 2880,
    "48h": 5760,
    "72h": 8640,
}

DEFAULT_SAMPLING_INTERVAL_SECONDS = 30
DEFAULT_MAX_GAP_SECONDS = 90  # >3 missed 30s samples constitutes a sequence gap boundary
DEFAULT_SEQUENCE_LENGTH = 60  # 60 steps * 30s = 30 minutes context window


def validate_host(host: str | None) -> str:
    """
    Validates host identifier strictly for BDH pipeline.
    Rejects invalid hosts or legacy host identifiers (e.g. Kali).
    Returns canonical host 'ubuntu'.
    """
    if not host:
        raise ValueError("Host parameter is required for BDH pipeline.")
    
    clean = str(host).strip().lower()
    if clean in SUPPORTED_HOST_ALIASES:
        return CANONICAL_HOST
    
    raise ValueError(
        f"Unsupported host '{host}'. The BDH pipeline only supports active host '{CANONICAL_HOST}'."
    )
