"""Tier 3: Live Real-Time Forward Stream Pipeline (Zero-Day Preprints).

Producer side of the streaming path. It only harvests and enqueues:
- Streams newest preprints from arXiv RSS.
- Skips abstracts already in the lakehouse (read-only check against the MinIO hash manifest).
- Publishes each new paper to RabbitMQ (scientific_paper_ingest).

The queue consumer (src.ingestion.queue_consumer) is the single writer for
Bronze (MinIO), Silver (MinIO Parquet), Gold (Qdrant) and the dedup manifest,
so a paper is never processed twice and nothing is written to local disk.

Usage:
    python -m src.pipelines.run_tier3_realtime_stream --limit 20
    python -m src.pipelines.run_tier3_realtime_stream --daemon
"""

import argparse
import datetime
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import feedparser

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.ingestion.queue_publisher import QueuePublisher
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier3_realtime_stream")

ARXIV_CATEGORIES = settings.ARXIV_CATEGORIES


class Tier3RealtimeStreamer:
    """Harvests live preprints and enqueues the new ones for the ingestion consumer."""

    def __init__(self, poll_interval: int = 300, publisher: Optional[QueuePublisher] = None, **_ignored):
        self.dedup = LakehouseDeduplicator()
        self.publisher = publisher or QueuePublisher()
        self.poll_interval = poll_interval

    def fetch_arxiv_rss_candidates(self, max_per_cat: int = 4) -> List[Dict[str, Any]]:
        """Fetches zero-day preprint entries from arXiv RSS feeds."""
        candidates = []
        for cat in ARXIV_CATEGORIES:
            feed_url = f"https://export.arxiv.org/rss/{cat}"
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:max_per_cat]:
                    m = re.search(r"(\d{4}\.\d{4,5})", entry.link)
                    p_id = m.group(1) if m else entry.link.split("/")[-1]
                    title = re.sub(r"\s+", " ", entry.title).strip()
                    summary = re.sub(r"\s+", " ", entry.summary).strip()
                    authors = [a.name for a in getattr(entry, "authors", []) if hasattr(a, "name")]
                    abs_hash = self.dedup.compute_hash(summary, title)

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
        """Harvest, drop known duplicates, and enqueue the rest."""
        start_time = time.time()
        candidates = self.fetch_arxiv_rss_candidates(max_per_cat=max(2, limit // max(1, len(ARXIV_CATEGORIES))))
        if limit and len(candidates) > limit:
            candidates = candidates[:limit]

        enqueued = duplicates = failed = 0
        seen_hashes = set()
        for idx, paper in enumerate(candidates, 1):
            p_id, title = paper["paper_id"], paper["title"]
            if paper.pop("is_duplicate") or paper["abstract_hash"] in seen_hashes:
                duplicates += 1
                logger.info("[TIER 3][DEDUP] (%d/%d) Skipping duplicate: %s - %s", idx, len(candidates), p_id, title[:50])
                continue
            seen_hashes.add(paper["abstract_hash"])
            if self.publisher.publish_paper(paper):
                enqueued += 1
            else:
                failed += 1
                logger.error("[TIER 3] Failed to enqueue %s", p_id)

        summary = {
            "status": "SUCCESS" if failed == 0 else "PARTIAL",
            "tier": "tier3_realtime_stream",
            "candidates_found": len(candidates),
            "newly_ingested": enqueued,
            "dedup_skipped": duplicates,
            "enqueue_failed": failed,
            "duration_s": round(time.time() - start_time, 2),
        }
        logger.info("[TIER 3] Finished batch: %s", summary)
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
        print(f"Enqueued: {result.get('newly_ingested', 0)} | Skipped Dups: {result.get('dedup_skipped', 0)} | Duration: {result.get('duration_s', 0)}s")
        print("=" * 60)


if __name__ == "__main__":
    main()
