import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.search import ChunkDto
from backend.app.services.rag_service import RagService


@pytest.fixture
def rag_service():
    return RagService()


def test_rag_build_prompt_and_context_empty(rag_service):
    req = ChatRequest(query="What is transformer attention?", top_k=5)
    with patch("backend.app.services.rag_service.retrieval_service.search", return_value=[]):
        messages, chunks, citations = rag_service._build_prompt_and_context(req)
        assert chunks == []
        assert citations == []
        assert len(messages) == 2
        assert "Retrieved Scientific Context:\n\n" in messages[1]["content"]


def test_rag_build_prompt_and_context_with_reranker_and_authority(rag_service):
    req = ChatRequest(query="diffusion policy", top_k=2)
    mock_chunks = [
        ChunkDto(
            chunk_id="c1",
            paper_id="2301.0001",
            title="Diffusion Policy for Robotics",
            section_title="Method",
            text="Diffusion policy formulates robot action prediction as a conditional diffusion process.",
            score=0.92,
            authority_author="Pieter Abbeel",
            authority_score=0.88,
            rule_expansions=["robotics", "imitation learning"]
        ),
        ChunkDto(
            chunk_id="c2",
            paper_id="2302.0002",
            title="Action Chunking with Transformers",
            section_title="Experiments",
            text="Long text " * 400,  # > 3000 chars to test truncation
            score=0.85
        ),
    ]

    with patch("backend.app.services.rag_service.retrieval_service.search", return_value=mock_chunks), \
         patch("backend.app.services.rag_service.settings.RERANKER_ENABLED", True), \
         patch("backend.app.services.rag_service.reranker_service.rerank", return_value=mock_chunks[:2]):
        
        messages, chunks, citations = rag_service._build_prompt_and_context(req)

        assert len(chunks) == 2
        assert len(citations) == 2
        assert citations[0] == "Paper: 2301.0001, Section: Method"
        assert citations[1] == "Paper: 2302.0002, Section: Experiments"

        # Check truncation note
        assert "... [section truncated]" in messages[1]["content"]

        # Check Graph PageRank Authority injection in system prompt
        sys_prompt = messages[0]["content"]
        assert "Graph PageRank Authority: Paper [Paper: 2301.0001] is authored by high-impact" in sys_prompt
        assert "Pieter Abbeel" in sys_prompt


def test_synthesize_grounded_fallback(rag_service):
    # Empty chunks fallback
    assert "No matching scientific literature found" in rag_service._synthesize_grounded_fallback("query", [])

    # Multi-chunk synthesis
    chunks = [
        ChunkDto(chunk_id="c1", paper_id="p1", title="Title 1", section_title="Sec 1", text="Primary theory body"),
        ChunkDto(chunk_id="c2", paper_id="p2", title="Title 2", section_title="", text="Secondary excerpt with lots of details " * 20),
    ]
    synthesis = rag_service._synthesize_grounded_fallback("quantum computing", chunks)
    assert "### 1. Primary Theoretical Foundation" in synthesis
    assert "Paper: p1, Section: Sec 1" in synthesis
    assert "### 2. Methodological & Empirical Findings" in synthesis
    assert "### 3. Synthesis Summary" in synthesis


def test_answer_query_empty_results(rag_service):
    req = ChatRequest(query="unknown query")
    with patch.object(rag_service, "_build_prompt_and_context", return_value=([], [], [])):
        resp = rag_service.answer_query(req)
        assert isinstance(resp, ChatResponse)
        assert resp.context_chunks_used == 0
        assert resp.similarity_score == "0.0000"
        assert "No matching scientific literature found" in resp.answer


def test_answer_query_with_llm_generation(rag_service):
    req = ChatRequest(query="Tell me about LoRA", temperature=0.2)
    mock_chunk = ChunkDto(
        chunk_id="c1",
        paper_id="2106.09685",
        title="LoRA: Low-Rank Adaptation of Large Language Models",
        section_title="Abstract",
        text="Low-Rank Adaptation freezes pre-trained model weights...",
        score=0.96,
        authority_author="Edward Hu",
        rule_expansions=["PEFT", "fine-tuning"]
    )
    with patch.object(rag_service, "_build_prompt_and_context", return_value=([{"role": "user", "content": "q"}], [mock_chunk], ["Paper: 2106.09685, Section: Abstract"])), \
         patch("backend.app.services.rag_service.llm_client.generate", return_value="LoRA decomposes weight updates into low-rank matrices."):
        
        resp = rag_service.answer_query(req)
        assert resp.answer == "LoRA decomposes weight updates into low-rank matrices."
        assert resp.similarity_score == "0.9600"
        assert resp.context_chunks_used == 1
        assert resp.authority_boosted is True
        assert resp.top_influencer_author == "Edward Hu"
        assert resp.rule_expansions == ["PEFT", "fine-tuning"]


def test_answer_query_llm_empty_triggers_fallback(rag_service):
    req = ChatRequest(query="Fallback query")
    mock_chunk = ChunkDto(
        chunk_id="c1",
        paper_id="p1",
        title="Fallback Paper",
        section_title="Intro",
        text="Deterministic paper text.",
        score=0.88
    )
    with patch.object(rag_service, "_build_prompt_and_context", return_value=([{"role": "user", "content": "q"}], [mock_chunk], ["Paper: p1, Section: Intro"])), \
         patch("backend.app.services.rag_service.llm_client.generate", return_value=""):
        
        resp = rag_service.answer_query(req)
        assert "Based on the retrieved literature from the Qdrant Gold collection" in resp.answer
        assert resp.context_chunks_used == 1


@pytest.mark.asyncio
async def test_answer_query_stream_empty(rag_service):
    req = ChatRequest(query="Empty stream")
    with patch.object(rag_service, "_build_prompt_and_context", return_value=([], [], [])):
        tokens = [token async for token in rag_service.answer_query_stream(req)]
        assert len(tokens) == 1
        assert "No matching scientific literature found" in tokens[0]


@pytest.mark.asyncio
async def test_answer_query_stream_with_tokens(rag_service):
    req = ChatRequest(query="Streaming query")
    mock_chunk = ChunkDto(
        chunk_id="c1",
        paper_id="p1",
        title="Streaming Paper",
        section_title="Intro",
        text="Stream test",
        score=0.91,
        authority_author="Geoffrey Hinton"
    )

    async def mock_stream(messages, temperature=0.7):
        yield "Deep "
        yield "Learning"

    with patch.object(rag_service, "_build_prompt_and_context", return_value=([{"role": "user", "content": "q"}], [mock_chunk], ["Paper: p1"])), \
         patch("backend.app.services.rag_service.llm_client.generate_stream", side_effect=mock_stream):
        
        items = [item async for item in rag_service.answer_query_stream(req)]
        assert len(items) == 3
        meta = items[0]
        assert isinstance(meta, dict)
        assert meta["similarity_score"] == "0.9100"
        assert meta["top_influencer_author"] == "Geoffrey Hinton"
        assert meta["authority_boosted"] is True
        assert items[1] == "Deep "
        assert items[2] == "Learning"
