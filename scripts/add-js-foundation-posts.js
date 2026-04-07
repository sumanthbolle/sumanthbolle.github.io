const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));

const newPosts = [

// ================================================================
// POST 90: JavaScript Inside ServiceNow — From Scratch
// ================================================================
{
  id: 90,
  title: "JavaScript Inside ServiceNow: var, let, const, Types, and What Actually Runs Where",
  excerpt: "ServiceNow runs JavaScript but it is not the same JavaScript you write in a browser or Node.js. This is the ground-up reference — variables, types, scope, and the engine differences that trip people up from day one.",
  readTime: "20 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Beginners", "Developers", "Career Switchers"],
  uniqueId: "javascript-inside-servicenow-from-scratch-1712520000000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T17:00:00Z",
  content: `<h2>The first thing to know</h2>
<p>ServiceNow runs two completely separate JavaScript environments. Code that works on one side will crash on the other.</p>
<table>
<tr><th></th><th>Server-side</th><th>Client-side</th></tr>
<tr><td>Runs in</td><td>ServiceNow's Java-based server (Rhino engine)</td><td>The user's web browser</td></tr>
<tr><td>Script types</td><td>Business Rules, Script Includes, Scheduled Jobs, Fix Scripts, Background Scripts</td><td>Client Scripts, UI Policies (scripted), UI Actions (client)</td></tr>
<tr><td>JS version</td><td>ES5 (no let/const, no arrow functions, no template literals in global scope)</td><td>Modern ES6+ (depends on the user's browser)</td></tr>
<tr><td>Database access</td><td>Yes — GlideRecord, GlideAggregate</td><td>No — must use GlideAjax to call server</td></tr>
<tr><td>Available objects</td><td><code>current</code>, <code>previous</code>, <code>gs</code>, <code>GlideRecord</code></td><td><code>g_form</code>, <code>g_user</code>, <code>g_list</code></td></tr>
</table>

<h2>Variables: var, let, const</h2>

<h3>Server-side (Business Rules, Script Includes)</h3>
<p>The server uses the <strong>Rhino engine</strong> which only supports <strong>ES5</strong> in global scope. That means:</p>
<pre>// This works everywhere on the server:
var name = 'incident';
var count = 0;
var isActive = true;

// This FAILS in global-scope server scripts:
// let name = 'incident';    // SyntaxError
// const MAX = 100;          // SyntaxError
// var msg = \`Hello \${name}\`; // SyntaxError — no template literals

// EXCEPTION: Scoped applications run on a newer engine (ES2021+)
// In scoped apps, let/const/arrow functions DO work:
// let x = 10;  // works in scoped app scripts
// const y = 20; // works in scoped app scripts</pre>
<p><strong>Rule of thumb:</strong> In global scope, use <code>var</code>. In scoped applications, you can use <code>let</code> and <code>const</code>. When in doubt, use <code>var</code> — it works everywhere.</p>

<h3>Client-side (Client Scripts)</h3>
<p>Client scripts run in the browser, so modern JS works fine:</p>
<pre>// All of these work in Client Scripts:
var oldWay = 'works';
let newWay = 'also works';
const CONSTANT = 'works too';
var msg = \`Hello \${oldWay}\`; // template literals work</pre>

<h3>var vs let — the actual difference</h3>
<pre>// var is function-scoped — it leaks out of blocks
for (var i = 0; i &lt; 5; i++) {
    // i is visible here
}
gs.info(i); // 5 — var leaks out of the for loop

// let is block-scoped — it stays inside the block
for (let j = 0; j &lt; 5; j++) {
    // j is visible here
}
// gs.info(j); // ReferenceError — j does not exist here

// const — like let but cannot be reassigned
const MAX_RETRIES = 3;
// MAX_RETRIES = 5; // TypeError — cannot reassign</pre>

<h2>Data types</h2>
<pre>// String
var desc = 'Server is down';
var desc2 = "Also a string";  // single or double quotes both work

// Number (integer and decimal are the same type)
var priority = 1;
var percent = 99.5;

// Boolean
var isActive = true;
var isClosed = false;

// Null and Undefined
var assigned = null;       // explicitly set to nothing
var notSet;                // undefined — never assigned a value
// gs.nil() checks for null, undefined, AND empty string:
gs.info(gs.nil(null));       // true
gs.info(gs.nil(undefined));  // true
gs.info(gs.nil(''));         // true
gs.info(gs.nil('hello'));    // false

// Array
var priorities = [1, 2, 3, 4];
gs.info(priorities[0]);     // 1
gs.info(priorities.length); // 4

// Object
var config = {
    table: 'incident',
    limit: 50,
    active: true
};
gs.info(config.table);      // 'incident'
gs.info(config['limit']);   // 50 — bracket notation also works</pre>

<h2>Type gotchas in ServiceNow</h2>
<p>GlideRecord fields do not return plain JavaScript types. They return <strong>GlideElement</strong> objects. This causes bugs that are hard to spot.</p>
<pre>var gr = new GlideRecord('incident');
gr.get('number', 'INC0010001');

// WRONG — comparing a GlideElement to a string
if (gr.priority == '1') {
    // This MIGHT work, but it is unreliable.
    // gr.priority is a GlideElement object, not a string.
}

// CORRECT — use getValue() to get the raw string value
if (gr.getValue('priority') == '1') {
    // This always works. getValue returns a plain string.
}

// WRONG — concatenating GlideElement into a string
var msg = 'Priority is ' + gr.priority;
// This calls toString() on the GlideElement, which usually works
// but can behave unexpectedly with reference fields.

// CORRECT — explicit getValue
var msg = 'Priority is ' + gr.getValue('priority');

// WRONG — storing a GlideElement in a variable for later use
var saved = gr.caller_id;
gr.next(); // moves to next record
gs.info(saved); // NOW POINTS TO THE NEW RECORD'S caller_id!
// GlideElement is a reference to the cursor position, not a copy.

// CORRECT — store the value, not the element
var saved = gr.getValue('caller_id');
gr.next();
gs.info(saved); // still has the original value</pre>

<h2>Functions</h2>
<pre>// Basic function (works everywhere)
function calculatePriority(impact, urgency) {
    if (impact == 1 && urgency == 1) return 1;
    if (impact == 1 || urgency == 1) return 2;
    return 3;
}
var p = calculatePriority(1, 2); // returns 2

// Function in a Business Rule (the wrapper pattern)
// ServiceNow wraps your BR code in an IIFE:
(function executeRule(current, previous) {
    // 'current' = the record being saved
    // 'previous' = the record before changes (null on insert)

    current.priority = calculatePriority(
        current.getValue('impact'),
        current.getValue('urgency')
    );
})(current, previous);

// Arrow functions — ONLY in scoped apps or client scripts
// var calc = (a, b) => a + b;  // fails in global server scope
// Use regular functions on the server in global scope.</pre>

<h2>Loops</h2>
<pre>// for loop — iterate a known number of times
for (var i = 0; i &lt; 10; i++) {
    gs.info('Iteration ' + i);
}

// while loop — the GlideRecord pattern
var gr = new GlideRecord('incident');
gr.addQuery('active', true);
gr.setLimit(100);
gr.query();
while (gr.next()) {
    gs.info(gr.getValue('number'));
}
// gr.next() returns false when there are no more records

// for...in — iterate over object keys
var config = { table: 'incident', limit: 50 };
for (var key in config) {
    gs.info(key + ' = ' + config[key]);
}
// Output: table = incident, limit = 50

// Array iteration
var items = ['one', 'two', 'three'];
for (var i = 0; i &lt; items.length; i++) {
    gs.info(items[i]);
}
// .forEach works in scoped apps and client scripts:
// items.forEach(function(item) { gs.info(item); });</pre>

<h2>Conditionals</h2>
<pre>// if / else if / else
var priority = gr.getValue('priority');
if (priority == '1') {
    gs.info('Critical');
} else if (priority == '2') {
    gs.info('High');
} else {
    gs.info('Normal or lower');
}

// == vs === (loose vs strict equality)
gs.info(1 == '1');   // true — loose comparison, converts types
gs.info(1 === '1');  // false — strict comparison, different types
// In ServiceNow, getValue() always returns strings, so:
// gr.getValue('priority') == 1   → true (loose, works)
// gr.getValue('priority') === 1  → false (strict, different types)
// gr.getValue('priority') === '1' → true (strict, both strings)
// Best practice: use == when comparing getValue output to numbers,
// or convert explicitly: Number(gr.getValue('priority')) === 1

// Ternary operator
var label = (priority == '1') ? 'Critical' : 'Not critical';

// Switch statement
switch (gr.getValue('state')) {
    case '1': gs.info('New'); break;
    case '2': gs.info('In Progress'); break;
    case '6': gs.info('Resolved'); break;
    case '7': gs.info('Closed'); break;
    default: gs.info('Other state');
}</pre>

<h2>Strings</h2>
<pre>var desc = 'Email server down in building A';

desc.length;                    // 33
desc.indexOf('server');         // 6 (position of first match)
desc.indexOf('xyz');            // -1 (not found)
desc.includes('server');        // true (scoped apps/client only)
desc.toLowerCase();             // 'email server down in building a'
desc.toUpperCase();             // 'EMAIL SERVER DOWN IN BUILDING A'
desc.substring(0, 5);          // 'Email'
desc.split(' ');                // ['Email', 'server', 'down', 'in', 'building', 'A']
desc.replace('down', 'offline'); // 'Email server offline in building A'
desc.trim();                    // removes leading/trailing whitespace

// String concatenation
var msg = 'Incident ' + gr.getValue('number') + ' is priority ' + gr.getValue('priority');

// Template literals (scoped apps and client scripts only)
// var msg = \`Incident \${number} is priority \${priority}\`;</pre>

<h2>Arrays</h2>
<pre>var groups = ['Network', 'Database', 'Security'];

groups.length;          // 3
groups[0];              // 'Network'
groups.push('Storage'); // adds to end: ['Network','Database','Security','Storage']
groups.pop();           // removes last: ['Network','Database','Security']
groups.indexOf('Database'); // 1
groups.join(', ');      // 'Network, Database, Security'

// Check if value exists in array
if (groups.indexOf('Network') !== -1) {
    gs.info('Found it');
}

// Build an array from GlideRecord results
var numbers = [];
var gr = new GlideRecord('incident');
gr.addQuery('priority', 1);
gr.setLimit(10);
gr.query();
while (gr.next()) {
    numbers.push(gr.getValue('number'));
}
gs.info('P1 incidents: ' + numbers.join(', '));</pre>

<h2>Objects / JSON</h2>
<pre>// Create an object
var incident = {
    number: 'INC0010001',
    priority: 1,
    active: true,
    tags: ['network', 'vpn']
};

// Access properties
gs.info(incident.number);       // 'INC0010001'
gs.info(incident['priority']);  // 1

// Add/modify properties
incident.state = 'New';
incident.priority = 2;

// Convert to JSON string (for logging, REST payloads, etc.)
var jsonStr = JSON.stringify(incident);
gs.info(jsonStr);
// {"number":"INC0010001","priority":2,"active":true,"tags":["network","vpn"],"state":"New"}

// Parse JSON string back to object
var parsed = JSON.parse(jsonStr);
gs.info(parsed.number); // 'INC0010001'

// Common use: REST API responses
var response = new sn_ws.RESTMessageV2('MyAPI', 'GET');
var body = response.execute().getBody();
var data = JSON.parse(body);  // parse response body into usable object</pre>

<h2>Error handling</h2>
<pre>// try/catch — prevent your script from crashing the entire transaction
try {
    var gr = new GlideRecord('incident');
    gr.get('number', 'INC0010001');
    var result = JSON.parse(gr.getValue('u_custom_json_field'));
    gs.info(result.key);
} catch (e) {
    gs.error('Failed to parse JSON: ' + e.message);
    // The script continues instead of crashing
}

// try/catch/finally
try {
    // risky operation
} catch (e) {
    gs.error('Error: ' + e.message);
} finally {
    // runs no matter what — cleanup code goes here
}

// When to use try/catch:
// - Parsing JSON from external systems (malformed data)
// - REST API calls (network failures)
// - Any operation where bad data could crash your Business Rule</pre>

<h2>Scope — the #1 confusion point</h2>
<pre>// Variables declared with var inside a function are LOCAL to that function
function myFunction() {
    var localVar = 'only exists here';
    gs.info(localVar); // works
}
// gs.info(localVar); // ReferenceError — does not exist outside

// Variables declared outside any function are GLOBAL to the script
var globalVar = 'visible everywhere in this script';
function test() {
    gs.info(globalVar); // works — can see the outer variable
}

// In Business Rules, 'current' and 'previous' are provided by the platform.
// You do not declare them. They are injected into the script context:
(function executeRule(current, previous) {
    // current = the record being modified
    // previous = the record BEFORE your changes (null on insert)
    // Both are GlideRecord objects pointing to the current row
})(current, previous);</pre>

<h2>What does NOT work on the server</h2>
<pre>// These are browser/Node.js features. They do not exist on the ServiceNow server.

// setTimeout / setInterval — no timers on server
// setTimeout(function() { }, 1000); // does not exist

// console.log — use gs.info instead
// console.log('test'); // does not exist

// document / window / DOM — there is no browser on the server
// document.getElementById('test'); // does not exist

// fetch / XMLHttpRequest — use RESTMessageV2 instead
// fetch('https://api.example.com'); // does not exist

// require / import — use gs.include for Script Includes
// var lib = require('mylib'); // does not exist

// Promise / async / await — not available in global scope server scripts
// Use GlideHTTPRequest or synchronous REST calls</pre>

<h2>Quick reference: where to write each script type</h2>
<table>
<tr><th>I want to...</th><th>Write a...</th><th>Navigate to</th></tr>
<tr><td>Validate data before save</td><td>Before Business Rule</td><td>System Definition > Business Rules</td></tr>
<tr><td>Create related records after save</td><td>After Business Rule</td><td>System Definition > Business Rules</td></tr>
<tr><td>Show/hide fields on a form</td><td>Client Script (onLoad/onChange) or UI Policy</td><td>System Definition > Client Scripts</td></tr>
<tr><td>Validate before form submit</td><td>Client Script (onSubmit)</td><td>System Definition > Client Scripts</td></tr>
<tr><td>Reusable server function</td><td>Script Include</td><td>System Definition > Script Includes</td></tr>
<tr><td>Call server from client</td><td>GlideAjax + Script Include (extends AbstractAjaxProcessor)</td><td>Both</td></tr>
<tr><td>Run something on a schedule</td><td>Scheduled Job</td><td>System Definition > Scheduled Jobs</td></tr>
<tr><td>One-time data cleanup</td><td>Fix Script or Background Script</td><td>System Definition > Fix Scripts, or Scripts - Background</td></tr>
<tr><td>Custom button on a form</td><td>UI Action</td><td>System Definition > UI Actions</td></tr>
</table>`
},

