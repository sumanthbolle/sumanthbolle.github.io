const fs = require('fs');

const postsFile = 'data/posts.json';
const interviewsFile = 'data/interviews.json';

let posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
let interviews = JSON.parse(fs.readFileSync(interviewsFile, 'utf8'));

let pFixes = 0;
let iFixes = 0;

function fixInterview(id, oldStr, newStr) {
  const iv = interviews.find(i => i.id === id);
  if (!iv) { console.log('  WARN: interview ' + id + ' not found'); return false; }
  if (!iv.answer.includes(oldStr)) { console.log('  WARN: interview ' + id + ' old string not found'); return false; }
  iv.answer = iv.answer.replace(oldStr, newStr);
  iFixes++;
  return true;
}

function fixPost(id, oldStr, newStr) {
  const p = posts.find(x => x.id === id);
  if (!p) { console.log('  WARN: post ' + id + ' not found'); return false; }
  if (!p.content.includes(oldStr)) { console.log('  WARN: post ' + id + ' old string not found'); return false; }
  p.content = p.content.replace(oldStr, newStr);
  pFixes++;
  return true;
}

// ========================================================
// INTERVIEW FIXES
// ========================================================

// FIX 1.2 — Interview 209: Reference field set to user_name
console.log('Fixing Interview 209: caller_id set to username...');
fixInterview(209,
  "newInc.caller_id = 'john.smith'; // Can use user_name or sys_id\nvar newSysId = newInc.insert();",
  "// Look up the caller by user_name to get their sys_id\nvar caller = new GlideRecord('sys_user');\ncaller.addQuery('user_name', 'john.smith');\ncaller.query();\nif (caller.next()) {\n  newInc.caller_id = caller.sys_id;\n}\nvar newSysId = newInc.insert();"
);

// FIX 1.6 — Interview 204: changesTo uses label instead of value
console.log('Fixing Interview 204: changesTo with label...');
fixInterview(204,
  "if (current.state.changesTo('approved')) {",
  "if (current.approval.changesTo('approved')) { // Use internal value; 'approved' is the value for the approval field"
);

// FIX 1.7 — Interview 212: Wrong inheritance for sc_req_item
console.log('Fixing Interview 212: sc_req_item extends sc_task...');
fixInterview(212,
  "// └── sc_task (extends task)\n//     └── Adds: request_item, catalog fields\n//         └── sc_req_item (extends sc_task)\n//             └── Adds: cat_item, stage, price",
  "// ├── sc_task (extends task)\n// │   └── Adds: request_item, catalog fields\n// │\n// └── sc_req_item (extends task)\n//     └── Adds: cat_item, stage, price\n//     NOTE: sc_req_item extends task directly, NOT sc_task"
);

// FIX 1.8 — Interview 205: Wrong claim about sys_id during clone
console.log('Fixing Interview 205: sys_id cloning claim...');
fixInterview(205,
  "// sys_ids are DIFFERENT between dev and prod instances!\n// A record cloned from prod gets a new sys_id in dev (usually).\n// Never hardcode sys_ids — use queries or system properties instead.",
  "// sys_ids are PRESERVED during instance cloning.\n// However, records created independently on separate instances\n// (e.g., a Business Rule built by hand in dev and separately in prod)\n// will have different sys_ids.\n// Never hardcode sys_ids — use queries or system properties instead."
);

// FIX 3.3 — Interview 210: Variable storage table imprecision
console.log('Fixing Interview 210: variable storage table...');
fixInterview(210,
  "they're in the <code>sc_item_option_mtom</code> table, linked to the RITM",
  "values are stored in the <code>sc_item_option</code> table, linked to the RITM via the <code>sc_item_option_mtom</code> many-to-many table"
);

// FIX 2.1 — Interview 208: Confusing ACL evaluation wording
console.log('Fixing Interview 208: ACL evaluation wording...');
fixInterview(208,
  "<li><strong>Most specific wins in evaluation, but ALL must pass:</strong></li>",
  "<li><strong>ACLs are evaluated from most specific to least specific, and ALL matching ACLs must pass (AND logic):</strong></li>"
);

// FIX 3.2 — Interview 209: getRowCount warning
console.log('Fixing Interview 209: getRowCount warning...');
fixInterview(209,
  "<code>getRowCount()</code> — number of results (use carefully on large tables)",
  "<code>getRowCount()</code> — executes a full COUNT(*) query; avoid on large tables. Use <code>GlideAggregate</code> with <code>addAggregate('COUNT')</code> instead"
);

// ========================================================
// BLOG POST FIXES
// ========================================================

// FIX 3.1 — Post 84: Grammatical error from spliced sentence
console.log('Fixing Post 84: grammatical error...');
fixPost(84,
  "If you are new, use this as a translation guide from <strong>marketing language</strong> to <strong>implementation thinking</strong>. I have been through enough enterprise rollouts to know that most teams get lost in the terminology before they even start building.",
  "I have been through enough enterprise rollouts to know that most teams get lost in the terminology before they even start building. If you are new, use this as a translation guide from <strong>marketing language</strong> to <strong>implementation thinking</strong>."
);

// FIX 1.13 — Post 70: Meaningless sys_id query
console.log('Fixing Post 70: meaningless sys_id query...');
fixPost(70,
  "grApps.addQuery('sys_id', '!=', ''); // Production apps only",
  "grApps.addQuery('install_status', '1'); // Installed/active apps\ngrApps.addQuery('operational_status', '1'); // Operational"
);

