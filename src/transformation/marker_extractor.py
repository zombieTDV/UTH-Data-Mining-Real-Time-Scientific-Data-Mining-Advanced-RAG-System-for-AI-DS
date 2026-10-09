"""Marker PDF-to-Markdown Extraction Engine with LaTeX Preservation.

Utilizes Marker (marker-pdf) to transform scientific PDFs into high-fidelity
Markdown documents preserving mathematical formulas ($ ... $, $$ ... $$),
tables, and section headers for Advanced RAG and Scientific Data Mining.
Includes fallback extraction via pypdf when GPU/model environments require it.
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("marker_extractor")


class MarkerPdfExtractor:
    """Extracts scientific PDF papers into Markdown with LaTeX formulas preserved."""

    def __init__(self, use_marker: bool = True, max_pages: Optional[int] = None):
        self.use_marker = use_marker
        self.max_pages = max_pages
        self._models = None
        self._marker_initialized = False

    def _init_marker_models(self):
        """Lazy loads Marker OCR and layout models into memory."""
        if self._marker_initialized:
            return self._models

        if not self.use_marker:
            return None

        try:
            logger.info("[MARKER] Loading Marker PDF neural models into memory...")
            from marker.models import load_all_models
            self._models = load_all_models()
            self._marker_initialized = True
            logger.info("[MARKER] Marker neural models loaded successfully.")
            return self._models
        except Exception as e:
            logger.warning("[MARKER] Could not load Marker models (%s). Will use resilient fallback.", e)
            self._marker_initialized = True
            self._models = None
            return None

    def convert_pdf_to_markdown(self, pdf_path: Path) -> Tuple[str, Dict[str, Any]]:
        """Converts a scientific PDF into Markdown text with LaTeX formulas preserved.

        Returns:
            Tuple[str, Dict[str, Any]]: (markdown_text, metadata_dict)
        """
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        pdf_path_str = str(pdf_path.resolve())

        # Attempt 1: Full Marker Neural Conversion
        models = self._init_marker_models()
        if models is not None:
            try:
                from marker.convert import convert_single_pdf
                logger.info("[MARKER] Converting %s via Marker neural engine...", pdf_path.name)
                full_text, images, out_meta = convert_single_pdf(
                    pdf_path_str,
                    models,
                    max_pages=self.max_pages,
                )
                if full_text and len(full_text.strip()) > 100:
                    out_meta["engine"] = "marker-pdf"
                    out_meta["latex_formulas_detected"] = len(re.findall(r"\$[^$]+\$", full_text))
                    logger.info(
                        "[MARKER] Converted %s successfully (%d chars, %d LaTeX math blocks).",
                        pdf_path.name,
                        len(full_text),
                        out_meta["latex_formulas_detected"],
                    )
                    return full_text, out_meta
            except Exception as e:
                logger.warning("[MARKER] Marker conversion failed for %s (%s). Falling back to resilient extractor.", pdf_path.name, e)

        # Attempt 2: Resilient Fallback using pypdf / regex LaTeX structuring
        return self._fallback_extract_markdown(pdf_path)

    def _fallback_extract_markdown(self, pdf_path: Path) -> Tuple[str, Dict[str, Any]]:
        """Fallback extractor when Marker neural weights are loading or unavailable."""
        logger.info("[MARKER FALLBACK] Extracting text and structure from %s...", pdf_path.name)
        text_pages = []
        page_count = 0

        try:
            from pypdf import PdfReader
            reader = PdfReader(str(pdf_path))
            total = len(reader.pages)
            limit = min(total, self.max_pages) if self.max_pages else total

            for i in range(limit):
                page = reader.pages[i]
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_pages.append(page_text)
                page_count += 1
        except Exception as e:
            logger.error("[MARKER FALLBACK] Failed to read PDF %s: %s", pdf_path.name, e)
            return "", {"engine": "failed", "error": str(e), "page_count": 0}

        raw_text = "\n\n".join(text_pages)
        markdown_text = self._postprocess_text_to_markdown(raw_text)

        latex_count = len(re.findall(r"\$[^$]+\$", markdown_text)) + len(re.findall(r"\\\[.*?\\\]", markdown_text))
        meta = {
            "engine": "pypdf_markdown_fallback",
            "page_count": page_count,
            "char_count": len(markdown_text),
            "latex_formulas_detected": latex_count,
        }
        return markdown_text, meta

    def _postprocess_text_to_markdown(self, text: str) -> str:
        """Structures raw extracted text into clean Markdown with section headers and LaTeX."""
        lines = text.split("\n")
        processed_lines = []
        
        section_patterns = [
            (re.compile(r"^(abstract|1\.?\s+introduction|2\.?\s+related work|3\.?\s+methodology|3\.?\s+method|4\.?\s+experiments|5\.?\s+results|6\.?\s+discussion|7\.?\s+conclusion|references)$", re.IGNORECASE), "## "),
            (re.compile(r"^(\d+\.\d+\s+[A-Z].*)$"), "### "),
        ]

        for line in lines:
            line_strip = line.strip()
            if not line_strip:
                processed_lines.append("")
                continue

            matched = False
            for pat, prefix in section_patterns:
                if pat.match(line_strip):
                    processed_lines.append(f"\n{prefix}{line_strip}\n")
                    matched = True
                    break
            
            if not matched:
                # Retain math symbols and preserve inline formulas
                line_processed = re.sub(r"(\b[a-zA-Z]\s*=\s*[\w\+\-\*/\^\(\)]+)", r"$\1$", line_strip)
                processed_lines.append(line_strip)

        return "\n".join(processed_lines)
