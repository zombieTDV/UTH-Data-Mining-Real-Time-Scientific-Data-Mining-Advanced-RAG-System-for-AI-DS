#!/usr/bin/env python3
"""Live Real-Time Monitoring Dashboard for Academic Ingestion Pipeline.

Monitors:
- Progress manifest: data/manifests/tier1_bootstrap_manifest.json
- Lakehouse Silver Parquet: data/silver/tier1/landmark_papers.parquet
- LanceDB Gold Index: data/gold/lancedb/scientific_papers_gold.lance
- System guardrails: GPU VRAM, free disk space, and residual PDF leaks

Usage:
    python scripts/monitor_ingestion_live.py --once
    python scripts/monitor_ingestion_live.py --interval 3
"""

import argparse
import datetime
import json
import os
import sys
import time
from pathlib import Path
import psutil
import pyarrow.parquet as pq

try:
    import torch
except ImportError:
    torch = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_FILE = PROJECT_ROOT / "data" / "manifests" / "tier1_bootstrap_manifest.json"
SILVER_FILE = PROJECT_ROOT / "data" / "silver" / "tier1" / "landmark_papers.parquet"
GOLD_DIR = PROJECT_ROOT / "data" / "gold" / "lancedb"
TEMP_PDF_DIRS = [
    PROJECT_ROOT / "data" / "raw" / "temp_pdfs",
    PROJECT_ROOT / "data" / "raw" / "tier1" / "pdfs",
    PROJECT_ROOT / "data" / "raw" / "tier1" / "temp_pdfs",
    PROJECT_ROOT / "data" / "raw" / "tier2" / "pdfs",
    PROJECT_ROOT / "data" / "raw" / "tier2" / "temp_pdfs",
]


def get_residual_pdf_count() -> int:
    count = 0
    for d in TEMP_PDF_DIRS:
        if d.exists():
            count += len(list(d.glob("*.pdf")))
    return count


