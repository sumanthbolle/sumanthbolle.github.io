'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = { window: {}, URL };
vm.createContext(context);
for (const file of ['render', 'reading']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/upsc/' + file + '.js'), 'utf8'), context);
}
const Reads = context.window.UPSCPocketReads;
const Render = context.window.AnchorRender;
const articles = JSON.parse(fs.readFileSync(path.join(root, 'data/upsc-pocket-reads.json'), 'utf8')).articles;

function test(name, body) {
  body();
  console.log('ok - ' + name);
}

test('short reads have unique shareable identities, substantive bodies and source links', function () {
  assert.equal(new Set(articles.map(article => article.id)).size, articles.length);
  for (const article of articles) {
    assert.match(article.id, /^[a-z0-9-]+$/);
    const words = article.sections.flatMap(section => section.paragraphs).join(' ').split(/\s+/).length;
    assert.ok(words >= 200 && words <= 450, article.id + ' must stay a pocket-sized article');
    assert.ok(article.takeaway && article.question && article.publishedOn);
    assert.ok(article.sources.length > 0);
    for (const source of article.sources) assert.match(source.url, /^https:\/\//);
  }
});

test('reading time responds to article length instead of a fixed priority band', function () {
  assert.equal(Reads.readMinutes({ sections: [{ paragraphs: ['word '.repeat(500)] }] }), 3);
  assert.equal(Reads.readMinutes({ sections: [] }), 1);
});

test('search matches topics and syllabus codes and handles an empty result', function () {
  assert.equal(Reads.filterArticles(articles, ' WETLAND ').length, 1);
  assert.ok(Reads.filterArticles(articles, 'GS3').length > 1);
  assert.equal(Reads.filterArticles(articles, 'absent phrase').length, 0);
  assert.match(Reads.libraryHtml([]), /No short reads match/);
});

test('article text is escaped and unsupported source URL protocols are excluded', function () {
  const article = Object.assign({}, articles[0], {
    title: '<script>alert(1)</script>',
    sources: [{ label: 'Unsafe', url: 'javascript:alert(1)' }],
    sections: [{ heading: '<img src=x>', paragraphs: ['<svg onload=alert(1)>'] }],
  });
  const html = Reads.articleHtml(article);
  assert.doesNotMatch(html, /<script>|<svg |<img |javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /id="pocketArticleTitle" tabindex="-1"/);
});

test('article bodies render with the older shared renderer interface', function () {
  const safeUrl = Render.safeHttpUrl;
  delete Render.safeHttpUrl;
  try {
    for (const article of articles) {
      const html = Reads.articleHtml(article);
      assert.ok(html.includes(Render.esc(article.sections[0].paragraphs[0])));
      assert.ok(html.includes('href="' + article.sources[0].url + '"'));
    }
  } finally {
    Render.safeHttpUrl = safeUrl;
  }
});

test('source-only records do not advertise empty explainers or repeat headline summaries', function () {
  const packet = { id: 'source', title: 'A headline', trigger: { summary: 'A headline' },
    sourceUrl: 'https://example.com/record', hasExamNote: false };
  const card = Render.topicCard(packet);
  const reader = Render.topicPacket(packet, { layer: 'master' });
  assert.equal((card.match(/A headline/g) || []).length, 1);
  assert.doesNotMatch(card, /5 min|Master the topic|Why UPSC cares/);
  assert.doesNotMatch(reader, /Reading depth|Prelims Vault|Mains Kit/);
  assert.match(reader, /Open the official source for the full text/);
});

test('export distinguishes note verification from the classification of its source', function () {
  const storage = {};
  context.localStorage = {
    getItem: key => storage[key] || null,
    setItem: (key, value) => { storage[key] = value; },
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/upsc/store.js'), 'utf8'), context);
  const Store = context.window.AnchorStore;
  Store.add({ title: articles[0].title, anchor: articles[0].anchor,
    sourceUrl: articles[0].sources[0].url, use: articles[0].takeaway, verified: false });
  const markdown = Store.toMarkdown();
  assert.match(markdown, /note verification pending/);
  assert.doesNotMatch(markdown, /secondary coverage/);
  assert.ok(markdown.includes(articles[0].takeaway));
});

console.log('UPSC reading tests passed');
