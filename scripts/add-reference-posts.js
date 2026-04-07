const fs = require('fs');

const posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));

const newPosts = [

// ================================================================
// POST 85: GlideRecord Complete Reference
// ================================================================
{
  id: 85,
  title: "GlideRecord Complete Reference: Every Method You Actually Use in Production",
  excerpt: "The one GlideRecord page you bookmark. Query, insert, update, delete patterns with real output, performance traps, and the methods nobody explains properly.",
  readTime: "18 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Developers", "Admins", "Career Switchers"],
  uniqueId: "gliderecord-complete-reference-1712500800000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T12:00:00Z",
  content: `<h2>What GlideRecord is</h2>
<p>GlideRecord is the server-side JavaScript API for reading and writing database records in ServiceNow. Every Business Rule, Script Include, Scheduled Job, and Fix Script you write will use it. Think of it as a cursor-based query builder — you build a query, execute it, then iterate row by row.</p>

<h2>Query (SELECT)</h2>
<pre>var gr = new GlideRecord('incident');
gr.addQuery('priority', 1);
gr.addQuery('state', '!=', 6);            // 6 = Resolved
gr.addQuery('assignment_group.name', 'Network Ops');  // dot-walk through reference
gr.orderByDesc('sys_created_on');
gr.setLimit(20);
gr.query();

while (gr.next()) {
    gs.info(gr.getValue('number'));           // INC0010045
    gs.info(gr.getDisplayValue('caller_id')); // John Smith
    gs.info(gr.getValue('caller_id'));        // 6816f79cc0a8016401... (sys_id)
}</pre>
<p><strong>What actually happens:</strong> <code>query()</code> sends SQL to the database. <code>next()</code> moves the cursor to the next row. When there are no more rows, <code>next()</code> returns <code>false</code> and the loop ends.</p>

<h3>addQuery operators</h3>
<table>
<tr><th>Operator</th><th>Example</th><th>What it does</th></tr>
<tr><td>=</td><td><code>addQuery('priority', 1)</code></td><td>Exact match (default)</td></tr>
<tr><td>!=</td><td><code>addQuery('state', '!=', 6)</code></td><td>Not equal</td></tr>
<tr><td>&gt;</td><td><code>addQuery('sys_created_on', '&gt;', '2026-01-01')</code></td><td>Greater than</td></tr>
<tr><td>&lt;</td><td><code>addQuery('priority', '&lt;', 3)</code></td><td>Less than</td></tr>
<tr><td>IN</td><td><code>addQuery('state', 'IN', '1,2,3')</code></td><td>Value in comma-separated list</td></tr>
<tr><td>NOT IN</td><td><code>addQuery('state', 'NOT IN', '6,7')</code></td><td>Value not in list</td></tr>
<tr><td>STARTSWITH</td><td><code>addQuery('number', 'STARTSWITH', 'INC')</code></td><td>String starts with</td></tr>
<tr><td>CONTAINS</td><td><code>addQuery('short_description', 'CONTAINS', 'VPN')</code></td><td>String contains</td></tr>
<tr><td>ISEMPTY</td><td><code>addQuery('assigned_to', 'ISEMPTY', '')</code></td><td>Field is empty</td></tr>
<tr><td>ISNOTEMPTY</td><td><code>addQuery('assigned_to', 'ISNOTEMPTY', '')</code></td><td>Field is not empty</td></tr>
</table>

<h3>OR queries</h3>
<pre>var gr = new GlideRecord('incident');
var q1 = gr.addQuery('priority', 1);
q1.addOrCondition('priority', 2);   // priority = 1 OR priority = 2
gr.query();</pre>

<h3>Encoded queries</h3>
<p>Instead of chaining addQuery calls, paste the encoded query string directly. Copy it from any list filter in the UI — click the filter icon, set your conditions, right-click the breadcrumb, and select "Copy query."</p>
<pre>var gr = new GlideRecord('incident');
gr.addEncodedQuery('priority=1^stateNOT IN6,7^assignment_group.name=Network Ops');
gr.query();

// This does the same thing as the three addQuery calls above.
// Encoded queries are faster to write and easier to paste from the UI.</pre>

<h2>Get a single record</h2>
<pre>// By sys_id
var gr = new GlideRecord('incident');
gr.get('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');

// By field value
var gr = new GlideRecord('incident');
gr.get('number', 'INC0010001');

// gr.get() returns true/false. No need to call query() or next().</pre>

<h2>Insert</h2>
<pre>var gr = new GlideRecord('incident');
gr.initialize();
gr.short_description = 'Printer offline on floor 3';
gr.priority = 3;
gr.assignment_group.setDisplayValue('Service Desk');  // look up by name
var newSysId = gr.insert();  // returns the sys_id of the new record
gs.info('Created: ' + newSysId);</pre>

<h2>Update</h2>
<pre>var gr = new GlideRecord('incident');
gr.get('number', 'INC0010001');
gr.state = 6;  // Resolved
gr.close_notes = 'Restarted the print spooler service.';
gr.update();</pre>

<h3>Bulk update</h3>
<pre>// Close all resolved incidents older than 7 days
var gr = new GlideRecord('incident');
gr.addQuery('state', 6);
gr.addQuery('resolved_at', '&lt;', gs.daysAgo(7));
gr.query();
while (gr.next()) {
    gr.state = 7;  // Closed
    gr.update();
}
// For large volumes, use gr.setWorkflow(false) to skip Business Rules
// and gr.autoSysFields(false) to skip sys_updated_on/by changes.</pre>

<h2>Delete</h2>
<pre>var gr = new GlideRecord('incident');
gr.get('number', 'INC9999999');
gr.deleteRecord();

// Bulk delete — be very careful
var gr = new GlideRecord('u_temp_import');
gr.addQuery('sys_created_on', '&lt;', gs.daysAgo(30));
gr.deleteMultiple();  // Deletes all matching records without loading them</pre>

<h2>getValue vs getDisplayValue vs dot notation</h2>
<table>
<tr><th>Method</th><th>Returns</th><th>Use when</th></tr>
<tr><td><code>gr.getValue('caller_id')</code></td><td>sys_id string</td><td>Comparisons, integrations, storing references</td></tr>
<tr><td><code>gr.getDisplayValue('caller_id')</code></td><td>Display name</td><td>Messages, emails, UI display</td></tr>
<tr><td><code>gr.caller_id</code></td><td>GlideElement object</td><td>Avoid — behaves unpredictably in comparisons</td></tr>
<tr><td><code>gr.getValue('state')</code></td><td>'1' (internal number)</td><td>Logic, conditions</td></tr>
<tr><td><code>gr.getDisplayValue('state')</code></td><td>'New' (label)</td><td>Display only — labels change with language</td></tr>
</table>

<h2>GlideAggregate</h2>
<p>When you need COUNT, SUM, MIN, MAX, or AVG — do not loop through GlideRecord and count manually.</p>
<pre>// Count open P1 incidents
var ga = new GlideAggregate('incident');
ga.addQuery('priority', 1);
ga.addQuery('active', true);
ga.addAggregate('COUNT');
ga.query();
if (ga.next()) {
    gs.info('Open P1 count: ' + ga.getAggregate('COUNT'));
}

// Count per assignment group
var ga = new GlideAggregate('incident');
ga.addQuery('active', true);
ga.addAggregate('COUNT');
ga.groupBy('assignment_group');
ga.query();
while (ga.next()) {
    gs.info(ga.getDisplayValue('assignment_group') + ': ' + ga.getAggregate('COUNT'));
}</pre>

<h2>Common traps</h2>
<ul>
<li><strong>Querying the task table:</strong> <code>new GlideRecord('task')</code> returns incidents + changes + problems + catalog tasks + everything else that extends task. Always query the specific child table unless you genuinely want all task types.</li>
<li><strong>getRowCount():</strong> Runs a full <code>COUNT(*)</code> against the database. On tables with millions of rows, this is expensive. Use <code>GlideAggregate</code> instead.</li>
<li><strong>Dot-walking in loops:</strong> <code>gr.caller_id.department.name</code> fires a separate query per iteration. For bulk operations, query the related table separately and build a lookup map.</li>
<li><strong>Missing setLimit():</strong> Without a limit, your query can return hundreds of thousands of rows. Always set a limit unless you specifically need all records.</li>
<li><strong>gr.field = value vs gr.setValue('field', value):</strong> Both work for most fields, but <code>setValue</code> is safer for reference fields and journal fields. Use <code>setValue</code> in script includes; direct assignment in business rules is fine.</li>
</ul>`
},

