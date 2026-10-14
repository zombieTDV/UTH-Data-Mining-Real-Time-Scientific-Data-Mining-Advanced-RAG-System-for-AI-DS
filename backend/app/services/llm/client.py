import json
import logging
from typing import AsyncIterator, Dict, List, Optional

import httpx

from backend.app.core.config import settings
from backend.app.services.llm.endpoints import (
    build_primary_url,
    build_secondary_url,
    resolve_active_endpoint,
)
from backend.app.services.llm.primary import (
    LOCAL_MODEL_ID,
    LOCAL_TIMEOUT,
    build_local_payload,
    build_local_stream_payload,
    post_local,
    extract_message_content,
)
from backend.app.services.llm.ollama import post_ollama
from backend.app.services.llm.groq import is_groq_configured, post_groq


logger = logging.getLogger("llm_client")

JSON_HEADERS = {"Content-Type": "application/json"}


class LlmClient:
    def __init__(self):
        self.node_llm_url = build_primary_url()
        self.ollama_url = build_secondary_url()
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"

    def _get_active_endpoint(self) -> Optional[str]:
        return resolve_active_endpoint()

    def _resolve_tokens_and_temp(self, max_tokens, temperature):
        tokens = max_tokens or settings.LLM_MAX_TOKENS
        temp = temperature if temperature is not None else settings.LLM_TEMPERATURE
        return tokens, temp

    def _try_primary(self, payload):
        try:
            resp = post_local(payload, JSON_HEADERS)
            if resp.status_code == 200:
                return extract_message_content(resp.json())
            logger.warning("[LLM] Primary endpoint returned status %d: %s", resp.status_code, resp.text)
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM] Node-llama-cpp on port 9001 not responding, trying Ollama...")
        except Exception as e:
            logger.warning("[LLM] Error calling node-llama-cpp: %s", str(e))
        return None

    def _try_secondary(self, payload):
        try:
            resp = post_ollama(payload, JSON_HEADERS)
            if resp.status_code == 200:
                return extract_message_content(resp.json())
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM] Ollama on port 11434 not responding.")
        except Exception as e:
            logger.warning("[LLM] Error calling Ollama: %s", str(e))
        return None

    def _try_groq(self, payload):
        if not is_groq_configured():
            return None
        try:
            resp = post_groq(payload)
            if resp.status_code == 200:
                return extract_message_content(resp.json())
        except Exception as e:
            logger.warning("[LLM] Error calling Groq: %s", str(e))
        return None

    def generate(
        self,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Optional[str]:
        tokens, temp = self._resolve_tokens_and_temp(max_tokens, temperature)
        payload = build_local_payload(messages, tokens, temp)

        result = self._try_primary(payload)
        if result is not None:
            return result

        result = self._try_secondary(payload)
        if result is not None:
            return result

        return self._try_groq(payload)

    async def _stream_primary(self, payload):
        try:
            async with httpx.AsyncClient(timeout=LOCAL_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    self.node_llm_url,
                    json=payload,
                    headers=JSON_HEADERS,
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                    delta = chunk["choices"][0].get("delta", {})
                                    content = delta.get("content")
                                    if content:
                                        yield content
                                except Exception:
                                    continue
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM STREAM] Primary endpoint not available.")
        except Exception as e:
            logger.warning("[LLM STREAM] Streaming error: %s", str(e))

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> AsyncIterator[str]:
        tokens, temp = self._resolve_tokens_and_temp(max_tokens, temperature)
        payload = build_local_stream_payload(messages, tokens, temp)

        emitted = False
        async for token in self._stream_primary(payload):
            emitted = True
            yield token

        if emitted:
            return

        fallback = self.generate(messages, max_tokens, temperature)
        if fallback:
            yield fallback


llm_client = LlmClient()
