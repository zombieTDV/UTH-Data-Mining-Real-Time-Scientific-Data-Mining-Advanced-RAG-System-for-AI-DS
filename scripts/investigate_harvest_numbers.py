import sys
sys.path.append('.')
import duckdb
import pandas as pd
from pathlib import Path

conn = duckdb.connect()

print("=== PARQUET FILE ANALYSIS ===")
for p in [
    "data/silver/tier2/fulltext_papers_shard0.parquet",
    "data/silver/tier2/fulltext_papers_shard1.parquet",
    "data/silver/tier2/fulltext_papers.parquet",
    "data/silver/tier1/landmark_papers.parquet",
    "data/silver/chunks.parquet"
]:
    f = Path(p)
    if f.exists():
        row_cnt = conn.execute(f'SELECT count(*) FROM "{p}"').fetchone()[0]
        distinct_pids = conn.execute(f'SELECT count(DISTINCT paper_id) FROM "{p}"').fetchone()[0]
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"\n{p}:")
        print(f"  Rows: {row_cnt:,} | Unique Papers: {distinct_pids:,} | Size: {size_mb:.2f} MB")
        cols = [c[0] for c in conn.execute(f'DESCRIBE SELECT * FROM "{p}"').fetchall()]
        if "crawled_at" in cols:
            min_c, max_c = conn.execute(f'SELECT min(crawled_at), max(crawled_at) FROM "{p}"').fetchone()
            print(f"  Crawled At range: {min_c}  -->  {max_c}")
        if "source" in cols:
            sources = conn.execute(f'SELECT source, count(*) FROM "{p}" GROUP BY source').fetchall()
            print(f"  Sources: {dict(sources)}")