// ================================================================
// POST 86: Client-Side API Reference (g_form, g_user, g_list)
// ================================================================
{
  id: 86,
  title: "ServiceNow Client-Side APIs: g_form, g_user, g_list — The Methods That Control the Form",
  excerpt: "Complete reference for the three client-side objects you use in every Client Script and UI Action. Every method, what it returns, and when it breaks.",
  readTime: "16 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Developers", "Admins"],
  uniqueId: "client-side-api-reference-1712504400000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T13:00:00Z",
  content: `<h2>Where these run</h2>
<p>Client-side scripts run in the user's browser, not on the server. You cannot use GlideRecord here. The three objects available to you are:</p>
<ul>
<li><code>g_form</code> — manipulates the current form (fields, labels, messages)</li>
<li><code>g_user</code> — information about the logged-in user</li>
<li><code>g_list</code> — manipulates list views (less common)</li>
</ul>

<h2>g_form — Form manipulation</h2>

<h3>Get and set field values</h3>
<pre>// Get the raw value (sys_id for reference fields, number for choice fields)
var callerId = g_form.getValue('caller_id');       // sys_id string
var priority = g_form.getValue('priority');         // '1'

// Get the display value (the text the user sees)
var callerName = g_form.getDisplayValue('caller_id'); // 'John Smith'

// Set a field value
g_form.setValue('priority', '2');
g_form.setValue('assignment_group', 'a1b2c3d4...');  // must be sys_id for reference fields

// Clear a field
g_form.clearValue('assigned_to');</pre>

<h3>Control field visibility and behavior</h3>
<pre>// Hide/show a field
g_form.setVisible('u_internal_notes', false);  // hide
g_form.setVisible('u_internal_notes', true);   // show

// Make a field mandatory
g_form.setMandatory('assignment_group', true);

// Make a field read-only
g_form.setReadOnly('short_description', true);

// Set a field label (useful for dynamic labels)
g_form.setLabelOf('u_custom_field', 'New Label Text');</pre>

<h3>Messages on the form</h3>
<pre>// Info message (blue banner at top)
g_form.addInfoMessage('This incident has been escalated.');

// Error message (red banner at top)
g_form.addErrorMessage('Missing required data.');

// Field-level message (appears under a specific field)
g_form.showFieldMsg('short_description', 'Must be at least 10 characters', 'error');
g_form.hideFieldMsg('short_description');

// Clear all messages
g_form.clearMessages();</pre>

<h3>Form state</h3>
<pre>// Check if the form is for a new record
if (g_form.isNewRecord()) {
    // This is an insert, not an update
}

// Get the table name
var table = g_form.getTableName();  // 'incident'

// Get the sys_id of the current record
var sysId = g_form.getUniqueValue();

// Check if a field value has changed (useful in onChange)
var changed = g_form.isFieldChanged('priority');  // only works in onChange context

// Submit the form programmatically
g_form.submit();</pre>

<h3>Reference field lookups (getReference)</h3>
<pre>// getReference is asynchronous — always use the callback form
g_form.getReference('caller_id', function(callerRecord) {
    // callerRecord is a GlideRecord-like object
    var dept = callerRecord.department.getDisplayValue();
    g_form.addInfoMessage('Caller department: ' + dept);
});

// NEVER use the synchronous form — it freezes the browser
// var ref = g_form.getReference('caller_id'); // BAD — blocks UI</pre>

<h2>g_user — Current user information</h2>
<pre>// Basic user info
var userName = g_user.userName;      // 'john.smith'
var fullName = g_user.getFullName(); // 'John Smith'
var userId   = g_user.userID;        // sys_id of the logged-in user

// Role checks
if (g_user.hasRole('admin')) {
    // user has admin role
}
if (g_user.hasRole('itil')) {
    // user has ITIL role
}
// hasRoleExactly checks the specific role, not inherited roles
if (g_user.hasRoleExactly('incident_manager')) {
    // user has incident_manager specifically, not just admin
}

// Client-side data from g_user.getClientData (set in Display Business Rule)
// In Display BR:  g_scratchpad.isVIP = true;
// In Client Script: var isVIP = g_scratchpad.isVIP;</pre>

<h2>g_scratchpad — Pass server data to client</h2>
<p><code>g_scratchpad</code> is an object populated by Display Business Rules on the server side, then available in Client Scripts. This is the correct way to pass server data to the client without making GlideAjax calls.</p>
<pre>// === Display Business Rule (server-side, runs when form loads) ===
(function executeRule(current, previous) {
    g_scratchpad.callerIsVIP = current.caller_id.vip.toString();
    g_scratchpad.openP1Count = new GlideAggregate('incident');
    // ... calculate value ...
    g_scratchpad.openP1Count = '5';
})(current, previous);

// === Client Script (onLoad, runs in browser) ===
function onLoad() {
    if (g_scratchpad.callerIsVIP === 'true') {
        g_form.addInfoMessage('VIP caller — handle with priority.');
    }
}</pre>

<h2>g_list — List view manipulation</h2>
<p>Available only in list context (not forms). Less commonly used but important for UI Actions on lists.</p>
<pre>// Get selected sys_ids from a list (checkboxes)
var selectedIds = g_list.getChecked();  // comma-separated sys_ids

// Refresh the current list
g_list.refresh();

// Get the list's table name
var table = g_list.getTableName();

// Get the current list filter (encoded query)
var filter = g_list.getQuery();</pre>

<h2>Common traps</h2>
<ul>
<li><strong>Using GlideRecord in a Client Script:</strong> It does not exist on the client side. Use <code>GlideAjax</code> to call a Script Include on the server if you need database access.</li>
<li><strong>Synchronous getReference:</strong> The no-callback version of <code>g_form.getReference()</code> blocks the browser's main thread. Always pass a callback function.</li>
<li><strong>g_user.hasRole('admin') returns true for admins on everything:</strong> Admin role bypasses all role checks. If you want to check a specific role without admin bypass, use <code>g_user.hasRoleExactly()</code>.</li>
<li><strong>setValue on reference fields:</strong> You must pass a sys_id, not a display name. To set by display name, use <code>g_form.getReference()</code> first or pass both: there is no two-arg version for setValue reference, so you need the sys_id.</li>
<li><strong>UI Policies override Client Scripts:</strong> If both control the same field, the UI Policy runs after the Client Script and wins. Do not use both on the same field unless you understand the execution order.</li>
</ul>`
},

