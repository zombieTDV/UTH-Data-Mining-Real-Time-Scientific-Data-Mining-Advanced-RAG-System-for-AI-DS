"""
backend/app/services/llm_client.py
-----------------------------------
Universal OpenAI-compatible LLM client targeting:
1. Primary: Local Qwen2.5-7B GGUF microservice (node-llama-cpp on :9001)
2. Secondary fallback: Ollama instance (:11434)
3. Tertiary fallback: Groq API (if GROQ_API_KEY is configured)
"""

import json
import logging
from typing import AsyncIterator, Dict, List, Optional
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("llm_client")


class LlmClient:
    def __init__(self):
        self.node_llm_url = f"{settings.LLM_SERVICE_URL.rstrip('/')}/chat/completions"
        self.ollama_url = f"{settings.OLLAMA_SERVICE_URL.rstrip('/')}/chat/completions"
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"

    def _get_active_endpoint(self) -> Optional[str]:
        """Probes local endpoints to find the active LLM engine."""
        endpoints = [
            (self.node_llm_url, "Node-Llama-CPP (:9001)"),
            (self.ollama_url, "Ollama (:11434)"),
        ]
        for url, name in endpoints:
            try:
                # Fast HEAD/GET ping to base URL to check if port is listening
                base_probe = url.replace("/chat/completions", "/models")
                with httpx.Client(timeout=0.6) as client:
                    resp = client.get(base_probe)
                    if resp.status_code in (200, 404, 405):
                        return url
            except (httpx.ConnectError, httpx.TimeoutException):
                continue

        if settings.GROQ_API_KEY:
            return self.groq_url

        return None

    def generate(
        self,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Optional[str]:
        """Synchronous chat completion with automatic failover."""
        tokens = max_tokens or settings.LLM_MAX_TOKENS
        temp = temperature if temperature is not None else settings.LLM_TEMPERATURE

        payload = {
            "model": "qwen2.5-7b-instruct",
            "messages": messages,
            "max_tokens": tokens,
            "temperature": temp,
            "stream": False,
        }

        # 1. Try primary node-llama-cpp (:9001)
        headers = {"Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=httpx.Timeout(connect=1.5, read=120.0, write=5.0, pool=5.0)) as client:
                resp = client.post(self.node_llm_url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
                logger.warning("[LLM] Primary endpoint returned status %d: %s", resp.status_code, resp.text)
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM] Node-llama-cpp on port 9001 not responding, trying Ollama...")
        except Exception as e:
            logger.warning("[LLM] Error calling node-llama-cpp: %s", str(e))

        # 2. Try Ollama (:11434)
        try:
            with httpx.Client(timeout=httpx.Timeout(connect=1.5, read=120.0, write=5.0, pool=5.0)) as client:
                resp = client.post(self.ollama_url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM] Ollama on port 11434 not responding.")
        except Exception as e:
            logger.warning("[LLM] Error calling Ollama: %s", str(e))

        # 3. Try Groq if configured
        if settings.GROQ_API_KEY:
            try:
                groq_payload = dict(payload)
                groq_payload["model"] = "llama-3.3-70b-versatile"
                groq_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                }
                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(self.groq_url, json=groq_payload, headers=groq_headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning("[LLM] Error calling Groq: %s", str(e))

        return None

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> AsyncIterator[str]:
        """Asynchronous streaming of chat completion tokens."""
        tokens = max_tokens or settings.LLM_MAX_TOKENS
        temp = temperature if temperature is not None else settings.LLM_TEMPERATURE

        payload = {
            "model": "qwen2.5-7b-instruct",
            "messages": messages,
            "max_tokens": tokens,
            "temperature": temp,
            "stream": True,
        }

        # Target endpoint probe
        target_url = self.node_llm_url
        headers = {"Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=1.5, read=120.0, write=5.0, pool=5.0)) as client:
                async with client.stream("POST", target_url, json=payload, headers=headers) as response:
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
                        return
        except (httpx.ConnectError, httpx.ConnectTimeout):
            logger.debug("[LLM STREAM] Primary endpoint not available.")
        except Exception as e:
            logger.warning("[LLM STREAM] Streaming error: %s", str(e))

        # Fallback to synchronous generation emitted as one chunk
        fallback = self.generate(messages, max_tokens, temperature)
        if fallback:
            yield fallback


llm_client = LlmClient()