def render_dashboard() -> str:
    lines = []
    lines.append("=" * 82)
    lines.append("        HIGH-FREQUENCY LIVE INGESTION TELEMETRY & LAKEHOUSE MONITOR")
    lines.append(f"                   Timestamp: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 82)

    # 1. Pipeline Manifest Status
    lines.append(" [1] PIPELINE EXECUTION STATUS")
    lines.append(" --------------------------------------------------------------------------------")
    if MANIFEST_FILE.exists():
        try:
            with open(MANIFEST_FILE, "r", encoding="utf-8") as mf:
                mdata = json.load(mf)
            status = mdata.get("status", "unknown").upper()
            curr_b = mdata.get("current_batch", 0)
            tot_b = mdata.get("total_batches", 0)
            pct = mdata.get("progress_pct", 0.0)
            ingested = mdata.get("newly_ingested", 0)
            target = mdata.get("target_limit", 0)
            dur_s = mdata.get("duration_seconds", 0.0)
            speed = mdata.get("speed_papers_per_min", 0.0)
            lines.append(f"  * Status:              {status}")
            lines.append(f"  * Batch Progress:      Batch {curr_b}/{tot_b} ({pct:.1f}%)")
            lines.append(f"  * Newly Ingested:      {ingested} / {target} target papers")
            lines.append(f"  * Run Duration:        {dur_s:.1f}s ({dur_s/60.0:.2f} mins)")
            lines.append(f"  * Current Throughput:  {speed:.1f} papers / minute")
        except Exception as e:
            lines.append(f"  * Error reading manifest: {e}")
    else:
        lines.append("  * Manifest file not found yet (pipeline has not started).")

    lines.append("")

    # 2. Hardware & Guardrails
    lines.append(" [2] HARDWARE TELEMETRY & ZERO-LEAK GUARDRAILS")
    lines.append(" --------------------------------------------------------------------------------")
    free_disk_gb = psutil.disk_usage(str(PROJECT_ROOT)).free / (1024**3)
    pdf_leaks = get_residual_pdf_count()

    lines.append(f"  * Free Disk Space:     {free_disk_gb:.2f} GB (Guardrail: > 15.00 GB) - {'OK' if free_disk_gb > 15 else 'WARNING'}")
    lines.append(f"  * Residual Temp PDFs:  {pdf_leaks} files (Zero Leak Policy: {'PASSED' if pdf_leaks == 0 else 'LEAK DETECTED'})")

    if torch and torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_alloc_mb = torch.cuda.memory_allocated(0) / (1024**2)
        vram_res_mb = torch.cuda.memory_reserved(0) / (1024**2)
        lines.append(f"  * GPU Device:          {gpu_name}")
        lines.append(f"  * VRAM Allocated:      {vram_alloc_mb:.1f} MB (Reserved: {vram_res_mb:.1f} MB)")
    else:
        lines.append("  * GPU Device:          No CUDA GPU active")

    lines.append("")

    # 3. Lakehouse Silver Storage Provenance
    lines.append(" [3] SILVER PARQUET LAKEHOUSE STORAGE")
    lines.append(" --------------------------------------------------------------------------------")
    if SILVER_FILE.exists():
        try:
            df = pq.read_table(SILVER_FILE).to_pandas()
            total_papers = len(df)
            total_math = int(df["total_math_count"].sum()) if "total_math_count" in df.columns else 0
            total_words = int(df["total_words"].sum()) if "total_words" in df.columns else 0

            lines.append(f"  * Total Silver Papers: {total_papers:,}")
            lines.append(f"  * Preserved Formulas:  {total_math:,} LaTeX equations")
            lines.append(f"  * Total Word Count:    {total_words:,} words")
            lines.append(f"  * Table Columns:       {len(df.columns)} (Strict Lakehouse Schema)")

            # Source breakdown
            if "source" in df.columns:
                s_counts = df["source"].value_counts().to_dict()
                lines.append(f"  * Sources Breakdown:   {s_counts}")

            # Origin breakdown
            if "content_origin" in df.columns:
                o_counts = df["content_origin"].value_counts().to_dict()
                lines.append(f"  * Origins Breakdown:   {o_counts}")
        except Exception as e:
            lines.append(f"  * Error reading Silver Parquet: {e}")
    else:
        lines.append("  * Silver Parquet file does not exist yet.")

    lines.append("")

    # 4. LanceDB Gold Vector Store
    lines.append(" [4] LANCEDB GOLD VECTOR STORE")
    lines.append(" --------------------------------------------------------------------------------")
    if GOLD_DIR.exists():
        try:
            import lancedb
            db = lancedb.connect(str(GOLD_DIR))
            table_name = "scientific_papers_gold"
            tables_resp = db.list_tables()
            tables = tables_resp.tables if hasattr(tables_resp, "tables") else list(tables_resp)
            if table_name in tables:
                tbl = db.open_table(table_name)
                row_count = tbl.count_rows()
                lines.append(f"  * Total Gold Chunks:   {row_count:,} vectorized chunks (768-D Nomic)")
            else:
                lines.append(f"  * Table '{table_name}' initializing in {GOLD_DIR}...")
        except Exception as e:
            lines.append(f"  * Vector store note: {e}")
    else:
        lines.append("  * LanceDB Gold index initializing...")

    lines.append("=" * 82)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Live monitor for academic ingestion pipeline.")
    parser.add_argument("--once", action="store_true", help="Print status once and exit.")
    parser.add_argument("--interval", type=int, default=3, help="Refresh interval in seconds (default: 3).")
    args = parser.parse_args()

    if args.once:
        print(render_dashboard())
        return

    try:
        while True:
            os.system("cls" if os.name == "nt" else "clear")
            print(render_dashboard())
            print(f"\nRefreshing every {args.interval}s... Press Ctrl+C to exit.")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nMonitoring stopped.")


if __name__ == "__main__":
    main()
