// scripts/validate-upsc-patterns.js
// Structural validation for data/upsc-patterns.json.
//
// The dataset is hand-maintained and read by three consumers — the pattern
// atlas page, the anchor-weight generator that feeds the Worker's scorer, and
// the daily trigger refresh. A malformed code or a dangling link breaks them
// quietly, so this runs in the workflow and before any commit that touches it.
//
// Usage: node scripts/validate-upsc-patterns.js [path]

const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(process.cwd(), 'data', 'upsc-patterns.json');

const CODE_SHAPE = /^(GS[1-4]\.\d{1,2}|ESSAY\.[AB])$/;
const ID_SHAPE = /^[a-z][a-z0-9-]{2,60}$/;
const VALID_MARKS = [10, 15, 20, 125];

const REQUIRED_FIELDS = [
  'id', 'anchor', 'aliases', 'papers', 'codes', 'band', 'recurrence',
  'frequency_est', 'recency_gap_est', 'verbs', 'trigger_types', 'static_core',
  'prelims_angle', 'traps', 'skeleton', 'stems', 'linked', 'verify',
];

/* Phrases that would signal an unsourced figure has crept into the standing
 * dataset. Numbers belong in the verify field as something to confirm, never
 * asserted in static_core — a fluent wrong figure is the failure mode this
 * whole project is built to avoid. */
const NUMERIC_CLAIM = /\b\d+(\.\d+)?\s?(per cent|percent|%|crore|lakh|billion|million|trillion)\b/i;

const problems = [];
const warnings = [];

function fail(message) {
  problems.push(message);
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`✖ Not found: ${FILE}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error(`✖ Invalid JSON: ${e.message}`);
    process.exit(1);
  }

  ['version', 'compiled', 'provisional', 'methodology', 'bands', 'verbs', 'triggerTypes', 'papers', 'anchors']
    .forEach((key) => { if (data[key] === undefined) fail(`top level missing "${key}"`); });

  if (data.provisional !== true) {
    warnings.push('provisional is not true — only drop this flag once frequencies come from a tagged PYQ corpus');
  }

  const anchors = Array.isArray(data.anchors) ? data.anchors : [];
  if (!anchors.length) {
    fail('anchors array is empty');
  }

  if (data.anchorCount !== anchors.length) {
    fail(`anchorCount says ${data.anchorCount} but the array holds ${anchors.length}`);
  }

  const verbs = new Set(data.verbs || []);
  const triggers = new Set(Object.keys(data.triggerTypes || {}));
  const bands = new Set(Object.keys(data.bands || {}));
  const papers = new Set(Object.keys(data.papers || {}));
  const ids = anchors.map((a) => a && a.id);

  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) fail(`duplicate id "${id}"`);
  });

  anchors.forEach((anchor, index) => {
    const label = (anchor && anchor.id) || `anchors[${index}]`;

    REQUIRED_FIELDS.forEach((field) => {
      if (anchor[field] === undefined) fail(`${label}: missing "${field}"`);
    });

    if (!ID_SHAPE.test(anchor.id || '')) fail(`${label}: id must be lowercase kebab-case`);
    if (!bands.has(anchor.band)) fail(`${label}: unknown band "${anchor.band}"`);

    [['frequency_est', anchor.frequency_est], ['recency_gap_est', anchor.recency_gap_est]]
      .forEach(([field, value]) => {
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          fail(`${label}: ${field} must be a number between 0 and 100`);
        }
      });

    (anchor.papers || []).forEach((paper) => {
      if (!papers.has(paper)) fail(`${label}: unknown paper "${paper}"`);
    });

    (anchor.codes || []).forEach((code) => {
      if (!CODE_SHAPE.test(code)) fail(`${label}: malformed syllabus code "${code}"`);
      const paper = String(code).split('.')[0];
      if (!(anchor.papers || []).includes(paper)) {
        fail(`${label}: code ${code} is not covered by papers [${(anchor.papers || []).join(', ')}]`);
      }
    });

    (anchor.verbs || []).forEach((verb) => {
      if (!verbs.has(verb)) fail(`${label}: directive verb "${verb}" is not in the vocabulary`);
    });

    (anchor.trigger_types || []).forEach((trigger) => {
      if (!triggers.has(trigger)) fail(`${label}: unknown trigger type "${trigger}"`);
    });

    (anchor.linked || []).forEach((link) => {
      if (!ids.includes(link)) fail(`${label}: linked anchor "${link}" does not exist`);
      if (link === anchor.id) fail(`${label}: links to itself`);
    });

    (anchor.stems || []).forEach((stem, stemIndex) => {
      const stemLabel = `${label}: stems[${stemIndex}]`;
      if (!stem || !stem.stem) fail(`${stemLabel} has no text`);
      if (!verbs.has(stem && stem.verb)) fail(`${stemLabel} verb "${stem && stem.verb}" is not in the vocabulary`);
      if (!papers.has(stem && stem.paper)) fail(`${stemLabel} unknown paper "${stem && stem.paper}"`);
      if (!VALID_MARKS.includes(stem && stem.marks)) fail(`${stemLabel} marks must be one of ${VALID_MARKS.join(', ')}`);
    });

    if ((anchor.static_core || []).length < 3) fail(`${label}: static_core needs at least three points`);
    if ((anchor.traps || []).length < 2) fail(`${label}: traps needs at least two entries`);
    if ((anchor.skeleton || []).length < 3) fail(`${label}: skeleton needs at least three moves`);
    if ((anchor.stems || []).length < 2) fail(`${label}: stems needs at least two entries`);
    if (!(anchor.verify || []).length) fail(`${label}: verify must name at least one thing to confirm`);
    if ((anchor.aliases || []).length < 3) warnings.push(`${label}: only ${(anchor.aliases || []).length} aliases — matching against brief items will be weak`);

    (anchor.static_core || []).concat(anchor.traps || []).forEach((line) => {
      if (NUMERIC_CLAIM.test(line)) {
        fail(`${label}: unsourced figure in a standing field — move it to verify: "${String(line).slice(0, 70)}…"`);
      }
    });
  });

  console.log(`Anchors: ${anchors.length}`);
  const byPaper = {};
  anchors.forEach((a) => (a.papers || []).forEach((p) => { byPaper[p] = (byPaper[p] || 0) + 1; }));
  console.log(`Coverage: ${Object.entries(byPaper).map(([p, n]) => `${p} ${n}`).join(' · ')}`);
  const byBand = {};
  anchors.forEach((a) => { byBand[a.band] = (byBand[a.band] || 0) + 1; });
  console.log(`Bands:    ${Object.entries(byBand).map(([b, n]) => `${b} ${n}`).join(' · ')}`);
  console.log(`Stems:    ${anchors.reduce((n, a) => n + (a.stems || []).length, 0)}`);

  warnings.forEach((w) => console.log(`⚠ ${w}`));

  if (problems.length) {
    console.error(`\n✖ ${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log('\n✅ upsc-patterns.json is structurally valid');
}

main();
