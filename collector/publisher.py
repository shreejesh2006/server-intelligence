import urllib.error
import urllib.request


VICTORIAMETRICS_IMPORT_URL = (
    "http://localhost:8428/api/v1/import/prometheus"
)


class VictoriaMetricsPublisher:
    def __init__(self, url=VICTORIAMETRICS_IMPORT_URL):
        self.url = url

    def publish(self, sample):
        hostname = sample["hostname"]

        metrics = {
            "server_cpu_usage_percent":
                sample["cpu_usage_percent"],

            "server_memory_usage_percent":
                sample["memory_usage_percent"],

            "server_disk_usage_percent":
                sample["disk_usage_percent"],

            "server_swap_usage_percent":
                sample["swap_usage_percent"],

            "server_load_1m":
                sample["load_1m"],

            "server_load_5m":
                sample["load_5m"],

            "server_load_15m":
                sample["load_15m"],

            "server_network_rx_bytes_per_second":
                sample["network_rx_bytes_sec"],

            "server_network_tx_bytes_per_second":
                sample["network_tx_bytes_sec"],

            "server_disk_read_bytes_per_second":
                sample["disk_read_bytes_sec"],

            "server_disk_write_bytes_per_second":
                sample["disk_write_bytes_sec"],

            "server_process_count":
                sample["process_count"],

            "server_cpu_iowait_percent":
                sample["cpu_iowait_percent"],

            "server_uptime_seconds":
                sample["uptime_seconds"],
        }

        lines = []

        for metric_name, value in metrics.items():
            lines.append(
                f'{metric_name}{{host="{hostname}"}} {value}'
            )

        payload = "\n".join(lines).encode("utf-8")

        request = urllib.request.Request(
            self.url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "text/plain"
            },
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=10
            ) as response:

                if response.status not in (200, 204):
                    raise RuntimeError(
                        "VictoriaMetrics returned "
                        f"HTTP {response.status}"
                    )

        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Could not publish metrics: {exc}"
            ) from exc
