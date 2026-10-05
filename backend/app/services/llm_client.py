"""
backend/app/services/llm_client.py
-----------------------------------
Universal LLM client targeting:
1. Local Qwen2.5-7B GGUF with Apple Silicon Metal acceleration via llama-cpp-python
2. Local OpenAI-compatible microservice (node-llama-cpp on :9001)
3. Ollama instance (:11434)
4. Groq API (if GROQ_API_KEY is configured)
"""

import atexit
import asyncio
import json
import logging
import threading
from pathlib import Path
from typing import AsyncIterator, Dict, List, Optional
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("llm_client")

try:
    from llama_cpp import Llama
    LLAMA_CPP_AVAILABLE = True
except ImportError:
    LLAMA_CPP_AVAILABLE = False


class LlmClient:
    def __init__(self):
        base_node = settings.LLM_SERVICE_URL.rstrip('/')
        self.node_llm_url = f"{base_node}/chat/completions" if base_node.endswith("/v1") else f"{base_node}/v1/chat/completions"

        base_ollama = settings.OLLAMA_SERVICE_URL.rstrip('/')
        self.ollama_url = f"{base_ollama}/chat/completions" if base_ollama.endswith("/v1") else f"{base_ollama}/v1/chat/completions"

        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"
        self._local_llm = None
        self._lock = threading.Lock()
        atexit.register(self.close)

    def close(self):
        """Explicitly releases local LLM weights and residency sets on process exit."""
        if self._local_llm is not None:
            try:
                del self._local_llm
                self._local_llm = None
            except Exception:
                pass

    def _clamp_max_tokens(self, llm, messages: List[Dict[str, str]], requested_tokens: int) -> int:
        """Dynamically clamps max_tokens to ensure prompt + max_tokens never exceeds n_ctx."""
        try:
            full_text = "".join(m.get("content", "") for m in messages)
            prompt_tokens = len(llm.tokenize(full_text.encode("utf-8", errors="ignore"))) + 64
            n_ctx = llm.n_ctx()
            available = n_ctx - prompt_tokens - 32
            if available <= 0:
                logger.warning("[LLM] Prompt tokens (%d) near/exceeds n_ctx (%d), allocating fallback budget 64", prompt_tokens, n_ctx)
                return 64
            return min(requested_tokens, available)
        except Exception:
            return requested_tokens

    def preload(self):
        """Warm-up and preload local model into Apple Silicon Metal GPU memory at startup."""
        logger.info("[LLM STARTUP] Preloading Qwen2.5-7B GGUF with Apple Metal GPU offloading...")
        llm = self._get_local_llm()
        if llm:
            logger.info("[LLM STARTUP] Qwen2.5-7B is fully preloaded in GPU memory (n_ctx=%d) and ready.", llm.n_ctx())
        else:
            logger.warning("[LLM STARTUP] Local model could not be preloaded.")

    def _get_local_llm(self):
        """Lazy-loads local GGUF model with Metal hardware acceleration."""
        if not LLAMA_CPP_AVAILABLE:
            return None
        if self._local_llm is not None:
            return self._local_llm

        with self._lock:
            if self._local_llm is not None:
                return self._local_llm

            model_path = Path(settings.LLM_MODEL_PATH)
            if not model_path.is_absolute():
                model_path = settings.PROJECT_ROOT_DIR / model_path

            if not model_path.exists():
                logger.warning("[LLM] Local model path does not exist: %s", model_path)
                return None

            try:
                ctx_window = getattr(settings, "LLM_CONTEXT_WINDOW", 16384)
                logger.info("[LLM] Loading Qwen2.5-7B GGUF with Apple Metal GPU offloading (n_ctx=%d) from %s...", ctx_window, model_path)
                self._local_llm = Llama(
                    model_path=str(model_path),
                    n_gpu_layers=-1,
                    n_ctx=ctx_window,
                    verbose=False,
                )
                logger.info("[LLM] Local Qwen2.5-7B GGUF initialized successfully on Metal with %d tokens context window.", ctx_window)
                return self._local_llm
            except Exception as e:
                logger.error("[LLM] Failed to load local model via llama_cpp: %s", str(e))
                return None

    def _get_active_endpoint(self) -> Optional[str]:
        """Probes external endpoints to find if any HTTP LLM service is running."""
        endpoints = [
            (self.node_llm_url, "Node-Llama-CPP (:9001)"),
            (self.ollama_url, "Ollama (:11434)"),
        ]
        for url, name in endpoints:
            try:
                base_probe = url.replace("/chat/completions", "/models")
                with httpx.Client(timeout=0.4) as client:
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

        # 1. Try external HTTP endpoint if active
        active_url = self._get_active_endpoint()
        if active_url:
            payload = {
                "model": "llama-3.3-70b-versatile" if active_url == self.groq_url else "qwen2.5-7b-instruct",
                "messages": messages,
                "max_tokens": tokens,
                "temperature": temp,
                "stream": False,
            }
            headers = {"Content-Type": "application/json"}
            if active_url == self.groq_url and settings.GROQ_API_KEY:
                headers["Authorization"] = f"Bearer {settings.GROQ_API_KEY}"
            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(active_url, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning("[LLM] External endpoint %s failed: %s", active_url, str(e))

        # 2. Try native local llama-cpp with Metal
        llm = self._get_local_llm()
        if llm:
            try:
                safe_tokens = self._clamp_max_tokens(llm, messages, tokens)
                resp = llm.create_chat_completion(
                    messages=messages,
                    max_tokens=safe_tokens,
                    temperature=temp,
                    stream=False,
                )
                return resp["choices"][0]["message"]["content"]
            except ValueError as ve:
                if "exceed context window" in str(ve).lower():
                    logger.warning("[LLM] Context window limit hit, retrying with minimal token budget...")
                    try:
                        resp = llm.create_chat_completion(
                            messages=messages,
                            max_tokens=64,
                            temperature=temp,
                            stream=False,
                        )
                        return resp["choices"][0]["message"]["content"]
                    except Exception as retry_err:
                        logger.error("[LLM] Retry failed: %s", str(retry_err))
                else:
                    logger.error("[LLM] ValueError in local llama_cpp generation: %s", str(ve))
            except Exception as e:
                logger.error("[LLM] Error in local llama_cpp generation: %s", str(e))

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

        # 1. Try external HTTP endpoint if active
        active_url = self._get_active_endpoint()
        if active_url:
            payload = {
                "model": "llama-3.3-70b-versatile" if active_url == self.groq_url else "qwen2.5-7b-instruct",
                "messages": messages,
                "max_tokens": tokens,
                "temperature": temp,
                "stream": True,
            }
            headers = {"Content-Type": "application/json"}
            if active_url == self.groq_url and settings.GROQ_API_KEY:
                headers["Authorization"] = f"Bearer {settings.GROQ_API_KEY}"
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=120.0, write=5.0, pool=5.0)) as client:
                    async with client.stream("POST", active_url, json=payload, headers=headers) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if line.startswith("data: "):
                                    data_str = line[6:].strip()
                                    if data_str == "[DONE]":
                                        return
                                    try:
                                        chunk = json.loads(data_str)
                                        delta = chunk["choices"][0].get("delta", {})
                                        content = delta.get("content")
                                        if content:
                                            yield content
                                    except Exception:
                                        continue
                            return
            except Exception as e:
                logger.warning("[LLM STREAM] External stream %s failed: %s", active_url, str(e))

        # 2. Try native local llama-cpp with Metal streaming
        llm = self._get_local_llm()
        if llm:
            try:
                safe_tokens = self._clamp_max_tokens(llm, messages, tokens)
                stream = llm.create_chat_completion(
                    messages=messages,
                    max_tokens=safe_tokens,
                    temperature=temp,
                    stream=True,
                )
                for chunk in stream:
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content
                        await asyncio.sleep(0)
                return
            except ValueError as ve:
                if "exceed context window" in str(ve).lower():
                    logger.warning("[LLM STREAM] Context window limit hit, retrying with minimal token budget...")
                    try:
                        stream = llm.create_chat_completion(
                            messages=messages,
                            max_tokens=64,
                            temperature=temp,
                            stream=True,
                        )
                        for chunk in stream:
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                yield content
                                await asyncio.sleep(0)
                        return
                    except Exception as retry_err:
                        logger.error("[LLM STREAM] Retry stream failed: %s", str(retry_err))
                else:
                    logger.error("[LLM STREAM] ValueError in local llama_cpp stream: %s", str(ve))
            except Exception as e:
                logger.error("[LLM STREAM] Error in local llama_cpp stream: %s", str(e))


llm_client = LlmClient()
