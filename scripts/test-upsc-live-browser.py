"""Exercise incoming Pocket news, reading continuity and source corrections."""
import copy
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8002').rstrip('/')
endpoint = 'https://wandering-haze-b394.sumanthbolle312.workers.dev'
clock = '2026-10-12T06:00:00'


def article(letter, title):
    identity = 'src_' + letter * 64
    return {
        'id': 'news-' + identity, 'sourceId': identity, 'sourceContentHash': 'a' * 64,
        'verification': {'verificationVersion': 2, 'agrees': True, 'confidence': 0.91, 'flagged_claims': [],
                         'checkedAt': clock + 'Z', 'sourceContentHash': 'a' * 64, 'noteContentHash': 'b' * 64},
        'title': title, 'kind': 'News brief', 'subject': 'Polity', 'paper': 'GS2',
        'codes': ['GS2.2'], 'anchor': 'Fiscal federalism', 'excerpt': 'A browser fixture for a source-checked update.',
        'publishedOn': '2026-10-12', 'publishedAt': clock + 'Z',
        'sections': [{'heading': 'What changed', 'paragraphs': ['Fixture policy text with a concrete change.']},
                     {'heading': 'The underlying idea', 'paragraphs': ['Fiscal powers are distributed across levels of government.']}],
        'takeaway': 'Understand the allocation of responsibilities.', 'question': '', 'recallAnswer': '',
        'sources': [{'label': 'PIB release', 'url': 'https://pib.gov.in/release/1', 'note': 'Open the original release.'}],
    }


def feed(sequence, articles):
    return {'version': 1, 'generatedAt': clock + f'.{sequence:03d}Z',
            'revision': str(sequence), 'articles': copy.deepcopy(articles)}


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height, theme in [(320, 700, 'light'), (390, 650, 'dark'), (1440, 1000, 'light')]:
        context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme)
        context.add_init_script('''const savedInterval = window.setInterval;
          window.setInterval = function(fn, delay) {
            if (delay === 30000) { window.refreshPocketForTest = fn; return 0; }
            return savedInterval.apply(window, arguments);
          };''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        first = article('c', 'Fixture first verified update')
        second = article('d', 'Fixture second verified update')
        third = article('e', 'Fixture third verified update')
        state = {'feed': feed(1, [first]), 'offline': False, 'headers': []}

        def news(route):
            if state['offline']:
                route.abort()
                return
            state['headers'].append(route.request.headers)
            route.fulfill(status=200, content_type='application/json', body=json.dumps(state['feed'], sort_keys=state.get('sorted', False)),
                headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag',
                         'ETag': '"' + state['feed']['revision'] + '"'})

        def chat(route):
            payload = route.request.post_data_json
            assert payload['sourceUrls'] == [first['sources'][0]['url']]
            assert payload['meta']['static_topic'] == first['anchor']
            assert first['title'] in payload['context'][0]['content']
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'success': True, 'result': {'answer': 'Fixture answer for widget behavior.', 'sources': []}}),
                headers={'Access-Control-Allow-Origin': '*'})

        page.route(endpoint + '/upsc/pocket', news)
        page.route(endpoint + '/', chat)
        # An older fallback must not erase a fresher live snapshot.
        page.route('**/data/upsc/pocket-feed.json', lambda route: route.fulfill(
            content_type='application/json', body=json.dumps(feed(0, []))))
        page.goto(base + '/upsc.html', wait_until='networkidle')
        def refresh():
            expect(page.locator('#pocketFeedRefresh')).to_be_enabled()
            page.evaluate('window.refreshPocketForTest()')
            expect(page.locator('#pocketFeedRefresh')).to_be_enabled()
        expect(page.locator('#pocketList .pr-story')).to_have_count(6)
        state['feed'] = feed(2, [second, first])
        refresh()
        expect(page.locator('#pocketList .pr-story')).to_have_count(7)
        assert any('if-none-match' in headers for headers in state['headers'])
        page.locator('[data-pocket-article="' + first['id'] + '"]').first.click()
        expect(page.locator('#pocketArticleTitle')).to_have_text(first['title'])
        expect(page.locator('.pr-reader__body p')).to_have_count(2)
        page.evaluate('window.originalPocketBody = document.querySelector(".pr-reader__body")')
        page.locator('[data-pocket-ask]').click()
        expect(page.locator('#svCoachLog')).to_contain_text('Fixture answer')
        state['feed'] = feed(3, [third, second, first])
        state['sorted'] = True
        refresh()
        expect(page.locator('#pocketFeedStatus')).to_have_text('New updates available')
        assert page.evaluate('window.originalPocketBody === document.querySelector(".pr-reader__body")')
        expect(page.locator('#svCoachPanel')).to_be_visible()
        page.locator('#svCoachClose').click()
        page.locator('#pocketFeedRefresh').click()
        assert page.evaluate('window.originalPocketBody === document.querySelector(".pr-reader__body")')
        # Back applies pending additions even when conditional requests subsequently return 304.
        fourth = article('f', 'Fixture fourth verified update')
        state['feed'] = feed(4, [fourth, third, second, first])
        refresh()
        expect(page.locator('#pocketFeedStatus')).to_have_text('New updates available')
        page.go_back()
        expect(page.locator('#pocketList .pr-story')).to_have_count(9)
        page.locator('[data-pocket-article="' + first['id'] + '"]').first.click()
        # A corrected current item interrupts use of stale facts, while keeping the old body readable.
        corrected = copy.deepcopy(first)
        corrected['sourceContentHash'] = 'f' * 64
        corrected['verification']['sourceContentHash'] = 'f' * 64
        corrected['sections'][0]['paragraphs'] = ['Corrected fixture policy text from a new source version.']
        state['feed'] = feed(5, [third, second, corrected])
        page.locator('[data-pocket-ask]').click()
        refresh()
        expect(page.locator('#pocketFeedStatus')).to_contain_text('This note has changed')
        expect(page.locator('#pocketFeedStatus')).to_have_attribute('role', 'alert')
        expect(page.locator('[data-pocket-save]')).to_be_disabled()
        expect(page.locator('[data-pocket-ask]')).to_be_disabled()
        expect(page.locator('#svCoachPanel')).to_be_hidden()
        page.locator('#pocketFeedRefresh').click()
        expect(page.locator('.pr-reader__body')).to_contain_text('Corrected fixture policy text')
        expect(page.locator('[data-pocket-save]')).to_be_enabled()
        expect(page.locator('#svCoachLog')).to_have_text('')
        # KV propagation must not restore an older same-source body.
        state['feed'] = feed(2, [second, first])
        refresh()
        expect(page.locator('#pocketFeedStatus')).not_to_have_text('New updates available')
        expect(page.locator('.pr-reader__body')).to_contain_text('Corrected fixture policy text')
        state['feed'] = feed(6, [third, second])
        refresh()
        expect(page.locator('#pocketFeedStatus')).to_contain_text('no longer in the verified feed')
        expect(page.locator('[data-pocket-save]')).to_be_disabled()
        page.locator('#pocketFeedRefresh').click()
        expect(page.locator('#pocketLibrary')).to_be_visible()
        expect(page.locator('#pocketList .pr-story')).to_have_count(7)
        state['offline'] = True
        refresh()
        expect(page.locator('#pocketFeedStatus')).to_contain_text('Last published update')
        expect(page.locator('#pocketList .pr-story')).to_have_count(7)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert not errors, errors
        print('PASS:', width, theme, 'incoming news, conditional requests, reading continuity, corrections, withdrawal and older fallback')
        context.close()
    browser.close()
