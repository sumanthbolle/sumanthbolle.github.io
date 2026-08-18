'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publishWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'upsc-publish.yml'),
  'utf8',
);
const dailyWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'upsc-daily.yml'),
  'utf8',
);

assert.match(publishWorkflow, /cron: "15 0,6,12,18 \* \* \*"/);
assert.match(publishWorkflow, /workflow_dispatch:/);
assert.match(publishWorkflow, /permissions:\s+contents: write/);
assert.doesNotMatch(publishWorkflow, /ref:\s+main/);
assert.match(publishWorkflow, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
assert.match(publishWorkflow, /UPSC_ENRICH_ENDPOINT/);
assert.match(publishWorkflow, /UPSC_PUBLISH_TOKEN/);
assert.doesNotMatch(publishWorkflow, /Verify publisher configuration/);
assert.match(publishWorkflow, /Optional enrichment is not configured/);
assert.match(publishWorkflow, /set -o pipefail[\s\S]*check-sources[\s\S]*tee data\/upsc\/source-health\.json/);
assert.match(publishWorkflow, /--min-healthy 5/);
assert.doesNotMatch(publishWorkflow, /--strict/);
assert.ok(publishWorkflow.indexOf('Ingest official records') < publishWorkflow.indexOf('Enrich source records'));
assert.match(publishWorkflow, /publish\.py build-pages/);
assert.match(publishWorkflow, /node scripts\/generate-sitemap\.js/);
assert.match(publishWorkflow, /git add data\/upsc upsc-study sitemap\.xml/);

assert.match(
  dailyWorkflow,
  /PERPLEXITY_API_KEY:\s+\$\{\{ secrets\.PERPLEXITY_API_KEY \}\}/,
);
assert.doesNotMatch(dailyWorkflow, /secrets\.PPLX_API_KEY/);
assert.match(dailyWorkflow, /node scripts\/test-upsc-triggers\.js/);

console.log('UPSC workflow tests passed');
