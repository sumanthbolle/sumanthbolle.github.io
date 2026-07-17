#!/usr/bin/env node
/**
 * Improve factual accuracy across blog posts + interview Q&A.
 *
 * Grounded in:
 * - ServiceNowDocs australia branch (llms.txt / GlideRecord / FlowAPI / Workflow API)
 * - @servicenow/sdk explain (Fluent, Now.ID, modules, now.config.json)
 *
 * Canonical store is data/*.json (pages load data/ first). Root copies are synced.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const postsFile = path.join(ROOT, 'data', 'posts.json');
const interviewsFile = path.join(ROOT, 'data', 'interviews.json');

let posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
let interviews = JSON.parse(fs.readFileSync(interviewsFile, 'utf8'));

let pFixes = 0;
let iFixes = 0;
const log = [];

function note(msg) {
  log.push(msg);
  console.log(msg);
}

function fixPost(id, oldStr, newStr, label) {
  const p = posts.find((x) => x.id === id);
  if (!p) {
    note(`  SKIP post ${id}: not found (${label})`);
    return false;
  }
  if (!p.content.includes(oldStr)) {
    note(`  SKIP post ${id}: string not found (${label})`);
    return false;
  }
  p.content = p.content.replace(oldStr, newStr);
  pFixes++;
  note(`  OK post ${id}: ${label}`);
  return true;
}

function fixPostAll(id, oldStr, newStr, label) {
  const p = posts.find((x) => x.id === id);
  if (!p) {
    note(`  SKIP post ${id}: not found (${label})`);
    return 0;
  }
  let n = 0;
  while (p.content.includes(oldStr)) {
    p.content = p.content.replace(oldStr, newStr);
    n++;
    pFixes++;
  }
  if (n) note(`  OK post ${id}: ${label} ×${n}`);
  else note(`  SKIP post ${id}: string not found (${label})`);
  return n;
}

function fixInterview(id, oldStr, newStr, label) {
  const iv = interviews.find((i) => i.id === id);
  if (!iv) {
    note(`  SKIP interview ${id}: not found (${label})`);
    return false;
  }
  if (!iv.answer.includes(oldStr)) {
    note(`  SKIP interview ${id}: string not found (${label})`);
    return false;
  }
  iv.answer = iv.answer.replace(oldStr, newStr);
  iFixes++;
  note(`  OK interview ${id}: ${label}`);
  return true;
}

function fixInterviewAll(id, oldStr, newStr, label) {
  const iv = interviews.find((i) => i.id === id);
  if (!iv) {
    note(`  SKIP interview ${id}: not found (${label})`);
    return 0;
  }
  let n = 0;
  while (iv.answer.includes(oldStr)) {
    iv.answer = iv.answer.replace(oldStr, newStr);
    n++;
    iFixes++;
  }
  if (n) note(`  OK interview ${id}: ${label} ×${n}`);
  else note(`  SKIP interview ${id}: string not found (${label})`);
  return n;
}

// ========================================================
// 1. GlideRecord null queries — official API is addNullQuery
// Source: ServiceNowDocs australia …/c_UsingGlideRecordToQueryTables.md
// ========================================================
note('\n[1] Null queries → addNullQuery()');
fixPost(
  82,
  "gr.addQuery('owned_by', 'NULL');\ngr.addQuery('install_status', '1'); // Installed\ngr.query();\ngs.info('Unowned business apps: ' + gr.getRowCount());",
  "gr.addNullQuery('owned_by'); // Official null API (not addQuery(..., 'NULL'))\ngr.addQuery('install_status', '1'); // Installed\ngr.query();\nvar count = 0;\nwhile (gr.next()) { count++; }\ngs.info('Unowned business apps: ' + count);",
  'CSDM null owner query'
);
fixPost(
  70,
  "grApps.addQuery('owned_by', 'NULL');\n    grApps.addQuery('active', true);",
  "grApps.addNullQuery('owned_by'); // Prefer addNullQuery for empty reference fields\n    grApps.addQuery('active', true);",
  'CMDB ownership null query'
);

// Encoded-query ISEMPTY is valid in filters; GlideRecord script should use addNullQuery
fixPostAll(
  93,
  "noOwner.addQuery('owned_by', 'ISEMPTY', '');",
  "noOwner.addNullQuery('owned_by');",
  'GlideAggregate null owner'
);
fixPostAll(
  92,
  "<td><code>addQuery('assigned_to', 'ISEMPTY', '')</code></td>",
  "<td><code>addNullQuery('assigned_to')</code> <em>or</em> encoded <code>assigned_toISEMPTY</code></td>",
  'ISEMPTY script mapping'
);
fixPostAll(
  85,
  "<td>ISEMPTY</td><td><code>addQuery('assigned_to', 'ISEMPTY', '')</code></td><td>Field is empty</td>",
  "<td>ISEMPTY / null</td><td><code>addNullQuery('assigned_to')</code></td><td>Field is null/empty (prefer addNullQuery in script)</td>",
  'ISEMPTY operator table'
);
fixPostAll(
  85,
  "<td>ISNOTEMPTY</td><td><code>addQuery('assigned_to', 'ISNOTEMPTY', '')</code></td><td>Field is not empty</td>",
  "<td>ISNOTEMPTY</td><td><code>addNotNullQuery('assigned_to')</code></td><td>Field has a value</td>",
  'ISNOTEMPTY operator table'
);

// ========================================================
// 2. FlowAPI — startFlow exists but is replaced by getRunner()
// Source: ScriptableFlowAPI.md (australia)
// ========================================================
note('\n[2] FlowAPI → getRunner()');
fixPost(
  61,
  "sn_fd.FlowAPI.startFlow('global.incident_auto', { incident: current.sys_id });",
  "// FlowAPI.startFlow() still works but is replaced by ScriptableFlowRunner (getRunner)\nsn_fd.FlowAPI.getRunner()\n    .flow('global.incident_auto')\n    .inBackground()\n    .withInputs({ incident: current.getUniqueValue() })\n    .run();",
  'FlowAPI getRunner'
);

// ========================================================
// 3. Classic Workflow API — correct startFlow signature
// Source: c_Workflow_api.md — startFlow(workflowId, current, operation, vars)
// ========================================================
note('\n[3] Classic Workflow.startFlow signature');
fixPost(
  53,
  `    // Trigger remediation workflow
    var workflow = new Workflow().getWorkflowFromTable('incident', incidentId);
    workflow.startFlow('Auto Remediate ' + eventData.service, {
      incident_id: incidentId,
      service_name: eventData.service
    });`,
  `    // Trigger remediation via classic Workflow API
    // startFlow(workflowId, current, operation, vars) — not (name, inputsMap)
    var wf = new Workflow();
    var wfId = wf.getWorkflowFromName('Auto Remediate Service');
    var incidentGr = new GlideRecord('incident');
    if (wfId && incidentGr.get(incidentId)) {
      wf.startFlow(wfId, incidentGr, 'insert');
    }`,
  'Workflow.startFlow signature'
);

// ========================================================
// 4. gs.include — prefer Class.create / new ScriptIncludeName()
// ========================================================
note('\n[4] gs.include preferred pattern');
fixPost(
  87,
  "// Include another Script Include\ngs.include('MyUtilityLibrary');",
  "// Prefer instantiating the Script Include (Class.create pattern).\n// gs.include('MyUtilityLibrary') still exists for older includes, but\n// new MyUtilityLibrary() is the usual modern call site.\nvar utils = new MyUtilityLibrary();",
  'gs.include → new ScriptInclude'
);

// ========================================================
// 5. Release framing — Australia is current family (llms.txt)
// Keep historical upgrade scenarios; fix "current requirement" language
// ========================================================
note('\n[5] Release family framing (Australia current)');
fixPost(
  83,
  `// Check "Build name" — Now Assist skills began shipping with the
// Vancouver-era releases, and coverage expands with every release
// (Skill Kit, AI Agents, AI Control Tower arrived in later ones).
// Check the release notes for your build to confirm which skills
// and AI features are available to you.`,
  `// Check "Build name" on stats.do — Australia is the current family.
// Now Assist skills began shipping in earlier releases and expand each family
// (Skill Kit, AI Agents, AI Control Tower). Confirm which skills ship on your build
// via the release notes for that family.`,
  'Now Assist release framing'
);
fixPostAll(69, 'Install ServiceNow Studio (Xanadu P3+)', 'Install ServiceNow Studio (current Store / family build)', 'Xanadu Studio pin');
fixPostAll(50, 'zero-downtime upgrades via Xanadu patches', 'zero-downtime upgrades via family patches', 'Xanadu patches');
fixPostAll(50, 'Spin up a Xanadu developer instance', 'Spin up a current-family developer instance (PDI)', 'Xanadu PDI');
fixPostAll(59, 'Yokohama HLA docs mastery', 'current-family HLA docs mastery', 'Yokohama HLA');
fixPostAll(59, 'requires Yokohama+ plugins', 'requires the matching family plugins', 'Yokohama plugins');
fixPostAll(66, 'pre-Zurich deprecation warning', 'earlier-release deprecation warning', 'Zurich deprecation');
fixPostAll(66, 'Zurich+ deprecation pushes', 'Later-family deprecation pushes', 'Zurich+ deprecation');

// Interview scenarios pinned to Vancouver → release-agnostic production context
for (const id of [65, 64, 52, 51]) {
  fixInterviewAll(
    id,
    '(Vancouver release)',
    '(production instance)',
    'Vancouver scenario → production'
  );
}
fixInterviewAll(
  47,
  'clustered Vancouver instance',
  'clustered production instance',
  'Vancouver cluster → production'
);

// ========================================================
// 6. Now SDK / Fluent article + interview — align with @servicenow/sdk
// Sources: developing-apps-guide, fluent-overview, module-guide, keys-file,
//          ServiceNowDocs australia servicenow-fluent.md
// ========================================================
note('\n[6] Now SDK / Fluent accuracy (post 97 + interview 218)');

fixPost(
  97,
  `<p>This article is a practical, code-first tour of that workflow, grounded in the official <a href="https://github.com/ServiceNow/sdk-examples" target="_blank" rel="noopener">ServiceNow/sdk-examples</a> repository and the <a href="https://docs.servicenow.com/csh?topicname=servicenow-sdk.html&amp;version=latest" target="_blank" rel="noopener">ServiceNow SDK documentation</a>.</p>`,
  `<p>This article is a practical, code-first tour of that workflow, grounded in the official <a href="https://github.com/ServiceNow/sdk-examples" target="_blank" rel="noopener">ServiceNow/sdk-examples</a> repository, the <a href="https://github.com/ServiceNow/ServiceNowDocs/blob/australia/markdown/application-development/servicenow-fluent.md" target="_blank" rel="noopener">Australia-family Fluent docs</a>, and <code>npx @servicenow/sdk explain</code> (CLI docs for Fluent APIs).</p>`,
  'SDK doc links → ServiceNowDocs + explain'
);

fixPost(
  97,
  `<p>The declarative part (<em>when</em> the rule runs) lives in a <code>.now.ts</code> file; the actual server logic lives in a plain <code>.server.js</code> file referenced with <code>Now.include()</code>:</p>
<pre>import { BusinessRule } from '@servicenow/sdk/core'

BusinessRule({
    $id: Now.ID['set_order_priority'],
    name: 'Set Order Priority',
    active: true,
    table: 'x_myapp_order',
    when: 'before',
    script: Now.include('./set-order-priority.server.js'),
})</pre>
<p>The referenced <code>set-order-priority.server.js</code> is ordinary server-side ServiceNow JavaScript — the same GlideRecord / <code>gs</code> APIs you already know.</p>`,
  `<p>JavaScript <strong>modules</strong> are the modern, preferred approach for server-side logic in Fluent projects (typed Glide APIs via <code>@servicenow/glide</code>, <code>import</code>/<code>export</code>, reuse). <code>Now.include()</code> still inlines a file at build time when you want a classic script field.</p>
<pre>import { BusinessRule } from '@servicenow/sdk/core'
import { setOrderPriority } from '../server/set-order-priority'

BusinessRule({
    $id: Now.ID['set_order_priority'],
    name: 'Set Order Priority',
    active: true,
    table: 'x_myapp_order',
    when: 'before',
    action: ['insert', 'update'],
    script: setOrderPriority,
})</pre>
<p>The module under <code>src/server/</code> is ordinary ServiceNow server JavaScript — the same GlideRecord / <code>gs</code> APIs you already know — with optional TypeScript types from <code>@servicenow/glide</code>.</p>`,
  'BusinessRule → module preferred'
);

fixPost(
  97,
  `<pre># scaffold a new app (interactive)
now-sdk init

# type-check + transform your Fluent into deployable metadata
now-sdk build

# authenticate to an instance, then deploy the built app
now-sdk deploy</pre>`,
  `<pre># scaffold a new app (interactive, or use --appName/--scopeName flags)
npx @servicenow/sdk init

# type-check + transform Fluent into deployable metadata
npx @servicenow/sdk build

# authenticate, then install the built app on the instance
# (CLI alias: now-sdk deploy → now-sdk install)
npx @servicenow/sdk auth --add &lt;instance-url&gt; --type basic
npx @servicenow/sdk install</pre>`,
  'CLI: init/build/install'
);

fixPost(
  97,
  `<li><strong>Server logic is still ES5-era in global scope.</strong> Fluent is modern TypeScript, but the <code>.server.js</code> you reference runs under the platform's server engine — keep the usual scoped-vs-global scripting rules in mind.</li>`,
  `<li><strong>Prefer server modules; classic scripts still follow platform rules.</strong> Fluent is modern TypeScript, but server modules and inlined scripts still run under the platform engine — keep scoped-vs-global scripting rules in mind. Never invent sys_ids; always use <code>Now.ID['key']</code>.</li>`,
  'modules + Now.ID gotcha'
);

fixPost(
  97,
  `<li><a href="https://docs.servicenow.com/csh?topicname=servicenow-sdk.html&amp;version=latest" target="_blank" rel="noopener">ServiceNow SDK documentation</a> — CLI reference, Fluent API, and the deploy workflow.</li>`,
  `<li><a href="https://github.com/ServiceNow/ServiceNowDocs/blob/australia/markdown/application-development/servicenow-sdk/servicenow-sdk-landing.md" target="_blank" rel="noopener">ServiceNow SDK (Australia docs)</a> — CLI, Fluent, and install workflow.</li>
<li><code>npx @servicenow/sdk explain &lt;topic&gt;</code> — local Fluent API reference (BusinessRule, Table, Acl, Flow, …).</li>`,
  'Where next → australia docs + explain'
);

// Interview 218 — modules + install command + docs grounding
fixInterview(
  218,
  `<pre>import { BusinessRule } from '@servicenow/sdk/core'

BusinessRule({
    $id: Now.ID['set_order_priority'],
    name: 'Set Order Priority',
    active: true,
    table: 'x_myapp_order',
    when: 'before',
    script: Now.include('./set-order-priority.server.js'),
})</pre>
<p>The declarative "when it runs" lives in the <code>.now.ts</code> file; the server logic stays ordinary ServiceNow JavaScript in a referenced <code>.server.js</code>. A project has a <code>now.config.json</code> (which pins the app scope), a <code>src/fluent</code> folder, and a <code>now-sdk build</code> step.</p>`,
  `<pre>import { BusinessRule } from '@servicenow/sdk/core'
import { setOrderPriority } from '../server/set-order-priority'

BusinessRule({
    $id: Now.ID['set_order_priority'],
    name: 'Set Order Priority',
    active: true,
    table: 'x_myapp_order',
    when: 'before',
    action: ['insert', 'update'],
    script: setOrderPriority, // preferred: JS module (Now.include still works)
})</pre>
<p>The declarative "when it runs" lives in the <code>.now.ts</code> file; server logic preferably lives in a <code>src/server</code> module with typed Glide APIs. A project has <code>now.config.json</code> (scope + <code>scopeId</code>), <code>src/fluent</code>, and <code>now-sdk build</code> / <code>now-sdk install</code> steps.</p>`,
  'Fluent module + install CLI'
);

fixInterview(
  218,
  `<div class="tip-box"><strong>Score points:</strong> mention that <code>Now.ID['...']</code> generates stable keys so re-deploys update the same records (no duplicates), that server scripts still follow scoped-vs-global scripting rules, and that the official <em>ServiceNow/sdk-examples</em> repo has buildable samples for every component type.</div>`,
  `<div class="tip-box"><strong>Score points:</strong> mention that <code>Now.ID['...']</code> maps to stable sys_ids in <code>src/fluent/generated/keys.ts</code> (never hand-edit; never invent sys_ids), that JS modules are preferred over inlined <code>Now.include</code> scripts, that <code>now-sdk install</code> pushes the build to an instance, and that <em>ServiceNow/sdk-examples</em> plus <code>now-sdk explain</code> are the canonical references.</div>`,
  'score points → keys.ts + modules + install'
);

// ========================================================
// WRITE + sync root copies (pages fall back to root)
// ========================================================
fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2) + '\n');
fs.writeFileSync(interviewsFile, JSON.stringify(interviews, null, 2) + '\n');
fs.copyFileSync(postsFile, path.join(ROOT, 'posts.json'));
fs.copyFileSync(interviewsFile, path.join(ROOT, 'interviews.json'));

note(`\nDone. Post fixes: ${pFixes}; Interview fixes: ${iFixes}`);
note('Synced data/*.json → root posts.json / interviews.json');
