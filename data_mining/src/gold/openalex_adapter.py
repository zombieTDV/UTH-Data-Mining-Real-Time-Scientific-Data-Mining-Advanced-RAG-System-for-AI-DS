import json
import logging
from typing import Any, Optional

import pyarrow as pa

from src.gold.contracts import GOLD_SCHEMA_VERSION, GoldDocument
from src.gold.text_builder import build_semantic_text


logger = logging.getLogger(__name__)


class SilverValidationError(Exception):
    pass


class OpenAlexAdapter:
    REQUIRED_COLUMNS = [
        "paper_id",
        "title",
        "abstract",
        "authors",
        "published_date",
    ]
    OPTIONAL_COLUMNS = [
        "doi",
        "primary_category",
        "categories",
        "crawled_at",
        "html_url",
    ]

    def __init__(self, allow_title_only: bool = False):
        self.allow_title_only = allow_title_only

    def validate_row(self, row: dict[str, Any]) -> None:
        for col in self.REQUIRED_COLUMNS:
            if col not in row or row.get(col) is None:
                raise SilverValidationError(
                    f"Missing required column: {col} for paper_id={row.get('paper_id')}"
                )

    def adapt_row(
        self,
        row: dict[str, Any],
        silver_schema_version: Optional[str] = None,
    ) -> Optional[GoldDocument]:
        try:
            self.validate_row(row)
        except SilverValidationError:
            logger.warning("Silver validation failed for row: %s", row.get("paper_id"))
            return None

        paper_id = str(row["paper_id"])
        title = str(row["title"]).strip()
        abstract_raw = row.get("abstract")
        abstract_str = str(abstract_raw).strip() if abstract_raw else None

        if not abstract_str and not self.allow_title_only:
            logger.warning(
                "Skipping paper_id=%s: abstract missing and allow_title_only=False",
                paper_id,
            )
            return None

        try:
            text_result = build_semantic_text(
                title=title,
                abstract=abstract_str,
                allow_title_only=self.allow_title_only,
            )
        except ValueError:
            logger.warning(
                "Text build failed for paper_id=%s: abstract missing",
                paper_id,
            )
            return None

        authors = row.get("authors")
        if authors is not None:
            if isinstance(authors, list):
                authors_json = json.dumps(authors, ensure_ascii=False)
            elif isinstance(authors, str):
                try:
                    authors_json = json.dumps(json.loads(authors), ensure_ascii=False)
                except json.JSONDecodeError:
                    authors_json = json.dumps([{"name": authors}], ensure_ascii=False)
            else:
                authors_json = None
        else:
            authors_json = None

        categories = row.get("categories")
        if categories is not None:
            if isinstance(categories, list):
                topics_json = json.dumps(categories, ensure_ascii=False)
            elif isinstance(categories, str):
                try:
                    topics_json = json.dumps(json.loads(categories), ensure_ascii=False)
                except json.JSONDecodeError:
                    topics_json = None
            else:
                topics_json = None
        else:
            topics_json = None

        published = row.get("published_date")
        updated = row.get("crawled_at")

        return GoldDocument(
            paper_id=paper_id,
            source="openalex",
            title=title,
            abstract=abstract_str,
            text=text_result.text,
            doi=str(row["doi"]) if row.get("doi") else None,
            authors_json=authors_json,
            publication_date=str(published) if published else None,
            updated_date=str(updated) if updated else None,
            primary_topic=str(row["primary_category"]) if row.get("primary_category") else None,
            topics_json=topics_json,
            source_content_hash=text_result.source_content_hash,
            silver_schema_version=silver_schema_version or GOLD_SCHEMA_VERSION,
        )

    def adapt_batch(
        self,
        rows: list[dict[str, Any]],
        silver_schema_version: Optional[str] = None,
    ) -> list[GoldDocument]:
        documents = []
        for row in rows:
            doc = self.adapt_row(row, silver_schema_version)
            if doc is not None:
                documents.append(doc)
        return documents
