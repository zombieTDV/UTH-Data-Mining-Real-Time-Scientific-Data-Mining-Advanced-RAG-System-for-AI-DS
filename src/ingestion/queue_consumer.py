"""RabbitMQ Ingestion Worker / Consumer.

Single gate into the Medallion lakehouse. For each micro-batch of messages:
  dedup (abstract SHA-256) -> Bronze (MinIO) -> Silver (MinIO Parquet part) -> Gold (Qdrant)
Messages are acked only after the whole batch is durable. A failing message is
re-published with an incremented retry counter and moved to the dead-letter
queue after RABBITMQ_MAX_RETRIES, so nothing is silently lost. No local files are written.
"""

import collections
import json
import logging
import re
import signal
import time

import httpx
from typing import Any, Dict, List, Optional, Tuple

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.storage.minio_client import StorageClient
from src.transformation.html_parser import AcademicHTMLParser
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.transformation.unified_content_resolver import UnifiedContentResolver
from src.transformation.silver_writer import SilverLakehouseWriter

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL, logging.INFO), format="[%(asctime)s] %(levelname)s [%(name)s] %(message)s")
logging.getLogger("pika").setLevel(logging.WARNING)
logger = logging.getLogger("QueueConsumer")

RETRY_HEADER = "x-retries"


def _year_of(paper: Dict[str, Any]) -> str:
    year = str(paper.get("published_date") or "")[:4]
    return year if year.isdigit() else str(time.gmtime().tm_year)


