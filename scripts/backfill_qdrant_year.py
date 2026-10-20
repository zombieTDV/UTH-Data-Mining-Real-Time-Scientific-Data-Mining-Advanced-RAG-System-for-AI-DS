"""Backfill the `year` payload field on existing Qdrant Gold points from Silver (no re-embedding).

Vectors are left untouched: each paper's chunks get `year` through a set_payload filtered by `paper_id`, sent in
batches. The year comes from `published_date`, falling back to the Silver partition (silver/papers/year=<y>/...).
Safe to re-run: set_payload only overwrites `year`. New chunks already carry `year` (AcademicChunker).

    python scripts/backfill_qdrant_year.py            # write years
    python scripts/backfill_qdrant_year.py --dry-run  # only report how many papers have a year
"""

import argparse
import logging
import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.indexing.chunker import AcademicChunker  # noqa: E402
from src.indexing.qdrant_manager import QdrantManager  # noqa: E402
from src.storage.lakehouse_io import LakehouseIO  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
logger = logging.getLogger("backfill_qdrant_year")
OPS_PER_BATCH = 200


def load_years(io: LakehouseIO) -> pd.Series:
    """paper_id -> year for every Silver paper that has one."""
    keys = [k for k in io.list_keys("silver/papers/") if k.endswith(".parquet")]
    frames = []
    for k in keys:
        df = io.read_parquet(k)
        if df is None or df.empty:
            continue
        m = re.search(r"/year=(\d{4})/", k)
        part_year = int(m.group(1)) if m else None
        years = df["published_date"].map(AcademicChunker._parse_year) if "published_date" in df else None
        if years is None:
            years = pd.Series([part_year] * len(df), index=df.index)
        else:
            years = years.fillna(part_year)
        frames.append(pd.DataFrame({"paper_id": df["paper_id"].astype(str), "year": years}))
    out = pd.concat(frames, ignore_index=True).dropna(subset=["year"])
    logger.info("Silver: %d files, %d papers with a year", len(keys), out["paper_id"].nunique())
    return out.drop_duplicates("paper_id", keep="last").set_index("paper_id")["year"].astype(int)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    years = load_years(LakehouseIO())
    logger.info("year range %d-%d", years.min(), years.max())
    if args.dry_run:
        return

    qdrant = QdrantManager()
    qdrant._create_payload_index(qdrant.collection_name, "year", "integer")
    url = f"{qdrant.url}/collections/{qdrant.collection_name}/points/batch?wait=true"
    items = list(years.items())
    t0 = time.time()
    for i in range(0, len(items), OPS_PER_BATCH):
        ops = [
            {"set_payload": {"payload": {"year": int(y)}, "filter": {"must": [{"key": "paper_id", "match": {"value": pid}}]}}}
            for pid, y in items[i:i + OPS_PER_BATCH]
        ]
        resp = qdrant._session.post(url, json={"operations": ops}, headers=qdrant._headers, timeout=120)
        resp.raise_for_status()
        done = min(i + OPS_PER_BATCH, len(items))
        logger.info("%d/%d papers, %.0f papers/s", done, len(items), done / max(time.time() - t0, 1e-6))

    logger.info("Done: year set on %d papers; Qdrant holds %d points", len(items), qdrant.count())


if __name__ == "__main__":
    main()
