import asyncio
import json
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.services.rag_service import rag_service

router = APIRouter(tags=["RAG & Chat"])


@router.post("/chat", response_model=ChatResponse)
async def rag_chat(req: ChatRequest):
    """Executes grounded RAG query synthesis returning the full answer with citations."""
    return await asyncio.to_thread(rag_service.answer_query, req)


@router.post("/chat/stream")
async def rag_chat_stream(req: ChatRequest):
    """Executes grounded RAG query streaming tokens in real-time via Server-Sent Events (SSE)."""
    async def event_generator():
        async for item in rag_service.answer_query_stream(req):
            if isinstance(item, dict):
                yield {"event": "meta", "data": json.dumps(item)}
            else:
                yield {"event": "token", "data": json.dumps({"token": item})}
        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(event_generator())
