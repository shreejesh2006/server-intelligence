from app.services.ai.provider import LLMProvider
from app.services.ai.ollama import OllamaProvider
from app.services.ai.gemini import GeminiProvider


class AIManager:
    @staticmethod
    def get_provider(provider_name: str) -> LLMProvider:
        clean_name = (provider_name or "").lower().strip()

        if clean_name == "ollama":
            return OllamaProvider()

        if clean_name == "gemini":
            return GeminiProvider()

        raise ValueError(
            f"AI Provider '{provider_name}' is not currently supported."
        )
