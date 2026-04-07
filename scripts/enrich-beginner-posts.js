const fs = require('fs');
let posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));
let fixes = 0;

function enrich(id, after, insert) {
  const p = posts.find(x => x.id === id);
  if (!p) { console.log('Post ' + id + ' not found'); return; }
  if (!p.content.includes(after)) { console.log('Post ' + id + ': anchor not found: ' + after.substring(0,50)); return; }
  p.content = p.content.replace(after, after + insert);
  fixes++;
}

// Post 76 — Buzzword Map: Add code example and practical technical context
console.log('Enriching Post 76: Buzzword Map...');
const p76 = posts.find(p => p.id === 76);
if (p76) {
  p76.content = p76.content.replace(
    '<h3>How to Use This as a Beginner</h3>',
    `<h3>See It in the Platform</h3>
<p>Each of these buzzwords maps to real tables and modules you can open right now in a PDI:</p>
<table>
  <tr><th>Term</th><th>Where to find it</th><th>Key table</th></tr>
  <tr><td>ITSM</td><td>Incident > All, Change > All</td><td><code>incident</code>, <code>change_request</code></td></tr>
  <tr><td>CMDB</td><td>Configuration > Servers, All CIs</td><td><code>cmdb_ci</code></td></tr>
  <tr><td>CSDM</td><td>CMDB Workspace > Service Mapping</td><td><code>cmdb_ci_service</code>, <code>cmdb_ci_business_app</code></td></tr>
  <tr><td>SecOps</td><td>Security Operations > Vulnerabilities</td><td><code>sn_vul_vulnerability</code></td></tr>
  <tr><td>App Engine</td><td>App Engine Studio</td><td><code>sys_app</code></td></tr>
  <tr><td>Now Assist</td><td>Now Assist Admin Console</td><td>Skills configuration</td></tr>
</table>
<pre>// Quick check: how many incidents exist in your instance?
var ga = new GlideAggregate('incident');
ga.addAggregate('COUNT');
ga.query();
if (ga.next()) {
    gs.info('Total incidents: ' + ga.getAggregate('COUNT'));
}
// Try this in a Background Script on your PDI.</pre>

<h3>How to Use This as a Beginner</h3>`
  );
  fixes++;
}

// Post 77 — App Engine: Add Flow Designer and table creation example
console.log('Enriching Post 77: App Engine...');
enrich(77,
  '<h3>App Engine Core Ingredients</h3>',
  `
<h3>What It Looks Like in Practice</h3>
<p>In App Engine Studio, you build an app by defining:</p>
<pre>// 1. A custom table (e.g., vendor onboarding requests)
//    Table name: x_myapp_vendor_request
//    Fields: vendor_name (string), status (choice), risk_level (choice),
//            legal_approved (true/false), finance_approved (true/false)

// 2. A Flow Designer flow triggered on record insert:
//    Trigger: Record Created on x_myapp_vendor_request
//    Action 1: Ask for Approval (legal_team group)
//    Action 2: If approved, Ask for Approval (finance_team group)
//    Action 3: If both approved, set status = 'Active'
//    Action 4: Send Notification to requester

// 3. A workspace page (Next Experience UI) for users to submit and track requests</pre>
<p>Everything — the table, the flow, the roles, the UI — lives inside a scoped application. You deploy it through Update Sets or Source Control Integration, same as any other ServiceNow customization.</p>
`);

// Post 78 — IRM: Add GRC table names and a control query
console.log('Enriching Post 78: IRM...');
enrich(78,
  '<h3>Simple IRM Building Blocks</h3>',
  `
<h3>GRC Tables in the Platform</h3>
<p>IRM/GRC has its own set of tables under the <code>sn_grc_</code> namespace:</p>
<table>
  <tr><th>Table</th><th>What it stores</th></tr>
  <tr><td><code>sn_grc_policy</code></td><td>Policy statements and requirements</td></tr>
  <tr><td><code>sn_grc_control</code></td><td>Controls with owners and testing schedules</td></tr>
  <tr><td><code>sn_grc_risk</code></td><td>Risk records linked to profiles and controls</td></tr>
  <tr><td><code>sn_grc_issue</code></td><td>Issues and exceptions found during testing</td></tr>
  <tr><td><code>sn_grc_indicator</code></td><td>Key risk indicators tracked over time</td></tr>
</table>
<pre>// Find controls that have not been tested in the last 90 days
var gr = new GlideRecord('sn_grc_control');
gr.addQuery('active', true);
gr.addQuery('last_test_date', '&lt;', gs.daysAgo(90));
gr.addQuery('last_test_date', 'ISNOTEMPTY', '');
gr.query();
while (gr.next()) {
    gs.info('Overdue control: ' + gr.getValue('name') +
            ' | Owner: ' + gr.getDisplayValue('owned_by') +
            ' | Last tested: ' + gr.getValue('last_test_date'));
}</pre>
`);

// Post 79 — SecOps: Add vulnerability tables and a remediation query
console.log('Enriching Post 79: SecOps...');
enrich(79,
  '<h3>Beginner-Friendly Terms</h3>',
  `
<h3>Key SecOps Tables</h3>
<table>
  <tr><th>Table</th><th>What it stores</th></tr>
  <tr><td><code>sn_vul_vulnerability</code></td><td>Vulnerability definitions (CVE data)</td></tr>
  <tr><td><code>sn_vul_vulnerable_item</code></td><td>CIs affected by a vulnerability</td></tr>
  <tr><td><code>sn_si_incident</code></td><td>Security incidents</td></tr>
  <tr><td><code>sn_vul_remediation_task</code></td><td>Remediation work assigned to teams</td></tr>
</table>
<pre>// Find critical open remediation tasks older than 30 days
var gr = new GlideRecord('sn_vul_remediation_task');
gr.addQuery('state', '!=', 3);  // not closed
gr.addQuery('priority', 1);     // critical
gr.addQuery('sys_created_on', '&lt;', gs.daysAgo(30));
gr.query();
gs.info('Overdue critical remediations: ' + gr.getRowCount());
while (gr.next()) {
    gs.info(gr.getValue('number') + ' | ' +
            gr.getDisplayValue('assigned_to') + ' | ' +
            gr.getDisplayValue('vulnerability'));
}</pre>
`);

fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
fs.copyFileSync('data/posts.json', 'posts.json');
console.log('Enriched ' + fixes + ' posts.');
