"""PDF Cleanup Utility: Purges temporary binary PDFs while preserving Markdowns.

Ensures the 90 GB disk overhead of raw PDF files is safely eliminated once
Marker Markdown extraction and Silver/Gold indexing have completed.

Usage:
    python scripts/cleanup_raw_pdfs.py [--dry-run]
"""

import argparse
import logging
from pathlib import Path
import psutil

PROJECT_ROOT = Path(__file__).resolve().parents[1]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cleanup_raw_pdfs")


def cleanup_pdfs(dry_run: bool = False):
    raw_dir = PROJECT_ROOT / "data" / "raw"
    pdf_dirs = [
        raw_dir / "tier1" / "pdfs",
        raw_dir / "tier2" / "pdfs",
        raw_dir / "tier3" / "pdfs",
        raw_dir / "zenodo" / "pdfs",
        raw_dir / "cvf" / "pdfs",
    ]

    total_deleted = 0
    total_bytes = 0

    print("=" * 70)
    print("  LAKEHOUSE RAW PDF CLEANUP UTILITY")
    usage_before = psutil.disk_usage(str(PROJECT_ROOT))
    print(f"  Current Free Disk Space: {usage_before.free / (1024**3):.2f} GB")
    print("=" * 70)

    for pdir in pdf_dirs:
        if not pdir.exists():
            continue

        pdfs = list(pdir.glob("*.pdf"))
        print(f"\nScanning: {pdir.relative_to(PROJECT_ROOT)} ({len(pdfs)} PDFs found)...")

        for f in pdfs:
            sz = f.stat().st_size
            total_bytes += sz
            total_deleted += 1
            if not dry_run:
                try:
                    f.unlink()
                except Exception as e:
                    logger.warning("Could not delete %s: %s", f.name, e)
            else:
                logger.debug("[DRY RUN] Would delete %s (%d bytes)", f.name, sz)

    freed_mb = total_bytes / (1024 * 1024)
    freed_gb = total_bytes / (1024 * 1024 * 1024)

    print("\n" + "=" * 70)
    action = "Would delete" if dry_run else "Successfully purged"
    print(f"  {action}: {total_deleted:,} PDF files ({freed_mb:.1f} MB / {freed_gb:.2f} GB)")
    usage_after = psutil.disk_usage(str(PROJECT_ROOT))
    print(f"  Resulting Free Disk Space: {usage_after.free / (1024**3):.2f} GB")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge temporary binary PDFs from Lakehouse raw storage.")
    parser.add_argument("--dry-run", action="store_true", help="Report files that would be deleted without deleting")
    args = parser.parse_args()
    cleanup_pdfs(dry_run=args.dry_run)
