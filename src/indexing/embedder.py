"""Local Embedding Generator using Nomic Embed Text v1.5.

Optimized for academic research literature with 8,192 token context support
and running locally on Apple Silicon (MPS), CUDA, or CPU.
"""

from pathlib import Path
from typing import List, Union
import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

from src.config.settings import settings

# Token window per text. A 450-word chunk of scientific prose is ~650 tokens (up to ~1,600 with math), so a 512 cap
# silently dropped the tail of most chunks from their vector. Nomic v1.5 handles long context; 2048 covers every chunk.
MAX_TOKENS = 2048


class NomicEmbedder:
    """Offline Embedding model running locally with Nomic-embed-text-v1.5."""

    def __init__(self, model_path: Union[str, Path, None] = None, device: str = "auto"):
        raw_path = model_path or settings.EMBEDDING_MODEL_PATH
        target_path = Path(raw_path)
        if target_path.exists():
            self.model_path = target_path
            load_identifier = str(target_path)
        else:
            self.model_path = target_path
            load_identifier = "nomic-ai/nomic-embed-text-v1.5"

        # Tự động nhận diện phần cứng (Ưu tiên Apple Silicon MPS -> CUDA -> CPU)
        if device == "auto":
            if torch.backends.mps.is_available():
                self.device = torch.device("mps")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
            else:
                self.device = torch.device("cpu")
        else:
            self.device = torch.device(device)

        # Khởi tạo Tokenizer và Model
        from transformers import PreTrainedModel

        def _patch_extended_mask(self_m, attention_mask, input_shape, device=None, dtype=None):
            if dtype is None:
                dtype = self_m.dtype if hasattr(self_m, "dtype") else torch.float32
            if attention_mask.dim() == 3:
                extended = attention_mask[:, None, :, :]
            elif attention_mask.dim() == 2:
                extended = attention_mask[:, None, None, :]
            else:
                raise ValueError("Wrong shape")
            extended = extended.to(dtype=dtype)
            return (1.0 - extended) * -10000.0

        PreTrainedModel.get_extended_attention_mask = _patch_extended_mask

        model_kwargs = {"trust_remote_code": True}
        if self.device.type == "cuda":
            model_kwargs["torch_dtype"] = torch.float16

        self.tokenizer = AutoTokenizer.from_pretrained(load_identifier)
        self.model = AutoModel.from_pretrained(load_identifier, **model_kwargs)
        self.model.to(self.device)
        self.model.eval()

    def _mean_pooling(self, model_output, attention_mask):
        """Tính trung bình cộng các vector token có xét attention mask (Mean Pooling)."""
        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask

    def embed_documents(self, texts: List[str], batch_size: int = 8) -> List[List[float]]:
        """Sinh vector nhúng cho danh sách tài liệu/chunks (tự động gắn tiền tố search_document:)."""
        all_embeddings = []

        # Chuẩn bị văn bản theo chuẩn của Nomic, loại bỏ surrogate characters chống lỗi PyO3 Rust
        formatted_texts = [
            f"search_document: {t.encode('utf-8', 'ignore').decode('utf-8', 'ignore') if isinstance(t, str) else ''}"
            for t in texts
        ]

        for i in range(0, len(formatted_texts), batch_size):
            batch = formatted_texts[i : i + batch_size]
            encoded_input = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=MAX_TOKENS,
                return_tensors="pt",
            ).to(self.device)

            with torch.inference_mode():
                try:
                    model_output = self.model(**encoded_input)
                except Exception as e:
                    # Fallback sang CPU neu bao loi bo nho
                    if self.device.type in ("mps", "cuda"):
                        if self.device.type == "cuda":
                            torch.cuda.empty_cache()
                        else:
                            torch.mps.empty_cache()
                        cpu_input = {k: v.to("cpu") for k, v in encoded_input.items()}
                        self.model.to("cpu")
                        model_output = self.model(**cpu_input)
                        self.model.to(self.device)
                    else:
                        raise e

                embeddings = self._mean_pooling(model_output, encoded_input["attention_mask"].to(model_output[0].device))
                # L2 Normalize
                embeddings = F.normalize(embeddings, p=2, dim=1)
                all_embeddings.extend(embeddings.float().cpu().tolist())

            del encoded_input, model_output, embeddings
            if self.device.type == "cuda" and (i // batch_size) % 100 == 0 and i > 0:
                torch.cuda.empty_cache()
            elif self.device.type == "mps":
                torch.mps.empty_cache()

        return all_embeddings

    embed_batch = embed_documents

    def embed_query(self, query: str) -> List[float]:
        """Sinh vector nhúng cho câu truy vấn tìm kiếm của người dùng (tự động gắn tiền tố search_query:)."""
        clean_q = query.encode("utf-8", "ignore").decode("utf-8", "ignore") if isinstance(query, str) else ""
        formatted_query = f"search_query: {clean_q}"
        encoded_input = self.tokenizer(
            [formatted_query],
            padding=True,
            truncation=True,
            max_length=MAX_TOKENS,
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            model_output = self.model(**encoded_input)
            embeddings = self._mean_pooling(model_output, encoded_input["attention_mask"])
            embeddings = F.normalize(embeddings, p=2, dim=1)
            return embeddings.cpu().tolist()[0]
