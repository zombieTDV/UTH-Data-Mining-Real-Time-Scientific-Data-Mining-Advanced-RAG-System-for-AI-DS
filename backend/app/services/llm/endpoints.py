import httpx
from typing import Optional

from backend.app.core.config import settings


GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
PROBE_TIMEOUT = 0.6
PROBE_ACCEPT_STATUS = (200, 404, 405)


def build_primary_url() -> str:
    base = settings.LLM_SERVICE_URL.rstrip('/')
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def build_secondary_url() -> str:
    base = settings.OLLAMA_SERVICE_URL.rstrip('/')
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def build_models_probe_url(url: str) -> str:
    return url.replace("/chat/completions", "/models")


def is_endpoint_live(url: str) -> bool:
    try:
        with httpx.Client(timeout=PROBE_TIMEOUT) as client:
            resp = client.get(build_models_probe_url(url))
            return resp.status_code in PROBE_ACCEPT_STATUS
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


def resolve_active_endpoint() -> Optional[str]:
    primary = build_primary_url()
    if is_endpoint_live(primary):
        return primary

    secondary = build_secondary_url()
    if is_endpoint_live(secondary):
        return secondary

    if settings.GROQ_API_KEY:
        return GROQ_URL

    return None