// ================================================================
// POST 87: Server-Side Utility APIs
// ================================================================
{
  id: 87,
  title: "Server-Side Utility APIs You Use Every Day: GlideDateTime, GlideElement, gs Methods",
  excerpt: "The utility APIs that show up in every Business Rule and Script Include but nobody explains in one place. Date math, field inspection, system properties, and logging.",
  readTime: "14 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Developers", "Admins"],
  uniqueId: "server-utility-apis-reference-1712508000000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T14:00:00Z",
  content: `<h2>GlideDateTime — Date and time operations</h2>
<p>ServiceNow stores dates in UTC internally. <code>GlideDateTime</code> handles timezone conversion, date math, and formatting.</p>

<pre>// Current date/time
var now = new GlideDateTime();
gs.info(now.getValue());        // '2026-04-07 14:30:00' (UTC, internal)
gs.info(now.getDisplayValue()); // '2026-04-07 09:30:00' (user's timezone)

// Create from string
var dt = new GlideDateTime('2026-01-15 08:00:00');

// Date math — add/subtract
var dt = new GlideDateTime();
dt.addDaysUTC(7);               // add 7 days
dt.addSeconds(3600);             // add 1 hour
dt.addYearsUTC(1);               // add 1 year

// Compare dates
var dt1 = new GlideDateTime('2026-01-01 00:00:00');
var dt2 = new GlideDateTime('2026-06-01 00:00:00');
gs.info(dt1.before(dt2));       // true
gs.info(dt1.after(dt2));        // false

// Difference between dates
var diff = GlideDateTime.subtract(dt1, dt2);  // returns GlideDuration
gs.info(diff.getDayPart());     // number of days between

// Get parts
gs.info(now.getYearUTC());      // 2026
gs.info(now.getMonthUTC());     // 4
gs.info(now.getDayOfMonthUTC()); // 7

// gs date helpers — quick shortcuts
gs.info(gs.now());              // current date/time in user's format
gs.info(gs.nowDateTime());      // current date/time in system format
gs.info(gs.daysAgo(7));         // date/time 7 days ago
gs.info(gs.beginningOfLastMonth()); // first day of previous month</pre>

<h2>GlideElement — Field-level operations</h2>
<p>When you access <code>gr.field_name</code> on a GlideRecord, you get a GlideElement object, not a raw value. These methods let you inspect and manipulate individual fields.</p>

<pre>var gr = new GlideRecord('incident');
gr.get('number', 'INC0010001');

// Check if a field changed (only works in Business Rules with 'previous')
if (gr.priority.changes()) {
    gs.info('Priority changed');
}

// Check if field changed TO a specific value
if (gr.state.changesTo(6)) {
    gs.info('State changed to Resolved');
}

// Check if field changed FROM a specific value
if (gr.state.changesFrom(1)) {
    gs.info('State was previously New');
}

// Check if a field is empty
if (gr.assigned_to.nil()) {
    gs.info('No one assigned');
}
// gs.nil() works the same way
if (gs.nil(gr.getValue('assigned_to'))) {
    gs.info('Also no one assigned');
}

// Get the field's label (not the column name)
gs.info(gr.priority.getLabel());  // 'Priority'

// Get choice list display value
gs.info(gr.priority.getDisplayValue());  // '1 - Critical'

// Reference field helpers
gs.info(gr.caller_id.getRefRecord().getValue('email'));  // get the referenced record</pre>

<h2>gs (GlideSystem) — System utilities</h2>

<h3>Logging</h3>
<pre>gs.info('Informational message');           // System Logs > All
gs.warn('Warning message');                  // shows as warning level
gs.error('Error message');                   // shows as error level
gs.debug('Debug message');                   // only shows when debug enabled

// Log with source context (appears in Source column)
gs.log('message', 'MyScriptInclude');        // legacy, use gs.info instead</pre>

<h3>User context</h3>
<pre>gs.info(gs.getUserID());          // sys_id of current user
gs.info(gs.getUserName());        // 'john.smith'
gs.info(gs.getUserDisplayName()); // 'John Smith'
gs.info(gs.getUser().getEmail()); // 'john@example.com'

// Check roles (server-side)
if (gs.hasRole('admin')) { }
if (gs.hasRole('itil')) { }</pre>

<h3>System properties</h3>
<pre>// Read a system property
var val = gs.getProperty('glide.servlet.uri');  // instance URL
var custom = gs.getProperty('x_myapp.feature_flag', 'default_value');

// Set a system property (use carefully)
gs.setProperty('x_myapp.last_sync', gs.nowDateTime());</pre>

<h3>Messages and events</h3>
<pre>// Show messages to the user (in Business Rules)
gs.addInfoMessage('Record saved successfully.');
gs.addErrorMessage('Cannot close without resolution notes.');

// Queue an event (for notifications, flows, or custom processing)
gs.eventQueue('incident.escalated', current, gs.getUserID(), current.getValue('assignment_group'));

// Include another Script Include
gs.include('MyUtilityLibrary');</pre>

<h3>Data Policy vs UI Policy</h3>
<p>Both control field mandatory/read-only behavior, but at different layers:</p>
<table>
<tr><th>Feature</th><th>UI Policy</th><th>Data Policy</th></tr>
<tr><td>Runs on</td><td>Client (browser) only</td><td>Server + Client</td></tr>
<tr><td>Enforced via API</td><td>No — only on the form</td><td>Yes — REST, import, scripts all respect it</td></tr>
<tr><td>Configuration</td><td>UI-only, no code</td><td>UI-only, no code</td></tr>
<tr><td>Use when</td><td>Form-only field behavior</td><td>Data integrity regardless of entry point</td></tr>
</table>
<p>If a field must always be mandatory — even for records created via API or Import Set — use a Data Policy. If it only matters when a user is filling out a form, UI Policy is sufficient.</p>

<h2>Common traps</h2>
<ul>
<li><strong>GlideDateTime timezone confusion:</strong> <code>getValue()</code> returns UTC, <code>getDisplayValue()</code> returns the user's timezone. When comparing dates in scripts, always use <code>getValue()</code> or UTC methods.</li>
<li><strong>gr.field.nil() vs gs.nil():</strong> Both work, but <code>gs.nil()</code> also handles null, undefined, and empty strings. Prefer <code>gs.nil(gr.getValue('field'))</code> for defensive coding.</li>
<li><strong>gs.getProperty() performance:</strong> System properties are cached, so repeated calls are fast. But do not call <code>gs.getProperty()</code> inside a tight loop on a high-volume table — read it once and store it in a variable.</li>
<li><strong>gs.addInfoMessage in async Business Rules:</strong> Will not display. The user's transaction is already complete. Only works in before/after BRs where the form is still in context.</li>
</ul>`
},

