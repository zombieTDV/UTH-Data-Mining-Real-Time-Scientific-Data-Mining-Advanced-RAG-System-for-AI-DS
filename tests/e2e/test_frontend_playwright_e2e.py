"""Dual E2E Test (Tier 2): Playwright Headless Browser UI Automation."""
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SLIDES_HTML = PROJECT_ROOT / "docs" / "presentation" / "presentation_slidecraft.html"


@pytest.fixture(scope="module")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        yield context
        context.close()
        browser.close()


@pytest.mark.e2e
def test_presentation_slidecraft_ui(browser_context):
    """Tests the presentation deck HTML via headless browser."""
    assert SLIDES_HTML.exists(), f"Presentation deck not found at {SLIDES_HTML}"

    page = browser_context.new_page()
    page.goto(f"file:///{SLIDES_HTML.as_posix()}")

    # 1. Page title should be populated
    assert page.title() != ""
    assert "UTH" in page.title() or "Scientific" in page.title() or "Mining" in page.title()

    # 2. Main slides presentation container should be present
    slides = page.locator(".slide, section, .slides-container")
    assert slides.count() > 0

    # 3. Test keyboard navigation
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(200)
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(200)

    page.close()


@pytest.mark.e2e
def test_live_frontend_dashboard_ui(browser_context):
    """Tests the live React + Vite Frontend Dashboard when running on localhost:5173."""
    page = browser_context.new_page()
    try:
        response = page.goto("http://localhost:5173", timeout=5000)
        if not response or response.status != 200:
            pytest.skip("Frontend dev server on http://localhost:5173 not responding")
    except Exception:
        pytest.skip("Frontend dev server on http://localhost:5173 is offline")

    # 1. React root element should be rendered
    root = page.locator("#root")
    assert root.count() > 0

    # 2. Wait for content to mount
    page.wait_for_selector("#root > div", timeout=5000)

    # 3. Check for main navigation or tab buttons
    buttons = page.locator("button, [role='tab'], nav")
    assert buttons.count() > 0

    # 4. Check for Explorer / Lakehouse / Search text in DOM
    page_text = page.inner_text("body")
    assert any(
        term in page_text
        for term in ["Scientific", "Lakehouse", "Search", "R2", "Explorer", "Mining"]
    )

    page.close()
