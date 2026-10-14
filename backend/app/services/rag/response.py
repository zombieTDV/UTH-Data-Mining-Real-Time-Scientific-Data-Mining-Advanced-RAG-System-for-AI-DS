from typing import List

from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.search import ChunkDto
from backend.app.services.rag.constants import (
    DEFAULT_SIMILARITY_SCORE,
    DEFAULT_TOP_SCORE,
    MAX_CITATIONS,
    NO_MATCHING_ANSWER,
)


def format_top_score(chunks: List[ChunkDto]) -> str:
    return f"{chunks[0].score:.4f}" if chunks[0].score else DEFAULT_TOP_SCORE


def build_no_match_response(req: ChatRequest, elapsed: float) -> ChatResponse:
    return ChatResponse(
        query=req.query,
        answer=NO_MATCHING_ANSWER,
        citations=[],
        similarity_score=DEFAULT_SIMILARITY_SCORE,
        generation_time=f"{elapsed}s",
        context_chunks_used=0,
    )


def build_answer_response(
    req: ChatRequest,
    answer: str,
    chunks: List[ChunkDto],
    citations: List[str],
    elapsed: float,
) -> ChatResponse:
    return ChatResponse(
        query=req.query,
        answer=answer,
        citations=citations[:MAX_CITATIONS],
        similarity_score=format_top_score(chunks),
        generation_time=f"{elapsed}s",
        context_chunks_used=len(chunks),
    )
