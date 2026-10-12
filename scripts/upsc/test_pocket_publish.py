import copy
import json
from pathlib import Path
import tempfile
import unittest

from scripts.upsc.pocket_publish import publish_one

ROOT = Path(__file__).resolve().parents[2]
ARTICLE = json.loads((ROOT / 'data/upsc-pocket-reads.json').read_text())['articles'][0]
ARTICLE['publishedOn'] = '2026-10-10'


class PocketPublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.library = Path(self.temp.name) / 'reads.json'
        self.queue = Path(self.temp.name) / 'queue.json'
        self.library.write_text(json.dumps({'articles': [ARTICLE]}))

    def entry(self, status='approved', scheduled='2026-10-12'):
        article = copy.deepcopy(ARTICLE)
        article['id'] = 'new-pocket-article'
        return {'status': status, 'approvedOn': '2026-10-11', 'publishOn': scheduled, 'article': article}

    def write_queue(self, entries):
        self.queue.write_text(json.dumps({'entries': entries}))

    def test_publishes_one_approved_due_article_and_preserves_existing_notes(self):
        first, second = self.entry(), self.entry()
        second['article']['id'] = 'another-pocket-article'
        self.write_queue([first, second])
        publish_one(self.library, self.queue, '2026-10-12')
        result = json.loads(self.library.read_text())['articles']
        self.assertEqual(result[0]['id'], 'new-pocket-article')
        self.assertEqual(result[0]['publishedOn'], '2026-10-12')
        self.assertEqual(result[1], ARTICLE)
        self.assertNotIn('updatedOn', result[0])
        queued = json.loads(self.queue.read_text())['entries']
        self.assertEqual(queued[0]['status'], 'published')
        self.assertEqual(queued[1]['status'], 'approved')

    def test_rerun_does_not_release_a_second_article_the_same_day(self):
        self.write_queue([self.entry()])
        publish_one(self.library, self.queue, '2026-10-12')
        saved = self.library.read_text()
        self.assertIn('already published', publish_one(self.library, self.queue, '2026-10-12'))
        self.assertEqual(saved, self.library.read_text())

    def test_drafts_future_publication_and_future_approval_are_not_released(self):
        future = self.entry(); future['approvedOn'] = '2026-10-13'
        self.write_queue([self.entry('draft'), self.entry(scheduled='2026-10-15'), future])
        saved = self.library.read_text()
        self.assertIn('No approved', publish_one(self.library, self.queue, '2026-10-12'))
        self.assertEqual(saved, self.library.read_text())

    def test_earliest_due_article_is_selected(self):
        later, earlier = self.entry(scheduled='2026-10-12'), self.entry(scheduled='2026-10-11')
        earlier['article']['id'] = 'earlier-article'
        self.write_queue([later, earlier])
        publish_one(self.library, self.queue, '2026-10-12')
        self.assertEqual(json.loads(self.library.read_text())['articles'][0]['id'], 'earlier-article')

    def test_duplicate_id_is_not_given_a_fresh_date(self):
        entry = self.entry(); entry['article']['id'] = ARTICLE['id']
        self.write_queue([entry])
        with self.assertRaisesRegex(ValueError, 'already published'):
            publish_one(self.library, self.queue, '2026-10-12')

    def test_bad_article_does_not_modify_either_file(self):
        for mutate in [lambda a: a.update(sections=[]), lambda a: a.update(recallAnswer=''),
                       lambda a: a['sources'][0].update(url='javascript:alert(1)'),
                       lambda a: a['sources'][0].update(note=''),
                       lambda a: a.update(comparison={'heading': 'Broken', 'columns': None, 'rows': [['one']]}),
                       lambda a: a.update(sections=['invalid', 'sections']),
                       lambda a: a.update(codes=['GS3.999'])]:
            entry = self.entry(); mutate(entry['article']); self.write_queue([entry])
            before = (self.library.read_text(), self.queue.read_text())
            with self.assertRaises(ValueError):
                publish_one(self.library, self.queue, '2026-10-12')
            self.assertEqual(before, (self.library.read_text(), self.queue.read_text()))


if __name__ == '__main__':
    unittest.main()
