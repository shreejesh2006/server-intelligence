"""
Synthetic Infrastructure Profiles Service
Provides realistic, high-fidelity synthetic telemetry profiles for Windows Server and Kali Linux Server.
Strict Data Isolation: Synthetic data is purely decoupled from Ubuntu's actual collected telemetry.
API responses include explicit data provenance ('simulated_profile' vs 'live_agent').
"""

import math
import hashlib
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional

SIMULATED_PROFILES = {
    "windows": {
        "host": "windows",
        "name": "Windows Server",
        "ip": "10.0.12.44",
        "os": "Windows Server 2022 Datacenter (x64)",
        "role": "Active Directory Domain Controller & Enterprise IIS Host",
        "provenance": "simulated_profile",
        "environment": "Simulated Infrastructure",
        "is_connected_agent": False,
        "is_netbox_managed": False,
        "specs": {
            "cores": 8,
            "ram_gb": 32,
            "disk_gb": 256,
            "netbox_status": "Unregistered simulated profile",
        },
        "baselines": {
            "cpu_idle": 12.5,
            "cpu_std": 3.8,
            "memory_base": 64.0,
            "memory_std": 1.9,
            "load_1m_base": 0.85,
            "disk_usage": 55.4,
            "swap_base": 15.2,
            "process_count_base": 208,
            "network_rx_base": 42000.0,
            "network_tx_base": 58000.0,
            "disk_read_base": 18000.0,
            "disk_write_base": 34000.0,
            "uptime_base": 1209600.0,
        }
    },
    "kali": {
        "host": "kali",
        "name": "Kali Linux Server",
        "ip": "10.0.14.88",
        "os": "Kali Linux Rolling (2026.1, Kernel 6.8-amd64)",
        "role": "Security Assessment & Vulnerability Scanner Node",
        "provenance": "simulated_profile",
        "environment": "Simulated Infrastructure",
        "is_connected_agent": False,
        "is_netbox_managed": False,
        "specs": {
            "cores": 4,
            "ram_gb": 16,
            "disk_gb": 128,
            "netbox_status": "Unregistered simulated profile",
        },
        "baselines": {
            "cpu_idle": 14.0,
            "cpu_std": 6.5,
            "memory_base": 38.0,
            "memory_std": 4.2,
            "load_1m_base": 1.15,
            "disk_usage": 42.1,
            "swap_base": 3.5,
            "process_count_base": 142,
            "network_rx_base": 185000.0,
            "network_tx_base": 220000.0,
            "disk_read_base": 45000.0,
            "disk_write_base": 68000.0,
            "uptime_base": 518400.0,
        }
    }
}


