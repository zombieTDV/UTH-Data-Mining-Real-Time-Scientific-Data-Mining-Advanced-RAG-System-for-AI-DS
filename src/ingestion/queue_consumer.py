"""RabbitMQ Ingestion Worker / Consumer.

Consumes academic paper ingestion tasks from RabbitMQ,
extracts text chunks, generates 768-D dense embeddings,
upserts into Qdrant Vector Store, and archives raw metadata to MinIO Bronze.
"""

import json
import logging
import signal
import sys
import time
from typing import Any, Dict, Optional

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.storage.minio_client import StorageClient
from src.transformation.html_parser import AcademicHTMLParser
from src.transformation.silver_writer import SilverLakehouseWriter


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("QueueConsumer")


class QueueConsumer:
    """Consumes and processes papers from RabbitMQ."""

    def __init__(self, storage_client: Optional[StorageClient] = None, qdrant_client: Optional[QdrantManager] = None):
        self.storage = storage_client or StorageClient()
        self.qdrant = qdrant_client or QdrantManager()
        self._embedder = None
        self.queue_name = settings.RABBITMQ_QUEUE_INGEST
        self.amqp_url = settings.RABBITMQ_URL
        self._running = True
        self.html_parser = AcademicHTMLParser()
        self.silver_writer = SilverLakehouseWriter(storage_client=self.storage)
        self.chunker = AcademicChunker(max_chunk_words=450, overlap_words=50)

    @property
    def embedder(self) -> NomicEmbedder:
        """Lazy load embedder on first message to keep startup lightweight."""
        if self._embedder is None:
            logger.info("[Worker] Loading NomicEmbedder...")
            self._embedder = NomicEmbedder()
        return self._embedder

    def process_paper(self, paper: Dict[str, Any]) -> bool:
        """Processes a single paper payload strictly across the 3 Medallion Tiers:
        1. 🥉 Bronze: Raw metadata JSON & raw HTML archived into MinIO.
        2. 🥈 Silver: HTML section parsing, schema normalization, and columnar Parquet sync.
        3. 🥇 Gold: Section-aware chunking & 768-D dense vector embedding into Qdrant.
        """
        paper_id = str(paper.get("paper_id", "unknown")).strip()
        title = paper.get("title", "")
        year = str(paper.get("published_date", "")[:4]) if paper.get("published_date") else "2026"
        if not year.isdigit():
            year = "2026"

        logger.info(f"[Worker] Processing paper {paper_id}: {title[:60]}...")

        # -------------------------------------------------------------
        # 1. 🥉 TẦNG BRONZE: Lưu trữ nguyên bản raw JSON & raw HTML lên MinIO
        # -------------------------------------------------------------
        raw_html = paper.get("raw_html") or paper.get("html_content")
        try:
            bronze_meta_key = f"bronze/papers/{year}/{paper_id}.json"
            self.storage.upload_json(paper, bronze_meta_key)
            if raw_html:
                bronze_html_key = f"bronze/papers/{year}/{paper_id}.html"
                self.storage.upload_text(raw_html, bronze_html_key, content_type="text/html; charset=utf-8")
            logger.info(f"[Worker][Bronze] Archived raw paper {paper_id} to MinIO ({bronze_meta_key})")
        except Exception as e:
            logger.warning(f"[Worker][Bronze] Non-fatal MinIO Bronze archive warning: {e}")

        # -------------------------------------------------------------
        # 2. 🥈 TẦNG SILVER: Bóc tách cấu trúc, chuẩn hóa Schema & ghi Parquet
        # -------------------------------------------------------------
        try:
            if raw_html:
                parsed_html = self.html_parser.parse(raw_html)
            else:
                # Nếu chưa có HTML đầy đủ, tạo cấu trúc tối thiểu từ abstract
                parsed_html = {
                    "parsed_title": title,
                    "parsed_abstract": paper.get("abstract", ""),
                    "sections": [
                        {
                            "section_title": "Abstract",
                            "section_type": "abstract",
                            "content": paper.get("abstract", ""),
                        }
                    ],
                    "total_sections": 1,
                    "total_math_count": 0,
                    "total_words": len(str(paper.get("abstract", "")).split()),
                    "content_origin": "abstract_only",
                }

            silver_record = self.silver_writer.prepare_record(raw_meta=paper, parsed_html=parsed_html)
            self.silver_writer.save_and_upload_parquet([silver_record], year=year)
            logger.info(f"[Worker][Silver] Standardized & synced paper {paper_id} into Silver Parquet")
        except Exception as e:
            logger.error(f"[Worker][Silver] Failed to transform to Silver: {e}")
            return False

        # -------------------------------------------------------------
        # 3. 🥇 TẦNG GOLD: Sinh Chunk ngữ cảnh từ Silver & Upsert Vector vào Qdrant
        # -------------------------------------------------------------
        try:
            # Chỉ sinh chunk từ bản ghi Silver đã chuẩn hóa
            chunks = self.chunker.chunk_paper(silver_record)
            if not chunks:
                logger.warning(f"[Worker][Gold] No valid chunks generated for paper {paper_id}")
                return True

            texts = [c.get("context_text") or c.get("text", "") for c in chunks]
            vectors = self.embedder.embed_documents(texts)
            for c, vec in zip(chunks, vectors):
                c["vector"] = vec

            inserted = self.qdrant.insert_chunks(chunks)
            logger.info(f"[Worker][Gold] Upserted {inserted} section vectors for paper {paper_id} into Qdrant")
            return True
        except Exception as e:
            logger.error(f"[Worker][Gold] Failed to index paper {paper_id} into Qdrant: {e}")
            return False

    def run_pika(self):
        """Native AMQP consumer loop using pika."""
        import pika
        params = pika.URLParameters(self.amqp_url)
        conn = pika.BlockingConnection(params)
        channel = conn.channel()
        channel.queue_declare(queue=self.queue_name, durable=True)
        channel.basic_qos(prefetch_count=1)

        def callback(ch, method, properties, body):
            try:
                data = json.loads(body.decode("utf-8"))
                success = self.process_paper(data)
                if success:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                else:
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            except Exception as e:
                logger.error(f"[Worker] Error handling message: {e}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        channel.basic_consume(queue=self.queue_name, on_message_callback=callback)
        logger.info(f"[*] RabbitMQ Consumer listening on '{self.queue_name}'... Press Ctrl+C to exit.")
        try:
            channel.start_consuming()
        except KeyboardInterrupt:
            channel.stop_consuming()
            conn.close()

    def run(self):
        """Starts consumer."""
        try:
            import pika
            self.run_pika()
        except ImportError:
            logger.error("[Worker] pika is required for queue consumer. Please install pika: pip install pika")


if __name__ == "__main__":
    consumer = QueueConsumer()
    consumer.run()
