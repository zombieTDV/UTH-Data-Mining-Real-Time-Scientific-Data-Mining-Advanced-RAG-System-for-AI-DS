"""
backend/app/services/reranker_service.py
----------------------------------------
Cross-Encoder Reranking Service for deep semantic relevance scoring.
Reranks initial candidate chunks using full transformer cross-attention
(cross-encoder/ms-marco-MiniLM-L-6-v2 or BAAI/bge-reranker-base)
with primary-paper title grounding.
"""

import logging
import math
import re
from typing import List, Optional
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto

logger = logging.getLogger("reranker_service")

_STOPWORDS = {
    "what", "is", "the", "of", "in", "and", "for", "to", "a", "an",
    "how", "does", "by", "with", "on", "from", "which", "were", "was", "are",
}


class RerankerService:
    """Manages lazy-loaded CrossEncoder model for deep candidate reranking."""

    def __init__(self):
        self.tokenizer = None
        self.model = None
        self.device = None
        self._ready = False
        self._model_name = settings.RERANKER_MODEL_NAME

    def _lazy_init(self):
        if self._ready:
            return

        try:
            logger.info("[RERANKER] Loading CrossEncoder model: %s...", self._model_name)
            if torch.backends.mps.is_available():
                self.device = torch.device("mps")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
            else:
                self.device = torch.device("cpu")

            self.tokenizer = AutoTokenizer.from_pretrained(self._model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self._model_name)
            self.model.to(self.device)
            self.model.eval()
            self._ready = True
            logger.info("[RERANKER] [SUCCESS] CrossEncoder loaded on %s: %s", self.device, self._model_name)
        except Exception as e:
            logger.warning(
                "[RERANKER] Failed to load primary model %s: %s. Attempting fallback: %s...",
                self._model_name,
                str(e),
                settings.RERANKER_FALLBACK_MODEL,
            )
            try:
                self._model_name = settings.RERANKER_FALLBACK_MODEL
                self.tokenizer = AutoTokenizer.from_pretrained(self._model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(self._model_name)
                self.model.to(self.device)
                self.model.eval()
                self._ready = True
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

        if not getattr(settings, "RERANKER_ENABLED", True):
            return chunks[:k]

        self._lazy_init()

        if not self.is_ready():
            logger.warning("[RERANKER] Model offline, returning original chunk ranking.")
            return chunks[:k]

        try:
            pairs = []
            for c in chunks:
                title_prefix = f"Title: {c.title}. " if c.title else ""
                section_prefix = f"Section: {c.section_title}. " if c.section_title else ""
                passage = f"{title_prefix}{section_prefix}{c.text}"
                pairs.append([query, passage])

            max_len = getattr(settings, "RERANKER_MAX_LENGTH", 256)
            inputs = self.tokenizer(
                pairs,
                padding=True,
                truncation=True,
                max_length=max_len,
                return_tensors="pt",
            ).to(self.device)

            with torch.no_grad():
                logits = self.model(**inputs).logits
                if logits.dim() > 1 and logits.size(-1) == 1:
                    raw_scores = logits.squeeze(-1).cpu().tolist()
                elif logits.dim() > 1 and logits.size(-1) > 1:
                    raw_scores = logits[:, -1].cpu().tolist()
                else:
                    raw_scores = logits.cpu().tolist()

            if isinstance(raw_scores, float):
                raw_scores = [raw_scores]

            q_words = [
                w for w in re.findall(r"\b[A-Za-z0-9_-]{2,}\b", query)
                if w.lower() not in _STOPWORDS
            ]

            scored_items = []
            for idx_c, (chunk, score) in enumerate(zip(chunks, raw_scores)):
                s = float(score)
                title_lower = (chunk.title or "").lower()
                if title_lower and q_words:
                    title_hits = sum(1 for w in q_words if w.lower() in title_lower)
                    acronym_hits = sum(
                        1
                        for w in q_words
                        if (w.isupper() or any(ch.isupper() for ch in w[1:]))
                        and len(w) >= 2
                        and w.lower() in title_lower
                    )
                    title_ratio = title_hits / len(q_words)
                    s = s + (3.0 * title_ratio) + (2.0 * acronym_hits)

                if s >= 0:
                    norm = 1.0 / (1.0 + math.exp(-s))
                else:
                    exp_s = math.exp(s)
                    norm = exp_s / (1.0 + exp_s)
                chunk.score = round(norm, 4)
                scored_items.append((s, -idx_c, chunk))

            scored_items.sort(key=lambda x: (x[0], x[1]), reverse=True)
            ranked_chunks = [item[2] for item in scored_items]
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
