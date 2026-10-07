---
name: slidecraft
description: |
  Create stunning presentations from any input — topic descriptions, structured outlines, Markdown content, or pasted notes. Supports two output formats: HTML (animation-rich, browser-based) and PPTX (PowerPoint-compatible, editable). Features 12+ curated visual themes with anti-AI-slop design philosophy.
  Use this skill whenever the user wants to: build a presentation or slide deck (HTML or PPTX), create slides for a talk/pitch/report/class, generate a browser-based slideshow, convert Markdown or notes into slides, make a visually distinctive presentation, or asks for "slides" / "deck" / "presentation" / "PPT" / "幻灯片" / "演示文稿".
  Also use when: user provides a document/article and asks to turn it into slides, user wants a presentation with code snippets or technical diagrams, user asks for animated or interactive slides, user wants a PowerPoint file.
---

# SlideCraft

Create presentations in two formats:
- **HTML** — Zero-dependency, animation-rich, browser-based. Best for web sharing and visual impact.
- **PPTX** — PowerPoint-compatible, fully editable. Best for enterprise, offline use, and further editing.

Both formats use the same 12 curated visual themes.

## Core Principles

1. **Zero Dependencies** — HTML: single file, inline CSS/JS. PPTX: standard .pptx format.
2. **Any Input, Great Output** — Accept topic descriptions, Markdown, outlines, pasted notes, or just a vague idea.
3. **Distinctive Design** — No generic "AI slop." Every presentation should feel custom-crafted.
4. **Dual Format** — Same themes, same quality, two formats for different needs.

---

## Design Philosophy

Users can immediately tell when something looks "AI-generated." This skill produces presentations that look *designed*, not *generated*.

### Typography
Beautiful, unique font choices. For HTML: Google Fonts or Fontshare. For PPTX: system-compatible fonts that match the theme's character.

### Color & Theme
Cohesive palettes defined in CSS variables (HTML) or applied via python-pptx (PPTX). Dominant colors with sharp accents.

### Motion (HTML only)
High-impact animation moments: orchestrated page loads with staggered reveals. PPTX format is static but compensates with strong visual hierarchy and layout.

### What to Avoid
- Overused fonts (Inter, Roboto, Arial as display)
- Purple gradients on white backgrounds
- Predictable card-grid layouts
- Cookie-cutter aesthetics

---

## Viewport Fitting Rules (HTML)

These rules apply to HTML output only:

- Every `.slide`: `height: 100vh; height: 100dvh; overflow: hidden;`
- ALL sizes/spacing: `clamp(min, preferred, max)` — never fixed px/rem alone
- Images: `max-height: min(50vh, 400px)`
- Breakpoints at 700px, 600px, 500px height
- Include `prefers-reduced-motion` support
- CSS negation: `calc(-1 * clamp(...))` not `-clamp(...)`

**Always read `references/viewport-base.css` and include its FULL contents in every HTML presentation.**

### Content Density Limits Per Slide (Both Formats)

| Slide Type     | Maximum Content                                            |
| -------------- | ---------------------------------------------------------- |
| Title slide    | 1 heading + 1 subtitle + optional tagline                  |
| Content slide  | 1 heading + 4-6 bullets OR 1 heading + 2 paragraphs        |
| Feature grid   | 1 heading + 6 cards max (2×3 or 3×2)                       |
| Code slide     | 1 heading + 8-10 lines of code                              |
| Quote slide    | 1 quote (max 3 lines) + attribution                         |
| Image slide    | 1 heading + 1 image                                         |
| Comparison     | 1 heading + 2 columns, 3-4 items each                      |
| Metric slide   | 1 heading + 3-4 big numbers with labels                     |
| Timeline       | 1 heading + 4-5 timeline nodes                              |

Content exceeds limits? **Split into multiple slides.**

---

## Workflow

### Phase 1: Content Discovery

Gather information through conversation. Adapt to what the user provides:

**If user gives a topic only** — ask:
1. Purpose (Pitch / Teaching / Conference / Internal / Other)
2. Approximate slide count (Short 5-10 / Medium 10-20 / Long 20+)
3. Target audience and key message
4. Output format preference (HTML / PPTX / both)
5. Style preference or mood

**If user gives structured content** (outline, Markdown, notes) — ask:
1. Output format (HTML / PPTX / both)
2. Style preference
3. Any images to embed?

