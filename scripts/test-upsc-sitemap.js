const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSitemap } = require('./generate-sitemap');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upsc-sitemap-'));
const archivePath = path.join(directory, 'archive-index.json');
const outputPath = path.join(directory, 'sitemap.xml');
fs.writeFileSync(archivePath, JSON.stringify({
  generatedAt: '2026-08-18T05:00:00Z',
  notes: [
    { sourceId: 'src_1', path: 'upsc-study/notes/src_1/note.html', date: '2026-08-18', status: 'source-backed' },
    { sourceId: 'src_evil', path: 'https://evil.example/note.html', date: '2026-08-18', status: 'reviewed' },
    { sourceId: 'src_2', path: 'upsc-study/notes/src_2/draft.html', date: '2026-08-18', status: 'draft' },
  ],
  days: { '2026-08-18': ['src_1'] },
  months: { '2026-08': ['src_1'] },
  codes: { 'GS2.2': ['src_1'] },
  anchors: { 'fiscal-federalism': { noteIds: ['src_1'] } },
}));

const xml = buildSitemap({
  archiveIndexPath: archivePath,
  outputPath,
  posts: [],
  interviews: [],
  today: '2026-08-18',
});

assert(xml.includes('https://sumanthbolle.com/upsc-study/notes/src_1/note.html'));
assert(xml.includes('https://sumanthbolle.com/upsc-study/daily/2026-08-18.html'));
assert(xml.includes('https://sumanthbolle.com/upsc-study/monthly/2026-08.html'));
assert(xml.includes('https://sumanthbolle.com/upsc-study/syllabus/gs2-2.html'));
assert(xml.includes('https://sumanthbolle.com/upsc-study/anchors/fiscal-federalism.html'));
assert(xml.includes('https://sumanthbolle.com/revision'));
assert(xml.includes('https://sumanthbolle.com/mains'));
assert(xml.includes('https://sumanthbolle.com/upsc-quiz'));
assert(xml.includes('https://sumanthbolle.com/upsc-guide'));
assert(!xml.includes('evil.example'));
assert(!xml.includes('draft.html'));
assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), xml);
console.log('UPSC sitemap tests passed');
