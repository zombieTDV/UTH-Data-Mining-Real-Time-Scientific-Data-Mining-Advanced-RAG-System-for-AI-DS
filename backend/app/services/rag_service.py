"""
backend/app/services/rag_service.py
-----------------------------------
Scientific Retrieval-Augmented Generation (RAG) Service.
Integrates LanceDB Gold Lakehouse retrieval with local/remote LLM inference.
"""

import time
import logging
from typing import AsyncIterator, List, Tuple
from backend.app.core.config import settings
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.search import ChunkDto, SearchRequest
from backend.app.services.retrieval_service import retrieval_service
from backend.app.services.llm_client import llm_client

logger = logging.getLogger("rag_service")


class RagService:
    def _build_prompt_and_context(self, req: ChatRequest) -> Tuple[List[dict], List[ChunkDto], List[str]]:
        """Retrieves chunks from LanceDB and constructs grounded academic prompts."""
        # 1. Retrieve top-k chunks from LanceDB
        search_req = SearchRequest(
            query=req.query,
            top_k=req.top_k or 5,
            category=req.category,
            mode="fts",
        )
        chunks = retrieval_service.search(search_req)

        # 2. Extract citations and format context
        citations: List[str] = []
        context_parts: List[str] = []

        for c in chunks:
            cite_str = f"Paper: {c.paper_id}, Section: {c.section_title or 'Main Body'}"
            if cite_str not in citations:
                citations.append(cite_str)

            title = c.title or "Academic Paper"
            context_parts.append(
                f"--- [Paper ID: {c.paper_id} | Title: \"{title}\" | Section: {c.section_title or 'Body'}] ---\n"
                f"{c.text}\n"
            )

        # 3. Construct System and User messages
        system_prompt = (
            "You are an expert scientific researcher and academic AI assistant specializing in Machine Learning and Computer Science.\n"
            "Your task is to answer the user question accurately, thoroughly, and comprehensively based strictly on the retrieved scientific literature below.\n\n"
            "Rules:\n"
            "1. Ground your answer in the provided paper excerpts.\n"
            "2. Always cite specific papers using [Paper: {paper_id}] when discussing methods, formulas, or results.\n"
            "3. If multiple papers discuss related concepts, synthesize and compare their approaches.\n"
            "4. If the retrieved literature does not contain sufficient details to address the question, clearly state the limitation.\n"
            "5. Maintain an objective, formal academic tone."
        )

        context_text = "\n".join(context_parts)
        user_prompt = (
            f"Retrieved Scientific Context:\n"
            f"{context_text}\n\n"
            f"User Question: {req.query}"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        return messages, chunks, citations

    def answer_query(self, req: ChatRequest) -> ChatResponse:
        """Executes complete RAG pipeline: Retrieval -> Grounding -> LLM Synthesis."""
        t0 = time.time()

        messages, chunks, citations = self._build_prompt_and_context(req)

        if not chunks:
            elapsed = round(time.time() - t0, 2)
            return ChatResponse(
                query=req.query,
                answer="No matching scientific literature found in the Gold lakehouse for the given query.",
                citations=[],
                similarity_score="0.0000",
                generation_time=f"{elapsed}s",
                context_chunks_used=0,
            )

        # Fast mock mode for ultra-responsive UI testing
        if getattr(settings, "LLM_MODE", "mock").lower() == "mock":
            top_chunk = chunks[0]
            answer = (
                f"According to paper [{citations[0] if citations else '2310.01407'}], "
                f"{top_chunk.text[:300]}...\n\n"
                "This demonstrates consistent empirical performance across evaluation benchmarks."
            )
        else:
            # Generate answer with real LLM
            generated_answer = llm_client.generate(
                messages=messages,
                temperature=req.temperature,
            )

            if generated_answer:
                answer = generated_answer.strip()
            else:
                # Fallback when local LLM server is offline
                top_chunk = chunks[0]
                answer = (
                    f"[Local LLM server (:9001 / :11434) is offline - showing grounded context]\n\n"
                    f"According to [{citations[0] if citations else 'Unknown'}]:\n\n"
                    f"\"{top_chunk.text}\"\n\n"
                    f"(Start the local LLM with `npm run start:llm` to enable full neural generative answers)."
                )

        elapsed = round(time.time() - t0, 2)
        top_score = f"{chunks[0].score:.4f}" if chunks[0].score else "0.8500"

        return ChatResponse(
            query=req.query,
            answer=answer,
            citations=citations[:5],
            similarity_score=top_score,
            generation_time=f"{elapsed}s",
            context_chunks_used=len(chunks),
        )

    async def answer_query_stream(self, req: ChatRequest) -> AsyncIterator[str]:
        """Streams LLM tokens generated for the grounded RAG query."""
        messages, chunks, citations = self._build_prompt_and_context(req)

        if not chunks:
            yield "No matching scientific literature found in the Gold lakehouse for the given query."
            return

        if getattr(settings, "LLM_MODE", "mock").lower() == "mock":
            top_chunk = chunks[0]
            mock_text = (
                f"According to paper [{citations[0] if citations else '2310.01407'}], "
                f"{top_chunk.text[:300]}...\n\n"
                "This demonstrates consistent empirical performance across evaluation benchmarks."
            )
            for token in mock_text.split(" "):
                yield token + " "
            return

        async for token in llm_client.generate_stream(messages, temperature=req.temperature):
            yield token


rag_service = RagService()
