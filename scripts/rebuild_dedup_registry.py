"""Rebuild the MinIO abstract-hash registry from every Silver Parquet in the lakehouse.

Reads only the needed columns straight from MinIO (S3 range reads, no local files) and
merges them into manifests/lakehouse_abstract_hashes.json. Additive: existing hashes are kept.

    python scripts/rebuild_dedup_registry.py           # report
    python scripts/rebuild_dedup_registry.py --apply   # write the manifest
"""

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

import pyarrow.fs as pafs
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import settings  # noqa: E402
from src.storage.minio_client import StorageClient  # noqa: E402
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator  # noqa: E402
from src.utils.hasher import compute_abstract_hash  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    st = StorageClient()
    ep = urlparse(settings.MINIO_ENDPOINT_URL)
    fs = pafs.S3FileSystem(
        access_key=settings.MINIO_ACCESS_KEY_ID,
        secret_key=settings.MINIO_SECRET_ACCESS_KEY,
        endpoint_override=ep.netloc,
        scheme=ep.scheme or "http",
        region="us-east-1",
    )
    dedup = LakehouseDeduplicator()
    before = len(dedup)

    for obj in st.list_objects("silver/", max_keys=1_000_000):
        key = obj["key"]
        if not key.endswith(".parquet"):
            continue
        path = f"{st.bucket_name}/{key}"
        names = set(pq.read_schema(fs.open_input_file(path)).names)
        id_col = "paper_id" if "paper_id" in names else None
        if "abstract_hash" in names and id_col:
            cols, derive = [id_col, "abstract_hash"], False
        elif "abstract" in names and id_col:
            cols, derive = [id_col, "abstract"], True
        else:
            print(f"skip   {key} (no paper_id/abstract columns)")
            continue
        tbl = pq.read_table(fs.open_input_file(path), columns=cols)
        ids = tbl.column(id_col).to_pylist()
        vals = tbl.column(cols[1]).to_pylist()
        added = 0
        for pid, v in zip(ids, vals):
            h = compute_abstract_hash(v or "") if derive else v
            if h and dedup.record(h, str(pid)):
                added += 1
        print(f"scan   {key}: {len(ids):,} rows, +{added:,} new hashes")

    print(f"\nregistry: {before:,} -> {len(dedup):,} hashes")
    if args.apply:
        dedup.save()
        print("saved to MinIO manifests/lakehouse_abstract_hashes.json")


if __name__ == "__main__":
    main()