// ================================================================
// POST 88: Catalog Scripting Reference
// ================================================================
{
  id: 88,
  title: "Service Catalog Scripting: Record Producers, Variables, Catalog Client Scripts, and Order Guides",
  excerpt: "Everything that happens between a user clicking 'Order Now' and the fulfillment task landing on someone's queue. Tables, variable types, catalog-specific scripts, and the gotchas that bite in production.",
  readTime: "15 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Intermediate",
  forPersona: ["Developers", "Admins", "Platform Teams"],
  uniqueId: "catalog-scripting-reference-1712511600000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T15:00:00Z",
  content: `<h2>How the catalog works internally</h2>
<p>When a user submits a catalog item, ServiceNow creates three types of records:</p>
<table>
<tr><th>Table</th><th>Record Type</th><th>What it represents</th></tr>
<tr><td><code>sc_request</code></td><td>Request</td><td>The overall order (REQ0010001). One per submission.</td></tr>
<tr><td><code>sc_req_item</code></td><td>Requested Item (RITM)</td><td>One per catalog item ordered (RITM0010001). Contains variable values.</td></tr>
<tr><td><code>sc_task</code></td><td>Catalog Task</td><td>Fulfillment work assigned to teams (SCTASK0010001).</td></tr>
</table>
<p>Variable values are stored in <code>sc_item_option</code> and linked to the RITM via <code>sc_item_option_mtom</code>.</p>

<h3>Reading variable values in scripts</h3>
<pre>// In a Catalog Item workflow or Business Rule on sc_req_item:
var ritmGr = new GlideRecord('sc_req_item');
ritmGr.get('number', 'RITM0010001');

// Access variables through the variables object
var laptopModel = ritmGr.variables.laptop_model.getDisplayValue();
var justification = ritmGr.variables.justification.toString();

// In a Catalog Item script (server-side):
// 'current' is the RITM record
var model = current.variables.laptop_model;</pre>

<h2>Record Producers</h2>
<p>A Record Producer creates a record on a target table (like <code>incident</code>) through the Service Catalog UI. The user fills out catalog-style variables, and the Record Producer maps them to fields on the target table.</p>

<pre>// Record Producer script (runs on submit, server-side)
// 'current' is the target table record (e.g., incident)
// 'producer' has the variable values

current.short_description = producer.description;
current.category = producer.category;
current.priority = producer.urgency_level;

// Set caller to the person who submitted
current.caller_id = gs.getUserID();</pre>

<p><strong>When to use Record Producer vs Catalog Item:</strong></p>
<ul>
<li><strong>Record Producer:</strong> When the goal is to create a record on an existing table (incident, change_request, etc.) from the catalog. The user sees a catalog form, but the output is a standard record, not a RITM.</li>
<li><strong>Catalog Item:</strong> When you need the full request lifecycle (Request → RITM → Tasks) with approvals, fulfillment workflows, and catalog-specific tracking.</li>
</ul>

<h2>Variable Sets</h2>
<p>A Variable Set is a reusable group of variables shared across multiple catalog items. Instead of creating the same "Delivery Address" fields on 15 different items, create one Variable Set and attach it to all of them.</p>
<pre>// Variable sets are just containers — access their variables
// the same way via current.variables.variable_name</pre>

<h2>Catalog Client Scripts</h2>
<p>These are Client Scripts that run specifically on catalog item forms. They have the same event types (onLoad, onChange, onSubmit) but operate on catalog variables instead of table fields.</p>

<pre>// Catalog Client Script — onChange
// Variable: 'laptop_model'
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) return;

    // Show/hide the 'special_requirements' variable based on model
    if (newValue === 'MacBook Pro 16') {
        g_form.setVisible('special_requirements', true);
        g_form.setMandatory('special_requirements', true);
    } else {
        g_form.setVisible('special_requirements', false);
        g_form.setMandatory('special_requirements', false);
    }
}

// Catalog Client Script — onSubmit
function onSubmit() {
    var model = g_form.getValue('laptop_model');
    var justification = g_form.getValue('justification');

    if (model === 'MacBook Pro 16' && !justification) {
        g_form.addErrorMessage('Justification required for MacBook Pro 16.');
        return false;  // prevent submission
    }
    return true;
}</pre>

<h3>Catalog UI Policy</h3>
<p>Same concept as a regular UI Policy but scoped to catalog variables. Controls visibility, mandatory state, and read-only state of catalog variables without code.</p>
<p>When Laptop Model = "MacBook Pro 16" → make Special Requirements mandatory. Configured entirely through the UI, no JavaScript needed.</p>

<h2>Order Guides</h2>
<p>An Order Guide bundles multiple catalog items into a single guided ordering experience. The user walks through steps, and at the end, multiple RITMs are created.</p>
<p>Order Guide scripts can pre-populate variables on child items based on selections in earlier steps:</p>
<pre>// Order Guide Rule script — maps a variable from the guide to child items
// 'guide_variables' holds the Order Guide level variables
// 'item_variables' holds the current item's variables

item_variables.delivery_location = guide_variables.office_location;
item_variables.cost_center = guide_variables.department_cost_center;</pre>

<h2>Common traps</h2>
<ul>
<li><strong>Catalog Client Scripts vs regular Client Scripts:</strong> Catalog Client Scripts only run on catalog forms. Regular Client Scripts on <code>sc_req_item</code> run on the RITM form, not the catalog order form. These are different contexts.</li>
<li><strong>Variable names vs labels:</strong> In scripts, use the variable <em>name</em> (e.g., <code>laptop_model</code>), not the label ("Laptop Model"). The name is set when you create the variable and cannot contain spaces.</li>
<li><strong>Two-step variable access:</strong> <code>current.variables.var_name</code> in server-side scripts, <code>g_form.getValue('var_name')</code> in client-side scripts. They look different but access the same data.</li>
<li><strong>Multi-row variable sets (MRVS):</strong> These store tabular data and are accessed differently — <code>current.variables.mvrs_name.getRowCount()</code> and iterating rows. They do not work like regular variables.</li>
</ul>`
},

