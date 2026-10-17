"""Silver Layer Lakehouse Writer.

Transforms parsed paper structures into columnar Apache Parquet format
with zstd compression and uploads to Cloudflare R2 Silver Zone.
"""

import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from src.config.settings import settings
from src.storage.minio_client import StorageClient


class SilverLakehouseWriter:
    """Manages the creation, schema validation, and upload of Silver Parquet datasets."""

    def __init__(self, storage_client: Optional[StorageClient] = None, local_silver_dir: Optional[Path] = None, r2_client: Optional[Any] = None):
        self.storage = storage_client or r2_client or StorageClient()
        self.r2 = self.storage
        self.local_dir = local_silver_dir or (settings.ROOT_DIR / "data" / "silver")
        self.local_dir.mkdir(parents=True, exist_ok=True)


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
            "source": str(raw_meta.get("source") or "openalex"),
            "tier": str(raw_meta.get("tier") or "tier1"),
            "content_origin": str(parsed_html.get("content_origin") or raw_meta.get("content_origin") or "unknown"),
        }

    def save_and_upload_parquet(
        self,
        records: List[Dict[str, Any]],
        year: str = "2026",
    ) -> Dict[str, Any]:
        """Chuyển đổi danh sách bản ghi thành Parquet nén zstd và tải lên R2 Silver."""
        if not records:
            return {"status": "NO_RECORDS", "count": 0}

        df = pd.DataFrame(records)

        # Đảm bảo abstract_hash có trong df
        if "abstract_hash" not in df.columns:
            from src.utils.hasher import compute_abstract_hash
            df["abstract_hash"] = df.apply(
                lambda r: compute_abstract_hash(str(r.get("abstract", "") or r.get("title", ""))),
                axis=1,
            )

        if "cite_count" not in df.columns:
            df["cite_count"] = 0
        df["cite_count"] = df["cite_count"].fillna(0).astype("int64")

        # Bổ sung provenance mặc định nếu chưa có
        if "source" not in df.columns:
            df["source"] = "openalex"
        if "tier" not in df.columns:
            df["tier"] = "tier1"
        if "content_origin" not in df.columns:
            df["content_origin"] = "unknown"

        # Định nghĩa PyArrow Schema chuẩn (23 columns)
        schema = pa.schema(
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

        # Lưu file local
        year_dir = self.local_dir / f"year={year}"
        year_dir.mkdir(parents=True, exist_ok=True)
        local_parquet_path = year_dir / "papers.parquet"

        # Nếu file đã tồn tại cục bộ, hợp nhất (idempotent upsert by abstract_hash)
        existing_df = None
        if local_parquet_path.exists():
            try:
                existing_table = pq.read_table(local_parquet_path)
                existing_df = existing_table.to_pandas()
            except Exception:
                # Tự động tải lại bản chuẩn từ MinIO nếu file local bị lỗi/hỏng footer
                s3_key_recovery = f"silver/papers/year={year}/papers.parquet"
                try:
                    self.storage.download_file_safe(s3_key_recovery, local_parquet_path)
                    existing_table = pq.read_table(local_parquet_path)
                    existing_df = existing_table.to_pandas()
                except Exception:
                    existing_df = None

        if existing_df is not None:
            if "cite_count" not in existing_df.columns:
                existing_df["cite_count"] = 0
            if "source" not in existing_df.columns:
                existing_df["source"] = "openalex"
            if "tier" not in existing_df.columns:
                existing_df["tier"] = "tier1"
            if "content_origin" not in existing_df.columns:
                existing_df["content_origin"] = "unknown"
            if "abstract_hash" not in existing_df.columns:
                from src.utils.hasher import compute_abstract_hash
                existing_df["abstract_hash"] = existing_df.apply(
                    lambda r: compute_abstract_hash(str(r.get("abstract", "") or r.get("title", ""))),
                    axis=1,
                )
            combined_df = pd.concat([existing_df, df], ignore_index=True)
            dedup_col = "abstract_hash" if "abstract_hash" in combined_df.columns else "paper_id"
            combined_df = combined_df.drop_duplicates(subset=[dedup_col], keep="last")
            # Select schema columns in exact order
            for col in schema.names:
                if col not in combined_df.columns:
                    combined_df[col] = None
            combined_df = combined_df[schema.names]
            table = pa.Table.from_pandas(combined_df, schema=schema, preserve_index=False)
        else:
            for col in schema.names:
                if col not in df.columns:
                    df[col] = None
            df = df[schema.names]
            table = pa.Table.from_pandas(df, schema=schema, preserve_index=False)

        pq.write_table(table, local_parquet_path, compression="zstd")

        # Tải lên MinIO S3 Silver Zone
        s3_key = f"silver/papers/year={year}/papers.parquet"
        res = self.storage.upload_file(
            file_path=local_parquet_path,
            key=s3_key,
            content_type="application/vnd.apache.parquet",
        )

        return {
            "status": "SUCCESS",
            "count": len(table),
            "local_path": str(local_parquet_path),
            "s3_uri": res["uri"],
            "r2_uri": res["uri"],
            "size_bytes": res["size_bytes"],
            "sha256": res["sha256"],
        }

