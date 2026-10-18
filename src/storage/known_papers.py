"""What Silver already holds. Silver Parquet is the single source of truth for "have we got this paper".

Two independent checks share one set: the normalized paper_id (same paper, same id) and the abstract hash
(same abstract under another id, e.g. a Tier 3 classic that later shows up again from another source).
Reads only the paper_id and abstract_hash columns of each Silver file straight from MinIO.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Set
from urllib.parse import urlparse

import pyarrow.fs as pafs
import pyarrow.parquet as pq

from src.config.settings import settings
from src.utils.hasher import compute_abstract_hash

logger = logging.getLogger("known_papers")
_VERSION = re.compile(r"v\d+$")


def normalize_id(paper_id: str) -> str:
    """'2401.01234v2' -> '2401.01234' so a revision matches its original."""
    return _VERSION.sub("", str(paper_id).strip())


def is_known(known: Set[str], paper_id: str, abstract: Optional[str]) -> bool:
    h = compute_abstract_hash(abstract or "")
    return normalize_id(paper_id) in known or bool(h and h in known)


def remember(known: Set[str], paper_id: str, abstract: Optional[str]) -> None:
    known.add(normalize_id(paper_id))
    h = compute_abstract_hash(abstract or "")
    if h:
        known.add(h)


def load_known_paper_ids() -> Set[str]:
    """Normalized paper_ids plus abstract hashes of every Silver row."""
    endpoint = urlparse(settings.MINIO_ENDPOINT_URL)
    fs = pafs.S3FileSystem(
        access_key=settings.MINIO_ACCESS_KEY_ID,
        secret_key=settings.MINIO_SECRET_ACCESS_KEY,
        endpoint_override=endpoint.netloc,
        scheme=endpoint.scheme or "http",
        region="us-east-1",
    )
    root = f"{settings.MINIO_BUCKET_NAME}/silver"
    files = [
        i.path for i in fs.get_file_info(pafs.FileSelector(root, recursive=True, allow_not_found=True))
        if i.type == pafs.FileType.File and i.path.endswith(".parquet")
    ]

    def keys(path: str):
        try:
            t = pq.read_table(path, columns=["paper_id", "abstract_hash"], filesystem=fs)
            return [normalize_id(i) for i in t.column("paper_id").to_pylist() if i] + [h for h in t.column("abstract_hash").to_pylist() if h]
        except Exception as e:
            logger.warning("Could not read paper_id/abstract_hash from %s: %s", path, e)
            return []

    known: Set[str] = set()
    with ThreadPoolExecutor(max_workers=8) as pool:
        for chunk in pool.map(keys, files):
            known.update(chunk)
    logger.info("Loaded %d known paper_ids + abstract hashes from %d Silver files", len(known), len(files))
    return known
