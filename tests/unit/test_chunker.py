"""Unit tests for AcademicChunker in src/indexing/chunker.py."""
import pytest
from src.indexing.chunker import AcademicChunker


@pytest.mark.unit
def test_chunker_initialization():
    chunker = AcademicChunker(max_chunk_words=300, overlap_words=50)
    assert chunker.max_chunk_words == 300
    assert chunker.overlap_words == 50


@pytest.mark.unit
def test_chunk_paper_with_abstract_only(synthetic_papers):
    paper = synthetic_papers[0]
    chunker = AcademicChunker()
    chunks = chunker.chunk_paper(paper)

    assert len(chunks) == 1
    c = chunks[0]
    assert c["paper_id"] == paper["paper_id"]
    assert c["section_title"] == "Abstract"
    assert c["section_type"] == "abstract"
    assert c["title"] == paper["title"]
    assert c["authors"] == paper["authors"]
    assert c["primary_category"] == paper["primary_category"]
    assert "Paper: " in c["context_text"]
    assert c["word_count"] == len(paper["abstract"].split())


@pytest.mark.unit
def test_chunk_paper_with_sections():
    intro_text = (
        "Graph neural networks generalize traditional convolutional architectures to arbitrary topological spaces "
        "and non-Euclidean academic structures. In this comprehensive study, we formally formulate message passing "
        "algorithms that preserve permutation invariance and equivariance across heterogeneous citation networks."
    )
    paper = {
        "paper_id": "test_001",
        "title": "A Test Paper on Graph Mining",
        "abstract": "This abstract introduces graph neural methods for large-scale scientific citation discovery.",
        "authors": ["John Doe"],
        "primary_category": "cs.AI",
        "sections_json": [
            {
                "section_title": "Introduction",
                "section_type": "intro",
                "content": intro_text,
            },
            {
                "section_title": "Related Work",
                "section_type": "related_work",
                "content": "Short text",  # < 25 words, should be skipped
            },
        ],
    }

    chunker = AcademicChunker(max_chunk_words=200, overlap_words=50)
    chunks = chunker.chunk_paper(paper)

    # Should have 1 abstract chunk + 1 intro chunk (related work is skipped because < 25 words)
    assert len(chunks) == 2
    assert chunks[0]["section_title"] == "Abstract"
    assert chunks[1]["section_title"] == "Introduction"
    assert chunks[1]["section_type"] == "intro"
    assert chunks[1]["word_count"] >= 25


@pytest.mark.unit
def test_chunk_paper_empty_record():
    chunker = AcademicChunker()
    chunks = chunker.chunk_paper({})
    assert chunks == []
