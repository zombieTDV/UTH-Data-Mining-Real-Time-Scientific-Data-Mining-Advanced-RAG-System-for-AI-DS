from typing import List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., examples=["What is the role of sampling z_t in conditional diffusion distillation?"])
    top_k: int = Field(5, ge=1, le=20)
    category: Optional[str] = Field(None)
    temperature: float = Field(0.1, ge=0.0, le=1.0)
    use_pagerank: Optional[bool] = Field(True, description="Enable PageRank authority boost in retrieval and prompt")
    use_reranker: Optional[bool] = Field(None, description="Explicitly enable/disable cross-encoder reranker")
    retrieval_mode: Optional[str] = Field("hybrid", description="Retrieval mode: vector, fts, or hybrid")
    paper_ids: Optional[List[str]] = Field(None, description="Optional explicit paper IDs for targeted retrieval or fallback")


class ChatResponse(BaseModel):
    query: str
    answer: str
    citations: List[str]
    similarity_score: str
    generation_time: str
    context_chunks_used: int
    authority_boosted: Optional[bool] = None
    top_influencer_author: Optional[str] = None
    rule_expansions: Optional[List[str]] = None
    retrieval_context: Optional[List[str]] = None
