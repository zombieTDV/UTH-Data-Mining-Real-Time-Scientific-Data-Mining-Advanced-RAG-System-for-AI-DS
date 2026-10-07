# Contributing to SlideCraft

Thank you for your interest in contributing! This project produces AI-generated presentations that look *designed*, not *generated* — in both HTML and PPTX formats.

## How to Contribute

### Reporting Issues

- Open an issue describing the problem
- Include the prompt you used and output format (HTML/PPTX)
- If possible, attach the generated file

### Adding New Themes

1. **Design the theme** with:
   - Name and vibe keywords
   - Display + body font pairing (Google Fonts / Fontshare for HTML; system-compatible for PPTX)
   - Full CSS color palette as `:root` variables
   - Layout and signature visual elements

2. **Update files:**
   - `references/STYLE_PRESETS.md` — Full theme specification
   - `SKILL.md` — Theme tables and mood mappings
   - `scripts/generate_pptx.py` — Add `ThemeSpec` entry in `THEMES` dict

3. **Theme quality checklist:**
   - [ ] Does NOT use Inter, Roboto, Arial as display font
   - [ ] Does NOT use purple gradients on white
   - [ ] Has distinctive visual identity
   - [ ] Colors pass WCAG contrast for readability
   - [ ] Fonts available on Google Fonts / Fontshare (free)
   - [ ] PPTX fonts are common system fonts or close equivalents

### Adding PPTX Slide Types

Add new methods to `PptxGenerator` in `scripts/generate_pptx.py`:
- Follow the existing pattern (set bg, add shapes, add text, add slide number)
- Use theme colors from `self.theme`
- Keep content within 16:9 bounds
- Add the method to the API table in README.md

### Adding Animation Patterns (HTML)

Add to `references/animation-patterns.md`:
- Include CSS code
- Describe which themes/moods it fits
- Note performance considerations

### Adding Slide Type Patterns (HTML)

Add to `references/html-template.md`:
- Complete HTML structure with `.reveal` classes
- Follow viewport-fitting rules

## Guidelines

- **Keep `SKILL.md` lean** — Under 500 lines; use `references/` for details
- **No external dependencies** — HTML must be single-file; PPTX needs only python-pptx
- **Test your changes** — Generate presentations with different prompts and themes
- **Comment your code** — Both generated HTML and Python scripts should be self-documenting

## License

By contributing, you agree your contributions are licensed under the MIT License.
