"""
MCP Server Router exposing available tools and resources.
"""
from fastapi import APIRouter, Depends
from app.auth.permissions import require_viewer
from app.mcp.tools import AVAILABLE_TOOLS
from app.mcp.resources import RESOURCE_SCHEMAS, read_resource

router = APIRouter(
    prefix="/mcp",
    tags=["Model Context Protocol"],
    dependencies=[Depends(require_viewer)],
)


@router.get("/tools")
async def list_mcp_tools():
    """Lists registered MCP tools and JSON schemas."""
    return {"tools": AVAILABLE_TOOLS}


@router.get("/resources")
async def list_mcp_resources():
    """Lists registered MCP resource URI templates."""
    return {"resources": RESOURCE_SCHEMAS}


@router.get("/resource")
async def get_mcp_resource(uri: str):
    """Fetches a specific MCP resource by URI."""
    return await read_resource(uri)