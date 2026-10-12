"""Source-aware reader/widget checks with deterministic network responses."""
import json
from pathlib import Path
import shutil
import sys

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
base = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000').rstrip('/')
articles = json.loads((root / 'data/upsc-pocket-reads.json').read_text())['articles']
endpoint = 'https://wandering-haze-b394.sumanthbolle312.workers.dev'


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    for width, height, theme in [(320, 700, 'light'), (390, 480, 'dark'), (768, 900, 'light'), (1440, 1000, 'light')]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        context.add_init_script("localStorage.setItem('theme', '" + theme + "')")
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def respond(route):
            if route.request.method == 'OPTIONS':
                route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept'})
                return
            if route.request.method != 'POST':
                route.fulfill(status=503, json={'success': False}, headers={'Access-Control-Allow-Origin': '*'})
                return
            body = route.request.post_data_json
            requests.append(body)
            urls = body.get('sourceUrls', [])
            route.fulfill(json={'success': True, 'result': {
                'answer': 'Check the institutional mechanism against the document [P1].',
                'sourceRetrieval': [{'id': 'P1', 'url': urls[0], 'status': 'read'}] if urls else [],
                'sources': [{'url': urls[0], 'title': 'Official research source'}] if urls else []
            }}, headers={'Access-Control-Allow-Origin': '*'})

        page.route(endpoint + '/**', respond)
        page.goto(base + '/upsc.html', wait_until='networkidle')
        assert not page.locator('#svCoachToggle').is_visible()
        for article in articles:
            page.locator('[data-pocket-article="' + article['id'] + '"]').first.click()
            assert page.locator('.pr-reader__body p').all_text_contents() == [
                text for section in article['sections'] for text in section['paragraphs']]
            assert page.locator('.pr-example').is_visible()
            assert page.locator('.pr-comparison tbody tr').count() == len(article['comparison']['rows'])
            page.locator('.pr-question summary').click()
            assert page.locator('.pr-question details p').inner_text() == article['recallAnswer']
            page.locator('[data-reading-size]').click()
            assert page.locator('[data-reading-size]').get_attribute('aria-pressed') == 'true'
            page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('.pr-reader__body')).fontSize) >= 22")
            page.reload(wait_until='networkidle')
            assert page.locator('[data-reading-size]').get_attribute('aria-pressed') == 'true'
            page.locator('[data-reading-size]').click()
            page.locator('[data-pocket-ask]').click()
            page.wait_for_selector('.sv-coach-msg--assistant')
            body = requests[-1]
            assert body['liveSearch'] is True
            assert body['chip'] == 'sources'
            assert body['meta']['static_topic'] == article['anchor']
            assert body['sourceUrls'] == [source['url'] for source in article['sources']]
            assert article['title'] in body['context'][0]['content']
            assert article['sections'][0]['paragraphs'][0] in body['context'][0]['content']
            assert page.locator('.sv-coach-msg--assistant .sv-coach-sources a').count() >= 2
            box = page.locator('#svCoachPanel').bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= width
            assert box['y'] >= 0 and box['y'] + box['height'] <= height
            assert page.locator('#svCoachPanel').evaluate("el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+20,r.y+10));}")
            assert page.locator('#svCoachSend').bounding_box()['y'] < height
            if height == 480:
                page.evaluate("""() => {
                    Object.defineProperty(visualViewport, 'height', {get: () => 280, configurable: true});
                    visualViewport.dispatchEvent(new Event('resize'));
                }""")
                compact = page.locator('#svCoachPanel').bounding_box()
                assert compact['height'] <= 248
                assert page.locator('#svCoachSend').bounding_box()['y'] < 280
                page.evaluate("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))")
            page.locator('#svCoachInput').press('Escape')
            assert not page.locator('#svCoachPanel').is_visible()
            assert page.evaluate("document.activeElement.hasAttribute('data-pocket-ask')")
            page.locator('[data-pocket-back]').click()
            assert page.locator('#svCoachLog').inner_text() == ''
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('[data-pocket-article]').first.click()
        page.locator('[data-pocket-ask]').click()
        page.wait_for_selector('.sv-coach-msg--assistant')
        page.locator('[data-prompt="understanding"]').click()
        page.wait_for_function("document.querySelectorAll('.sv-coach-msg--assistant').length === 2")
        page.locator('#svCoachInput').fill('The state allocation is the horizontal decision.')
        page.locator('#svCoachSend').click()
        page.wait_for_function("document.querySelectorAll('.sv-coach-msg--assistant').length === 3")
        assert requests[-1]['chip'] == 'understanding'
        assert requests[-1]['sourceUrls'] == [source['url'] for source in articles[0]['sources']]
        page.locator('#svCoachClose').click()
        page.locator('.pr-reader__next').click()
        page.locator('[data-pocket-ask]').click()
        page.wait_for_selector('.sv-coach-msg--assistant')
        assert len(requests[-1]['context']) == 2, requests[-1]['context']
        assert articles[0]['title'] not in requests[-1]['context'][0]['content']
        # Browser Back cancels a pending request and clears the old conversation.
        page.locator('#svCoachClose').click()
        held = []
        def delay(route):
            if route.request.method == 'OPTIONS':
                route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept'})
            elif route.request.method == 'POST':
                held.append(route)
            else:
                route.fulfill(status=503, json={'success': False}, headers={'Access-Control-Allow-Origin': '*'})
        page.route(endpoint + '/**', delay)
        page.locator('[data-pocket-ask]').click()
        page.wait_for_timeout(100)
        assert held
        with page.expect_event('requestfailed', predicate=lambda request: request.url.startswith(endpoint)):
            page.go_back()
        held[0].abort('aborted')
        page.unroute(endpoint + '/**', delay)
        page.wait_for_timeout(100)
        assert page.locator('#svCoachLog').inner_text() == ''
        assert not errors, errors
        print('PASS:', width, height, theme, 'all article additions, source requests, focus, themes and context isolation', flush=True)
        context.close()
    browser.close()
