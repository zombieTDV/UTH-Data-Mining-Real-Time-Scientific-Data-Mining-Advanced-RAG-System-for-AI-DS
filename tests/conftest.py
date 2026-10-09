"""Pytest configuration and shared test fixtures for UTH Scientific RAG & Lakehouse.

Supports tiered testing:
- unit: fast mocked execution (< 5ms per test)
- integration: component, database, and API endpoint integration
- system: multi-component pipeline runs
- e2e: end-to-end API lifecycle and Playwright UI tests
"""
import os
import sys
from pathlib import Path
from typing import Any, Dict, List
import numpy as np
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

DATA_RAW = PROJECT_ROOT / "data" / "raw"
needs_data = pytest.mark.skipif(
    not DATA_RAW.exists() or not any(DATA_RAW.iterdir()),
    reason="data/raw is absent - data-dependent test skipped",
)


def pytest_addoption(parser):
    """Adds CLI opt-in flags for live external services and heavy neural weights."""
    parser.addoption(
        "--run-live-r2",
        action="store_true",
        default=False,
        help="Run tests that execute physical operations against live Cloudflare R2 bucket",
    )
    parser.addoption(
        "--run-heavy-models",
        action="store_true",
        default=False,
        help="Run tests that load physical neural model weights (CrossEncoder, HuggingFace Hub)",
    )


def pytest_collection_modifyitems(config, items):
    """Auto-skips live_r2 and heavy_model tests unless explicit opt-in flags are passed."""
    run_live_r2 = config.getoption("--run-live-r2")
    run_heavy_models = config.getoption("--run-heavy-models")

    skip_live_r2 = pytest.mark.skip(reason="Need --run-live-r2 option to run physical Cloudflare R2 tests")
    skip_heavy_models = pytest.mark.skip(reason="Need --run-heavy-models option to run heavy neural model tests")

    for item in items:
        if "live_r2" in item.keywords and not run_live_r2:
            item.add_marker(skip_live_r2)
        if "heavy_model" in item.keywords and not run_heavy_models:
            item.add_marker(skip_heavy_models)


@pytest.fixture(autouse=True)
def configure_test_environment(request, monkeypatch):
    """Ensures test suite executes in < 5 seconds without triggering heavy neural model downloads or external LLM API calls."""
    run_heavy = request.config.getoption("--run-heavy-models", default=False)
    if not run_heavy:
        try:
            from backend.app.core.config import settings
            settings.RERANKER_ENABLED = False
        except Exception:
            pass

        try:
            from backend.app.services.embedder_service import embedder_service
            monkeypatch.setattr(embedder_service, "_lazy_init", lambda: None)
            embedder_service._ready = True
            rng = np.random.RandomState(42)
            dummy_vec = rng.randn(768).astype(np.float32)
            norm = np.linalg.norm(dummy_vec)
            dummy_vec = (dummy_vec / max(1e-8, norm)).tolist()
            monkeypatch.setattr(embedder_service, "embed_query", lambda q: dummy_vec)
            monkeypatch.setattr(embedder_service, "embed_documents", lambda docs: [dummy_vec for _ in docs])
        except Exception:
            pass

        try:
            from backend.app.services.reranker_service import reranker_service
            monkeypatch.setattr(reranker_service, "_lazy_init", lambda: None)
            reranker_service._ready = True
            monkeypatch.setattr(
                reranker_service,
                "rerank",
                lambda q, chunks, top_k=None: chunks[: (top_k or 5)],
            )
        except Exception:
            pass

        try:
            from backend.app.services.llm_client import llm_client
            monkeypatch.setattr(llm_client, "_get_active_endpoint", lambda: None)
            monkeypatch.setattr(llm_client, "preload", lambda: None)
            monkeypatch.setattr(
                llm_client,
                "generate",
                lambda messages, **kwargs: "Diffusion models are score-based generative models.",
            )

            async def dummy_stream(messages, **kwargs):
                for token in ["Diffusion ", "models ", "are ", "generative."]:
                    yield token

            monkeypatch.setattr(llm_client, "generate_stream", dummy_stream)
        except Exception:
            pass


@pytest.fixture
def synthetic_papers() -> List[Dict[str, Any]]:
    """Provides a synthetic batch of academic preprint records across multiple sources."""
    return [
        {
            "paper_id": "2401.00001",
            "title": "Scaling Laws for Visual Representation Learning",
            "authors": ["Alice Smith", "Bob Jones", "Charlie Brown"],
            "primary_category": "cs.CV",
            "categories": ["cs.CV", "cs.AI", "cs.LG"],
            "abstract": "We investigate parameter scaling behavior for visual representation learning architectures.",
            "published": "2024-01-01T00:00:00Z",
            "doi": "10.1145/3600001",
            "source": "arxiv",
        },
        {
            "paper_id": "openalex:W42000001",
            "title": "Diffusion-Based Generative Video Dynamics",
            "authors": ["David Miller", "Eve Wilson"],
            "primary_category": "cs.AI",
            "categories": ["cs.AI", "cs.RO"],
            "abstract": "A unified diffusion formulation for spatial-temporal generative modeling of robotic dynamics.",
            "published": "2024-02-15T00:00:00Z",
            "doi": "10.1109/CVPR.2024.0001",
            "source": "openalex",
        },
        {
            "paper_id": "openreview:iclr2024_001",
            "title": "Direct Preference Optimization with Provable Generalization",
            "authors": ["Grace Hopper", "Alan Turing"],
            "primary_category": "cs.LG",
            "categories": ["cs.LG", "stat.ML"],
            "abstract": "Direct preference optimization provides a closed-form alternative to reinforcement learning from human feedback.",
            "published": "2024-03-20T00:00:00Z",
            "doi": None,
            "source": "openreview",
        },
    ]


@pytest.fixture
def mock_embedder():
    """Fast synthetic mock for NomicEmbedder generating normalized 768-D vectors in microseconds."""
    class MockNomicEmbedder:
        def __init__(self, dimension: int = 768):
            self.dimension = dimension

        def embed_query(self, query: str) -> List[float]:
            # Deterministic pseudo-random seed based on query length/hash
            rng = np.random.RandomState(abs(hash(query)) % (2**31))
            vec = rng.randn(self.dimension).astype(np.float32)
            norm = np.linalg.norm(vec)
            return (vec / max(1e-8, norm)).tolist()

        def embed_documents(self, documents: List[str]) -> List[List[float]]:
            return [self.embed_query(doc) for doc in documents]

        def embed_batch(self, documents: List[str], batch_size: int = 32) -> List[List[float]]:
            return self.embed_documents(documents)

    return MockNomicEmbedder()


@pytest.fixture
def mock_cross_encoder():
    """Fast synthetic mock for CrossEncoder reranker running in < 1ms."""
    class MockCrossEncoder:
        def predict(self, pairs: List[List[str]]) -> List[float]:
            scores = []
            for query, doc in pairs:
                q_words = set(query.lower().split())
                d_words = set(doc.lower().split())
                overlap = len(q_words.intersection(d_words))
                score = min(0.99, 0.2 + 0.15 * overlap)
                scores.append(score)
            return scores

    return MockCrossEncoder()


@pytest.fixture
def test_client():
    """FastAPI TestClient fixture."""
    from fastapi.testclient import TestClient
    from backend.app.main import app
    return TestClient(app)
