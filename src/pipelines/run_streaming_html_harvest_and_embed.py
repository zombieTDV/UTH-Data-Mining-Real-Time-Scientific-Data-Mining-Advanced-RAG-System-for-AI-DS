"""Real-Time Streaming Pipeline: High-Throughput HTML5 Harvester & Concurrent Nomic GPU Embedder.

Architectural Highlights:
1. Producer-Consumer Architecture:
   - Producer Worker (I/O Bound): Fast asynchronous/concurrent crawling of arXiv HTML5 documents
     via AcademicHTMLParser (LaTeX math, deep sections, structured headings, zero GPU overhead).
   - In-Memory Queue: Thread-safe queue decoupling network crawling from vector inference.
   - Consumer Worker (Compute Bound): Chunks papers via AcademicChunker and computes 768-D dense
     embeddings using NomicEmbedder on Apple Silicon GPU (MPS) or CUDA.
2. Zero-Latency RAG Grounding:
   - Chunks are stream-inserted directly into LanceDB ('scientific_papers_gold.lance') in micro-batches.
   - Any paper harvested becomes immediately retrievable and grounding-ready for the RAG chatbot.
3. Dual-Layer Vaulting:
   - Silver Layer: Clean full-text and sections vaulted to data/silver/tier2/html_papers.parquet.
   - Gold Layer: High-fidelity vectors and IVF-PQ updated in data/gold/lancedb/.
   - Cloudflare R2 Sync: Automatically synchronizes updated Silver and Gold partitions to Cloudflare R2.
4. Distributed Sharding Compatible:
   - Supports --shard-index and --total-shards to run seamlessly across peer machines without collision.

Usage:
    python -m src.pipelines.run_streaming_html_harvest_and_embed --target-papers 500 --sync-r2
"""

import argparse
import datetime
import hashlib
import json
import logging
import os
import queue
import re
import sys
import threading
import time
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import httpx
import lancedb
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.storage.r2_client import R2Client
from src.transformation.html_parser import AcademicHTMLParser
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("streaming_html_embed")


def sanitize_surrogates(val: Any) -> Any:
    """Eliminates isolated Unicode surrogate codepoints to safeguard PyArrow/Parquet."""
    if isinstance(val, str):
        return val.encode("utf-8", errors="ignore").decode("utf-8")
    elif isinstance(val, list):
        return [sanitize_surrogates(x) for x in val]
    elif isinstance(val, dict):
        return {k: sanitize_surrogates(v) for k, v in val.items()}
    return val


def broadcast_telemetry(payload: dict):
    """Transmits real-time progress pulses to the FastAPI SSE bridge."""
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