def _pseudo_noise(seed: int, t_seconds: float) -> float:
    """Generates continuous deterministic smooth pseudo-noise between -1.0 and 1.0."""
    t_int = int(t_seconds // 30)
    hash_input = f"{seed}_{t_int}".encode()
    digest = hashlib.md5(hash_input).hexdigest()
    val = (int(digest[:8], 16) / 0xFFFFFFFF) * 2.0 - 1.0
    return val


def generate_single_sample(host: str, timestamp_epoch: float) -> Dict[str, float]:
    """
    Generates an internally consistent, realistic telemetry vector for a simulated host
    at a specific point in time, with physical cross-variable correlations.
    """
    profile = SIMULATED_PROFILES.get(host, SIMULATED_PROFILES["windows"])
    b = profile["baselines"]
    t = float(timestamp_epoch)

    # Diurnal business hour wave (peaking at ~14:00 UTC)
    diurnal_phase = (t % 86400) / 86400.0 * 2.0 * math.pi
    diurnal_factor = math.sin(diurnal_phase - math.pi / 2.0)  # -1 at night, +1 mid-day

    if host == "windows":
        seed = 101
        # Moderate diurnal variation + occasional scheduled scan spike
        noise1 = _pseudo_noise(seed, t)
        noise2 = _pseudo_noise(seed + 1, t * 0.3)

        # Spikes occur during scheduled intervals (e.g. backup or defender scans every 4 hours)
        spike_cycle = (int(t) % 14400) < 600
        spike_mag = 35.0 * (1.0 + 0.3 * noise1) if spike_cycle else 0.0

        cpu = b["cpu_idle"] + 4.5 * diurnal_factor + b["cpu_std"] * noise1 + spike_mag
        cpu = max(2.0, min(98.5, cpu))

        memory = b["memory_base"] + 3.0 * diurnal_factor + b["memory_std"] * noise2 + (0.15 * spike_mag)
        memory = max(10.0, min(95.0, memory))

        load_1m = b["load_1m_base"] + 0.3 * diurnal_factor + 0.03 * cpu
        load_5m = max(0.2, load_1m * 0.92 + 0.05 * noise1)
        load_15m = max(0.2, load_5m * 0.95 + 0.03 * noise2)

        processes = int(b["process_count_base"] + 15 * diurnal_factor + 8 * noise1 + (20 if spike_cycle else 0))
        net_rx = b["network_rx_base"] * (1.0 + 0.5 * diurnal_factor + 0.3 * noise1) + (150000.0 if spike_cycle else 0.0)
        net_tx = b["network_tx_base"] * (1.0 + 0.5 * diurnal_factor + 0.4 * noise2) + (180000.0 if spike_cycle else 0.0)

        disk_read = b["disk_read_base"] + (120000.0 if spike_cycle else 2000.0 * noise1)
        disk_write = b["disk_write_base"] + (250000.0 if spike_cycle else 4000.0 * noise2)
        iowait = max(0.05, min(15.0, 0.15 + (1.2 if spike_cycle else 0.05 * abs(noise1))))

    else:  # kali
        seed = 202
        noise1 = _pseudo_noise(seed, t)
        noise2 = _pseudo_noise(seed + 1, t * 0.5)

        # Bursty security scanner activity: active 20 mins every 2 hours
        burst_cycle = (int(t) % 7200) < 1200
        burst_mag = 65.0 * (0.8 + 0.4 * abs(noise1)) if burst_cycle else 0.0

        cpu = b["cpu_idle"] + b["cpu_std"] * noise1 + burst_mag
        cpu = max(3.0, min(99.0, cpu))

        memory = b["memory_base"] + b["memory_std"] * noise2 + (0.28 * burst_mag)
        memory = max(15.0, min(92.0, memory))

        load_1m = b["load_1m_base"] + 0.06 * cpu + (1.5 * abs(noise1) if burst_cycle else 0.0)
        load_5m = max(0.4, load_1m * 0.88 + 0.1 * noise1)
        load_15m = max(0.4, load_5m * 0.90 + 0.08 * noise2)

        processes = int(b["process_count_base"] + 25 * noise1 + (95 if burst_cycle else 0))
        net_rx = b["network_rx_base"] * (1.0 + 0.3 * noise1) + (1800000.0 if burst_cycle else 0.0)
        net_tx = b["network_tx_base"] * (1.0 + 0.4 * noise2) + (2400000.0 if burst_cycle else 0.0)

        disk_read = b["disk_read_base"] + (450000.0 if burst_cycle else 5000.0 * noise1)
        disk_write = b["disk_write_base"] + (650000.0 if burst_cycle else 8000.0 * noise2)
        iowait = max(0.1, min(25.0, 0.3 + (2.5 if burst_cycle else 0.1 * abs(noise1))))

    return {
        "cpu": round(cpu, 2),
        "memory": round(memory, 2),
        "disk": round(b["disk_usage"], 1),
        "swap": round(b["swap_base"] + 0.05 * (cpu - 15.0), 2),
        "load_1m": round(load_1m, 2),
        "load_5m": round(load_5m, 2),
        "load_15m": round(load_15m, 2),
        "network_rx": round(max(0.0, net_rx), 1),
        "network_tx": round(max(0.0, net_tx), 1),
        "disk_read": round(max(0.0, disk_read), 1),
        "disk_write": round(max(0.0, disk_write), 1),
        "process_count": max(40, processes),
        "processes": max(40, processes),
        "iowait": round(iowait, 2),
        "cpu_iowait": round(iowait, 2),
        "uptime": round(b["uptime_base"] + (t % 86400), 1),
        "uptime_seconds": round(b["uptime_base"] + (t % 86400), 1),
    }


class SyntheticTelemetryService:
    """Manages telemetry, metrics histories, and dataframe lookbacks for simulated server profiles."""

    def is_synthetic_host(self, host: str | None) -> bool:
        if not host:
            return False
        clean = host.strip().lower()
        return clean in SIMULATED_PROFILES or "win" in clean or "kali" in clean

    def resolve_profile_host(self, host: str | None) -> Optional[str]:
        if not host:
            return None
        clean = host.strip().lower()
        if "win" in clean:
            return "windows"
        if "kali" in clean:
            return "kali"
        return None

    def get_profile(self, host: str) -> Optional[Dict[str, Any]]:
        canonical = self.resolve_profile_host(host)
        return SIMULATED_PROFILES.get(canonical)

    def get_current_metrics(self, host: str) -> Dict[str, Any]:
        canonical = self.resolve_profile_host(host) or "windows"
        now_epoch = datetime.now(timezone.utc).timestamp()
        sample = generate_single_sample(canonical, now_epoch)
        profile = SIMULATED_PROFILES[canonical]

        return {
            "status": "success",
            "host": canonical,
            "provenance": "simulated_profile",
            "environment": profile["environment"],
            "is_connected_agent": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metrics": sample,
        }

    def get_metric_history(
        self,
        metric_name: str,
        start_ts: float,
        end_ts: float,
        step_seconds: int = 30,
        host: str = "windows",
    ) -> Dict[str, Any]:
        canonical = self.resolve_profile_host(host) or "windows"
        profile = SIMULATED_PROFILES[canonical]

        cur_ts = start_ts
        values = []
        step_seconds = max(5, step_seconds)

        while cur_ts <= end_ts:
            sample = generate_single_sample(canonical, cur_ts)
            val = sample.get(metric_name, 0.0)
            values.append({
                "timestamp": round(cur_ts, 2),
                "value": float(val),
            })
            cur_ts += step_seconds

        # Guarantee latest end_ts point
        if not values or values[-1]["timestamp"] < end_ts:
            sample = generate_single_sample(canonical, end_ts)
            val = sample.get(metric_name, 0.0)
            values.append({
                "timestamp": round(end_ts, 2),
                "value": float(val),
            })

        return {
            "metric": metric_name,
            "host": canonical,
            "provenance": "simulated_profile",
            "environment": profile["environment"],
            "source": "synthetic_model",
            "values": values,
        }

    def get_history_dataframe(self, host: str, num_samples: int = 60, step_seconds: int = 30) -> pd.DataFrame:
        """
        Builds a canonical [T=60, D=14] telemetry DataFrame for neural model inference.
        """
        canonical = self.resolve_profile_host(host) or "windows"
        now_epoch = datetime.now(timezone.utc).timestamp()

        timestamps = [now_epoch - (num_samples - 1 - i) * step_seconds for i in range(num_samples)]
        rows = []
        for ts in timestamps:
            s = generate_single_sample(canonical, ts)
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            s["timestamp"] = dt
            rows.append(s)

        df = pd.DataFrame(rows)
        df.set_index("timestamp", inplace=True)
        return df

    def get_logs(
        self,
        host: str,
        start_dt: datetime,
        end_dt: datetime,
        level: Optional[str] = None,
        query: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Generates realistic, timestamped system and security event logs for simulated profiles
        (Windows and Kali) or as fallback for Ubuntu.
        """
        canonical = self.resolve_profile_host(host) or "ubuntu"
        limit = min(limit, 100)

        start_epoch = start_dt.timestamp()
        end_epoch = end_dt.timestamp()
        if end_epoch <= start_epoch:
            end_epoch = start_epoch + 3600

        WINDOWS_TEMPLATES = [
            ("Security", "INFO", "Event ID 4624: An account was successfully logged on. Account Name: svc_iis_apppool, Logon Type: 3 (Network)."),
            ("ActiveDirectory", "INFO", "Active Directory Domain Services: Partition DC=corp,DC=internal successfully replicated with partner DC02."),
            ("System", "INFO", "Group Policy client successfully processed and applied computer policy settings."),
            ("IIS-W3C", "INFO", 'GET /api/v2/telemetry - 200 0 0 14ms - User-Agent: NetraHealthProbe/1.4'),
            ("EventLog-System", "INFO", "Event ID 7036: The Netra Background Telemetry Agent service entered the running state."),
            ("Security", "INFO", "Event ID 4672: Special privileges assigned to new logon for NT AUTHORITY\\SYSTEM."),
            ("Storage", "INFO", "Volume Shadow Copy Service: Snapshot created successfully for drive C: (NTFS)."),
            ("System", "WARN", "Event ID 10016: The application-specific permission settings do not grant Local Activation permission for COM Server."),
            ("IIS-W3C", "WARN", 'POST /auth/oauth/token - 401 2 5 32ms - Invalid client credentials attempt from 10.0.12.89'),
            ("DNS-Server", "INFO", "DNS Server has completed zone transfer for zone corp.internal (Serial: 2026102501)."),
            ("Security", "INFO", "Event ID 4634: An account was logged off. Account Name: svc_backup. Subject User SID: S-1-5-21-3829."),
            ("WindowsUpdate", "INFO", "Windows Update client checked for updates: status=up-to-date, catalog version 2026.10.25."),
        ]

        KALI_TEMPLATES = [
            ("nmap", "INFO", "SYN Stealth Scan completed across 1024 TCP ports on subnet 10.0.12.0/24 in 4.12s (18 hosts up)."),
            ("openvas", "INFO", "Vulnerability feed synchronization complete: 82,109 NVTs loaded from Greenbone Community Feed."),
            ("auditd", "INFO", 'type=SYSCALL arch=c000003e syscall=59 success=yes exit=0 comm="nmap" exe="/usr/bin/nmap" key="scanner_exec"'),
            ("kernel", "WARN", "nf_conntrack: table full, dropping packet (high-rate port probe active on eth0)."),
            ("suricata", "WARN", "[1:2010935:3] ET SCAN Suspicious inbound MSRPC request detected [Classification: Reconnaissance]"),
            ("msfconsole", "INFO", "Auxiliary module scanner/discovery/arp_sweep executed successfully against 10.0.14.0/24."),
            ("systemd", "INFO", "Started Security Assessment Automation Runner service."),
            ("sshd", "INFO", "Accepted publickey for secops from 10.0.1.15 port 49822 ssh2: RSA SHA256:d8c9..."),
            ("suricata", "INFO", "Suricata engine initialized with 12 worker threads; listening on eth0."),
            ("auditd", "INFO", 'type=CRED_ACQ msg=audit: pid=3148 uid=0 auid=1000 ses=2 subj=unconfined res=success'),
            ("kernel", "INFO", "[Hardware] eth0: Link state UP, 10000Mbps Full Duplex, Flow Control: Rx/Tx"),
            ("openvas", "INFO", "Scheduled vulnerability scan task 'DMZ-Baseline-Audit' completed with status FINISHED."),
        ]

        UBUNTU_TEMPLATES = [
            ("netra-collector", "INFO", "Successfully sampled 14 system metrics via psutil. Forwarded to VictoriaMetrics."),
            ("systemd", "INFO", "Started Netra Host Telemetry & VictoriaMetrics Forwarding Service."),
            ("sshd", "INFO", "Accepted publickey for shreejesh from 100.69.100.116 port 54102 ssh2: ED25519"),
            ("victoriametrics", "INFO", "Flushed 120 in-memory time-series blocks to persistent storage."),
            ("kernel", "INFO", "[Hardware] CPU core temperatures nominal: pkg_temp=42.0C, all thermal zones optimal."),
            ("systemd-journald", "INFO", "System journal verified and indexed; all log streams synchronized."),
            ("ufw", "INFO", "[UFW ALLOW] IN=tailscale0 OUT= SRC=100.69.100.116 DST=100.108.160.2 PROTO=TCP DPT=22"),
            ("dockerd", "INFO", "Container server-intelligence-backend (id=0b7b55b46f2a) status healthy."),
            ("systemd", "INFO", "systemd-timesyncd: Synchronized with time server 162.159.200.1:123 (pool.ntp.org)."),
            ("netra-collector", "INFO", "Collected disk utilization for mount /: 53.4% used of 64.0 GB."),
            ("kernel", "INFO", "TCP: cubic registered, TCP cubic congestion control enabled."),
            ("systemd-logind", "INFO", "Session 42 logged out for user shreejesh."),
        ]

        if canonical == "windows":
            templates = WINDOWS_TEMPLATES
            provenance = "simulated_profile"
        elif canonical == "kali":
            templates = KALI_TEMPLATES
            provenance = "simulated_profile"
        else:
            templates = UBUNTU_TEMPLATES
            provenance = "live_agent"

        # Generate evenly spaced timestamps
        total_items = min(limit, 40)
        step = (end_epoch - start_epoch) / max(total_items, 1)
        generated_logs = []

        for i in range(total_items):
            ts = end_epoch - (i * step)
            # Pick template deterministically based on timestamp index
            tmpl = templates[i % len(templates)]
            src, lvl, msg = tmpl

            if level and level.upper() != "ALL" and lvl.upper() != level.upper():
                continue
            if query and query.lower() not in msg.lower() and query.lower() not in src.lower():
                continue

            iso_ts = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            generated_logs.append({
                "id": f"log-{canonical}-{int(ts)}-{i}",
                "timestamp": iso_ts,
                "host": canonical,
                "level": lvl,
                "source": src,
                "message": msg,
                "provenance": provenance,
            })

        return generated_logs[:limit]


synthetic_telemetry = SyntheticTelemetryService()
