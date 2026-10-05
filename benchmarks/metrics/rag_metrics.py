"""
benchmarks/metrics/rag_metrics.py
---------------------------------
DeepEval RAG Metric configurations:
1. FaithfulnessMetric: detects factual hallucinations against retrieved context
2. AnswerRelevancyMetric: evaluates semantic alignment between query and response
3. ContextualPrecisionMetric: evaluates ranking quality of retrieved chunks
4. ContextualRecallMetric: evaluates ground-truth coverage in retrieved context
5. ContextualRelevancyMetric: measures noise/relevance density in retrieval
6. GEval (Academic Citation Grounding): checks valid citation attribution
"""

import logging
from typing import List, Optional
from deepeval.metrics import (
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    FaithfulnessMetric,
    GEval,
)
from deepeval.test_case import LLMTestCaseParams
from benchmarks.judges.custom_judge import get_judge_llm

logger = logging.getLogger("rag_metrics")


def create_citation_grounding_metric(judge_llm, async_mode: bool = False) -> GEval:
    """GEval custom metric verifying that academic paper citations are valid and grounded."""
    return GEval(
        name="Academic Citation Grounding",
        criteria=(
            "Assess whether the actual output properly cites the provided papers using "
            "[Paper: <id>] or section references, and that every claim attributed to a "
            "paper is strictly supported by the corresponding excerpt in the retrieval context. "
            "Penalize hallucinated paper citations or unattributed factual assertions."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.RETRIEVAL_CONTEXT,
        ],
        model=judge_llm,
        threshold=0.70,
        async_mode=async_mode,
    )


def build_rag_benchmark_metrics(
    judge_mode: Optional[str] = None,
    include_ranking_metrics: bool = True,
    faithfulness_threshold: float = 0.70,
    relevancy_threshold: float = 0.75,
    precision_threshold: float = 0.70,
    recall_threshold: float = 0.70,
    context_relevancy_threshold: float = 0.60,
    async_mode: Optional[bool] = None,
) -> List:
    """Constructs the complete DeepEval metric suite with the specified judge."""
    judge = get_judge_llm(mode=judge_mode)
    # Default async_mode: False for local inference to avoid overloading the single-GPU/process LLM server;
    # True for remote cloud APIs (DeepSeek, Groq, OpenAI).
    if async_mode is None:
        async_mode = False if judge.mode == "local" else True

    logger.info(
        "[METRICS] Building RAG benchmark metrics with judge: %s (async_mode=%s)",
        judge.get_model_name(),
        async_mode,
    )

    metrics = [
        FaithfulnessMetric(threshold=faithfulness_threshold, model=judge, async_mode=async_mode),
        AnswerRelevancyMetric(threshold=relevancy_threshold, model=judge, async_mode=async_mode),
        ContextualRelevancyMetric(threshold=context_relevancy_threshold, model=judge, async_mode=async_mode),
        create_citation_grounding_metric(judge, async_mode=async_mode),
    ]

    if include_ranking_metrics:
        metrics.extend([
            ContextualPrecisionMetric(threshold=precision_threshold, model=judge, async_mode=async_mode),
            ContextualRecallMetric(threshold=recall_threshold, model=judge, async_mode=async_mode),
        ])

    return metrics
