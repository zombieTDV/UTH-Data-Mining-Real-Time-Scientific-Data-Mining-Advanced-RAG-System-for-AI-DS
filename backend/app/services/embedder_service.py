"""
backend/app/services/embedder_service.py
----------------------------------------
Local Embedding Service for Dense Retrieval wrapping Nomic Embed Text v1.5.
Provides 768-dimensional normalized dense vectors for LanceDB cosine similarity.
"""

import logging
from typing import List, Optional
import torch
import torch.nn.functional as F
import transformers

logger = logging.getLogger("embedder_service")


# Compatibility patch for Nomic BERT in modern transformers
def _patch_extended_mask(self, attention_mask, input_shape, device=None, dtype=None):
    if dtype is None:
        dtype = self.dtype if hasattr(self, 'dtype') else torch.float32
    if attention_mask.dim() == 3:
        extended = attention_mask[:, None, :, :]
    elif attention_mask.dim() == 2:
        extended = attention_mask[:, None, None, :]
    else:
        raise ValueError('Wrong shape')
    extended = extended.to(dtype=dtype)
    return (1.0 - extended) * -10000.0


transformers.PreTrainedModel.get_extended_attention_mask = _patch_extended_mask


class EmbedderService:
    """Manages offline embedding generation using Nomic Embed Text v1.5."""

    def __init__(self, model_name: str = "nomic-ai/nomic-embed-text-v1.5"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self._ready = False

    def _lazy_init(self):
        if self._ready:
            return
        try:
            logger.info("[EMBEDDER] Loading embedding model %s...", self.model_name)
            from transformers import AutoTokenizer, AutoModel
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
            self.model = AutoModel.from_pretrained(self.model_name, trust_remote_code=True)
            self.model.eval()
            self._ready = True
            logger.info("[EMBEDDER] Embedding model loaded successfully.")
        except Exception as e:
            logger.warning("[EMBEDDER] Failed to load embedding model: %s. Dense search will fall back to FTS.", str(e))
            self._ready = False

    def embed_query(self, query: str) -> Optional[List[float]]:
        """Generates a 768-dimensional L2-normalized embedding for a search query."""
        self._lazy_init()
        if not self._ready or self.model is None or self.tokenizer is None:
            return None

        try:
            formatted_query = f"search_query: {query}"
            inputs = self.tokenizer(
                [formatted_query],
                padding=True,
                truncation=True,
                max_length=1024,
                return_tensors="pt",
            )
            with torch.no_grad():
                out = self.model(**inputs)
                input_mask = inputs["attention_mask"].unsqueeze(-1).expand(out[0].size()).float()
                emb = torch.sum(out[0] * input_mask, 1) / torch.clamp(input_mask.sum(1), min=1e-9)
                emb = F.normalize(emb, p=2, dim=1).cpu().tolist()[0]
                return emb
        except Exception as e:
            logger.error("[EMBEDDER] Error embedding query: %s", str(e))
            return None


embedder_service = EmbedderService()
