"""
MCP RBAC and Safety Guardrails.
Enforces read-only isolation for monitoring telemetry and restricts privileged actions.
"""
from enum import Enum
from fastapi import HTTPException, status

class ToolTier(str, Enum):
    READ = "READ"          # Telemetry, metrics, anomaly, forecast
    PROPOSE = "PROPOSE"    # Non-destructive diagnostics, recommendations
    EXECUTE = "EXECUTE"    # Remediation actions (restricted)

TOOL_TIER_MAP = {
    "get_server_status": ToolTier.READ,
    "query_metrics": ToolTier.READ,
    "get_forecast": ToolTier.READ,
    "get_anomaly": ToolTier.READ,
    "run_diagnostics": ToolTier.READ,
    "execute_remediation": ToolTier.EXECUTE,
}

def authorize_tool_call(tool_name: str, user_role: str = "viewer", confirmed: bool = False) -> bool:
    tier = TOOL_TIER_MAP.get(tool_name, ToolTier.EXECUTE)
    
    # Safe read operations are permitted for all authenticated users
    if tier in (ToolTier.READ, ToolTier.PROPOSE):
        return True

    # Privileged operations require admin/operator role and explicit confirmation
    if tier == ToolTier.EXECUTE:
        if user_role not in ["admin", "operator"] or not confirmed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Execution of privileged tool '{tool_name}' requires operator/admin role and explicit confirmation."
            )
    return True