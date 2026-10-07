"""
scripts/build_r2_vector_index.py
---------------------------------
Builds an IVF-PQ vector index on 'scientific_papers_gold' directly in Cloudflare R2.
This transitions LanceDB from a brute-force 506 MB S3 flat scan (354s)
to sub-second indexed centroid probing (~2-5s over R2).
"""

import os
import sys
import time
import logging
from pathlib import Path
from dotenv import load_dotenv
import lancedb
from lancedb.index import IvfPq

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_r2_index")

def build_index():
    # Load .env
    root_dir = Path(__file__).resolve().parents[1]
    load_dotenv(root_dir / ".env")

    s3_uri = os.getenv("LANCEDB_URI", "s3://uth-scientific-lakehouse/gold/lancedb")
    table_name = os.getenv("LANCEDB_TABLE", "scientific_papers_gold")
    endpoint = os.getenv("R2_ENDPOINT_URL")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")

    if not endpoint or not access_key or not secret_key:
        logger.error("Missing R2 credentials in environment!")
        sys.exit(1)

    storage_options = {
        "endpoint": endpoint,
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region": "auto",
    }

    logger.info("Connecting to LanceDB at: %s ...", s3_uri)
    db = lancedb.connect(s3_uri, storage_options=storage_options)
    logger.info("Opening table '%s' ...", table_name)
    tbl = db.open_table(table_name)
    total_rows = len(tbl)
    logger.info("Table '%s' opened successfully! Total rows: %d, version: %s", table_name, total_rows, tbl.version)

    existing_indices = tbl.list_indices()
    logger.info("Existing indices on R2: %s", existing_indices)

    # Configure IvfPq: 256 partitions, 48 sub-vectors (768 / 16), cosine distance
    config = IvfPq(
        distance_type="cosine",
        num_partitions=256,
        num_sub_vectors=48,
        max_iterations=30,
        sample_rate=128,
    )

    logger.info("Starting IVF-PQ index build on 'vector' column directly in Cloudflare R2...")
    logger.info("Configuration: %s", config)
    t0 = time.time()
    
    tbl.create_index("vector", config=config, replace=True)
    
    elapsed = time.time() - t0
    logger.info(">>> SUCCESS: IVF-PQ index built in %.2f seconds (%.2f minutes)!", elapsed, elapsed / 60.0)
    logger.info("Updated indices on R2: %s", tbl.list_indices())

if __name__ == "__main__":
    build_index()
