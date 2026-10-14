import logging

import httpx

from backend.app.services.llm.endpoints import build_primary_url


logger = logging.getLogger("llm_client")

LOCAL_MODEL_ID = "qwen2.5-7b-instruct"
LOCAL_TIMEOUT = httpx.Timeout(connect=1.5, read=120.0, write=5.0, pool=5.0)


def build_local_payload(messages, tokens, temp):
    return {
        "model": LOCAL_MODEL_ID,
        "messages": messages,
        "max_tokens": tokens,
        "temperature": temp,
        "stream": False,
    }


def build_local_stream_payload(messages, tokens, temp):
    return {
        "model": LOCAL_MODEL_ID,
        "messages": messages,
        "max_tokens": tokens,
        "temperature": temp,
        "stream": True,
    }


def post_local(payload, headers):
    with httpx.Client(timeout=LOCAL_TIMEOUT) as client:
        return client.post(build_primary_url(), json=payload, headers=headers)


def extract_message_content(data):
    return data["choices"][0]["message"]["content"]
