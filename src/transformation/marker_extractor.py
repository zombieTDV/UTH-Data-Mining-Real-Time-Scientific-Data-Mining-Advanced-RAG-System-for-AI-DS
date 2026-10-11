"""Marker PDF-to-Markdown Extraction Engine with LaTeX Preservation.

Utilizes Marker (marker-pdf) to transform scientific PDFs into high-fidelity
Markdown documents preserving mathematical formulas ($ ... $, $$ ... $$),
tables, and section headers for Advanced RAG and Scientific Data Mining.
Includes fallback extraction via pypdf when GPU/model environments require it.
"""

import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import torch
except ImportError:
    torch = None

logger = logging.getLogger("marker_extractor")
_MARKER_GPU_LOCK = threading.Lock()


class MarkerPdfExtractor:
    """Extracts scientific PDF papers into Markdown with LaTeX formulas preserved."""

    def __init__(self, use_marker: bool = True, max_pages: Optional[int] = None):
        self.use_marker = use_marker
        self.max_pages = max_pages
        self._converter = None
        self._marker_initialized = False

    def _init_marker_models(self):
        """Lazy loads Marker OCR and layout models into memory on GPU."""
        if self._marker_initialized:
            return self._converter

        if not self.use_marker:
            return None

        try:
            # Decouple external Docker spawns from Surya/Marker
            os.environ["SURYA_INFERENCE_AUTOSTART"] = "false"
            if "PYTORCH_CUDA_ALLOC_CONF" not in os.environ:
                os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:128"

            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            logger.info("[MARKER] Loading Marker 2.0 neural models onto %s (dtype=%s)...", device, dtype)
            from marker.models import create_model_dict
            from marker.converters.pdf import PdfConverter

            model_dict = create_model_dict(device=device, dtype=dtype)
            self._converter = PdfConverter(
                artifact_dict=model_dict,
                config={"mode": "fast", "disable_ocr": True}
            )
            self._marker_initialized = True
            logger.info("[MARKER] Marker 2.0 neural models initialized on %s (pure GPU/digital mode).", device)
            return self._converter
        except Exception as e:
            logger.warning("[MARKER] Could not load Marker models (%s). Will use resilient fallback.", e)
            self._marker_initialized = True
            self._converter = None
            return None

    def convert_pdf_to_markdown(self, pdf_path: Path) -> Tuple[str, Dict[str, Any]]:
        """Converts a scientific PDF into Markdown text with LaTeX formulas preserved.

        Returns:
            Tuple[str, Dict[str, Any]]: (markdown_text, metadata_dict)
        """
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        # Strict PDF validation to prevent PDFium data format errors on HTML responses
        try:
            with open(pdf_path, "rb") as pf:
                header = pf.read(1024)
            if not header.startswith(b"%PDF"):
                logger.warning("[MARKER] %s does not start with %%PDF. Falling back to resilient extractor.", pdf_path.name)
                return self._fallback_extract_markdown(pdf_path)
            if b"<!DOCTYPE" in header.upper() or b"<HTML" in header.upper():
                logger.warning("[MARKER] %s is HTML masquerading as PDF. Falling back to resilient extractor.", pdf_path.name)
                return self._fallback_extract_markdown(pdf_path)
        except Exception:
            pass

        pdf_path_str = str(pdf_path.resolve())

        # Attempt 1: Full Marker Neural Conversion on GPU
        converter = self._init_marker_models()
        if converter is not None:
            try:
                from marker.output import text_from_rendered
                from pypdf import PdfReader

                # Dynamically cap Marker neural processing to max_pages (default 15)
                # only if the document exceeds max_pages (e.g. 300+ page dissertations)
                doc_len = None
                try:
                    with open(pdf_path, "rb") as pf:
                        reader = PdfReader(pf)
                        doc_len = len(reader.pages)
                except Exception:
                    pass

                max_p = self.max_pages if self.max_pages else 15
                if doc_len and doc_len > max_p:
                    converter.config["page_range"] = list(range(max_p))
                    logger.info(
                        "[MARKER GPU] Converting %s (capped to pages 1-%d of %d) via Marker neural engine...",
                        pdf_path.name,
                        max_p,
                        doc_len,
                    )
                else:
                    converter.config["page_range"] = None
                    logger.info(
                        "[MARKER GPU] Converting %s (%d pages) via Marker neural engine...",
                        pdf_path.name,
                        doc_len if doc_len is not None else 0,
                    )

                with _MARKER_GPU_LOCK:
                    rendered = converter(pdf_path_str)
                    full_text, _, images = text_from_rendered(rendered)
                if full_text and len(full_text.strip()) > 100:
                    cleaned_text = self._sanitize_math_and_text(full_text)
                    latex_count = len(re.findall(r"\$[^$]+\$|\$\$[^$]+\$\$", cleaned_text))
                    out_meta = {
                        "engine": "marker-pdf-cuda" if (torch and torch.cuda.is_available()) else "marker-pdf-cpu",
                        "latex_formulas_detected": latex_count,
                        "char_count": len(cleaned_text),
                    }
                    logger.info(
                        "[MARKER GPU] Converted %s successfully (%d chars, %d LaTeX math blocks).",
                        pdf_path.name,
                        len(cleaned_text),
                        latex_count,
                    )
                    return cleaned_text, out_meta
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
            with open(pdf_path, "rb") as f:
                reader = PdfReader(f)
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
        markdown_text = self._sanitize_math_and_text(markdown_text)

        latex_count = len(re.findall(r"\$[^$]+\$|\$\$[^$]+\$\$|\\\[.*?\\\]", markdown_text))
        meta = {
            "engine": "pypdf_markdown_fallback",
            "page_count": page_count,
            "char_count": len(markdown_text),
            "latex_formulas_detected": latex_count,
        }
        return markdown_text, meta

    def _sanitize_math_and_text(self, text: str) -> str:
        """Sanitizes text to prevent math pollution and OCR artifacts in downstream chunks."""
        # 1. Ligature Normalization
        ligatures = {
            "\ufb00": "ff",
            "\ufb01": "fi",
            "\ufb02": "fl",
            "\ufb03": "ffi",
            "\ufb04": "ffl",
            "\ufb05": "ft",
            "\ufb06": "st",
        }
        for lig, repl in ligatures.items():
            text = text.replace(lig, repl)

        # 2. Strip running headers / footers / preprint watermarks
        header_patterns = [
            r"^arXiv:\d+\.\d+v?\d*(?:\s*\[[\w\.\-]+\])?.*$",
            r"^(?:Preprint\.\s*Under review|Under review as a conference paper).*$",
            r"^(?:Published as a conference paper at|Proceedings of the ).*$",
            r"^(?:Page \d+(?: of \d+)?|\d+\s*/\s*\d+)$",
        ]
        clean_lines = []
        for line in text.split("\n"):
            line_str = line.strip()
            if any(re.match(p, line_str, re.IGNORECASE) for p in header_patterns):
                continue
            clean_lines.append(line)
        cleaned = "\n".join(clean_lines)

        # 3. Clean up non-printable control chars (except newline and tab)
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", cleaned)

        # 4. Collapse 3+ newlines
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

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
                processed_lines.append(line_processed)

        return "\n".join(processed_lines)
