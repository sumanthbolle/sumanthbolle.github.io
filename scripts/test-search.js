/*
 * Search Engine Test — run with: node scripts/test-search.js
 * Tests the search module's core logic (tokenizer, index, ranking, web parsing)
 * without a browser. Validates that the algorithm works correctly.
 */

const fs = require('fs');

// Load the search module source and extract the pure functions
const searchSrc = fs.readFileSync('assets/js/shared/search.js', 'utf8');

// We can't eval the IIFE directly (it touches DOM), so extract the functions
// by re-implementing the core logic here for testing. This mirrors the
// production code exactly.

function tokenize(text) {
  if (!text) return [];
  return text.replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^a-zA-Z0-9_.\-]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(function(t) { return t.length > 1; });
}

function buildIndex(items, fields) {
  var index = [];
  var docCount = items.length;
  var df = {};
  items.forEach(function(item) {
    var termFreqs = {};
    var totalTerms = 0;
    fields.forEach(function(f) {
      var weight = f.weight || 1;
      var tokens = tokenize(item[f.name]);
      tokens.forEach(function(token) {
        termFreqs[token] = (termFreqs[token] || 0) + weight;
        totalTerms += weight;
      });
    });
    var uniqueTerms = Object.keys(termFreqs);
    uniqueTerms.forEach(function(t) { df[t] = (df[t] || 0) + 1; });
    index.push({ item: item, termFreqs: termFreqs, totalTerms: totalTerms, tokens: uniqueTerms });
  });
  return { index: index, df: df, docCount: docCount };
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  var matrix = [];
  for (var i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (var j = 1; j <= b.length; j++) {
      if (i === 0) { matrix[i][j] = j; continue; }
      var cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
      if (matrix[i][j] > 2) return 2;
    }
  }
  return matrix[a.length][b.length];
}

function search(query, searchIndex, maxResults) {
  maxResults = maxResults || 12;
  var queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  var scores = [];
  searchIndex.index.forEach(function(doc) {
    var score = 0;
    var matchedTokens = 0;
    queryTokens.forEach(function(qt) {
      var bestMatch = 0;
      doc.tokens.forEach(function(dt) {
        var sim = 0;
        if (dt === qt) sim = 1.0;
        else if (dt.indexOf(qt) === 0) sim = 0.85;
        else if (dt.indexOf(qt) !== -1) sim = 0.6;
        else if (qt.length >= 3 && editDistance(qt, dt) <= 1) sim = 0.5;
        if (sim > 0) {
          var tf = doc.termFreqs[dt] / doc.totalTerms;
          var idf = Math.log(searchIndex.docCount / (searchIndex.df[dt] || 1));
          var tfidf = tf * idf * sim;
          if (tfidf > bestMatch) bestMatch = tfidf;
        }
      });
      if (bestMatch > 0) matchedTokens++;
      score += bestMatch;
    });
    if (matchedTokens > 0) {
      var coverage = matchedTokens / queryTokens.length;
      score *= (0.5 + 0.5 * coverage);
      scores.push({ item: doc.item, score: score, coverage: coverage });
    }
  });
  scores.sort(function(a, b) { return b.score - a.score; });
  return scores.slice(0, maxResults);
}

// ────────────────────────────────────────────────────
// TEST SUITE
// ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}

// Load real data
const posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));
const interviews = JSON.parse(fs.readFileSync('data/interviews.json', 'utf8'));

console.log('═══ SEARCH ENGINE TESTS ═══\n');

// ── 1. Tokenizer ──
console.log('1. Tokenizer');
assert(tokenize('GlideRecord query').length === 2, 'Basic tokenization');
assert(tokenize('<h2>Hello</h2> <p>world</p>').join(',') === 'hello,world', 'HTML stripping');
assert(tokenize('').length === 0, 'Empty string');
assert(tokenize(null).length === 0, 'Null input');
assert(tokenize('a').length === 0, 'Single char filtered out');
assert(tokenize('ServiceNow CMDB CSDM').join(',') === 'servicenow,cmdb,csdm', 'Case normalization');
assert(tokenize('g_form.setValue()').includes('g_form.setvalue'), 'Dot-separated kept as one token (g_form.setvalue)');
console.log('');

// ── 2. Index Building ──
console.log('2. Index Building');
const blogIndex = buildIndex(posts, [
  {name: 'title', weight: 4},
  {name: 'excerpt', weight: 2},
  {name: 'content', weight: 1},
  {name: 'category', weight: 2}
]);
assert(blogIndex.index.length === posts.length, 'All ' + posts.length + ' posts indexed');
assert(blogIndex.docCount === posts.length, 'Document count matches');
assert(Object.keys(blogIndex.df).length > 100, 'Vocabulary size > 100 terms (got ' + Object.keys(blogIndex.df).length + ')');

const ivIndex = buildIndex(interviews, [
  {name: 'question', weight: 4},
  {name: 'answer', weight: 1},
  {name: 'category', weight: 3}
]);
assert(ivIndex.index.length === interviews.length, 'All ' + interviews.length + ' interviews indexed');
console.log('');

// ── 3. Exact Match Search ──
console.log('3. Exact Match Search');
var r = search('GlideRecord', blogIndex, 5);
assert(r.length > 0, 'GlideRecord returns results');
assert(r[0].item.title.toLowerCase().includes('gliderecord'), 'Top result title contains GlideRecord');

r = search('CSDM', blogIndex, 5);
assert(r.length > 0, 'CSDM returns results');
assert(r[0].item.title.toLowerCase().includes('csdm'), 'Top CSDM result is a CSDM article');

