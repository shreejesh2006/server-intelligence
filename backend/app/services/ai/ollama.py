import httpx

from app.services.ai.provider import LLMProvider


class OllamaProvider(LLMProvider):
    """Local Ollama LLM provider."""

    OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
    DEFAULT_MODEL = "qwen3:1.7b"

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        api_key: str,
        system_prompt: str | None = None,
    ) -> str:

        effective_model = (
            model.strip()
            if model and model.strip()
            else self.DEFAULT_MODEL
        )

        formatted_messages = []

        if system_prompt and system_prompt.strip():
            formatted_messages.append({
                "role": "system",
                "content": system_prompt.strip(),
            })

        for message in messages:
            role = message.get("role")
            content = message.get("content", "").strip()

            if role not in ("user", "assistant") or not content:
                continue

            formatted_messages.append({
                "role": role,
                "content": content,
            })

        if not formatted_messages:
            raise ValueError("No valid message content provided for AI generation.")

        payload = {
 	   "model": effective_model,
    	   "messages": formatted_messages,
   	   "think": False,
    	   "stream": False,
    	   "options": {
           "num_predict": 256,
    	 },
	}

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    self.OLLAMA_URL,
                    json=payload,
                )
        except httpx.TimeoutException:
            raise ValueError("Local Ollama request timed out.")
        except httpx.RequestError as exc:
            raise ValueError(
                f"Could not connect to local Ollama service: {exc}"
            )

        if response.status_code == 404:
            raise ValueError(
                f"Ollama model '{effective_model}' is not installed."
            )

        if response.status_code != 200:
            raise ValueError(
                f"Ollama request failed with HTTP {response.status_code}: "
                f"{response.text[:300]}"
            )

        try:
            data = response.json()
            message = data.get("message", {})
            text = message.get("content", "").strip()

            if not text:
                raise ValueError("Ollama returned an empty response.")

            return text

        except (ValueError, TypeError) as exc:
            raise ValueError(
                f"Malformed response received from Ollama: {exc}"
            )
