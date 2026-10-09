"""Unit tests for RerankerService in backend/app/services/reranker_service.py."""
import math
import pytest
from backend.app.schemas.search import ChunkDto
from backend.app.services.reranker_service import RerankerService


@pytest.fixture
def sample_candidate_chunks():
    return [
        ChunkDto(
            chunk_id="c1",
            paper_id="2401.00001",
            title="Diffusion Models for 3D Synthesis",
            authors=["Alice"],
            primary_category="cs.CV",
            section_title="Methodology",
            section_type="methods",
            text="We introduce a score-matching diffusion model for 3D Gaussian splatting.",
            context_text="",
            score=0.45,
        ),
        ChunkDto(
            chunk_id="c2",
            paper_id="2401.00002",
            title="Reinforcement Learning in Robotics",
            authors=["Bob"],
            primary_category="cs.RO",
            section_title="Experiments",
            section_type="experiments",
            text="Robotic arm manipulation evaluated using reward shaping in simulation.",
            context_text="",
            score=0.85,
        ),
        ChunkDto(
            chunk_id="c3",
            paper_id="2401.00003",
            title="Generative Diffusion Guidance",
            authors=["Charlie"],
            primary_category="cs.AI",
            section_title="Abstract",
            section_type="abstract",
            text="Classifier-free guidance improves sample quality in conditional diffusion.",
            context_text="",
            score=0.60,
        ),
    ]


@pytest.mark.unit
def test_reranker_empty_chunks():
    svc = RerankerService()
    res = svc.rerank("diffusion query", [])
    assert res == []


@pytest.mark.unit
def test_reranker_fallback_when_offline(sample_candidate_chunks, monkeypatch):
    svc = RerankerService()
    monkeypatch.setattr(svc, "_lazy_init", lambda: None)
    svc._ready = False
    svc.model = None

    res = svc.rerank("diffusion query", sample_candidate_chunks, top_k=2)
    assert len(res) == 2
    # Should maintain input order when model is offline
    assert res[0].chunk_id == "c1"
    assert res[1].chunk_id == "c2"


@pytest.mark.unit
def test_reranker_mock_scoring(sample_candidate_chunks, monkeypatch):
    import torch
    from backend.app.core.config import settings

    monkeypatch.setattr(settings, "RERANKER_ENABLED", True)
    svc = RerankerService()
    monkeypatch.setattr(svc, "_lazy_init", lambda: None)
    svc._ready = True

    class DummyModel:
        def __call__(self, **kwargs):
            class DummyOutput:
                # Logits for 3 chunks: [3.0, -2.0, 1.5]
                logits = torch.tensor([[3.0], [-2.0], [1.5]])
            return DummyOutput()

    class DummyBatch(dict):
        def to(self, device):
            return self

    class DummyTokenizer:
        def __call__(self, pairs, **kwargs):
            return DummyBatch({"input_ids": torch.zeros((len(pairs), 10))})

    svc.model = DummyModel()
    svc.tokenizer = DummyTokenizer()
    svc.device = torch.device("cpu")

    res = svc.rerank("diffusion query", sample_candidate_chunks, top_k=2)
    assert len(res) == 2

    # Chunk with highest logit (3.0 -> c1) should be first
    assert res[0].chunk_id == "c1"
    assert res[0].score > 0.9  # sigmoid(3.0) ~ 0.9526

    # Chunk with second highest logit (1.5 -> c3) should be second
    assert res[1].chunk_id == "c3"
    assert res[1].score > 0.8  # sigmoid(1.5) ~ 0.8176

    # Scores must be valid probabilities in [0.0, 1.0]
    for c in res:
        assert 0.0 <= c.score <= 1.0
