"""Unit tests for backend/app/services/llm_client.py verifying protocol contracts,
dynamic token budget clamping, failover endpoint detection, SSE parsing, and retry handling.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest

from backend.app.services.llm_client import LlmClient


@pytest.fixture
def llm_client():
    with patch("backend.app.services.llm_client.settings") as mock_settings:
        mock_settings.LLM_SERVICE_URL = "http://localhost:9001/v1"
        mock_settings.OLLAMA_SERVICE_URL = "http://localhost:11434"
        mock_settings.GROQ_API_KEY = ""
        mock_settings.LLM_MAX_TOKENS = 1536
        mock_settings.LLM_TEMPERATURE = 0.7
        mock_settings.LLM_CONTEXT_WINDOW = 4096
        mock_settings.LLM_MODEL_PATH = "models/qwen2.5.gguf"
        client = LlmClient()
        return client


# ==============================================================================
# 1. Dynamic Token Budget Clamping
# ==============================================================================

@pytest.mark.unit
def test_clamp_max_tokens_within_budget(llm_client):
    mock_llm = MagicMock()
    mock_llm.n_ctx.return_value = 4096
    # 200 tokens prompt
    mock_llm.tokenize.return_value = [1] * 200

    messages = [{"role": "user", "content": "Explain transformers"}]
    # requested: 1024, prompt: 200 + 64 = 264, available: 4096 - 264 - 32 = 3800
    safe_tokens = llm_client._clamp_max_tokens(mock_llm, messages, requested_tokens=1024)
    assert safe_tokens == 1024


@pytest.mark.unit
def test_clamp_max_tokens_exceeds_budget_fallback(llm_client):
    mock_llm = MagicMock()
    mock_llm.n_ctx.return_value = 512
    # 500 tokens prompt -> available = 512 - (500 + 64) - 32 < 0
    mock_llm.tokenize.return_value = [1] * 500

    messages = [{"role": "user", "content": "Extremely long prompt"}]
    safe_tokens = llm_client._clamp_max_tokens(mock_llm, messages, requested_tokens=256)
    assert safe_tokens == 64


# ==============================================================================
# 2. Active Endpoint Detection & Failover
# ==============================================================================

@pytest.mark.unit
def test_get_active_endpoint_detects_openai_server(llm_client):
    with patch("httpx.Client.get") as mock_get:
        # Simulate /models returning valid OpenAI payload
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": [{"id": "qwen2.5-7b-instruct"}]}
        mock_get.return_value = mock_resp

        active = llm_client._get_active_endpoint()
        assert active == "http://localhost:9001/v1/chat/completions"


@pytest.mark.unit
def test_get_active_endpoint_rejects_non_llm_port(llm_client):
    with patch("httpx.Client.get") as mock_get:
        # MinIO console on 9001 returning HTML or non-data JSON
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"error": "Unauthorized"}
        mock_get.return_value = mock_resp

        active = llm_client._get_active_endpoint()
        # All probes fail and no Groq key -> returns None
        assert active is None


@pytest.mark.unit
def test_get_active_endpoint_falls_back_to_groq(llm_client):
    with patch("backend.app.services.llm_client.settings") as mock_settings, \
         patch("httpx.Client.get", side_effect=httpx.ConnectError("Connection refused")):
        mock_settings.GROQ_API_KEY = "gsk_test_api_key_12345"
        active = llm_client._get_active_endpoint()
        assert active == "https://api.groq.com/openai/v1/chat/completions"


# ==============================================================================
# 3. Synchronous Generation & Failover
# ==============================================================================

@pytest.mark.unit
def test_generate_via_external_endpoint(llm_client):
    with patch.object(llm_client, "_get_active_endpoint", return_value="http://localhost:9001/v1/chat/completions"), \
         patch("httpx.Client.post") as mock_post:

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "Self-attention computes dynamic weights."}}]
        }
        mock_post.return_value = mock_resp

        reply = llm_client.generate([{"role": "user", "content": "What is self-attention?"}])
        assert reply == "Self-attention computes dynamic weights."


@pytest.mark.unit
def test_generate_via_local_llama_cpp_on_external_failure(llm_client):
    mock_local = MagicMock()
    mock_local.create_chat_completion.return_value = {
        "choices": [{"message": {"content": "Local generation successful."}}]
    }

    with patch.object(llm_client, "_get_active_endpoint", return_value=None), \
         patch.object(llm_client, "_get_local_llm", return_value=mock_local), \
         patch.object(llm_client, "_clamp_max_tokens", return_value=512):

        reply = llm_client.generate([{"role": "user", "content": "Local prompt"}])
        assert reply == "Local generation successful."


# ==============================================================================
# 4. Asynchronous Streaming Generation
# ==============================================================================

@pytest.mark.asyncio
async def test_generate_stream_parses_sse_tokens(llm_client):
    sse_lines = [
        "data: " + json.dumps({"choices": [{"delta": {"content": "Deep "}}]}),
        "data: " + json.dumps({"choices": [{"delta": {"content": "Learning"}}]}),
        "data: [DONE]",
    ]

    async def mock_aiter_lines():
        for line in sse_lines:
            yield line

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.aiter_lines = mock_aiter_lines

    mock_stream_ctx = AsyncMock()
    mock_stream_ctx.__aenter__.return_value = mock_resp

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_stream_ctx
    mock_client_ctx = AsyncMock()
    mock_client_ctx.__aenter__.return_value = mock_client

    with patch.object(llm_client, "_get_active_endpoint", return_value="http://localhost:9001/v1/chat/completions"), \
         patch("httpx.AsyncClient", return_value=mock_client_ctx):

        collected = []
        async for token in llm_client.generate_stream([{"role": "user", "content": "Hi"}]):
            collected.append(token)

        assert "".join(collected) == "Deep Learning"
