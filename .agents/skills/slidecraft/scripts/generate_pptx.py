#!/usr/bin/env python3
"""
SlideCraft — PPTX Generator
Generates styled PowerPoint presentations using python-pptx.
Maps the 12 curated visual themes to PPTX-compatible styling.

Usage (as a library — called by the AI skill):
    from generate_pptx import PptxGenerator
    gen = PptxGenerator(theme="neon-cyber")
    gen.add_title_slide("My Presentation", "Subtitle here")
    gen.add_content_slide("Slide Title", ["Point 1", "Point 2", "Point 3"])
    gen.save("output.pptx")

Usage (standalone):
    python generate_pptx.py --theme bold-signal --output demo.pptx --demo
"""

import argparse
import json
import sys
import os
import base64
import io
from dataclasses import dataclass, field
from typing import Optional

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn


# ============================================================
#  THEME DEFINITIONS
#  Maps the 12 SlideCraft themes to PPTX color/font specs
# ============================================================

@dataclass
class ThemeSpec:
    """Visual specification for a PPTX theme."""
    name: str
    display_name: str
    category: str  # dark / light / specialty

    # Colors (as hex strings without #)
    bg_primary: str
    bg_secondary: str
    text_primary: str
    text_secondary: str
    accent: str
    accent_secondary: str = ""

    # Fonts
    font_display: str = "Calibri"
    font_body: str = "Calibri"

    # Sizes (in Pt)
    title_size: int = 44
    subtitle_size: int = 20
    heading_size: int = 32
    body_size: int = 18
    small_size: int = 14
    caption_size: int = 12

    # Layout
    dark_mode: bool = True


THEMES: dict[str, ThemeSpec] = {
    "bold-signal": ThemeSpec(
        name="bold-signal", display_name="Bold Signal", category="dark",
        bg_primary="1A1A1A", bg_secondary="2D2D2D",
        text_primary="FFFFFF", text_secondary="BBBBBB",
        accent="FF5722", accent_secondary="FF8A65",
        font_display="Arial Black", font_body="Calibri",
        dark_mode=True,
    ),
    "electric-studio": ThemeSpec(
        name="electric-studio", display_name="Electric Studio", category="dark",
        bg_primary="0A0A0A", bg_secondary="1A1A2E",
        text_primary="FFFFFF", text_secondary="CCCCCC",
        accent="4361EE", accent_secondary="7B8CFF",
        font_display="Calibri", font_body="Calibri",
        dark_mode=True,
    ),
    "creative-voltage": ThemeSpec(
        name="creative-voltage", display_name="Creative Voltage", category="dark",
        bg_primary="0066FF", bg_secondary="1A1A2E",
        text_primary="FFFFFF", text_secondary="D0D0FF",
        accent="D4FF00", accent_secondary="0066FF",
        font_display="Calibri", font_body="Consolas",
        dark_mode=True,
    ),
    "dark-botanical": ThemeSpec(
        name="dark-botanical", display_name="Dark Botanical", category="dark",
        bg_primary="0F0F0F", bg_secondary="1A1A1A",
        text_primary="E8E4DF", text_secondary="9A9590",
        accent="D4A574", accent_secondary="E8B4B8",
        font_display="Georgia", font_body="Calibri",
        dark_mode=True,
    ),
    "notebook-tabs": ThemeSpec(
        name="notebook-tabs", display_name="Notebook Tabs", category="light",
        bg_primary="F8F6F1", bg_secondary="EEECE7",
        text_primary="1A1A1A", text_secondary="555555",
        accent="98D4BB", accent_secondary="C7B8EA",
        font_display="Georgia", font_body="Calibri",
        dark_mode=False,
    ),
    "pastel-geometry": ThemeSpec(
        name="pastel-geometry", display_name="Pastel Geometry", category="light",
        bg_primary="C8D9E6", bg_secondary="FAF9F7",
        text_primary="1A1A1A", text_secondary="555555",
        accent="F0B4D4", accent_secondary="A8D4C4",
        font_display="Calibri", font_body="Calibri",
        dark_mode=False,
    ),
    "split-pastel": ThemeSpec(
        name="split-pastel", display_name="Split Pastel", category="light",
        bg_primary="F5E6DC", bg_secondary="E4DFF0",
        text_primary="1A1A1A", text_secondary="555555",
        accent="C8F0D8", accent_secondary="F0D4E0",
        font_display="Calibri", font_body="Calibri",
        dark_mode=False,
    ),
    "vintage-editorial": ThemeSpec(
        name="vintage-editorial", display_name="Vintage Editorial", category="light",
        bg_primary="F5F3EE", bg_secondary="EBE8E2",
        text_primary="1A1A1A", text_secondary="555555",
        accent="E8D4C0", accent_secondary="D4C0A8",
        font_display="Georgia", font_body="Calibri",
        dark_mode=False,
    ),
    "neon-cyber": ThemeSpec(
        name="neon-cyber", display_name="Neon Cyber", category="specialty",
        bg_primary="0A0F1C", bg_secondary="111827",
        text_primary="FFFFFF", text_secondary="9CA3AF",
        accent="00FFCC", accent_secondary="FF00AA",
        font_display="Calibri", font_body="Calibri",
        dark_mode=True,
    ),
    "terminal-green": ThemeSpec(
        name="terminal-green", display_name="Terminal Green", category="specialty",
        bg_primary="0D1117", bg_secondary="161B22",
        text_primary="39D353", text_secondary="8B949E",
        accent="39D353", accent_secondary="58A6FF",
        font_display="Consolas", font_body="Consolas",
        dark_mode=True,
    ),
    "swiss-modern": ThemeSpec(
        name="swiss-modern", display_name="Swiss Modern", category="specialty",
        bg_primary="FFFFFF", bg_secondary="F0F0F0",
        text_primary="000000", text_secondary="333333",
        accent="FF3300", accent_secondary="FF3300",
        font_display="Arial Black", font_body="Calibri",
        dark_mode=False,
    ),
    "paper-ink": ThemeSpec(
        name="paper-ink", display_name="Paper & Ink", category="specialty",
        bg_primary="FAF9F7", bg_secondary="F0EDE8",
        text_primary="1A1A1A", text_secondary="555555",
        accent="C41E3A", accent_secondary="8B0000",
        font_display="Georgia", font_body="Georgia",
        dark_mode=False,
    ),
}


