import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.gold import (
    GoldPipelineWriter,
    GoldLanceDBManager,
    GoldSnapshotPublisher,
    GoldSnapshotManager,
)
from src.models.embeddings.nomic_v15 import NomicV15Spec


def run_pipeline(
    silver_dir: Path,
    output_dir: Path,
    spec: NomicV15Spec,
    silver_scope_id: str,
    silver_version: str,
    batch_size: int,
    allow_title_only: bool,
    checkpoint_dir: Path,
    registry_dir: Path,
) -> dict:
    writer = GoldPipelineWriter(
        silver_dir=silver_dir,
        output_dir=output_dir,
        spec=spec,
        silver_scope_id=silver_scope_id,
        silver_version=silver_version,
        batch_size=batch_size,
        allow_title_only=allow_title_only,
        checkpoint_path=checkpoint_dir / "gold_checkpoint.json",
        registry_path=registry_dir,
    )
    try:
        stats = writer.run()
    finally:
        writer.close()
    return {
        "documents_seen": stats.documents_seen,
        "documents_embedded": stats.documents_embedded,
        "documents_skipped": stats.documents_skipped,
        "chunks_written": stats.chunks_written,
        "batches": stats.batches_processed,
    }


def build_lancedb_index(
    output_dir: Path,
    spec: NomicV15Spec,
) -> int:
    import pyarrow.parquet as pq

    vector_files = list((output_dir / "vectors").rglob("*.parquet"))
    if not vector_files:
        print("[WARN] No vector Parquet files found.")
        return 0

    all_rows = []
    for pf in vector_files:
        t = pq.read_table(str(pf))
        for i in range(t.num_rows):
            row = {c: t.column(c)[i].as_py() for c in t.schema.names}
            all_rows.append(row)

    if not all_rows:
        return 0

    ldb = GoldLanceDBManager(spec=spec, embedding_dim=spec.base_dimension)
    count = ldb.upsert(all_rows)
    return count


def main():
    parser = argparse.ArgumentParser(
        description="Gold Pipeline CLI: Silver Parquet -> Gold Vector Lakehouse."
    )
    parser.add_argument(
        "--silver-dir",
        type=str,
        default=None,
        help="Path to Silver directory. Default: {ROOT_DIR}/data/silver/",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Path to Gold output directory. Default: {ROOT_DIR}/data/gold/",
    )
    parser.add_argument(
        "--silver-scope-id",
        type=str,
        default="openalex-v2",
        help="Silver scope identifier for manifest.",
    )
    parser.add_argument(
        "--silver-version",
        type=str,
        default="v2",
        help="Silver schema version for manifest.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Embedding batch size. Default: 32.",
    )
    parser.add_argument(
        "--allow-title-only",
        action="store_true",
        help="Allow papers without abstract in Gold.",
    )
    parser.add_argument(
        "--skip-embed",
        action="store_true",
        help="Skip embedding step (use existing vector Parquet).",
    )
    parser.add_argument(
        "--skip-lancedb",
        action="store_true",
        help="Skip LanceDB index build.",
    )
    parser.add_argument(
        "--skip-snapshot",
        action="store_true",
        help="Skip R2 snapshot publish.",
    )
    args = parser.parse_args()

    silver_dir = Path(args.silver_dir) if args.silver_dir else (settings.ROOT_DIR / "data" / "silver")
    output_dir = Path(args.output_dir) if args.output_dir else (settings.ROOT_DIR / "data" / "gold")
    checkpoint_dir = output_dir / "checkpoints"
    registry_dir = output_dir / "registry"
    snapshot_dir = output_dir / "lancedb"

    print("=" * 80)
    print("GOLD PIPELINE")
    print(f"  Silver:    {silver_dir}")
    print(f"  Output:    {output_dir}")
    print(f"  Batch:     {args.batch_size}")
    print(f"  Allow-no-abstract: {args.allow_title_only}")
    print("=" * 80)

    start = time.time()

    if not args.skip_embed:
        spec = NomicV15Spec()
        print(f"\n[1/4] Running Gold Pipeline (spec={spec.fingerprint()[:8]})...")
        pipeline_stats = run_pipeline(
            silver_dir=silver_dir,
            output_dir=output_dir,
            spec=spec,
            silver_scope_id=args.silver_scope_id,
            silver_version=args.silver_version,
            batch_size=args.batch_size,
            allow_title_only=args.allow_title_only,
            checkpoint_dir=checkpoint_dir,
            registry_dir=registry_dir,
        )
        print(f"  Pipeline: seen={pipeline_stats['documents_seen']} "
              f"embedded={pipeline_stats['documents_embedded']} "
              f"skipped={pipeline_stats['documents_skipped']} "
              f"chunks={pipeline_stats['chunks_written']}")
    else:
        print("\n[1/4] Skipping embed (--skip-embed).")

    if not args.skip_lancedb:
        spec = NomicV15Spec()
        print(f"\n[2/4] Building LanceDB index...")
        ldb_count = build_lancedb_index(output_dir, spec)
        print(f"  LanceDB rows: {ldb_count}")
    else:
        print("\n[2/4] Skipping LanceDB (--skip-lancedb).")

    if not args.skip_snapshot and settings.R2_ACCESS_KEY_ID:
        import uuid
        snapshot_id = f"gold_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        snapshot_r2_prefix = f"gold/openalex/v1/snapshots/{snapshot_id}/"
        ldb_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"

        print(f"\n[3/4] Publishing immutable snapshot {snapshot_id}...")
        pub = GoldSnapshotPublisher(gold_r2_prefix="gold/openalex/v1/")
        snap_result = pub.publish(snapshot_dir=ldb_path, snapshot_id=snapshot_id)
        print(f"  Published: {snap_result.files_uploaded} files, "
              f"{snap_result.bytes_uploaded:,} bytes, "
              f"verified={snap_result.all_verified}")

        spec = NomicV15Spec()
        ldb_mgr = GoldLanceDBManager(spec=spec)
        print(f"\n[4/4] Updating _latest.json pointer...")
        snap_mgr = GoldSnapshotManager(spec=spec)
        ptr = snap_mgr.write_latest(
            snapshot_id=snapshot_id,
            table_name=ldb_mgr.table_name,
            r2_prefix=snap_result.r2_prefix,
        )
        print(f"  Pointer: fingerprint={ptr.model_fingerprint[:8]} dim={ptr.embedding_dim}")
    else:
        print(f"\n[3/4] Skipping snapshot (--skip-snapshot or no R2 credentials).")
        print(f"[4/4] Skipped.")

    elapsed = time.time() - start
    print("\n" + "=" * 80)
    print(f"Gold pipeline complete in {elapsed:.1f}s.")
    print("=" * 80)


if __name__ == "__main__":
    main()
