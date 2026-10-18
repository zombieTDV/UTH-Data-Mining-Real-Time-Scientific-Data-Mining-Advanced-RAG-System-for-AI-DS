"""RabbitMQ Ingestion Worker / Consumer.

Single gate into the Medallion lakehouse, run as two stages joined by a second queue so that network fetching and
the embedding model never wait on each other:

  --stage fetch   ingest queue (harvested metadata)
                  -> dedup (paper_id or abstract hash already in Silver) -> full text -> Bronze -> Silver part
                  -> embed queue (one Silver record per message). Pauses while the embed queue holds EMBED_QUEUE_MAX.
  --stage embed   embed queue -> chunk + embed (one model call per micro-batch) -> Gold (Qdrant)
  --stage all     both in one process, as before (default; used by tests and scripts)

Run one fetch worker (it is the only Silver writer, so its in-memory dedup set stays exact) and one embed worker
(one GPU / MPS device). Messages are acked only once their stage's output is durable. A failing message is
re-published to its own queue with an incremented retry counter and moved to that queue's dead-letter queue after
RABBITMQ_MAX_RETRIES: a paper that reached Silver is retried from the embed queue, never fetched again.
No local files are written.
"""

import argparse
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
from src.storage.known_papers import is_known, load_known_paper_ids, remember
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
        stage: str = "all",
    ):
        self.stage = stage
        self.storage = storage_client or StorageClient()
        self.qdrant = qdrant_client or QdrantManager()
        # paper_ids + abstract hashes in Silver; the fetch stage is the only writer, so it stays exact
        self.known = load_known_paper_ids() if stage != "embed" else set()
        self._embedder = None
        self.queue_name = settings.RABBITMQ_QUEUE_INGEST
        self.dead_queue = settings.RABBITMQ_QUEUE_DEAD
        self.embed_queue = settings.RABBITMQ_QUEUE_EMBED
        self.embed_dead_queue = settings.RABBITMQ_QUEUE_EMBED_DEAD
        self.embed_queue_max = settings.EMBED_QUEUE_MAX
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
        m = re.fullmatch(r"(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(v\d+)?", pid)  # new and pre-2007 arXiv ids
        # Semantic Scholar sometimes lacks the arXiv id but its open-access link is arXiv: take the HTML route then
        m = m or re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})(v\d+)?", str(paper.get("pdf_url") or ""))
        return {
            "paper_id": pid,
            "title": paper.get("title", ""),
            "abstract": paper.get("abstract", ""),
            "source": "arxiv" if m else str(paper.get("source", "arxiv")),
            "year": year,
            "arxiv_id": m.group(1) if m else None,
            "tier": paper.get("tier"),
            "pdf_url": paper.get("pdf_url") or "",  # used only for Tier 3 papers that are not on arXiv
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
        """Fetch + embed a micro-batch in one go. Returns (succeeded_or_skipped, [(failed_paper, reason)])."""
        ok, failed, good = self.prepare_batch(papers, remember_on_silver=False)
        landed_ok, gold_failed = self.gold_batch(good)
        return ok + landed_ok, failed + gold_failed

    def prepare_batch(
        self, papers: List[Dict[str, Any]], remember_on_silver: bool = True
    ) -> Tuple[List[Dict[str, Any]], List[Tuple[Dict[str, Any], str]], List[Tuple[Dict[str, Any], Dict[str, Any]]]]:
        """Fetch stage: dedup -> full text -> Bronze -> Silver part.
        Returns (skipped_duplicates, [(failed_paper, reason)], [(paper, silver_record)] now in Silver).
        remember_on_silver marks papers known once in Silver (fetch stage: the embed queue retries Gold on its own);
        in the single-process mode a paper is only known once it is also in Gold, so a Gold failure is re-fetched."""
        ok: List[Dict[str, Any]] = []
        failed: List[Tuple[Dict[str, Any], str]] = []
        fresh: List[Tuple[Dict[str, Any], Dict[str, Any], str]] = []  # paper, silver_rec, year
        n_dups = 0
        tier_of = lambda p: str(p.get("tier") or "tier1")  # noqa: E731

        todo: List[Tuple[Dict[str, Any], str, str]] = []  # paper, paper_id, year
        in_batch: set = set()
        for paper in papers:
            paper_id = str(paper.get("paper_id", "")).strip()
            if not paper_id:
                failed.append((paper, "missing paper_id"))
                continue
            # refresh=True re-indexes a paper we already hold with better content (e.g. a Tier 3 classic's open-access PDF)
            refresh = bool(paper.get("refresh"))
            if is_known(in_batch, paper_id, paper.get("abstract")) or (not refresh and is_known(self.known, paper_id, paper.get("abstract"))):
                logger.info("[Worker][Dedup] Skipping duplicate %s", paper_id)
                n_dups += 1
                ok.append(paper)
                continue
            todo.append((paper, paper_id, _year_of(paper)))
            remember(in_batch, paper_id, paper.get("abstract"))

        # Full text: arXiv HTML5 -> ar5iv -> abstract (HTML only, no PDFs); raw HTML is vaulted to Bronze by the resolver
        need = [self._resolver_input(p, y) for p, pid, y in todo if not (p.get("raw_html") or p.get("html_content"))]
        resolved: Dict[str, Dict[str, Any]] = {}
        if need:
            for r in self.resolver.resolve_batch_concurrent(need, max_workers=4):
                resolved[str(r["paper_id"])] = r
            origins = dict(collections.Counter(r.get("content_origin") for r in resolved.values()))
            logger.info("[Worker][Content] %s", origins)
            self._emit_log("INFO", "HTML-FETCH", f"{len(resolved)} paper(s) resolved: " + ", ".join(f"{k} {v}" for k, v in origins.items()), tier=tier_of(todo[0][0]))

        for paper, paper_id, year in todo:
            try:
                self._bronze(paper, paper_id, year)
                fresh.append((paper, self._silver_record(paper, resolved.get(paper_id)), year))
            except Exception as e:
                failed.append((paper, f"bronze/silver prep: {e}"))

        if n_dups:
            self._emit_log("INFO", "DEDUP", f"{n_dups} duplicate paper(s) skipped (paper_id or abstract hash already in Silver).", tier=tier_of(papers[0]))
        if not fresh:
            for paper, reason in failed:
                self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')}: {reason}", tier=tier_of(paper))
            return ok, failed, []

        # Silver: one immutable part per year in this batch
        by_year: Dict[str, List[Dict[str, Any]]] = {}
        for _, rec, year in fresh:
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
        for paper, rec, year in fresh:
            if year in silver_failed_years:
                failed.append((paper, "silver write failed"))
            else:
                good.append((paper, rec))
                if remember_on_silver:
                    remember(self.known, str(rec["paper_id"]), rec.get("abstract"))
        for paper, reason in failed:
            self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')}: {reason}", tier=tier_of(paper))
        return ok, failed, good

    def gold_batch(
        self, items: List[Tuple[Dict[str, Any], Dict[str, Any]]]
    ) -> Tuple[List[Dict[str, Any]], List[Tuple[Dict[str, Any], str]]]:
        """Embed stage: chunk every record, embed all chunks of the micro-batch in one model call, upsert to Qdrant.
        `items` are (message, silver_record); returns (landed messages, [(failed message, reason)])."""
        ok: List[Dict[str, Any]] = []
        failed: List[Tuple[Dict[str, Any], str]] = []
        if not items:
            return ok, failed
        t_batch = time.time()
        tier_of = lambda p: str(p.get("tier") or "tier1")  # noqa: E731

        chunked: List[Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]]]] = []
        for msg, rec in items:
            try:
                chunked.append((msg, rec, self.chunker.chunk_paper(rec)))
            except Exception as e:
                failed.append((msg, f"chunk: {e}"))
        texts = [c.get("context_text") or c.get("text", "") for _, _, chunks in chunked for c in chunks]
        try:
            vectors = self.embedder.embed_documents(texts) if texts else []
        except Exception as e:
            logger.error("[Worker][Gold] Batch embedding failed, retrying paper by paper: %s", e)
            vectors = None

        landed: List[Dict[str, Any]] = []
        chunk_counts: Dict[str, int] = {}
        offset = 0
        for msg, rec, chunks in chunked:
            pid = str(rec["paper_id"])
            try:
                if vectors is None and chunks:  # isolate the paper that broke the batch call
                    vecs = self.embedder.embed_documents([c.get("context_text") or c.get("text", "") for c in chunks])
                else:
                    vecs = vectors[offset:offset + len(chunks)]
                offset += len(chunks)
                if msg.get("refresh"):
                    self.qdrant.delete_paper(pid)  # drop the old (abstract-only) chunks first
                if chunks:
                    for c, vec in zip(chunks, vecs):
                        c["vector"] = vec
                    self.qdrant.insert_chunks(chunks)
                chunk_counts[pid] = len(chunks)
                remember(self.known, pid, rec.get("abstract"))  # single-process mode: known only once Gold is durable
                ok.append(msg)
                landed.append(rec)
            except Exception as e:
                failed.append((msg, f"gold: {e}"))

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
    def _requeue_or_bury(self, channel, paper: Dict[str, Any], retries: int, reason: str, queue: str, dead_queue: str) -> None:
        import pika

        body = json.dumps(paper, ensure_ascii=False).encode("utf-8")
        if retries + 1 > self.max_retries:
            dead = dict(paper)
            dead["_dead_reason"] = reason
            channel.basic_publish(
                exchange="", routing_key=dead_queue, body=json.dumps(dead, ensure_ascii=False).encode("utf-8"),
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
            )
            logger.error("[Worker] Paper %s dead-lettered after %d retries: %s", paper.get("paper_id"), retries, reason)
            self._emit_log("ERROR", "WORKER", f"{paper.get('paper_id')} moved to the dead-letter queue after {retries} retries: {reason}", tier=paper.get("tier"))
        else:
            channel.basic_publish(
                exchange="", routing_key=queue, body=body,
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json", headers={RETRY_HEADER: retries + 1}),
            )
            logger.warning("[Worker] Paper %s requeued (retry %d/%d): %s", paper.get("paper_id"), retries + 1, self.max_retries, reason)
            self._emit_log("WARN", "WORKER", f"{paper.get('paper_id')} requeued (retry {retries + 1}/{self.max_retries}): {reason}", tier=paper.get("tier"))

    # One handler per stage: take the buffered messages, return (failed messages with reasons). Everything not
    # returned as failed is acked; failed ones are re-published to the consumed queue (or its dead-letter queue).
    def _handle_all(self, channel, papers: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], str]]:
        return self.process_batch(papers)[1]

    def _handle_fetch(self, channel, papers: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], str]]:
        import pika

        _, failed, good = self.prepare_batch(papers, remember_on_silver=True)
        for paper, rec in good:
            msg = {**rec, "refresh": bool(paper.get("refresh"))}
            channel.basic_publish(  # confirm_delivery is on: raises unless the broker stored it
                exchange="", routing_key=self.embed_queue, body=json.dumps(msg, ensure_ascii=False).encode("utf-8"),
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
            )
        return failed

    def _handle_embed(self, channel, records: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], str]]:
        return self.gold_batch([(r, r) for r in records])[1]

    def _wait_for_embed_room(self, conn, channel) -> None:
        """Fetch-stage backpressure: hold off while the embed queue already has EMBED_QUEUE_MAX records waiting."""
        announced = False
        while self._running:
            waiting = channel.queue_declare(queue=self.embed_queue, durable=True, passive=True).method.message_count
            if waiting < self.embed_queue_max:
                return
            if not announced:
                logger.info("[Worker] Embed queue holds %d records: fetch paused", waiting)
                self._emit_log("INFO", "BACKPRESSURE", f"Embed queue holds {waiting:,} records: fetching paused until the model catches up.")
                announced = True
            conn.sleep(5)  # keeps AMQP heartbeats going while waiting

    def run_pika(self) -> None:
        import pika

        handler, queue, dead_queue = {
            "all": (self._handle_all, self.queue_name, self.dead_queue),
            "fetch": (self._handle_fetch, self.queue_name, self.dead_queue),
            "embed": (self._handle_embed, self.embed_queue, self.embed_dead_queue),
        }[self.stage]

        conn = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
        channel = conn.channel()
        for q in (self.queue_name, self.dead_queue, self.embed_queue, self.embed_dead_queue):
            channel.queue_declare(queue=q, durable=True)
        channel.confirm_delivery()
        channel.basic_qos(prefetch_count=self.batch_size)

        def stop(*_):
            self._running = False

        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        self._emit_log("SUCCESS", "WORKER", f"Ingestion worker started (stage={self.stage}, batch={self.batch_size}) on queue '{queue}'.")
        logger.info("[*] Stage '%s' listening on '%s' (batch=%d, dead-letter='%s'). Ctrl+C to exit.", self.stage, queue, self.batch_size, dead_queue)

        pending: List[Tuple[int, Dict[str, Any], int]] = []  # (delivery_tag, message, retries)

        def flush() -> None:
            if not pending:
                return
            if self.stage == "fetch":
                self._wait_for_embed_room(conn, channel)
            msgs = [m for _, m, _ in pending]
            try:
                failed = handler(channel, msgs)
            except Exception as e:  # whole-batch crash: treat every message as failed
                logger.exception("[Worker] Batch crashed")
                failed = [(m, f"batch crash: {e}") for m in msgs]
            failed_ids = {id(m): r for m, r in failed}
            for tag, msg, retries in pending:
                reason = failed_ids.get(id(msg))
                if reason is not None:
                    self._requeue_or_bury(channel, msg, retries, reason, queue, dead_queue)
                channel.basic_ack(delivery_tag=tag)  # ack after re-publish/dead-letter -> never lost
            logger.info("[Worker] Batch done: %d ok/skipped, %d failed", len(msgs) - len(failed), len(failed))
            pending.clear()

        try:
            for method, props, body in channel.consume(queue, inactivity_timeout=self.idle_flush_seconds):
                if not self._running:
                    break
                if method is None:  # idle: flush whatever is buffered
                    flush()
                    continue
                try:
                    msg = json.loads(body.decode("utf-8"))
                except Exception as e:
                    logger.error("[Worker] Unparseable message sent to dead-letter: %s", e)
                    channel.basic_publish(exchange="", routing_key=dead_queue, body=body, properties=pika.BasicProperties(delivery_mode=2))
                    channel.basic_ack(delivery_tag=method.delivery_tag)
                    continue
                retries = int((props.headers or {}).get(RETRY_HEADER, 0)) if props else 0
                pending.append((method.delivery_tag, msg, retries))
                if len(pending) >= self.batch_size:
                    flush()
        finally:
            flush()
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
    ap = argparse.ArgumentParser(description="RabbitMQ ingestion worker")
    ap.add_argument("--stage", choices=("all", "fetch", "embed"), default="all")
    ap.add_argument("--batch", type=int, default=None, help="micro-batch size (default: fetch/all 16, embed 32)")
    args = ap.parse_args()
    QueueConsumer(stage=args.stage, batch_size=args.batch or (32 if args.stage == "embed" else 16)).run()
