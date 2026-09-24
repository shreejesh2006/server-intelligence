import pytest
from fastapi import HTTPException
from app.mcp.auth import authorize_tool_call
from app.mcp.tools import AVAILABLE_TOOLS, TOOL_REGISTRY
from app.agent.memory import ConversationMemory


def test_mcp_auth_read_tools_allowed():
    """Verify safe monitoring tools are executable by any authenticated viewer."""
    assert authorize_tool_call("get_server_status", user_role="viewer") is True
    assert authorize_tool_call("query_metrics", user_role="viewer") is True
    assert authorize_tool_call("get_forecast", user_role="viewer") is True
    assert authorize_tool_call("get_anomaly", user_role="viewer") is True


def test_mcp_auth_execute_tools_denied_for_viewers():
    """Verify destructive/privileged tools raise HTTP 403 for viewers or unconfirmed requests."""
    with pytest.raises(HTTPException) as excinfo:
        authorize_tool_call("execute_remediation", user_role="viewer", confirmed=False)
    assert excinfo.value.status_code == 403

    with pytest.raises(HTTPException) as excinfo_unconfirmed:
        authorize_tool_call("execute_remediation", user_role="admin", confirmed=False)
    assert excinfo_unconfirmed.value.status_code == 403


def test_mcp_auth_execute_tools_allowed_for_confirmed_admin():
    """Verify privileged operations proceed only when both role and explicit confirmation exist."""
    assert authorize_tool_call("execute_remediation", user_role="admin", confirmed=True) is True


def test_tool_manifest_registered():
    """Verify all tool definitions exist in the execution registry."""
    tool_names = {t["function"]["name"] for t in AVAILABLE_TOOLS}
    assert "get_server_status" in tool_names
    assert "query_metrics" in tool_names
    assert "get_forecast" in tool_names
    assert "get_anomaly" in tool_names
    assert len(tool_names) == len(TOOL_REGISTRY)


def test_conversation_memory_entity_tracking():
    """Verify entity memory tracks target host across pronoun-based turns."""
    mem = ConversationMemory(max_history=5)
    session_id = "test_session_123"

    mem.track_host(session_id, "ubuntu")
    assert mem.get_tracked_host(session_id) == "ubuntu"

    # User switches host target
    mem.track_host(session_id, "kali")
    assert mem.get_tracked_host(session_id) == "kali"

    # Message trimming check
    for i in range(10):
        mem.add_message(session_id, "user", f"query {i}")

    messages = mem.get_messages(session_id)
    assert len(messages) <= 5
    assert messages[-1]["content"] == "query 9"