import logging
from typing import TYPE_CHECKING

from src.rag.query_engine import RetrievedChunk


RERERANKER_AVAILABLE = False
rerank_chunks = None

try:
    from sentence_transformers import CrossEncoder
    _RERERANKER_AVAILABLE = True
except Exception:
    _RERERANKER_AVAILABLE = False


if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder


def _rerank_with_cross_encoder(
    chunks: list[RetrievedChunk],
    query: str,
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
    top_k: int = 5,
) -> list[RetrievedChunk]:
    if not chunks:
        return []

    try:
        model = CrossEncoder(model_name, max_length=512)
        pairs = [(query, chunk.text) for chunk in chunks]
        scores = model.predict(pairs, show_progress_bar=False)

        ranked = sorted(
            zip(chunks, scores),
            key=lambda x: x[1],
            reverse=True,
        )
        return [chunk for chunk, _ in ranked[:top_k]]
    except Exception as e:
        logging.warning("Cross-encoder reranking failed: %s. Returning ANN ranking.", e)
        return sorted(chunks, key=lambda x: x.score, reverse=True)[:top_k]


if _RERERANKER_AVAILABLE:
    RERERANKER_AVAILABLE = True
    rerank_chunks = _rerank_with_cross_encoder
else:
    def _rerank_fallback(
        chunks: list[RetrievedChunk],
        query: str,
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        return sorted(chunks, key=lambda x: x.score, reverse=True)[:top_k]

    rerank_chunks = _rerank_fallback
