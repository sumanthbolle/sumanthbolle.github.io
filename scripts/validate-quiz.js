#!/usr/bin/env node
/*
 * validate-quiz.js — Structural & quality validator for the ServiceNow quiz bank.
 *
 * The quiz UI (quiz.html) shuffles the option order for every question. That
 * means any option whose text refers to a *position* ("All of the above",
 * "Both A and B", "Options 1 and 3", "None of the above") becomes wrong or
 * confusing once the order changes — a very common source of learner
 * complaints. This script flags those alongside the usual structural defects:
 *
 *   - correct index out of range / empty / duplicated
 *   - fewer than two options, empty option text
 *   - duplicate option text within a question
 *   - duplicate question stems within a category
 *   - positional / order-dependent options (shuffle-unsafe)
 *   - missing explanation
 *
 * Usage:
 *   node scripts/validate-quiz.js            # human-readable report
 *   node scripts/validate-quiz.js --json     # machine-readable report to stdout
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  path.join(ROOT, 'quiz-questions.json'),
  path.join(ROOT, 'data', 'quiz', 'questions.json'),
];

const POSITIONAL_PATTERNS = [
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\bboth a (and|&) b\b/i,
  /\ball of these\b/i,
  /\bnone of these\b/i,
  /\ba (and|&) b\b/i,
  /\b(both|all) of the (first|last)\b/i,
  /\boptions? \d+ (and|&|,)/i,
  /\banswers? [abcd] (and|&) [abcd]\b/i,
  /\bthe (first|second|third|fourth|last) (option|answer|choice)\b/i,
];

function isPositional(text) {
  return POSITIONAL_PATTERNS.some((re) => re.test(text));
}

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function validateQuestion(q, category) {
  const issues = [];
  const opts = Array.isArray(q.options) ? q.options : [];

  if (opts.length < 2) {
    issues.push({ level: 'error', code: 'too-few-options', detail: `${opts.length} option(s)` });
  }

  opts.forEach((o, i) => {
    if (norm(o) === '') issues.push({ level: 'error', code: 'empty-option', detail: `index ${i}` });
  });

  const seen = new Map();
  opts.forEach((o, i) => {
    const key = norm(o);
    if (key && seen.has(key)) {
      issues.push({ level: 'error', code: 'duplicate-option', detail: `index ${seen.get(key)} == ${i}: "${o}"` });
    } else if (key) {
      seen.set(key, i);
    }
  });

  const correct = Array.isArray(q.correct) ? q.correct : [];
  if (correct.length === 0) {
    issues.push({ level: 'error', code: 'no-correct', detail: 'correct[] is empty' });
  }
  const correctSeen = new Set();
  correct.forEach((c) => {
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= opts.length) {
      issues.push({ level: 'error', code: 'correct-out-of-range', detail: `correct index ${c} vs ${opts.length} options` });
    }
    if (correctSeen.has(c)) {
      issues.push({ level: 'error', code: 'duplicate-correct', detail: `index ${c}` });
    }
    correctSeen.add(c);
  });

  // Multi-answer sanity: q.multi (if present) should match correct length.
  if (q.multi != null && Number(q.multi) !== correct.length) {
    issues.push({ level: 'warn', code: 'multi-mismatch', detail: `multi=${q.multi} but ${correct.length} correct` });
  }

  // Shuffle-unsafe positional options.
  opts.forEach((o, i) => {
    if (isPositional(o)) {
      issues.push({ level: 'warn', code: 'positional-option', detail: `index ${i}: "${o}"` });
    }
  });

  const expl = norm(q.explanation);
  if (expl === '') {
    issues.push({ level: 'warn', code: 'no-explanation', detail: '' });
  } else if (/detailed explanation not provided/.test(expl)) {
    issues.push({ level: 'warn', code: 'placeholder-explanation', detail: '' });
  }

  if (norm(q.q) === '') {
    issues.push({ level: 'error', code: 'empty-stem', detail: '' });
  }

  return issues;
}

function run() {
  const src = SOURCES.find((s) => fs.existsSync(s));
  if (!src) {
    console.error('No quiz question file found.');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  const report = { source: path.relative(ROOT, src), generatedAt: new Date().toISOString(), categories: {}, totals: {} };

  const counts = { error: 0, warn: 0, questions: 0, flagged: 0 };
  const byCode = {};

  for (const category of Object.keys(data)) {
    const arr = data[category];
    if (!Array.isArray(arr)) continue;
    const stems = new Map();
    const catReport = [];

    arr.forEach((q) => {
      counts.questions += 1;
      const issues = validateQuestion(q, category);

      const stemKey = norm(q.q);
      if (stemKey && stems.has(stemKey)) {
        issues.push({ level: 'warn', code: 'duplicate-stem', detail: `also id ${stems.get(stemKey)}` });
      } else if (stemKey) {
        stems.set(stemKey, q.id);
      }

      if (issues.length) {
        counts.flagged += 1;
        issues.forEach((it) => {
          counts[it.level] += 1;
          byCode[it.code] = (byCode[it.code] || 0) + 1;
        });
        catReport.push({ id: q.id, q: String(q.q || '').slice(0, 90), issues });
      }
    });

    if (catReport.length) report.categories[category] = catReport;
  }

  report.totals = { ...counts, byCode };

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return report;
  }

  console.log(`Quiz validation — source: ${report.source}`);
  console.log(`Questions scanned: ${counts.questions}`);
  console.log(`Flagged questions: ${counts.flagged}  (errors: ${counts.error}, warnings: ${counts.warn})`);
  console.log('Issue breakdown:', JSON.stringify(byCode, null, 2));
  console.log('');
  for (const [cat, items] of Object.entries(report.categories)) {
    console.log(`\n=== ${cat} (${items.length} flagged) ===`);
    items.slice(0, 40).forEach((it) => {
      console.log(`  [${it.id}] ${it.q}`);
      it.issues.forEach((is) => console.log(`      ${is.level.toUpperCase()} ${is.code} — ${is.detail}`));
    });
    if (items.length > 40) console.log(`  … ${items.length - 40} more`);
  }
  return report;
}

if (require.main === module) run();
module.exports = { validateQuestion, isPositional };
