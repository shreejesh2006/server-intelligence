import httpx
from app.services.ai.provider import LLMProvider


class GeminiProvider(LLMProvider):
    async def generate_response(self, messages: list[dict], model: str, api_key: str) -> str:
        # Default model fallback if model is empty or invalid
        effective_model = model.strip() if model and model.strip() else "gemini-2.5-flash"

        # Format messages for Gemini API
        contents = []
        for msg in messages:
            role_name = "user" if msg.get("role") == "user" else "model"
            content_text = msg.get("content", "")
            if content_text:
                contents.append({
                    "role": role_name,
                    "parts": [{"text": content_text}]
                })

        if not contents:
            raise ValueError("No valid message content provided for AI generation.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{effective_model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, json={"contents": contents}, headers=headers)
            except httpx.TimeoutException:
                raise ValueError("Gemini API request timed out after 30 seconds.")
            except httpx.RequestError:
                raise ValueError("Failed to establish network connection to Gemini API service.")

            if response.status_code in (400, 401, 403):
                err_detail = "Invalid or unauthorized Gemini API key."
                try:
                    res_json = response.json()
                    if "error" in res_json and "message" in res_json["error"]:
                        msg_text = res_json["error"]["message"]
                        # Strip any key if present in upstream error message
                        if "key" not in msg_text.lower():
                            err_detail = f"Gemini API authentication error: {msg_text}"
                except Exception:
                    pass
                raise ValueError(err_detail)

            elif response.status_code == 429:
                raise ValueError("Gemini API quota or rate limit exceeded. Please try again later.")

            elif response.status_code >= 500:
                raise ValueError(f"Gemini API server error (HTTP {response.status_code}).")

            elif response.status_code != 200:
                raise ValueError(f"Gemini API request failed with HTTP status {response.status_code}.")

            try:
                data = response.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ValueError("Gemini API returned no candidates.")
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    raise ValueError("Gemini API returned an empty response text.")
                return parts[0].get("text", "")
            except (KeyError, IndexError, TypeError) as exc:
                raise ValueError(f"Malformed payload received from Gemini API: {str(exc)}")
