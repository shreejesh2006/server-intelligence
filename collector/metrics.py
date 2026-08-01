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

    def collect(self):
        current_time = time.monotonic()
        elapsed = current_time - self.previous_time

        network = psutil.net_io_counters()
        disk_io = psutil.disk_io_counters()

        # Avoid division by zero.
        elapsed = max(elapsed, 1e-6)

        network_rx_bytes_sec = (
            network.bytes_recv - self.previous_network.bytes_recv
        ) / elapsed

        network_tx_bytes_sec = (
            network.bytes_sent - self.previous_network.bytes_sent
        ) / elapsed

        disk_read_bytes_sec = (
            disk_io.read_bytes - self.previous_disk_io.read_bytes
        ) / elapsed

        disk_write_bytes_sec = (
            disk_io.write_bytes - self.previous_disk_io.write_bytes
        ) / elapsed

        self.previous_network = network
        self.previous_disk_io = disk_io
        self.previous_time = current_time

        cpu_times = psutil.cpu_times_percent(interval=1)

        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        disk = psutil.disk_usage("/")

        load_1m, load_5m, load_15m = os.getloadavg()

        boot_time = psutil.boot_time()

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),

            "hostname": socket.gethostname(),

            "uptime_seconds": time.time() - boot_time,

            "cpu_usage_percent": psutil.cpu_percent(interval=None),

            "memory_usage_percent": memory.percent,

            "disk_usage_percent": disk.percent,

            "swap_usage_percent": swap.percent,

            "load_1m": load_1m,
            "load_5m": load_5m,
            "load_15m": load_15m,

            "network_rx_bytes_sec": network_rx_bytes_sec,
            "network_tx_bytes_sec": network_tx_bytes_sec,

            "disk_read_bytes_sec": disk_read_bytes_sec,
            "disk_write_bytes_sec": disk_write_bytes_sec,

            "process_count": len(psutil.pids()),

            "cpu_iowait_percent": getattr(cpu_times, "iowait", 0.0),
        }
