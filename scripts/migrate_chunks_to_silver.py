"""One-off migration: move chunk text/metadata out of the Qdrant payload into the Silver chunk table.

  1. export   scroll every Qdrant point (payload only, no vectors) -> silver/chunks/year=*/parts/
  2. compact  fold the parts into silver/chunks/year=*/chunks.parquet
  3. verify   the set of chunk_ids in silver/chunks/ equals the set of chunk_ids in Qdrant
  4. strip    (only with --strip, only after verify passes) delete every payload key except QDRANT_PAYLOAD_FIELDS

The chunks are copied from Qdrant as they are (no re-chunking), so chunk_ids match the existing points exactly.
Run with the queue consumer stopped. Re-running is safe: compaction deduplicates by chunk_id.

  python scripts/migrate_chunks_to_silver.py                 # export + compact + verify
  python scripts/migrate_chunks_to_silver.py --verify-only
  python scripts/migrate_chunks_to_silver.py --verify-only --strip
"""

import argparse
import datetime
import io
import logging
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pyarrow.parquet as pq
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.indexing.qdrant_manager import QdrantManager  # noqa: E402
from src.storage.chunk_store import CHUNKS_PREFIX, QDRANT_PAYLOAD_FIELDS, ChunkStore  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
logger = logging.getLogger("migrate_chunks")
FLUSH_ROWS = 50_000


def scroll(q: QdrantManager, page: int = 2000, payload: Any = True):
    offset: Optional[Any] = None
    while True:
        body: Dict[str, Any] = {"limit": page, "with_payload": payload, "with_vector": False}
        if offset is not None:
            body["offset"] = offset
        r = q._session.post(f"{q.url}/collections/{q.collection_name}/points/scroll", json=body, timeout=120)
        r.raise_for_status()
        res = r.json()["result"]
        yield res["points"]
        offset = res.get("next_page_offset")
        if offset is None:
            return


def export(q: QdrantManager, store: ChunkStore) -> Set[str]:
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    buf: Dict[str, List[Dict[str, Any]]] = {}
    keys: Set[str] = set()
    n, t0 = 0, time.time()
    for pts in scroll(q):
        for p in pts:
            pl = p.get("payload") or {}
            keys.update(pl)
            if "text" not in pl:  # already stripped (re-run after --strip): nothing to copy
                continue
            year = str(pl.get("year") or datetime.datetime.now().year)
            buf.setdefault(year, []).append(pl)
            n += 1
        for year in [y for y, rows in buf.items() if len(rows) >= FLUSH_ROWS]:
            store.append_part(buf.pop(year), year=year, indexed_at=stamp)
        if n and n % 100_000 < 2000:
            logger.info("exported %d chunks (%.0f/s)", n, n / max(1e-6, time.time() - t0))
    for year, rows in buf.items():
        store.append_part(rows, year=year, indexed_at=stamp)
    logger.info("export done: %d chunks in %.0fs; payload keys seen: %s", n, time.time() - t0, sorted(keys))
    return keys


def silver_chunk_ids(store: ChunkStore) -> List[str]:
    ids: List[str] = []
    for k in store.io.list_keys(CHUNKS_PREFIX):
        if k.endswith(".parquet"):
            ids += pq.read_table(io.BytesIO(store.storage.get_bytes(k)), columns=["chunk_id"])["chunk_id"].to_pylist()
    return ids


def verify(q: QdrantManager, store: ChunkStore) -> bool:
    silver = silver_chunk_ids(store)
    silver_set = set(silver)
    qdrant_ids: Set[str] = set()
    for pts in scroll(q, page=10000, payload=["chunk_id"]):
        qdrant_ids.update(str((p.get("payload") or {}).get("chunk_id")) for p in pts)
    missing = qdrant_ids - silver_set
    extra = silver_set - qdrant_ids
    logger.info("verify: qdrant=%d silver_rows=%d silver_unique=%d missing_in_silver=%d extra_in_silver=%d",
                len(qdrant_ids), len(silver), len(silver_set), len(missing), len(extra))
    if missing:
        logger.error("e.g. missing: %s", sorted(missing)[:5])
    return not missing and len(silver) == len(silver_set)


def strip(q: QdrantManager) -> None:
    keys: Set[str] = set()
    for pts in scroll(q, page=5000):
        for p in pts:
            keys.update(p.get("payload") or {})
    drop = sorted(k for k in keys if k not in QDRANT_PAYLOAD_FIELDS)
    if not drop:
        logger.info("strip: nothing to drop")
        return
    logger.info("strip: deleting payload keys %s from every point", drop)
    r = q._session.post(f"{q.url}/collections/{q.collection_name}/points/payload/delete?wait=true",
                        json={"keys": drop, "filter": {"must": []}}, timeout=3600)
    r.raise_for_status()
    logger.info("strip: %s", r.json().get("status"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--strip", action="store_true", help="after a passing verify, drop the migrated payload keys from Qdrant")
    args = ap.parse_args()

    q = QdrantManager()
    store = ChunkStore()
    if not args.verify_only:
        export(q, store)
        logger.info("compact: %s", {y: r.get("rows") for y, r in store.compact_all()["results"].items()})
    ok = verify(q, store)
    if not ok:
        sys.exit("verify failed: Qdrant payload left untouched")
    if args.strip:
        strip(q)


if __name__ == "__main__":
    main()
