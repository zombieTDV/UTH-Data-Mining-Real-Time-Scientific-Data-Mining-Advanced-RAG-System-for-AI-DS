"""Tier 1: Live Real-Time Forward Stream Pipeline (Zero-Day Preprints).

Producer side of the streaming path. It only harvests and enqueues:
- Streams newest preprints from arXiv RSS.
- Skips abstracts already in the lakehouse (read-only check against the MinIO hash manifest).
- Publishes each new paper to RabbitMQ (scientific_paper_ingest).

The queue consumer (src.ingestion.queue_consumer) is the single writer for
Bronze (MinIO), Silver (MinIO Parquet), Gold (Qdrant) and the dedup manifest,
so a paper is never processed twice and nothing is written to local disk.

Usage:
    python -m src.pipelines.run_tier1_realtime_stream --limit 20
    python -m src.pipelines.run_tier1_realtime_stream --daemon
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

logger, log_file = setup_pipeline_logging("tier1_realtime_stream")

ARXIV_CATEGORIES = settings.ARXIV_CATEGORIES


class Tier1RealtimeStreamer:
    """Harvests live preprints and enqueues the new ones for the ingestion consumer."""

    def __init__(self, poll_interval: int = 300, publisher: Optional[QueuePublisher] = None, **_ignored):
        self.dedup = LakehouseDeduplicator()
        self.publisher = publisher or QueuePublisher()
        self.poll_interval = poll_interval

    def _entries_for(self, cat: str, limit: int) -> List[Dict[str, Any]]:
        """Newest papers of a category: daily RSS (new + cross-listed), else the arXiv API by submission date.

        rss.arxiv.org serves an empty feed on non-announcement days, so the API fallback keeps the stream alive.
        """
        out: List[Dict[str, Any]] = []
        feed = feedparser.parse(f"https://rss.arxiv.org/rss/{cat}", request_headers={"User-Agent": settings.ARXIV_USER_AGENT})
        for e in feed.entries:
            if e.get("arxiv_announce_type", "new") not in ("new", "cross"):
                continue
            text = re.sub(r"\s+", " ", e.summary).strip()
            m = re.search(r"(\d{4}\.\d{4,5})", e.link)
            out.append({
                "paper_id": m.group(1) if m else e.link.split("/")[-1],
                "title": re.sub(r"\s+", " ", e.title).strip(),
                "abstract": text.split("Abstract:", 1)[1].strip() if "Abstract:" in text else text,
                "authors": [a.name for a in getattr(e, "authors", []) if hasattr(a, "name")],
                "link": e.link,
                "published": getattr(e, "published", ""),
            })
            if len(out) >= limit:
                return out
        if out:
            return out

        logger.info("[TIER 1] RSS empty for %s; falling back to the arXiv API", cat)
        url = f"https://export.arxiv.org/api/query?search_query=cat:{cat}&sortBy=submittedDate&sortOrder=descending&max_results={limit}"
        for e in feedparser.parse(url, request_headers={"User-Agent": settings.ARXIV_USER_AGENT}).entries:
            m = re.search(r"(\d{4}\.\d{4,5})", e.id)
            out.append({
                "paper_id": m.group(1) if m else e.id.rsplit("/", 1)[-1],
                "title": re.sub(r"\s+", " ", e.title).strip(),
                "abstract": re.sub(r"\s+", " ", e.summary).strip(),
                "authors": [a.name for a in getattr(e, "authors", []) if hasattr(a, "name")],
                "link": e.link,
                "published": getattr(e, "published", ""),
            })
        return out

    def fetch_arxiv_rss_candidates(self, max_per_cat: int = 4) -> List[Dict[str, Any]]:
        """Fetches zero-day preprint entries for every configured category."""
        candidates: List[Dict[str, Any]] = []
        for cat in ARXIV_CATEGORIES:
            try:
                for item in self._entries_for(cat, max_per_cat):
                    p_id = item["paper_id"]
                    abs_hash = self.dedup.compute_hash(item["abstract"], item["title"])
                    candidates.append({
                        "paper_id": p_id,
                        "title": item["title"],
                        "abstract": item["abstract"],
                        "authors": item["authors"],
                        "categories": [cat],
                        "primary_category": cat,
                        "link": item["link"],
                        "pdf_url": f"https://arxiv.org/pdf/{p_id}.pdf",
                        "html_url": f"https://arxiv.org/html/{p_id}",
                        "published_date": item["published"] or datetime.date.today().isoformat(),
                        "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "source": "arxiv_rss",
                        "tier": "tier1",
                        "abstract_hash": abs_hash,
                        "is_duplicate": abs_hash in self.dedup,
                    })
            except Exception as e:
                logger.warning("[TIER 1] Failed fetching %s: %s", cat, e)
            time.sleep(settings.ARXIV_REQUEST_DELAY_SECONDS if cat != ARXIV_CATEGORIES[-1] else 0)  # arXiv API etiquette
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
                logger.info("[TIER 1][DEDUP] (%d/%d) Skipping duplicate: %s - %s", idx, len(candidates), p_id, title[:50])
                continue
            seen_hashes.add(paper["abstract_hash"])
            if self.publisher.publish_paper(paper):
                enqueued += 1
            else:
                failed += 1
                logger.error("[TIER 1] Failed to enqueue %s", p_id)

        summary = {
            "status": "NO_CANDIDATES" if not candidates else ("SUCCESS" if failed == 0 else "PARTIAL"),
            "tier": "tier1_realtime_stream",
            "candidates_found": len(candidates),
            "newly_ingested": enqueued,
            "dedup_skipped": duplicates,
            "enqueue_failed": failed,
            "duration_s": round(time.time() - start_time, 2),
        }
        logger.info("[TIER 1] Finished batch: %s", summary)
        return summary

    def run_daemon(self):
        """Continuously polls real-time sources in a loop."""
        logger.info(f"[TIER 1] Starting continuous forward daemon (Interval: {self.poll_interval}s)...")
        try:
            while True:
                self.process_batch(limit=20)
                logger.info(f"[TIER 1] Sleeping {self.poll_interval}s until next poll...")
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            logger.info("[TIER 1] Stream daemon interrupted cleanly.")


def main():
    parser = argparse.ArgumentParser(description="Run Tier 1 Live Real-Time Forward Stream Pipeline.")
    parser.add_argument("--limit", type=int, default=10, help="Batch limit for one-shot harvest")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in daemon mode")
    parser.add_argument("--poll-interval", type=int, default=300, help="Poll interval in seconds")
    args = parser.parse_args()

    streamer = Tier1RealtimeStreamer(poll_interval=args.poll_interval)
    if args.daemon:
        streamer.run_daemon()
    else:
        result = streamer.process_batch(limit=args.limit)
        print("\n" + "=" * 60)
        print(f"TIER 1 REAL-TIME STREAM RESULT: {result['status']}")
        print(f"Enqueued: {result.get('newly_ingested', 0)} | Skipped Dups: {result.get('dedup_skipped', 0)} | Duration: {result.get('duration_s', 0)}s")
        print("=" * 60)


if __name__ == "__main__":
    main()
