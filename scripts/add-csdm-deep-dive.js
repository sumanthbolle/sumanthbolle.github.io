const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));

const newPost = {
  id: 93,
  title: "CSDM End to End: How a Single Outage Traces from a Linux Box to a Business Service (With Tables, Queries, and the Stuff Nobody Explains)",
  excerpt: "Walk through CSDM the way it actually works in production. One outage, traced from infrastructure CI through application service to business service to the executive who gets the call. Every table, every relationship, every query.",
  readTime: "22 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Intermediate",
  forPersona: ["Developers", "Admins", "Architects", "CMDB Analysts"],
  uniqueId: "csdm-end-to-end-deep-dive-1712610000000",
  date: "Apr 9, 2026",
  dateISO: "2026-04-09T12:00:00Z",
  content: `<h2>What this article is</h2>
<p>I have set up CSDM in multiple enterprise instances and the one thing I can tell you is — the official documentation gives you a model diagram and a list of tables, but nobody walks you through what actually happens when a server goes down at 2 AM and someone needs to know which business service just broke.</p>
<p>This article does that. One scenario, end to end. Every layer of CSDM, every table involved, every relationship that matters, and the GlideRecord queries to prove it.</p>

<h2>The scenario</h2>
<p>Your company runs an online ordering system. Customers place orders on the website, the order goes through a payment gateway, hits an order processing API, writes to a database, and triggers a fulfillment workflow. All of this runs on a handful of Linux servers in AWS.</p>
<p>At 2:14 AM on a Tuesday, one of the database servers runs out of disk space. The order processing API starts throwing 500 errors. Within minutes, the website checkout page is broken. Customers cannot complete purchases.</p>
<p>Here is the question CSDM answers: <strong>how does the on-call engineer — and then the VP of Commerce — know that a full disk on server DB-PROD-03 means the "Online Ordering" business service is down?</strong></p>

<h2>The layers — bottom to top</h2>
<p>CSDM is not one flat table. It is a stack of layers, each representing a different level of abstraction. The official model has 7 domains now (CSDM 5.0), but for understanding the core service chain, you need to internalize these layers:</p>

<table>
<tr><th>Layer</th><th>What it represents</th><th>Table</th><th>Example in our scenario</th></tr>
<tr><td>Infrastructure CIs</td><td>Physical or virtual compute, storage, network</td><td><code>cmdb_ci_server</code>, <code>cmdb_ci_linux_server</code>, <code>cmdb_ci_database</code></td><td>DB-PROD-03 (Linux server), OrderDB (MySQL instance)</td></tr>
<tr><td>Application</td><td>A discoverable running software instance</td><td><code>cmdb_ci_appl</code></td><td>Order Processing API (Node.js app running on APP-PROD-01)</td></tr>
<tr><td>Service Instance / Application Service</td><td>A logical grouping of applications and infra that delivers a specific technical capability</td><td><code>cmdb_ci_service_auto</code></td><td>"Order Processing Service" — the API + database + message queue working together</td></tr>
<tr><td>Business Application</td><td>A logical, governed representation of a software system in the portfolio</td><td><code>cmdb_ci_business_app</code></td><td>"Online Ordering Platform" — the application as leadership knows it</td></tr>
<tr><td>Business Service</td><td>A service published to the business, visible to users and executives</td><td><code>cmdb_ci_service_business</code></td><td>"Online Ordering" — the thing the VP of Commerce talks about in quarterly reviews</td></tr>
<tr><td>Business Service Offering</td><td>A specific flavor or tier of a business service with SLA commitments</td><td><code>service_offering</code></td><td>"Online Ordering - Production" (99.9% SLA) vs "Online Ordering - Staging" (best effort)</td></tr>
</table>

<h2>The relationships — how they connect</h2>
<p>The layers above are useless without relationships between them. This is where most CSDM implementations fail. Teams populate the tables but never build the connections.</p>
<p>ServiceNow stores CI relationships in the <code>cmdb_rel_ci</code> table. Each row says "CI A is related to CI B with relationship type X."</p>

<pre>// The relationship chain for our scenario:
//
// DB-PROD-03 (cmdb_ci_linux_server)
//    |
//    | "Hosts" relationship
//    v
// OrderDB (cmdb_ci_database)
//    |
//    | "Used By" relationship
//    v
// Order Processing API (cmdb_ci_appl)
//    |
//    | "Members Of::Contains" relationship
//    v
// Order Processing Service (cmdb_ci_service_auto)   <-- Application Service
//    |
//    | "Depends On::Used By" relationship
//    v
// Online Ordering Platform (cmdb_ci_business_app)
//    |
//    | "Managed By::Manages" relationship
//    v
// Online Ordering (cmdb_ci_service_business)        <-- Business Service
//    |
//    | related via service_offering table
//    v
// Online Ordering - Production (service_offering)   <-- with SLA commitments</pre>

<p>Without these relationships, when DB-PROD-03 fills up, the incident just says "server disk full." Nobody knows it affects ordering. With CSDM relationships, the impact chain is visible immediately — and automated.</p>

<h2>Setting it up — the practical steps</h2>

<h3>Step 1: Create the Business Service</h3>
<p>Start from the top. The business service is what executives care about. You do not start with servers.</p>
<pre>// Navigate to: cmdb_ci_service_business.list
// Create new record:
//   Name: Online Ordering
//   Owned by: VP of Commerce (sys_user reference)
//   Support group: E-Commerce Operations (sys_user_group)
//   Operational status: Operational
//   Install status: Installed
//   Business criticality: 1 - Most Critical

// Or via script:
var bs = new GlideRecord('cmdb_ci_service_business');
bs.initialize();
bs.name = 'Online Ordering';
bs.owned_by = 'sys_id_of_vp_commerce';
bs.support_group = 'sys_id_of_ecom_ops_group';
bs.operational_status = 1;  // Operational
bs.install_status = 1;      // Installed
bs.busines_criticality = 1; // Most Critical
bs.insert();</pre>

<h3>Step 2: Create the Business Application</h3>
<pre>// Navigate to: cmdb_ci_business_app.list
// Create new record:
//   Name: Online Ordering Platform
//   Owned by: Engineering Manager
//   Managed by business service: Online Ordering
//   SDLC lifecycle stage: Production

var ba = new GlideRecord('cmdb_ci_business_app');
ba.initialize();
ba.name = 'Online Ordering Platform';
ba.owned_by = 'sys_id_of_eng_manager';
ba.install_status = 1;
ba.insert();</pre>

<h3>Step 3: Create the Application Service (Service Instance)</h3>
<p>This is the operational grouping. It represents the deployed technical stack that delivers a capability.</p>
<pre>// Navigate to: cmdb_ci_service_auto.list
// Create new record:
//   Name: Order Processing Service
//   Owned by: Lead SRE
//   Managed by application: Online Ordering Platform
//   Environment: Production

var as = new GlideRecord('cmdb_ci_service_auto');
as.initialize();
as.name = 'Order Processing Service';
as.owned_by = 'sys_id_of_lead_sre';
as.install_status = 1;
as.insert();</pre>

<h3>Step 4: Build the relationships</h3>
<p>This is the part that makes CSDM actually work. Without relationships, you just have disconnected records.</p>
<pre>// Create relationship: Application Service -> Business Application
// "Depends On::Used By"
var rel = new GlideRecord('cmdb_rel_ci');
rel.initialize();
rel.parent = ba.sys_id;   // Business Application (upstream)
rel.child = as.sys_id;    // Application Service (downstream)
rel.type = 'sys_id_of_depends_on_used_by_rel_type';
// Look up relationship type sys_id:
// var rt = new GlideRecord('cmdb_rel_type');
// rt.addQuery('name', 'Depends on::Used by');
// rt.query(); rt.next(); // rt.sys_id is what you need
rel.insert();

// Create relationship: Business Service -> Business Application
var rel2 = new GlideRecord('cmdb_rel_ci');
rel2.initialize();
rel2.parent = bs.sys_id;  // Business Service
rel2.child = ba.sys_id;   // Business Application
rel2.type = 'sys_id_of_manages_managed_by_rel_type';
rel2.insert();

// Infrastructure CIs (servers, databases) are typically
// populated by Discovery, not manually. Discovery scans your
// network, finds running services, and creates the CIs
// and their relationships automatically.</pre>

<h2>The 2 AM outage — how CSDM makes it visible</h2>
<p>Now the disk fills up on DB-PROD-03. An event fires. An incident is created. Here is what happens with CSDM in place versus without it.</p>

<h3>Without CSDM</h3>
<pre>// Incident created:
//   Short description: Disk space critical on DB-PROD-03
//   CI: DB-PROD-03
//   Priority: calculated from impact/urgency, but nobody knows
//             what this server actually affects
//   Assignment group: Linux Admins
//
// The Linux admin sees a disk full alert. Cleans up temp files.
// Meanwhile, orders are failing for 45 minutes.
// The VP finds out from a customer tweet, not from ServiceNow.</pre>

<h3>With CSDM</h3>
<pre>// Incident created:
//   Short description: Disk space critical on DB-PROD-03
//   CI: DB-PROD-03
//   
// ServiceNow automatically traces the impact:
//   DB-PROD-03 hosts OrderDB
//   OrderDB is used by Order Processing API
//   Order Processing API is part of Order Processing Service
//   Order Processing Service supports Online Ordering Platform
//   Online Ordering Platform is managed by "Online Ordering" business service
//   "Online Ordering" is Business Criticality: 1 - Most Critical
//
// Incident auto-escalated to P1.
// Assignment group: E-Commerce Operations (from business service support group)
// VP of Commerce gets an automatic notification.
// SLA clock starts ticking on the 99.9% commitment.</pre>

<h2>Querying the impact chain</h2>
<p>Here is the script that walks the relationship chain from a CI to its business service. This is what happens under the hood during impact analysis.</p>

<pre>// Given a CI sys_id (e.g., the failing database server),
// find all business services impacted.

function getImpactedBusinessServices(ciSysId) {
    var visited = {};
    var businessServices = [];

    function walkUp(sysId, depth) {
        if (visited[sysId] || depth > 10) return;
        visited[sysId] = true;

        // Check if this CI is itself a business service
        var check = new GlideRecord('cmdb_ci_service_business');
        if (check.get(sysId)) {
            businessServices.push({
                name: check.getValue('name'),
                owner: check.getDisplayValue('owned_by'),
                criticality: check.getDisplayValue('busines_criticality')
            });
            return;
        }

        // Find upstream CIs (parents in relationships)
        var rel = new GlideRecord('cmdb_rel_ci');
        rel.addQuery('child', sysId);
        rel.query();
        while (rel.next()) {
            walkUp(rel.getValue('parent'), depth + 1);
        }
    }

    walkUp(ciSysId, 0);
    return businessServices;
}

// Usage:
var impacted = getImpactedBusinessServices('sys_id_of_db_prod_03');
impacted.forEach(function(svc) {
    gs.info('IMPACTED: ' + svc.name + ' | Owner: ' + svc.owner +
            ' | Criticality: ' + svc.criticality);
});
// Output: IMPACTED: Online Ordering | Owner: VP Commerce | Criticality: 1 - Most Critical</pre>

<h2>CSDM 5.0 — what changed and what you actually need to know</h2>
<p>The model went from 5 domains in 4.0 to 7 domains in 5.0. Most of the additions are about strategic planning and AI, not about the core service chain. Here is what matters practically:</p>

<table>
<tr><th>What changed</th><th>Old name</th><th>New name / addition</th><th>Why it matters</th></tr>
<tr><td>Application Service renamed</td><td>Application Service</td><td>Service Instance (Application Service is now a subtype)</td><td>Other service types added: Data Service, Network Service, etc. Your existing Application Services still work — just reclassified.</td></tr>
<tr><td>Technical Service renamed</td><td>Technical Service</td><td>Technology Management Service</td><td>Just a label change. Same table, same function.</td></tr>
<tr><td>New: Ideation & Strategy domain</td><td>Did not exist</td><td>Product Ideas, Strategic Priorities, Goals, Targets</td><td>Connects strategic planning to service delivery. Matters for SPM users, not for day-to-day ITSM.</td></tr>
<tr><td>New: AI Data Model</td><td>Did not exist</td><td><code>dm_ai_system_digital_asset</code>, AI Function, AI Application</td><td>If you are deploying Now Assist or AI agents, these CIs track your AI components in the CMDB.</td></tr>
<tr><td>New: SBOM</td><td>Did not exist</td><td>Software Bill of Materials</td><td>Tracks software component dependencies. Critical for SecOps vulnerability scanning.</td></tr>
<tr><td>New: Value Streams</td><td>Did not exist</td><td>Value Stream entity in Foundation domain</td><td>Maps how work flows to deliver value. Connects to Process Mining.</td></tr>
</table>

<p>For most teams doing ITSM, the core chain (Infrastructure → Application Service → Business Application → Business Service) has not changed. CSDM 5.0 is additive — it does not break your existing model.</p>

<h2>The adoption path — Crawl, Walk, Run, Fly</h2>
<p>ServiceNow recommends a phased approach. I have seen teams try to jump to "Run" and it always fails. Here is what each phase actually means in practice:</p>

<table>
<tr><th>Phase</th><th>What you do</th><th>What you get</th></tr>
<tr><td>Foundation</td><td>Clean up locations, departments, groups, users. Get your org structure right. Define lifecycle statuses.</td><td>Basic data hygiene. Nothing CSDM-specific yet, but without this the rest falls apart.</td></tr>
<tr><td>Crawl</td><td>Create Business Services and Business Applications. Assign owners. Map them to each other.</td><td>Portfolio visibility. Executives can see which apps support which services. No infra mapping yet.</td></tr>
<tr><td>Walk</td><td>Create Application Services. Connect them to infrastructure CIs via Discovery. Build the full relationship chain.</td><td>Impact analysis works. Incidents on a CI can trace to business services. Change risk assessment uses service context.</td></tr>
<tr><td>Run</td><td>Service Mapping validates relationships continuously. CMDB Health tracks completeness. Lifecycle management enforced.</td><td>Trusted, maintained CMDB. Automation depends on it. Now Assist uses it for context. AI agents query it.</td></tr>
<tr><td>Fly</td><td>Full CSDM 5.0 with Value Streams, SBOM, AI models, strategic alignment.</td><td>Enterprise-wide service intelligence. Not many organizations are here yet.</td></tr>
</table>

<h2>Where teams get it wrong</h2>
<p>I have watched enough CSDM implementations to know the patterns that kill them:</p>
<ul>
<li><strong>Starting with infrastructure.</strong> Teams spend 6 months loading servers into CMDB and never get to business services. Start from the top. Business services first, then work down.</li>
<li><strong>No ownership.</strong> Every Business Application and Business Service needs an owner. If the <code>owned_by</code> field is empty, nobody is accountable. Nobody maintains the data. It rots.</li>
<li><strong>Missing relationships.</strong> 500 CIs with zero relationships is a flat spreadsheet, not CSDM. The value is in the connections between layers. Run this query regularly:</li>
</ul>
<pre>// Find business applications with no relationships at all
var ba = new GlideRecord('cmdb_ci_business_app');
ba.addQuery('install_status', 1);  // Installed
ba.query();
while (ba.next()) {
    var rel = new GlideRecord('cmdb_rel_ci');
    rel.addQuery('parent', ba.sys_id);
    rel.addOrCondition('child', ba.sys_id);
    rel.setLimit(1);
    rel.query();
    if (!rel.next()) {
        gs.info('ORPHAN: ' + ba.getValue('name') + ' has zero relationships');
    }
}</pre>
<ul>
<li><strong>Using custom tables instead of CSDM tables.</strong> I have seen teams create <code>u_my_services</code> instead of using <code>cmdb_ci_service_business</code>. Then Service Mapping does not work. Impact analysis does not work. Every ServiceNow product that reads service data expects the CSDM tables. Use them.</li>
<li><strong>Treating CSDM as a one-time project.</strong> It is not. Services change, apps get retired, new infrastructure spins up. You need ongoing governance — Discovery schedules, Health Dashboard monitoring, ownership reviews. Set up a recurring monthly check or it degrades within a quarter.</li>
</ul>

<h2>The health check query</h2>
<p>Run this to get a quick read on your CSDM maturity:</p>
<pre>// CSDM Health Check - run in Background Scripts
var tables = [
    {name: 'cmdb_ci_service_business', label: 'Business Services'},
    {name: 'cmdb_ci_business_app', label: 'Business Applications'},
    {name: 'cmdb_ci_service_auto', label: 'Application Services (Service Instances)'},
    {name: 'service_offering', label: 'Service Offerings'}
];

tables.forEach(function(t) {
    var gr = new GlideRecord(t.name);
    gr.addQuery('install_status', 1);
    gr.query();
    var total = gr.getRowCount();

    // Count those without owners
    var noOwner = new GlideAggregate(t.name);
    noOwner.addQuery('install_status', 1);
    noOwner.addQuery('owned_by', 'ISEMPTY', '');
    noOwner.addAggregate('COUNT');
    noOwner.query();
    var unowned = noOwner.next() ? parseInt(noOwner.getAggregate('COUNT')) : 0;

    gs.info(t.label + ': ' + total + ' total, ' + unowned + ' without owner (' +
            (total > 0 ? Math.round(unowned/total*100) : 0) + '% unowned)');
});

// Check relationship coverage
var bs = new GlideAggregate('cmdb_ci_service_business');
bs.addQuery('install_status', 1);
bs.addAggregate('COUNT');
bs.query();
var totalBS = bs.next() ? parseInt(bs.getAggregate('COUNT')) : 0;

var withRel = 0;
var bsGr = new GlideRecord('cmdb_ci_service_business');
bsGr.addQuery('install_status', 1);
bsGr.query();
while (bsGr.next()) {
    var rel = new GlideRecord('cmdb_rel_ci');
    rel.addQuery('parent', bsGr.sys_id);
    rel.addOrCondition('child', bsGr.sys_id);
    rel.setLimit(1);
    rel.query();
    if (rel.next()) withRel++;
}
gs.info('Business Services with at least one relationship: ' +
        withRel + '/' + totalBS + ' (' +
        (totalBS > 0 ? Math.round(withRel/totalBS*100) : 0) + '%)');</pre>

<h2>How this connects to interview questions</h2>
<p>If an interviewer asks you about CSDM, they are not looking for you to recite the 7 domains. They want to hear:</p>
<ul>
<li>That you understand <strong>why</strong> CSDM exists — connecting technical failures to business impact</li>
<li>That you know the <strong>actual table names</strong> — <code>cmdb_ci_service_business</code>, <code>cmdb_ci_business_app</code>, <code>cmdb_ci_service_auto</code>, <code>cmdb_rel_ci</code></li>
<li>That you can describe a <strong>real scenario</strong> where CSDM changes the outcome — like the 2 AM outage above</li>
<li>That you know the <strong>adoption path</strong> is phased, not big-bang — Foundation, Crawl, Walk, Run</li>
<li>That you have an opinion on <strong>where teams fail</strong> — no ownership, no relationships, custom tables instead of OOB</li>
</ul>
<p>That combination — table knowledge, scenario thinking, and implementation experience — is what separates someone who read a blog post from someone who has actually done it.</p>`
};

posts.unshift(newPost);
fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
fs.copyFileSync('data/posts.json', 'posts.json');
console.log('Added post ' + newPost.id + ': ' + newPost.title.substring(0,60));
console.log('Total posts: ' + posts.length);
