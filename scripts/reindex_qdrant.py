"""Rebuild the Qdrant Gold collection from Silver (no re-crawl).

Use after a change to chunking or embedding (e.g. the token window): every Silver paper is re-chunked and re-embedded
exactly the way the queue consumer does it, into a freshly recreated collection, so no stale points survive.
Stop the queue consumer first: it is the only other writer to the collection.

    python scripts/reindex_qdrant.py            # rebuild everything
    python scripts/reindex_qdrant.py --dry-run  # only report papers / chunks / token lengths
"""

import argparse
import logging
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.indexing.chunker import AcademicChunker  # noqa: E402
from src.indexing.embedder import MAX_TOKENS, NomicEmbedder  # noqa: E402
from src.indexing.qdrant_manager import QdrantManager  # noqa: E402
from src.storage.lakehouse_io import LakehouseIO  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
logger = logging.getLogger("reindex_qdrant")
PAPERS_PER_STEP = 48


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    io = LakehouseIO()
    keys = [k for k in io.list_keys("silver/papers/") if k.endswith(".parquet")]
    silver = pd.concat([io.read_parquet(k) for k in keys], ignore_index=True)
    # A paper re-indexed with better content can have two rows until compaction: keep its richest one
    silver = silver.sort_values("total_words").drop_duplicates("paper_id", keep="last")
    chunker = AcademicChunker(max_chunk_words=450, overlap_words=50)  # same settings as the queue consumer
    logger.info("Silver: %d papers from %d files", len(silver), len(keys))

    embedder = NomicEmbedder()
    if args.dry_run:
        chunks = [c for rec in silver.sample(min(300, len(silver)), random_state=0).to_dict("records") for c in chunker.chunk_paper(rec)]
        lens = sorted(len(embedder.tokenizer("search_document: " + c["context_text"])["input_ids"]) for c in chunks)
        logger.info("sample: %d chunks, median %d tokens, max %d, over the %d window: %d",
                    len(chunks), lens[len(lens) // 2], lens[-1], MAX_TOKENS, sum(n > MAX_TOKENS for n in lens))
        return

    qdrant = QdrantManager()
    requests.delete(f"{qdrant.url}/collections/{qdrant.collection_name}", timeout=60).raise_for_status()
    qdrant.ensure_collection()
    logger.info("Recreated collection %s (window %d tokens)", qdrant.collection_name, MAX_TOKENS)

    records = silver.to_dict("records")
    total_chunks = no_text = longest = 0
    t0 = time.time()
    for i in range(0, len(records), PAPERS_PER_STEP):
        chunks = []
        for rec in records[i:i + PAPERS_PER_STEP]:
            cs = chunker.chunk_paper(rec)
            no_text += not cs
            chunks += cs
        if not chunks:
            continue
        # Embed short texts together so each batch pads less, then put the vectors back in place
        order = sorted(range(len(chunks)), key=lambda j: len(chunks[j]["context_text"]))
        vectors = embedder.embed_documents([chunks[j]["context_text"] for j in order])
        for j, vec in zip(order, vectors):
            chunks[j]["vector"] = vec
        qdrant.insert_chunks(chunks)
        total_chunks += len(chunks)
        longest = max(longest, max(len(c["context_text"].split()) for c in chunks))
        done = min(i + PAPERS_PER_STEP, len(records))
        rate = done / max(time.time() - t0, 1e-6)
        logger.info("%d/%d papers, %d chunks, %.1f papers/s, ETA %.0f min",
                    done, len(records), total_chunks, rate, (len(records) - done) / rate / 60)

    logger.info("Done: %d papers -> %d chunks (%d papers have no text to embed); Qdrant now holds %d points",
                len(records), total_chunks, no_text, qdrant.count())


if __name__ == "__main__":
    main()
