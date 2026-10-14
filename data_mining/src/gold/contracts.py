from dataclasses import dataclass, field
from typing import Optional


GOLD_SCHEMA_VERSION = "openalex-gold-v1"
TEXT_BUILDER_VERSION = "abstract-v1"


@dataclass(frozen=True)
class GoldDocument:
    paper_id: str
    source: str
    title: str
    abstract: Optional[str]
    text: str
    doi: Optional[str]
    authors_json: Optional[str]
    publication_date: Optional[str]
    updated_date: Optional[str]
    primary_topic: Optional[str]
    topics_json: Optional[str]
    source_content_hash: str
    silver_schema_version: str
    text_builder_version: str = TEXT_BUILDER_VERSION

    def has_abstract(self) -> bool:
        return self.abstract is not None and self.abstract.strip() != ""

    def content_hash_input(self) -> str:
        return f"{self.title}\n{self.abstract or ''}"

    def chunk_id(self, content_type: str = "abstract") -> str:
        return f"openalex:{self.paper_id}:{content_type}:{self.text_builder_version}"
