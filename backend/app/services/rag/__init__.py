from backend.app.services.rag.service import RagService, rag_service
from backend.app.services.rag.citations import build_citation, extract_citations
from backend.app.services.rag.context import build_context_text, format_chunk_context
from backend.app.services.rag.fallback import build_offline_answer, resolve_answer
from backend.app.services.rag.prompt import SYSTEM_PROMPT, build_messages, build_user_prompt
from backend.app.services.rag.response import (
    build_answer_response,
    build_no_match_response,
    format_top_score,
)
from backend.app.services.rag.retrieval import build_search_request, fetch_chunks
