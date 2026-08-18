'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'upsc-publish.yml'),
  'utf8',
);

assert.match(workflow, /cron: "15 0,6,12,18 \* \* \*"/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s+contents: write/);
assert.match(workflow, /UPSC_ENRICH_ENDPOINT/);
assert.match(workflow, /UPSC_PUBLISH_TOKEN/);
assert.ok(workflow.indexOf('Verify publisher configuration') < workflow.indexOf('Ingest official records'));
assert.match(workflow, /check-sources[\s\S]*--strict/);
assert.match(workflow, /publish\.py build-pages/);
assert.match(workflow, /node scripts\/generate-sitemap\.js/);
assert.match(workflow, /git add data\/upsc upsc-study sitemap\.xml/);

console.log('UPSC workflow tests passed');
