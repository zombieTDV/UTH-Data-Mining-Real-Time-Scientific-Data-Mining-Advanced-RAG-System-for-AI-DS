from typing import List

from backend.app.schemas.chat import ChatRequest
from backend.app.schemas.search import ChunkDto, SearchRequest
from backend.app.services.rag.constants import DEFAULT_SEARCH_MODE, DEFAULT_TOP_K
from backend.app.services.retrieval import retrieval_service


def build_search_request(req: ChatRequest) -> SearchRequest:
    return SearchRequest(
        query=req.query,
        top_k=req.top_k or DEFAULT_TOP_K,
        category=req.category,
        mode=DEFAULT_SEARCH_MODE,
    )


def fetch_chunks(req: ChatRequest) -> List[ChunkDto]:
    return retrieval_service.search(build_search_request(req))