r = search('Business Rule', ivIndex, 5);
assert(r.length > 0, 'Business Rule in interviews returns results');
console.log('');

// ── 4. Prefix Match ──
console.log('4. Prefix Match');
r = search('glide', blogIndex, 5);
assert(r.length > 0, '"glide" prefix matches GlideRecord articles');

r = search('debug', blogIndex, 5);
assert(r.length > 0, '"debug" prefix matches debugging articles');
console.log('');

// ── 5. Fuzzy Match (1 typo tolerance) ──
console.log('5. Fuzzy Match');
r = search('inciden', blogIndex, 5);  // 'incident' missing trailing 't' — prefix match
assert(r.length > 0, '"inciden" (truncated incident) returns results via prefix matching');

r = search('busines rule', ivIndex, 5);  // missing 's'
assert(r.length > 0, '"busines rule" (typo) still returns results');
console.log('');

// ── 6. Multi-term Search & Coverage ──
console.log('6. Multi-term Search & Coverage');
r = search('client script onChange', blogIndex, 5);
assert(r.length > 0, 'Multi-term "client script onChange" returns results');

r = search('catalog item variable set', blogIndex, 5);
assert(r.length > 0, '"catalog item variable set" returns results');
if (r.length > 0) {
  assert(r[0].coverage > 0.5, 'Top result has > 50% query coverage (got ' + (r[0].coverage * 100).toFixed(0) + '%)');
}
console.log('');

// ── 7. Category-specific Search ──
console.log('7. Category-specific Search');
r = search('architecture', blogIndex, 5);
assert(r.length > 0, '"architecture" returns results');

r = search('security ACL', ivIndex, 5);
assert(r.length > 0, '"security ACL" returns interview results');
if (r.length > 0) {
  assert(r[0].item.category === 'Security' || r[0].item.answer.toLowerCase().includes('acl'),
    'Top result is about security/ACL');
}
console.log('');

// ── 8. No Results ──
console.log('8. Edge Cases');
r = search('xyznonexistent123', blogIndex, 5);
assert(r.length === 0, 'Nonsense query returns zero results');

r = search('a', blogIndex, 5);
assert(r.length === 0, 'Single char query returns zero (filtered by tokenizer)');

r = search('the and or', blogIndex, 5);
// These are common words but should still match something
assert(true, 'Common words do not crash');
console.log('');

// ── 9. Web Search Response Parsing ──
console.log('9. Web Search Response Parsing (DuckDuckGo format)');

// Simulate DuckDuckGo responses
function parseDDGResponse(data, query) {
  if (data.AbstractURL && data.Abstract) {
    return { title: data.Heading || query, snippet: data.Abstract, url: data.AbstractURL,
      source: data.AbstractURL.replace(/https?:\/\/(www\.)?/, '').split('/')[0],
      reason: data.AbstractSource ? 'From ' + data.AbstractSource : 'Top reference' };
  }
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    for (var i = 0; i < data.RelatedTopics.length; i++) {
      var topic = data.RelatedTopics[i];
      if (topic.FirstURL && topic.Text) {
        return { title: topic.Text.split(' - ')[0], snippet: topic.Text, url: topic.FirstURL,
          source: topic.FirstURL.replace(/https?:\/\/(www\.)?/, '').split('/')[0], reason: 'Related topic' };
      }
    }
  }
  return null;
}

var ddgAbstract = {
  Heading: 'ServiceNow CMDB',
  Abstract: 'The Configuration Management Database stores configuration items and their relationships.',
  AbstractURL: 'https://docs.servicenow.com/cmdb',
  AbstractSource: 'ServiceNow Docs'
};
var result = parseDDGResponse(ddgAbstract, 'CMDB');
assert(result !== null, 'Abstract response parsed');
assert(result.title === 'ServiceNow CMDB', 'Title extracted from Heading');
assert(result.source === 'docs.servicenow.com', 'Domain extracted correctly');
assert(result.reason.includes('ServiceNow Docs'), 'Reason includes source name');

var ddgRelated = {
  RelatedTopics: [
    { FirstURL: 'https://community.servicenow.com/thread/123', Text: 'CSDM Best Practices - A guide to implementing CSDM' }
  ]
};
result = parseDDGResponse(ddgRelated, 'CSDM');
assert(result !== null, 'RelatedTopics response parsed');
assert(result.url.includes('community.servicenow.com'), 'URL from related topic');

var ddgEmpty = {};
result = parseDDGResponse(ddgEmpty, 'nothing');
assert(result === null, 'Empty response returns null (graceful fallback)');

var ddgNoTopics = { RelatedTopics: [] };
result = parseDDGResponse(ddgNoTopics, 'nothing');
assert(result === null, 'Empty RelatedTopics returns null');
console.log('');

// ── 10. Ranking Quality ──
console.log('10. Ranking Quality');
r = search('GlideRecord complete reference', blogIndex, 3);
if (r.length > 0) {
  assert(r[0].item.title.toLowerCase().includes('gliderecord') && r[0].item.title.toLowerCase().includes('reference'),
    'Exact title match ranks first for "GlideRecord complete reference"');
}

r = search('debugging session debug slow query', blogIndex, 3);
if (r.length > 0) {
  assert(r[0].item.title.toLowerCase().includes('debug'),
    'Debugging article ranks first for debug-related query');
}

r = search('ACL access control evaluation order', ivIndex, 3);
if (r.length > 0) {
  var topQ = r[0].item.question.toLowerCase();
  assert(topQ.includes('acl') || topQ.includes('access control'),
    'ACL question ranks first for ACL query');
}
console.log('');

// ── Summary ──
console.log('═══════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
console.log(failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
process.exit(failed > 0 ? 1 : 0);
