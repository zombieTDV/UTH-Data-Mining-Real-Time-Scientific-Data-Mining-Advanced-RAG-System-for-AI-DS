from typing import List

from backend.app.schemas.search import ChunkDto
from backend.app.services.rag.constants import FALLBACK_SECTION_CONTEXT, FALLBACK_TITLE


def resolve_chunk_title(chunk: ChunkDto) -> str:
    return chunk.title or FALLBACK_TITLE


def format_chunk_context(chunk: ChunkDto) -> str:
    title = resolve_chunk_title(chunk)
    section = chunk.section_title or FALLBACK_SECTION_CONTEXT
    return (
        f"--- [Paper ID: {chunk.paper_id} | Title: \"{title}\" | Section: {section}] ---\n"
        f"{chunk.text}\n"
    )


def build_context_text(chunks: List[ChunkDto]) -> str:
    return "\n".join(format_chunk_context(c) for c in chunks)
