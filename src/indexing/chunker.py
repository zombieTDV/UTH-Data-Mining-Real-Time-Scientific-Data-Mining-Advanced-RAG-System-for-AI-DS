"""Domain-Aware Deep Section Chunking with Contextual Enrichment for Scientific Papers.

Preserves academic section boundaries, recognizes LaTeX and markdown headings,
and prepends paper-level metadata to prevent context loss during vector retrieval.
Supports multi-granular sectioning across Abstract, Methodology, Experiments, and Body parts.
"""

import json
import math
import re
from typing import Any, Dict, List, Optional

_SENT_END = re.compile(r"[.!?][\"')\]]*$")
_NOT_SENT_END = {"e.g.", "i.e.", "al.", "etc.", "vs.", "cf.", "fig.", "figs.", "eq.", "eqs.", "sec.", "no.", "dr.", "mr.", "ms."}


class AcademicChunker:
    """Chunks academic papers respecting section boundaries with contextual enrichment."""

    def __init__(
        self,
        max_chunk_words: int = 300,
        overlap_ratio: float = 0.15,
        min_overlap_words: int = 20,
        max_overlap_words: int = 80,
        min_tail_ratio: float = 0.4,
    ):
        self.max_chunk_words = max_chunk_words
        self.overlap_ratio = overlap_ratio
        self.min_overlap_words = min_overlap_words
        self.max_overlap_words = max_overlap_words
        self.min_tail_ratio = min_tail_ratio

    def _overlap_for(self, chunk_len: float) -> int:
        """Overlap = overlap_ratio of the actual chunk length, clamped to [min_overlap_words, max_overlap_words]."""
        return int(min(self.max_overlap_words, max(self.min_overlap_words, round(self.overlap_ratio * chunk_len))))

    @staticmethod
    def _sentence_starts(words: List[str]) -> List[int]:
        """Word indices that begin a sentence (the previous token ends with . ! or ?, not an abbreviation)."""
        starts = []
        for i in range(1, len(words)):
            prev = words[i - 1]
            if (_SENT_END.search(prev) and prev.lower() not in _NOT_SENT_END
                    and not re.fullmatch(r"[A-Z]\.|\d{1,2}\.", prev)):
                starts.append(i)
        return starts

    @staticmethod
    def _snap(target: int, lo: int, hi: int, bounds: List[int]) -> int:
        """Nearest sentence boundary to target inside [lo, hi]; target clipped to [lo, hi] when there is none."""
        best = None
        for b in bounds:
            if lo <= b <= hi and (best is None or abs(b - target) < abs(best - target)):
                best = b
        return best if best is not None else min(hi, max(lo, target))

    def split_words(self, words: List[str]) -> List[List[str]]:
        """Split a long section into balanced, overlapping windows cut at sentence boundaries.

        1. Balanced: pick the smallest n windows that cover the section, then space them evenly so every
           window has about the same length (no near-duplicate tail window).
        2. Overlap is overlap_ratio of that window length (clamped), not a fixed word count.
        3. Window starts and ends snap to the nearest sentence boundary within a tolerance.
        4. A last window shorter than min_tail_ratio * max_chunk_words is merged into the previous one
           when the result still fits in max_chunk_words.
        """
        L, S = len(words), self.max_chunk_words
        if L <= S:
            return [words]

        n = max(2, math.ceil((L - self.overlap_ratio * S) / (S - self.overlap_ratio * S)))
        while True:
            c0 = L / (n - self.overlap_ratio * (n - 1))
            o = self._overlap_for(c0)
            c = math.ceil((L + (n - 1) * o) / n)
            if c <= S:
                break
            n += 1

        bounds = self._sentence_starts(words)
        tol = max(5, o // 2)
        stride = (L - c) / (n - 1)
        spans = []
        s_prev, e_prev = None, None
        for k in range(n):
            s_ideal = round(k * stride)
            e_ideal = L if k == n - 1 else s_ideal + c
            if k == 0:
                s = 0
            else:
                lo = max(s_prev + 1, s_ideal - tol, L - S if k == n - 1 else 0)
                hi = min(s_ideal + tol, e_prev - self.min_overlap_words)
                s = self._snap(s_ideal, lo, max(lo, hi), bounds)
            if k == n - 1:
                e = L
            else:
                e = self._snap(e_ideal, max(s + 1, e_ideal - tol), min(e_ideal + tol, s + S, L), bounds)
            spans.append((s, e))
            s_prev, e_prev = s, e

        if len(spans) > 1:
            (ps, _), (ls, le) = spans[-2], spans[-1]
            if le - ls < self.min_tail_ratio * S and le - ps <= S:
                spans[-2:] = [(ps, le)]
        return [words[s:e] for s, e in spans]

    @staticmethod
    def _parse_year(published_date: Any) -> Optional[int]:
        """Publication year from a Silver `published_date` string (e.g. "2021-06-17T..."), None when absent."""
        m = re.search(r"(?:19|20)\d{2}", str(published_date or ""))
        return int(m.group(0)) if m else None

    def chunk_paper(self, paper_record: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Splits an academic paper record into rich multi-section contextual chunks."""
        paper_id = str(paper_record.get("paper_id", "")).strip()
        title = str(paper_record.get("title", "")).strip()
        abstract = str(paper_record.get("abstract", "")).strip()
        full_text = str(paper_record.get("clean_full_text", "")).strip()
        
        authors = paper_record.get("authors", [])
        if hasattr(authors, "tolist"):
            authors = authors.tolist()
        elif not isinstance(authors, list):
            authors = [str(authors)]
            
        primary_category = str(paper_record.get("primary_category", "cs.AI")).strip()
        year = self._parse_year(paper_record.get("published_date"))
        source = str(paper_record.get("source", "arxiv")).strip()
        tier = str(paper_record.get("tier", "tier2")).strip()
        content_origin = str(paper_record.get("content_origin", "academic")).strip()

        chunks: List[Dict[str, Any]] = []

        # 1. Authoritative Top-Level Abstract Chunk
        if abstract:
            chunks.append({
                "chunk_id": f"{paper_id}_abs",
                "paper_id": paper_id,
                "title": title,
                "authors": authors,
                "primary_category": primary_category,
                "year": year,
                "section_title": "Abstract",
                "section_type": "abstract",
                "text": abstract,
                "context_text": f"Paper: \"{title}\" | Section: Abstract\n\n{abstract}",
                "word_count": len(abstract.split()),
                "source": source,
                "tier": tier,
                "content_origin": content_origin,
            })

        # 2. Structured Sections from sections_json (if available)
        raw_sections = paper_record.get("sections_json", "[]")
        sections = []
        if isinstance(raw_sections, str) and raw_sections.strip() not in ("", "[]"):
            try:
                sections = json.loads(raw_sections)
            except Exception:
                sections = []
        elif isinstance(raw_sections, list):
            sections = raw_sections

        has_structured = False
        if sections:
            for s_idx, sec in enumerate(sections):
                sec_title = sec.get("section_title") or sec.get("title") or f"Section {s_idx + 1}"
                sec_content = (sec.get("content") or sec.get("text") or "").strip()
                if sec_content == abstract or len(sec_content.split()) < 25:
                    continue
                has_structured = True
                sec_type = sec.get("section_type", "body")
                words = sec_content.split()

                if len(words) <= self.max_chunk_words:
                    chunks.append({
                        "chunk_id": f"{paper_id}_sec{s_idx}",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_category,
                        "year": year,
                        "section_title": sec_title,
                        "section_type": sec_type,
                        "text": sec_content,
                        "context_text": f"Paper: \"{title}\" | Section: {sec_title} ({sec_type.upper()})\n\n{sec_content}",
                        "word_count": len(words),
                        "source": source,
                        "tier": tier,
                        "content_origin": content_origin,
                    })
                else:
                    for part, sub_words in enumerate(self.split_words(words), start=1):
                        sub_text = " ".join(sub_words)
                        chunks.append({
                            "chunk_id": f"{paper_id}_sec{s_idx}_p{part}",
                            "paper_id": paper_id,
                            "title": title,
                            "authors": authors,
                            "primary_category": primary_category,
                            "year": year,
                            "section_title": f"{sec_title} (Part {part})",
                            "section_type": sec_type,
                            "text": sub_text,
                            "context_text": f"Paper: \"{title}\" | Section: {sec_title} (Part {part})\n\n{sub_text}",
                            "word_count": len(sub_words),
                            "source": source,
                            "tier": tier,
                            "content_origin": content_origin,
                        })

        # 3. Heading-Aware & Paragraph Chunks from clean_full_text
        body_text = full_text
        if abstract and abstract in body_text:
            body_text = body_text.replace(abstract, "").strip()
        if title and title in body_text:
            body_text = body_text.replace(f"Title: {title}", "").strip()

        body_words = body_text.split()
        if not has_structured and len(body_words) >= 40:
            heading_pattern = r"(?:^|\n\n)(?:\d+\.?\s+|[I|V|X]+\.?\s+)?(Introduction|Background|Related Work|Methodology|Method|Proposed Method|Architecture|Experiments|Experimental Results|Results|Discussion|Conclusion|Conclusions|Implementation Details|Ablation Studies)"
            splits = re.split(heading_pattern, body_text, flags=re.IGNORECASE)

            if len(splits) > 2:
                i = 1
                while i < len(splits):
                    h_name = splits[i].strip()
                    h_content = splits[i + 1].strip() if i + 1 < len(splits) else ""
                    i += 2
                    h_words = h_content.split()
                    if len(h_words) < 20:
                        continue
                    clean_h_title = h_name.title()
                    if len(h_words) <= self.max_chunk_words:
                        chunks.append({
                            "chunk_id": f"{paper_id}_{h_name.lower()[:6]}_{len(chunks)}",
                            "paper_id": paper_id,
                            "title": title,
                            "authors": authors,
                            "primary_category": primary_category,
                            "year": year,
                            "section_title": clean_h_title,
                            "section_type": "section",
                            "text": h_content,
                            "context_text": f"Paper: \"{title}\" | Section: {clean_h_title}\n\n{h_content}",
                            "word_count": len(h_words),
                            "source": source,
                            "tier": tier,
                            "content_origin": content_origin,
                        })
                    else:
                        for part, sub_words in enumerate(self.split_words(h_words), start=1):
                            sub_text = " ".join(sub_words)
                            chunks.append({
                                "chunk_id": f"{paper_id}_{h_name.lower()[:6]}_p{part}_{len(chunks)}",
                                "paper_id": paper_id,
                                "title": title,
                                "authors": authors,
                                "primary_category": primary_category,
                                "year": year,
                                "section_title": f"{clean_h_title} (Part {part})",
                                "section_type": "section",
                                "text": sub_text,
                                "context_text": f"Paper: \"{title}\" | Section: {clean_h_title} (Part {part})\n\n{sub_text}",
                                "word_count": len(sub_words),
                                "source": source,
                                "tier": tier,
                                "content_origin": content_origin,
                            })
            else:
                # Sliding-window paragraph chunks for papers without distinct heading strings
                for part, sub_words in enumerate(self.split_words(body_words), start=1):
                    sub_text = " ".join(sub_words)
                    chunks.append({
                        "chunk_id": f"{paper_id}_body_p{part}",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_category,
                        "year": year,
                        "section_title": f"Main Body (Part {part})",
                        "section_type": "body",
                        "text": sub_text,
                        "context_text": f"Paper: \"{title}\" | Section: Body Content (Part {part})\n\n{sub_text}",
                        "word_count": len(sub_words),
                        "source": source,
                        "tier": tier,
                        "content_origin": content_origin,
                    })

        # 4. Multi-Granular Semantic Slicing for Abstract-Only Papers (if abstract is long)
        abs_words = abstract.split()
        if len(chunks) == 1 and len(abs_words) >= 160:
            mid = len(abs_words) // 2
            p1_words = abs_words[:mid + 20]
            p2_words = abs_words[mid - 20:]
            p1_text = " ".join(p1_words)
            p2_text = " ".join(p2_words)

            chunks.append({
                "chunk_id": f"{paper_id}_abs_p1",
                "paper_id": paper_id,
                "title": title,
                "authors": authors,
                "primary_category": primary_category,
                "year": year,
                "section_title": "Abstract: Problem & Context",
                "section_type": "abstract_problem",
                "text": p1_text,
                "context_text": f"Paper: \"{title}\" | Section: Abstract (Problem Formulation & Context)\n\n{p1_text}",
                "word_count": len(p1_words),
                "source": source,
                "tier": tier,
                "content_origin": content_origin,
            })
            chunks.append({
                "chunk_id": f"{paper_id}_abs_p2",
                "paper_id": paper_id,
                "title": title,
                "authors": authors,
                "primary_category": primary_category,
                "year": year,
                "section_title": "Abstract: Methodology & Results",
                "section_type": "abstract_methodology",
                "text": p2_text,
                "context_text": f"Paper: \"{title}\" | Section: Abstract (Proposed Methodology & Findings)\n\n{p2_text}",
                "word_count": len(p2_words),
                "source": source,
                "tier": tier,
                "content_origin": content_origin,
            })

        return chunks
