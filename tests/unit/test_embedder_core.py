"""Unit tests for src/indexing/embedder.py and backend/app/services/embedder_service.py
verifying mean pooling mathematics, L2 normalization invariance (||v||_2 = 1.0),
prefix formatting, and batch dimension consistency.
"""
from unittest.mock import MagicMock, patch
import numpy as np
import torch
import pytest

from src.indexing.embedder import NomicEmbedder
from backend.app.services.embedder_service import EmbedderService


@pytest.fixture
def mock_nomic_embedder():
    with patch("transformers.AutoTokenizer.from_pretrained") as mock_tok, \
         patch("transformers.AutoModel.from_pretrained") as mock_mod:
        embedder = object.__new__(NomicEmbedder)
        embedder.device = torch.device("cpu")
        embedder.tokenizer = MagicMock()
        embedder.model = MagicMock()
        return embedder


# ==============================================================================
# 1. Mean Pooling Mathematics
# ==============================================================================

@pytest.mark.unit
def test_mean_pooling_weighted_by_attention_mask(mock_nomic_embedder):
    # Batch of 2 tokens, embedding dimension 4
    # Token 1: [2, 2, 2, 2], Token 2: [4, 4, 4, 4]
    token_embeddings = torch.tensor([[[2.0, 2.0, 2.0, 2.0], [4.0, 4.0, 4.0, 4.0]]])
    # Attention mask: both tokens active -> mean = (2 + 4) / 2 = 3.0
    attention_mask_both = torch.tensor([[1, 1]])

    pooled_both = mock_nomic_embedder._mean_pooling((token_embeddings,), attention_mask_both)
    expected_both = torch.tensor([[3.0, 3.0, 3.0, 3.0]])
    assert torch.allclose(pooled_both, expected_both)

    # Attention mask: only first token active (second is padding) -> mean = 2.0
    attention_mask_first = torch.tensor([[1, 0]])
    pooled_first = mock_nomic_embedder._mean_pooling((token_embeddings,), attention_mask_first)
    expected_first = torch.tensor([[2.0, 2.0, 2.0, 2.0]])
    assert torch.allclose(pooled_first, expected_first)


# ==============================================================================
# 2. L2 Normalization Invariance
# ==============================================================================

from transformers import BatchEncoding


@pytest.mark.unit
def test_embed_query_l2_unit_norm(mock_nomic_embedder):
    # Mock model output returning unnormalized embeddings
    raw_vec = torch.tensor([[[10.0, 20.0, -30.0, 40.0]]])
    mock_nomic_embedder.model.return_value = (raw_vec,)
    mock_nomic_embedder.tokenizer.return_value = BatchEncoding({
        "attention_mask": torch.tensor([[1]]),
        "input_ids": torch.tensor([[101]]),
    })

    vec = mock_nomic_embedder.embed_query("quantum computing")

    # Invariant: vector must have unit Euclidean norm ||v||_2 = 1.0
    arr = np.array(vec)
    norm = np.linalg.norm(arr)
    assert pytest.approx(norm, rel=1e-5) == 1.0

    # Prefix verification: must prepend "search_query: "
    call_args = mock_nomic_embedder.tokenizer.call_args[0][0]
    assert call_args == ["search_query: quantum computing"]


@pytest.mark.unit
def test_embed_documents_batch_and_prefix(mock_nomic_embedder):
    docs = ["First paper section", "Second paper methodology"]

    raw_vec = torch.tensor([[[5.0, 5.0]], [[10.0, 10.0]]])
    mock_nomic_embedder.model.return_value = (raw_vec,)
    mock_nomic_embedder.tokenizer.return_value = BatchEncoding({
        "attention_mask": torch.tensor([[1], [1]]),
        "input_ids": torch.tensor([[1], [2]]),
    })

    embeddings = mock_nomic_embedder.embed_documents(docs, batch_size=2)

    assert len(embeddings) == 2
    for emb in embeddings:
        assert pytest.approx(np.linalg.norm(np.array(emb)), rel=1e-5) == 1.0

    # Prefix verification: must prepend "search_document: "
    call_args = mock_nomic_embedder.tokenizer.call_args[0][0]
    assert call_args[0].startswith("search_document: ")
    assert call_args[1].startswith("search_document: ")


# ==============================================================================
# 3. Backend EmbedderService
# ==============================================================================

@pytest.mark.unit
def test_embedder_service_lazy_init_and_query():
    svc = object.__new__(EmbedderService)
    svc.model_path = "nomic-ai/nomic-embed-text-v1.5"
    svc.tokenizer = MagicMock()
    svc.model = MagicMock()
    svc.device = torch.device("cpu")
    svc._ready = True

    raw_vec = torch.tensor([[[1.0, 2.0, 3.0]]])
    svc.model.return_value = (raw_vec,)
    svc.tokenizer.return_value = BatchEncoding({
        "attention_mask": torch.tensor([[1]]),
        "input_ids": torch.tensor([[1]]),
    })

    vec = svc.embed_query("diffusion models")
    assert vec is not None
    assert pytest.approx(np.linalg.norm(np.array(vec)), rel=1e-5) == 1.0


@pytest.mark.unit
def test_embedder_service_lru_cache():
    svc = EmbedderService()
    svc.device = torch.device("cpu")
    svc._ready = True
    svc.tokenizer = MagicMock()
    svc.model = MagicMock()

    raw_vec = torch.tensor([[[2.0, 0.0, 0.0]]])
    svc.model.return_value = (raw_vec,)
    svc.tokenizer.return_value = BatchEncoding({
        "attention_mask": torch.tensor([[1]]),
        "input_ids": torch.tensor([[1]]),
    })

    # First call runs model
    vec1 = svc.embed_query("reinforcement learning")
    assert vec1 is not None
    assert svc.model.call_count == 1

    # Second identical call must hit LRU cache without invoking model or tokenizer
    vec2 = svc.embed_query("reinforcement learning")
    assert vec2 == vec1
    assert svc.model.call_count == 1

