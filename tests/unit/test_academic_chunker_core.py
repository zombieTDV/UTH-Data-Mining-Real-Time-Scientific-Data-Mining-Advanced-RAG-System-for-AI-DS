import pytest
import json
from src.indexing.chunker import AcademicChunker


@pytest.fixture
def chunker():
    return AcademicChunker(max_chunk_words=100, overlap_words=20)


def test_chunk_paper_abstract_only(chunker):
    paper = {
        "paper_id": "2401.0001",
        "title": "Quantum Error Correction",
        "abstract": "We present surface codes with low overhead.",
        "authors": ["Alice", "Bob"],
        "primary_category": "quant-ph",
    }
    chunks = chunker.chunk_paper(paper)
    assert len(chunks) == 1
    c = chunks[0]
    assert c["chunk_id"] == "2401.0001_abs"
    assert c["section_type"] == "abstract"
    assert c["word_count"] == 7
    assert "Paper: \"Quantum Error Correction\" | Section: Abstract" in c["context_text"]


def test_chunk_paper_structured_sections_json(chunker):
    sections = [
        {
            "section_title": "Introduction",
            "section_type": "intro",
            "content": "This paper explores quantum computing architectures and fault tolerance." * 5
        },
        {
            "section_title": "Methodology",
            "section_type": "method",
            # Exceeds max_chunk_words (100) to trigger multi-part sliding window splitting
            "content": "Quantum gates are operated with high fidelity using pulsed lasers. " * 30
        }
    ]
    paper = {
        "paper_id": "2401.0002",
        "title": "Fault Tolerance",
        "abstract": "Abstract overview",
        "sections_json": json.dumps(sections),
        "authors": ["Charlie"],
    }
    chunks = chunker.chunk_paper(paper)
    # 1 abstract chunk + 1 intro chunk + multiple methodology parts
    assert len(chunks) >= 3
    abs_chunk = chunks[0]
    assert abs_chunk["chunk_id"] == "2401.0002_abs"

    intro_chunk = chunks[1]
    assert intro_chunk["chunk_id"] == "2401.0002_sec0"
    assert intro_chunk["section_type"] == "intro"

    part_chunks = [c for c in chunks if "sec1_p" in c["chunk_id"]]
    assert len(part_chunks) >= 2
    assert "Part 1" in part_chunks[0]["section_title"]
    assert "Part 2" in part_chunks[1]["section_title"]


def test_chunk_paper_heading_regex_splits(chunker):
    body_text = (
        "1. Introduction\n\nDeep learning requires massive compute and large parameters.\n\n"
        "2. Methodology\n\nWe introduce a sparse mixture of experts layer.\n\n"
        "3. Experiments\n\nWe evaluate our model on ImageNet and COCO benchmarks.\n\n"
        "4. Conclusion\n\nIn conclusion, our approach drastically reduces training FLOPs."
    )
    # Multiply to satisfy length thresholds
    body_expanded = (
        "1. Introduction\n\n" + ("Deep learning requires massive compute and large parameters. " * 10) + "\n\n"
        "2. Methodology\n\n" + ("We introduce a sparse mixture of experts layer with dynamic routing. " * 10) + "\n\n"
        "3. Experiments\n\n" + ("We evaluate our model on ImageNet and COCO benchmarks with high accuracy. " * 10) + "\n\n"
        "4. Conclusion\n\n" + ("In conclusion, our approach drastically reduces training FLOPs. " * 10)
    )
    paper = {
        "paper_id": "2401.0003",
        "title": "Mixture of Experts",
        "abstract": "Short abstract",
        "clean_full_text": body_expanded,
    }
    chunks = chunker.chunk_paper(paper)
    chunk_titles = [c["section_title"] for c in chunks]
    assert any("Introduction" in t for t in chunk_titles)
    assert any("Methodology" in t for t in chunk_titles)
    assert any("Experiments" in t for t in chunk_titles)
    assert any("Conclusion" in t for t in chunk_titles)


def test_chunk_paper_unstructured_body_fallback(chunker):
    # Long text with no recognized academic headings
    unstructured_body = "Continuous sentences without standard headings describing a mathematical proof. " * 30
    paper = {
        "paper_id": "2401.0004",
        "title": "Unstructured Notes",
        "clean_full_text": unstructured_body,
    }
    chunks = chunker.chunk_paper(paper)
    assert len(chunks) >= 2
    assert all("Main Body" in c["section_title"] for c in chunks)
    assert chunks[0]["chunk_id"] == "2401.0004_body_p1"


def test_chunk_paper_abstract_semantic_slicing(chunker):
    # Test multi-granular slicing when only a long abstract is present (>= 160 words)
    long_abstract = "This is a detailed abstract discussing the challenges in modern machine learning systems. " * 20
    assert len(long_abstract.split()) >= 160

    paper = {
        "paper_id": "2401.0005",
        "title": "Abstract Only Long Paper",
        "abstract": long_abstract,
    }
    chunks = chunker.chunk_paper(paper)
    # Should produce 1 top-level abstract + 2 semantic slices (_abs_p1 and _abs_p2)
    assert len(chunks) == 3
    chunk_ids = [c["chunk_id"] for c in chunks]
    assert "2401.0005_abs" in chunk_ids
    assert "2401.0005_abs_p1" in chunk_ids
    assert "2401.0005_abs_p2" in chunk_ids
