import json
from dataclasses import dataclass
from typing import Optional

from src.rag.query_engine import RetrievedChunk


SYSTEM_PROMPT_TEMPLATE = (
    "You are an expert scientific researcher and academic AI assistant specializing in "
    "Machine Learning and Computer Science.\n"
    "Your task is to answer the user question accurately, thoroughly, and comprehensively "
    "based strictly on the retrieved scientific literature below.\n\n"
    "Rules:\n"
    "1. Ground your answer in the provided paper excerpts.\n"
    "2. Always cite specific papers using [Paper: {paper_id}] when discussing methods, "
    "formulas, or results.\n"
    "3. If multiple papers discuss related concepts, synthesize and compare their approaches.\n"
    "4. If the retrieved literature does not contain sufficient details to address the "
    "question, clearly state the limitation.\n"
    "5. Maintain an objective, formal academic tone."
)

USER_PROMPT_TEMPLATE = (
    "Retrieved Scientific Context:\n"
    "{context}\n\n"
    "User Question: {query}"
)

CITATION_TEMPLATE = "[Paper: {paper_id}]"


@dataclass
class BuiltPrompt:
    system: str
    user: str
    messages: list[dict]
    citations: list[str]
    context_chunks_used: int


class ScientificPromptBuilder:
    def __init__(
        self,
        system_template: Optional[str] = None,
        user_template: Optional[str] = None,
        citation_template: Optional[str] = None,
    ):
        self.system_template = system_template or SYSTEM_PROMPT_TEMPLATE
        self.user_template = user_template or USER_PROMPT_TEMPLATE
        self.citation_template = citation_template or CITATION_TEMPLATE

    def _format_citation(self, chunk: RetrievedChunk) -> str:
        paper_id = chunk.paper_id
        section = chunk.primary_topic or "Body"
        title = chunk.title or "Academic Paper"
        return f"[Paper ID: {paper_id} | Title: \"{title}\" | Section: {section}]"

    def _parse_authors(self, authors_json: str) -> list[str]:
        try:
            return json.loads(authors_json)
        except Exception:
            return []

    def _format_context_chunk(self, chunk: RetrievedChunk) -> str:
        header = self._format_citation(chunk)
        context = f"---\n{header}\n---\n{chunk.text}\n"
        return context

    def build(
        self,
        query: str,
        chunks: list[RetrievedChunk],
    ) -> BuiltPrompt:
        citations: list[str] = []
        context_parts: list[str] = []

        for chunk in chunks:
            cite = f"Paper: {chunk.paper_id}, Section: {chunk.primary_topic or 'Main Body'}"
            if cite not in citations:
                citations.append(cite)
            context_parts.append(self._format_context_chunk(chunk))

        context_text = "\n".join(context_parts)
        system_prompt = self.system_template
        user_prompt = self.user_template.format(context=context_text, query=query)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        return BuiltPrompt(
            system=system_prompt,
            user=user_prompt,
            messages=messages,
            citations=citations[:5],
            context_chunks_used=len(chunks),
        )
