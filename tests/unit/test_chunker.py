"""Unit tests for AcademicChunker in src/indexing/chunker.py."""
import pytest
from src.indexing.chunker import AcademicChunker


@pytest.mark.unit
def test_chunker_initialization():
    chunker = AcademicChunker(max_chunk_words=300, overlap_paragraphs=2)
    assert chunker.max_chunk_words == 300
    assert chunker.overlap_paragraphs == 2


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
    paper = {
        "paper_id": "test_001",
        "title": "A Test Paper on Graph Mining",
        "abstract": "This abstract introduces graph neural methods.",
        "authors": ["John Doe"],
        "primary_category": "cs.AI",
        "sections_json": [
            {
                "section_title": "Introduction",
                "section_type": "intro",
                "content": "Graph neural networks generalize convolutions to arbitrary topologies with permutation invariance across complex non-Euclidean academic citation network structures and domains.",
                "paragraphs": ["Graph neural networks generalize convolutions to arbitrary topologies with permutation invariance across complex non-Euclidean academic citation network structures and domains."],
            },
            {
                "section_title": "Related Work",
                "section_type": "related_work",
                "content": "Short text",  # < 15 words, should be skipped
                "paragraphs": ["Short text"],
            },
        ],
    }

    chunker = AcademicChunker(max_chunk_words=200)
    chunks = chunker.chunk_paper(paper)

    # Should have 1 abstract chunk + 1 intro chunk (related work is skipped because < 15 words)
    assert len(chunks) == 2
    assert chunks[0]["section_title"] == "Abstract"
    assert chunks[1]["section_title"] == "Introduction"
    assert chunks[1]["section_type"] == "intro"


@pytest.mark.unit
def test_chunk_paper_empty_record():
    chunker = AcademicChunker()
    chunks = chunker.chunk_paper({})
    assert chunks == []
