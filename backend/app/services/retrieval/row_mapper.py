from typing import List

from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto
from backend.app.services.retrieval.defaults import (
    DEFAULT_CATEGORY,
    DEFAULT_SCORE,
    DEFAULT_STR,
    DEFAULT_YEAR,
)


def build_source() -> str:
    return f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}"


def normalize_authors(raw_authors) -> List[str]:
    if hasattr(raw_authors, "tolist"):
        return [str(a) for a in raw_authors.tolist()]
    if isinstance(raw_authors, list):
        return [str(a) for a in raw_authors]
    if raw_authors:
        return [str(raw_authors)]
    return []


def resolve_year(value) -> int:
    return int(value) if value else DEFAULT_YEAR


def resolve_score(row) -> float:
    if "_score" in row:
        return float(row.get("_score", DEFAULT_SCORE))
    return DEFAULT_SCORE


def resolve_optional_str(value):
    return str(value) if value else None


def to_search_chunk(row) -> ChunkDto:
    return ChunkDto(
        chunk_id=str(row.get("chunk_id", DEFAULT_STR)),
        paper_id=str(row.get("paper_id", DEFAULT_STR)),
        title=str(row.get("title", DEFAULT_STR)),
        text=str(row.get("text", DEFAULT_STR)),
        abstract=str(row.get("abstract", DEFAULT_STR)) if row.get("abstract") else None,
        authors=normalize_authors(row.get("authors")),
        year=resolve_year(row.get("year")),
        primary_category=resolve_optional_str(row.get("primary_category")),
        section_title=resolve_optional_str(row.get("section_title")),
        score=resolve_score(row),
        source=build_source(),
    )


def to_paper_chunk(row) -> ChunkDto:
    return ChunkDto(
        chunk_id=str(row.get("chunk_id", DEFAULT_STR)),
        paper_id=str(row.get("paper_id", DEFAULT_STR)),
        title=str(row.get("title", DEFAULT_STR)),
        text=str(row.get("text", DEFAULT_STR)),
        primary_category=str(row.get("primary_category", DEFAULT_CATEGORY)),
        section_title=str(row.get("section_title", DEFAULT_CATEGORY)),
        source=build_source(),
    )
