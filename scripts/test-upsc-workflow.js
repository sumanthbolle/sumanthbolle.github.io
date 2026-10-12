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
const readWorkflow = (name) => fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', name),
  'utf8',
);
const editionWorkflow = readWorkflow('upsc-edition.yml');
const liveWorkflow = readWorkflow('upsc-live.yml');
const pocketWorkflow = readWorkflow('upsc-pocket.yml');
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
assert.match(publishWorkflow, /python scripts\/upsc\/discovery\.py --archive data\/upsc/);
assert.ok(publishWorkflow.indexOf('discovery.py --archive') < publishWorkflow.indexOf('Commit generated publication'));
assert.match(publishWorkflow, /node scripts\/test-upsc-shell\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-packet\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-guide\.js/);
assert.match(publishWorkflow, /node scripts\/test-upsc-scroll\.js/);
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
assert.match(revisionWorkflow, /group: upsc-data/);
assert.doesNotMatch(revisionWorkflow, /cron: "15 0,6,12,18 \* \* \*"/);
assert.doesNotMatch(revisionWorkflow, /cron: '30 1 \* \* \*'/);

assert.match(prelimsWorkflow, /cron: "0 20 \* \* \*"/);
assert.match(prelimsWorkflow, /scripts\/upsc\/prelims_quiz\.py/);
assert.match(prelimsWorkflow, /data\/upsc\/prelims-quiz\.json/);
assert.match(prelimsWorkflow, /group: upsc-data/);
assert.doesNotMatch(prelimsWorkflow, /quiz-questions\.json/);

// Every workflow that commits to data/upsc shares one queue so pushes cannot race.
for (const [name, workflow] of Object.entries({
  'upsc-publish.yml': publishWorkflow,
  'upsc-prelims.yml': prelimsWorkflow,
  'upsc-revision.yml': revisionWorkflow,
  'upsc-pocket.yml': pocketWorkflow,
  'upsc-daily.yml': dailyWorkflow,
  'upsc-edition.yml': editionWorkflow,
})) {
  assert.match(
    workflow,
    /concurrency:\s+group: upsc-data\s+cancel-in-progress: false/,
    `${name} must use the upsc-data concurrency group`,
  );
  assert.doesNotMatch(workflow, /group: upsc-official-publisher/, name);
}

// upsc-live polls every 5 minutes. In a shared group each new pending run
// cancels the previous pending one, which could cancel a queued edition, so it
// keeps its own queue and relies on pull --rebase before pushing.
assert.match(liveWorkflow, /concurrency:\s+group: upsc-live-publisher\s+cancel-in-progress: false/);
assert.doesNotMatch(liveWorkflow, /group: upsc-data/);
assert.match(liveWorkflow, /git pull --rebase origin "\$GITHUB_REF_NAME"/);

assert.match(publishWorkflow, /node scripts\/test-upsc-edition-integration\.js/);
assert.match(editionWorkflow, /node scripts\/test-upsc-edition-integration\.js/);

assert.match(editionWorkflow, /cron: "15 0 \* \* \*"/);
assert.match(editionWorkflow, /cron: "45 0 \* \* \*"/);
assert.match(editionWorkflow, /cron: "15 12 \* \* \*"/);
assert.match(editionWorkflow, /cron: "45 12 \* \* \*"/);
assert.match(editionWorkflow, /workflow_dispatch:[\s\S]*slot:[\s\S]*dry_run:/);
assert.match(editionWorkflow, /permissions:\s+contents: write\s+issues: write/);
assert.match(editionWorkflow, /OPENAI_API_KEY:\s+\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
assert.match(editionWorkflow, /GEMINI_API_KEY:\s+\$\{\{ secrets\.GEMINI_API_KEY \}\}/);
assert.doesNotMatch(editionWorkflow, /CLOUDFLARE_API_TOKEN|UPSC_PUBLISH_TOKEN/);
const editionStep = editionWorkflow.indexOf('python scripts/upsc/edition.py');
assert.ok(editionStep > 0);
assert.ok(editionWorkflow.indexOf("python -m unittest discover -s scripts/upsc -p 'test_*.py'") < editionStep);
assert.ok(editionWorkflow.indexOf('publish.py ingest') < editionStep);
assert.ok(editionStep < editionWorkflow.indexOf('node scripts/generate-sitemap.js'));
assert.match(editionWorkflow, /--slot "\$SLOT"/);
{
  const build = editionWorkflow.slice(editionWorkflow.indexOf('- name: Build the edition'), editionWorkflow.indexOf('- name: Refresh sitemap'));
  assert.match(build, /set -o pipefail/, 'the edition build pipes into tee and must fail when the builder fails');
}
assert.match(editionWorkflow, /git add data\/upsc upsc-study sitemap\.xml/);
assert.match(editionWorkflow, /for attempt in 1 2 3/);
assert.match(editionWorkflow, /git pull --rebase origin "\$GITHUB_REF_NAME"/);
assert.match(editionWorkflow, /upsc-edition-late/);
assert.match(editionWorkflow, /if: always\(\)/);
assert.match(editionWorkflow, /'45 0 \* \* \*'/);

assert.match(workerSource, /pathname === '\/upsc\/verify'/);
assert.match(workerSource, /function handleUpscVerify/);
assert.match(upscApi, /export function buildUpscVerifyPayload/);
assert.match(upscApi, /export function normalizeUpscVerification/);
assert.match(upscApi, /model: 'sonar-pro'/);

console.log('UPSC workflow tests passed');
