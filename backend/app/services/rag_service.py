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
from backend.app.services.reranker_service import reranker_service
from backend.app.services.llm_client import llm_client

logger = logging.getLogger("rag_service")


class RagService:
    def _build_prompt_and_context(self, req: ChatRequest) -> Tuple[List[dict], List[ChunkDto], List[str]]:
        """Retrieves candidates from LanceDB, reranks with cross-encoder, and constructs strictly grounded academic prompts."""
        # 1. Retrieve wider candidate pool from LanceDB (Hybrid mode)
        candidate_k = settings.RERANKER_CANDIDATE_K if settings.RERANKER_ENABLED else (req.top_k or 5)
        search_req = SearchRequest(
            query=req.query,
            top_k=candidate_k,
            category=req.category,
            mode="hybrid",
        )
        candidates = retrieval_service.search(search_req)

        # 2. Cross-Encoder reranking (bge-reranker-base)
        if settings.RERANKER_ENABLED and candidates:
            final_k = req.top_k or settings.RERANKER_TOP_K
            chunks = reranker_service.rerank(req.query, candidates, top_k=final_k)
        else:
            chunks = candidates[: (req.top_k or 5)]

        # 3. Extract citations and format context
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

        # 4. Check for graph authority nodes and rule expansions
        top_auth_chunk = next((c for c in chunks if c.authority_score and c.authority_author), None)
        authority_note = ""
        if top_auth_chunk:
            authority_note = (
                f"\n6. Graph PageRank Authority: Paper [Paper: {top_auth_chunk.paper_id}] is authored by high-impact "
                f"citation network influencer '{top_auth_chunk.authority_author}' (Normalized PageRank: {top_auth_chunk.authority_score:.2f}). "
                "Highlight this authoritative foundation when synthesizing comparative insights."
            )

        # 5. Construct System and User messages with strict negative constraints
        system_prompt = (
            "You are a strictly grounded scientific research assistant specializing in Machine Learning and Computer Science.\n"
            "Your mission is to provide rigorous, truthful, and accurate technical answers based EXCLUSIVELY on the retrieved scientific literature excerpts below.\n\n"
            "CRITICAL OPERATIONAL RULES:\n"
            "1. STRICT FACTUAL GROUNDING: Rely SOLELY and EXCLUSIVELY on facts explicitly stated in the provided paper excerpts. DO NOT extrapolate, assume, or utilize pre-trained parametric memory for empirical values, hyperparameter settings, author claims, or ablation results.\n"
            "2. MISSING INFORMATION PROTOCOL: If the provided excerpts do not explicitly contain the necessary information to address any part of the user's question, you MUST explicitly state: \"The provided literature does not contain sufficient details regarding [specific aspect].\" NEVER invent, approximate, or extrapolate missing facts.\n"
            "3. MANDATORY CITATIONS: Every substantive technical claim, architectural detail, and performance metric must cite the exact paper using `[Paper: {paper_id}]`.\n"
            "4. DIRECT & CONCISE: Answer directly, concisely, and formally without introductory conversational pleasantries, filler, or unrequested tangential background.\n"
            f"5. OBJECTIVE SYNTHESIS: When multiple papers discuss related concepts, compare their approaches objectively.{authority_note}"
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
                retrieval_context=[],
            )

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
                f"According to [{citations[0]}]:\n\n"
                f"\"{top_chunk.text}\"\n\n"
                f"(Start the local LLM with `npm run start:llm` to enable full neural generative answers)."
            )

        elapsed = round(time.time() - t0, 2)
        top_score = f"{chunks[0].score:.4f}" if chunks[0].score else "0.8500"
        top_auth = next((c for c in chunks if c.authority_author), None)

        return ChatResponse(
            query=req.query,
            answer=answer,
            citations=citations[:5],
            similarity_score=top_score,
            generation_time=f"{elapsed}s",
            context_chunks_used=len(chunks),
            authority_boosted=bool(top_auth),
            top_influencer_author=top_auth.authority_author if top_auth else None,
            rule_expansions=chunks[0].rule_expansions if (chunks and chunks[0].rule_expansions) else None,
            retrieval_context=[c.text for c in chunks],
        )

    async def answer_query_stream(self, req: ChatRequest) -> AsyncIterator[str]:
        """Streams LLM tokens generated for the grounded RAG query."""
        messages, chunks, _ = self._build_prompt_and_context(req)

        if not chunks:
            yield "No matching scientific literature found in the Gold lakehouse for the given query."
            return

        async for token in llm_client.generate_stream(messages, temperature=req.temperature):
            yield token


rag_service = RagService()
