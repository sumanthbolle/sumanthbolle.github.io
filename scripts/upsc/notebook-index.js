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
const POSTS_DIR = path.join(ROOT, 'data', 'upsc', 'notebook', 'posts');
const INDEX_PATH = path.join(ROOT, 'data', 'upsc', 'notebook', 'index.json');

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

function buildIndex(postsDir) {
  const files = fs.existsSync(postsDir) ? fs.readdirSync(postsDir).filter((f) => f.endsWith('.md')).sort() : [];
  const posts = [];
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(postsDir, file), 'utf8');
    const { errors, post } = validatePost(file, text);
    if (errors.length) problems.push({ file, errors });
    else posts.push(post);
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
      generated: new Date().toISOString(),
      categories: CATEGORIES.map((c) => Object.assign({}, c, { count: counts[c.id] || 0 })),
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

module.exports = { CATEGORIES, parseFrontmatter, validatePost, buildIndex, wordCount };
