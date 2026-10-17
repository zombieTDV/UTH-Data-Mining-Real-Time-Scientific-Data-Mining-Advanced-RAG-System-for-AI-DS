"""Silver Layer Lakehouse Writer.

Transforms parsed paper structures into columnar Apache Parquet (zstd) and writes
them straight to the MinIO Silver zone. Everything is serialized in memory; nothing
touches the local disk.
"""

import datetime
import json
import uuid
from typing import Any, Dict, List, Optional
import pandas as pd
import pyarrow as pa

from src.storage.lakehouse_io import LakehouseIO
from src.storage.minio_client import StorageClient


class SilverLakehouseWriter:
    """Manages the creation, schema validation, and upload of Silver Parquet datasets."""

    SCHEMA = pa.schema(
        [
            ("paper_id", pa.string()),
            ("abstract_hash", pa.string()),
            ("doi", pa.string()),
            ("journal_ref", pa.string()),
            ("title", pa.string()),
            ("abstract", pa.string()),
            ("authors", pa.list_(pa.string())),
            ("categories", pa.list_(pa.string())),
            ("primary_category", pa.string()),
            ("published_date", pa.string()),
            ("crawled_at", pa.string()),
            ("pdf_url", pa.string()),
            ("html_url", pa.string()),
            ("total_sections", pa.int64()),
            ("total_math_count", pa.int64()),
            ("total_words", pa.int64()),
            ("sections_json", pa.string()),
            ("clean_full_text", pa.string()),
            ("transformed_at", pa.string()),
            ("cite_count", pa.int64()),
            ("source", pa.string()),
            ("tier", pa.string()),
            ("content_origin", pa.string()),
        ]
    )

    def __init__(self, storage_client: Optional[StorageClient] = None, r2_client: Optional[Any] = None, **_ignored):
        self.storage = storage_client or r2_client or StorageClient()
        self.r2 = self.storage
        self.io = LakehouseIO(self.storage)

    def prepare_record(self, raw_meta: Dict[str, Any], parsed_html: Dict[str, Any]) -> Dict[str, Any]:
        """Gộp metadata thô và kết quả bóc tách HTML thành 1 bản ghi Silver chuẩn hóa."""
        paper_id = raw_meta.get("paper_id", "")
        title = parsed_html.get("parsed_title") or raw_meta.get("title", "")
        abstract = parsed_html.get("parsed_abstract") or raw_meta.get("abstract", "")
        sections = parsed_html.get("sections", [])

        # Ghép toàn bộ nội dung các mục thành một văn bản liên tục có cấu trúc
        full_text_parts = [f"Title: {title}", f"Abstract: {abstract}"]
        for s in sections:
            full_text_parts.append(f"\n## {s['section_title']}\n{s['content']}")
        clean_full_text = "\n\n".join(full_text_parts)

        raw_cats = raw_meta.get("categories", [])
        categories = list(raw_cats) if hasattr(raw_cats, "__iter__") and not isinstance(raw_cats, (str, bytes)) else [str(raw_cats)]
        primary_cat = raw_meta.get("primary_category") or (categories[0] if len(categories) > 0 else "unknown")

        raw_authors = raw_meta.get("authors", [])
        authors = list(raw_authors) if hasattr(raw_authors, "__iter__") and not isinstance(raw_authors, (str, bytes)) else [str(raw_authors)]

        from src.utils.hasher import compute_abstract_hash
        abs_hash = compute_abstract_hash(str(abstract) or str(title))

        return {
            "paper_id": str(paper_id),
            "abstract_hash": str(abs_hash),
            "doi": str(raw_meta.get("doi")) if raw_meta.get("doi") else None,
            "journal_ref": str(raw_meta.get("journal_ref")) if raw_meta.get("journal_ref") else None,
            "title": str(title),
            "abstract": str(abstract),
            "authors": [str(a) for a in authors],
            "categories": [str(c) for c in categories],
            "primary_category": str(primary_cat),
            "published_date": str(raw_meta.get("published_date", "")),
            "crawled_at": str(raw_meta.get("crawled_at", "")),
            "pdf_url": str(raw_meta.get("pdf_url", "")),
            "html_url": str(raw_meta.get("html_url", "")),
            "total_sections": int(parsed_html.get("total_sections", len(sections))),
            "total_math_count": int(parsed_html.get("total_math_count", 0)),
            "total_words": int(parsed_html.get("total_words", len(clean_full_text.split()))),
            "sections_json": json.dumps(sections, ensure_ascii=False),
            "clean_full_text": clean_full_text,
            "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "cite_count": int(raw_meta.get("cite_count") or raw_meta.get("citation_count") or 0),
            "source": str(raw_meta.get("source") or "arxiv"),
            "tier": str(raw_meta.get("tier") or "tier1"),
            "content_origin": str(parsed_html.get("content_origin") or raw_meta.get("content_origin") or "unknown"),
        }

    @staticmethod
    def year_key(year: str) -> str:
        return f"silver/papers/year={year}/papers.parquet"

    def _normalize_frame(self, records: List[Dict[str, Any]]) -> pd.DataFrame:
        from src.utils.hasher import compute_abstract_hash

        df = pd.DataFrame(records)
        if "abstract_hash" not in df.columns:
            df["abstract_hash"] = df.apply(
                lambda r: compute_abstract_hash(str(r.get("abstract", "") or r.get("title", ""))), axis=1
            )
        if "cite_count" not in df.columns:
            df["cite_count"] = 0
        df["cite_count"] = df["cite_count"].fillna(0).astype("int64")
        for col, default in (("source", "arxiv"), ("tier", "tier1"), ("content_origin", "unknown")):
            if col not in df.columns:
                df[col] = default
        for col in self.SCHEMA.names:
            if col not in df.columns:
                df[col] = None
        return df[self.SCHEMA.names]

    def append_part(self, records: List[Dict[str, Any]], year: str = "2026") -> Dict[str, Any]:
        """Streaming write: one immutable part object per micro-batch (O(batch), no rewrite
        of the big year file). Fold parts into papers.parquet with compact_year()."""
        if not records:
            return {"status": "NO_RECORDS", "count": 0}
        df = self._normalize_frame(records)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")
        key = f"silver/papers/year={year}/parts/part-{stamp}-{uuid.uuid4().hex[:8]}.parquet"
        res = self.io.write_parquet(key, df, schema=self.SCHEMA)
        return {"status": "SUCCESS", "count": len(df), "s3_uri": res["uri"], "key": key, "size_bytes": res["size_bytes"]}

    def compact_year(self, year: str = "2026") -> Dict[str, Any]:
        """Merge every parts/ object of `year` into papers.parquet (dedup by abstract_hash), then delete the parts."""
        prefix = f"silver/papers/year={year}/parts/"
        part_keys = self.io.list_keys(prefix)
        if not part_keys:
            return {"status": "NOTHING_TO_COMPACT", "parts": 0}
        frames = [self.io.read_parquet(k) for k in part_keys]
        new_df = pd.concat([f for f in frames if f is not None], ignore_index=True)
        res = self.io.upsert_parquet(self.year_key(year), new_df, subset=["abstract_hash"], schema=self.SCHEMA)
        self.storage.delete_objects_batch(part_keys)  # only after the merged object is safely written
        return {"status": "SUCCESS", "parts": len(part_keys), "rows": res["rows"], "s3_uri": res["uri"]}

    def compact_all(self) -> Dict[str, Any]:
        """Fold every year's parts/ objects into that year's papers.parquet. Safe next to a running consumer:
        only the part keys listed here are merged and deleted; parts written meanwhile are picked up next time."""
        import re

        years = sorted({
            m.group(1)
            for k in self.io.list_keys("silver/papers/")
            if (m := re.match(r"silver/papers/year=([^/]+)/parts/.+\.parquet$", k))
        })
        results = {y: self.compact_year(y) for y in years}
        return {"years": years, "results": results, "parts": sum(r.get("parts", 0) for r in results.values())}

    def save_and_upload_parquet(self, records: List[Dict[str, Any]], year: str = "2026") -> Dict[str, Any]:
        """Batch write: upsert records (by abstract_hash) into silver/papers/year=<year>/papers.parquet."""
        if not records:
            return {"status": "NO_RECORDS", "count": 0}
        df = self._normalize_frame(records)
        existing = self.io.read_parquet(self.year_key(year))
        if existing is not None and "abstract_hash" not in existing.columns:
            from src.utils.hasher import compute_abstract_hash

            existing["abstract_hash"] = existing.apply(
                lambda r: compute_abstract_hash(str(r.get("abstract", "") or r.get("title", ""))), axis=1
            )
        res = self.io.upsert_parquet(self.year_key(year), df, subset=["abstract_hash"], schema=self.SCHEMA)
        return {
            "status": "SUCCESS",
            "count": res["rows"],
            "s3_uri": res["uri"],
            "r2_uri": res["uri"],
            "size_bytes": res["size_bytes"],
            "sha256": res["sha256"],
        }
