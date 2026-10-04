"""
benchmarks/judges/custom_judge.py
---------------------------------
Universal DeepEval Judge LLM supporting:
1. Local Qwen2.5-7B (Node-Llama-CPP or Ollama on http://localhost:9001/v1)
2. DeepSeek API (deepseek-chat / deepseek-reasoner on https://api.deepseek.com/v1)
3. Groq API (llama-3.3-70b-versatile)
4. OpenAI API (gpt-4o-mini / gpt-4o)
"""

import logging
import os
import re
from typing import Optional
from deepeval.models.base_model import DeepEvalBaseLLM
from openai import OpenAI, AsyncOpenAI
from backend.app.core.config import settings

logger = logging.getLogger("deepeval_judge")


def _sanitize_output(text: str) -> str:
    """Repairs unescaped backslashes in JSON strings resulting from LaTeX formulas.
    
    When scientific text contains symbols like \epsilon, \theta, \sigma, local LLMs
    sometimes omit double backslashes in JSON output strings, causing JSONDecodeError.
    This sanitizer replaces illegal JSON backslash escapes with double backslashes.
    """
    if not text:
        return ""
    # Standard JSON escapes: ", \, /, b, f, n, r, t, uXXXX
    # Match any backslash NOT followed by one of these valid escape characters
    return re.sub(r'\\(?![/u"bfnrt\\])', r'\\\\', text)


class CustomDeepEvalJudge(DeepEvalBaseLLM):
    """DeepEval custom LLM-as-a-Judge implementation for local and cloud models."""

    def __init__(self, mode: Optional[str] = None):
        selected_mode = (mode or getattr(settings, "DEEPEVAL_JUDGE_MODEL", None) or os.getenv("DEEPEVAL_JUDGE_MODEL", "local")).lower()
        self.mode = selected_mode

        if self.mode == "deepseek":
            api_key = getattr(settings, "DEEPSEEK_API_KEY", "") or os.getenv("DEEPSEEK_API_KEY")
            if not api_key:
                raise ValueError("DEEPSEEK_API_KEY is required for 'deepseek' judge mode. Please set it in .env.")
            base_url = getattr(settings, "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
            self.model_name = getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat") or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
            self.client = OpenAI(base_url=base_url, api_key=api_key, timeout=60.0)
            self.async_client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=60.0)
            logger.info("[JUDGE] Initialized DeepSeek Judge (%s at %s)", self.model_name, base_url)

        elif self.mode == "groq":
            api_key = getattr(settings, "GROQ_API_KEY", "") or os.getenv("GROQ_API_KEY")
            if not api_key:
                raise ValueError("GROQ_API_KEY is required for 'groq' judge mode. Please set it in .env.")
            self.model_name = "llama-3.3-70b-versatile"
            self.client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=api_key, timeout=45.0)
            self.async_client = AsyncOpenAI(base_url="https://api.groq.com/openai/v1", api_key=api_key, timeout=45.0)
            logger.info("[JUDGE] Initialized Groq Judge (%s)", self.model_name)

        elif self.mode == "openai":
            api_key = getattr(settings, "OPENAI_API_KEY", "") or os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY is required for 'openai' judge mode. Please set it in .env.")
            self.model_name = "gpt-4o-mini"
            self.client = OpenAI(api_key=api_key, timeout=45.0)
            self.async_client = AsyncOpenAI(api_key=api_key, timeout=45.0)
            logger.info("[JUDGE] Initialized OpenAI Judge (%s)", self.model_name)

        else:  # "local" (default)
            base_url = getattr(settings, "DEEPEVAL_LOCAL_URL", "http://localhost:9001/v1") or os.getenv("DEEPEVAL_LOCAL_URL", "http://localhost:9001/v1")
            self.model_name = getattr(settings, "DEEPEVAL_LOCAL_MODEL", "qwen2.5-7b-instruct") or os.getenv("DEEPEVAL_LOCAL_MODEL", "qwen2.5-7b-instruct")
            self.client = OpenAI(base_url=base_url, api_key="local-no-key-required", timeout=120.0)
            self.async_client = AsyncOpenAI(base_url=base_url, api_key="local-no-key-required", timeout=120.0)
            logger.info("[JUDGE] Initialized Local Qwen Judge (%s at %s)", self.model_name, base_url)

        super().__init__(model_name=self.model_name)

    def load_model(self):
        """Returns the active OpenAI-compatible client instance."""
        return self.client

    def generate(self, prompt: str) -> str:
        """Executes synchronous completion for DeepEval evaluation prompts."""
        try:
            resp = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=2048,
            )
            raw = resp.choices[0].message.content or ""
            return _sanitize_output(raw)
        except Exception as e:
            logger.error("[JUDGE ERROR] Failed generating completion with %s: %s", self.model_name, str(e))
            raise

    async def a_generate(self, prompt: str) -> str:
        """Executes asynchronous completion for DeepEval async runs."""
        try:
            resp = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=2048,
            )
            raw = resp.choices[0].message.content or ""
            return _sanitize_output(raw)
        except Exception as e:
            logger.error("[JUDGE ASYNC ERROR] Failed generating async completion with %s: %s", self.model_name, str(e))
            raise

    def get_model_name(self) -> str:
        return f"{self.mode.upper()}:{self.model_name}"


def get_judge_llm(mode: Optional[str] = None) -> CustomDeepEvalJudge:
    """Factory function to acquire a configured DeepEval judge model."""
    return CustomDeepEvalJudge(mode=mode)
