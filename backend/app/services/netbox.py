"""
NetBox Infrastructure Inventory Service for NETRA INTELLIGENCE
NETBOX_URL
Integrates with NetBox REST API (DCIM and IPAM) to discover physical/virtual devices,
device roles, rack positions, interfaces, IP addresses, and hardware status.
Maps NetBox devices to canonical monitored hosts (Ubuntu, Kali).
Includes bounded caching with TTL, safe token handling, and graceful offline degradation.
"""

import logging
import os
import time
from typing import Any

import httpx

from app.services.ml.loader import normalize_host, KNOWN_HOSTS

logger = logging.getLogger(__name__)

NETBOX_URL = os.getenv("NETBOX_URL", "http://localhost:8080").rstrip("/")
NETBOX_API_TOKEN = os.getenv("NETBOX_API_TOKEN", "")
NETBOX_TIMEOUT_SECONDS = float(os.getenv("NETBOX_TIMEOUT", "4.0"))
CACHE_TTL_SECONDS = 300.0  # 5-minute cache

# Static architectural mapping of canonical monitored hosts to default infrastructure context
# Used as baseline when NetBox is offline or during local development
CANONICAL_INVENTORY_PROFILES: dict[str, dict[str, Any]] = {
    "ubuntu": {
        "name": "ubuntu-monitored-server",
        "canonical_host": "ubuntu",
        "role": "Production Compute Node",
        "status": "active",
        "primary_ip": "100.108.160.2",
        "local_ip": "192.168.1.10",
        "subnet": "192.168.1.0/24",
        "site": "NMIT Data Center",
        "rack": "Rack-01",
        "rack_position": "U12-U14",
        "interfaces": ["eth0 (100.108.160.2)", "tailscale0 (100.x.x.x)"],
        "hardware": "Dell PowerEdge R640 / 32 Cores / 64GB RAM",
        "stock_status": "in_service",
        "maintenance_window": "Sunday 02:00-04:00 UTC",
    },
}


class NetBoxService:
    """Client for NetBox DCIM and IPAM APIs with host mapping and caching."""

    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or NETBOX_URL).rstrip("/")
        self.token = token if token is not None else NETBOX_API_TOKEN
        self._cached_devices: list[dict[str, Any]] | None = None
        self._cache_timestamp: float = 0.0

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token.strip()}"
        return headers

    async def check_health(self) -> dict[str, Any]:
        """Checks if NetBox API endpoint is reachable."""
        if not self.base_url:
            return {"status": "unconfigured", "url": None}

        url = f"{self.base_url}/api/status/"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url, headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "status": "connected",
                        "url": self.base_url,
                        "netbox_version": data.get("netbox-version", "unknown"),
                    }
        except Exception:
            pass

        return {
            "status": "unavailable",
            "url": self.base_url,
            "fallback": "architectural_profiles_active",
        }

    async def get_all_devices(self, force_refresh: bool = False) -> list[dict[str, Any]]:
        """
        Retrieves devices from NetBox. Returns cached results if within TTL.
        Falls back to canonical architectural profiles if NetBox is uncontactable.
        """
        now = time.time()
        if (
            not force_refresh
            and self._cached_devices is not None
            and (now - self._cache_timestamp) < CACHE_TTL_SECONDS
        ):
            return self._cached_devices

        devices = []
        try:
            url = f"{self.base_url}/api/dcim/devices/"
            async with httpx.AsyncClient(timeout=NETBOX_TIMEOUT_SECONDS) as client:
                resp = await client.get(url, headers=self._headers())
                if resp.is_success:
                    payload = resp.json()
                    results = payload.get("results", [])
                    for d in results:
                        dev_name = d.get("name", "")
                        primary_ip_obj = d.get("primary_ip") or {}
                        primary_ip = primary_ip_obj.get("address", "").split("/")[0] if isinstance(primary_ip_obj, dict) else ""

                        # Determine canonical host mapping
                        canonical = None
                        if "ubuntu" in dev_name.lower() or primary_ip in ("100.108.160.2", "192.168.1.10"):
                            canonical = "ubuntu"

                        site_obj = d.get("site") or {}
                        rack_obj = d.get("rack") or {}
                        role_obj = d.get("device_role") or d.get("role") or {}

                        devices.append({
                            "id": d.get("id"),
                            "name": dev_name,
                            "canonical_host": canonical,
                            "role": role_obj.get("name", "Server") if isinstance(role_obj, dict) else str(role_obj),
                            "status": d.get("status", {}).get("value", "active") if isinstance(d.get("status"), dict) else str(d.get("status", "active")),
                            "primary_ip": primary_ip,
                            "site": site_obj.get("name", "Default Site") if isinstance(site_obj, dict) else str(site_obj),
                            "rack": rack_obj.get("name", "Rack") if isinstance(rack_obj, dict) else str(rack_obj),
                            "serial": d.get("serial", ""),
                            "source": "netbox_api",
                        })

                    self._cached_devices = devices
                    self._cache_timestamp = now
                    return devices
        except Exception as exc:
            logger.info("NetBox API uncontactable, using canonical profiles fallback: %s", exc)

        # Fallback to architectural baseline profiles
        fallback_devices = []
        for idx, (canonical, prof) in enumerate(CANONICAL_INVENTORY_PROFILES.items(), start=1):
            fallback_devices.append({
                "id": idx,
                "name": prof["name"],
                "canonical_host": canonical,
                "role": prof["role"],
                "status": prof["status"],
                "primary_ip": prof["primary_ip"],
                "local_ip": prof.get("local_ip", ""),
                "subnet": prof.get("subnet", ""),
                "site": prof["site"],
                "rack": prof["rack"],
                "rack_position": prof.get("rack_position", ""),
                "interfaces": prof.get("interfaces", []),
                "hardware": prof.get("hardware", ""),
                "stock_status": prof.get("stock_status", "in_service"),
                "maintenance_window": prof.get("maintenance_window", ""),
                "source": "architectural_profile",
            })

        self._cached_devices = fallback_devices
        self._cache_timestamp = now
        return fallback_devices

    async def get_device_by_host(self, host: str) -> dict[str, Any] | None:
        """Finds inventory metadata for a canonical monitored host or IP."""
        canonical = normalize_host(host) or host.strip().lower()
        devices = await self.get_all_devices()

        for dev in devices:
            if dev.get("canonical_host") == canonical:
                return dev
            if dev.get("name", "").lower() == host.lower():
                return dev
            if dev.get("primary_ip") == host:
                return dev

        if canonical in CANONICAL_INVENTORY_PROFILES:
            prof = CANONICAL_INVENTORY_PROFILES[canonical]
            return {
                "id": 1 if canonical == "ubuntu" else 2,
                "name": prof["name"],
                "canonical_host": canonical,
                "role": prof["role"],
                "status": prof["status"],
                "primary_ip": prof["primary_ip"],
                "site": prof["site"],
                "rack": prof["rack"],
                "source": "architectural_profile",
            }

        return None

    async def get_inventory_mapping(self) -> dict[str, Any]:
        """Returns map of monitored hosts to inventory devices."""
        devices = await self.get_all_devices()
        mapping = {}
        for h in KNOWN_HOSTS:
            dev = await self.get_device_by_host(h)
            mapping[h] = dev
        return mapping


netbox_service = NetBoxService()
