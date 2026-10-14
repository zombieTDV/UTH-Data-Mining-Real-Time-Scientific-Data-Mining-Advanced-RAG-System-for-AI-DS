import httpx

from backend.app.core.config import settings
from backend.app.services.llm.endpoints import GROQ_URL


GROQ_MODEL_ID = "llama-3.3-70b-versatile"
GROQ_TIMEOUT = 30.0


def is_groq_configured() -> bool:
    return bool(settings.GROQ_API_KEY)


def build_groq_payload(payload):
    groq_payload = dict(payload)
    groq_payload["model"] = GROQ_MODEL_ID
    return groq_payload


def build_groq_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
    }


def post_groq(payload):
    with httpx.Client(timeout=GROQ_TIMEOUT) as client:
        return client.post(
            GROQ_URL,
            json=build_groq_payload(payload),
            headers=build_groq_headers(),
        )
