# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2025-04-09

### Added

- **PPTX output format** — Generate PowerPoint-compatible presentations via `python-pptx`
  - `scripts/generate_pptx.py` — Full PPTX generator with 12 themed color/font mappings
  - 9 slide type builders: title, section, content, two-column, quote, metric, code, image, closing
  - CLI support: `--demo`, `--list-themes`, `--theme`, `--output`
  - Standalone Python module — can be used independently of the skill
- **Format selection** in workflow — user can choose HTML, PPTX, or both
- **Format comparison table** in SKILL.md — helps user pick the right format
- **PPTX API documentation** in README — slide types, usage examples, CLI commands

### Changed

- **SKILL.md** — Restructured Phase 3 into Path A (HTML) / Path B (PPTX) / Path C (Both)
- **description** — Updated to include PPTX-related trigger words (PPT, PowerPoint, 编辑)
- **README.md** — Expanded with dual-format documentation, PPTX API reference, CLI usage

## [1.0.0] - 2025-04-09

### Added

- **12 curated visual themes** — 4 dark, 4 light, 4 specialty
  - Dark: Bold Signal, Electric Studio, Creative Voltage, Dark Botanical
  - Light: Notebook Tabs, Pastel Geometry, Split Pastel, Vintage Editorial
  - Specialty: Neon Cyber, Terminal Green, Swiss Modern, Paper & Ink
- **Flexible input handling** — topics, outlines, Markdown, pasted notes, structured content
- **Viewport-fit HTML slides** — 100vh with clamp()-based responsive sizing
- **Rich animation system** — fade, scale, slide, blur, clip entrances with stagger patterns
- **Full navigation** — keyboard, touch/swipe, mouse wheel, nav dots, progress bar
- **Optional inline editing** — contenteditable with localStorage auto-save and HTML export
- **Multi-language support** — CJK fonts, RTL layout, line-height adjustments
- **Slide type variety** — title, content, feature grid, comparison, timeline, quote, code, metric, diagram
- **Anti-AI-slop design philosophy** — distinctive typography, committed palettes, meaningful animation
- **Accessibility** — semantic HTML, ARIA labels, prefers-reduced-motion support

### Origin

Adapted from [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides).
