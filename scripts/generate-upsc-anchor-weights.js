// scripts/generate-upsc-anchor-weights.js
// Compiles data/upsc-patterns.json into api/upsc-anchors.js.
//
// A Cloudflare Worker has no filesystem, so the anchor index has to be a module
// the bundler can inline. This generator is the only thing that writes that
// module: edit the dataset, run this, commit both.
//
// Regenerate after any change to data/upsc-patterns.json:
//   node scripts/generate-upsc-anchor-weights.js

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(process.cwd(), 'data', 'upsc-patterns.json');
const TARGET = path.join(process.cwd(), 'api', 'upsc-anchors.js');

/* The matcher pads both the text and the alias with spaces, so a two-letter
 * alias is still whole-word: " ai " never matches inside "said". This floor
 * exists only to drop single characters. */
const MIN_MATCH_LENGTH = 2;

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function main() {
  const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const anchors = data.anchors || [];

  const entries = anchors.map((anchor) => {
    const match = [];
    [anchor.anchor].concat(anchor.aliases || [], [anchor.id.replace(/-/g, ' ')])
      .map(normalise)
      .filter((value) => value.length >= MIN_MATCH_LENGTH)
      .forEach((value) => { if (match.indexOf(value) === -1) match.push(value); });

    /* Longest first: "fiscal federalism" must win over "federalism" when both
     * are present in the index. */
    match.sort((a, b) => b.length - a.length);

    return {
      id: anchor.id,
      anchor: anchor.anchor,
      band: anchor.band,
      frequency: anchor.frequency_est,
      recencyGap: anchor.recency_gap_est,
      papers: anchor.papers,
      codes: anchor.codes,
      match,
    };
  });

  entries.sort((a, b) => b.frequency - a.frequency);

  const header = `/*
 * GENERATED FILE — do not edit by hand.
 *
 * Source:    data/upsc-patterns.json (version ${data.version}, compiled ${data.compiled})
 * Generator: scripts/generate-upsc-anchor-weights.js
 *
 * The Worker cannot read the repository at runtime, so the anchor index is
 * inlined here for the scorer in api/upsc.js. Frequencies and recency gaps are
 * editorial estimates from the recurring-theme compilation, not counts from a
 * tagged corpus of past questions — which is why PATTERN_META.provisional is
 * true and every scored response says so.
 */

export const PATTERN_META = ${JSON.stringify({
    version: data.version,
    compiled: data.compiled,
    provisional: data.provisional !== false,
    anchorCount: entries.length,
  }, null, 2)};

`;

  const body = 'export const ANCHOR_INDEX = ' + JSON.stringify(entries, null, 2) + ';\n';

  fs.writeFileSync(TARGET, header + body);

  const matchCount = entries.reduce((n, e) => n + e.match.length, 0);
  console.log(`✅ Wrote ${path.relative(process.cwd(), TARGET)}`);
  console.log(`   ${entries.length} anchors · ${matchCount} match strings · source version ${data.version}`);
}

main();
