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
from typing import Any, Dict

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.storage.minio_client import StorageClient


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("QueueConsumer")


class QueueConsumer:
    """Consumes and processes papers from RabbitMQ."""

    def __init__(self):
        self.storage = StorageClient()
        self.qdrant = QdrantManager()
        self._embedder = None
        self.queue_name = settings.RABBITMQ_QUEUE_INGEST
        self.amqp_url = settings.RABBITMQ_URL
        self._running = True

    @property
    def embedder(self) -> NomicEmbedder:
        """Lazy load embedder on first message to keep startup lightweight."""
        if self._embedder is None:
            logger.info("[Worker] Loading NomicEmbedder...")
            self._embedder = NomicEmbedder()
        return self._embedder

    def process_paper(self, paper: Dict[str, Any]) -> bool:
        """Processes a single paper payload: archives to MinIO, chunks, embeds, and stores in Qdrant."""
        paper_id = paper.get("paper_id", "unknown")
        title = paper.get("title", "")
        abstract = paper.get("abstract", "")
        categories = paper.get("categories", ["cs.AI"])
        primary_category = categories[0] if categories else "cs.AI"
        authors = paper.get("authors", [])

        logger.info(f"[Worker] Processing paper {paper_id}: {title[:60]}...")

        # 1. Archive to MinIO Bronze
        try:
            bronze_key = f"bronze/papers/{paper_id}.json"
            self.storage.upload_json(paper, bronze_key)
            logger.info(f"[Worker] Archived paper {paper_id} to MinIO ({bronze_key})")
        except Exception as e:
            logger.warning(f"[Worker] Failed to archive to MinIO: {e}")

        # 2. Extract Chunks (Abstract chunk + text if present)
        chunks = []
        text_content = f"{title}\n\nAbstract: {abstract}".strip()
        chunks.append({
            "chunk_id": f"{paper_id}_chunk_0",
            "paper_id": paper_id,
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "primary_category": primary_category,
            "section_title": "Abstract",
            "section_type": "abstract",
            "text": text_content,
            "char_length": len(text_content),
            "published_date": paper.get("published_date", ""),
        })

        # 3. Generate Embeddings
        try:
            texts = [c["text"] for c in chunks]
            vectors = self.embedder.embed_documents(texts)
            for c, vec in zip(chunks, vectors):
                c["vector"] = vec

            # 4. Upsert into Qdrant
            inserted = self.qdrant.insert_chunks(chunks)
            logger.info(f"[Worker] Upserted {inserted} vectors for paper {paper_id} into Qdrant")
            return True
        except Exception as e:
            logger.error(f"[Worker] Failed to embed/upsert paper {paper_id}: {e}")
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
