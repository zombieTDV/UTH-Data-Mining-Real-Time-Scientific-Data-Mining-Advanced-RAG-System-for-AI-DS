"""Unit tests for AcademicHTMLParser in src/transformation/html_parser.py."""
import pytest
from src.transformation.html_parser import AcademicHTMLParser


@pytest.fixture
def parser():
    return AcademicHTMLParser()


@pytest.mark.unit
def test_clean_text(parser):
    raw = "  This   is \n\n a test   paper.  \t "
    cleaned = parser.clean_text(raw)
    assert cleaned == "This is a test paper."


@pytest.mark.unit
def test_classify_section_type(parser):
    assert parser.classify_section_type("Abstract") == "abstract"
    assert parser.classify_section_type("1. Introduction") == "introduction"
    assert parser.classify_section_type("2. Related Work") == "related_work"
    assert parser.classify_section_type("3. Proposed Methodology") == "methodology"
    assert parser.classify_section_type("4. Experiments and Results") == "experiments"
    assert parser.classify_section_type("5. Discussion and Limitations") == "discussion"
    assert parser.classify_section_type("6. Conclusion and Future Work") == "conclusion"
    assert parser.classify_section_type("References") == "references"
    assert parser.classify_section_type("Appendix A") == "appendix"
    assert parser.classify_section_type("Random Unclassified Header") == "other"


@pytest.mark.unit
def test_parse_minimal_html(parser):
    html = """
    <!DOCTYPE html>
    <html>
      <head><title>Fallback Title</title></head>
      <body>
        <h1 class="ltx_title">Deep Representation Learning on Knowledge Graphs</h1>
        <div class="ltx_abstract">
          <p>We present a unified graph neural representation learning framework.</p>
        </div>
        <section class="ltx_section">
          <h2 class="ltx_title ltx_title_section">1. Introduction</h2>
          <div class="ltx_para"><p>Graph structures are ubiquitous across complex scientific domains.</p></div>
        </section>
      </body>
    </html>
    """
    res = parser.parse(html)
    assert res["parsed_title"] == "Deep Representation Learning on Knowledge Graphs"
    assert "unified graph neural representation" in res["parsed_abstract"]
    assert len(res["sections"]) >= 1
    assert res["sections"][0]["section_type"] == "introduction"
