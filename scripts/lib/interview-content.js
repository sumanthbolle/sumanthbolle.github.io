// scripts/lib/interview-content.js
// =============================================================================
// INTERVIEW CONTENT HELPERS
// =============================================================================
// Shared by the daily question generator (fetch-interview-questions.js) and
// the content validator (validate-interviews.js): where the data lives, which
// categories the page shows, the prose rules, near-duplicate detection and
// HTML structure checks.
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_FILES = [path.join(ROOT, 'data', 'interviews.json'), path.join(ROOT, 'interviews.json')];
const PAGE = path.join(ROOT, 'interviews.html');
const LEVELS = ['Beginner', 'Foundation', 'Senior', 'Expert'];

// Generic AI prose. Any hit fails a generated question and warns on existing ones.
const FILLER = [
  'delve', 'game-changer', 'game changer', 'ever-evolving', 'rapidly evolving', 'unlock the power', 'revolutionize',
  'seamless', 'harness the power', 'in conclusion', 'it\'s worth noting', 'it is important to note', 'tapestry',
  'paradigm shift', 'let\'s dive', 'dive into', 'crucial', 'robust', 'leverage', 'pivotal', 'testament to',
  'the candidate should', 'the candidate must', 'in today\'s',
];

// The category list the sidebar shows, read from interviews.html so the two never drift.
function loadCategories(pageFile) {
  const html = fs.readFileSync(pageFile || PAGE, 'utf8');
  const block = html.match(/var catGroups = \[([\s\S]*?)\];/);
  if (!block) throw new Error('catGroups not found in interviews.html');
  const cats = [];
  block[1].replace(/\[\s*'[^']+',\s*\[([^\]]*)\]\s*\]/g, (m, list) => {
    list.replace(/'([^']+)'/g, (mm, c) => { cats.push(c); return mm; });
    return m;
  });
  return cats;
}

function loadQuestions(file) {
  return JSON.parse(fs.readFileSync(file || DATA_FILES[0], 'utf8'));
}

// Same layout as the committed files (indent 2, non-ASCII escaped), so a run's diff is only the new items.
function saveQuestions(items) {
  const json = JSON.stringify(items, null, 2)
    .replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
  DATA_FILES.forEach((f) => fs.writeFileSync(f, json));
}

function plainText(html) {
  return String(html || '')
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return (String(text).match(/\S+/g) || []).length;
}

// Product names that contain a filler word are not filler.
const NAMES = ['robust transform engine'];

function fillerHits(text) {
  let lower = String(text).toLowerCase();
  NAMES.forEach((n) => { lower = lower.split(n).join(' '); });
  return FILLER.filter((f) => lower.includes(f));
}

// Word-set overlap of two questions (0..1), ignoring short and very common words.
const STOP = new Set('the a an and or of to in on for with is are be your you how what why when which that this it as at by from their they we our does do can should would will has have its into'.split(' '));
function terms(text) {
  return new Set(plainText(text).toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w)));
}
function similarity(a, b) {
  const A = terms(a);
  const B = terms(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared++; });
  return shared / (A.size + B.size - shared);
}

const BALANCED_TAGS = ['pre', 'ul', 'ol', 'li', 'h4', 'p', 'div', 'code', 'strong', 'a', 'em'];
function unbalancedTags(html) {
  return BALANCED_TAGS.filter((t) => {
    const open = (String(html).match(new RegExp('<' + t + '[\\s>]', 'g')) || []).length;
    const close = (String(html).match(new RegExp('</' + t + '>', 'g')) || []).length;
    return open !== close;
  });
}

module.exports = {
  ROOT, DATA_FILES, PAGE, LEVELS, FILLER,
  loadCategories, loadQuestions, saveQuestions, plainText, wordCount, fillerHits, similarity, unbalancedTags,
};
