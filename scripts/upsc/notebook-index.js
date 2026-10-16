#!/usr/bin/env node
'use strict';

/*
 * Builds data/upsc/notebook/index.json from the Markdown posts in
 * data/upsc/notebook/posts/. The scheduled coordinator tasks only ever add a
 * post file; this script (run by .github/workflows/upsc-notebook.yml) turns
 * the folder into the index that upsc.html?view=notebook reads.
 *
 *   node scripts/upsc/notebook-index.js            # write the index
 *   node scripts/upsc/notebook-index.js --check    # exit 1 if a post is malformed
 *
 * Post file name: YYYY-MM-DD-<slug>.md. Frontmatter keys: title, date,
 * category, summary; optional time, week, phase, days_to_go, tags, updated.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const NOTEBOOK_DIR = path.join(ROOT, 'data', 'upsc', 'notebook');
const POSTS_DIR = path.join(NOTEBOOK_DIR, 'posts');
const LOG_DIR = path.join(NOTEBOOK_DIR, 'log');
const KEYS_DIR = path.join(NOTEBOOK_DIR, 'keys');
const INDEX_PATH = path.join(NOTEBOOK_DIR, 'index.json');

// Order here is the order of the category chips on the page.
const CATEGORIES = [
  { id: 'morning-brief', label: 'Morning briefs', description: 'What to revise and read today, with the day\'s current affairs.' },
  { id: 'nightly-checkin', label: 'Evening check-ins', description: 'Whether the day was logged, what carries forward, and tomorrow\'s first task.' },
  { id: 'weekly-review', label: 'Weekly reviews', description: 'Sunday scorecard, slippage decisions and next week\'s plan.' },
  { id: 'current-affairs', label: 'Current affairs', description: 'One running note per month: item, static anchor, primary source, verified or not.' },
  { id: 'deadline-alert', label: 'Deadlines', description: 'Notification, application, admit card and travel alarms.' },
  { id: 'plan', label: 'Plan', description: 'The master plan and every re-cut of it.' },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;
const ENC_FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md\.enc$/;
const LOG_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json(\.enc)?$/;

// An encrypted entry reveals only its date and category, both taken from the
// file name. The slug must start with a category id, or be one of the alarm
// slugs the deadline tasks use.
const SLUG_CATEGORY = {
  'master-plan': 'plan', 'resource-audit': 'plan', 'notebook-opens': 'plan', 'plan-recut': 'plan',
  'notification-day': 'deadline-alert', 'apply-now': 'deadline-alert',
  'final-application-alarm': 'deadline-alert', 'admit-card-travel': 'deadline-alert',
};
function categoryFromSlug(slug) {
  for (const id of CATEGORY_IDS) if (slug === id || slug.startsWith(id + '-')) return id;
  for (const key of Object.keys(SLUG_CATEGORY)) if (slug === key || slug.startsWith(key + '-')) return SLUG_CATEGORY[key];
  return null;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => parseScalar(part)).filter((part) => part !== '');
  }
  if (/^"(.*)"$/.test(value) || /^'(.*)'$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = parseScalar(line.slice(idx + 1));
  }
  return { meta, body: match[2] };
}

function wordCount(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>|`-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function validatePost(fileName, text) {
  const errors = [];
  const nameMatch = fileName.match(FILE_RE);
  if (!nameMatch) errors.push('file name must be YYYY-MM-DD-slug.md');
  const { meta, body } = parseFrontmatter(text);
  if (!meta) return { errors: ['missing frontmatter block'], post: null };

  for (const key of ['title', 'date', 'category', 'summary']) {
    if (typeof meta[key] !== 'string' || !meta[key].trim()) errors.push('frontmatter needs a non-empty ' + key);
  }
  if (typeof meta.date === 'string' && !DATE_RE.test(meta.date)) errors.push('date must be YYYY-MM-DD');
  if (nameMatch && typeof meta.date === 'string' && meta.date !== nameMatch[1]) errors.push('date in frontmatter must match the file name date');
  if (!CATEGORY_IDS.has(meta.category)) errors.push('category must be one of: ' + [...CATEGORY_IDS].join(', '));
  if (meta.time !== undefined && !/^\d{2}:\d{2}$/.test(String(meta.time))) errors.push('time must be HH:MM');
  if (meta.tags !== undefined && !Array.isArray(meta.tags)) errors.push('tags must be a [list]');
  if (meta.updated !== undefined && !DATE_RE.test(String(meta.updated))) errors.push('updated must be YYYY-MM-DD');
  const words = wordCount(body);
  if (words < 20) errors.push('body is too short to publish (' + words + ' words)');

  if (errors.length) return { errors, post: null };

  const id = fileName.replace(/\.md$/, '');
  return {
    errors,
    post: {
      id,
      path: 'data/upsc/notebook/posts/' + fileName,
      title: meta.title.trim(),
      date: meta.date,
      time: meta.time !== undefined ? String(meta.time) : null,
      category: meta.category,
      summary: meta.summary.trim(),
      week: typeof meta.week === 'number' ? meta.week : null,
      phase: typeof meta.phase === 'string' ? meta.phase : null,
      daysToGo: typeof meta.days_to_go === 'number' ? meta.days_to_go : null,
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      updated: meta.updated !== undefined ? String(meta.updated) : null,
      words,
    },
  };
}

function validateEncryptedPost(fileName, text) {
  const errors = [];
  const m = fileName.match(ENC_FILE_RE);
  if (!m) return { errors: ['file name must be YYYY-MM-DD-<category-or-slug>.md.enc'], post: null };
  const category = categoryFromSlug(m[2]);
  if (!category) errors.push('encrypted file name must start with a category id or a known alarm slug');
  let env = null;
  try { env = JSON.parse(text); } catch (e) { errors.push('not a JSON envelope'); }
  if (env && !(env.v === 1 && env.alg === 'RSA-OAEP-256+A256GCM' && env.ek && env.iv && env.ct)) errors.push('not a notebook envelope (v1 RSA-OAEP-256+A256GCM)');
  if (errors.length) return { errors, post: null };
  return {
    errors,
    post: {
      id: fileName.replace(/\.md\.enc$/, ''),
      path: 'data/upsc/notebook/posts/' + fileName,
      encrypted: true,
      kid: env.kid || null,
      title: null, time: null, summary: null, week: null, phase: null, daysToGo: null, tags: [], updated: null, words: null,
      date: m[1],
      category,
    },
  };
}

function buildIndex(postsDir, options) {
  const opts = options || {};
  const logDir = opts.logDir === undefined ? LOG_DIR : opts.logDir;
  const keysDir = opts.keysDir === undefined ? KEYS_DIR : opts.keysDir;
  const files = fs.existsSync(postsDir) ? fs.readdirSync(postsDir).filter((f) => f.endsWith('.md') || f.endsWith('.md.enc')).sort() : [];
  const posts = [];
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(postsDir, file), 'utf8');
    const { errors, post } = file.endsWith('.enc') ? validateEncryptedPost(file, text) : validatePost(file, text);
    if (errors.length) problems.push({ file, errors });
    else posts.push(post);
  }
  // A plaintext and an encrypted copy of the same entry: the encrypted one wins.
  const encryptedIds = new Set(posts.filter((p) => p.encrypted).map((p) => p.id));
  for (let i = posts.length - 1; i >= 0; i -= 1) if (!posts[i].encrypted && encryptedIds.has(posts[i].id)) posts.splice(i, 1);

  const logs = [];
  if (logDir && fs.existsSync(logDir)) {
    for (const file of fs.readdirSync(logDir).sort()) {
      const m = file.match(LOG_FILE_RE);
      if (!m) { problems.push({ file: 'log/' + file, errors: ['log file name must be YYYY-MM-DD.json or .json.enc'] }); continue; }
      logs.push({ date: m[1], path: 'data/upsc/notebook/log/' + file, encrypted: !!m[2] });
    }
    logs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  let lock = null;
  if (keysDir && fs.existsSync(path.join(keysDir, 'public.jwk'))) {
    const pub = JSON.parse(fs.readFileSync(path.join(keysDir, 'public.jwk'), 'utf8'));
    lock = {
      kid: pub.kid || null,
      publicKeyPath: 'data/upsc/notebook/keys/public.jwk',
      privateKeyPath: fs.existsSync(path.join(keysDir, 'private.enc')) ? 'data/upsc/notebook/keys/private.enc' : null,
    };
    if (fs.existsSync(path.join(keysDir, 'private.jwk'))) problems.push({ file: 'keys/private.jwk', errors: ['a plain private key must never be committed'] });
  }
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.time || '00:00';
    const tb = b.time || '00:00';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  const counts = {};
  for (const post of posts) counts[post.category] = (counts[post.category] || 0) + 1;
  return {
    index: {
      // Derived from the newest post rather than the clock, so a rebuild with
      // no new posts produces an identical file and no commit.
      generated: posts.length ? posts[0].date + (posts[0].time ? 'T' + posts[0].time : '') : null,
      categories: CATEGORIES.map((c) => Object.assign({}, c, { count: counts[c.id] || 0 })),
      lock,
      logs,
      posts,
    },
    problems,
  };
}

function main() {
  const check = process.argv.includes('--check');
  const { index, problems } = buildIndex(POSTS_DIR);
  for (const problem of problems) {
    console.error('skipped ' + problem.file + ': ' + problem.errors.join('; '));
  }
  if (check && problems.length) process.exit(1);
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
  console.log('indexed ' + index.posts.length + ' notebook posts' + (problems.length ? ' (' + problems.length + ' skipped)' : ''));
}

if (require.main === module) main();

module.exports = { CATEGORIES, parseFrontmatter, validatePost, validateEncryptedPost, categoryFromSlug, buildIndex, wordCount };
