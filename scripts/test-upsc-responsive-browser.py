"""UPSC page layout checks. Requires Playwright and a running static server."""
from pathlib import Path
import shutil
import sys

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from scripts.upsc.publish import _page_shell

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
routes = ["upsc.html", "upsc-guide.html", "upsc-patterns.html", "revision.html",
          "mains.html", "upsc-quiz.html", "needs-review.html", "upsc-study/"]


def assert_layout(page, label):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), label
    clipped = page.evaluate("""() => Array.from(document.querySelectorAll(
        '.an-command a, .an-command button, .an-main a, .an-main button, ' +
        '.an-main select, .an-main input, .an-main textarea, .an-main summary, .an-footer-links a, ' +
        '.util-head button, .util-head__meta a'
    )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(el => el.id || el.textContent.trim().slice(0, 80))""")
    assert not clipped, (label, clipped)
    short_buttons = page.evaluate("""() => Array.from(document.querySelectorAll(
        '.an-command button, .an-main button, .an-main summary, .an-footer-links a, ' +
        '.util-head button, .util-head__meta a'
    )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && rect.height < 43.5;
    }).map(el => el.id || el.textContent.trim())""")
    assert not short_buttons, (label, short_buttons)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=shutil.which("chromium"),
                                         headless=True, args=["--no-sandbox"])
    for width, theme in [(320, "light"), (390, "dark"), (768, "light"), (1440, "light")]:
        context = browser.new_context(viewport={"width": width, "height": 900},
                                      reduced_motion="reduce", color_scheme=theme)
        context.add_init_script("localStorage.setItem('theme', '" + theme + "')")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        # The production queue is empty. Exercise its real renderer with a long ID.
        page.route("**/data/upsc/needs-review.json", lambda route: route.fulfill(
            json={"items": [{"sourceId": "a" * 64, "verification": {
                "flagged_claims": ["https://example.com/" + "long-source-path" * 12]
            }}]}))
        for route in routes:
            page.goto(base + "/" + route, wait_until="networkidle")
            if route != "upsc-study/":
                assert page.locator("html").get_attribute("data-theme") == theme, (route, theme)
            assert_layout(page, (route, width, theme))
            if page.locator("#themeToggle").count():
                toggle = page.locator("#themeToggle")
                toggle.click()
                changed = "dark" if theme == "light" else "light"
                assert page.locator("html").get_attribute("data-theme") == changed, route
                assert toggle.get_attribute("aria-pressed") == str(changed == "dark").lower()
                assert_layout(page, (route, width, changed))
                toggle.click()
            menu = page.locator(".menu-toggle")
            if menu.count() and menu.is_visible():
                menu.click()
                assert page.locator("#mobileMenu").is_visible(), route
                assert menu.get_attribute("aria-expanded") == "true", route
                menu.click()
                assert not page.locator("#mobileMenu").is_visible(), route
                assert menu.get_attribute("aria-expanded") == "false", route
            if route == "upsc.html":
                assert page.locator(".pr-story__link").count() == 5
                for arrow in page.locator(".pr-story__arrow").all():
                    arrow.click()
                    page.wait_for_function("document.activeElement.id === 'pocketArticleTitle'")
                    assert page.locator(".pr-reader__body p").count() > 0
                    chrome = page.locator(".an-command").bounding_box()
                    title = page.locator("#pocketArticleTitle").bounding_box()
                    assert title["y"] >= chrome["y"] + chrome["height"] - 1, (width, title, chrome)
                    assert_layout(page, ("article", width, theme))
                    page.locator("[data-pocket-back]").click()
                # Check real tab panels, including all filters and the note editor.
                for view in ["catchup", "syllabus", "memory", "source"]:
                    page.locator("#tab-" + view).click()
                    if view == "memory":
                        page.locator("#memoryNotes").click()
                        page.locator("#composer").evaluate("el => el.open = true")
                    assert_layout(page, (view, width, theme))
            elif route == "upsc-patterns.html":
                page.locator("#atlasList summary").first.click()
                assert_layout(page, ("expanded anchor", width, theme))
                page.locator(".atlas-actions [data-act='drill-one']").first.click()
                assert_layout(page, ("atlas drill", width, theme))
                page.locator("#drillBody [data-act='reveal']").click()
                assert_layout(page, ("atlas answer", width, theme))
            if page.locator(".sv-coach-toggle").count():
                page.locator(".sv-coach-toggle").click()
                panel = page.locator(".sv-coach-panel").bounding_box()
                assert panel["x"] >= 0 and panel["x"] + panel["width"] <= width
                assert panel["y"] >= 0 and panel["y"] + panel["height"] <= 900
            assert not errors, (route, errors)
            print("PASS:", width, theme, route, flush=True)
        # Use the actual publication template; do not publish fixture content.
        note = _page_shell("Responsive fixture", "Layout regression fixture", "https://example.com",
            '<h1>A readable study note</h1><section class="answer-use"><h2>Use in an answer</h2>'
            '<p>' + "long-unbroken-reference" * 12 + '</p></section>', "2026-10-10")
        page.route("**/upsc-study/responsive-fixture.html", lambda route: route.fulfill(
            body=note, content_type="text/html"))
        page.goto(base + "/upsc-study/responsive-fixture.html", wait_until="networkidle")
        expected_bg = "rgb(24, 29, 26)" if theme == "dark" else "rgb(250, 249, 246)"
        assert page.locator("body").evaluate("el => getComputedStyle(el).backgroundColor") == expected_bg
        assert_layout(page, ("generated note", width, theme))
        box = page.locator(".answer-use").bounding_box()
        assert box["x"] >= 0 and box["x"] + box["width"] <= width
        assert box["width"] <= 660
        print("PASS:", width, theme, "generated note", flush=True)
        context.close()
    browser.close()
print("PASS: topic arrows, sticky title clearance, eight UPSC pages, tab panels, drill, long IDs and generated notes")