// ================================================================
// POST 91: ServiceNow Scripting Keywords Deep Dive
// ================================================================
{
  id: 91,
  title: "Every Scripting Keyword That Matters in ServiceNow: current, previous, g_form, gs, and the Objects You Must Know",
  excerpt: "The built-in objects and keywords injected into every script context. What they are, what they contain, when they are null, and the mistakes that come from not understanding them.",
  readTime: "16 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Beginners", "Developers", "Career Switchers"],
  uniqueId: "scripting-keywords-deep-dive-1712523600000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T18:00:00Z",
  content: `<h2>How ServiceNow injects objects into your scripts</h2>
<p>When you write a Business Rule, Client Script, or Script Include, ServiceNow wraps your code and injects specific objects depending on the context. You do not import or declare these — they just exist.</p>

<h2>current (server-side)</h2>
<p>Available in: Business Rules, Workflow scripts, Flow Designer script steps</p>
<p><code>current</code> is a GlideRecord object pointing to the record being operated on. When a user saves an incident, <code>current</code> is that incident.</p>
<pre>// Before Business Rule on incident table
(function executeRule(current, previous) {
    gs.info(current.getValue('number'));        // INC0010001
    gs.info(current.getValue('state'));          // 1
    gs.info(current.getTableName());             // incident
    gs.info(current.isNewRecord());              // true on insert, false on update
    gs.info(current.isActionAborted());          // false (unless someone called setAbortAction)

    // Modify the record before it saves
    current.priority = 1;
    current.work_notes = 'Auto-escalated by Business Rule';

    // Abort the save entirely
    // current.setAbortAction(true);
    // gs.addErrorMessage('Cannot save: missing required data');
})(current, previous);</pre>

<h3>When current is null</h3>
<ul>
<li>Script Includes called directly (not from a BR context) — <code>current</code> is not defined</li>
<li>Background Scripts — <code>current</code> is not defined unless you create your own GlideRecord</li>
<li>Scheduled Jobs — <code>current</code> is not defined</li>
</ul>

<h2>previous (server-side)</h2>
<p>Available in: Business Rules (update and delete operations only)</p>
<p><code>previous</code> is a read-only GlideRecord snapshot of the record BEFORE the current changes. It lets you compare old vs new values.</p>
<pre>(function executeRule(current, previous) {
    // Check if priority changed
    if (current.getValue('priority') != previous.getValue('priority')) {
        gs.info('Priority changed from ' + previous.getValue('priority') +
                ' to ' + current.getValue('priority'));
    }

    // Check if the record was reassigned
    if (current.getValue('assigned_to') != previous.getValue('assigned_to')) {
        gs.info('Reassigned from ' + previous.getDisplayValue('assigned_to') +
                ' to ' + current.getDisplayValue('assigned_to'));
    }
})(current, previous);</pre>

<h3>When previous is null</h3>
<ul>
<li><strong>On insert:</strong> <code>previous</code> is null — there is no "before" state for a new record. Always check: <code>if (previous)</code> before using it.</li>
<li><strong>In async Business Rules:</strong> <code>previous</code> is NOT available. Async BRs run outside the original transaction, so the previous state is gone.</li>
<li><strong>In Display Business Rules:</strong> <code>previous</code> is not available (the record is being read, not modified).</li>
</ul>

<pre>// Safe pattern — always guard against null previous
(function executeRule(current, previous) {
    if (previous && current.state.changesTo(6)) {
        // State changed to Resolved — only runs on update, not insert
        gs.eventQueue('incident.resolved', current, gs.getUserID(), '');
    }
})(current, previous);</pre>

<h2>GlideElement methods on current/previous</h2>
<p>When you access <code>current.priority</code>, you do not get a number or string. You get a <strong>GlideElement</strong> object with these methods:</p>
<pre>// changes() — did this field change in this transaction?
if (current.priority.changes()) {
    gs.info('Priority was modified');
}

// changesTo(value) — did it change TO this specific value?
if (current.state.changesTo(6)) {
    gs.info('State just changed to Resolved');
}
// NOTE: the value must be the INTERNAL value (number), not the display label.
// changesTo('Resolved') will NOT work. Use changesTo(6).

// changesFrom(value) — did it change FROM this specific value?
if (current.state.changesFrom(1)) {
    gs.info('Was previously New, now something else');
}

// nil() — is the field empty/null?
if (current.assigned_to.nil()) {
    gs.info('Nobody assigned');
}

// toString() — convert GlideElement to string
var desc = current.short_description.toString();

// getDisplayValue() — the human-readable label
gs.info(current.state.getDisplayValue());  // 'New', 'In Progress', etc.

// getReferenceTable() — for reference fields, get the target table
gs.info(current.caller_id.getReferenceTable());  // 'sys_user'

// getRefRecord() — get the full referenced record
var callerGR = current.caller_id.getRefRecord();
gs.info(callerGR.getValue('email'));  // caller's email address</pre>

<h2>gs (GlideSystem) — the utility belt</h2>
<p>Available in: all server-side scripts. <code>gs</code> is a global object with system utility methods.</p>

<h3>User context</h3>
<pre>gs.getUserID();           // sys_id of logged-in user
gs.getUserName();         // 'john.smith'
gs.getUserDisplayName();  // 'John Smith'
gs.hasRole('admin');      // true/false
gs.hasRole('itil');       // true/false

// Get the full user GlideRecord
var userGR = gs.getUser().getRecord();
gs.info(userGR.getValue('email'));</pre>

<h3>Messages</h3>
<pre>// These show banners on the user's screen (only in before/after BRs)
gs.addInfoMessage('Record updated successfully.');
gs.addErrorMessage('Cannot save: priority 1 requires an assignment group.');

// These do NOT work in:
// - Async Business Rules (user's transaction is already done)
// - Scheduled Jobs (no user session)
// - Script Includes called from REST APIs</pre>

<h3>Dates and time</h3>
<pre>gs.now();                    // '2026-04-07 14:30:00' (user's timezone)
gs.nowDateTime();            // '2026-04-07 14:30:00' (system format)
gs.daysAgo(7);               // date/time 7 days ago
gs.daysAgoStart(7);          // start of day, 7 days ago (midnight)
gs.beginningOfLastMonth();   // first day of previous month
gs.endOfLastMonth();         // last day of previous month</pre>

<h3>Checking for empty values</h3>
<pre>// gs.nil() is the safest way to check for empty values
gs.nil(null);       // true
gs.nil(undefined);  // true
gs.nil('');         // true
gs.nil(0);          // false (zero is not nil)
gs.nil('hello');    // false

// Use it to guard against empty fields
var assignee = gr.getValue('assigned_to');
if (gs.nil(assignee)) {
    gs.info('No assignee');
}</pre>

<h2>g_form (client-side)</h2>
<p>Available in: Client Scripts, UI Actions (client-side). NOT available on the server.</p>
<p><code>g_form</code> controls the form the user is looking at in their browser.</p>
<pre>// onChange Client Script
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) return;  // do not run when the form first loads

    // Read a field value
    var priority = g_form.getValue('priority');  // '1', '2', '3', etc.

    // Set a field value
    g_form.setValue('urgency', '1');

    // Make a field mandatory
    g_form.setMandatory('assignment_group', true);

    // Hide a field
    g_form.setVisible('u_internal_only', false);

    // Show a message
    g_form.addInfoMessage('Priority updated.');
}

// onLoad Client Script — runs when the form opens
function onLoad() {
    if (g_form.isNewRecord()) {
        g_form.setValue('contact_type', 'self-service');
    }
}

// onSubmit Client Script — runs when the user clicks Save
function onSubmit() {
    var desc = g_form.getValue('short_description');
    if (desc.length < 10) {
        g_form.addErrorMessage('Description must be at least 10 characters.');
        return false;  // prevents the form from submitting
    }
    return true;
}</pre>

<h2>g_user (client-side)</h2>
<pre>// Available in Client Scripts
g_user.userName;          // 'john.smith'
g_user.userID;            // sys_id of current user
g_user.getFullName();     // 'John Smith'
g_user.hasRole('itil');   // true/false
g_user.hasRoleExactly('incident_manager');  // true only for that specific role

// Common pattern: show/hide fields based on role
function onLoad() {
    if (!g_user.hasRole('itil')) {
        g_form.setVisible('u_technical_notes', false);
    }
}</pre>

<h2>The client-server boundary</h2>
<p>This is the single most important concept in ServiceNow scripting. The server and client are completely separate environments. You cannot call GlideRecord from a Client Script. You cannot call g_form from a Business Rule.</p>

<h3>Getting server data from the client: GlideAjax</h3>
<pre>// Step 1: Create a Script Include on the server
// Name: IncidentUtils
// Must extend AbstractAjaxProcessor to be callable from client
var IncidentUtils = Class.create();
IncidentUtils.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    getCallerEmail: function() {
        var userId = this.getParameter('sysparm_user_id');
        var gr = new GlideRecord('sys_user');
        if (gr.get(userId)) {
            return gr.getValue('email');
        }
        return '';
    },
    type: 'IncidentUtils'
});

// Step 2: Call it from a Client Script
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || !newValue) return;

    var ga = new GlideAjax('IncidentUtils');
    ga.addParam('sysparm_name', 'getCallerEmail');
    ga.addParam('sysparm_user_id', newValue);
    ga.getXMLAnswer(function(answer) {
        // 'answer' is the string returned by the server method
        g_form.setValue('u_caller_email', answer);
    });
}

// KEY RULES:
// 1. Script Include MUST extend AbstractAjaxProcessor
// 2. Use this.getParameter() to read params on the server
// 3. Always use getXMLAnswer with a callback (async)
// 4. Return values are always strings</pre>

<h3>Pushing server data to the client: g_scratchpad</h3>
<pre>// Display Business Rule (server-side, runs on form load)
(function executeRule(current, previous) {
    g_scratchpad.isVIP = String(current.caller_id.vip == true);
    g_scratchpad.openCount = '42';  // must be string/simple types
})(current, previous);

// Client Script (onLoad) — reads g_scratchpad
function onLoad() {
    if (g_scratchpad.isVIP === 'true') {
        g_form.addInfoMessage('This caller is a VIP.');
    }
}
// g_scratchpad avoids a GlideAjax round-trip.
// Use it for data you know you will need on every form load.</pre>

<h2>Putting it all together: a real example</h2>
<pre>// GOAL: When a user sets priority to 1 on an incident form,
// make assignment_group mandatory, show a warning,
// and auto-populate the escalation contact from the server.

// === Before Business Rule (server) ===
// Table: incident, When: before, Insert/Update: true
(function executeRule(current, previous) {
    if (current.getValue('priority') == '1' && current.assigned_to.nil()) {
        // Server-side validation — catches API and import submissions too
        current.setAbortAction(true);
        gs.addErrorMessage('P1 incidents must have an assigned person.');
    }
})(current, previous);

// === Client Script (onChange on priority field) ===
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) return;
    if (newValue == '1') {
        g_form.setMandatory('assignment_group', true);
        g_form.addInfoMessage('P1 selected — assignment group is now required.');

        // Fetch escalation contact from server
        var ga = new GlideAjax('IncidentUtils');
        ga.addParam('sysparm_name', 'getEscalationContact');
        ga.addParam('sysparm_group', g_form.getValue('assignment_group'));
        ga.getXMLAnswer(function(contact) {
            if (contact) {
                g_form.setValue('u_escalation_contact', contact);
            }
        });
    } else {
        g_form.setMandatory('assignment_group', false);
    }
}

// This covers both sides: the client makes the field mandatory
// and shows a message, while the server enforces it for API callers
// who bypass the form entirely.</pre>`
},

