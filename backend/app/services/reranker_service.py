"""
backend/app/services/reranker_service.py
----------------------------------------
Cross-Encoder Reranking Service for deep semantic relevance scoring.
Reranks initial candidate chunks using full transformer cross-attention
(BAAI/bge-reranker-base with ms-marco-MiniLM fallback).
"""

import math
import logging
from typing import List, Optional
from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto

logger = logging.getLogger("reranker_service")


class RerankerService:
    """Manages lazy-loaded CrossEncoder model for deep candidate reranking."""

    def __init__(self):
        self.model = None
        self._ready = False
        self._model_name = settings.RERANKER_MODEL_NAME

    def _lazy_init(self):
        if self._ready:
            return

        try:
            logger.info("[RERANKER] Loading primary CrossEncoder model: %s...", settings.RERANKER_MODEL_NAME)
            from sentence_transformers import CrossEncoder
            self.model = CrossEncoder(settings.RERANKER_MODEL_NAME)
            self._ready = True
            self._model_name = settings.RERANKER_MODEL_NAME
            logger.info("[RERANKER] [SUCCESS] Primary CrossEncoder loaded: %s", self._model_name)
        except Exception as e:
            logger.warning(
                "[RERANKER] Failed to load primary model %s: %s. Attempting fallback: %s...",
                settings.RERANKER_MODEL_NAME,
                str(e),
                settings.RERANKER_FALLBACK_MODEL,
            )
            try:
                from sentence_transformers import CrossEncoder
                self.model = CrossEncoder(settings.RERANKER_FALLBACK_MODEL)
                self._ready = True
                self._model_name = settings.RERANKER_FALLBACK_MODEL
                logger.info("[RERANKER] [SUCCESS] Fallback CrossEncoder loaded: %s", self._model_name)
            except Exception as e2:
                logger.error("[RERANKER] [ERROR] Fallback CrossEncoder also failed: %s. Reranking disabled.", str(e2))
                self.model = None
                self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self.model is not None

    def rerank(
        self,
        query: str,
        chunks: List[ChunkDto],
        top_k: Optional[int] = None,
    ) -> List[ChunkDto]:
        """Reranks candidate chunks against the query using cross-attention scoring."""
        if not chunks:
            return []

        k = top_k or settings.RERANKER_TOP_K

        # If reranker is disabled via config, just slice and return
        if not getattr(settings, "RERANKER_ENABLED", True):
            return chunks[:k]

        self._lazy_init()

        # If model failed to load, fall back gracefully to input chunk ranking
        if not self.is_ready():
            logger.warning("[RERANKER] Model offline, returning original chunk ranking.")
            return chunks[:k]

        try:
            # Construct (query, passage) pairs
            pairs = []
            for c in chunks:
                title_prefix = f"Title: {c.title}. " if c.title else ""
                section_prefix = f"Section: {c.section_title}. " if c.section_title else ""
                passage = f"{title_prefix}{section_prefix}{c.text}"
                pairs.append([query, passage])

            # Predict cross-encoder relevance logits
            raw_scores = self.model.predict(pairs)

            # Apply sigmoid normalization to bring logits into (0, 1) probability scale
            for chunk, score in zip(chunks, raw_scores):
                s = float(score)
                # Numerical stability for sigmoid
                if s >= 0:
                    norm = 1.0 / (1.0 + math.exp(-s))
                else:
                    exp_s = math.exp(s)
                    norm = exp_s / (1.0 + exp_s)
                chunk.score = round(norm, 4)

            # Sort descending by reranked score and slice to top_k
            ranked_chunks = sorted(chunks, key=lambda c: c.score or 0.0, reverse=True)
            logger.info(
                "[RERANKER] Reranked %d candidates -> retained top %d (Top score: %.4f, Model: %s)",
                len(chunks),
                min(k, len(ranked_chunks)),
                ranked_chunks[0].score if ranked_chunks else 0.0,
                self._model_name,
            )
            return ranked_chunks[:k]
        except Exception as e:
            logger.error("[RERANKER] Reranking execution failed: %s. Returning raw candidates.", str(e))
            return chunks[:k]


reranker_service = RerankerService()
