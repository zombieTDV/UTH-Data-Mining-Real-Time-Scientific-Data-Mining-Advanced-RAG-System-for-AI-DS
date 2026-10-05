from typing import List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., examples=["What is the role of sampling z_t in conditional diffusion distillation?"])
    top_k: int = Field(5, ge=1, le=20)
    category: Optional[str] = Field(None)
    temperature: float = Field(0.7, ge=0.0, le=1.0)


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
