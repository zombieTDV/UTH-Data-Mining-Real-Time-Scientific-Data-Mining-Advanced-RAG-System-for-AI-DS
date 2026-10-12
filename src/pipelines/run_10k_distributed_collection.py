"""Master Pipeline for 10,000-Paper Distributed Collection across Pure Academic Sources.

Orchestrates 10k paper ingestion across 3 premier academic sources without OpenAlex:
1. CVF Open Access (CVPR 2024 & ICCV): 2,500 papers
2. OpenReview (ICLR & NeurIPS):        3,500 papers
3. arXiv OAI-PMH (AI/ML Categories):    4,000 papers
Total Target:                           10,000 peer-reviewed & preprint papers

Usage:
    python -m src.pipelines.run_10k_distributed_collection --sync-r2
    python -m src.pipelines.run_10k_distributed_collection --sources cvf --cvf-limit 2500 --sync-r2
    python -m src.pipelines.run_10k_distributed_collection --sources openreview --openreview-limit 3500 --sync-r2
    python -m src.pipelines.run_10k_distributed_collection --sources arxiv --arxiv-limit 4000 --sync-r2
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
import psutil

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.lancedb_manager import LanceDBManager
from src.ingestion.arxiv_batch_harvester import ArxivBatchHarvester
from src.ingestion.cvf_harvester import CvfHarvester
from src.ingestion.openreview_harvester import OpenReviewHarvester
from src.storage.r2_client import R2Client
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("10k_distributed_collection")


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge."""
    try:
        httpx.post("http://localhost:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


class DistributedCollection10k:
    """Manages coordinated 10k collection across CVF, OpenReview, and arXiv."""

    MIN_FREE_DISK_GB = 15.0

    def __init__(
        self,
        cvf_target: int = 2500,
        openreview_target: int = 3500,
        arxiv_target: int = 4000,
        sync_r2: bool = True,
        batch_size: int = 32,
    ):
        self.cvf_target = cvf_target
        self.openreview_target = openreview_target
        self.arxiv_target = arxiv_target
        self.sync_r2 = sync_r2
        self.batch_size = batch_size

        self.r2 = R2Client() if sync_r2 else None
        self.embedder: Optional[NomicEmbedder] = None
        self.lancedb_mgr: Optional[LanceDBManager] = None

        self.manifest_path = settings.ROOT_DIR / "data" / "manifests" / "10k_distributed_collection_manifest.json"
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)

    def check_disk_space(self) -> float:
        """Returns free disk space in GB and aborts if guardrail breached."""
        usage = psutil.disk_usage(str(settings.ROOT_DIR))
        free_gb = usage.free / (1024 ** 3)
        if free_gb < self.MIN_FREE_DISK_GB:
            raise RuntimeError(
                f"Disk space guardrail breached: {free_gb:.2f} GB free "
                f"(min required: {self.MIN_FREE_DISK_GB:.2f} GB). Execution halted."
            )
        return free_gb

    def _ensure_embedder_and_db(self):
        """Lazy-initializes embedding model and LanceDB manager."""
        if self.embedder is None:
            self.embedder = NomicEmbedder()
        if self.lancedb_mgr is None:
            self.lancedb_mgr = LanceDBManager(r2_client=self.r2)

    def run_cvf_phase(self) -> Dict[str, Any]:
        """Harvests, chunks, embeds, and indexes CVF Open Access (CVPR 2024 / ICCV)."""
        logger.info("=" * 80)
        logger.info(">>> [PHASE 1/3] HARVESTING CVF OPEN ACCESS (Target: %d papers)", self.cvf_target)
        logger.info("=" * 80)
        self.check_disk_space()

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "harvest",
            "title": f"Starting CVF Harvest: {self.cvf_target:,} papers (CVPR 2024 & ICCV)",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })

        harvester = CvfHarvester(r2_client=self.r2, request_delay=0.05)
        # Harvest from CVPR 2024
        records = harvester.harvest_and_vault(total_limit=self.cvf_target, venue="CVPR2024")
        if len(records) < self.cvf_target:
            # Backfill with ICCV2023 if CVPR2024 total is less than target
            remaining = self.cvf_target - len(records)
            logger.info("[CVF] Backfilling %d papers from ICCV2023...", remaining)
            extra = harvester.harvest_and_vault(total_limit=remaining, venue="ICCV2023")
            records.extend(extra)

        logger.info("[CVF] Harvested total: %d papers.", len(records))

        # Chunk & Embed into LanceDB
        self._ensure_embedder_and_db()
        from src.pipelines.run_cvf_end_to_end import build_chunks_from_cvf
        chunks = build_chunks_from_cvf(records)
        logger.info("[CVF] Embedding %d chunks via Nomic Embedder...", len(chunks))

        t0 = time.time()
        texts = [c["context_text"] for c in chunks]
        embeddings = self.embedder.embed_documents(texts, batch_size=self.batch_size)
        for idx, c in enumerate(chunks):
            c["vector"] = embeddings[idx]

        inserted = self.lancedb_mgr.insert_chunks(chunks, table_name="scientific_papers_gold")
        duration = round(time.time() - t0, 2)
        logger.info("[CVF] Inserted %d chunks into LanceDB in %.1fs.", inserted, duration)

        # Upload Silver Parquet to R2 if enabled
        silver_file = settings.ROOT_DIR / "data" / "silver" / "cvf" / "cvpr2024.parquet"
        if self.sync_r2 and self.r2 and silver_file.exists():
            try:
                self.r2.upload_file(silver_file, "silver/cvf/cvpr2024.parquet", content_type="application/vnd.apache.parquet")
                logger.info("[R2 SYNC] Synced CVF Silver Parquet to Cloudflare R2.")
            except Exception as e:
                logger.warning("[R2 SYNC] Could not upload CVF parquet: %s", e)

        return {"source": "cvf", "papers": len(records), "chunks": len(chunks), "status": "completed"}

    def run_openreview_phase(self) -> Dict[str, Any]:
        """Harvests, chunks, embeds, and indexes OpenReview (ICLR & NeurIPS)."""
        logger.info("=" * 80)
        logger.info(">>> [PHASE 2/3] HARVESTING OPENREVIEW PEER REVIEWS (Target: %d papers)", self.openreview_target)
        logger.info("=" * 80)
        self.check_disk_space()

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "harvest",
            "title": f"Starting OpenReview Harvest: {self.openreview_target:,} peer-reviewed papers with critiques",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })

        harvester = OpenReviewHarvester(r2_client=self.r2)
        records = harvester.harvest_and_vault(total_limit=self.openreview_target, venue="ALL")
        logger.info("[OPENREVIEW] Harvested total: %d papers with reviews.", len(records))

        # Chunk & Embed into LanceDB
        self._ensure_embedder_and_db()
        from src.pipelines.run_openreview_end_to_end import build_chunks_from_silver
        chunks = build_chunks_from_silver(records)
        logger.info("[OPENREVIEW] Embedding %d review & abstract chunks...", len(chunks))

        t0 = time.time()
        texts = [c["context_text"] for c in chunks]
        embeddings = self.embedder.embed_documents(texts, batch_size=self.batch_size)
        for idx, c in enumerate(chunks):
            c["vector"] = embeddings[idx]

        inserted = self.lancedb_mgr.insert_chunks(chunks, table_name="scientific_papers_gold")
        duration = round(time.time() - t0, 2)
        logger.info("[OPENREVIEW] Inserted %d chunks into LanceDB in %.1fs.", inserted, duration)

        # Upload Silver Parquet to R2 if enabled
        silver_file = settings.ROOT_DIR / "data" / "silver" / "openreview" / "openreview_all.parquet"
        if self.sync_r2 and self.r2 and silver_file.exists():
            try:
                self.r2.upload_file(silver_file, "silver/openreview/openreview_all.parquet", content_type="application/vnd.apache.parquet")
                logger.info("[R2 SYNC] Synced OpenReview Silver Parquet to Cloudflare R2.")
            except Exception as e:
                logger.warning("[R2 SYNC] Could not upload OpenReview parquet: %s", e)

        return {"source": "openreview", "papers": len(records), "chunks": len(chunks), "status": "completed"}

    def run_arxiv_phase(self) -> Dict[str, Any]:
        """Harvests preprints via official arXiv OAI-PMH Protocol."""
        logger.info("=" * 80)
        logger.info(">>> [PHASE 3/3] HARVESTING ARXIV BULK OAI-PMH PREPRINTS (Target: %d papers)", self.arxiv_target)
        logger.info("=" * 80)
        self.check_disk_space()

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "harvest",
            "title": f"Starting arXiv Bulk OAI-PMH Harvest: {self.arxiv_target:,} AI/ML preprints",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })

        harvester = ArxivBatchHarvester(r2_client=self.r2, request_delay=6.0)
        total_done = harvester.harvest_large_corpus(
            total_target=self.arxiv_target,
            batch_size=100,
            reset_checkpoint=False,
        )
        logger.info("[ARXIV] Harvested total: %d preprints into Bronze & Silver Lakehouse.", total_done)

        return {"source": "arxiv", "papers": total_done, "status": "completed"}

    def run_all(self, sources: Optional[List[str]] = None) -> Dict[str, Any]:
        """Orchestrates multi-source collection sequentially."""
        start_time = time.time()
        target_sources = sources or ["cvf", "openreview", "arxiv"]
        results: Dict[str, Any] = {}

        logger.info("=" * 80)
        logger.info("STARTING 10,000 DISTRIBUTED MULTI-SOURCE ACADEMIC COLLECTION")
        logger.info("Sources to execute: %s | Sync Cloudflare R2: %s", target_sources, self.sync_r2)
        logger.info("=" * 80)

        for src in target_sources:
            src_clean = src.lower().strip()
            if src_clean == "cvf":
                results["cvf"] = self.run_cvf_phase()
            elif src_clean == "openreview":
                results["openreview"] = self.run_openreview_phase()
            elif src_clean == "arxiv":
                results["arxiv"] = self.run_arxiv_phase()
            else:
                logger.warning("[WARNING] Unrecognized source: %s. Skipping.", src)

        total_papers = sum(r.get("papers", 0) for r in results.values())
        total_duration = round(time.time() - start_time, 2)

        manifest_data = {
            "timestamp": datetime.datetime.now().isoformat(),
            "target_total": 10000,
            "total_papers_collected": total_papers,
            "duration_seconds": total_duration,
            "results": results,
            "sync_r2": self.sync_r2,
        }
        with open(self.manifest_path, "w", encoding="utf-8") as mf:
            json.dump(manifest_data, mf, indent=2)

        logger.info("=" * 80)
        logger.info(
            "[10K COLLECTION COMPLETE] Harvested %d papers in %.1fs (%.2f mins) across %s",
            total_papers,
            total_duration,
            total_duration / 60.0,
            list(results.keys()),
        )
        logger.info("=" * 80)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "completed",
            "title": f"10k Distributed Collection Complete: {total_papers:,} papers ingested",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })

        return manifest_data


def main():
    parser = argparse.ArgumentParser(description="Run 10,000 Academic Paper Distributed Collection.")
    parser.add_argument(
        "--sources",
        type=str,
        default="cvf,openreview,arxiv",
        help="Comma-separated sources to harvest (default: cvf,openreview,arxiv)",
    )
    parser.add_argument("--cvf-limit", type=int, default=2500, help="Target for CVF (default: 2500)")
    parser.add_argument("--openreview-limit", type=int, default=3500, help="Target for OpenReview (default: 3500)")
    parser.add_argument("--arxiv-limit", type=int, default=4000, help="Target for arXiv (default: 4000)")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    parser.add_argument("--no-sync-r2", action="store_true", help="Do not upload to Cloudflare R2")
    args = parser.parse_args()

    selected_sources = [s.strip() for s in args.sources.split(",") if s.strip()]

    collector = DistributedCollection10k(
        cvf_target=args.cvf_limit,
        openreview_target=args.openreview_limit,
        arxiv_target=args.arxiv_limit,
        sync_r2=not args.no_sync_r2,
        batch_size=args.batch_size,
    )
    collector.run_all(sources=selected_sources)


if __name__ == "__main__":
    main()
