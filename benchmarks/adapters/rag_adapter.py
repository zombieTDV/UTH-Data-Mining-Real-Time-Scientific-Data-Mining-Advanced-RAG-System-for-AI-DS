"""
benchmarks/adapters/rag_adapter.py
----------------------------------
Bridge between UTH Scientific RAG system and DeepEval's LLMTestCase.
Executes queries via RagService, collects generated answers, citations,
and retrieval chunks, and outputs standardized evaluation test cases.
"""

import logging
import time
from typing import Any, Dict, List, Optional
from deepeval.test_case import LLMTestCase
from backend.app.schemas.chat import ChatRequest
from backend.app.services.rag_service import rag_service

logger = logging.getLogger("rag_adapter")


def run_rag_test_case(
    golden_item: Dict[str, Any],
    top_k: int = 5,
    category: Optional[str] = None,
    temperature: float = 0.2,
) -> LLMTestCase:
    """Executes a single RAG query against the live service and constructs an LLMTestCase."""
    query = golden_item["query"]
    expected_output = golden_item.get("expected_output")
    selected_category = category or golden_item.get("category")

    req = ChatRequest(
        query=query,
        top_k=top_k,
        category=selected_category,
        temperature=temperature,
    )

    try:
        t0 = time.time()
        response = rag_service.answer_query(req)
        elapsed = time.time() - t0
    except Exception as e:
        logger.error("[ADAPTER ERROR] Query '%s' failed: %s. Retrying once in 2s...", query[:40], str(e))
        time.sleep(2.0)
        t0 = time.time()
        response = rag_service.answer_query(req)
        elapsed = time.time() - t0

    retrieval_context = response.retrieval_context or []
    if not retrieval_context and response.context_chunks_used > 0:
        logger.warning(
            "[ADAPTER] context_chunks_used is %d but retrieval_context is empty for query: '%s'",
            response.context_chunks_used,
            query[:50],
        )

    logger.info(
        "[ADAPTER] Query executed in %.2fs | Chunks: %d | Answer len: %d chars",
        elapsed,
        len(retrieval_context),
        len(response.answer),
    )

    return LLMTestCase(
        input=query,
        actual_output=response.answer,
        expected_output=expected_output,
        retrieval_context=retrieval_context,
    )


def build_test_cases_from_goldens(
    goldens: List[Dict[str, Any]],
    top_k: int = 5,
    category: Optional[str] = None,
    temperature: float = 0.2,
) -> List[LLMTestCase]:
    """Iterates through a list of golden questions and generates LLMTestCase instances."""
    test_cases: List[LLMTestCase] = []
    for idx, g in enumerate(goldens, start=1):
        logger.info("[ADAPTER] Processing Golden %d/%d (ID: %s)", idx, len(goldens), g.get("id"))
        tc = run_rag_test_case(
            golden_item=g,
            top_k=top_k,
            category=category,
            temperature=temperature,
        )
        test_cases.append(tc)
    return test_cases
