# SlideCraft

**Create stunning presentations with AI — HTML or PowerPoint, no design skills required.**

A custom AI skill that generates professional slide decks in two formats:

- **HTML** — Zero-dependency, animation-rich, browser-based presentations
- **PPTX** — PowerPoint-compatible, fully editable presentations

Give it a topic, an outline, or paste your notes — get back a beautifully designed presentation.

> **Philosophy:** Every presentation should look *designed*, not *generated*. This skill uses 12 curated visual themes with intentional typography, color, and animation choices that avoid the "AI slop" aesthetic.

---

## Features

### Dual Output Format

| Feature              | HTML                          | PPTX                         |
|----------------------|-------------------------------|-------------------------------|
| Animations           | Rich CSS/JS animations        | Static, strong visual hierarchy |
| Editing              | Optional inline editing       | Full PowerPoint editing       |
| Sharing              | Any browser, send link/file   | Email attachment, universal   |
| Offline              | Yes (except fonts)            | Yes (fully offline)           |
| Code slides          | Syntax-colored CSS            | Monospace with themed bg      |
| Backgrounds          | CSS gradients, particles, SVG | Solid colors, shape accents   |
| Best for             | Web sharing, visual impact    | Enterprise, editing, printing |

### Core Capabilities

- **12 Curated Visual Themes** — Dark, light, and specialty styles with distinctive typography, colors, and visual identity.
- **Any Input → Great Output** — Accepts topic descriptions, Markdown, outlines, structured notes, or just a vague idea.
- **8 Slide Types** — Title, content, comparison, quote, code, metrics, image, timeline — not just bullet lists.
- **Viewport-Fit HTML** — Every slide fits exactly in the browser viewport. No scrolling.
- **Rich Animations (HTML)** — Scroll-triggered reveals, staggered entrances, theme-specific effects.
- **Full Navigation (HTML)** — Keyboard, touch/swipe, mouse wheel, nav dots, progress bar.
- **Multi-language** — CJK, Cyrillic, Arabic, RTL support with appropriate font recommendations.
- **Accessible** — Semantic HTML, ARIA labels, `prefers-reduced-motion` support.

---

## Available Themes

### Dark Themes

| Theme | Vibe | Key Visual |
|-------|------|------------|
| **Bold Signal** | Confident, high-impact | Colored card on dark gradient, large section numbers |
| **Electric Studio** | Bold, clean, professional | Split panel — white top, blue bottom |
| **Creative Voltage** | Energetic, retro-modern | Electric blue + neon yellow, halftone textures |
| **Dark Botanical** | Elegant, sophisticated | Soft gradient circles, warm accents (pink, gold) |

### Light Themes

| Theme | Vibe | Key Visual |
|-------|------|------------|
| **Notebook Tabs** | Editorial, organized | Cream paper card with colorful tabs on edge |
| **Pastel Geometry** | Friendly, approachable | White card with vertical pills |
| **Split Pastel** | Playful, modern | Two-color vertical split (peach + lavender) |
| **Vintage Editorial** | Witty, personality-driven | Cream background, geometric shapes |

### Specialty Themes

| Theme | Vibe | Key Visual |
|-------|------|------------|
| **Neon Cyber** | Futuristic, techy | Particle backgrounds, neon glow, grid patterns |
| **Terminal Green** | Developer-focused | Scan lines, blinking cursor, monospace |
| **Swiss Modern** | Minimal, Bauhaus-inspired | Visible grid, asymmetric layouts, red accent |
| **Paper & Ink** | Editorial, literary | Drop caps, pull quotes, elegant rules |

---

## Installation

The skill is structured as a standard AI skill with a `SKILL.md` entry point. Adapt the installation to your platform's skill/plugin system. The core files are platform-agnostic.

### Requirements

- **HTML output:** No additional dependencies
- **PPTX output:** Python 3.8+ with `python-pptx` library
  ```bash
  pip install python-pptx
  ```

---

## Usage

Once installed, trigger the skill by asking for a presentation:

### Basic Examples

```
Create a 10-slide pitch deck about our AI startup
```

```
帮我做一个关于微服务架构的技术分享，大概 12 页，用 Neon Cyber 风格，输出 PPTX
```

```
Turn these meeting notes into a presentation (both HTML and PPTX):
- Q1 revenue up 23%
- New product launch in March
- Team grew from 15 to 28
```

### Specifying Output Format

```
Make me a PowerPoint about machine learning fundamentals
→ Generates .pptx file

Create an animated web presentation about our product roadmap
→ Generates .html file

I need slides in both formats for my conference talk
→ Generates both .html and .pptx
```

### Workflow

