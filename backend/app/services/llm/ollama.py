import httpx

from backend.app.services.llm.endpoints import build_secondary_url


LOCAL_TIMEOUT = httpx.Timeout(connect=1.5, read=120.0, write=5.0, pool=5.0)


def post_ollama(payload, headers):
    with httpx.Client(timeout=LOCAL_TIMEOUT) as client:
        return client.post(build_secondary_url(), json=payload, headers=headers)
