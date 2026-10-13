import sys
sys.path.append('.')
import duckdb
import lancedb
import pandas as pd
from pathlib import Path

print("================================================================================")
print("             COMPREHENSIVE FULL-TEXT PAPERS & EMBEDDINGS AUDIT                  ")
print("================================================================================")

# 1. Inspect LanceDB Gold Table
print("\n--- 1. LANCEDB GOLD TABLE (VECTORS & EMBEDDED PAPERS) ---")
db = lancedb.connect("data/gold/lancedb")
tbl = db.open_table("scientific_papers_gold")
total_vectors = tbl.count_rows()
print(f"Total Vectors in 'scientific_papers_gold': {total_vectors:,}")

# Sample or query distinct paper_ids in LanceDB
try:
    # Use tbl.search().select(["paper_id", "source"]).to_pandas()
    # Or iterate batches with tbl.to_arrow()
    arrow_tbl = tbl.search().select(["paper_id", "source"]).limit(1000000).to_arrow()
    lance_df = arrow_tbl.to_pandas()
    unique_embedded_papers = set(lance_df["paper_id"].astype(str))
    print(f"Unique Papers already embedded in Gold: {len(unique_embedded_papers):,}")
    print("Embedded Chunks Breakdown by Source:")
    print(lance_df["source"].value_counts().to_string())
except Exception as e:
    print(f"Note on LanceDB scanning: {e}")
    unique_embedded_papers = set()

# 2. Inspect All Silver Full-Text Sources
print("\n--- 2. ALL FULL-TEXT PAPER DATASETS ON DISK ---")
conn = duckdb.connect()

sources_summary = {}
all_harvested_papers = set()

# A. Tier 2 Harvested (Master Merged)
tier2_path = Path("data/silver/tier2/fulltext_papers.parquet")
if tier2_path.exists():
    df_t2 = conn.execute(f'SELECT paper_id, source FROM "{tier2_path}"').df()
    t2_pids = set(df_t2["paper_id"].astype(str))
    all_harvested_papers.update(t2_pids)
    sources_summary["Tier 2 Harvested (Merged Master)"] = {
        "count": len(t2_pids),
        "breakdown": df_t2["source"].value_counts().to_dict(),
        "pids": t2_pids
    }
    print(f"  • Tier 2 Harvested (fulltext_papers.parquet): {len(t2_pids):,} papers")
    for s, c in df_t2["source"].value_counts().items():
        print(f"      - {s}: {c:,}")

# B. Tier 1 Landmark Papers
tier1_path = Path("data/silver/tier1/landmark_papers.parquet")
if tier1_path.exists():
    df_t1 = conn.execute(f'SELECT paper_id, source FROM "{tier1_path}"').df()
    t1_pids = set(df_t1["paper_id"].astype(str))
    all_harvested_papers.update(t1_pids)
    sources_summary["Tier 1 Landmark Papers"] = {
        "count": len(t1_pids),
        "breakdown": df_t1["source"].value_counts().to_dict(),
        "pids": t1_pids
    }
    print(f"  • Tier 1 Landmark Papers: {len(t1_pids):,} papers")

# C. Phase 2 HTML/DOI Sections & Chunks
chunks_path = Path("data/silver/chunks.parquet")
if chunks_path.exists():
    cols = [r[0] for r in conn.execute(f'DESCRIBE SELECT * FROM "{chunks_path}"').fetchall()]
    src_col = "source" if "source" in cols else ("doi" if "doi" in cols else "paper_id")
    df_chk = conn.execute(f'SELECT DISTINCT paper_id, {src_col} AS src FROM "{chunks_path}"').df()
    chk_pids = set(df_chk["paper_id"].astype(str))
    all_harvested_papers.update(chk_pids)
    sources_summary["Phase 2 Deep Full-Text Chunks (DOI/arXiv)"] = {
        "count": len(chk_pids),
        "breakdown": {"doi/journal": len(chk_pids)},
        "pids": chk_pids
    }
    print(f"  • Deep Chunks Lakehouse (chunks.parquet): {len(chk_pids):,} unique papers")

# D. OpenReview & CVF Conference Collections
for conf_name, conf_path in [
    ("CVF Conferences", "data/silver/cvf/papers.parquet"),
    ("OpenReview Conferences", "data/silver/openreview/papers.parquet"),
]:
    p = Path(conf_path)
    if p.exists():
        df_c = conn.execute(f'SELECT paper_id, source FROM "{p}"').df()
        cpids = set(df_c["paper_id"].astype(str))
        all_harvested_papers.update(cpids)
        sources_summary[conf_name] = {
            "count": len(cpids),
            "breakdown": df_c["source"].value_counts().to_dict(),
            "pids": cpids
        }
        print(f"  • {conf_name}: {len(cpids):,} papers")

# 3. Overall Totals and Embedded vs Not-Embedded
print("\n--- 3. GRAND TOTALS: EMBEDDED VS NOT EMBEDDED ---")
total_unique_fulltext = len(all_harvested_papers)
embedded_count = len(all_harvested_papers.intersection(unique_embedded_papers))
not_embedded_pids = all_harvested_papers - unique_embedded_papers
not_embedded_count = len(not_embedded_pids)

print(f"Total Unique Genuine Full-Text Papers in Lakehouse: {total_unique_fulltext:,}")
print(f"Already Embedded in LanceDB Gold:                   {embedded_count:,} papers ({(embedded_count/total_unique_fulltext*100):.1f}%)")
print(f"NOT YET Embedded (Pending Vectorization):          {not_embedded_count:,} papers ({(not_embedded_count/total_unique_fulltext*100):.1f}%)")

print("\nBreakdown of PENDING (NOT YET EMBEDDED) papers:")
for name, data in sources_summary.items():
    pending_in_source = len(data["pids"] - unique_embedded_papers)
    print(f"  • {name}: {pending_in_source:,} pending out of {data['count']:,}")

print("================================================================================")
