"""Unit tests for NomicEmbedder interface and embedding mathematics in src/indexing/embedder.py."""
import math
import numpy as np
import pytest
import torch
import torch.nn.functional as F
from src.indexing.embedder import NomicEmbedder


@pytest.mark.unit
def test_mean_pooling_math():
    # Synthetic token embeddings: batch_size=2, seq_len=3, dim=4
    token_embeddings = torch.tensor([
        [[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0], [0.0, 0.0, 0.0, 0.0]],
        [[2.0, 2.0, 2.0, 2.0], [4.0, 4.0, 4.0, 4.0], [6.0, 6.0, 6.0, 6.0]],
    ])
    # Attention mask: first sequence has length 2 (last token padded), second has length 3
    attention_mask = torch.tensor([
        [1, 1, 0],
        [1, 1, 1],
    ])

    embedder = NomicEmbedder.__new__(NomicEmbedder)
    model_output = [token_embeddings]
    pooled = embedder._mean_pooling(model_output, attention_mask)

    # First sequence mean of token 1 and 2: (1+5)/2=3, (2+6)/2=4, (3+7)/2=5, (4+8)/2=6
    assert torch.allclose(pooled[0], torch.tensor([3.0, 4.0, 5.0, 6.0]))
    # Second sequence mean of token 1, 2, 3: (2+4+6)/3=4.0 for all dims
    assert torch.allclose(pooled[1], torch.tensor([4.0, 4.0, 4.0, 4.0]))


@pytest.mark.unit
def test_l2_normalization_math():
    raw_vec = torch.tensor([[3.0, 4.0, 0.0, 0.0]])  # Norm is 5.0
    normalized = F.normalize(raw_vec, p=2, dim=1)
    expected = torch.tensor([[0.6, 0.8, 0.0, 0.0]])
    assert torch.allclose(normalized, expected)
    norm = torch.norm(normalized, p=2, dim=1).item()
    assert math.isclose(norm, 1.0, rel_tol=1e-5)


@pytest.mark.unit
def test_mock_embedder_fixture(mock_embedder):
    query_vec = mock_embedder.embed_query("Graph representation learning")
    assert len(query_vec) == 768
    norm = np.linalg.norm(query_vec)
    assert math.isclose(norm, 1.0, rel_tol=1e-4)

    doc_vecs = mock_embedder.embed_documents(["Doc 1", "Doc 2", "Doc 3"])
    assert len(doc_vecs) == 3
    for v in doc_vecs:
        assert len(v) == 768
        assert math.isclose(np.linalg.norm(v), 1.0, rel_tol=1e-4)

    batch_vecs = mock_embedder.embed_batch(["Batch Doc 1", "Batch Doc 2"])
    assert len(batch_vecs) == 2
