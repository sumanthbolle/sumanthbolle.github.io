const fs = require('fs');
let html = fs.readFileSync('blog.html', 'utf8');

// Map of topic ID to new content
const rewrites = {

// ===== MODULE 1: Foundations =====

"1.3": `<h2>Release Cycle</h2><p>ServiceNow releases two major versions per year, named alphabetically after cities. Each release family gets patches throughout its lifecycle.</p><table><tr><th>Release</th><th>Approx. Date</th><th>Named After</th></tr><tr><td>Utah</td><td>Early 2023</td><td>Salt Lake City, Utah</td></tr><tr><td>Vancouver</td><td>Late 2023</td><td>Vancouver, Canada</td></tr><tr><td>Washington DC</td><td>Early 2024</td><td>Washington DC, USA</td></tr><tr><td>Xanadu</td><td>Late 2024</td><td>Xanadu</td></tr></table><h4>What happens during an upgrade</h4><ul><li><strong>Out-of-box components</strong> are updated automatically (base tables, system scripts, plugins)</li><li><strong>Your customizations</strong> are preserved — but if you modified an OOB script directly, your version may conflict with the new version</li><li><strong>Skipped updates</strong> appear in the Upgrade History and need manual review</li></ul><h4>Version naming</h4><pre>// Check your instance version:
// Navigate to: System Diagnostics > Stats
// Or go to: your-instance.service-now.com/stats.do
// Look for "Build name" — e.g., "Xanadu Patch 3"

// Family releases: Utah, Vancouver, Washington DC, Xanadu...
// Patches: Xanadu Patch 1, Patch 2, Patch 3...
// Each patch fixes bugs and security issues from the family release.</pre><div class="warn-box"><h5>Exam Alert</h5><p>Know that ServiceNow uses alphabetical city names for releases and ships two per year. Also know that upgrades preserve customizations but may create "skipped" records when OOB artifacts were modified.</p></div>`,

"1.4": `<h2>Getting Your Developer Instance</h2><p>A Personal Developer Instance (PDI) is a free, full-featured ServiceNow instance for learning and testing. Every developer and admin should have one.</p><h4>Step by step</h4><ol><li>Go to <strong>developer.servicenow.com</strong></li><li>Create an account (free)</li><li>Click <strong>Request Instance</strong></li><li>Choose a release version (pick the latest available)</li><li>Wait 5-10 minutes for provisioning</li><li>You will get a URL like <code>dev12345.service-now.com</code> with admin credentials</li></ol><h4>Important rules</h4><ul><li><strong>10-day inactivity reset:</strong> If you do not log in for 10 days, the instance is reclaimed. Log in regularly to keep it alive.</li><li><strong>You are admin:</strong> Your PDI gives you full admin access — something you will never have in a real enterprise instance</li><li><strong>Plugins:</strong> You can activate plugins that are not available by default (ITSM, ITOM, HRSD, etc.) via System Definition > Plugins</li><li><strong>Data:</strong> PDIs come with demo data (sample incidents, users, CIs) so you can practice immediately</li></ul><pre>// First things to do on a new PDI:
// 1. Navigate to: incident.list — see sample incidents
// 2. Open any incident — explore the form layout
// 3. Try: System Definition > Tables — see all tables
// 4. Try: System Definition > Business Rules — see existing BRs
// 5. Open Scripts - Background — run your first GlideRecord:

var gr = new GlideRecord('incident');
gr.setLimit(5);
gr.query();
while (gr.next()) {
    gs.info(gr.getValue('number') + ': ' + gr.getValue('short_description'));
}</pre><div class="tip-box"><h5>Pro Tip</h5><p>Bookmark <code>your-instance.service-now.com/nav_to.do?uri=scripts_background.do</code> — Background Scripts is where you test code quickly without creating Business Rules.</p></div>`,

"1.5": `<h2>Navigating the Platform</h2><p>ServiceNow has a lot of modules. Knowing how to find things fast is the difference between being productive and being lost.</p><h4>Application Navigator</h4><p>The left sidebar is your main navigation. Type in the filter to find any module instantly.</p><pre>// Keyboard shortcuts:
// Ctrl+Shift+F (or Cmd+Shift+F on Mac) — focus the navigator filter
// Type "incident" — shows Incident > All, Incident > Create New, etc.
// Type "sys_script" — jumps to Business Rules
// Type "studio" — opens App Engine Studio

// Quick URLs (type directly in browser):
// incident.list          — all incidents list
// incident.do            — new incident form
// sys_user.list           — all users
// sys_script_include.list — all script includes
// sys_properties.list     — system properties</pre><h4>Key navigation areas</h4><table><tr><th>What you want</th><th>Where to go</th></tr><tr><td>Create/view incidents</td><td>Incident > All / Create New</td></tr><tr><td>Business Rules</td><td>System Definition > Business Rules</td></tr><tr><td>Client Scripts</td><td>System Definition > Client Scripts</td></tr><tr><td>Script Includes</td><td>System Definition > Script Includes</td></tr><tr><td>Tables structure</td><td>System Definition > Tables</td></tr><tr><td>System Properties</td><td>System Properties > All</td></tr><tr><td>Update Sets</td><td>System Update Sets > Local Update Sets</td></tr><tr><td>System Logs</td><td>System Logs > All</td></tr><tr><td>Background Scripts</td><td>System Definition > Scripts - Background</td></tr><tr><td>User admin</td><td>User Administration > Users / Groups / Roles</td></tr></table><h4>The star favorites</h4><p>Click the star icon next to any module to add it to your favorites. Your favorites appear at the top of the navigator. After a few weeks, your favorites list becomes your personalized quick-access toolbar.</p><div class="tip-box"><h5>Pro Tip</h5><p>You can navigate to any table's list by typing <code>tablename.list</code> in the URL. For example, <code>change_request.list</code> takes you to all change requests. This is faster than clicking through menus.</p></div>`,

// ===== MODULE 2: User Interface & Lists =====

"2.1": `<h2>Understanding Lists</h2><p>A list view shows multiple records from a table. It is the most common view you will work with in ServiceNow.</p><h4>List anatomy</h4><table><tr><th>Part</th><th>What it does</th></tr><tr><td>Title bar</td><td>Shows table name and record count</td></tr><tr><td>Column headers</td><td>Click to sort. Right-click for options (group by, filter, configure).</td></tr><tr><td>Rows</td><td>Each row is one record. Click the number/link to open the form.</td></tr><tr><td>Filter breadcrumb</td><td>Shows active filters. Right-click to copy the encoded query.</td></tr><tr><td>Pagination</td><td>Bottom of list — navigate between pages of results</td></tr></table><h4>List controls you should know</h4><pre>// Right-click a column header for these options:
// Sort ascending / descending
// Group by this column — clusters rows by value
// Configure > List Layout — add/remove/reorder columns
// Show Filter — opens the condition builder

// Right-click the filter breadcrumb:
// Copy query — gives you the encoded query string
//   e.g., "priority=1^active=true^stateNOT IN6,7"
// This is what you paste into GlideRecord.addEncodedQuery()

// Personalize list:
// Click the gear icon (top right of list)
// Add columns, set default sort, set rows per page</pre><div class="tip-box"><h5>Pro Tip</h5><p>To quickly see all records in any table, type <code>tablename.list</code> in the browser URL. For example: <code>incident.list</code>, <code>sys_user.list</code>, <code>change_request.list</code>.</p></div>`,

"2.2": `<h2>Filtering & Searching</h2><p>Filtering is how you narrow down records in a list. ServiceNow has three levels of filtering, from simple to advanced.</p><h4>1. Column search (quick)</h4><p>Click the magnifying glass icon on any column header. Type a value to filter that column instantly.</p><h4>2. Condition builder (visual)</h4><p>Click the filter icon (funnel) above the list to open the condition builder. Build conditions with dropdowns — no code needed.</p><pre>// Example conditions in the builder:
// Priority | is | 1 - Critical
// AND State | is not | Resolved
// AND Assignment Group | is | Network Ops
//
// Click "Run" to apply. The list updates immediately.</pre><h4>3. Encoded query (advanced)</h4><p>Right-click the filter breadcrumb and select "Copy query" to get the encoded query string. You can also paste an encoded query directly into the search bar.</p><pre>// Encoded query syntax:
// priority=1^state!=6^assignment_group.name=Network Ops
//
// ^ means AND
// ^OR means OR
// Paste this into the breadcrumb area and press Enter to apply.
//
// In scripts, use addEncodedQuery:
var gr = new GlideRecord('incident');
gr.addEncodedQuery('priority=1^active=true');
gr.query();</pre><h4>Common operators</h4><table><tr><th>UI label</th><th>Encoded</th><th>Meaning</th></tr><tr><td>is</td><td><code>=</code></td><td>Exact match</td></tr><tr><td>is not</td><td><code>!=</code></td><td>Not equal</td></tr><tr><td>contains</td><td><code>LIKE</code></td><td>Substring match</td></tr><tr><td>starts with</td><td><code>STARTSWITH</code></td><td>Begins with</td></tr><tr><td>is empty</td><td><code>ISEMPTY</code></td><td>Field has no value</td></tr><tr><td>is one of</td><td><code>IN</code></td><td>Value in list</td></tr><tr><td>is anything</td><td><code>ANYTHING</code></td><td>Field was modified</td></tr></table>`,

"2.3": `<h2>Working with Forms</h2><p>A form displays a single record. It is where users view, edit, and save data.</p><h4>Form anatomy</h4><table><tr><th>Part</th><th>What it does</th></tr><tr><td>Header bar</td><td>Record number, buttons (Save, Update, Submit, etc.)</td></tr><tr><td>Fields</td><td>Each field maps to a column in the table. Types: string, reference, choice, date, journal.</td></tr><tr><td>Related lists</td><td>Bottom of form — shows linked records from other tables</td></tr><tr><td>Activity formatter</td><td>Shows work notes and additional comments in timeline format</td></tr></table><h4>Reference fields</h4><p>A reference field links to another table's record. When you see a field with a magnifying glass icon, it is a reference field.</p><pre>// On the incident form:
// "Caller" field → references sys_user table
// "Assignment Group" → references sys_user_group table
// "Configuration Item" → references cmdb_ci table
//
// Internally, the field stores a sys_id (32-char GUID).
// The UI shows the display value (name) for readability.
//
// In scripts:
gr.getValue('caller_id');        // sys_id: 'a1b2c3d4...'
gr.getDisplayValue('caller_id'); // display: 'John Smith'</pre><h4>Journal fields</h4><p>Journal fields (Work Notes, Additional Comments) are <strong>append-only</strong>. You cannot edit or delete previous entries. Each entry is timestamped with the user who wrote it. This creates an audit trail.</p><pre>// In a Business Rule, write to a journal field:
current.work_notes = 'Auto-escalated to P1 by system.';
// This APPENDS a new entry — it does not overwrite previous notes.</pre><h4>Form personalization</h4><pre>// Right-click any field label for options:
// Configure > Form Layout — add/remove/reorder fields
// Configure > Form Design — drag-and-drop layout editor
//
// Personalize form (gear icon):
// Add/remove fields for YOUR view only (does not affect other users)</pre>`,

"2.4": `<h2>Related Lists</h2><p>Related lists appear at the bottom of a form. They show records from other tables that are linked to the current record.</p><h4>Examples on the incident form</h4><table><tr><th>Related list</th><th>What it shows</th><th>Relationship</th></tr><tr><td>Tasks</td><td>Child tasks linked to this incident</td><td>Parent field on task table</td></tr><tr><td>Change Requests</td><td>Changes associated with this incident</td><td>Many-to-many relationship</td></tr><tr><td>Affected CIs</td><td>Configuration items impacted</td><td>task_ci table (M2M)</td></tr><tr><td>Approvers</td><td>Who needs to approve</td><td>sysapproval_approver table</td></tr></table><h4>How related lists work technically</h4><pre>// A related list is a query against another table where
// a reference field points to the current record's sys_id.
//
// Example: "Tasks" related list on incident INC0010001
// The platform runs:
// SELECT * FROM task WHERE parent = 'sys_id_of_INC0010001'
//
// The relationship is defined by a reference field (parent)
// on the child table (task) pointing to the current table (incident).

// Configuring related lists:
// Right-click the related list tab > Configure > Related Lists
// Add or remove which related lists appear on the form.</pre><div class="tip-box"><h5>Pro Tip</h5><p>Related lists can slow form loading if they return many records. Each related list is a separate database query. If a form is slow, check how many related lists are configured and how many records each returns.</p></div>`,

"2.5": `<h2>Views & Homepages</h2><p>Views control which fields appear on a form or list. Different users can see different layouts for the same table.</p><h4>Form views</h4><pre>// A single table can have multiple form views:
// - Default view — what most users see
// - ESS (Employee Self-Service) — simplified for portal users
// - Mobile — optimized for mobile app
// - Custom views — created for specific roles or teams
//
// Navigate to: System UI > Views to see all defined views
//
// In a URL, specify the view:
// incident.do?sys_id=abc123&sysparm_view=ess
// This opens the incident in the ESS view layout.</pre><h4>List views</h4><p>Lists also have views. A help desk agent might see different columns than a manager looking at the same incident list.</p><pre>// Configure a list view:
// 1. Go to any list (e.g., incident.list)
// 2. Right-click a column header > Configure > List Layout
// 3. Add/remove columns for the current view
//
// Create a new view:
// System UI > Views > New
// Name it (e.g., "manager_view"), then configure form/list layouts for it.</pre><h4>Homepages and dashboards</h4><p>Homepages are configurable dashboards with widgets showing charts, lists, and KPIs. Different roles get different homepages.</p><pre>// Self-Service homepage — shows my open requests, knowledge articles
// ITIL homepage — shows assigned incidents, team workload
// Manager homepage — shows team metrics, SLA compliance
//
// Configure: Self-Service > Homepages
// Add widgets: gauges, charts, lists, content blocks
// Widgets pull data from tables using encoded queries.</pre>`,

// ===== MODULE 3: Database & Schema =====

"3.1": `<h2>Tables & Records</h2><p>Everything in ServiceNow is stored in a table. An incident is a row in the <code>incident</code> table. A user is a row in the <code>sys_user</code> table. Understanding tables is understanding ServiceNow.</p><h4>Core tables</h4><table><tr><th>Table</th><th>Label</th><th>What it stores</th></tr><tr><td><code>task</code></td><td>Task</td><td>Base table for all work items (parent of incident, change, problem)</td></tr><tr><td><code>incident</code></td><td>Incident</td><td>Break/fix records (extends task)</td></tr><tr><td><code>change_request</code></td><td>Change Request</td><td>Planned changes (extends task)</td></tr><tr><td><code>problem</code></td><td>Problem</td><td>Root cause investigations (extends task)</td></tr><tr><td><code>sys_user</code></td><td>User</td><td>All user accounts</td></tr><tr><td><code>sys_user_group</code></td><td>Group</td><td>Teams/groups of users</td></tr><tr><td><code>cmdb_ci</code></td><td>Configuration Item</td><td>Base CI table for CMDB</td></tr><tr><td><code>kb_knowledge</code></td><td>Knowledge</td><td>Knowledge base articles</td></tr><tr><td><code>sc_req_item</code></td><td>Requested Item</td><td>Service catalog requests</td></tr></table><pre>// Every table has these system fields automatically:
// sys_id          — unique 32-character identifier
// sys_created_on  — when the record was created
// sys_created_by  — who created it
// sys_updated_on  — when last modified
// sys_updated_by  — who last modified it
// sys_class_name  — the table name (used for inheritance)

// View any table's structure:
// Navigate to: System Definition > Tables
// Search for the table name
// Click it to see all fields, their types, and attributes</pre>`,

"3.2": `<h2>Field Types</h2><p>Every field on a table has a type that determines what kind of data it stores and how it behaves on forms.</p><table><tr><th>Type</th><th>Stores</th><th>Example field</th><th>Notes</th></tr><tr><td>String</td><td>Text up to 255 chars</td><td>short_description</td><td>Most common type</td></tr><tr><td>Integer</td><td>Whole numbers</td><td>priority, impact</td><td>Used for choice values internally</td></tr><tr><td>True/False</td><td>Boolean</td><td>active</td><td>Checkbox on forms</td></tr><tr><td>Reference</td><td>sys_id pointing to another table</td><td>caller_id, assigned_to</td><td>Creates a relationship between tables</td></tr><tr><td>Choice</td><td>Integer value with display label</td><td>state, priority</td><td>Dropdown on forms. getValue returns the number, getDisplayValue returns the label.</td></tr><tr><td>Date/Time</td><td>Timestamp in UTC</td><td>opened_at, resolved_at</td><td>Stored as UTC, displayed in user timezone</td></tr><tr><td>Journal</td><td>Append-only text</td><td>work_notes, comments</td><td>Cannot edit previous entries. Creates audit trail.</td></tr><tr><td>Journal Input</td><td>Text field on form</td><td>work_notes input</td><td>The input box for journal fields</td></tr><tr><td>HTML</td><td>Rich text</td><td>Article body</td><td>Stores formatted HTML content</td></tr><tr><td>Conditions</td><td>Encoded query string</td><td>BR conditions</td><td>Stores filter conditions as text</td></tr></table><pre>// Reference fields are the most important type to understand.
// On the form, they show a display value (name).
// In the database, they store a sys_id.

var gr = new GlideRecord('incident');
gr.get('number', 'INC0010001');

// Reference field: caller_id
gr.getValue('caller_id');        // 'a1b2c3d4...' (sys_id)
gr.getDisplayValue('caller_id'); // 'John Smith' (display value)

// Choice field: priority
gr.getValue('priority');         // '1' (internal integer as string)
gr.getDisplayValue('priority');  // '1 - Critical' (label)</pre><div class="warn-box"><h5>Exam Alert</h5><p>Know the difference between Journal and Journal Input field types. Journal stores the historical entries. Journal Input is the text area on the form for adding new entries.</p></div>`,

"3.3": `<h2>Table Inheritance</h2><p>ServiceNow tables support single-table inheritance. A child table inherits all fields from its parent and adds its own.</p><pre>// The task table hierarchy:
// task (base)
//   Fields: number, state, priority, assigned_to, short_description
//   |
//   +-- incident (extends task)
//   |     Adds: category, subcategory, caller_id, resolved_at
//   |
//   +-- change_request (extends task)
//   |     Adds: risk, type, planned_start_date, cab_required
//   |
//   +-- problem (extends task)
//   |     Adds: known_error, root_cause, workaround
//   |
//   +-- sc_req_item (extends task)
//         Adds: cat_item, stage, price, request</pre><h4>Why this matters</h4><ul><li><strong>A Business Rule on task fires for ALL child tables.</strong> If you write a BR on the task table, it runs for every incident, change, problem, and catalog task. This is the #1 source of unintended side effects.</li><li><strong>ACLs on task apply to all children</strong> unless overridden at the child level.</li><li><strong>Querying task returns everything.</strong> <code>new GlideRecord('task')</code> returns incidents + changes + problems + all other children. Use <code>sys_class_name</code> to filter or query the specific child table.</li></ul><pre>// WRONG — returns ALL task types
var gr = new GlideRecord('task');
gr.addQuery('assigned_to', userId);
gr.query();
// Could return 100,000+ records across all task types!

// CORRECT — query the specific child table
var gr = new GlideRecord('incident');
gr.addQuery('assigned_to', userId);
gr.query();
// Returns only incidents

// Or filter by sys_class_name
var gr = new GlideRecord('task');
gr.addQuery('sys_class_name', 'incident');
gr.addQuery('assigned_to', userId);
gr.query();</pre><div class="warn-box"><h5>Exam Alert</h5><p>The <code>sys_class_name</code> field is the discriminator column. Every record knows what type it is. When you open a task record, ServiceNow reads sys_class_name to determine which form layout to show.</p></div>`,

"3.4": `<h2>Data Dictionary</h2><p>The Data Dictionary (<code>sys_dictionary</code>) is the system table that defines the structure of every other table. Every field, its type, max length, default value, and attributes are stored here.</p><pre>// View the data dictionary:
// Navigate to: System Definition > Tables
// Click on any table (e.g., incident)
// The "Columns" tab shows all fields with their types and attributes
//
// Or go directly: sys_dictionary.list
// Filter by Name = incident to see all incident fields

// Key attributes you will see:
// Type — String, Integer, Reference, Choice, etc.
// Max length — character limit for string fields
// Read only — field cannot be edited on forms
// Mandatory — field must have a value
// Display — this field is the "display value" for the table
//   (e.g., "number" is the display field for incident)</pre><h4>Dictionary overrides</h4><p>When a child table inherits a field from a parent, you can override attributes on the child without changing the parent. This is done through dictionary overrides (<code>sys_dictionary_override</code>).</p><pre>// Example: The "assignment_group" field exists on the task table.
// On the incident table, you want it to be mandatory.
// On the change_request table, you do not.
//
// Create a dictionary override:
// Table: incident
// Field: assignment_group
// Override: Mandatory = true
//
// Now assignment_group is mandatory on incidents but not on changes.
// The parent task table's field definition is unchanged.</pre><div class="tip-box"><h5>Pro Tip</h5><p>If you are debugging why a field behaves differently on two tables that share the same parent, check <code>sys_dictionary_override</code> first. That is usually where the difference is configured.</p></div>`,

// ===== MODULE 4 thin topics =====

"4.2": `<h2>Data Policies</h2><p>Data Policies enforce field rules on the <strong>server side</strong> — they apply everywhere: forms, REST APIs, import sets, business rules, and any other way a record can be created or updated.</p><h4>Data Policy vs UI Policy</h4><table><tr><th></th><th>UI Policy</th><th>Data Policy</th></tr><tr><td>Runs on</td><td>Client (browser) only</td><td>Server + client</td></tr><tr><td>Enforced via REST API</td><td>No</td><td>Yes</td></tr><tr><td>Enforced via Import Set</td><td>No</td><td>Yes</td></tr><tr><td>Enforced via Business Rule scripts</td><td>No</td><td>Yes</td></tr><tr><td>Configuration</td><td>UI conditions + actions</td><td>UI conditions + actions</td></tr><tr><td>Use when</td><td>Form-only UX behavior</td><td>Data integrity across all channels</td></tr></table><pre>// Example Data Policy:
// Table: incident
// Condition: Priority = 1 - Critical
// Action: assignment_group → Mandatory = true
//
// This means: ANY record created or updated with priority 1
// MUST have an assignment group — whether it comes from
// the form, the REST API, an import set, or a script.
//
// If you only used a UI Policy for this, someone could
// create a P1 incident via API with no assignment group,
// bypassing the form entirely.</pre><div class="warn-box"><h5>Exam Favorite</h5><p>The question "What is the difference between a UI Policy and a Data Policy?" appears on almost every CSA exam. Remember: UI Policy = client-side forms only. Data Policy = server-side, enforced everywhere.</p></div>`,

"4.5": `<h2>UI Actions</h2><p>UI Actions add custom buttons, links, or context menu items to forms and lists. They can run client-side JavaScript, server-side JavaScript, or both.</p><h4>Types of UI Actions</h4><table><tr><th>Type</th><th>Where it appears</th><th>Example</th></tr><tr><td>Form button</td><td>Top or bottom of a form</td><td>"Escalate" button on incident</td></tr><tr><td>Form link</td><td>Right-click context menu on form</td><td>"Copy incident" link</td></tr><tr><td>Form context menu</td><td>Right-click on form header</td><td>"Create problem from incident"</td></tr><tr><td>List button</td><td>Above list view</td><td>"Export selected" button</td></tr><tr><td>List context menu</td><td>Right-click on list row</td><td>"Assign to me"</td></tr></table><pre>// UI Action: "Close and Notify" button on incident form
// Runs both client and server code

// Client script (runs first, in browser):
function closeAndNotify() {
    var notes = prompt('Enter close notes:');
    if (!notes) return false;  // user cancelled
    g_form.setValue('close_notes', notes);
    g_form.setValue('state', 7);  // Closed
    gsftSubmit(null, g_form.getFormElement(), 'close_and_notify');
}

// Server script (runs after form submits):
current.close_notes = current.close_notes || 'Closed by agent';
current.state = 7;
gs.eventQueue('incident.closed.notify', current, current.getValue('caller_id'), '');
current.update();</pre><h4>Key configuration fields</h4><ul><li><strong>Table:</strong> Which table this action appears on</li><li><strong>Active:</strong> Enabled or disabled</li><li><strong>Show insert / Show update:</strong> When to show the button (new records vs existing)</li><li><strong>Condition:</strong> Encoded query — button only appears when condition is met</li><li><strong>Client:</strong> Checkbox — does this run client-side code?</li><li><strong>Onclick:</strong> The client function name to call</li><li><strong>Script:</strong> The server-side script to run</li></ul>`,

"4.6": `<h2>Notifications</h2><p>Notifications send emails (or SMS, push) when specific events occur. They have three parts: when to send, who receives, and what the message says.</p><h4>Configuration</h4><pre>// Navigate to: System Notification > Email > Notifications
//
// Key fields:
// Table: incident
// When to send: Record inserted or updated
// Conditions: priority = 1 AND state changes to In Progress
// Who receives:
//   - Users in fields: Assigned to, Caller
//   - Groups: Management
//   - Users: specific users
// Subject: P1 Alert: \${number} - \${short_description}
// Body: HTML template with \${field} placeholders</pre><h4>Variable syntax in notifications</h4><pre>// Use \${field_name} to insert field values:
// \${number}             → INC0010001
// \${short_description}  → Server down
// \${caller_id.name}     → John Smith (dot-walk through reference)
// \${opened_at}          → 2026-04-07 09:30:00
// \${URI_REF}            → clickable link to the record</pre><h4>Event-driven vs direct notifications</h4><table><tr><th></th><th>Direct</th><th>Event-driven</th></tr><tr><td>How it triggers</td><td>Record matches conditions on insert/update</td><td>A Business Rule fires gs.eventQueue()</td></tr><tr><td>Coupling</td><td>Tight — notification logic is in the notification record</td><td>Loose — BR fires event, notification listens</td></tr><tr><td>Best for</td><td>Simple "notify when X happens"</td><td>Complex scenarios, decoupled architecture</td></tr></table><pre>// Event-driven pattern:
// 1. Business Rule fires the event:
gs.eventQueue('incident.escalated', current, current.getValue('assigned_to'), '');

// 2. Notification listens for the event:
// Event name: incident.escalated
// The notification sends when this event fires — independent of BR logic.</pre><h4>Debugging notifications</h4><pre>// If a notification did not send:
// 1. Check sys_email.list — is the email record created?
//    States: ready, sent, send-failed, skipped
// 2. If skipped — check notification conditions
// 3. If send-failed — check syslog for SMTP errors
// 4. In non-prod: check glide.email.test.user property
//    This redirects ALL email to one address in sub-prod instances</pre>`,

// ===== MODULE 5: Import & Integration =====

"5.1": `<h2>Import Sets</h2><p>Import Sets are how external data (CSV files, Excel, API feeds) gets loaded into ServiceNow. Data never goes directly into the target table — it always lands in a staging table first.</p><h4>The flow</h4><pre>// External Data (CSV, Excel, API)
//        ↓
// Data Source (defines where data comes from)
//        ↓
// Import Set Table (staging — raw data lands here)
//        ↓
// Transform Map (maps staging fields to target fields)
//        ↓
// Target Table (e.g., sys_user, cmdb_ci_server)

// Example: HR sends a CSV of new hires every Monday
// 1. Data Source points to the CSV file location
// 2. Import Set loads raw rows into staging table u_new_hire_import
// 3. Transform Map maps: u_first_name → first_name, u_email → email
// 4. Records appear in sys_user table</pre><h4>Why staging?</h4><ul><li><strong>Validation:</strong> You can inspect and clean data before it hits the target table</li><li><strong>Error handling:</strong> Bad rows stay in staging with error messages instead of corrupting target data</li><li><strong>Audit trail:</strong> You can see exactly what data came in, when, and what happened to each row</li></ul><pre>// Key tables:
// sys_import_set       — the import set run record
// sys_import_set_row   — each row of imported data
// sys_transform_map    — the mapping definition
// sys_transform_entry  — individual field mappings

// View import history:
// Navigate to: System Import Sets > Import Sets
// Each record shows: state, rows processed, errors, warnings</pre>`,

"5.2": `<h2>Transform Maps</h2><p>A Transform Map defines how data moves from a staging table (import set) to a target table. It maps source columns to target fields and controls upsert behavior.</p><h4>Field mapping</h4><pre>// Source (staging)      →  Target (sys_user)
// u_first_name          →  first_name
// u_last_name           →  last_name
// u_email               →  email
// u_department          →  department (reference lookup by name)
// u_start_date          →  u_start_date

// Mapping types:
// Direct field    — source value goes directly to target field
// Reference lookup — source value is looked up in the reference table
//                   (e.g., department name → department sys_id)
// Script          — custom logic in a transform script</pre><h4>Coalesce (upsert)</h4><p>The coalesce field determines whether to UPDATE an existing record or INSERT a new one.</p><pre>// Coalesce field: email
// If a user with this email already exists → UPDATE that record
// If no user with this email exists → INSERT new record
//
// This is like SQL: MERGE ... ON target.email = source.email
//
// CRITICAL: Choose a UNIQUE field as coalesce.
// If you coalesce on "department" (not unique), the import
// will update the FIRST matching record for ALL rows
// in that department — destroying data.</pre><h4>Transform scripts</h4><pre>// Run custom logic during the transform:
// onBefore — runs before each row is mapped (clean data)
// onAfter  — runs after each row is mapped (create related records)
// onStart  — runs once before the entire transform
// onComplete — runs once after the entire transform

// Example: onBefore script — generate username from email
(function transformRow(source, target, map, log, action) {
    target.user_name = source.u_email.toString().split('@')[0];
    
    // Skip rows with missing email
    if (!source.u_email || source.u_email.toString().trim() === '') {
        ignore = true;  // skip this row
        log.warn('Skipping row: missing email');
    }
})(source, target, map, log, action);</pre>`,

// ===== MODULE 6: Service Catalog & Knowledge =====

"6.1": `<h2>Service Catalog</h2><p>The Service Catalog is a self-service portal where users request services and products. Think of it as an internal shopping site with approval workflows behind each item.</p><h4>Key components</h4><table><tr><th>Component</th><th>Table</th><th>What it is</th></tr><tr><td>Category</td><td><code>sc_category</code></td><td>Organizes items (Hardware, Software, Access)</td></tr><tr><td>Catalog Item</td><td><code>sc_cat_item</code></td><td>A requestable service ("Request a Laptop")</td></tr><tr><td>Variable</td><td><code>item_option_new</code></td><td>Form field on the item (model dropdown, justification)</td></tr><tr><td>Variable Set</td><td><code>item_option_new_set</code></td><td>Reusable group of variables shared across items</td></tr><tr><td>Record Producer</td><td><code>sc_cat_item_producer</code></td><td>Creates a record on a target table (e.g., incident) via catalog UI</td></tr></table><h4>The request lifecycle</h4><pre>// User clicks "Order Now" on "Request a Laptop"
//
// 1. Request created (sc_request) — REQ0010001
//    The overall order
//
// 2. Requested Item created (sc_req_item) — RITM0010001
//    The specific item with variable values (laptop model, etc.)
//
// 3. Approval triggered
//    If cost > \\$500 → route to manager → approved/rejected
//
// 4. Catalog Tasks created (sc_task) — SCTASK0010001, 0010002
//    "Procurement: order laptop" → assigned to procurement team
//    "IT: configure laptop" → assigned to IT team
//
// 5. Tasks completed → RITM auto-closes → REQ auto-closes
//    User gets notified: "Your laptop is ready"</pre><h4>Record Producer vs Catalog Item</h4><ul><li><strong>Catalog Item:</strong> Creates RITM + Tasks. Full request lifecycle with approvals. Use for service requests.</li><li><strong>Record Producer:</strong> Creates a record directly on a target table (e.g., incident). Looks like a catalog form but outputs a standard record. Use when you want a user-friendly form for creating incidents or other records.</li></ul>`,

"6.2": `<h2>Knowledge Management</h2><p>Knowledge articles reduce ticket volume by letting users solve problems themselves. A well-maintained knowledge base deflects 20-40% of common tickets.</p><h4>Key components</h4><table><tr><th>Component</th><th>Table</th><th>What it is</th></tr><tr><td>Knowledge Base</td><td><code>kb_knowledge_base</code></td><td>Container for articles (IT KB, HR KB, etc.)</td></tr><tr><td>Knowledge Article</td><td><code>kb_knowledge</code></td><td>Individual article with content</td></tr><tr><td>Knowledge Category</td><td><code>kb_category</code></td><td>Organizes articles within a KB</td></tr><tr><td>Feedback</td><td><code>kb_feedback</code></td><td>User ratings and comments on articles</td></tr></table><h4>Article lifecycle</h4><pre>// Draft → Review → Published → Retired
//
// Draft: Author writes content
// Review: Approver checks accuracy
// Published: Visible to users, searchable
// Retired: No longer shown, archived
//
// Articles have a valid_to date — auto-retire when expired.
// Review cycle: articles should be reviewed periodically.</pre><h4>Knowledge in ITSM workflows</h4><pre>// When a support agent opens an incident, ServiceNow can:
// 1. Auto-suggest relevant KB articles based on short_description
// 2. Agent can attach an article to the incident
// 3. If resolved with an article, it counts as "KB deflection"
//
// Self-service portal:
// Users search the KB before submitting a ticket.
// Good articles reduce ticket volume directly.</pre>`,

// ===== MODULE 7: Workflow & Flow Designer =====

"7.1": `<h2>Workflow Editor (Legacy)</h2><p>The Workflow Editor is ServiceNow's older automation engine. It uses a visual drag-and-drop canvas where you build processes as flowcharts.</p><h4>Key concepts</h4><ul><li><strong>Workflow:</strong> A sequence of activities that execute automatically</li><li><strong>Activities:</strong> Individual steps — approvals, notifications, timers, scripts, conditions</li><li><strong>Transitions:</strong> The arrows connecting activities (always, on true, on false)</li><li><strong>Context:</strong> A running instance of a workflow attached to a specific record</li></ul><pre>// Example: Change Request Approval Workflow
//
// [Start] → [Check Risk] → If High Risk → [CAB Approval] → [Implement]
//                        → If Low Risk  → [Auto-Approve] → [Implement]
//
// Activities:
// Approval - User: Route to manager
// Approval - Group: Route to CAB (Change Advisory Board)
// Timer: Wait 48 hours, then escalate
// Notification: Email requester on approval/rejection
// Run Script: Update state, create tasks</pre><h4>When you will still see workflows</h4><p>Many enterprises have years of existing workflows in production. You will maintain them, but all new automation should use Flow Designer.</p><div class="warn-box"><h5>Important</h5><p>ServiceNow is investing in Flow Designer, not the Workflow Editor. New features only ship in Flow Designer. Use it for all new projects. Only touch the legacy Workflow Editor when maintaining existing workflows.</p></div>`,

"7.2": `<h2>Flow Designer</h2><p>Flow Designer is ServiceNow's modern, low-code automation engine. It replaces the legacy Workflow Editor for all new projects.</p><h4>Core concepts</h4><table><tr><th>Concept</th><th>What it is</th><th>Analogy</th></tr><tr><td>Flow</td><td>A complete automation</td><td>A program</td></tr><tr><td>Trigger</td><td>What starts the flow</td><td>An event listener</td></tr><tr><td>Action</td><td>A single step in the flow</td><td>A function call</td></tr><tr><td>Subflow</td><td>A reusable set of actions</td><td>A shared library function</td></tr><tr><td>Spoke</td><td>A package of actions for an external system</td><td>An API connector (Slack, Teams, Jira)</td></tr></table><h4>Building a flow</h4><pre>// Example: Auto-escalate unassigned P1 incidents
//
// TRIGGER: Record Updated → incident table
//   Condition: priority = 1 AND assignment_group is empty
//              AND state = New AND created > 15 minutes ago
//
// ACTION 1: Look Up Record
//   Table: sys_user_group
//   Condition: name = "Critical Incident Team"
//
// ACTION 2: Update Record
//   Target: Trigger record (the incident)
//   Set: assignment_group = Step 1 result
//   Set: work_notes = "Auto-escalated: P1 unassigned for 15+ min"
//
// ACTION 3: Send Notification
//   To: Critical Incident Team members
//   Subject: "P1 Escalation: " + incident number
//
// No code needed. All configured through drag-and-drop.</pre><h4>Debugging flows</h4><pre>// When a flow fails:
// 1. Open Flow Designer
// 2. Click "Executions" tab
// 3. Find the failed execution
// 4. Expand each action to see inputs, outputs, and errors
//
// Each action shows:
// - Input values (what went in)
// - Output values (what came out)
// - Status (completed, failed, skipped)
// - Error message (if failed)</pre><h4>Flow Designer vs Workflow Editor</h4><ul><li><strong>New project?</strong> → Flow Designer. Always.</li><li><strong>Existing workflow in production?</strong> → Keep it unless migrating</li><li><strong>Integration with external systems?</strong> → Flow Designer + Integration Hub spokes</li><li><strong>Reusable automation?</strong> → Build a Subflow — callable from other flows</li></ul>`,

// ===== MODULE 8: Reporting & Security =====

"8.1": `<h2>Reporting</h2><p>ServiceNow has a built-in reporting engine. You create reports from any table's data without external BI tools.</p><h4>Report types</h4><table><tr><th>Type</th><th>Use case</th></tr><tr><td>Bar chart</td><td>Compare categories (incidents by priority)</td></tr><tr><td>Pie/donut chart</td><td>Show distribution (incidents by category)</td></tr><tr><td>Line/trend chart</td><td>Show change over time (incidents per week)</td></tr><tr><td>List report</td><td>Filtered table view saved as a report</td></tr><tr><td>Pivot table</td><td>Cross-reference two dimensions</td></tr><tr><td>Single score</td><td>One big number (total open P1s)</td></tr></table><pre>// Creating a report:
// 1. Navigate to: Reports > Create New
// 2. Select table: incident
// 3. Choose type: Bar chart
// 4. Group by: priority
// 5. Filter: active = true
// 6. Run and Save
//
// Reports use encoded queries for filtering — same syntax as list filters.
// You can share reports, add them to homepages, or schedule email delivery.</pre><h4>Performance Analytics</h4><p>Performance Analytics (PA) goes beyond reports — it tracks KPIs over time with automated data collection.</p><pre>// PA concepts:
// Indicator — the metric you are tracking (e.g., "Open P1 count")
// Breakdown — how to slice the data (by group, by category)
// Data collection — scheduled job that snapshots indicator values
// Widget — visual display on a dashboard
//
// PA answers: "How has our P1 count changed over the last 6 months?"
// Reports answer: "How many P1s are open right now?"</pre>`,

"8.2": `<h2>Access Control Lists (ACLs)</h2><p>ACLs determine who can read, write, create, and delete records. They are the primary security mechanism in ServiceNow.</p><h4>How ACLs evaluate</h4><p>Each ACL has three checks. All three must pass (AND logic):</p><ol><li><strong>Role check:</strong> Does the user have the required role? (cheapest check, runs first)</li><li><strong>Condition:</strong> Does the record meet the filter condition? (e.g., active=true)</li><li><strong>Script:</strong> Does the advanced script return true? (most expensive, runs last)</li></ol><h4>ACL specificity</h4><pre>// ACLs are evaluated from most specific to least specific:
// 1. table.field  (e.g., incident.caller_id)  — field-level
// 2. table.*      (e.g., incident.*)           — table-level
// 3. *.*                                       — global
//
// ALL matching ACLs must pass. Adding more ACLs can only
// restrict access further, never loosen it.
//
// Example:
// ACL on incident.* requires role: itil
// ACL on incident.priority requires role: incident_manager
// User with only 'itil' → can see the incident but NOT the priority field</pre><h4>Key rules</h4><ul><li><strong>Deny by default:</strong> If no ACL grants access, access is denied</li><li><strong>Admin bypasses ACLs:</strong> Users with the admin role skip ACL checks entirely</li><li><strong>Applies everywhere:</strong> ACLs enforce on forms, lists, REST APIs, exports, reports — not just the UI</li></ul><pre>// ACL script example:
// Allow editing only if user is in the assignment group
answer = gs.getUser().isMemberOf(current.assignment_group);

// Debugging ACLs:
// Enable: System Diagnostics > Session Debug > Debug Security Rules
// This logs every ACL evaluation — which passed, which failed, and why.</pre><div class="warn-box"><h5>Exam Alert</h5><p>The <code>security_admin</code> role is required to create or modify ACLs. This is a high-security elevation — even users with the admin role need to explicitly elevate to security_admin to edit ACL rules.</p></div>`,

"8.3": `<h2>Update Sets</h2><p>Update Sets capture configuration changes and move them between instances (DEV → TEST → PROD). They are ServiceNow's deployment mechanism.</p><h4>How it works</h4><pre>// 1. SELECT your Update Set
//    System Settings > Developer tab > select "My Feature Update Set"
//    Everything you change from this point is captured here.
//
// 2. MAKE your changes
//    Create Business Rules, modify forms, add fields, etc.
//    Each change creates a record in your Update Set.
//
// 3. COMPLETE the Update Set
//    Mark it as "Complete" — no more changes can be added.
//
// 4. EXPORT from Dev (or use Remote instance connection)
//    Right-click > Export to XML
//
// 5. IMPORT to Test/Prod
//    System Update Sets > Retrieved Update Sets > Import from XML
//
// 6. PREVIEW — shows conflicts and collisions
//    "This Business Rule already exists — overwrite?"
//
// 7. COMMIT — applies all changes to the target instance</pre><h4>What Update Sets capture (and do not)</h4><table><tr><th>Captures</th><th>Does NOT capture</th></tr><tr><td>Business Rules, Client Scripts</td><td>Data records (incidents, users)</td></tr><tr><td>UI Policies, UI Actions</td><td>Homepage/dashboard layouts</td></tr><tr><td>Script Includes, ACLs</td><td>User preferences</td></tr><tr><td>Form layouts, field additions</td><td>Scheduled Job last run time</td></tr><tr><td>Flow Designer flows</td><td>CMDB CI records</td></tr><tr><td>System Properties</td><td>Attachment content</td></tr></table><h4>Common mistakes</h4><ul><li><strong>Wrong Update Set:</strong> Making changes in the Default Update Set. Always check which US is active before starting work.</li><li><strong>Overwriting:</strong> Two developers modify the same BR in different Update Sets. Last commit wins — no merge. Coordinate with your team.</li><li><strong>Missing dependencies:</strong> You create a Script Include in US-A and a BR that calls it in US-B. If you deploy US-B first, the BR breaks because the Script Include does not exist yet.</li></ul><div class="tip-box"><h5>Pro Tip</h5><p>For scoped applications, ServiceNow now supports Source Control Integration (Git). This gives you branching, merging, and pull requests — closer to what modern developers expect. Update Sets remain the mechanism for global-scope changes.</p></div>`
};

// Apply rewrites
let count = 0;
for (const [topicId, newContent] of Object.entries(rewrites)) {
  // Find the topic and replace its content
  const contentMatch = `id:"${topicId}",title:`;
  const idx = html.indexOf(contentMatch);
  if (idx < 0) { console.log('Topic ' + topicId + ': NOT FOUND'); continue; }

  // Find the content string boundaries
  const contentStart = html.indexOf(",content:'", idx);
  if (contentStart < 0) { console.log('Topic ' + topicId + ': content field not found'); continue; }
  
  // Find the closing quote — need to handle escaped quotes
  let depth = 0;
  let pos = contentStart + 10; // skip ",content:'"
  while (pos < html.length) {
    if (html[pos] === '\\' && html[pos+1] === "'") { pos += 2; continue; }
    if (html[pos] === "'") break;
    pos++;
  }
  
  const oldContent = html.substring(contentStart + 10, pos);
  const escaped = newContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  html = html.substring(0, contentStart + 10) + escaped + html.substring(pos);
  count++;
  console.log('Rewrote topic ' + topicId);
}

fs.writeFileSync('blog.html', html);
console.log('\nTotal topics rewritten: ' + count);
