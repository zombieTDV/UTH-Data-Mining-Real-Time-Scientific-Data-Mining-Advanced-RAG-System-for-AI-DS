import sys
sys.path.append('.')
import lancedb
import duckdb
import os
from src.storage.r2_client import R2Client

print("=== LANCEDB GOLD TABLE ===")
try:
    db = lancedb.connect("data/gold/lancedb")
    tbl = db.open_table("scientific_papers_gold")
    print(f"scientific_papers_gold total vectors: {tbl.count_rows()}")
except Exception as e:
    print(f"LanceDB error: {e}")

print("\n=== LOCAL HARVEST SHARDS ===")
conn = duckdb.connect()
shards = [
    "data/silver/tier2/fulltext_papers.parquet",
    "data/silver/tier2/fulltext_papers_shard0.parquet",
    "data/silver/tier2/fulltext_papers_shard1.parquet"
]
for f in shards:
    if os.path.exists(f):
        cnt = conn.execute(f'SELECT count(*) FROM "{f}"').fetchone()[0]
        size = os.path.getsize(f) / (1024 * 1024)
        print(f"  {f}: {cnt} papers ({size:.2f} MB)")
    else:
        print(f"  {f}: [Not found locally]")

print("\n=== CLOUDFLARE R2 SHARDS & OBJECTS ===")
try:
    r2 = R2Client()
    objs = r2.list_objects(prefix="silver/tier2/")
    for obj in objs:
        k = obj.get("key", "")
        sz = obj.get("size", 0) / (1024 * 1024)
        lm = obj.get("last_modified", "")
        print(f"  R2: {k} | {sz:.2f} MB | {lm}")

    if any(obj.get("key") == "silver/tier2/fulltext_papers_shard1.parquet" for obj in objs):
        print("\n=== DOWNLOADING & INSPECTING FRIEND SHARD 1 ===")
        temp_shard1 = "data/silver/tier2/fulltext_papers_shard1.parquet"
        r2.download_file_safe("silver/tier2/fulltext_papers_shard1.parquet", temp_shard1)
        cnt = conn.execute(f'SELECT count(*) FROM "{temp_shard1}"').fetchone()[0]
        sources = conn.execute(f'SELECT source, count(*) FROM "{temp_shard1}" GROUP BY source').fetchall()
        print(f"  Friend Shard 1: {cnt} papers")
        for s, c in sources:
            print(f"    - {s}: {c} papers")
except Exception as e:
    print(f"R2 error: {e}")
