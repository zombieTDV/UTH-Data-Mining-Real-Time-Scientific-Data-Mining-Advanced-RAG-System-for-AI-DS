from typing import List

from backend.app.schemas.search import ChunkDto
from backend.app.services.rag.constants import OFFLINE_INSTRUCTION


def build_offline_answer(chunks: List[ChunkDto], citations: List[str]) -> str:
    top_chunk = chunks[0]
    return (
        f"[Local LLM server (:9001 / :11434) is offline - showing grounded context]\n\n"
        f"According to [{citations[0]}]:\n\n"
        f"\"{top_chunk.text}\"\n\n"
        f"{OFFLINE_INSTRUCTION}"
    )


def resolve_answer(generated_answer, chunks: List[ChunkDto], citations: List[str]) -> str:
    if generated_answer:
        return generated_answer.strip()
    return build_offline_answer(chunks, citations)