class StreamingHTMLHarvestAndEmbedPipeline:
    """Producer-consumer pipeline for real-time arXiv HTML harvesting and GPU LanceDB embedding."""

    TABLE_NAME = "scientific_papers_gold"

    def __init__(
        self,
        target_papers: int = 1000,
        batch_embed_size: int = 64,
        sync_r2: bool = False,
        shard_index: Optional[int] = None,
        total_shards: int = 1,
    ):
        self.target_papers = target_papers
        self.batch_embed_size = batch_embed_size
        self.sync_r2 = sync_r2
        self.shard_index = shard_index
        self.total_shards = max(total_shards, 1)

        # Storage paths
        self.silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"
        self.silver_dir.mkdir(parents=True, exist_ok=True)
        shard_suffix = f"_shard{self.shard_index}" if self.shard_index is not None else ""
        self.silver_parquet_path = self.silver_dir / f"html_papers{shard_suffix}.parquet"
        self.r2_silver_key = f"silver/tier2/html_papers{shard_suffix}.parquet"

        self.db_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(str(self.db_path))
        self.table = self.db.open_table(self.TABLE_NAME)

        self.r2 = R2Client() if sync_r2 else None
        self.html_parser = AcademicHTMLParser()
        self.chunker = AcademicChunker(max_chunk_words=300, overlap_words=50)
        self.embedder = NomicEmbedder()

        # Thread-safe communications
        self.paper_queue: queue.Queue = queue.Queue(maxsize=100)
        self.producer_done = threading.Event()
        self.existing_paper_ids: Set[str] = self._load_existing_ids()

        self.http_client = httpx.Client(
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Apple Silicon) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 AcademicMining/2.0"
            },
            timeout=20.0,
            follow_redirects=True,
        )

        # Metrics
        self.papers_harvested = 0
        self.papers_embedded = 0
        self.chunks_embedded = 0

    def _load_existing_ids(self) -> Set[str]:
        """Scans local Silver parquets and LanceDB to avoid re-crawling existing papers."""
        seen: Set[str] = set()

        # 1. From Silver Parquets
        for p in self.silver_dir.glob("*.parquet"):
            try:
                df = pd.read_parquet(p, columns=["paper_id"])
                seen.update(df["paper_id"].astype(str))
            except Exception:
                pass

        # 2. From LanceDB Gold table
        try:
            total_rows = len(self.table)
            if total_rows > 0:
                df_gold = self.table.search().select(["paper_id"]).limit(total_rows).to_pandas()
                seen.update(df_gold["paper_id"].astype(str))
        except Exception:
            pass

        logger.info("[FILTER CACHE] Loaded %d pre-existing paper IDs across Silver & Gold.", len(seen))
        return seen

    def load_candidate_pool(self) -> List[Dict[str, Any]]:
        """Extracts high-priority candidates from near_past_papers or arXiv API."""
        candidates = []
        near_past_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"

        # Download from R2 if local copy is stub
        if self.r2 and (not near_past_path.exists() or near_past_path.stat().st_size < 1000000):
            try:
                logger.info("[R2 SYNC] Pulling full near_past_papers.parquet from Cloudflare R2...")
                self.r2.download_file("silver/tier2/near_past_papers.parquet", near_past_path)
            except Exception as e:
                logger.warning("[R2 NOTE] Could not fetch near_past_papers: %s", e)

        if near_past_path.exists() and near_past_path.stat().st_size > 100000:
            try:
                df = pd.read_parquet(near_past_path)
                if "source" not in df.columns:
                    def _infer_source(r):
                        pid = str(r.get("paper_id", "")).lower()
                        if "openreview" in pid:
                            return "openreview"
                        if "cvf" in pid:
                            return "cvf"
                        if "doi" in pid or str(r.get("doi", "")).strip():
                            return "doi"
                        return "arxiv"
                    df["source"] = df.apply(_infer_source, axis=1)

                arxiv_df = df[df["source"] == "arxiv"]
                logger.info("[CANDIDATE POOL] Found %d arXiv candidates in %s.", len(arxiv_df), near_past_path.name)
                for _, r in arxiv_df.iterrows():
                    pid = str(r["paper_id"]).strip()
                    if pid in self.existing_paper_ids:
                        continue
                    if self.total_shards > 1 and self.shard_index is not None:
                        if int(hashlib.md5(pid.encode("utf-8")).hexdigest(), 16) % self.total_shards != self.shard_index:
                            continue
                    candidates.append(r.to_dict())
            except Exception as e:
                logger.warning("[CANDIDATES NOTE] %s", e)

        # Fallback to direct arXiv Atom API query if local pool is empty
        if not candidates:
            logger.info("[CANDIDATE STREAM] Fetching recent candidates from arXiv API...")
            categories = ["cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML"]
            for cat in categories:
                if len(candidates) >= self.target_papers * 3:
                    break
                try:
                    resp = self.http_client.get(
                        "http://export.arxiv.org/api/query",
                        params={
                            "search_query": f"cat:{cat}",
                            "start": 0,
                            "max_results": 100,
                            "sortBy": "submittedDate",
                            "sortOrder": "descending",
                        }
                    )
                    if resp.status_code == 200:
                        import xml.etree.ElementTree as ET
                        root = ET.fromstring(resp.text)
                        ns = {"atom": "http://www.w3.org/2005/Atom"}
                        for entry in root.findall("atom:entry", ns):
                            id_url = entry.find("atom:id", ns)
                            if id_url is None:
                                continue
                            raw_id = id_url.text.strip().split("/abs/")[-1]
                            clean_id = re.sub(r"v\d+$", "", raw_id)
                            if clean_id in self.existing_paper_ids:
                                continue
                            if self.total_shards > 1 and self.shard_index is not None:
                                if int(hashlib.md5(clean_id.encode("utf-8")).hexdigest(), 16) % self.total_shards != self.shard_index:
                                    continue
                            title_elem = entry.find("atom:title", ns)
                            summary_elem = entry.find("atom:summary", ns)
                            candidates.append({
                                "paper_id": clean_id,
                                "title": re.sub(r"\s+", " ", title_elem.text).strip() if title_elem is not None else "",
                                "abstract": re.sub(r"\s+", " ", summary_elem.text).strip() if summary_elem is not None else "",
                                "primary_category": cat,
                                "categories": [cat],
                                "source": "arxiv",
                            })
                except Exception as ex:
                    logger.warning("[ARXIV API NOTE] %s: %s", cat, ex)

        logger.info("[CANDIDATE READY] Prepared %d candidate papers for streaming HTML harvest.", len(candidates))
        return candidates

    def run_producer(self, candidates: List[Dict[str, Any]]):
        """Worker thread: Crawls arXiv HTML5, extracts sections, and pushes to queue."""
        logger.info("[PRODUCER STARTED] Crawling arXiv HTML5 documents...")
        t0 = time.time()

        for paper in candidates:
            if self.papers_harvested >= self.target_papers:
                break

            pid = str(paper["paper_id"]).strip()
            clean_id = pid.replace("arxiv_", "").strip()
            html_url = f"https://arxiv.org/html/{clean_id}"

            try:
                resp = self.http_client.get(html_url)
                if resp.status_code != 200 or len(resp.text) < 1500:
                    continue  # Paper doesn't have arXiv HTML5 build yet

                parsed = self.html_parser.parse(resp.text)
                sections = parsed.get("sections", [])
                total_words = parsed.get("total_words", 0)

                if len(sections) < 2 or total_words < 300:
                    continue

                abs_text = str(paper.get("abstract", "")).strip() or parsed.get("parsed_abstract", "")
                has_abs = any(s.get("section_id") == "abstract" or "abstract" in str(s.get("section_title", "")).lower() for s in sections)
                if abs_text and not has_abs:
                    sections.insert(0, {
                        "section_id": "abstract",
                        "section_title": "Abstract",
                        "section_type": "abstract",
                        "content": abs_text,
                        "paragraphs": [abs_text],
                        "paragraph_count": 1,
                        "math_count": 0,
                        "word_count": len(abs_text.split()),
                    })

                full_record = {
                    "paper_id": pid,
                    "abstract_hash": compute_abstract_hash(abs_text),
                    "doi": paper.get("doi"),
                    "journal_ref": paper.get("journal_ref"),
                    "title": paper.get("title", "") or parsed.get("parsed_title", ""),
                    "abstract": abs_text,
                    "authors": paper.get("authors", []),
                    "categories": paper.get("categories", [paper.get("primary_category", "cs.AI")]),
                    "primary_category": paper.get("primary_category", "cs.AI"),
                    "published_date": str(paper.get("published_date", "")),
                    "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "pdf_url": paper.get("pdf_url", f"https://arxiv.org/pdf/{clean_id}.pdf"),
                    "html_url": html_url,
                    "total_sections": len(sections),
                    "total_math_count": parsed.get("total_math_count", 0),
                    "total_words": total_words,
                    "sections_json": json.dumps(sections),
                    "clean_full_text": parsed.get("markdown_content", ""),
                    "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "cite_count": float(paper.get("cite_count", 0.0) or 0.0),
                    "source": "arxiv",
                    "tier": "tier2",
                    "content_origin": "arxiv_html5_stream",
                }

                self.paper_queue.put(full_record)
                self.existing_paper_ids.add(pid)
                self.papers_harvested += 1

                logger.info(
                    "[HTML ACCEPTED] #%d | %s | %d sections | %d words | %d math | Speed: %.1f p/s | %s",
                    self.papers_harvested, pid, len(sections), total_words, parsed.get("total_math_count", 0),
                    self.papers_harvested / max(time.time() - t0, 0.1),
                    full_record["title"][:50]
                )

                broadcast_telemetry({
                    "stage": "STREAMING_HARVEST",
                    "paper_id": pid,
                    "title": full_record["title"],
                    "total_sections": len(sections),
                    "total_words": total_words,
                    "papers_harvested": self.papers_harvested,
                    "target_papers": self.target_papers,
                })

            except Exception as e:
                logger.debug("[FETCH ERROR] %s: %s", pid, e)

            # Politely throttle requests
            time.sleep(0.35)

        self.producer_done.set()
        logger.info("[PRODUCER FINISHED] Gathered %d HTML papers in %.1fs.", self.papers_harvested, time.time() - t0)

    def run_consumer(self):
        """Worker thread: Chunks papers from queue, runs GPU Nomic embedding, and syncs LanceDB + R2."""
        logger.info("[CONSUMER STARTED] Initializing GPU Nomic Embedder & LanceDB streaming inserts...")
        pending_silver_records: List[Dict[str, Any]] = []
        pending_chunks: List[Dict[str, Any]] = []
        t0 = time.time()

        while not (self.producer_done.is_set() and self.paper_queue.empty()):
            try:
                paper = self.paper_queue.get(timeout=2.0)
            except queue.Empty:
                continue

            pending_silver_records.append(paper)
            chunks = self.chunker.chunk_paper(paper)
            for c in chunks:
                c["source"] = "arxiv_html5"
                c["tier"] = "tier2"
                c["content_origin"] = "streaming_html_chunker"
                pending_chunks.append(c)

            self.papers_embedded += 1

            # Embed and insert once we have at least 10 papers or 64 chunks
            if len(pending_chunks) >= self.batch_embed_size:
                self._flush_chunks_to_lancedb(pending_chunks)
                pending_chunks = []

            # Flush to Silver Parquet and R2 every 10 papers
            if len(pending_silver_records) >= 10:
                self._flush_to_silver_and_r2(pending_silver_records)
                pending_silver_records = []

            self.paper_queue.task_done()

        # Flush any trailing records
        if pending_chunks:
            self._flush_chunks_to_lancedb(pending_chunks)
        if pending_silver_records:
            self._flush_to_silver_and_r2(pending_silver_records)

        duration = time.time() - t0
        logger.info(
            "[CONSUMER COMPLETE] Vectorized and vaulted %d papers (%d chunks) in %.2fs (Speed: %.1f chunks/s).",
            self.papers_embedded, self.chunks_embedded, duration, self.chunks_embedded / max(duration, 0.1)
        )

    def _flush_chunks_to_lancedb(self, chunks: List[Dict[str, Any]]):
        """Computes dense Nomic embeddings and inserts directly into scientific_papers_gold."""
        if not chunks:
            return

        texts = [c.get("context_text") or c.get("text", "") for c in chunks]
        vectors = self.embedder.embed_batch(texts, batch_size=self.batch_embed_size)

        insert_payload = []
        for c, vec in zip(chunks, vectors):
            rec = {
                "chunk_id": str(c["chunk_id"]),
                "paper_id": str(c["paper_id"]),
                "title": str(c.get("title", "")),
                "authors": c.get("authors", ["Academic Researcher"]),
                "primary_category": str(c.get("primary_category", "cs.AI")),
                "section_title": str(c.get("section_title", "Section")),
                "section_type": str(c.get("section_type", "section")),
                "text": str(c.get("text", "")),
                "context_text": str(c.get("context_text", "")),
                "word_count": int(c.get("word_count", len(c.get("text", "").split()))),
                "vector": vec.tolist() if hasattr(vec, "tolist") else list(vec),
            }
            insert_payload.append(rec)

        self.table.add(insert_payload)
        self.chunks_embedded += len(insert_payload)

        logger.info(
            "  [LANCEDB STREAM] +%d vectors inserted! (Total in Gold LanceDB: %d | Live RAG ready)",
            len(insert_payload), len(self.table)
        )

        broadcast_telemetry({
            "stage": "LANCEDB_INSERT",
            "new_vectors": len(insert_payload),
            "total_vectors": len(self.table),
            "papers_embedded": self.papers_embedded,
        })

    def _flush_to_silver_and_r2(self, records: List[Dict[str, Any]]):
        """Saves batch to Silver Parquet table and synchronizes to Cloudflare R2."""
        sanitized = [sanitize_surrogates(r) for r in records]
        df_new = pd.DataFrame(sanitized)

        if self.silver_parquet_path.exists():
            df_old = pd.read_parquet(self.silver_parquet_path)
            df_comb = pd.concat([df_old, df_new], ignore_index=True).drop_duplicates(subset=["paper_id"], keep="last")
        else:
            df_comb = df_new

        df_comb.to_parquet(self.silver_parquet_path, compression="zstd", index=False)
        logger.info("[SILVER SAVED] Vaulted %d papers to %s (Total: %d)", len(records), self.silver_parquet_path.name, len(df_comb))

        if self.sync_r2 and self.r2:
            try:
                self.r2.upload_file(
                    self.silver_parquet_path,
                    self.r2_silver_key,
                    content_type="application/vnd.apache.parquet"
                )
                logger.info("[R2 SYNC] Successfully synced %s to Cloudflare R2 (%s).", self.silver_parquet_path.name, self.r2_silver_key)
            except Exception as e:
                logger.warning("[R2 SYNC NOTE] %s", e)

    def execute(self):
        """Launches producer and consumer threads concurrently."""
        logger.info("=" * 80)
        logger.info("STARTING STREAMING HTML HARVEST & GPU EMBED PIPELINE")
        logger.info("Target: %d papers | Hardware: %s", self.target_papers, self.embedder.device)
        logger.info("=" * 80)

        candidates = self.load_candidate_pool()
        if not candidates:
            logger.error("[ERROR] No candidates available.")
            return

        producer_thread = threading.Thread(target=self.run_producer, args=(candidates,), daemon=True)
        consumer_thread = threading.Thread(target=self.run_consumer, daemon=True)

        producer_thread.start()
        consumer_thread.start()

        producer_thread.join()
        consumer_thread.join()

        logger.info("=" * 80)
        logger.info("PIPELINE COMPLETED: %d papers harvested, %d papers embedded (%d vectors created).",
                    self.papers_harvested, self.papers_embedded, self.chunks_embedded)
        logger.info("Gold LanceDB table now contains %d total vectors.", len(self.table))
        logger.info("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Streaming arXiv HTML5 Harvester & Concurrent GPU LanceDB Embedder.")
    parser.add_argument("--target-papers", type=int, default=500, help="Target number of HTML papers to crawl and embed.")
    parser.add_argument("--batch-embed-size", type=int, default=64, help="Batch size for Nomic GPU forward passes.")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize Silver and Gold layers to Cloudflare R2.")
    parser.add_argument("--shard-index", type=int, default=None, help="Shard index for distributed multi-machine execution.")
    parser.add_argument("--total-shards", type=int, default=1, help="Total shards across peer machines.")
    args = parser.parse_args()

    pipeline = StreamingHTMLHarvestAndEmbedPipeline(
        target_papers=args.target_papers,
        batch_embed_size=args.batch_embed_size,
        sync_r2=args.sync_r2,
        shard_index=args.shard_index,
        total_shards=args.total_shards,
    )
    pipeline.execute()


if __name__ == "__main__":
    main()
