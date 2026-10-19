import pytest
from unittest.mock import MagicMock, patch
from backend.app.services.retrieval_service import RetrievalService
from backend.app.schemas.search import SearchRequest, ChunkDto


@pytest.fixture
def retrieval_svc():
    with patch.object(RetrievalService, "_init_db", return_value=None), \
         patch.object(RetrievalService, "_init_graph_and_rules", return_value=None):
        svc = RetrievalService()
        svc._ready = True
        svc.table = MagicMock()
        svc.influencers = [
            {"raw": "Hinton (Geoffrey Hinton)", "author_clean": "geoffrey hinton", "pagerank": 0.012}
        ]
        svc.max_pagerank = 0.012
        svc.rules = [
            {"antecedents": ["cat:cs.AI"], "consequents": ["machine learning", "deep learning"]}
        ]
        return svc


def test_normalize_authors():
    assert RetrievalService._normalize_authors(["Author A", "Author B"]) == ["Author A", "Author B"]
    assert RetrievalService._normalize_authors(None, ["Fallback Author"]) == ["Fallback Author"]
    assert RetrievalService._normalize_authors("Single Author") == ["Single Author"]
    assert RetrievalService._normalize_authors(None, None) == []


def test_match_authority(retrieval_svc):
    score, author = retrieval_svc._match_authority(["Geoffrey Hinton", "Student Name"])
    assert score == 1.0  # Normalized to max_pagerank
    assert author == "Geoffrey Hinton"

    zero_score, zero_author = retrieval_svc._match_authority(["Unknown Author"])
    assert zero_score == 0.0
    assert zero_author is None


def test_expand_rules(retrieval_svc):
    expanded = retrieval_svc._expand_rules("Query about robotics", category="cs.AI")
    assert "machine learning" in expanded
    assert "deep learning" in expanded

    no_expansion = retrieval_svc._expand_rules("Unrelated query", category="physics.flu-dyn")
    assert no_expansion == []


def test_compute_lexical_score(retrieval_svc):
    # Exact phrase and title match bonus
    score_high = retrieval_svc._compute_lexical_score(
        query="LoRA Low-Rank Adaptation",
        text="This method implements LoRA Low-Rank Adaptation for parameter efficiency.",
        title="LoRA Low-Rank Adaptation",
        section="Methodology"
    )
    score_low = retrieval_svc._compute_lexical_score(
        query="Quantum teleportation",
        text="General machine learning overview.",
        title="Deep Learning",
        section="Intro"
    )
    assert score_high > 0.5
    assert score_low == 0.0


def test_extract_paper_id_from_query(retrieval_svc):
    assert retrieval_svc._extract_paper_id_from_query("Check openalex:W2594538354 please") == "openalex:W2594538354"
    assert retrieval_svc._extract_paper_id_from_query("arxiv:2310.01407v2") == "2310.01407v2"
    assert retrieval_svc._extract_paper_id_from_query("General question without ID") is None


def test_clean_query_for_title_matching(retrieval_svc):
    cleaned = retrieval_svc._clean_query_for_title_matching("Tell me about the Attention Is All You Need paper")
    assert "attention is all you need" in cleaned.lower()
