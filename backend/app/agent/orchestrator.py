"""
Agent Orchestrator executing the Plan -> Act -> Observe -> Reason loop.
"""
import json
import logging
from typing import List, Dict, Any

from app.mcp.tools import AVAILABLE_TOOLS, TOOL_REGISTRY
from app.mcp.auth import authorize_tool_call
from app.agent.memory import memory_store

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an SRE AI Engineering Agent for the Server Intelligence Platform.
Your purpose is to autonomously diagnose, inspect, and explain server infrastructure health.

Core Directives:
1. INVESTIGATE FIRST: Use tools (get_server_status, query_metrics, get_anomaly, get_forecast) to obtain telemetry and ML signals before answering.
2. GROUNDED IN FACTS: Never invent or hallucinate metrics, forecasts, or anomaly scores. Cite the actual numbers returned by the tools.
3. PRONOUN RESOLUTION: If the user says "it" or "the server", refer to the host currently being investigated.
4. ACTION RESTRICTION: You may observe facts and PROPOSE remediations (e.g. 'Restart service X'). You do NOT have execution authority.
"""


class AgentOrchestrator:
    def __init__(self, provider, model: str, api_key: str = ""):
        self.provider = provider
        self.model = model
        self.api_key = api_key

    async def run(
        self,
        session_id: str,
        messages: List[Dict[str, str]],
        default_host: str = "ubuntu",
        user_role: str = "viewer",
        max_turns: int = 4,
    ) -> str:
        last_query = messages[-1]["content"] if messages else ""
        memory_store.add_message(session_id, "user", last_query)

        # Detect host mention in user prompt or fall back to tracked host
        lower_query = last_query.lower()
        if "kali" in lower_query:
            active_host = "kali"
            memory_store.track_host(session_id, "kali")
        elif "ubuntu" in lower_query:
            active_host = "ubuntu"
            memory_store.track_host(session_id, "ubuntu")
        else:
            active_host = memory_store.get_tracked_host(session_id, default_host)

        observations: List[str] = []

        # Autonomous investigation: determine data requirements based on user intent
        needs_status = any(k in lower_query for k in ["status", "what is happening", "slow", "down", "check", "health", "how is"])
        needs_forecast = any(k in lower_query for k in ["forecast", "future", "get worse", "prediction", "trend", "later"])
        needs_anomaly = any(k in lower_query for k in ["anomaly", "unusual", "spike", "problem", "incident", "issue", "alert"])

        # Default investigation for open-ended queries
        if not (needs_status or needs_forecast or needs_anomaly):
            needs_status = True

        if needs_status:
            authorize_tool_call("get_server_status", user_role)
            status_res = await TOOL_REGISTRY["get_server_status"](host=active_host)
            observations.append(f"Status Observation: {json.dumps(status_res)}")

        if needs_anomaly:
            authorize_tool_call("get_anomaly", user_role)
            anomaly_res = await TOOL_REGISTRY["get_anomaly"](host=active_host)
            observations.append(f"Anomaly Observation: {json.dumps(anomaly_res)}")

        if needs_forecast:
            authorize_tool_call("get_forecast", user_role)
            forecast_res = await TOOL_REGISTRY["get_forecast"](host=active_host)
            observations.append(f"Forecast Observation: {json.dumps(forecast_res)}")

        # Construct contextual prompt with real tool observations
        prompt_context = (
            f"{SYSTEM_PROMPT}\n"
            f"Active Host Under Investigation: {active_host}\n\n"
            f"Telemetry & Intelligence Observations Gathered:\n"
            + "\n".join(observations)
            + "\n\nProvide an engineering-level diagnosis based strictly on the observations above."
        )

        try:
            reply = await self.provider.generate_response(
                messages=messages,
                model=self.model,
                api_key=self.api_key,
                system_prompt=prompt_context,
            )
        except Exception as err:
            logger.error(f"Provider invocation error: {err}")
            return f"Agent error while generating response: {str(err)}"

        memory_store.add_message(session_id, "assistant", reply)
        return reply