1. **Content Discovery** — Share your content or topic; the skill asks follow-ups if needed
2. **Format Selection** — Choose HTML, PPTX, or both
3. **Style Selection** — Pick from 12 themes, or describe a mood
4. **Generation** — Produces the presentation file(s)
5. **Delivery** — Download and use

---

## File Structure

```
slidecraft/
├── SKILL.md                              # Skill entry point — workflow, rules, presets
├── README.md                             # This file
├── LICENSE                               # MIT license
├── CONTRIBUTING.md                       # Contribution guidelines
├── CHANGELOG.md                          # Version history
├── .gitignore
├── scripts/
│   └── generate_pptx.py                 # PPTX generator (python-pptx based)
└── references/                           # Supporting files loaded on-demand
    ├── STYLE_PRESETS.md                  # 12 theme specs: colors, fonts, layouts
    ├── viewport-base.css                 # Mandatory responsive CSS (HTML only)
    ├── html-template.md                  # HTML architecture, JS controller, slide patterns
    └── animation-patterns.md             # CSS/JS animation snippets (HTML only)
```

### Progressive Disclosure

The skill uses a **map, not a manual** approach:
- `SKILL.md` (~300 lines) is always loaded — contains workflow and quick-reference tables
- `references/` files loaded on-demand during generation
- `scripts/generate_pptx.py` loaded only for PPTX output

---

## PPTX Generator API

The `scripts/generate_pptx.py` module can be used standalone:

```python
from generate_pptx import PptxGenerator

# Create with a theme
gen = PptxGenerator(theme="neon-cyber")

# Add slides
gen.add_title_slide("My Presentation", "By Author Name")
gen.add_section_slide("01", "Introduction", "Getting started")
gen.add_content_slide("Key Points", ["Point 1", "Point 2", "Point 3"])
gen.add_two_column_slide("Comparison", "Before", ["Old way"], "After", ["New way"])
gen.add_quote_slide("Design is not just what it looks like.", "Steve Jobs")
gen.add_metric_slide("Results", [("99%", "Uptime"), ("500K", "Users"), ("4.9", "Rating")])
gen.add_code_slide("Example", "print('hello world')", language="Python")
gen.add_image_slide("Screenshot", "path/to/image.png", "Caption text")
gen.add_closing_slide("Thank You", "Questions?", "email@example.com")

# Save
gen.save("output.pptx")
```

### Available Slide Types

| Method | Description |
|--------|-------------|
| `add_title_slide` | Cover / title slide |
| `add_section_slide` | Section divider with large number |
| `add_content_slide` | Bullet-point content |
| `add_two_column_slide` | Two-column comparison |
| `add_quote_slide` | Quote with attribution |
| `add_metric_slide` | Big numbers with labels |
| `add_code_slide` | Code block with language badge |
| `add_image_slide` | Image with title and caption |
| `add_closing_slide` | Thank you / closing |

### CLI Usage

```bash
# List available themes
python generate_pptx.py --list-themes

# Generate a demo with all slide types
python generate_pptx.py --demo --theme neon-cyber --output demo.pptx
```

---

## Customizing Generated Presentations

### HTML: Quick Theming

Edit CSS variables in `:root`:
```css
:root {
  --bg-primary: #0a0f1c;
  --accent: #00ffcc;
  --font-display: "Clash Display", sans-serif;
}
```

### PPTX: Editing in PowerPoint

Generated PPTX files are fully editable:
- Change text, fonts, colors in PowerPoint
- Rearrange or delete slides
- Add your own images and shapes
- Theme colors are applied consistently via the slide master

---

## Design Principles

### Why "Anti-AI-Slop"?

Most AI presentations converge on: Inter font, purple gradients on white, centered card grids. This skill combats that with:

1. **Curated presets** — Each theme has a unique visual identity
2. **Intentional font pairing** — Distinctive combinations (Fraunces, Cormorant, Syne)
3. **Committed palettes** — Dominant colors with sharp accents
4. **Meaningful animation** (HTML) — One well-orchestrated reveal, not random bouncing
5. **No illustrations** — Abstract CSS shapes and patterns only

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Ideas

- **New themes** — Add to `references/STYLE_PRESETS.md` + update SKILL.md tables
- **New PPTX slide types** — Add methods to `scripts/generate_pptx.py`
- **Animation patterns** — Add to `references/animation-patterns.md`
- **Bug fixes** — Fix issues in skill instructions or scripts

---

## Acknowledgments

Inspired by [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) — the original Claude Code skill for HTML presentations.

Adapted as "SlideCraft": dual-format output (HTML + PPTX), expanded input handling, enhanced slide type variety, multi-language support, and a streamlined architecture.

---

## License

MIT — Use it, modify it, share it. See [LICENSE](LICENSE) for details.