// ================================================================
// POST 92: Conditions, Operators, and Query Building
// ================================================================
{
  id: 92,
  title: "Conditions and Query Building in ServiceNow: Filters, Encoded Queries, Condition Builder, and Script Equivalents",
  excerpt: "Every way to filter records in ServiceNow — from the UI condition builder to encoded queries to GlideRecord addQuery to dot-walking. How they connect and when to use each one.",
  readTime: "14 min read",
  category: "servicenow",
  learningPath: "servicenow",
  difficulty: "Beginner",
  forPersona: ["Beginners", "Developers", "Admins"],
  uniqueId: "conditions-query-building-1712527200000",
  date: "Apr 7, 2026",
  dateISO: "2026-04-07T19:00:00Z",
  content: `<h2>Three ways to filter records</h2>
<p>In ServiceNow, you filter records in three places. They all generate the same thing underneath — an <strong>encoded query</strong>.</p>
<table>
<tr><th>Where</th><th>How</th><th>Used by</th></tr>
<tr><td>List filter (UI)</td><td>Condition builder — dropdown menus</td><td>Admins, end users</td></tr>
<tr><td>Encoded query string</td><td>Text string like <code>priority=1^active=true</code></td><td>URL params, scripts, reports</td></tr>
<tr><td>GlideRecord addQuery</td><td>JavaScript method calls</td><td>Developers in scripts</td></tr>
</table>

<h2>The condition builder (UI)</h2>
<p>Every list view has a filter icon (funnel). Click it, and you get the condition builder. You pick a field, an operator, and a value. You can chain conditions with AND/OR.</p>
<p>After building your filter, you can get the encoded query string: right-click the breadcrumb above the list and select <strong>"Copy query"</strong>. This gives you a string you can paste into scripts.</p>

<h2>Encoded query syntax</h2>
<p>An encoded query is a string representation of filter conditions. <code>^</code> means AND. <code>^OR</code> means OR. <code>^NQ</code> means a new query (OR group).</p>
<pre>// Simple conditions
priority=1                          // priority equals 1
active=true                         // active is true
state!=6                            // state is not 6 (Resolved)

// Chaining with AND (^)
priority=1^active=true^state!=6
// priority = 1 AND active = true AND state != 6

// OR conditions (^OR)
priority=1^ORpriority=2
// priority = 1 OR priority = 2

// Grouped OR with AND
priority=1^ORpriority=2^active=true
// (priority = 1 OR priority = 2) AND active = true

// Special operators
short_descriptionLIKEvpn           // contains 'vpn'
short_descriptionSTARTSWITHEmail   // starts with 'Email'
short_descriptionENDSWITHfailed    // ends with 'failed'
assigned_toISEMPTY                 // field is empty
assigned_toISNOTEMPTY              // field is not empty
sys_created_on&gt;2026-01-01        // created after Jan 1
sys_created_onONToday              // created today
sys_created_onRELATIVEGE@hour@ago@24  // created in last 24 hours

// Reference field dot-walking
assignment_group.name=Network Ops   // group name (through reference)
caller_id.department.name=IT        // caller's department name

// IN operator
stateIN1,2,3                       // state is 1, 2, or 3
stateNOT IN6,7                     // state is not 6 or 7</pre>

<h2>Using encoded queries in scripts</h2>
<pre>// Instead of multiple addQuery calls:
var gr = new GlideRecord('incident');
gr.addQuery('priority', 1);
gr.addQuery('active', true);
gr.addQuery('state', '!=', 6);
gr.query();

// You can do this in one line:
var gr = new GlideRecord('incident');
gr.addEncodedQuery('priority=1^active=true^state!=6');
gr.query();

// Both produce the exact same SQL query. Use whichever is clearer.
// For complex filters, encoded queries are often easier to read
// and you can copy them directly from the list filter UI.</pre>

<h3>Building encoded queries dynamically</h3>
<pre>// Build a query string from variables
var table = 'incident';
var maxAge = 30;
var groups = ['Network Ops', 'Database Admins'];

var query = 'active=true';
query += '^sys_created_on>=' + gs.daysAgo(maxAge);
query += '^assignment_group.nameIN' + groups.join(',');

var gr = new GlideRecord(table);
gr.addEncodedQuery(query);
gr.query();
gs.info('Matching records: ' + gr.getRowCount());</pre>

<h2>Dot-walking</h2>
<p>Dot-walking lets you traverse reference fields to access fields on related records. It works in queries, getValue, and getDisplayValue.</p>
<pre>var gr = new GlideRecord('incident');
gr.addQuery('priority', 1);
gr.query();
while (gr.next()) {
    // Direct field
    gs.info(gr.getValue('number'));

    // One level: caller's name
    gs.info(gr.getDisplayValue('caller_id'));

    // Two levels: caller's department name
    gs.info(gr.getValue('caller_id.department'));       // sys_id of department
    gs.info(gr.getDisplayValue('caller_id.department')); // 'IT'

    // Three levels: caller's department head's email
    gs.info(gr.getValue('caller_id.department.dept_head.email'));
}

// Dot-walking in queries works the same way:
var gr = new GlideRecord('incident');
gr.addQuery('caller_id.department.name', 'IT');
gr.addQuery('caller_id.vip', true);
gr.query();
// Finds incidents where the caller is in the IT department AND is a VIP</pre>

<h3>Dot-walking performance trap</h3>
<pre>// BAD: dot-walking inside a loop fires a separate query per row
var gr = new GlideRecord('incident');
gr.addQuery('active', true);
gr.setLimit(500);
gr.query();
while (gr.next()) {
    // Each of these is a separate database query!
    var email = gr.caller_id.email.toString();
    var dept = gr.caller_id.department.name.toString();
}
// For 500 rows, this could be 1000+ extra queries.

// BETTER: query the related table separately and build a lookup
var users = {};
var userGr = new GlideRecord('sys_user');
userGr.addQuery('sys_id', 'IN', callerIds.join(','));
userGr.query();
while (userGr.next()) {
    users[userGr.getValue('sys_id')] = {
        email: userGr.getValue('email'),
        dept: userGr.getDisplayValue('department')
    };
}</pre>

<h2>Condition builder in Business Rules, Notifications, etc.</h2>
<p>Many ServiceNow configuration records (Business Rules, Notifications, UI Policies, ACLs) have a "Condition" field that uses the same condition builder as list filters. The condition is stored as an encoded query string internally.</p>
<pre>// When you configure a Business Rule with condition:
//   priority = 1 AND state changes to Resolved
// The platform stores it as:
//   priority=1^stateVALCHANGES6

// VALCHANGES is a special operator meaning "value changed to"
// It only evaluates to true during the transaction where the change happens.
// Other special operators:
//   VALCHANGES  — value changed to
//   ANYTHING    — field was modified (any change)
//   SAMEAS      — same as another field's value
//   NSAMEAS     — not same as another field's value</pre>

<h2>Quick reference table</h2>
<table>
<tr><th>I want to</th><th>UI operator</th><th>Encoded query</th><th>addQuery equivalent</th></tr>
<tr><td>Equals</td><td>is</td><td><code>priority=1</code></td><td><code>addQuery('priority', 1)</code></td></tr>
<tr><td>Not equals</td><td>is not</td><td><code>state!=6</code></td><td><code>addQuery('state', '!=', 6)</code></td></tr>
<tr><td>Greater than</td><td>greater than</td><td><code>priority&gt;2</code></td><td><code>addQuery('priority', '>', 2)</code></td></tr>
<tr><td>Contains</td><td>contains</td><td><code>short_descriptionLIKEvpn</code></td><td><code>addQuery('short_description', 'CONTAINS', 'vpn')</code></td></tr>
<tr><td>Starts with</td><td>starts with</td><td><code>numberSTARTSWITHINC</code></td><td><code>addQuery('number', 'STARTSWITH', 'INC')</code></td></tr>
<tr><td>Is empty</td><td>is empty</td><td><code>assigned_toISEMPTY</code></td><td><code>addQuery('assigned_to', 'ISEMPTY', '')</code></td></tr>
<tr><td>In list</td><td>is one of</td><td><code>stateIN1,2,3</code></td><td><code>addQuery('state', 'IN', '1,2,3')</code></td></tr>
<tr><td>Changed to</td><td>changes to</td><td><code>stateVALCHANGES6</code></td><td><code>current.state.changesTo(6)</code> (in BR)</td></tr>
</table>`
}
];

posts.unshift(...newPosts);
fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
fs.copyFileSync('data/posts.json', 'posts.json');
console.log('Added ' + newPosts.length + ' new JS foundation posts. Total posts: ' + posts.length);
