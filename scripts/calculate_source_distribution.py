"""Provenance & Source Distribution Analyzer.

Calculates sample distributions across sources (arXiv, CVF, OpenReview, OpenAlex),
ingestion tiers (Tier 1 Landmark, Tier 2 Bulk), and content resolution origins
(arXiv HTML5, ar5iv HTML5, Marker PDF OCR, PyPDF Fallback, Abstract Only)
for both Silver Parquet Lakehouse and Gold LanceDB vector store.

Usage:
    python scripts/calculate_source_distribution.py
"""

import sys
from pathlib import Path
from typing import Dict, Any
import pandas as pd
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings


def analyze_silver_lakehouse() -> pd.DataFrame:
    """Reads all Silver Parquet files and computes distribution."""
    silver_base = settings.ROOT_DIR / "data" / "silver"
    parquet_files = list(silver_base.rglob("*.parquet"))
    
    if not parquet_files:
        print("[WARNING] No Silver Parquet files found in", silver_base)
        return pd.DataFrame()

    dfs = []
    for pf in parquet_files:
        try:
            sub_df = pq.read_table(pf).to_pandas()
            sub_df["file_source"] = pf.name
            dfs.append(sub_df)
        except Exception as e:
            print(f"[ERROR] Could not read {pf}: {e}")

    if not dfs:
        return pd.DataFrame()

    full_df = pd.concat(dfs, ignore_index=True)
    if "abstract_hash" in full_df.columns:
        full_df = full_df.drop_duplicates(subset=["abstract_hash"])
    elif "paper_id" in full_df.columns:
        full_df = full_df.drop_duplicates(subset=["paper_id"])

    return full_df


def analyze_lancedb_gold() -> pd.DataFrame:
    """Reads LanceDB Gold table and extracts chunk distributions."""
    try:
        import lancedb
        db_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"
        if not db_path.exists():
            return pd.DataFrame()
        db = lancedb.connect(str(db_path))
        existing_tbls = db.list_tables() if hasattr(db, "list_tables") else db.table_names()
        if "scientific_papers_gold" not in existing_tbls:
            return pd.DataFrame()
        tbl = db.open_table("scientific_papers_gold")
        return tbl.to_pandas()
    except Exception as e:
        print(f"[NOTE] LanceDB inspection skipped: {e}")
        return pd.DataFrame()


def print_distribution_report():
    """Generates a formatted report for terminal output."""
    print("=" * 80)
    print("           UTH DATA MINING - ACADEMIC SOURCE PROVENANCE REPORT           ")
    print("=" * 80)

    silver_df = analyze_silver_lakehouse()
    if silver_df.empty:
        print("No papers found in Silver Lakehouse.")
        return

    total_papers = len(silver_df)
    print(f"\n[1] SILVER LAKEHOUSE OVERVIEW (Total Unique Papers: {total_papers:,})")
    print("-" * 80)

    # 1. By Source
    if "source" in silver_df.columns:
        src_counts = silver_df["source"].value_counts()
        print("\n--- Distribution by Academic Source ---")
        for src, count in src_counts.items():
            pct = (count / total_papers) * 100
            print(f"  * {src:<15}: {count:>6} papers ({pct:>5.1f}%)")

    # 2. By Tier
    if "tier" in silver_df.columns:
        tier_counts = silver_df["tier"].value_counts()
        print("\n--- Distribution by Ingestion Tier ---")
        for tier, count in tier_counts.items():
            pct = (count / total_papers) * 100
            print(f"  * {tier:<15}: {count:>6} papers ({pct:>5.1f}%)")

    # 3. By Content Origin
    if "content_origin" in silver_df.columns:
        origin_counts = silver_df["content_origin"].value_counts()
        print("\n--- Distribution by Content Resolution Origin ---")
        for orig, count in origin_counts.items():
            pct = (count / total_papers) * 100
            print(f"  * {orig:<22}: {count:>6} papers ({pct:>5.1f}%)")

    # 4. Cross-tab: Source x Content Origin
    if "source" in silver_df.columns and "content_origin" in silver_df.columns:
        print("\n--- Matrix: Source vs. Content Origin ---")
        ct = pd.crosstab(silver_df["source"], silver_df["content_origin"], margins=True, margins_name="Total")
        print(ct.to_string())

    # 5. Math & Word Statistics
    print("\n--- Content Quality & Extraction Metrics ---")
    if "total_math_count" in silver_df.columns:
        total_math = silver_df["total_math_count"].sum()
        papers_with_math = (silver_df["total_math_count"] > 0).sum()
        print(f"  * Papers with LaTeX/MathML formulas: {papers_with_math} ({(papers_with_math/total_papers)*100:.1f}%)")
        print(f"  * Total Formulas Preserved          : {total_math:,}")
    if "total_words" in silver_df.columns:
        total_words = silver_df["total_words"].sum()
        avg_words = silver_df["total_words"].mean()
        print(f"  * Total Words Ingested              : {total_words:,}")
        print(f"  * Average Words per Paper           : {avg_words:.1f}")

    # LanceDB Gold Statistics
    gold_df = analyze_lancedb_gold()
    if not gold_df.empty:
        total_chunks = len(gold_df)
        print("\n" + "=" * 80)
        print(f"[2] GOLD LAYER (LanceDB 768-D Vector Store - Total Chunks: {total_chunks:,})")
        print("-" * 80)
        if "source" in gold_df.columns:
            g_src = gold_df["source"].value_counts()
            print("\n--- Chunks by Academic Source ---")
            for src, count in g_src.items():
                pct = (count / total_chunks) * 100
                print(f"  * {src:<15}: {count:>6} chunks ({pct:>5.1f}%)")
        if "section_type" in gold_df.columns:
            g_sec = gold_df["section_type"].value_counts()
            print("\n--- Chunks by Section Type ---")
            for st, count in g_sec.items():
                pct = (count / total_chunks) * 100
                print(f"  * {st:<15}: {count:>6} chunks ({pct:>5.1f}%)")

    print("\n" + "=" * 80)
    print("Report generated successfully.")
    print("=" * 80)


if __name__ == "__main__":
    print_distribution_report()
