"""
In-memory multi-turn conversational session context store.
Tracks dialogue history and entity context (e.g., active host).
"""
from typing import List, Dict, Any, Optional


class ConversationMemory:
    def __init__(self, max_history: int = 12):
        self.max_history = max_history
        self._history: Dict[str, List[Dict[str, Any]]] = {}
        self._last_host: Dict[str, str] = {}

    def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        return self._history.get(session_id, [])

    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self._history:
            self._history[session_id] = []
        self._history[session_id].append({"role": role, "content": content})
        if len(self._history[session_id]) > self.max_history:
            self._history[session_id] = self._history[session_id][-self.max_history:]

    def track_host(self, session_id: str, host: str):
        if host:
            self._last_host[session_id] = host.lower().strip()

    def get_tracked_host(self, session_id: str, default: str = "ubuntu") -> str:
        return self._last_host.get(session_id, default)

    def clear(self, session_id: str):
        self._history.pop(session_id, None)
        self._last_host.pop(session_id, None)


memory_store = ConversationMemory()