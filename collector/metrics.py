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
        elapsed = current_monotonic - self.previous_time

        # Protect rate calculations against a zero/near-zero interval.
        elapsed = max(elapsed, 1e-6)

        network = psutil.net_io_counters()
        disk_io = psutil.disk_io_counters()

        network_rx_bytes_sec = (
            network.bytes_recv - self.previous_network.bytes_recv
        ) / elapsed

        network_tx_bytes_sec = (
            network.bytes_sent - self.previous_network.bytes_sent
        ) / elapsed

        if disk_io is not None and self.previous_disk_io is not None:
            disk_read_bytes_sec = (
                disk_io.read_bytes - self.previous_disk_io.read_bytes
            ) / elapsed

            disk_write_bytes_sec = (
                disk_io.write_bytes - self.previous_disk_io.write_bytes
            ) / elapsed
        else:
            disk_read_bytes_sec = 0.0
            disk_write_bytes_sec = 0.0

        # Update state for the next collection interval.
        self.previous_network = network
        self.previous_disk_io = disk_io
        self.previous_time = current_monotonic

        cpu_usage = psutil.cpu_percent(interval=None)
        cpu_times = psutil.cpu_times_percent(interval=None)

        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        disk = psutil.disk_usage("/")

        try:
            load_1m, load_5m, load_15m = os.getloadavg()
        except AttributeError:
            load_1m = 0.0
            load_5m = 0.0
            load_15m = 0.0

        uptime_seconds = time.time() - psutil.boot_time()

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

            "network_rx_bytes_sec": max(
                0.0,
                network_rx_bytes_sec
            ),
            "network_tx_bytes_sec": max(
                0.0,
                network_tx_bytes_sec
            ),

            "disk_read_bytes_sec": max(
                0.0,
                disk_read_bytes_sec
            ),
            "disk_write_bytes_sec": max(
                0.0,
                disk_write_bytes_sec
            ),

            "process_count": len(psutil.pids()),

            "cpu_iowait_percent": getattr(
                cpu_times,
                "iowait",
                0.0
            ),
        }
