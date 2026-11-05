"""Index the Silver papers that never reached Qdrant (e.g. a batch crawled while the queue consumer was down).

Finds every paper_id in silver/papers/ with no point in Qdrant, chunks it, embeds it, writes the chunk rows to
silver/chunks/ (parts, one per year) and upserts the vectors, in that order, like QueueConsumer.gold_batch.
Papers with no text at all (no abstract, no full text) are skipped: they produce no chunk.

The chunker defaults to the one the existing collection was built with (git commit c50a651), so a backfill does not
mix chunk shapes; pass --chunker current to use src/indexing/chunker.py instead.

    python scripts/backfill_missing_papers.py --dry-run
    python scripts/backfill_missing_papers.py
"""

import argparse
import io
import logging
import subprocess
import sys
import time
import types
from pathlib import Path
from typing import Any, Dict, List

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.indexing.qdrant_manager import QdrantManager  # noqa: E402
from src.storage.chunk_store import ChunkStore  # noqa: E402
from src.storage.lakehouse_io import LakehouseIO  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("backfill")
LEGACY_COMMIT = "c50a651"
BATCH = 24


def chunker(kind: str):
    if kind == "current":
        from src.indexing.chunker import AcademicChunker
        return AcademicChunker(max_chunk_words=450)
    src = subprocess.check_output(["git", "show", f"{LEGACY_COMMIT}:src/indexing/chunker.py"], cwd=ROOT, text=True)
    mod = types.ModuleType("legacy_chunker")
    exec(compile(src, "legacy_chunker.py", "exec"), mod.__dict__)
    return mod.AcademicChunker(max_chunk_words=450, overlap_words=50)


def year_of(rec: Dict[str, Any]) -> str:
    y = str(rec.get("published_date") or "")[:4]
    return y if y.isdigit() else str(time.gmtime().tm_year)


def qdrant_paper_ids(q: QdrantManager) -> set:
    ids, off = set(), None
    while True:
        body = {"limit": 20000, "with_payload": ["paper_id"], "with_vector": False}
        if off is not None:
            body["offset"] = off
        res = q._session.post(f"{q.url}/collections/{q.collection_name}/points/scroll", json=body, timeout=300).json()["result"]
        ids.update(str((p.get("payload") or {}).get("paper_id")) for p in res["points"])
        off = res.get("next_page_offset")
        if off is None:
            return ids


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--chunker", choices=["legacy", "current"], default="legacy")
    a = ap.parse_args()

    io_ = LakehouseIO()
    q = QdrantManager()
    indexed = qdrant_paper_ids(q)
    log.info("Qdrant holds %d distinct papers", len(indexed))

    todo: Dict[str, Dict[str, Any]] = {}
    for k in io_.list_keys("silver/papers/"):
        if not k.endswith(".parquet"):
            continue
        for rec in pq.read_table(io.BytesIO(io_.storage.get_bytes(k))).to_pylist():
            pid = str(rec["paper_id"])
            if pid in indexed:
                continue
            prev = todo.get(pid)
            if prev is None or (rec.get("total_words") or 0) > (prev.get("total_words") or 0):
                todo[pid] = rec  # keep the richest Silver row of a paper
    ch = chunker(a.chunker)
    work = [(r, ch.chunk_paper(r)) for r in todo.values()]
    empty = sum(1 for _, c in work if not c)
    work = [(r, c) for r, c in work if c]
    log.info("Silver papers missing from Qdrant: %d (%d have no text and are skipped); to index: %d papers, %d chunks",
             len(todo), empty, len(work), sum(len(c) for _, c in work))
    if a.dry_run or not work:
        return

    from src.indexing.embedder import NomicEmbedder
    emb = NomicEmbedder()
    store = ChunkStore(storage=io_.storage)
    before = q.count()
    t0, done_p, done_c = time.time(), 0, 0
    for i in range(0, len(work), BATCH):
        batch = work[i:i + BATCH]
        chunks: List[Dict[str, Any]] = [c for _, cs in batch for c in cs]
        order = sorted(range(len(chunks)), key=lambda j: len(chunks[j].get("context_text") or ""))
        vecs = emb.embed_documents([chunks[j].get("context_text") or chunks[j].get("text", "") for j in order])
        for j, v in zip(order, vecs):
            chunks[j]["vector"] = v
        by_year: Dict[str, List[Dict[str, Any]]] = {}
        for rec, cs in batch:
            by_year.setdefault(year_of(rec), []).extend(cs)
        for year, cs in by_year.items():  # chunk text first, so every vector can be hydrated
            store.append_part([{k: v for k, v in c.items() if k != "vector"} for c in cs], year=year)
        q.insert_chunks(chunks)
        done_p += len(batch); done_c += len(chunks)
        rate = done_c / max(1e-6, time.time() - t0)
        log.info("%d/%d papers, %d chunks, %.1f chunks/s, ETA %.0f min", done_p, len(work), done_c, rate,
                 (sum(len(c) for _, c in work) - done_c) / rate / 60)
    log.info("Done: +%d papers, +%d chunks; Qdrant points %d -> %d", done_p, done_c, before, q.count())


if __name__ == "__main__":
    main()
