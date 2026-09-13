import gzip
import json
import urllib.error
import urllib.request
from config import config
from batcher import TelemetryBatcher

VICTORIAMETRICS_IMPORT_URL = "http://localhost:8428/api/v1/import/prometheus"


class MacTelemetryPublisher:
    def __init__(self, receiver_url=None, secret_token=None):
        self.receiver_url = (receiver_url or config.mac_receiver_url).rstrip("/")
        self.secret_token = secret_token or config.telemetry_secret_token

    def publish_batch(self, batch_dict, compressed_bytes=None):
        """Pushes a gzip-compressed telemetry batch payload to the Mac telemetry receiver."""
        if compressed_bytes is None:
            compressed_bytes = TelemetryBatcher.compress(batch_dict)

        headers = {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        }

        if self.secret_token:
            headers["Authorization"] = f"Bearer {self.secret_token}"

        req = urllib.request.Request(
            self.receiver_url,
            data=compressed_bytes,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status in (200, 204):
                    return True
                else:
                    raise RuntimeError(f"Mac receiver returned HTTP {response.status}")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"HTTP {exc.code} from Mac receiver: {err_msg}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Network error sending batch to Mac: {exc.reason}") from exc
        except Exception as exc:
            raise RuntimeError(f"Unexpected error publishing batch: {exc}") from exc


class VictoriaMetricsPublisher:
    def __init__(self, url=VICTORIAMETRICS_IMPORT_URL):
        self.url = url

    def publish(self, sample):
        hostname = sample["hostname"]

        metrics = {
            "server_cpu_usage_percent": sample["cpu_usage_percent"],
            "server_memory_usage_percent": sample["memory_usage_percent"],
            "server_disk_usage_percent": sample["disk_usage_percent"],
            "server_swap_usage_percent": sample["swap_usage_percent"],
            "server_load_1m": sample["load_1m"],
            "server_load_5m": sample["load_5m"],
            "server_load_15m": sample["load_15m"],
            "server_network_rx_bytes_per_second": sample["network_rx_bytes_sec"],
            "server_network_tx_bytes_per_second": sample["network_tx_bytes_sec"],
            "server_disk_read_bytes_per_second": sample["disk_read_bytes_sec"],
            "server_disk_write_bytes_per_second": sample["disk_write_bytes_sec"],
            "server_process_count": sample["process_count"],
            "server_cpu_iowait_percent": sample["cpu_iowait_percent"],
            "server_uptime_seconds": sample["uptime_seconds"],
        }

        lines = []
        for metric_name, value in metrics.items():
            lines.append(f'{metric_name}{{host="{hostname}"}} {value}')

        payload = "\n".join(lines).encode("utf-8")

        request = urllib.request.Request(
            self.url,
            data=payload,
            method="POST",
            headers={"Content-Type": "text/plain"},
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status not in (200, 204):
                    raise RuntimeError(f"VictoriaMetrics returned HTTP {response.status}")
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Could not publish metrics locally: {exc}") from exc
