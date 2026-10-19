"""Unit tests for backend/app/services/retrieval_service.py verifying
lexical scoring formulas, PageRank authority normalization, FP-Growth query expansion,
paper ID / title extraction, and hybrid retrieval.
"""
from unittest.mock import MagicMock, patch
import pytest

from backend.app.schemas.search import SearchRequest
from backend.app.services.retrieval_service import RetrievalService


@pytest.fixture
def retrieval_svc():
    """Instantiates RetrievalService with mocked Qdrant and MinIO lake access."""
    with patch("backend.app.services.retrieval_service.QdrantManager") as mock_qm, \
         patch("backend.app.services.retrieval_service.lake") as mock_lake:
        mock_lake.get_json.return_value = None
        svc = object.__new__(RetrievalService)
        svc.db = None
        svc.table = MagicMock()
        svc._ready = True
        svc.influencers = []
        svc.max_pagerank = 0.012632
        svc.rules = []
        svc.table_name = "gold_chunks"
        svc.vector_dim = 768
        return svc


# ==============================================================================
# 1. Lexical Scoring Mathematical Invariants
# ==============================================================================

@pytest.mark.unit
def test_lexical_scoring_exact_phrase_and_title_bonus(retrieval_svc):
    query = "Direct Preference Optimization"
    body_with_match = "We present Direct Preference Optimization for aligning language models."
    title_with_match = "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"

    score_match = retrieval_svc._compute_lexical_score(
        query=query,
        text=body_with_match,
        title=title_with_match,
        section="Abstract",
    )
    score_no_match = retrieval_svc._compute_lexical_score(
        query=query,
        text="A completely unrelated paper about robotics and hardware.",
        title="Robotic Manipulation",
        section="Methods",
    )

    assert score_match > score_no_match
    assert 0.0 <= score_match <= 1.0
    assert score_no_match == 0.0


@pytest.mark.unit
def test_lexical_scoring_acronym_and_term_multiplier(retrieval_svc):
    # DPO and LoRA are uppercase acronyms (len >= 2)
    acronym_query = "DPO LoRA alignment"
    body = "In this paper we combine DPO with LoRA."
    score = retrieval_svc._compute_lexical_score(query=acronym_query, text=body)

    # Empty text or stopwords-only queries should return 0.0
    assert retrieval_svc._compute_lexical_score(query=acronym_query, text="") == 0.0
    assert retrieval_svc._compute_lexical_score(query="what is the of in", text=body) == 0.0
    assert 0.0 < score <= 1.0


# ==============================================================================
# 2. PageRank Authority Matching
# ==============================================================================

@pytest.mark.unit
def test_match_authority_normalization(retrieval_svc):
    retrieval_svc.influencers = [
        {"raw": "Yann LeCun", "author_clean": "yann lecun", "pagerank": 0.0120},
        {"raw": "Geoffrey Hinton", "author_clean": "geoffrey hinton", "pagerank": 0.0080},
    ]
    retrieval_svc.max_pagerank = 0.0120

    norm_pr, best_author = retrieval_svc._match_authority(["Yann LeCun", "John Doe"])
    assert best_author == "Yann LeCun"
    # Max PageRank matches, so norm_pr must be 1.0
    assert pytest.approx(norm_pr, rel=1e-3) == 1.0

    # Hinton has 0.0080 / 0.0120 = 0.6667
    norm_pr_h, best_author_h = retrieval_svc._match_authority(["Geoffrey Hinton"])
    assert best_author_h == "Geoffrey Hinton"
    assert pytest.approx(norm_pr_h, rel=1e-3) == 0.6667

    # Unlisted authors return 0.0
    norm_zero, best_none = retrieval_svc._match_authority(["Unknown Author"])
    assert norm_zero == 0.0
    assert best_none is None


# ==============================================================================
# 3. FP-Growth Association Rule Expansion
# ==============================================================================

@pytest.mark.unit
def test_expand_rules_antecedents_and_categories(retrieval_svc):
    retrieval_svc.rules = [
        {"antecedents": ["cat:cs.CV"], "consequents": ["tag:diffusion", "tag:segmentation"]},
        {"antecedents": ["transformer"], "consequents": ["tag:attention", "tag:self-attention"]},
    ]

    # Category matching
    expanded_cat = retrieval_svc._expand_rules("vision models", category="cs.CV")
    assert "diffusion" in expanded_cat
    assert "segmentation" in expanded_cat

    # Query term matching
    expanded_query = retrieval_svc._expand_rules("transformer scaling laws", category=None)
    assert "attention" in expanded_query

    # Non-matching query returns empty
    assert retrieval_svc._expand_rules("quantum gravity", category="physics.gen-ph") == []


# ==============================================================================
# 4. Paper ID and Title Cleaning
# ==============================================================================

@pytest.mark.unit
def test_extract_paper_id_patterns(retrieval_svc):
    # arXiv standard format
    assert retrieval_svc._extract_paper_id_from_query("tell me about arXiv: 2310.01407v2") == "2310.01407v2"
    assert retrieval_svc._extract_paper_id_from_query("paper 2401.12345 in cs.AI") == "2401.12345"

    # OpenAlex format
    assert retrieval_svc._extract_paper_id_from_query("openalex:W2594538354") == "openalex:W2594538354"
    assert retrieval_svc._extract_paper_id_from_query("tell me about W2594538354 paper") == "openalex:W2594538354"

    # No ID in natural text
    assert retrieval_svc._extract_paper_id_from_query("what are large language models?") is None


@pytest.mark.unit
def test_clean_query_for_title_matching(retrieval_svc):
    raw = "tell me about Attention Is All You Need paper"
    cleaned = retrieval_svc._clean_query_for_title_matching(raw)
    assert cleaned == "Attention Is All You Need"

    raw_2 = "Can you explain the Deep Residual Learning for Image Recognition manuscript?"
    cleaned_2 = retrieval_svc._clean_query_for_title_matching(raw_2)
    assert cleaned_2 == "Deep Residual Learning for Image Recognition"


# ==============================================================================
# 5. Fallback on Unready Service
# ==============================================================================

@pytest.mark.unit
def test_search_not_ready_returns_empty(retrieval_svc):
    retrieval_svc._ready = False
    req = SearchRequest(query="neural networks", top_k=5)
    results = retrieval_svc.search(req)
    assert results == []