**If user gives everything upfront** — **skip all questions and proceed directly.**

**Default output format:** If the user doesn't specify, choose based on context:
- Mentions "PPT", "PowerPoint", "PPTX", "编辑", "edit" → PPTX
- Mentions "web", "HTML", "animated", "browser", "动画" → HTML
- Ambiguous → Ask, or default to HTML (richer output)

### Content Transformation

- **Markdown / structured notes** → Parse headings as slide titles, bullets as content, code blocks as code slides
- **Long paragraphs** → Extract key points, split into digestible bullets
- **Topic only** → Generate an outline, then flesh out with substantive content (never placeholder text)
- **Article / document** → Identify thesis, arguments, data → structure as narrative slides

---

### Phase 2: Style Selection

Present the 12 curated presets. Read `references/STYLE_PRESETS.md` for full specifications.

**Dark Themes:**

| # | Name               | Vibe                        | Key Visual                                        |
|---|--------------------|-----------------------------|----------------------------------------------------|
| 1 | **Bold Signal**    | Confident, high-impact      | Colored card on dark gradient, large section numbers|
| 2 | **Electric Studio**| Bold, clean, professional   | Split panel — white top, blue bottom               |
| 3 | **Creative Voltage**| Energetic, retro-modern    | Electric blue + neon yellow, halftone textures     |
| 4 | **Dark Botanical** | Elegant, sophisticated      | Abstract soft gradient circles, warm accents       |

**Light Themes:**

| # | Name                | Vibe                       | Key Visual                                    |
|---|---------------------|----------------------------|------------------------------------------------|
| 5 | **Notebook Tabs**   | Editorial, organized       | Cream paper card with colorful tabs            |
| 6 | **Pastel Geometry** | Friendly, approachable     | White card with vertical pills on edge         |
| 7 | **Split Pastel**    | Playful, modern            | Two-color vertical split (peach + lavender)    |
| 8 | **Vintage Editorial**| Witty, personality-driven  | Cream background, geometric shapes             |

**Specialty:**

| # | Name               | Vibe                   | Key Visual                              |
|---|--------------------|------------------------|-----------------------------------------|
| 9  | **Neon Cyber**    | Futuristic, techy      | Particle backgrounds, neon glow         |
| 10 | **Terminal Green** | Developer-focused      | Scan lines, blinking cursor             |
| 11 | **Swiss Modern**   | Minimal, Bauhaus       | Visible grid, asymmetric layouts        |
| 12 | **Paper & Ink**    | Editorial, literary    | Drop caps, pull quotes                  |

**Mood-to-preset mapping:**

| Mood                   | Suggested Presets                                  |
|------------------------|----------------------------------------------------|
| Impressed / Confident  | Bold Signal, Electric Studio, Dark Botanical       |
| Excited / Energized    | Creative Voltage, Neon Cyber, Split Pastel         |
| Calm / Focused         | Notebook Tabs, Paper & Ink, Swiss Modern           |
| Inspired / Moved       | Dark Botanical, Vintage Editorial, Pastel Geometry |
| Technical / Developer  | Terminal Green, Neon Cyber, Swiss Modern            |
| Creative / Artistic    | Creative Voltage, Dark Botanical, Split Pastel     |

---

### Phase 3: Generate Presentation

#### Path A: HTML Output

**Before generating, read these reference files:**
- `references/STYLE_PRESETS.md` — Detailed color/font/layout specs
- `references/viewport-base.css` — Mandatory responsive CSS (include in full)
- `references/html-template.md` — HTML architecture, JS controller, slide patterns
- `references/animation-patterns.md` — CSS/JS animation reference

**Key requirements:**
- Single self-contained HTML file, all CSS/JS inline
- Full viewport-base.css in `<style>` block
- Web fonts from Google Fonts or Fontshare
- Comments with `/* === SECTION NAME === */`
- SlidePresentation class with keyboard/touch/wheel nav, progress bar, nav dots
- Intersection Observer for `.reveal` animations
- Variety of slide types (title, content, grid, quote, code, comparison, metric)

**Execution:**
1. Write HTML via `write_file` tool
2. Upload via `upload_file` tool
3. Present download link

#### Path B: PPTX Output

Use the `scripts/generate_pptx.py` script. This script provides a `PptxGenerator` class with all 12 themes mapped to PPTX-compatible styling.

**To generate PPTX, write and run a Python script** that:

1. Imports `PptxGenerator` from `scripts/generate_pptx.py` (add the scripts dir to sys.path)
2. Creates a generator with the chosen theme
3. Adds slides using the available methods:
   - `add_title_slide(title, subtitle)` — Cover slide
   - `add_section_slide(number, title, subtitle)` — Section divider
   - `add_content_slide(title, bullets, subtitle)` — Bullet-point content
   - `add_two_column_slide(title, left_title, left_items, right_title, right_items)` — Comparison
   - `add_quote_slide(quote, attribution)` — Quote/callout
   - `add_metric_slide(title, metrics)` — Big numbers (metrics = list of (value, label) tuples)
   - `add_code_slide(title, code, language)` — Code block
   - `add_image_slide(title, image_path, caption)` — Image slide
   - `add_closing_slide(title, subtitle, contact)` — Thank you / closing
4. Saves to a `.pptx` file
5. Upload via `upload_file` tool

**Example script:**
```python
import sys
sys.path.insert(0, '{skill_directory}/scripts')
from generate_pptx import PptxGenerator

gen = PptxGenerator(theme="neon-cyber")
gen.add_title_slide("My Presentation", "By Author")
gen.add_content_slide("Key Points", ["Point 1", "Point 2", "Point 3"])
gen.add_closing_slide("Thank You")
gen.save("presentation.pptx")
```

**Note:** The `{skill_directory}` path can be found from the skill's base directory shown when the skill is loaded.

#### Path C: Both Formats

Generate HTML first (richer output, good for review), then PPTX. Both use the same content and theme.

---

### Phase 4: Delivery

After generating, tell the user:

**For HTML:**
- Download link, style name, slide count
- Navigation: Arrow keys, Space, scroll/swipe, nav dots
- Customization: `:root` CSS variables, Google Fonts link

**For PPTX:**
- Download link, style name, slide count
- Can be opened in PowerPoint, WPS, Google Slides, Keynote
- Fully editable — change text, colors, add slides, rearrange
- Theme colors are applied consistently — editing keeps the aesthetic

**For both:** Provide both download links with a comparison note.

---

## Handling Images

**User provides images:**
- HTML: base64-encode inline
- PPTX: use `add_image_slide()` with the file path
- Both: apply size constraints, maintain aspect ratio

**No images:** Use CSS visuals (HTML) or decorative shapes (PPTX).

---

## Handling Enhancement Requests

When improving an existing presentation:
1. Read the existing file
2. Audit content density per slide
3. Split overflowing slides
4. Preserve existing theme

---

## Multi-language Support

- Match `lang` attribute (HTML) to content language
- CJK: use Noto Sans CJK or Source Han Sans (HTML), SimHei/Microsoft YaHei (PPTX)
- Adjust line-height for CJK (1.6-1.8)
- RTL languages: add `dir="rtl"` (HTML), adjust layout (PPTX)

---

## Format Comparison

| Feature              | HTML                          | PPTX                         |
|----------------------|-------------------------------|-------------------------------|
| Animations           | Rich CSS/JS animations        | Static (strong visual hierarchy instead) |
| Editing              | Optional inline editing       | Full PowerPoint editing       |
| Sharing              | Send link / file, any browser | Email attachment, universal   |
| Offline              | Yes (except fonts)            | Yes (fully offline)           |
| File size            | ~50-500KB                     | ~30-100KB                     |
| Code slides          | Syntax-colored CSS            | Monospace with bg color       |
| Backgrounds          | CSS gradients, particles, SVG | Solid colors, shape accents   |
| Responsive           | Full viewport scaling         | Fixed 16:9                    |
| Dependencies         | None (single file)            | None (standard .pptx)         |

---

## Reference Files

| File                              | Purpose                                               | When to Read  |
|-----------------------------------|-------------------------------------------------------|---------------|
| `references/STYLE_PRESETS.md`     | 12 visual presets — colors, fonts, layouts, signatures | Phase 2 & 3  |
| `references/viewport-base.css`    | Mandatory responsive CSS — HTML output only            | Phase 3 (HTML)|
| `references/html-template.md`     | HTML architecture, JS controller, slide patterns       | Phase 3 (HTML)|
| `references/animation-patterns.md`| Animation snippets and effect-to-feeling mapping       | Phase 3 (HTML)|
| `scripts/generate_pptx.py`        | PPTX generator with 12 themed slide builders           | Phase 3 (PPTX)|