// ================================================================
// POST 89: Debugging and Diagnostics
// ================================================================
{
  id: 89,
  title: "Debugging ServiceNow: Session Debug, Slow Queries, Transaction Logs, and Script Tracing",
  excerpt: "When something breaks in production and you have 10 minutes to find it. System diagnostics, session debug modules, transaction logs, and the logs that actually tell you what happened.",
  readTime: "14 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Intermediate",
  forPersona: ["Developers", "Admins", "Platform Teams"],
  uniqueId: "debugging-diagnostics-reference-1712515200000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T16:00:00Z",
  content: `<h2>Where to look first</h2>
<p>When something is broken — a Business Rule is not firing, a form is slow, a notification is not sending — there are specific logs and tools for each problem. Do not guess. Go to the data.</p>

<table>
<tr><th>Problem</th><th>Where to look</th><th>Navigation path</th></tr>
<tr><td>Script errors</td><td>System Logs > All</td><td><code>syslog_list.do</code></td></tr>
<tr><td>Slow forms/transactions</td><td>Transaction Log</td><td><code>syslog_transaction_list.do</code></td></tr>
<tr><td>Slow database queries</td><td>Slow Queries</td><td><code>sys_slow_query_list.do</code></td></tr>
<tr><td>Email not sending</td><td>Email Log</td><td><code>sys_email_list.do</code></td></tr>
<tr><td>Business Rule not firing</td><td>Session Debug > Business Rule</td><td>See below</td></tr>
<tr><td>ACL blocking access</td><td>Session Debug > Security</td><td>See below</td></tr>
<tr><td>Flow Designer errors</td><td>Flow Execution Details</td><td>Flow Designer > Executions</td></tr>
<tr><td>Integration failures</td><td>Outbound HTTP logs</td><td><code>sys_outbound_http_log_list.do</code></td></tr>
</table>

<h2>Session Debug</h2>
<p>Session Debug turns on detailed tracing for your current session. It does not affect other users. Enable it, reproduce the issue, then check the output in System Logs.</p>

<h3>Enable via the System Diagnostics menu</h3>
<pre>// Navigate to: System Diagnostics > Session Debug > Enable All
// Or enable specific modules:
//   Debug Business Rule — shows which BRs fire, in what order, execution time
//   Debug Security Rules — shows ACL evaluation for every field/table access
//   Debug SQL — shows the raw SQL generated by GlideRecord queries
//   Debug Log — shows all gs.log/info/warn/error output

// After enabling, perform the action you want to debug (e.g., save an incident)
// Then check: System Logs > All (filter by your session)</pre>

<h3>What Debug Business Rule shows you</h3>
<pre>// Example output in System Logs after saving an incident:
// 
// === Business Rule: Set Priority (BEFORE, order 100) ===
// Table: incident
// Condition: priority changes
// Result: EXECUTED (4.2ms)
//
// === Business Rule: Auto-Assign (AFTER, order 200) ===
// Table: incident
// Condition: assignment_group is empty
// Result: SKIPPED (condition false)
//
// This tells you exactly which rules ran, which were skipped, and why.</pre>

<h3>What Debug Security shows you</h3>
<pre>// Example output when a user can't see a field:
//
// ACL: incident.caller_id (read)
// Role required: itil — PASS
// Condition: active=true — PASS
// Script: answer = ... — FAIL
// Result: DENIED
//
// Now you know exactly which ACL is blocking and which check failed.</pre>

<h2>System Logs</h2>
<pre>// Everything you write with gs.info, gs.warn, gs.error shows up here
// Filter by source to find your script's output:
gs.info('My debug output', 'MyScriptInclude');

// In the syslog table, filter:
//   Source = MyScriptInclude
//   Level = Info/Warning/Error
//   Created > last 10 minutes</pre>

<h2>Transaction Log</h2>
<p>Every HTTP request to the instance is logged with timing data. When a form is slow, find the transaction here.</p>
<pre>// Navigate to: syslog_transaction_list.do
// Key fields:
//   URL — which page/form/API was requested
//   Response time — total milliseconds
//   SQL count — number of database queries
//   Business Rule time — time spent in BRs
//
// Red flags:
//   Response time > 5000ms — slow transaction
//   SQL count > 100 — too many queries (N+1 problem likely)
//   Business Rule time > 2000ms — heavy BR logic</pre>

<h2>Slow Query Log</h2>
<p>Queries that take longer than the threshold (default 500ms) are automatically logged here.</p>
<pre>// Navigate to: sys_slow_query_list.do
// Key fields:
//   Table — which table was queried
//   Execution time — how long the query took
//   Source — which script/BR triggered it
//   Query — the encoded query string
//
// Common causes:
//   Missing index on a filtered field
//   No setLimit() on a large table query
//   Dot-walking through multiple reference fields
//   GlideRecord loop inside another GlideRecord loop (N+1)</pre>

<h2>Email debugging</h2>
<pre>// When a notification does not send, check these in order:
// 1. sys_email_list.do — is the email record created? What is its state?
//    States: ready, sent, send-failed, skipped
//
// 2. If state = skipped:
//    Check the notification's conditions and "Who will receive" config
//    Check if the user unsubscribed (notification_preference table)
//
// 3. If state = send-failed:
//    Check syslog for SMTP errors
//
// 4. In sub-production instances:
//    Check glide.email.test.user property — it redirects ALL email
//    to a single address. This is by design to prevent test emails
//    going to real users.</pre>

<h2>Script debugging without session debug</h2>
<pre>// Quick debugging pattern for Business Rules:
(function executeRule(current, previous) {
    // Temporarily add targeted logging
    gs.info('[BR:SetPriority] Fired on ' + current.number +
            ' | impact=' + current.getValue('impact') +
            ' | urgency=' + current.getValue('urgency') +
            ' | old_priority=' + (previous ? previous.getValue('priority') : 'N/A'));

    // Your logic here...

    gs.info('[BR:SetPriority] Result: priority set to ' + current.getValue('priority'));
})(current, previous);

// Find your logs: System Logs > All, filter Source CONTAINS SetPriority</pre>

<h2>Stats.do — Quick instance diagnostics</h2>
<p>Navigate to <code>your-instance.service-now.com/stats.do</code> for a quick overview of instance health: memory usage, active transactions, semaphore counts, node status, and session counts. Useful during performance incidents when you need a fast read on whether the instance itself is under stress.</p>

<h2>Common traps</h2>
<ul>
<li><strong>Session debug left on:</strong> Debug sessions generate large amounts of log data. Always disable after you are done. Leaving it on in production degrades performance.</li>
<li><strong>Logging sensitive data:</strong> <code>gs.info</code> writes to syslog which is visible to admins. Never log passwords, PII, or API keys.</li>
<li><strong>Debug output not showing:</strong> If you enabled debug but see nothing, check that you are looking at the correct time window and that your script actually executed. Also verify you are on the correct node in a multi-node instance.</li>
<li><strong>Transaction log vs slow query:</strong> A slow transaction does not always mean a slow query. The time could be in Business Rule execution, external REST calls, or Flow Designer actions. Check the breakdown columns.</li>
</ul>`
},

];

// Prepend new posts (newest first)
posts.unshift(...newPosts);

fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
fs.copyFileSync('data/posts.json', 'posts.json');
console.log('Added ' + newPosts.length + ' new reference posts. Total posts: ' + posts.length);
