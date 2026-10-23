"""
Inventory API Router for NETRA INTELLIGENCE

Provides endpoints for retrieving infrastructure inventory, host-to-hardware mapping,
and NetBox synchronization status.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.permissions import require_viewer
from app.services.netbox import netbox_service
from app.services.ml.loader import normalize_host, KNOWN_HOSTS

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/inventory",
    tags=["Infrastructure Inventory (NetBox)"],
    dependencies=[Depends(require_viewer)],
)


@router.get("/devices")
async def list_devices(
    refresh: bool = Query(default=False, description="Bypass cache and force NetBox query"),
):
    """
    List infrastructure inventory devices retrieved from NetBox (or fallback profiles).
    Never exposes API credentials or internal tokens.
    """
    devices = await netbox_service.get_all_devices(force_refresh=refresh)
    return {
        "status": "success",
        "total": len(devices),
        "devices": devices,
    }


@router.get("/devices/{host_or_id}")
async def get_device(host_or_id: str):
    """
    Retrieve inventory details for a specific host (e.g. 'ubuntu') or device identifier.
    """
    device = await netbox_service.get_device_by_host(host_or_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device or host '{host_or_id}' not found in NetBox inventory.",
        )
    return {
        "status": "success",
        "device": device,
    }


@router.get("/mapping")
async def get_host_mapping():
    """
    Returns canonical mapping between monitored server hosts and NetBox infrastructure inventory.
    """
    mapping = await netbox_service.get_inventory_mapping()
    return {
        "status": "success",
        "hosts": list(KNOWN_HOSTS),
        "mapping": mapping,
    }


@router.get("/status")
async def get_inventory_status():
    """
    Returns status of the NetBox integration, synchronization state, and health.
    """
    health = await netbox_service.check_health()
    devices = await netbox_service.get_all_devices(force_refresh=False)
    return {
        "status": "success",
        "connection": health.get("status", "unavailable"),
        "netbox_url": health.get("url"),
        "devices_discovered": len(devices),
        "monitored_hosts": list(KNOWN_HOSTS),
    }
