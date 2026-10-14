from typing import List

from backend.app.schemas.search import ChunkDto
from backend.app.services.rag.constants import FALLBACK_SECTION_CITATION


def build_citation(chunk: ChunkDto) -> str:
    return f"Paper: {chunk.paper_id}, Section: {chunk.section_title or FALLBACK_SECTION_CITATION}"


def extract_citations(chunks: List[ChunkDto]) -> List[str]:
    citations: List[str] = []
    for chunk in chunks:
        cite_str = build_citation(chunk)
        if cite_str not in citations:
            citations.append(cite_str)
    return citations
