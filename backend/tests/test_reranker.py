"""
backend/tests/test_reranker.py
------------------------------
Unit tests for Cross-Encoder Reranker Service and in-memory lexical scoring.
"""

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from backend.app.schemas.search import ChunkDto
from backend.app.services.reranker_service import reranker_service
from backend.app.services.retrieval_service import retrieval_service


def test_lexical_scoring():
    query = "What is the role of DPO in alignment?"
    
    # Exact match on acronym DPO and alignment in title and text
    text_relevant = "Direct Preference Optimization (DPO) simplifies reinforcement learning from human feedback for language model alignment."
    score_rel = retrieval_service._compute_lexical_score(query, text_relevant, title="Direct Preference Optimization (DPO)", section="Method")
    
    # Unrelated text
    text_irrelevant = "Convolutional neural networks are commonly used for image classification and object detection in computer vision."
    score_irrel = retrieval_service._compute_lexical_score(query, text_irrelevant, title="CNN Overview", section="Intro")
    
    assert score_rel > score_irrel
    assert score_rel > 0.5
    assert score_irrel < 0.2


def test_reranker_service_empty():
    res = reranker_service.rerank("diffusion models", [])
    assert res == []


def test_reranker_service_ordering():
    query = "How does Low-Rank Adaptation (LoRA) reduce trainable parameters?"
    
    chunk_exact = ChunkDto(
        chunk_id="chunk-1",
        paper_id="2106.09685",
        title="LoRA: Low-Rank Adaptation of Large Language Models",
        text="LoRA freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture, greatly reducing the number of trainable parameters.",
        section_title="Introduction",
        score=0.72,
    )
    
    chunk_tangential = ChunkDto(
        chunk_id="chunk-2",
        paper_id="2005.14165",
        title="Language Models are Few-Shot Learners",
        text="We demonstrate that scaling up language models greatly improves task-agnostic few-shot performance on a wide range of natural language benchmarks.",
        section_title="Abstract",
        score=0.91,  # Bi-encoder mistakenly gave higher cosine score to famous GPT-3 paper
    )
    
    chunk_irrelevant = ChunkDto(
        chunk_id="chunk-3",
        paper_id="1706.03762",
        title="Attention Is All You Need",
        text="The Transformer is the first transduction model relying entirely on self-attention to compute representations of its input and output without using sequence-aligned RNNs or convolution.",
        section_title="Model Architecture",
        score=0.85,
    )
    
    # Prior to reranking, chunk_tangential is at rank 1 due to high bi-encoder score
    raw_candidates = [chunk_tangential, chunk_irrelevant, chunk_exact]
    
    # Execute cross-encoder reranking
    reranked = reranker_service.rerank(query, raw_candidates, top_k=2)
    
    assert len(reranked) == 2
    # The exact LoRA chunk MUST be reranked to position 1!
    assert reranked[0].chunk_id == "chunk-1"
    assert reranked[0].paper_id == "2106.09685"
    assert 0.0 <= reranked[0].score <= 1.0
    assert reranked[0].score > reranked[1].score


if __name__ == "__main__":
    test_lexical_scoring()
    print("PASS: test_lexical_scoring")
    test_reranker_service_empty()
    print("PASS: test_reranker_service_empty")
    test_reranker_service_ordering()
    print("PASS: test_reranker_service_ordering")
    print("ALL RERANKER TESTS PASSED!")