def hex_to_rgb(hex_str: str) -> RGBColor:
    """Convert hex string (without #) to RGBColor."""
    return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))


# ============================================================
#  PPTX GENERATOR
# ============================================================

class PptxGenerator:
    """Generates a themed PPTX presentation."""

    # Slide dimensions (16:9 widescreen)
    SLIDE_WIDTH = Inches(13.333)
    SLIDE_HEIGHT = Inches(7.5)

    def __init__(self, theme: str = "neon-cyber"):
        theme_key = theme.lower().replace(" ", "-").replace("_", "-")
        if theme_key not in THEMES:
            available = ", ".join(sorted(THEMES.keys()))
            raise ValueError(f"Unknown theme '{theme}'. Available: {available}")

        self.theme = THEMES[theme_key]
        self.prs = Presentation()
        self.prs.slide_width = self.SLIDE_WIDTH
        self.prs.slide_height = self.SLIDE_HEIGHT
        self.slide_count = 0

    # ----------------------------------------------------------
    #  Helpers
    # ----------------------------------------------------------

    def _set_bg(self, slide, color_hex: Optional[str] = None):
        """Set slide background color."""
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = hex_to_rgb(color_hex or self.theme.bg_primary)

    def _add_accent_bar(self, slide, position="top"):
        """Add a thin accent bar to the slide."""
        t = self.theme
        if position == "top":
            shape = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE,
                Inches(0), Inches(0),
                self.SLIDE_WIDTH, Pt(6)
            )
        elif position == "bottom":
            shape = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE,
                Inches(0), self.SLIDE_HEIGHT - Pt(6),
                self.SLIDE_WIDTH, Pt(6)
            )
        elif position == "left":
            shape = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE,
                Inches(0), Inches(0),
                Pt(6), self.SLIDE_HEIGHT
            )
        else:
            return
        shape.fill.solid()
        shape.fill.fore_color.rgb = hex_to_rgb(t.accent)
        shape.line.fill.background()

    def _add_slide_number(self, slide):
        """Add slide number in bottom-right corner."""
        t = self.theme
        txBox = slide.shapes.add_textbox(
            self.SLIDE_WIDTH - Inches(1.2), self.SLIDE_HEIGHT - Inches(0.6),
            Inches(1), Inches(0.4)
        )
        tf = txBox.text_frame
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.text = str(self.slide_count)
        p.alignment = PP_ALIGN.RIGHT
        p.font.size = Pt(t.caption_size)
        p.font.color.rgb = hex_to_rgb(t.text_secondary)
        p.font.name = t.font_body

    def _add_textbox(self, slide, left, top, width, height, text,
                     font_name=None, font_size=None, font_color=None,
                     bold=False, italic=False, alignment=PP_ALIGN.LEFT,
                     anchor=MSO_ANCHOR.TOP):
        """Add a styled textbox."""
        t = self.theme
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.vertical_anchor = anchor

        p = tf.paragraphs[0]
        p.text = text
        p.alignment = alignment
        p.font.name = font_name or t.font_body
        p.font.size = Pt(font_size or t.body_size)
        p.font.color.rgb = hex_to_rgb(font_color or t.text_primary)
        p.font.bold = bold
        p.font.italic = italic
        return txBox

    def _add_bullet_list(self, slide, left, top, width, height, items,
                         font_name=None, font_size=None, font_color=None,
                         bullet_color=None):
        """Add a bulleted list."""
        t = self.theme
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE

        for i, item in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = item
            p.font.name = font_name or t.font_body
            p.font.size = Pt(font_size or t.body_size)
            p.font.color.rgb = hex_to_rgb(font_color or t.text_primary)
            p.level = 0
            p.space_after = Pt(8)

            # Set bullet
            pPr = p._pPr
            if pPr is None:
                pPr = p._p.get_or_add_pPr()
            buNone = pPr.find(qn('a:buNone'))
            if buNone is not None:
                pPr.remove(buNone)
            buChar = pPr.makeelement(qn('a:buChar'), {'char': '●'})
            pPr.append(buChar)
            if bullet_color:
                buClr = pPr.makeelement(qn('a:buClr'), {})
                srgbClr = buClr.makeelement(qn('a:srgbClr'), {'val': bullet_color})
                buClr.append(srgbClr)
                pPr.append(buClr)

        return txBox

    def _add_decorative_shape(self, slide, shape_type, left, top, width, height,
                               fill_color=None, opacity=None, line=False):
        """Add a decorative shape element."""
        shape = slide.shapes.add_shape(shape_type, left, top, width, height)
        if fill_color:
            shape.fill.solid()
            shape.fill.fore_color.rgb = hex_to_rgb(fill_color)
        else:
            shape.fill.background()
        if not line:
            shape.line.fill.background()
        else:
            shape.line.color.rgb = hex_to_rgb(fill_color or self.theme.accent)
            shape.line.width = Pt(2)
        return shape

    # ----------------------------------------------------------
    #  Slide Builders
    # ----------------------------------------------------------

    def add_title_slide(self, title: str, subtitle: str = ""):
        """Add a title / cover slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])  # Blank
        self.slide_count += 1
        self._set_bg(slide)

        # Accent bar
        self._add_accent_bar(slide, "top")

        # Decorative accent shape
        if t.dark_mode:
            self._add_decorative_shape(
                slide, MSO_SHAPE.OVAL,
                self.SLIDE_WIDTH - Inches(4), Inches(0.5),
                Inches(3), Inches(3),
                fill_color=t.accent_secondary or t.accent
            )

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(2), Inches(10), Inches(2.5),
            title,
            font_name=t.font_display, font_size=t.title_size,
            font_color=t.text_primary, bold=True,
            alignment=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.BOTTOM
        )

        # Subtitle
        if subtitle:
            self._add_textbox(
                slide, Inches(1), Inches(4.6), Inches(10), Inches(1),
                subtitle,
                font_name=t.font_body, font_size=t.subtitle_size,
                font_color=t.text_secondary,
                alignment=PP_ALIGN.LEFT
            )

        # Bottom accent line
        self._add_accent_bar(slide, "bottom")

    def add_section_slide(self, section_number: str, title: str, subtitle: str = ""):
        """Add a section divider slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide, t.bg_secondary)

        # Large section number
        self._add_textbox(
            slide, Inches(1), Inches(1), Inches(4), Inches(2.5),
            section_number,
            font_name=t.font_display, font_size=72,
            font_color=t.accent, bold=True
        )

        # Section title
        self._add_textbox(
            slide, Inches(1), Inches(3.5), Inches(10), Inches(2),
            title,
            font_name=t.font_display, font_size=t.heading_size + 8,
            font_color=t.text_primary, bold=True
        )

        if subtitle:
            self._add_textbox(
                slide, Inches(1), Inches(5.5), Inches(10), Inches(1),
                subtitle,
                font_size=t.subtitle_size, font_color=t.text_secondary
            )

        self._add_accent_bar(slide, "left")

    def add_content_slide(self, title: str, bullets: list[str], subtitle: str = ""):
        """Add a standard content slide with bullet points."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide)

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(0.6), Inches(11), Inches(1),
            title,
            font_name=t.font_display, font_size=t.heading_size,
            font_color=t.text_primary, bold=True
        )

        # Subtitle / description
        top_offset = Inches(1.6)
        if subtitle:
            self._add_textbox(
                slide, Inches(1), top_offset, Inches(11), Inches(0.6),
                subtitle,
                font_size=t.small_size, font_color=t.text_secondary, italic=True
            )
            top_offset = Inches(2.2)

        # Accent underline below title
        slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(1), top_offset - Inches(0.15),
            Inches(2), Pt(3)
        ).fill.solid()
        slide.shapes[-1].fill.fore_color.rgb = hex_to_rgb(t.accent)
        slide.shapes[-1].line.fill.background()

        # Bullets
        self._add_bullet_list(
            slide, Inches(1), top_offset + Inches(0.2), Inches(11), Inches(4.5),
            bullets, bullet_color=t.accent
        )

        self._add_slide_number(slide)

    def add_two_column_slide(self, title: str, left_title: str, left_items: list[str],
                              right_title: str, right_items: list[str]):
        """Add a two-column comparison slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide)

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(0.6), Inches(11), Inches(1),
            title,
            font_name=t.font_display, font_size=t.heading_size,
            font_color=t.text_primary, bold=True
        )

        # Left column header
        self._add_textbox(
            slide, Inches(1), Inches(1.8), Inches(5), Inches(0.6),
            left_title,
            font_name=t.font_display, font_size=t.body_size + 2,
            font_color=t.accent, bold=True
        )
        self._add_bullet_list(
            slide, Inches(1), Inches(2.6), Inches(5), Inches(4),
            left_items, bullet_color=t.accent
        )

        # Divider line
        self._add_decorative_shape(
            slide, MSO_SHAPE.RECTANGLE,
            Inches(6.4), Inches(1.8), Pt(2), Inches(5),
            fill_color=t.text_secondary
        )

        # Right column header
        self._add_textbox(
            slide, Inches(7), Inches(1.8), Inches(5), Inches(0.6),
            right_title,
            font_name=t.font_display, font_size=t.body_size + 2,
            font_color=t.accent_secondary or t.accent, bold=True
        )
        self._add_bullet_list(
            slide, Inches(7), Inches(2.6), Inches(5), Inches(4),
            right_items, bullet_color=t.accent_secondary or t.accent
        )

        self._add_slide_number(slide)

    def add_quote_slide(self, quote: str, attribution: str = ""):
        """Add a quote / callout slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide, t.bg_secondary)

        # Large quote mark
        self._add_textbox(
            slide, Inches(1), Inches(1), Inches(2), Inches(2),
            "\u201C",
            font_name=t.font_display, font_size=120,
            font_color=t.accent, bold=True
        )

        # Quote text
        self._add_textbox(
            slide, Inches(1.5), Inches(2.5), Inches(10), Inches(3),
            quote,
            font_name=t.font_display, font_size=t.heading_size - 4,
            font_color=t.text_primary, italic=True,
            alignment=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.MIDDLE
        )

        # Attribution
        if attribution:
            self._add_textbox(
                slide, Inches(1.5), Inches(5.5), Inches(10), Inches(0.8),
                f"\u2014 {attribution}",
                font_size=t.subtitle_size, font_color=t.text_secondary,
                alignment=PP_ALIGN.LEFT
            )

        self._add_accent_bar(slide, "bottom")

    def add_metric_slide(self, title: str, metrics: list[tuple[str, str]]):
        """Add a metrics / big numbers slide. metrics = [(value, label), ...]"""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide)

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(0.6), Inches(11), Inches(1),
            title,
            font_name=t.font_display, font_size=t.heading_size,
            font_color=t.text_primary, bold=True,
            alignment=PP_ALIGN.CENTER
        )

        # Metrics
        count = len(metrics)
        col_width = 10 / max(count, 1)
        start_left = (13.333 - col_width * count) / 2

        for i, (value, label) in enumerate(metrics):
            left = Inches(start_left + i * col_width)

            # Big number
            self._add_textbox(
                slide, left, Inches(2.5), Inches(col_width), Inches(2),
                value,
                font_name=t.font_display, font_size=56,
                font_color=t.accent, bold=True,
                alignment=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.BOTTOM
            )
            # Label
            self._add_textbox(
                slide, left, Inches(4.8), Inches(col_width), Inches(1),
                label,
                font_size=t.body_size, font_color=t.text_secondary,
                alignment=PP_ALIGN.CENTER
            )

        self._add_slide_number(slide)

    def add_code_slide(self, title: str, code: str, language: str = ""):
        """Add a code block slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide)

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(0.6), Inches(11), Inches(1),
            title,
            font_name=t.font_display, font_size=t.heading_size,
            font_color=t.text_primary, bold=True
        )

        # Language badge
        if language:
            badge = slide.shapes.add_shape(
                MSO_SHAPE.ROUNDED_RECTANGLE,
                Inches(1), Inches(1.6), Inches(1.5), Inches(0.4)
            )
            badge.fill.solid()
            badge.fill.fore_color.rgb = hex_to_rgb(t.accent)
            badge.line.fill.background()
            badge_tf = badge.text_frame
            badge_tf.paragraphs[0].text = language
            badge_tf.paragraphs[0].font.size = Pt(11)
            badge_tf.paragraphs[0].font.bold = True
            badge_tf.paragraphs[0].font.color.rgb = hex_to_rgb(
                t.bg_primary if not t.dark_mode else "000000"
            )
            badge_tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            badge_tf.vertical_anchor = MSO_ANCHOR.MIDDLE

        # Code background
        code_bg_color = "1E1E1E" if t.dark_mode else "F5F5F5"
        code_text_color = "D4D4D4" if t.dark_mode else "333333"
        code_top = Inches(2.2) if language else Inches(1.8)

        code_shape = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(1), code_top,
            Inches(11.333), Inches(4.8)
        )
        code_shape.fill.solid()
        code_shape.fill.fore_color.rgb = hex_to_rgb(code_bg_color)
        code_shape.line.fill.background()

        # Code text
        self._add_textbox(
            slide, Inches(1.3), code_top + Inches(0.3),
            Inches(10.7), Inches(4.2),
            code,
            font_name="Consolas", font_size=14,
            font_color=code_text_color
        )

        self._add_slide_number(slide)

    def add_image_slide(self, title: str, image_path: str, caption: str = ""):
        """Add a slide with an image. image_path can be a file path."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide)

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(0.4), Inches(11), Inches(0.8),
            title,
            font_name=t.font_display, font_size=t.heading_size,
            font_color=t.text_primary, bold=True,
            alignment=PP_ALIGN.CENTER
        )

        # Image (centered, max 9" wide x 5" tall)
        if os.path.exists(image_path):
            pic = slide.shapes.add_picture(
                image_path,
                Inches(2.17), Inches(1.5),
                Inches(9), Inches(5)
            )
            # Maintain aspect ratio
            from PIL import Image as PILImage
            try:
                img = PILImage.open(image_path)
                w, h = img.size
                aspect = w / h
                max_w, max_h = 9, 5
                if aspect > max_w / max_h:
                    new_w = max_w
                    new_h = max_w / aspect
                else:
                    new_h = max_h
                    new_w = max_h * aspect
                pic.width = Inches(new_w)
                pic.height = Inches(new_h)
                pic.left = int((self.SLIDE_WIDTH - pic.width) / 2)
                pic.top = int((self.SLIDE_HEIGHT - pic.height) / 2)
            except ImportError:
                pass  # No PIL, use default sizing

        # Caption
        if caption:
            self._add_textbox(
                slide, Inches(1), Inches(6.8), Inches(11), Inches(0.5),
                caption,
                font_size=t.caption_size, font_color=t.text_secondary,
                italic=True, alignment=PP_ALIGN.CENTER
            )

        self._add_slide_number(slide)

    def add_closing_slide(self, title: str = "Thank You", subtitle: str = "",
                           contact: str = ""):
        """Add a closing / thank you slide."""
        t = self.theme
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide_count += 1
        self._set_bg(slide, t.bg_secondary)

        self._add_accent_bar(slide, "top")

        # Title
        self._add_textbox(
            slide, Inches(1), Inches(2), Inches(11), Inches(2),
            title,
            font_name=t.font_display, font_size=t.title_size,
            font_color=t.text_primary, bold=True,
            alignment=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.BOTTOM
        )

        if subtitle:
            self._add_textbox(
                slide, Inches(1), Inches(4.2), Inches(11), Inches(1),
                subtitle,
                font_size=t.subtitle_size, font_color=t.text_secondary,
                alignment=PP_ALIGN.CENTER
            )

        if contact:
            self._add_textbox(
                slide, Inches(1), Inches(5.5), Inches(11), Inches(1),
                contact,
                font_size=t.small_size, font_color=t.accent,
                alignment=PP_ALIGN.CENTER
            )

        self._add_accent_bar(slide, "bottom")

    # ----------------------------------------------------------
    #  Save
    # ----------------------------------------------------------

    def save(self, output_path: str):
        """Save the presentation to a file."""
        self.prs.save(output_path)
        size = os.path.getsize(output_path)
        print(f"Saved: {output_path} ({size:,} bytes, {self.slide_count} slides)")
        return output_path

    def get_theme_info(self) -> dict:
        """Return theme metadata."""
        t = self.theme
        return {
            "name": t.display_name,
            "category": t.category,
            "dark_mode": t.dark_mode,
            "font_display": t.font_display,
            "font_body": t.font_body,
            "accent": f"#{t.accent}",
            "slide_count": self.slide_count,
        }

    @staticmethod
    def list_themes() -> list[dict]:
        """List all available themes."""
        return [
            {
                "key": k,
                "name": v.display_name,
                "category": v.category,
                "dark_mode": v.dark_mode,
                "accent": f"#{v.accent}",
            }
            for k, v in THEMES.items()
        ]


# ============================================================
#  CLI / Demo
# ============================================================

def generate_demo(theme_name: str, output: str):
    """Generate a demo presentation showcasing all slide types."""
    gen = PptxGenerator(theme=theme_name)

    gen.add_title_slide(
        "SlideCraft Demo",
        f"Theme: {gen.theme.display_name} — Generated with python-pptx"
    )

    gen.add_section_slide("01", "Introduction", "What this tool can do")

    gen.add_content_slide(
        "Key Features",
        [
            "12 curated visual themes — dark, light, and specialty",
            "Zero dependencies — single file output",
            "Multiple slide types — content, comparison, code, metrics",
            "Works in PowerPoint, WPS, Google Slides, Keynote",
            "Fully customizable — edit colors, fonts, layout",
        ]
    )

    gen.add_two_column_slide(
        "HTML vs PPTX Output",
        "HTML Slides", [
            "Rich CSS animations",
            "Particle backgrounds",
            "Browser-based navigation",
            "Zero install to view",
        ],
        "PPTX Slides", [
            "Native PowerPoint editing",
            "Works offline everywhere",
            "Print-friendly format",
            "Enterprise-compatible",
        ]
    )

    gen.add_metric_slide(
        "By the Numbers",
        [("12", "Visual Themes"), ("8", "Slide Types"), ("0", "Dependencies")]
    )

    gen.add_quote_slide(
        "Every presentation should look designed, not generated.",
        "SlideCraft"
    )

    gen.add_code_slide(
        "Quick Start",
        'from generate_pptx import PptxGenerator\n\n'
        'gen = PptxGenerator(theme="neon-cyber")\n'
        'gen.add_title_slide("My Deck", "Subtitle")\n'
        'gen.add_content_slide("Topic", ["Point 1", "Point 2"])\n'
        'gen.save("output.pptx")',
        language="Python"
    )

    gen.add_closing_slide(
        "Thank You",
        "Start creating beautiful presentations today",
        "github.com/your-repo/slidecraft"
    )

    gen.save(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SlideCraft PPTX Generator")
    parser.add_argument("--theme", default="neon-cyber", help="Theme name")
    parser.add_argument("--output", "-o", default="presentation.pptx", help="Output file")
    parser.add_argument("--demo", action="store_true", help="Generate demo presentation")
    parser.add_argument("--list-themes", action="store_true", help="List available themes")

    args = parser.parse_args()

    if args.list_themes:
        themes = PptxGenerator.list_themes()
        print(f"{'Key':<22} {'Name':<22} {'Category':<12} {'Accent'}")
        print("-" * 70)
        for t in themes:
            print(f"{t['key']:<22} {t['name']:<22} {t['category']:<12} {t['accent']}")
    elif args.demo:
        generate_demo(args.theme, args.output)
    else:
        print("Use --demo to generate a demo, or --list-themes to see themes.")
        print("For programmatic use, import PptxGenerator.")
