"""
backend/app/services/embedder_service.py
----------------------------------------
Local Embedding Service for Dense Retrieval wrapping Nomic Embed Text v1.5.
Provides 768-dimensional normalized dense vectors matching LanceDB Gold Lakehouse schema.
"""

import logging
from pathlib import Path
from typing import List, Optional
import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

from backend.app.core.config import settings

logger = logging.getLogger("embedder_service")


class EmbedderService:
    """Manages offline embedding generation using Nomic-embed-text-v1.5 (768-D)."""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or settings.EMBEDDING_MODEL_PATH
        self.tokenizer = None
        self.model = None
        self.device = None
        self._ready = False

    def _lazy_init(self):
        if self._ready:
            return
        try:
            logger.info("[EMBEDDER] Loading 768-D embedding model from %s...", self.model_path)
            model_target = self.model_path if Path(self.model_path).exists() else "nomic-ai/nomic-embed-text-v1.5"

            if torch.backends.mps.is_available():
                self.device = torch.device("mps")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
            else:
                self.device = torch.device("cpu")

            self.tokenizer = AutoTokenizer.from_pretrained(str(model_target))
            self.model = AutoModel.from_pretrained(str(model_target), trust_remote_code=True)
            self.model.to(self.device)
            self.model.eval()
            self._ready = True
            logger.info("[EMBEDDER] [SUCCESS] Embedding model loaded successfully on %s (dim=768).", self.device)
        except Exception as e:
            logger.warning("[EMBEDDER] Failed to load embedding model: %s. Dense search will fall back to FTS.", str(e))
            self._ready = False

    def embed_query(self, query: str) -> Optional[List[float]]:
        """Generates a 768-dimensional L2-normalized embedding for a search query."""
        self._lazy_init()
        if not self._ready or self.model is None or self.tokenizer is None:
            return None

        try:
            formatted_query = f"search_query: {query.strip()}"
            inputs = self.tokenizer(
                [formatted_query],
                padding=True,
                truncation=True,
                max_length=1024,
                return_tensors="pt",
            ).to(self.device)

            with torch.no_grad():
                out = self.model(**inputs)
                token_embeddings = out[0]
                input_mask_expanded = inputs["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
                sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
                sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
                emb = sum_embeddings / sum_mask
                emb = F.normalize(emb, p=2, dim=1).cpu().tolist()[0]
                return emb
        except Exception as e:
            logger.error("[EMBEDDER] Error embedding query: %s", str(e))
            return None


embedder_service = EmbedderService()
