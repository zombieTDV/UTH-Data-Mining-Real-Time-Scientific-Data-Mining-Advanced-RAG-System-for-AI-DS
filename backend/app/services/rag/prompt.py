from typing import List

from backend.app.schemas.chat import ChatRequest
from backend.app.services.rag.context import build_context_text

SYSTEM_PROMPT = (
    "You are an expert scientific researcher and academic AI assistant specializing in Machine Learning and Computer Science.\n"
    "Your task is to answer the user question accurately, thoroughly, and comprehensively based strictly on the retrieved scientific literature below.\n\n"
    "Rules:\n"
    "1. Ground your answer in the provided paper excerpts.\n"
    "2. Always cite specific papers using [Paper: {paper_id}] when discussing methods, formulas, or results.\n"
    "3. If multiple papers discuss related concepts, synthesize and compare their approaches.\n"
    "4. If the retrieved literature does not contain sufficient details to address the question, clearly state the limitation.\n"
    "5. Maintain an objective, formal academic tone."
)


def build_user_prompt(context_text: str, query: str) -> str:
    return (
        f"Retrieved Scientific Context:\n"
        f"{context_text}\n\n"
        f"User Question: {query}"
    )


def build_messages(req: ChatRequest, chunks) -> List[dict]:
    context_text = build_context_text(chunks)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(context_text, req.query)},
    ]