class QueueConsumer:
    """Consumes and processes papers from RabbitMQ in micro-batches."""

    def __init__(
        self,
        storage_client: Optional[StorageClient] = None,
        qdrant_client: Optional[QdrantManager] = None,
        batch_size: int = 16,
        idle_flush_seconds: float = 5.0,
    ):
        self.storage = storage_client or StorageClient()
        self.qdrant = qdrant_client or QdrantManager()
        self.dedup = LakehouseDeduplicator()
        self._embedder = None
        self.queue_name = settings.RABBITMQ_QUEUE_INGEST
        self.dead_queue = settings.RABBITMQ_QUEUE_DEAD
        self.amqp_url = settings.RABBITMQ_URL
        self.max_retries = settings.RABBITMQ_MAX_RETRIES
        self.batch_size = batch_size
        self.idle_flush_seconds = idle_flush_seconds
        self._running = True
        self.html_parser = AcademicHTMLParser()
        self.silver_writer = SilverLakehouseWriter(storage_client=self.storage)
        self.last_ingested: List[Dict[str, Any]] = []
        self.resolver = UnifiedContentResolver(storage_client=self.storage)
        self.chunker = AcademicChunker(max_chunk_words=450, overlap_words=50)

    @property
    def embedder(self) -> NomicEmbedder:
        if self._embedder is None:
            logger.info("[Worker] Loading NomicEmbedder...")
            self._embedder = NomicEmbedder()
        return self._embedder

    # ------------------------------------------------------------------ stages
    def _bronze(self, paper: Dict[str, Any], paper_id: str, year: str) -> None:
        """Raw archive. Failure aborts the paper: Bronze is the immutable source of truth."""
        self.storage.upload_json(paper, f"bronze/papers/{year}/{paper_id}.json")
        raw_html = paper.get("raw_html") or paper.get("html_content")
        if raw_html:
            self.storage.upload_text(raw_html, f"bronze/papers/{year}/{paper_id}.html", content_type="text/html; charset=utf-8")

    @staticmethod
    def _resolver_input(paper: Dict[str, Any], year: str) -> Dict[str, Any]:
        """Shape a harvested message the way UnifiedContentResolver expects it."""
        pid = str(paper.get("paper_id", ""))
        m = re.fullmatch(r"(\d{4}\.\d{4,5})(v\d+)?", pid)
        return {
            "paper_id": pid,
            "title": paper.get("title", ""),
            "abstract": paper.get("abstract", ""),
            "source": "arxiv" if m else str(paper.get("source", "arxiv")),
            "year": year,
            "arxiv_id": m.group(1) if m else None,
        }

    def _silver_record(self, paper: Dict[str, Any], resolved: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raw_html = paper.get("raw_html") or paper.get("html_content")
        abstract = paper.get("abstract", "")
        if raw_html:
            parsed = self.html_parser.parse(raw_html)
        elif resolved and resolved.get("content_origin") not in (None, "abstract_fallback"):
            sections = json.loads(resolved.get("sections_json") or "[]")
            parsed = {
                "parsed_title": paper.get("title", ""),
                "parsed_abstract": abstract,
                "sections": sections,
                "total_sections": resolved.get("total_sections", len(sections)),
                "total_math_count": resolved.get("total_math_count", 0),
                "total_words": resolved.get("total_words", 0),
                "content_origin": resolved["content_origin"],
            }
        else:
            parsed = {
                "parsed_title": paper.get("title", ""),
                "parsed_abstract": abstract,
                "sections": [{"section_title": "Abstract", "section_type": "abstract", "content": abstract}],
                "total_sections": 1,
                "total_math_count": 0,
                "total_words": len(str(abstract).split()),
                "content_origin": "abstract_only",
            }
        return self.silver_writer.prepare_record(raw_meta=paper, parsed_html=parsed)

    def process_batch(self, papers: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Tuple[Dict[str, Any], str]]]:
        """Process a micro-batch. Returns (succeeded_or_skipped, [(failed_paper, reason)])."""
        ok: List[Dict[str, Any]] = []
        failed: List[Tuple[Dict[str, Any], str]] = []
        fresh: List[Tuple[Dict[str, Any], Dict[str, Any], str, str]] = []  # paper, silver_rec, year, hash
        t_batch = time.time()
        n_dups = 0
        tier_of = lambda p: str(p.get("tier") or "tier1")  # noqa: E731

        todo: List[Tuple[Dict[str, Any], str, str, str]] = []  # paper, paper_id, year, hash
        for paper in papers:
            paper_id = str(paper.get("paper_id", "")).strip()
            if not paper_id:
                failed.append((paper, "missing paper_id"))
                continue
            is_dup, abs_hash = self.dedup.is_duplicate(paper.get("abstract", ""), paper.get("title", ""))
            if is_dup:
                logger.info("[Worker][Dedup] Skipping duplicate %s", paper_id)
                n_dups += 1
                ok.append(paper)
                continue
            todo.append((paper, paper_id, _year_of(paper), abs_hash))

        # Full text: arXiv HTML5 -> ar5iv -> abstract (HTML only, no PDFs); raw HTML is vaulted to Bronze by the resolver
        need = [self._resolver_input(p, y) for p, pid, y, _ in todo if not (p.get("raw_html") or p.get("html_content"))]
        resolved: Dict[str, Dict[str, Any]] = {}
        if need:
            for r in self.resolver.resolve_batch_concurrent(need, max_workers=4):
                resolved[str(r["paper_id"])] = r
            origins = dict(collections.Counter(r.get("content_origin") for r in resolved.values()))
            logger.info("[Worker][Content] %s", origins)
            self._emit_log("INFO", "HTML-FETCH", f"{len(resolved)} paper(s) resolved: " + ", ".join(f"{k} {v}" for k, v in origins.items()), tier=tier_of(todo[0][0]))

        for paper, paper_id, year, abs_hash in todo:
            try:
                self._bronze(paper, paper_id, year)
                fresh.append((paper, self._silver_record(paper, resolved.get(paper_id)), year, abs_hash))
            except Exception as e:
                failed.append((paper, f"bronze/silver prep: {e}"))

        if n_dups:
            self._emit_log("INFO", "DEDUP", f"{n_dups} duplicate paper(s) skipped (abstract hash already in the lakehouse).", tier=tier_of(papers[0]))
        if not fresh:
            for paper, reason in failed:
                self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')}: {reason}", tier=tier_of(paper))
            return ok, failed

        # Silver: one immutable part per year in this batch
        by_year: Dict[str, List[Dict[str, Any]]] = {}
        for _, rec, year, _ in fresh:
            by_year.setdefault(year, []).append(rec)
        silver_failed_years = set()
        for year, recs in by_year.items():
            try:
                part = self.silver_writer.append_part(recs, year=year)
                self._emit_log("SUCCESS", "SILVER-VAULT", f"+{len(recs)} row(s) -> {part['key']} ({part['size_bytes'] // 1024} KB)", tier=tier_of(recs[0]))
            except Exception as e:
                silver_failed_years.add(year)
                logger.error("[Worker][Silver] Failed writing year=%s part: %s", year, e)

        good = []
        for paper, rec, year, abs_hash in fresh:
            if year in silver_failed_years:
                failed.append((paper, "silver write failed"))
            else:
                good.append((paper, rec, abs_hash))

        # Gold: chunk + embed + upsert, per paper so one bad paper does not poison the batch
        landed: List[Dict[str, Any]] = []
        chunk_counts: Dict[str, int] = {}
        for paper, rec, abs_hash in good:
            pid = str(rec["paper_id"])
            try:
                chunks = self.chunker.chunk_paper(rec)
                if chunks:
                    vectors = self.embedder.embed_documents([c.get("context_text") or c.get("text", "") for c in chunks])
                    for c, vec in zip(chunks, vectors):
                        c["vector"] = vec
                    self.qdrant.insert_chunks(chunks)
                chunk_counts[pid] = len(chunks)
                self.dedup.record(abs_hash, pid)  # only after Bronze+Silver+Gold are durable
                ok.append(paper)
                landed.append(rec)
            except Exception as e:
                failed.append((paper, f"gold: {e}"))

        self.dedup.save()
        self.last_ingested = landed
        if landed:
            try:
                total_vectors = int(self.qdrant.count())
            except Exception:
                total_vectors = 0
            self._emit_log(
                "SUCCESS", "GOLD-VECTOR",
                f"+{sum(chunk_counts.values())} chunk(s) from {len(landed)} paper(s) upserted to Qdrant"
                + (f" (collection total {total_vectors:,})" if total_vectors else "") + f" in {time.time() - t_batch:.1f}s",
                tier=tier_of(landed[0]), refresh=True,
            )
            self._broadcast(landed, chunk_counts)
        for paper, reason in failed:
            self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')}: {reason}", tier=tier_of(paper))
        return ok, failed

    @staticmethod
    def _post_event(payload: Dict[str, Any]) -> None:
        """Best-effort POST to the backend monitor; skipped when BACKEND_BROADCAST_URL is empty or the backend is down."""
        if not settings.BACKEND_BROADCAST_URL:
            return
        try:
            httpx.post(settings.BACKEND_BROADCAST_URL, json=payload, timeout=1.0)
        except Exception:
            pass

    def _emit_log(self, level: str, tag: str, msg: str, tier: Optional[str] = None, refresh: bool = False) -> None:
        self._post_event({"type": "LOG", "level": level, "tag": tag, "msg": msg, "tier": tier, "refresh": refresh})

    def _broadcast(self, landed: List[Dict[str, Any]], chunk_counts: Dict[str, int]) -> None:
        """One PAPER_INGESTED event per paper that is now in Bronze, Silver and Gold."""
        for rec in landed:
            self._post_event({
                "type": "PAPER_INGESTED",
                "paper_id": rec.get("paper_id"),
                "title": str(rec.get("title", ""))[:140],
                "category": rec.get("primary_category", ""),
                "tier": rec.get("tier", ""),
                "source": rec.get("source", ""),
                "content_origin": rec.get("content_origin", ""),
                "total_words": rec.get("total_words"),
                "total_sections": rec.get("total_sections"),
                "vectors_synced": chunk_counts.get(str(rec.get("paper_id")), 0),
            })

    def process_paper(self, paper: Dict[str, Any]) -> bool:
        """Single-paper convenience wrapper around process_batch (used by tests/scripts)."""
        _, failed = self.process_batch([paper])
        return not failed

    # ------------------------------------------------------------------ AMQP
    def _requeue_or_bury(self, channel, paper: Dict[str, Any], retries: int, reason: str) -> None:
        import pika

        body = json.dumps(paper, ensure_ascii=False).encode("utf-8")
        if retries + 1 > self.max_retries:
            dead = dict(paper)
            dead["_dead_reason"] = reason
            channel.basic_publish(
                exchange="", routing_key=self.dead_queue, body=json.dumps(dead, ensure_ascii=False).encode("utf-8"),
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
            )
            logger.error("[Worker] Paper %s dead-lettered after %d retries: %s", paper.get("paper_id"), retries, reason)
            self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')} moved to the dead-letter queue after {retries} retries: {reason}", tier=paper.get("tier"))
        else:
            channel.basic_publish(
                exchange="", routing_key=self.queue_name, body=body,
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json", headers={RETRY_HEADER: retries + 1}),
            )
            logger.warning("[Worker] Paper %s requeued (retry %d/%d): %s", paper.get("paper_id"), retries + 1, self.max_retries, reason)
            self._emit_log("WARN", "WORKER", f"{paper.get('paper_id')} requeued (retry {retries + 1}/{self.max_retries}): {reason}", tier=paper.get("tier"))

    def run_pika(self) -> None:
        import pika

        conn = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
        channel = conn.channel()
        channel.queue_declare(queue=self.queue_name, durable=True)
        channel.queue_declare(queue=self.dead_queue, durable=True)
        channel.basic_qos(prefetch_count=self.batch_size)

        def stop(*_):
            self._running = False

        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        self._emit_log("SUCCESS", "WORKER", f"Ingestion worker started (batch={self.batch_size}) on queue '{self.queue_name}'.")
        logger.info("[*] Listening on '%s' (batch=%d, dead-letter='%s'). Ctrl+C to exit.", self.queue_name, self.batch_size, self.dead_queue)

        pending: List[Tuple[int, Dict[str, Any], int]] = []  # (delivery_tag, paper, retries)

        def flush() -> None:
            if not pending:
                return
            papers = [p for _, p, _ in pending]
            try:
                ok, failed = self.process_batch(papers)
            except Exception as e:  # whole-batch crash: treat every paper as failed
                ok, failed = [], [(p, f"batch crash: {e}") for p in papers]
            failed_ids = {id(p): r for p, r in failed}
            for tag, paper, retries in pending:
                reason = failed_ids.get(id(paper))
                if reason is not None:
                    self._requeue_or_bury(channel, paper, retries, reason)
                channel.basic_ack(delivery_tag=tag)  # ack after re-publish/dead-letter -> never lost
            logger.info("[Worker] Batch done: %d ok/skipped, %d failed", len(ok), len(failed))
            pending.clear()

        try:
            for method, props, body in channel.consume(self.queue_name, inactivity_timeout=self.idle_flush_seconds):
                if not self._running:
                    break
                if method is None:  # idle: flush whatever is buffered
                    flush()
                    continue
                try:
                    paper = json.loads(body.decode("utf-8"))
                except Exception as e:
                    logger.error("[Worker] Unparseable message sent to dead-letter: %s", e)
                    channel.basic_publish(exchange="", routing_key=self.dead_queue, body=body, properties=pika.BasicProperties(delivery_mode=2))
                    channel.basic_ack(delivery_tag=method.delivery_tag)
                    continue
                retries = int((props.headers or {}).get(RETRY_HEADER, 0)) if props else 0
                pending.append((method.delivery_tag, paper, retries))
                if len(pending) >= self.batch_size:
                    flush()
        finally:
            flush()
            self.dedup.save()
            try:
                channel.cancel()
                conn.close()
            except Exception:
                pass

    def run(self) -> None:
        try:
            import pika  # noqa: F401
        except ImportError:
            logger.error("pika is required for the queue consumer: pip install pika")
            return
        self.run_pika()


if __name__ == "__main__":
    QueueConsumer().run()
