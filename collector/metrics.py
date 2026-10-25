import os
import socket
import time
from datetime import datetime, timezone

import psutil


class SystemMetrics:
    def __init__(self):
        self.previous_network = psutil.net_io_counters()
        self.previous_disk_io = psutil.disk_io_counters()
        self.previous_time = time.monotonic()

        # Prime psutil's non-blocking CPU measurements.
        psutil.cpu_percent(interval=None)
        psutil.cpu_times_percent(interval=None)

    def collect(self):
        current_monotonic = time.monotonic()
        elapsed = max(current_monotonic - self.previous_time, 0.001)

        network = psutil.net_io_counters()
        disk_io = psutil.disk_io_counters()

        rx_rate = max(
            0.0,
            (network.bytes_recv - self.previous_network.bytes_recv) / elapsed,
        )
        tx_rate = max(
            0.0,
            (network.bytes_sent - self.previous_network.bytes_sent) / elapsed,
        )

        if disk_io is not None and self.previous_disk_io is not None:
            read_rate = max(
                0.0,
                (disk_io.read_bytes - self.previous_disk_io.read_bytes) / elapsed,
            )
            write_rate = max(
                0.0,
                (disk_io.write_bytes - self.previous_disk_io.write_bytes) / elapsed,
            )
        else:
            read_rate = 0.0
            write_rate = 0.0

        # Update state for the next collection interval.
        self.previous_network = network
        self.previous_disk_io = disk_io
        self.previous_time = current_monotonic

        cpu_usage = psutil.cpu_percent(interval=None)
        cpu_times = psutil.cpu_times_percent(interval=None)

        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()

        disk_path = os.environ.get("SystemDrive", "C:") + "\\" if os.name == "nt" else "/"
        try:
            disk = psutil.disk_usage(disk_path)
        except Exception:
            disk = psutil.disk_usage("/")

        try:
            load_1m, load_5m, load_15m = os.getloadavg()
        except (AttributeError, OSError):
            load_1m = load_5m = load_15m = 0.0

        uptime_seconds = max(0.0, time.time() - psutil.boot_time())

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hostname": socket.gethostname(),
            "uptime_seconds": uptime_seconds,
            "cpu_usage_percent": cpu_usage,
            "memory_usage_percent": memory.percent,
            "disk_usage_percent": disk.percent,
            "swap_usage_percent": swap.percent,
            "load_1m": load_1m,
            "load_5m": load_5m,
            "load_15m": load_15m,
            "network_rx_bytes_sec": rx_rate,
            "network_tx_bytes_sec": tx_rate,
            "disk_read_bytes_sec": read_rate,
            "disk_write_bytes_sec": write_rate,
            "process_count": len(psutil.pids()),
            "cpu_iowait_percent": getattr(
                cpu_times,
                "iowait",
                0.0,
            ),
        }

    def collect_metrics(self):
        """Alias for collect() for compatibility with external agents and tools."""
        return self.collect()
