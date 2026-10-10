"""Reading-route regression checks. Requires Playwright and a running static server."""
import json
from pathlib import Path
import re
import shutil
import sys

from playwright.sync_api import sync_playwright

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000") + "/upsc.html"
root = Path(__file__).resolve().parent.parent
articles = json.loads((root / "data/upsc-pocket-reads.json").read_text())["articles"]


def assert_body(page, article):
    paragraphs = page.locator(".pr-reader__body p")
    expected = [paragraph for section in article["sections"] for paragraph in section["paragraphs"]]
    assert paragraphs.all_text_contents() == expected, article["id"]
    assert all(paragraph.is_visible() for paragraph in paragraphs.all()), article["id"]
    assert page.locator(".pr-reader__sources a").count() == len(article["sources"])
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=shutil.which("chromium"), headless=True, args=["--no-sandbox"]
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base, wait_until="networkidle")
    total = page.locator(".pr-story").count()
    assert total > 0
    page.locator("#q").fill("wetland")
    assert page.locator(".pr-story").count() == 1
    page.locator("#q").press("Escape")
    assert page.locator("#q").input_value() == ""
    assert page.locator(".pr-story").count() == total

    # The arrow and excerpt share the same native link as the title.
    arrow = page.locator(".pr-story__arrow").first
    assert arrow.is_visible()
    assert arrow.bounding_box()["width"] >= 44
    arrow.click()
    title = page.locator("#pocketArticleTitle").inner_text()
    assert page.evaluate("document.activeElement.id") == "pocketArticleTitle"
    assert "article=" in page.url
    assert_body(page, articles[0])
    page.reload(wait_until="networkidle")
    assert page.locator("#pocketArticleTitle").inner_text() == title
    assert_body(page, articles[0])
    page.locator("[data-pocket-save]").click()
    assert page.locator("#pocketSaveStatus").inner_text() == "Saved for revision."
    page.locator("[data-pocket-save]").click()
    assert page.locator("#pocketSaveStatus").inner_text() == "Already in your revision notes."
    assert page.evaluate("window.AnchorStore.list().length") == 1

    page.locator("#q").focus()
    page.locator("#q").press("Escape")
    assert "article=" not in page.url
    assert page.locator("#pocketLibrary").is_visible()
    assert not page.locator("#pocketReader").is_visible()
    assert page.title() == "UPSC Today"
    link = page.locator(".pr-story__link").first
    link.focus()
    link.press("Enter")
    assert_body(page, articles[0])
    page.go_back(wait_until="networkidle")
    assert page.locator("#pocketLibrary").is_visible()
    with page.context.expect_page() as popup_info:
        page.locator(".pr-story__arrow").first.click(modifiers=["Control"])
    popup = popup_info.value
    popup.wait_for_load_state("networkidle")
    assert_body(popup, articles[0])
    assert page.locator("#pocketLibrary").is_visible()
    popup.close()
    page.go_forward(wait_until="networkidle")
    assert page.locator("#pocketArticleTitle").inner_text() == title
    page.locator("#tab-memory").click()
    page.locator("#memoryNotes").click()
    assert title in page.locator("#notesList").inner_text()
    page.evaluate("""() => {
        const notes = window.AnchorStore.list();
        notes[0].dueOn = new Date().toISOString().slice(0, 10);
        localStorage.setItem('anchor.notes', JSON.stringify(notes));
    }""")
    takeaway = page.evaluate("window.AnchorStore.list()[0].use")
    assert takeaway
    page.locator("#memoryDue").click()
    page.locator('[data-act="reveal"]').click()
    assert takeaway in page.locator("#reviseBody").inner_text()
    assert not errors, errors

    for width, theme in [(360, "light"), (390, "dark"), (768, "light"), (1440, "light")]:
        context = browser.new_context(viewport={"width": width, "height": 900})
        context.add_init_script("localStorage.setItem('theme', '" + theme + "')")
        reader = context.new_page()
        reader_errors = []
        reader.on("pageerror", lambda error: reader_errors.append(str(error)))
        reader.route("**/upsc?article=*", lambda route: route.fulfill(path=str(root / "upsc.html"), content_type="text/html"))
        reader.goto(base.replace("/upsc.html", "/upsc") + "?article=finance-commission-explained#pocketReader", wait_until="networkidle")
        assert_body(reader, articles[0])
        assert reader.evaluate("document.activeElement.id") == "pocketArticleTitle"
        reader.goto(base, wait_until="networkidle")
        # The pre-redesign renderer exposes esc, but not safeHttpUrl.
        for article in articles:
            reader.evaluate("delete window.AnchorRender.safeHttpUrl")
            reader.locator('[data-pocket-article="' + article["id"] + '"]').first.click()
            assert_body(reader, article)
            if width in (360, 1440):
                reader.reload(wait_until="networkidle")
                assert_body(reader, article)
            reader.locator("[data-pocket-back]").click()

        reader.locator("#studyTools").evaluate("el => el.open = true")
        reader.locator('#priorityMust [data-act="open-packet"]').first.click()
        packet = reader.locator("#packetDesk .pk-packet")
        assert packet.is_visible()
        assert packet.locator("h2").is_visible()
        assert packet.bounding_box()["width"] <= 661
        assert float(packet.locator("h2").evaluate("el => parseFloat(getComputedStyle(el).fontSize)")) >= 32
        assert packet.locator("p").last.is_visible()
        assert reader.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        reader.locator("#tab-catchup").click()
        assert not re.search(r"\d+\s+Must Know|\d+\s+Useful|\d+\s+discarded", reader.locator("#view-catchup").inner_text())
        assert "Plain explanations. Everyday examples." not in reader.locator("body").inner_text()
        assert not reader_errors, reader_errors
        print("PASS:", width, theme, "article bodies and study layout", flush=True)
        context.close()
    browser.close()
print("PASS: arrows, keyboard and new-tab navigation, complete article bodies, older renderer compatibility, direct links, responsive study articles, search, history and takeaway recall")
