import logging
from dataclasses import dataclass, field
from typing import Optional

from src.gold.lancedb_manager import GoldLanceDBManager
from src.gold.snapshot import GoldSnapshotManager
from src.models.embeddings.nomic_v15 import NomicV15Spec, NomicV15Encoder


logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    embedding_id: str
    chunk_id: str
    paper_id: str
    title: str
    text: str
    doi: Optional[str]
    authors_json: str
    publication_date: Optional[str]
    primary_topic: Optional[str]
    topics_json: str
    word_count: int
    token_count: int
    source_content_hash: str
    model_fingerprint: str
    embedding_config_hash: str
    score: float = 0.0


@dataclass
class QueryResult:
    query: str
    chunks: list[RetrievedChunk]
    total_retrieved: int
    retrieval_ms: float
    reranked: bool = False


@dataclass
class RAGConfig:
    top_k: int = 5
    min_score: float = 0.5
    use_reranker: bool = False
    enable_fallback: bool = True
    embedding_dim: int = 768


class RAGQueryEngine:
    def __init__(
        self,
        spec: Optional[NomicV15Spec] = None,
        config: Optional[RAGConfig] = None,
        ldb_manager: Optional[GoldLanceDBManager] = None,
    ):
        self.spec = spec or NomicV15Spec()
        self.config = config or RAGConfig()
        self._encoder: Optional[NomicV15Encoder] = None
        self._ldb = ldb_manager or GoldLanceDBManager(spec=self.spec)

    def _get_encoder(self) -> NomicV15Encoder:
        if self._encoder is None:
            self._encoder = NomicV15Encoder(
                model_dir=self._resolve_model_dir(),
                spec=self.spec,
                device="auto",
            )
        return self._encoder

    def _resolve_model_dir(self):
        from pathlib import Path

        default = Path("models") / self.spec.repo_id.split("/")[-1] / self.spec.revision
        if default.exists():
            return default
        raise FileNotFoundError(
            f"Model not found at {default}. "
            f"Run: python -m src.pipelines.prepare_embedding_model"
        )

    def _verify_index_compatibility(self) -> bool:
        snap_mgr = GoldSnapshotManager(spec=self.spec)
        return snap_mgr.verify_compatibility(self.spec)

    def search(
        self,
        query_text: str,
        filter_expr: Optional[str] = None,
    ) -> QueryResult:
        import time

        t0 = time.time()

        if not self._verify_index_compatibility():
            logger.warning("Index model fingerprint mismatch. Proceeding with fallback.")

        encoder = self._get_encoder()
        result = encoder.encode_query(query_text, self.spec.document_prefix)

        chunks_df = self._ldb.search(
            query_vector=result.vectors[0],
            limit=self.config.top_k * 2 if self.config.use_reranker else self.config.top_k,
            filter_expr=filter_expr,
        )

        retrieved: list[RetrievedChunk] = []
        for _, row in chunks_df.iterrows():
            score = 1.0 - float(row.get("_score", row.get("distance", 0.5)))

            if score < self.config.min_score:
                continue

            retrieved.append(
                RetrievedChunk(
                    embedding_id=str(row.get("embedding_id", "")),
                    chunk_id=str(row.get("chunk_id", "")),
                    paper_id=str(row.get("paper_id", "")),
                    title=str(row.get("title", "")),
                    text=str(row.get("text", "")),
                    doi=str(row.get("doi", "")) if row.get("doi") else None,
                    authors_json=str(row.get("authors_json", "[]")),
                    publication_date=str(row.get("publication_date", "")) if row.get("publication_date") else None,
                    primary_topic=str(row.get("primary_topic", "")) if row.get("primary_topic") else None,
                    topics_json=str(row.get("topics_json", "[]")),
                    word_count=int(row.get("word_count", 0)),
                    token_count=int(row.get("token_count", 0)),
                    source_content_hash=str(row.get("source_content_hash", "")),
                    model_fingerprint=str(row.get("model_fingerprint", "")),
                    embedding_config_hash=str(row.get("embedding_config_hash", "")),
                    score=score,
                )
            )

        if self.config.use_reranker:
            from src.rag.reranker import RERRERANKER_AVAILABLE, rerank_chunks

            if RERERANKER_AVAILABLE:
                retrieved = rerank_chunks(retrieved, query_text, top_k=self.config.top_k)
            else:
                logger.info("Reranker not available, using ANN ranking.")
                retrieved = sorted(retrieved, key=lambda x: x.score, reverse=True)[
                    : self.config.top_k
                ]

        retrieval_ms = (time.time() - t0) * 1000

        return QueryResult(
            query=query_text,
            chunks=retrieved[: self.config.top_k],
            total_retrieved=len(retrieved),
            retrieval_ms=retrieval_ms,
            reranked=self.config.use_reranker,
        )

    def get_paper_chunks(self, paper_id: str) -> list[RetrievedChunk]:
        if not self._ldb.table_exists():
            return []

        chunks: list[RetrievedChunk] = []
        try:
            rows_df = self._ldb.search_by_filter(
                filter_expr=f"paper_id = '{paper_id}'",
                limit=100,
            )
            for _, row in rows_df.iterrows():
                score = 1.0 - float(row.get("_score", row.get("distance", 0.5)))
                chunks.append(
                    RetrievedChunk(
                        embedding_id=str(row.get("embedding_id", "")),
                        chunk_id=str(row.get("chunk_id", "")),
                        paper_id=str(row.get("paper_id", "")),
                        title=str(row.get("title", "")),
                        text=str(row.get("text", "")),
                        doi=str(row.get("doi", "")) if row.get("doi") else None,
                        authors_json=str(row.get("authors_json", "[]")),
                        publication_date=str(row.get("publication_date", "")) if row.get("publication_date") else None,
                        primary_topic=str(row.get("primary_topic", "")) if row.get("primary_topic") else None,
                        topics_json=str(row.get("topics_json", "[]")),
                        word_count=int(row.get("word_count", 0)),
                        token_count=int(row.get("token_count", 0)),
                        source_content_hash=str(row.get("source_content_hash", "")),
                        model_fingerprint=str(row.get("model_fingerprint", "")),
                        embedding_config_hash=str(row.get("embedding_config_hash", "")),
                        score=score,
                    )
                )
        except Exception as e:
            logger.error("Error fetching paper chunks: %s", e)

        return chunks

    def close(self) -> None:
        self._ldb.close_writers()
