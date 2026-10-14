from typing import List
from pydantic import BaseModel, Field


class EdaOverview(BaseModel):
    total_papers: int
    enriched_html_papers: int
    enrichment_ratio: float
    total_math_formulas: int
    total_words: int
    avg_sections_per_paper: float
    avg_math_per_paper: float
    avg_words_per_paper: float
    earliest_publication: str
    latest_publication: str


class CategoryDistItem(BaseModel):
    category: str
    count: int
    percentage: float
    total_math_formulas: int
    avg_words: float


class TemporalDistItem(BaseModel):
    period: str
    count: int


class TopAuthorItem(BaseModel):
    author: str
    paper_count: int


class CategoryCooccurItem(BaseModel):
    category_a: str
    category_b: str
    cooccurrence_count: int


class EdaResponse(BaseModel):
    dataset_overview: EdaOverview
    category_distribution: List[CategoryDistItem]
    temporal_distribution: List[TemporalDistItem]
    math_and_content_stats: List[CategoryDistItem]
    top_authors: List[TopAuthorItem]
    category_cooccurrence: List[CategoryCooccurItem]
