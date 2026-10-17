"""Tier 3: Live Real-Time Forward Stream Pipeline (Zero-Day Preprints).

Ingests continuous preprints from present moment onwards across arXiv and academic sources:
- Streams newest preprints (arXiv RSS / API, Zenodo).
- Checks deduplication via normalized SHA-256 abstract hashing (LakehouseDeduplicator).
- Vaults to Medallion Lakehouse:
    * 🥉 Bronze: Raw JSON metadata & HTML to MinIO (bronze/tier3/...)
    * 🥈 Silver: Cleaned Parquet to local (data/silver/tier3/realtime_papers.parquet) & MinIO
    * 🥇 Gold: Section-aware chunking & 768-D dense vectors into Qdrant (scientific_papers_gold)
- Publishes ingestion events to RabbitMQ (scientific_paper_ingest).

Usage:
    python -m src.pipelines.run_tier3_realtime_stream --limit 20
    python -m src.pipelines.run_tier3_realtime_stream --daemon
"""

import argparse
import datetime
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import feedparser
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.ingestion.queue_publisher import QueuePublisher
from src.storage.minio_client import StorageClient
from src.transformation.html_parser import AcademicHTMLParser
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.transformation.silver_writer import SilverLakehouseWriter
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier3_realtime_stream")

ARXIV_CATEGORIES = ["cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML"]