// FIX — Post 60: ACL evaluation order backwards
console.log('Fixing Post 60: ACL evaluation order...');
fixPost(60,
  "Master the evaluation order: Script Includes > Conditional > Role > Domain > Create ACLs",
  "Master the evaluation order within an ACL: Role check first (cheapest), then Condition filter, then Script (most expensive). All must pass"
);

// ========================================================
// BEGINNER POST ENRICHMENT — Add technical substance
// ========================================================

// Post 80 (ITSM): Add table names and basic GlideRecord
console.log('Enriching Post 80: ITSM with table names...');
fixPost(80,
  "<h3>The 4 Building Blocks (Simple View)</h3>",
  "<h3>The Core Tables</h3>\n<p>Every ITSM process maps to a real table in the platform:</p>\n<ul>\n  <li><code>incident</code> — break/fix records</li>\n  <li><code>sc_request</code> / <code>sc_req_item</code> — service requests and catalog items</li>\n  <li><code>problem</code> — root cause investigations</li>\n  <li><code>change_request</code> — planned changes with risk assessment</li>\n</ul>\n<p>All four extend the base <code>task</code> table, which means they share common fields like <code>number</code>, <code>state</code>, <code>assigned_to</code>, and <code>priority</code>.</p>\n\n<h3>The 4 Building Blocks (Simple View)</h3>"
);

// Post 81 (CMDB): Add CMDB Health and Discovery reference
console.log('Enriching Post 81: CMDB with technical details...');
fixPost(81,
  "<h3>Core CMDB Concepts</h3>",
  "<h3>Key Tables and Tools</h3>\n<p>In practice, CMDB work centers on a few key areas:</p>\n<ul>\n  <li><code>cmdb_ci</code> — the base CI table; extended by <code>cmdb_ci_server</code>, <code>cmdb_ci_database</code>, <code>cmdb_ci_appl</code>, etc.</li>\n  <li><strong>CMDB Health Dashboard</strong> — tracks completeness, compliance, and duplicate rates across CI classes.</li>\n  <li><strong>Identification and Reconciliation Engine (IRE)</strong> — prevents duplicate CIs by matching incoming data against existing records using identification rules.</li>\n  <li><strong>Discovery</strong> — auto-populates CMDB by scanning infrastructure (network, compute, storage) and mapping what it finds.</li>\n</ul>\n\n<h3>Core CMDB Concepts</h3>"
);

// Post 82 (CSDM): Add actual CSDM table names and a code snippet
console.log('Enriching Post 82: CSDM with table names...');
fixPost(82,
  "<h3>CSDM in Very Simple Layers</h3>",
  "<h3>CSDM Tables in the Platform</h3>\n<p>Each CSDM layer maps to a real table you can query:</p>\n<ul>\n  <li><code>cmdb_ci_service</code> — Business Services (what the business cares about)</li>\n  <li><code>cmdb_ci_service_discovered</code> — Application Services (what the app layer delivers)</li>\n  <li><code>cmdb_ci_business_app</code> — Business Applications (owned, governed app records)</li>\n  <li><code>cmdb_ci_appl</code> — Technical Application instances</li>\n</ul>\n<pre>// Quick CSDM health check: find business apps without owners\nvar gr = new GlideRecord('cmdb_ci_business_app');\ngr.addQuery('owned_by', 'NULL');\ngr.addQuery('install_status', '1'); // Installed\ngr.query();\ngs.info('Unowned business apps: ' + gr.getRowCount());</pre>\n\n<h3>CSDM in Very Simple Layers</h3>"
);

// Post 83 (Now Assist): Add plugin names and practical details
console.log('Enriching Post 83: Now Assist with implementation details...');
fixPost(83,
  "<h3>Implementation Checklist (Beginner-Friendly)</h3>",
  "<h3>What You Need to Know to Set It Up</h3>\n<p>Now Assist requires specific plugins and configuration:</p>\n<ul>\n  <li><strong>Plugins:</strong> <code>com.snc.now_assist_platform</code> (core), plus domain-specific plugins like <code>com.snc.now_assist_itsm</code> for IT workflows.</li>\n  <li><strong>Skills:</strong> Each Now Assist capability (summarize, generate, search) is configured as a \"skill\" in the Now Assist admin console. Skills are tied to specific tables and contexts.</li>\n  <li><strong>LLM Configuration:</strong> ServiceNow connects to its own LLM infrastructure. In the admin console, you configure which models are active, set guardrails, and review usage analytics.</li>\n  <li><strong>Data dependency:</strong> Now Assist summarization quality depends directly on the content in your knowledge base, case notes, and work notes. Sparse or inconsistent data produces poor results.</li>\n</ul>\n\n<h3>Implementation Checklist (Beginner-Friendly)</h3>"
);


// ========================================================
// WRITE OUTPUT
// ========================================================
fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
fs.writeFileSync(interviewsFile, JSON.stringify(interviews, null, 2));
fs.copyFileSync(postsFile, 'posts.json');
fs.copyFileSync(interviewsFile, 'interviews.json');

console.log('\nPost fixes: ' + pFixes);
console.log('Interview fixes: ' + iFixes);
console.log('Root JSON copies synced.');
