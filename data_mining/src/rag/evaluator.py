import logging
from dataclasses import dataclass
from typing import Optional

from src.rag.query_engine import RetrievedChunk


logger = logging.getLogger(__name__)


@dataclass
class RAGMetrics:
    query: str
    chunks_retrieved: int
    chunks_cited: int
    citation_recall: float
    avg_retrieval_score: float
    max_retrieval_score: float
    min_retrieval_score: float
    retrieval_ms: float
    generation_ms: Optional[float]
    reranked: bool


class RAGEvaluator:
    def compute(
        self,
        query: str,
        retrieved_chunks: list[RetrievedChunk],
        cited_chunks: list[str],
        retrieval_ms: float,
        generation_ms: Optional[float] = None,
    ) -> RAGMetrics:
        if not retrieved_chunks:
            return RAGMetrics(
                query=query,
                chunks_retrieved=0,
                chunks_cited=0,
                citation_recall=0.0,
                avg_retrieval_score=0.0,
                max_retrieval_score=0.0,
                min_retrieval_score=0.0,
                retrieval_ms=retrieval_ms,
                generation_ms=generation_ms,
                reranked=False,
            )

        scores = [c.score for c in retrieved_chunks]
        cited_ids = set(cited_chunks)
        cited_count = sum(1 for c in retrieved_chunks if c.chunk_id in cited_ids or c.paper_id in cited_ids)
        citation_recall = cited_count / len(retrieved_chunks)

        return RAGMetrics(
            query=query,
            chunks_retrieved=len(retrieved_chunks),
            chunks_cited=cited_count,
            citation_recall=citation_recall,
            avg_retrieval_score=sum(scores) / len(scores),
            max_retrieval_score=max(scores),
            min_retrieval_score=min(scores),
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
            reranked=any(c.score < 1.0 for c in retrieved_chunks),
        )

    def log_metrics(self, metrics: RAGMetrics) -> None:
        logger.info(
            "[RAG EVAL] query=%s retrieved=%d cited=%d recall=%.2f "
            "avg_score=%.4f max_score=%.4f retrieval_ms=%.1f gen_ms=%s reranked=%s",
            metrics.query[:50],
            metrics.chunks_retrieved,
            metrics.chunks_cited,
            metrics.citation_recall,
            metrics.avg_retrieval_score,
            metrics.max_retrieval_score,
            metrics.retrieval_ms,
            f"{metrics.generation_ms:.1f}" if metrics.generation_ms else "N/A",
            metrics.reranked,
        )