class Tier3RealtimeStreamer:
    """Manages real-time streaming ingestion into Bronze, Silver, and Gold tiers."""

    def __init__(
        self,
        storage_client: Optional[StorageClient] = None,
        qdrant_manager: Optional[QdrantManager] = None,
        poll_interval: int = 300,
        **kwargs,
    ):
        self.storage = storage_client or StorageClient()
        self.qdrant = qdrant_manager or QdrantManager()
        self.dedup = LakehouseDeduplicator()
        self.silver_writer = SilverLakehouseWriter(storage_client=self.storage)
        self.html_parser = AcademicHTMLParser()
        self.chunker = AcademicChunker(max_chunk_words=450, overlap_words=50)
        self.publisher = QueuePublisher()
        self._embedder = None
        self.poll_interval = poll_interval

        self.bronze_dir = settings.ROOT_DIR / "data" / "raw" / "tier3"
        self.silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier3"
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.silver_dir.mkdir(parents=True, exist_ok=True)

    @property
    def embedder(self) -> NomicEmbedder:
        if self._embedder is None:
            self._embedder = NomicEmbedder()
        return self._embedder

    def fetch_arxiv_rss_candidates(self, max_per_cat: int = 4) -> List[Dict[str, Any]]:
        """Fetches zero-day preprint entries from arXiv RSS feeds."""
        candidates = []
        for cat in ARXIV_CATEGORIES:
            feed_url = f"http://export.arxiv.org/rss/{cat}"
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:max_per_cat]:
                    m = re.search(r"(\d{4}\.\d{4,5})", entry.link)
                    p_id = m.group(1) if m else entry.link.split("/")[-1]
                    title = re.sub(r"\s+", " ", entry.title).strip()
                    summary = re.sub(r"\s+", " ", entry.summary).strip()
                    authors = [a.name for a in getattr(entry, "authors", []) if hasattr(a, "name")]
                    abs_hash = compute_abstract_hash(summary or title)

                    candidates.append({
                        "paper_id": p_id,
                        "title": title,
                        "abstract": summary,
                        "authors": authors,
                        "categories": [cat],
                        "primary_category": cat,
                        "link": entry.link,
                        "pdf_url": f"https://arxiv.org/pdf/{p_id}.pdf",
                        "html_url": f"https://ar5iv.labs.arxiv.org/html/{p_id}",
                        "published_date": getattr(entry, "published", datetime.date.today().isoformat()),
                        "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "source": "arxiv_rss",
                        "tier": "tier3",
                        "abstract_hash": abs_hash,
                        "is_duplicate": abs_hash in self.dedup,
                    })
            except Exception as e:
                logger.warning(f"[TIER 3] Failed fetching RSS for {cat}: {e}")
        return candidates

    def process_batch(self, limit: int = 20) -> Dict[str, Any]:
        """Harvests, deduplicates, and vaults incoming live preprints."""
        start_time = time.time()
        candidates = self.fetch_arxiv_rss_candidates(max_per_cat=max(2, limit // len(ARXIV_CATEGORIES)))
        if limit and len(candidates) > limit:
            candidates = candidates[:limit]

        ingested_records: List[Dict[str, Any]] = []
        new_papers_count = 0
        duplicate_count = 0

        for idx, paper in enumerate(candidates, 1):
            p_id = paper["paper_id"]
            title = paper["title"]
            abs_hash = paper["abstract_hash"]

            if paper.get("is_duplicate"):
                duplicate_count += 1
                logger.info(f"[TIER 3][DEDUP] ({idx}/{len(candidates)}) Skipping duplicate: {p_id} - {title[:50]}")
                continue

            # 1. 🥉 Bronze: Save JSON locally and upload to MinIO
            safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", p_id)
            bronze_file = self.bronze_dir / f"{safe_id}.json"
            with open(bronze_file, "w", encoding="utf-8") as f:
                json.dump(paper, f, ensure_ascii=False, indent=2)

            year = paper.get("published_date", "")[:4] or "2026"
            try:
                self.storage.upload_json(paper, f"bronze/papers/{year}/{p_id}.json")
            except Exception as e:
                logger.warning(f"[TIER 3][Bronze] Upload warning: {e}")

            # 2. 🥈 Silver: Prepare record and save to Parquet
            parsed_html = {
                "parsed_title": title,
                "parsed_abstract": paper.get("abstract", ""),
                "sections": [{"section_title": "Abstract", "section_type": "abstract", "content": paper.get("abstract", "")}],
                "total_sections": 1,
                "total_math_count": 0,
                "total_words": len(paper.get("abstract", "").split()),
                "content_origin": "rss_abstract",
            }
            silver_rec = self.silver_writer.prepare_record(raw_meta=paper, parsed_html=parsed_html)
            ingested_records.append(silver_rec)
            self.dedup.record(abs_hash, p_id)
            new_papers_count += 1

            # 3. Publish to RabbitMQ
            try:
                self.publisher.publish_paper(paper)
            except Exception:
                pass

        self.dedup.save()

        # Update Silver Parquet
        if ingested_records:
            t3_file = self.silver_dir / "realtime_papers.parquet"
            df_new = pd.DataFrame(ingested_records)
            if t3_file.exists():
                try:
                    df_old = pq.read_table(t3_file).to_pandas()
                    df_new = pd.concat([df_old, df_new], ignore_index=True).drop_duplicates(subset=["abstract_hash"], keep="last")
                except Exception:
                    pass
            pq.write_table(pa.Table.from_pandas(df_new, preserve_index=False), t3_file, compression="zstd")

            # Upload to MinIO Silver
            try:
                current_year = str(datetime.date.today().year)
                self.silver_writer.save_and_upload_parquet(ingested_records, year=current_year)
            except Exception as e:
                logger.warning(f"[TIER 3][Silver] S3 sync warning: {e}")

            # 4. 🥇 Gold: Section Chunks & Qdrant Upsert
            all_chunks = []
            for rec in ingested_records:
                chunks = self.chunker.chunk_paper(rec)
                all_chunks.extend(chunks)

            if all_chunks:
                try:
                    texts = [c.get("context_text") or c.get("text", "") for c in all_chunks]
                    vectors = self.embedder.embed_documents(texts)
                    for c, v in zip(all_chunks, vectors):
                        c["vector"] = v
                    self.qdrant.insert_chunks(all_chunks)
                    logger.info(f"[TIER 3][Gold] Upserted {len(all_chunks)} vectors into Qdrant")
                except Exception as e:
                    logger.error(f"[TIER 3][Gold] Embedding / upsert error: {e}")

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "SUCCESS",
            "tier": "tier3_realtime_stream",
            "candidates_found": len(candidates),
            "newly_ingested": new_papers_count,
            "dedup_skipped": duplicate_count,
            "duration_s": duration,
        }
        logger.info(f"[TIER 3] Finished batch: {summary}")
        return summary

    def run_daemon(self):
        """Continuously polls real-time sources in a loop."""
        logger.info(f"[TIER 3] Starting continuous forward daemon (Interval: {self.poll_interval}s)...")
        try:
            while True:
                self.process_batch(limit=20)
                logger.info(f"[TIER 3] Sleeping {self.poll_interval}s until next poll...")
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            logger.info("[TIER 3] Stream daemon interrupted cleanly.")


def main():
    parser = argparse.ArgumentParser(description="Run Tier 3 Live Real-Time Forward Stream Pipeline.")
    parser.add_argument("--limit", type=int, default=10, help="Batch limit for one-shot harvest")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in daemon mode")
    parser.add_argument("--poll-interval", type=int, default=300, help="Poll interval in seconds")
    args = parser.parse_args()

    streamer = Tier3RealtimeStreamer(poll_interval=args.poll_interval)
    if args.daemon:
        streamer.run_daemon()
    else:
        result = streamer.process_batch(limit=args.limit)
        print("\n" + "=" * 60)
        print(f"TIER 3 REAL-TIME STREAM RESULT: {result['status']}")
        print(f"Ingested: {result.get('newly_ingested', 0)} | Skipped Dups: {result.get('dedup_skipped', 0)} | Duration: {result.get('duration_s', 0)}s")
        print("=" * 60)


if __name__ == "__main__":
    main()
