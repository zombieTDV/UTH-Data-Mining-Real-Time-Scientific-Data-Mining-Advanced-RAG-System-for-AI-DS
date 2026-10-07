"""
backend/app/services/embedder_service.py
----------------------------------------
Local Embedding Service for Dense Retrieval wrapping sentence-transformers/all-MiniLM-L6-v2.
Provides 384-dimensional normalized dense vectors matching LanceDB Gold Lakehouse schema.
"""

import logging
from typing import List, Optional

logger = logging.getLogger("embedder_service")


class EmbedderService:
    """Manages offline embedding generation using nomic-ai/nomic-embed-text-v1.5 (768-D)."""

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
            import torch
            import torch.nn.functional as F
            from transformers import AutoTokenizer, AutoModel, PreTrainedModel

            def _patch_extended_mask(self_m, attention_mask, input_shape, device=None, dtype=None):
                if dtype is None:
                    dtype = self_m.dtype if hasattr(self_m, 'dtype') else torch.float32
                if attention_mask.dim() == 3:
                    extended = attention_mask[:, None, :, :]
                elif attention_mask.dim() == 2:
                    extended = attention_mask[:, None, None, :]
                else:
                    raise ValueError('Wrong shape')
                extended = extended.to(dtype=dtype)
                return (1.0 - extended) * -10000.0

            PreTrainedModel.get_extended_attention_mask = _patch_extended_mask

            self._torch = torch
            self._F = F
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name, trust_remote_code=True)
            self.model.eval()
            self._ready = True
            logger.info("[EMBEDDER] Embedding model loaded successfully (dim=768).")
        except Exception as e:
            logger.warning("[EMBEDDER] Failed to load embedding model: %s. Dense search will fall back to FTS.", str(e))
            self._ready = False

    def embed_query(self, query: str) -> Optional[List[float]]:
        """Generates a 768-dimensional L2-normalized embedding for a search query (with search_query: prefix)."""
        self._lazy_init()
        if not self._ready or self.model is None or self.tokenizer is None:
            return None

        try:
            formatted_query = f"search_query: {query.strip()}"
            inputs = self.tokenizer(
                [formatted_query],
                padding=True,
                truncation=True,
                max_length=2048,
                return_tensors="pt",
            )
            with self._torch.no_grad():
                out = self.model(**inputs)
                input_mask = inputs["attention_mask"].unsqueeze(-1).expand(out[0].size()).float()
                emb = self._torch.sum(out[0] * input_mask, 1) / self._torch.clamp(input_mask.sum(1), min=1e-9)
                emb = self._F.normalize(emb, p=2, dim=1).cpu().tolist()[0]
                return emb
        except Exception as e:
            logger.error("[EMBEDDER] Error embedding query: %s", str(e))
            return None


embedder_service = EmbedderService()
