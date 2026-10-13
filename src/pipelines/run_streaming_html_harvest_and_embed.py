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

logger, log_file = setup_pipeline_logging("streaming_html_embed", capture_stdout=False)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
logger.addHandler(console_handler)


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
        crawl_workers: int = 4,
        sync_r2: bool = False,
        shard_index: Optional[int] = None,
        total_shards: int = 1,
        landmark_mode: bool = False,
        landmark_metadata_dir: Optional[str] = None,
    ):
        self.target_papers = target_papers
        self.batch_embed_size = batch_embed_size
        self.crawl_workers = max(crawl_workers, 1)
        self.sync_r2 = sync_r2
        self.shard_index = shard_index
        self.total_shards = max(total_shards, 1)
        self.landmark_mode = landmark_mode
        self.landmark_metadata_dir = Path(landmark_metadata_dir) if landmark_metadata_dir else None

        # Storage paths
        if self.landmark_mode:
            self.silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier1"
            shard_suffix = f"_shard{self.shard_index}" if self.shard_index is not None else ""
            self.silver_parquet_path = self.silver_dir / f"landmark_html_papers{shard_suffix}.parquet"
            self.r2_silver_key = f"silver/tier1/landmark_html_papers{shard_suffix}.parquet"
        else:
            self.silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"
            shard_suffix = f"_shard{self.shard_index}" if self.shard_index is not None else ""
            self.silver_parquet_path = self.silver_dir / f"html_papers{shard_suffix}.parquet"
            self.r2_silver_key = f"silver/tier2/html_papers{shard_suffix}.parquet"

        self.silver_dir.mkdir(parents=True, exist_ok=True)

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

        if self.landmark_mode:
            # In landmark mode, check if already harvested into landmark_html_papers parquet
            for p in self.silver_dir.glob("landmark_html_papers*.parquet"):
                try:
                    df = pd.read_parquet(p, columns=["paper_id"])
                    seen.update(df["paper_id"].astype(str))
                except Exception:
                    pass
            logger.info("[FILTER CACHE] Landmark mode: loaded %d pre-existing landmark HTML IDs.", len(seen))
            return seen

        # 1. From Silver Fulltext Parquets (excluding metadata pools like near_past_papers)
        for p in self.silver_dir.glob("*.parquet"):
            if "near_past" in p.name:
                continue
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

    def _load_landmark_candidates(self) -> List[Dict[str, Any]]:
        """Curates iconic AI Hall of Fame papers and extracts arXiv papers from Strategy B raw metadata."""
        logger.info("[LANDMARK MODE] Curating iconic landmark papers and extracting arXiv links from Strategy B...")

        # 1. Iconic Core AI Hall of Fame papers with arXiv IDs
        CORE_HALL_OF_FAME = [
            {"paper_id": "1706.03762", "title": "Attention Is All You Need", "primary_category": "cs.CL", "cite_count": 26917},
            {"paper_id": "1512.03385", "title": "Deep Residual Learning for Image Recognition", "primary_category": "cs.CV", "cite_count": 180000},
            {"paper_id": "1810.04805", "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "primary_category": "cs.CL", "cite_count": 33900},
            {"paper_id": "1406.2661", "title": "Generative Adversarial Networks", "primary_category": "stat.ML", "cite_count": 65000},
            {"paper_id": "2006.11239", "title": "Denoising Diffusion Probabilistic Models", "primary_category": "cs.LG", "cite_count": 15000},
            {"paper_id": "2112.10752", "title": "High-Resolution Image Synthesis with Latent Diffusion Models", "primary_category": "cs.CV", "cite_count": 12000},
            {"paper_id": "2106.09685", "title": "LoRA: Low-Rank Adaptation of Large Language Models", "primary_category": "cs.CL", "cite_count": 9500},
            {"paper_id": "2205.14135", "title": "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness", "primary_category": "cs.LG", "cite_count": 3200},
            {"paper_id": "2005.14165", "title": "Language Models are Few-Shot Learners", "primary_category": "cs.CL", "cite_count": 25000},
            {"paper_id": "2103.00020", "title": "Learning Transferable Visual Models From Natural Language Supervision", "primary_category": "cs.CV", "cite_count": 22000},
            {"paper_id": "1608.06993", "title": "Densely Connected Convolutional Networks", "primary_category": "cs.CV", "cite_count": 45600},
            {"paper_id": "2103.14030", "title": "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows", "primary_category": "cs.CV", "cite_count": 32900},
            {"paper_id": "1703.06870", "title": "Mask R-CNN", "primary_category": "cs.CV", "cite_count": 29700},
            {"paper_id": "1612.03144", "title": "Feature Pyramid Networks for Object Detection", "primary_category": "cs.CV", "cite_count": 29800},
            {"paper_id": "1708.02002", "title": "Focal Loss for Dense Object Detection", "primary_category": "cs.CV", "cite_count": 27600},
            {"paper_id": "1409.0473", "title": "Neural Machine Translation by Jointly Learning to Align and Translate", "primary_category": "cs.CL", "cite_count": 30000},
            {"paper_id": "1409.1556", "title": "Very Deep Convolutional Networks for Large-Scale Image Recognition", "primary_category": "cs.CV", "cite_count": 100000},
            {"paper_id": "1506.01497", "title": "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks", "primary_category": "cs.CV", "cite_count": 60000},
            {"paper_id": "1704.04861", "title": "MobileNets: Efficient Convolutional Neural Networks for Mobile Vision Applications", "primary_category": "cs.CV", "cite_count": 25000},
            {"paper_id": "1910.10683", "title": "Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer", "primary_category": "cs.CL", "cite_count": 18000},
            {"paper_id": "2302.13971", "title": "LLaMA: Open and Efficient Foundation Language Models", "primary_category": "cs.CL", "cite_count": 14000},
            {"paper_id": "2307.09288", "title": "Llama 2: Open Foundation and Fine-Tuned Chat Models", "primary_category": "cs.CL", "cite_count": 12000},
            {"paper_id": "2001.08361", "title": "Scaling Laws for Neural Language Models", "primary_category": "cs.LG", "cite_count": 6000},
            {"paper_id": "2203.15556", "title": "Training Compute-Optimal Large Language Models", "primary_category": "cs.CL", "cite_count": 4500},
            {"paper_id": "1706.03741", "title": "Deep Complex Networks", "primary_category": "cs.LG", "cite_count": 1200},
            {"paper_id": "1905.11946", "title": "EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks", "primary_category": "cs.CV", "cite_count": 17000},
            {"paper_id": "2010.11929", "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale", "primary_category": "cs.CV", "cite_count": 30000},
            {"paper_id": "1707.06347", "title": "Proximal Policy Optimization Algorithms", "primary_category": "cs.LG", "cite_count": 16000},
            {"paper_id": "1801.06146", "title": "Universal Language Model Fine-tuning for Text Classification", "primary_category": "cs.CL", "cite_count": 7000},
            {"paper_id": "1609.02907", "title": "Semi-Supervised Classification with Graph Convolutionn Networks", "primary_category": "cs.LG", "cite_count": 28000},
            {"paper_id": "1710.10903", "title": "Graph Attention Networks", "primary_category": "cs.LG", "cite_count": 19000},
            {"paper_id": "1802.05365", "title": "Deep contextualized word representations", "primary_category": "cs.CL", "cite_count": 13000},
            {"paper_id": "1706.02413", "title": "Self-Normalizing Neural Networks", "primary_category": "cs.LG", "cite_count": 3500},
            {"paper_id": "1606.08415", "title": "Gaussian Error Linear Units (GELUs)", "primary_category": "cs.LG", "cite_count": 6500},
            {"paper_id": "1607.06450", "title": "Layer Normalization", "primary_category": "stat.ML", "cite_count": 8000},
            {"paper_id": "1502.03167", "title": "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift", "primary_category": "cs.LG", "cite_count": 55000},
            {"paper_id": "1412.6980", "title": "Adam: A Method for Stochastic Optimization", "primary_category": "cs.LG", "cite_count": 165000},
        ]

        candidates_map: Dict[str, Dict[str, Any]] = {}

        # 2. Add Hall of Fame items
        for p in CORE_HALL_OF_FAME:
            aid = p["paper_id"]
            if aid not in self.existing_paper_ids:
                candidates_map[aid] = {
                    "paper_id": aid,
                    "title": p["title"],
                    "primary_category": p.get("primary_category", "cs.AI"),
                    "categories": [p.get("primary_category", "cs.AI")],
                    "source": "arxiv",
                    "cite_count": float(p.get("cite_count", 0)),
                }

        # 3. Extract arXiv links and rich metadata from Strategy B raw_metadata JSON files
        raw_dir = self.landmark_metadata_dir or Path(r"C:\Users\TDV\Downloads\Telegram Desktop\strategy_b\strategy_b\raw_metadata")
        if raw_dir.exists():
            json_files = sorted(raw_dir.glob("*.json"))
            logger.info("[METADATA SCAN] Scanning %d JSON files in %s...", len(json_files), raw_dir)
            for jf in json_files:
                try:
                    with open(jf, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        records = data if isinstance(data, list) else data.get("results", [])
                        for r in records:
                            all_urls = [str(r.get("id", ""))]
                            locs = r.get("locations", []) or []
                            for loc in locs:
                                if loc.get("pdf_url"):
                                    all_urls.append(loc["pdf_url"])
                                if loc.get("landing_page_url"):
                                    all_urls.append(loc["landing_page_url"])
                            ids_dict = r.get("ids", {}) or {}
                            for k, v in ids_dict.items():
                                if isinstance(v, str):
                                    all_urls.append(v)

                            for u in all_urls:
                                m = re.search(r"arxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5})", str(u))
                                if m:
                                    aid = m.group(1)
                                    if aid in self.existing_paper_ids:
                                        break

                                    authors = []
                                    for a in r.get("authorships", []):
                                        auth = a.get("author", {})
                                        name = auth.get("display_name")
                                        if name:
                                            authors.append(name)

                                    cats = ["cs.AI"]
                                    for c in r.get("concepts", []):
                                        cname = c.get("display_name")
                                        if cname:
                                            cats.append(cname)

                                    cand_record = {
                                        "paper_id": aid,
                                        "title": r.get("title", "") or candidates_map.get(aid, {}).get("title", ""),
                                        "authors": authors or candidates_map.get(aid, {}).get("authors", []),
                                        "primary_category": "cs.AI",
                                        "categories": cats[:5],
                                        "doi": r.get("doi") or f"https://doi.org/{r.get('id', '')}",
                                        "published_date": str(r.get("publication_year", "")),
                                        "cite_count": float(r.get("cited_by_count", 0.0)),
                                        "source": "arxiv",
                                        "openalex_id": str(r.get("id", "")),
                                    }
                                    candidates_map[aid] = cand_record
                                    break
                except Exception as ex:
                    logger.warning("[METADATA PARSE NOTE] %s: %s", jf.name, ex)

        # Sort: Core Hall of Fame first, then remaining sorted by cite_count descending
        core_ids = set(p["paper_id"] for p in CORE_HALL_OF_FAME)
        core_list = [candidates_map[aid] for aid in [p["paper_id"] for p in CORE_HALL_OF_FAME] if aid in candidates_map]
        remaining = [v for k, v in candidates_map.items() if k not in core_ids]
        remaining.sort(key=lambda x: x.get("cite_count", 0.0), reverse=True)

        final_candidates = core_list + remaining

        # Sharding support
        if self.total_shards > 1 and self.shard_index is not None:
            final_candidates = [
                c for c in final_candidates
                if int(hashlib.md5(c["paper_id"].encode("utf-8")).hexdigest(), 16) % self.total_shards == self.shard_index
            ]

        logger.info(
            "[LANDMARK CANDIDATES READY] Prepared %d landmark candidate papers (Top Core: %d, OpenAlex Landmarks: %d).",
            len(final_candidates), len(core_list), len(remaining)
        )
        return final_candidates

    def load_candidate_pool(self) -> List[Dict[str, Any]]:
        """Extracts high-priority candidates from near_past_papers, landmark metadata, or arXiv API."""
        if self.landmark_mode:
            return self._load_landmark_candidates()

        candidates = []
        near_past_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"

        # 0. High-Priority: Check already harvested Full-Text papers in Silver that are not yet in Gold LanceDB
        logger.info("[SILVER AUDIT] Checking un-embedded full-text papers in local Silver...")
        for ft_file in [
            self.silver_dir / "fulltext_papers.parquet",
            self.silver_dir / "fulltext_papers_shard0.parquet",
            self.silver_dir / "fulltext_papers_shard1.parquet",
            settings.ROOT_DIR / "data" / "silver" / "tier1" / "landmark_papers.parquet",
            self.silver_dir / "html_papers.parquet",
        ]:
            if ft_file.exists():
                try:
                    df_ft = pd.read_parquet(ft_file)
                    for _, r in df_ft.iterrows():
                        pid = str(r["paper_id"]).strip()
                        if pid not in self.existing_paper_ids:
                            candidates.append({
                                "paper_id": pid,
                                "title": r.get("title", ""),
                                "abstract": r.get("abstract", ""),
                                "authors": r.get("authors", []),
                                "primary_category": r.get("primary_category", "cs.AI"),
                                "categories": r.get("categories", ["cs.AI"]),
                                "source": r.get("source", "arxiv"),
                                "sections_json": r.get("sections_json"),
                                "clean_full_text": r.get("clean_full_text"),
                                "pre_harvested": True,
                            })
                except Exception as ex:
                    logger.warning("[SILVER READ NOTE] %s: %s", ft_file.name, ex)

        if candidates:
            logger.info("[HIGH PRIORITY] Found %d pre-harvested full-text papers ready to chunk & embed immediately!", len(candidates))

        # Download near_past from R2 if needed
        if self.r2 and (not near_past_path.exists() or near_past_path.stat().st_size < 1000000):
            try:
                logger.info("[R2 SYNC] Pulling full near_past_papers.parquet from Cloudflare R2...")
                self.r2.download_file_safe("silver/tier2/near_past_papers.parquet", near_past_path)
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
            categories = ["cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML", "cs.RO", "cs.NE", "cs.IR"]
            for cat in categories:
                if len(candidates) >= self.target_papers * 2:
                    break
                for start_offset in range(0, 10000, 100):
                    if len(candidates) >= self.target_papers * 2:
                        break
                    try:
                        resp = self.http_client.get(
                            "http://export.arxiv.org/api/query",
                            params={
                                "search_query": f"cat:{cat}",
                                "start": start_offset,
                                "max_results": 100,
                                "sortBy": "submittedDate",
                                "sortOrder": "descending",
                            }
                        )
                        if resp.status_code == 200:
                            import xml.etree.ElementTree as ET
                            root = ET.fromstring(resp.text)
                            ns = {"atom": "http://www.w3.org/2005/Atom"}
                            entries = root.findall("atom:entry", ns)
                            if not entries:
                                break
                            for entry in entries:
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
                        time.sleep(0.5)
                    except Exception as ex:
                        logger.warning("[ARXIV API NOTE] %s offset %d: %s", cat, start_offset, ex)
                        break

        logger.info("[CANDIDATE READY] Prepared %d candidate papers for streaming HTML harvest.", len(candidates))
        return candidates

    def _fetch_single_candidate(self, paper: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Worker task: Attempts to fetch and parse HTML5 for one candidate."""
        pid = str(paper["paper_id"]).strip()
        clean_id = pid.replace("arxiv_", "").strip()
        html_url = f"https://arxiv.org/html/{clean_id}"

        # Fast-Path: If paper already has sections_json from previous harvest, directly return it!
        if paper.get("pre_harvested") and paper.get("sections_json"):
            try:
                sections = json.loads(str(paper["sections_json"]))
                full_record = dict(paper)
                full_record["total_sections"] = len(sections)
                full_record["total_words"] = sum(s.get("word_count", len(s.get("content", "").split())) for s in sections)
                return full_record
            except Exception:
                pass

        try:
            resp = self.http_client.get(html_url)
            if resp.status_code != 200 or len(resp.text) < 1500:
                return None  # Paper doesn't have arXiv HTML5 build yet

            parsed = self.html_parser.parse(resp.text)
            sections = parsed.get("sections", [])
            total_words = parsed.get("total_words", 0)

            if len(sections) < 2 or total_words < 300:
                return None

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

            return {
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
                "tier": "tier1_landmark" if self.landmark_mode else "tier2",
                "content_origin": "arxiv_html5_landmark" if self.landmark_mode else "arxiv_html5_stream",
                "openalex_id": paper.get("openalex_id"),
            }
        except Exception:
            return None

    def run_producer(self, candidates: List[Dict[str, Any]]):
        """Dispatches N concurrent network crawler workers that push into the single GPU queue."""
        logger.info("[PRODUCER STARTED] Crawling arXiv HTML5 using %d concurrent network workers...", self.crawl_workers)
        import concurrent.futures
        t0 = time.time()

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.crawl_workers) as executor:
            future_to_cand = {executor.submit(self._fetch_single_candidate, c): c for c in candidates}
            for future in concurrent.futures.as_completed(future_to_cand):
                if self.papers_harvested >= self.target_papers:
                    executor.shutdown(wait=False, cancel_futures=True)
                    break

                full_record = future.result()
                if not full_record:
                    continue

                pid = full_record["paper_id"]
                if pid in self.existing_paper_ids:
                    continue

                self.paper_queue.put(full_record)
                self.existing_paper_ids.add(pid)
                self.papers_harvested += 1

                logger.info(
                    "[HTML ACCEPTED] #%d | %s | %d sections | %d words | %d math | Speed: %.1f p/s | %s",
                    self.papers_harvested, pid, full_record["total_sections"], full_record["total_words"],
                    full_record.get("total_math_count", 0),
                    self.papers_harvested / max(time.time() - t0, 0.1),
                    full_record["title"][:50]
                )

                broadcast_telemetry({
                    "stage": "STREAMING_HARVEST",
                    "paper_id": pid,
                    "title": full_record["title"],
                    "total_sections": full_record["total_sections"],
                    "total_words": full_record["total_words"],
                    "papers_harvested": self.papers_harvested,
                    "target_papers": self.target_papers,
                })

        self.producer_done.set()
        logger.info("[PRODUCER FINISHED] Gathered %d HTML papers in %.1fs using %d workers.",
                    self.papers_harvested, time.time() - t0, self.crawl_workers)

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
                c["tier"] = "tier1_landmark" if self.landmark_mode else "tier2"
                c["content_origin"] = "streaming_html_landmark_chunker" if self.landmark_mode else "streaming_html_chunker"
                if paper.get("openalex_id"):
                    c["openalex_id"] = paper["openalex_id"]
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

        # In landmark mode, delete any stale abstract-only chunks for these papers first
        if self.landmark_mode:
            pids = set(str(c["paper_id"]) for c in chunks)
            for pid in pids:
                try:
                    self.table.delete(f"paper_id = '{pid}'")
                except Exception:
                    pass
            oa_ids = set(str(c.get("openalex_id", "")).split("/")[-1] for c in chunks if c.get("openalex_id"))
            for oa_id in oa_ids:
                if oa_id:
                    try:
                        self.table.delete(f"paper_id = 'oa_{oa_id}'")
                    except Exception:
                        pass

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
                "source": str(c.get("source", "arxiv_html5")),
                "tier": str(c.get("tier", "tier1_landmark" if self.landmark_mode else "tier2")),
                "content_origin": str(c.get("content_origin", "streaming_html_chunker")),
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
        logger.info("Mode: %s | Target: %d papers | Hardware: %s",
                    "LANDMARK (Tier 1 Full-Text)" if self.landmark_mode else "STREAMING (Tier 2)",
                    self.target_papers, self.embedder.device)
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

        if self.sync_r2 and self.r2:
            try:
                logger.info("[R2 SYNC] Synchronizing Gold LanceDB lakehouse to Cloudflare R2...")
                from src.indexing.lancedb_manager import LanceDBManager
                mgr = LanceDBManager(db_path=self.db_path, r2_client=self.r2)
                sync_res = mgr.sync_to_r2()
                logger.info("[R2 SYNC] Gold LanceDB sync result: %s", sync_res)
            except Exception as e:
                logger.warning("[R2 SYNC NOTE] Gold LanceDB sync note: %s", e)

        logger.info("=" * 80)
        logger.info("PIPELINE COMPLETED: %d papers harvested, %d papers embedded (%d vectors created).",
                    self.papers_harvested, self.papers_embedded, self.chunks_embedded)
        logger.info("Gold LanceDB table now contains %d total vectors.", len(self.table))
        logger.info("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Streaming arXiv HTML5 Harvester & Concurrent GPU LanceDB Embedder.")
    parser.add_argument("--target-papers", type=int, default=500, help="Target number of HTML papers to crawl and embed.")
    parser.add_argument("--batch-embed-size", type=int, default=64, help="Batch size for Nomic GPU forward passes.")
    parser.add_argument("--crawl-workers", type=int, default=4, help="Number of concurrent network workers fetching HTML.")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize Silver and Gold layers to Cloudflare R2.")
    parser.add_argument("--shard-index", type=int, default=None, help="Shard index for distributed multi-machine execution.")
    parser.add_argument("--total-shards", type=int, default=1, help="Total shards across peer machines.")
    parser.add_argument("--landmark-mode", action="store_true", help="Harvest and vectorize seminal Tier 1 AI landmark papers with HTML5 LaTeX math.")
    parser.add_argument(
        "--landmark-metadata-dir",
        type=str,
        default=r"C:\Users\TDV\Downloads\Telegram Desktop\strategy_b\strategy_b\raw_metadata",
        help="Path to directory containing Strategy B raw OpenAlex JSON metadata.",
    )
    args = parser.parse_args()

    pipeline = StreamingHTMLHarvestAndEmbedPipeline(
        target_papers=args.target_papers,
        batch_embed_size=args.batch_embed_size,
        crawl_workers=args.crawl_workers,
        sync_r2=args.sync_r2,
        shard_index=args.shard_index,
        total_shards=args.total_shards,
        landmark_mode=args.landmark_mode,
        landmark_metadata_dir=args.landmark_metadata_dir,
    )
    pipeline.execute()


if __name__ == "__main__":
    main()
