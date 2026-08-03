from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def generate_response(self, messages: list[dict], model: str, api_key: str) -> str:
        """
        Generate a text response given conversation history messages,
        model identifier, and decrypted API key.
        """
        pass
