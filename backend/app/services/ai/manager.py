from app.services.ai.provider import LLMProvider
from app.services.ai.gemini import GeminiProvider


class AIManager:
    @staticmethod
    def get_provider(provider_name: str) -> LLMProvider:
        clean_name = (provider_name or "").lower().strip()
        if clean_name == "gemini":
            return GeminiProvider()
        elif clean_name in ("openai", "anthropic", "openrouter"):
            raise ValueError(f"AI Provider '{provider_name}' is not currently supported. Only Gemini is active in this release.")
        else:
            raise ValueError(f"Unknown or unsupported AI Provider '{provider_name}'.")
