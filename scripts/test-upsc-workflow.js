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
const revisionWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'upsc-revision.yml'),
  'utf8',
);
const prelimsWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'upsc-prelims.yml'),
  'utf8',
);
const workerSource = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'worker.js'),
  'utf8',
);
const upscApi = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'upsc.js'),
  'utf8',
);

assert.match(publishWorkflow, /cron: "15 0,6,12,18 \* \* \*"/);
assert.match(publishWorkflow, /workflow_dispatch:/);
assert.match(publishWorkflow, /permissions:\s+contents: write/);
assert.match(publishWorkflow, /issues:\s+write/);
assert.doesNotMatch(publishWorkflow, /ref:\s+main/);
assert.match(publishWorkflow, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
assert.match(publishWorkflow, /UPSC_ENRICH_ENDPOINT/);
assert.match(publishWorkflow, /UPSC_PUBLISH_TOKEN/);
assert.doesNotMatch(publishWorkflow, /Verify publisher configuration/);
assert.match(publishWorkflow, /Optional enrichment is not configured/);
assert.match(publishWorkflow, /scripts\/upsc\/mains_generator\.py/);
assert.match(publishWorkflow, /scripts\/upsc\/verify\.py/);
assert.match(publishWorkflow, /upsc-needs-review/);
assert.match(publishWorkflow, /set -o pipefail[\s\S]*check-sources[\s\S]*tee data\/upsc\/source-health\.json/);
assert.match(publishWorkflow, /--min-healthy 5/);
assert.match(publishWorkflow, /scripts\/upsc\/alerting\.py/);
assert.match(publishWorkflow, /upsc-source-health/);
assert.match(publishWorkflow, /actions\/github-script@v7/);
assert.match(publishWorkflow, /Snapshot previous source health/);
assert.doesNotMatch(publishWorkflow, /--strict/);
assert.ok(publishWorkflow.indexOf('Ingest official records') < publishWorkflow.indexOf('Enrich source records'));
assert.match(publishWorkflow, /publish\.py build-pages/);
assert.match(publishWorkflow, /node scripts\/test-upsc-shell\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-packet\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-guide\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-coach\.js/);
assert.match(publishWorkflow, /node scripts\/generate-sitemap\.js/);
assert.match(publishWorkflow, /git add data\/upsc upsc-study sitemap\.xml/);

assert.match(
  dailyWorkflow,
  /PERPLEXITY_API_KEY:\s+\$\{\{ secrets\.PERPLEXITY_API_KEY \}\}/,
);
assert.doesNotMatch(dailyWorkflow, /secrets\.PPLX_API_KEY/);
assert.match(dailyWorkflow, /node scripts\/test-upsc-triggers\.js/);

assert.match(revisionWorkflow, /cron: "30 19 \* \* \*"/);
assert.match(revisionWorkflow, /scripts\/upsc\/revision\.py/);
assert.match(revisionWorkflow, /data\/upsc\/revision-queue\.json/);
assert.match(revisionWorkflow, /group: upsc-official-publisher/);
assert.doesNotMatch(revisionWorkflow, /cron: "15 0,6,12,18 \* \* \*"/);
assert.doesNotMatch(revisionWorkflow, /cron: '30 1 \* \* \*'/);

assert.match(prelimsWorkflow, /cron: "0 20 \* \* \*"/);
assert.match(prelimsWorkflow, /scripts\/upsc\/prelims_quiz\.py/);
assert.match(prelimsWorkflow, /data\/upsc\/prelims-quiz\.json/);
assert.match(prelimsWorkflow, /group: upsc-official-publisher/);
assert.doesNotMatch(prelimsWorkflow, /quiz-questions\.json/);

assert.match(workerSource, /pathname === '\/upsc\/verify'/);
assert.match(workerSource, /function handleUpscVerify/);
assert.match(upscApi, /export function buildUpscVerifyPayload/);
assert.match(upscApi, /export function normalizeUpscVerification/);
assert.match(upscApi, /model: 'sonar-pro'/);

console.log('UPSC workflow tests passed');
