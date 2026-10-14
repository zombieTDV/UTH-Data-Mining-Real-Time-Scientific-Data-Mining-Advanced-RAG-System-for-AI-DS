import time
from typing import AsyncIterator, List, Tuple

from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.search import ChunkDto
from backend.app.services.llm import llm_client
from backend.app.services.rag.citations import extract_citations
from backend.app.services.rag.constants import NO_MATCHING_ANSWER
from backend.app.services.rag.fallback import resolve_answer
from backend.app.services.rag.prompt import build_messages
from backend.app.services.rag.response import build_answer_response, build_no_match_response
from backend.app.services.rag.retrieval import fetch_chunks


class RagService:
    def _build_prompt_and_context(
        self, req: ChatRequest
    ) -> Tuple[List[dict], List[ChunkDto], List[str]]:
        chunks = fetch_chunks(req)
        citations = extract_citations(chunks)
        messages = build_messages(req, chunks)
        return messages, chunks, citations

    def answer_query(self, req: ChatRequest) -> ChatResponse:
        t0 = time.time()

        messages, chunks, citations = self._build_prompt_and_context(req)

        if not chunks:
            elapsed = round(time.time() - t0, 2)
            return build_no_match_response(req, elapsed)

        generated_answer = llm_client.generate(
            messages=messages,
            temperature=req.temperature,
        )
        answer = resolve_answer(generated_answer, chunks, citations)
        elapsed = round(time.time() - t0, 2)

        return build_answer_response(req, answer, chunks, citations, elapsed)

    async def answer_query_stream(self, req: ChatRequest) -> AsyncIterator[str]:
        messages, chunks, _ = self._build_prompt_and_context(req)

        if not chunks:
            yield NO_MATCHING_ANSWER
            return

        async for token in llm_client.generate_stream(messages, temperature=req.temperature):
            yield token


rag_service = RagService()
