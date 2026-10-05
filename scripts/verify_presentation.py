import re
import json

def verify():
    with open('docs/presentation/data_mining_defense_presentation.html', 'r', encoding='utf-8') as f:
        html = f.read()

    slides = re.findall(r'<div class="slide[^"]*" data-slide="(\d+)"', html)
    print(f"Slides found with div.slide data-slide: {len(slides)} -> {slides}")

    plot_divs = re.findall(r'<div id="(plot-[^"]+)"', html)
    print(f"Plot divs ({len(plot_divs)}): {plot_divs}")

    # Check DATA json embedded
    start_pos = html.find("const DATA = ")
    end_pos = html.find(";\n\n  // Speaker notes")
    if start_pos != -1 and end_pos != -1:
        json_sub = html[start_pos + len("const DATA = "):end_pos]
        try:
            d = json.loads(json_sub)
            print(f"DATA JSON parsed! Keys: {list(d.keys())}")
            for k in d:
                if isinstance(d[k], dict):
                    print(f"  - {k}: dict with keys {list(d[k].keys())[:4]}...")
                elif isinstance(d[k], list):
                    print(f"  - {k}: list of length {len(d[k])}")
                else:
                    print(f"  - {k}: {type(d[k])}")
        except Exception as e:
            print(f"JSON Parse Error: {e}")
    else:
        print(f"DATA marker not found (start: {start_pos}, end: {end_pos})")

    # Check speaker notes
    notes_matches = re.findall(r'(\d+):\s*"([^"]+)"', html[html.find("const SPEAKER_NOTES"):html.find("const SLIDE_TITLES")])
    print(f"Speaker notes found: {len(notes_matches)} notes")
    for num, txt in notes_matches:
        print(f"  Slide {num}: {txt[:60]}...")

    # Check titles
    titles_match = re.search(r'const SLIDE_TITLES = \[(.*?)\];', html, re.DOTALL)
    if titles_match:
        titles = [t.strip().strip('"').strip("'") for t in titles_match.group(1).split(",") if t.strip()]
        print(f"Slide titles ({len(titles)}): {titles[:3]} ... {titles[-2:]}")

    # Check keyboard handlers
    has_keys = all(k in html for k in ['ArrowRight', 'ArrowLeft', "'n'", "'o'", "'f'", 'Escape'])
    print(f"All keyboard navigation bindings present: {has_keys}")

    # Check print css
    has_print = "@media print" in html
    print(f"Has @media print CSS: {has_print}")

if __name__ == "__main__":
    verify()
