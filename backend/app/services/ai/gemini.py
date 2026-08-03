import httpx
from app.services.ai.provider import LLMProvider


class GeminiProvider(LLMProvider):
    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        api_key: str,
        system_prompt: str | None = None
    ) -> str:
        raw_model = model.strip() if model and model.strip() else "gemini-3.6-flash"
        
        # Map non-existent model names (e.g. gemini-2.5-flash) to default gemini-3.6-flash
        if raw_model in ("gemini-2.5-flash", "gemini-2.5-pro"):
            effective_model = "gemini-3.6-flash"
        else:
            effective_model = raw_model

        # Format and sanitize conversation messages for Gemini REST API
        formatted_contents = []
        for idx, msg in enumerate(messages):
            role_name = "user" if msg.get("role") == "user" else "model"
            content_text = msg.get("content", "").strip()
            if not content_text:
                continue

            # Merge consecutive identical roles to enforce strict user/model alternation
            if formatted_contents and formatted_contents[-1]["role"] == role_name:
                formatted_contents[-1]["parts"][0]["text"] += f"\n\n{content_text}"
            else:
                formatted_contents.append({
                    "role": role_name,
                    "parts": [{"text": content_text}]
                })

        # Ensure conversation starts with 'user' role
        while formatted_contents and formatted_contents[0]["role"] != "user":
            formatted_contents.pop(0)

        if not formatted_contents:
            raise ValueError("No valid message content provided for AI generation.")

        # Attach live server telemetry, forecasts, and anomalies to the active user prompt turn
        if system_prompt and system_prompt.strip() and formatted_contents[-1]["role"] == "user":
            user_text = formatted_contents[-1]["parts"][0]["text"]
            # Contextualize active user turn with live telemetry, predictions, and anomalies
            formatted_contents[-1]["parts"][0]["text"] = (
                f"[LIVE SERVER TELEMETRY, FORECASTS & ANOMALY STATE ATTACHED TO USER QUESTION]\n"
                f"{system_prompt.strip()}\n\n"
                f"==================================================\n"
                f"USER QUESTION: {user_text}"
            )

        payload = {"contents": formatted_contents}
        if system_prompt and system_prompt.strip():
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt.strip()}]
            }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{effective_model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=35.0) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
            except httpx.TimeoutException:
                raise ValueError("Gemini API request timed out after 35 seconds.")
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
                            err_detail = f"Gemini API error: {msg_text}"
                except Exception:
                    pass
                raise ValueError(err_detail)

            elif response.status_code == 404:
                raise ValueError(f"Gemini API model '{effective_model}' not found (HTTP 404). Please select gemini-3.6-flash, gemini-3.5-flash, or gemini-3.5-flash-lite in Settings.")

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
