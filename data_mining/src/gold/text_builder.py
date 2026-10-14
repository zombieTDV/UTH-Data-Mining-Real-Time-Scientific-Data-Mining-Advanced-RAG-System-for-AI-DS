import re
from dataclasses import dataclass
from typing import Optional

from src.gold.contracts import TEXT_BUILDER_VERSION, GoldDocument
from src.utils.hasher import compute_sha256


@dataclass
class TextBuildResult:
    text: str
    source_content_hash: str
    word_count: int
    char_count: int


def normalize_text_for_hash(text: str) -> str:
    normalized = text.strip().lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def build_semantic_text(
    title: str,
    abstract: Optional[str],
    allow_title_only: bool = False,
) -> TextBuildResult:
    title_clean = title.strip()
    if abstract and abstract.strip():
        body_lines = [f"Title: {title_clean}", "", "Abstract:", abstract.strip()]
        text = "\n".join(body_lines)
    elif allow_title_only:
        text = title_clean
    else:
        raise ValueError(
            f"Abstract is required for Gold indexing. "
            f"Title: '{title_clean[:80]}'"
        )

    normalized = normalize_text_for_hash(title_clean + "\n" + (abstract or ""))
    content_hash = compute_sha256(normalized)

    words = text.split()
    word_count = len(words)
    char_count = len(text)

    return TextBuildResult(
        text=text,
        source_content_hash=content_hash,
        word_count=word_count,
        char_count=char_count,
    )
