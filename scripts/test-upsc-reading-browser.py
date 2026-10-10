"""Reading-route regression checks. Requires Playwright and a running static server."""
import shutil
import sys

from playwright.sync_api import sync_playwright

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000") + "/upsc.html"
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=shutil.which("chromium"), headless=True, args=["--no-sandbox"]
    )
    page = browser.new_page(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
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

    page.locator("[data-pocket-article]").first.click()
    title = page.locator("#pocketArticleTitle").inner_text()
    assert page.evaluate("document.activeElement.id") == "pocketArticleTitle"
    assert "article=" in page.url
    page.reload(wait_until="networkidle")
    assert page.locator("#pocketArticleTitle").inner_text() == title
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
    page.locator("[data-pocket-article]").first.click()
    page.go_back(wait_until="networkidle")
    assert page.locator("#pocketLibrary").is_visible()
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
    browser.close()
print("PASS: search reset, article routes, focus, reload, history and takeaway recall")
