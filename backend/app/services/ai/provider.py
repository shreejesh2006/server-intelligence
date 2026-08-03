from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        api_key: str,
        system_prompt: str | None = None
    ) -> str:
        """
        Generate a text response given conversation history messages,
        model identifier, decrypted API key, and optional system prompt.
        """
        pass
