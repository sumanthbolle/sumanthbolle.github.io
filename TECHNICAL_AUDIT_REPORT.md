# ServiceNow Portfolio Blog — Technical Audit Report

**Audit Date:** April 7, 2026  
**Scope:** 39 blog posts (IDs 46–84), 56 interview answers (IDs 47–66, 103–120, 200–217)  
**Focus areas:** Technical accuracy, code correctness, content depth, content gaps

---

## SEVERITY 1 — CRITICAL ACCURACY ISSUES

These are factual errors or broken code examples that would mislead readers or fail on a real ServiceNow instance.

---

### 1.1 — Post 60: ACL Evaluation Order Is Backwards

**Post ID:** 60 ("From Kubernetes Namespaces to ServiceNow Domains")  
**Location:** "Key concepts" section  
**The issue:**  
The post states:  
> "Master the evaluation order: Script Includes > Conditional > Role > Domain > Create ACLs."

This is **reversed**. The actual evaluation order within a single ACL rule is:  
1. **Role** — Does the user have the required role?  
2. **Condition** — Does the record meet the filter condition?  
3. **Script** — Does the advanced script return `true`?

All three must pass (AND logic). The platform checks Role first (cheapest check), then Condition, then Script. The post has it exactly backwards, starting with Script.

**Fix:** Replace with: "Master the evaluation order within an ACL: Role check first (cheapest), then Condition filter, then Script (most expensive). All must pass."

---

### 1.2 — Interview 209: Setting Reference Field to user_name String

**Interview ID:** 209 (GlideRecord)  
**Location:** INSERT code example  
**The issue:**  
```javascript
newInc.caller_id = 'john.smith'; // Can use user_name or sys_id
```
This is **wrong**. Reference fields require a **sys_id**, not a user_name string. Setting `caller_id` to `'john.smith'` will either silently fail (setting an invalid reference) or store the literal string, which is not a valid sys_id. You must query `sys_user` first to get the sys_id, then assign it.

**Fix:**  
```javascript
var userGr = new GlideRecord('sys_user');
userGr.addQuery('user_name', 'john.smith');
userGr.query();
if (userGr.next()) {
    newInc.caller_id = userGr.sys_id;
}
```
Remove the misleading comment "Can use user_name or sys_id."

---

### 1.3 — Post 65: `gs.sleep()` Does Not Exist

**Post ID:** 65 ("From Kubernetes CronJobs to ServiceNow Flows")  
**Location:** IntegrationErrorHandler Script Include — retry logic  
**The issue:**  
```javascript
var delay = baseDelay * Math.pow(2, retryCount - 1) + (Math.random() * 1000);
gs.sleep(delay);
```
`gs.sleep()` is **not a GlideSystem method**. This will throw a runtime error. There is no built-in sleep/wait function in ServiceNow server-side scripting.

**Fix:** Exponential backoff with delays cannot be implemented in a synchronous `while` loop in ServiceNow. The correct pattern is to use a Flow Designer with a built-in Wait action, or schedule a follow-up Scheduled Job / Event for the retry. Alternatively, use `GlideScheduler` to queue a delayed execution.

---

### 1.4 — Post 71: Multiple Fabricated APIs

**Post ID:** 71 ("ServiceNow AIOps Blueprint")  
**Location:** Hands-On code block  
**The issues (3 separate fabrications):**

1. `new SNC.ProcessMiningAPI()` with `mining.discover('incident', {days: 90})` — **This class does not exist.** Process Mining in ServiceNow is configured through the Process Mining Workspace UI, not via a server-side scripting API.

2. `new sn_ws.RESTMessageV2().postToNowAssist(prompt)` — **`postToNowAssist()` is not a method** on RESTMessageV2 or any ServiceNow class. Now Assist APIs are invoked through the `sn_gen_ai` namespace or through Flow Designer Now Assist actions, not through RESTMessageV2.

3. `new sn_IntegrationHubAPI()` with `ih.executeSpoke('slack_notify', {...})` — **`sn_IntegrationHubAPI` does not exist** as a script class. Integration Hub actions are invoked through Flow Designer or `sn_fd.FlowAPI`, not through a fabricated spoke-execution API.

**Fix:** Replace all three with either pseudocode clearly marked as conceptual, or use actual ServiceNow APIs:
- Process Mining: describe as UI-configured, not scriptable
- Now Assist: use `sn_gen_ai.GenerativeAIAPI` or Flow Designer actions
- Integration Hub: use `sn_fd.FlowAPI.getRunner().action('action_name').withInputs({}).run()`

---

### 1.5 — Posts 70, 71: Incorrect FlowAPI Syntax

**Post IDs:** 70, 71, 69  
**Location:** Multiple code blocks  
**The issue:**  
```javascript
var flow = new sn_fd.FlowAPI();
flow.startFlow('global.auto_remediate_cpu', null, inputs);
```
The actual `sn_fd.FlowAPI` syntax is static and requires the builder pattern:  
```javascript
sn_fd.FlowAPI.getRunner()
    .flow('scope.flow_name')
    .inBackground()
    .withInputs(inputs)
    .run();
```
The code shown would fail because `FlowAPI` is not instantiated with `new` and `startFlow()` is not the correct method signature.

**Fix:** Use the correct builder-pattern syntax shown above across all posts that reference FlowAPI.

---

### 1.6 — Interview 204: `changesTo()` Using Label Instead of Value

**Interview ID:** 204 (Business Rules)  
**Location:** After Business Rule code example  
**The issue:**  
```javascript
if (current.state.changesTo('approved')) {
```
`changesTo()` compares against the **internal database value**, not the display label. The string `'approved'` is a label. For the `change_request` table, the approved state has a numeric value (typically `'-4'` or a number depending on the state model). This condition would never evaluate to `true` as written.

**Fix:**  
```javascript
if (current.state.changesTo('-4')) { // Approved state value
```
Or better, add a comment explaining that you should always use the internal value, not the label — this is a teaching opportunity since the interview answer is specifically about Business Rules.

---

### 1.7 — Interview 212: Wrong Table Inheritance for sc_req_item

**Interview ID:** 212 (Table hierarchy)  
**Location:** Task Table Hierarchy diagram  
**The issue:**  
```
└── sc_task (extends task)
    └── sc_req_item (extends sc_task)
```
`sc_req_item` does **NOT** extend `sc_task`. Both `sc_req_item` and `sc_task` extend `task` directly — they are **siblings**, not parent-child. A requested item (RITM) is not a type of catalog task. This is a common misconception that leads to incorrect Business Rule scoping.

**Fix:** Correct the hierarchy to:
```
task (base table)
├── incident
├── change_request
├── problem
├── sc_task (catalog tasks — extends task)
└── sc_req_item (requested items — extends task)
```

---

### 1.8 — Interview 205: Incorrect Claim About sys_id During Clone

**Interview ID:** 205 (sys_id)  
**Location:** Common Mistakes section  
**The issue:**  
> "A record cloned from prod gets a new sys_id in dev (usually)."

This is **wrong**. When you clone a ServiceNow instance, sys_ids are **preserved**. That is a fundamental behavior of the cloning process and one of the reasons cloning works — all references (which are stored as sys_ids) remain valid in the cloned instance. sys_ids are different between instances only when records are created independently on separate instances.

**Fix:** Change to: "sys_ids are preserved during instance cloning, but records created independently on separate instances (e.g., a Business Rule created manually in dev and separately in prod) will have different sys_ids. Never hardcode sys_ids — use queries or system properties instead."

---

### 1.9 — Post 48: `COUNT_DISTINCT` Is Not a Valid GlideAggregate Type

**Interview ID:** 48 (Multi-tenant scalability)  
**Location:** Diagnosis Script code block  
**The issue:**  
```javascript
ga.addAggregate('COUNT_DISTINCT', 'sys_domain');
```
`COUNT_DISTINCT` is **not a supported aggregate function** in `GlideAggregate`. The supported types are: `COUNT`, `SUM`, `MIN`, `MAX`, `AVG`. To count distinct values, you would need to use `addQuery` with `groupBy` and iterate, or use a different approach.

**Fix:** Replace with `ga.groupBy('sys_domain')` and count groups manually, or use `GlideRecord` with a hash set pattern.

---

### 1.10 — Post 69: Creating sys_app Records Directly via GlideRecord

**Post ID:** 69 ("Humanitec Scorecards Meet ServiceNow App Engine")  
**Location:** Hands-On code block  
**The issue:**  
```javascript
var appGR = new GlideRecord('sys_app');
appGR.initialize();
appGR.name = 'Generated from Catalog: ' + inputs.app_name;
appGR.scope = 'x_custom_humanitec';
appGR.insert();
```
You **cannot create scoped applications** by inserting records into `sys_app` via GlideRecord. Applications are created through Studio, the App Engine Management Center, or the Application Manager. The `sys_app` table has platform-level protections that prevent direct record creation this way. The insert would either fail or create an invalid/non-functional application record.

**Fix:** Remove this code example or replace with a conceptual description noting that application creation is a platform-managed process, not a scriptable one.

---

### 1.11 — Interview 65: Fabricated NotificationEmailTemplate API

**Interview ID:** 65 (Audit Compliance)  
**Location:** Solution code block  
**The issue:**  
```javascript
new NotificationEmailTemplate(notif).send(current.control_owner);
```
`NotificationEmailTemplate` is **not a standard ServiceNow API class**. The correct way to send notifications programmatically is via `gs.eventQueue()` to trigger an event-based notification, or by using the `GlideEmailOutbound` class.

**Fix:**  
```javascript
gs.eventQueue('control.evidence.missing', current, current.getValue('control_owner'), '');
```

---

### 1.12 — Post 64: Incorrect Virtual Agent Script APIs

**Post ID:** 64 ("From Demo to Production: Virtual Agent Architecture")  
**Location:** Hands-On password reset script  
**The issue:**  
The code uses `vaActions.execute('show_message', {msg: ...})` and `vaActions.execute('no_match')`. The correct Virtual Agent Topic scripting API uses:
- `vaSystem.topicComplete()` or `vaSystem.topicError()` for flow control
- `vaVars` for setting variables (this is used correctly)
- Output variables configured on the topic block for messages

`vaActions.execute()` with those parameters is not the correct API signature.

Additionally, `GlideStringUtil.base64Encode(gs.generateGUID().substring(0,8))` is used to generate a "temporary password." Base64 encoding is **not encryption or secure password generation** — it's trivially reversible.

**Fix:** Use proper VA script APIs and a secure password generation method, or note these as pseudocode.

---

### 1.13 — Post 70: Meaningless GlideRecord Query Filter

**Post ID:** 70 ("Data Chaos to AI Precision")  
**Location:** Hands-On CMDB audit script  
**The issue:**  
```javascript
grApps.addQuery('sys_id', '!=', '');  // Comment: "Production apps only"
```
Every record in ServiceNow has a non-empty `sys_id`. This filter does nothing — it matches every record. The comment says "Production apps only" but the query does not filter for production. To filter for production apps, you would need something like:
```javascript
grApps.addQuery('install_status', '1'); // Installed
grApps.addQuery('operational_status', '1'); // Operational
```

**Fix:** Replace with an actual production filter or remove the misleading comment.

---

## SEVERITY 2 — SIGNIFICANT DEPTH / NUANCE ISSUES

These are technically correct at a surface level but miss important nuances that a real interviewer or practitioner would expect.

---

### 2.1 — Interview 208: Missing Key ACL Nuances

**Interview ID:** 208 (ACLs)  
**The issues:**
- **Missing `before query` Business Rules:** ACLs and before-query BRs are complementary security mechanisms. A complete answer should mention that `addEncodedQuery()` in a before-query BR can filter records before ACL evaluation, which is critical for performance on large tables.
- **Missing `elevate_role`:** No mention of high-security plugins or the `security_admin` role elevation requirement for modifying ACLs — a common gotcha in production.
- **Confusing wording:** "Most specific wins in evaluation, but ALL must pass" is self-contradictory. The correct statement is: "ACLs are evaluated from most specific to least specific, and ALL matching ACLs must pass (AND logic)."

**Fix:** Clarify the wording and add a note about `before query` BRs and `security_admin` elevation.

---

### 2.2 — Interview 207: Missing Source Control Integration

**Interview ID:** 207 (Update Sets)  
**The issue:** The answer mentions Git briefly in the interview tip but doesn't explain that ServiceNow now has native Source Control Integration for scoped applications, which is the modern recommended approach for teams using Git workflows. For a 2026 answer, this is a significant omission since SCI has been available since the San Diego release.

**Fix:** Add a section on Source Control Integration as the modern alternative, noting that Update Sets are still used for global-scope changes and non-scoped artifacts.

---

### 2.3 — Posts 76–84: All Beginner Posts Lack Any Technical Substance

**Post IDs:** 76, 77, 78, 79, 80, 81, 82, 83, 84  
**The issue:** All nine beginner posts follow an identical template: definition paragraph, enterprise example box, bullet list, tip box. None contain:
- Any code examples
- Any table names or API references
- Any configuration steps
- Any screenshots or procedural detail

They read like marketing summaries rather than technical blog posts. Post 76 ("Buzzword Map") is literally a 10-row table of acronyms. Post 84 ("AI Buzzwords") lists 15 terms with one-sentence definitions.

For a technical portfolio, these posts don't demonstrate any hands-on ServiceNow expertise. A hiring manager reading these would see generic content that could be written without ever logging into an instance.

**Fix suggestions for the most visible ones:**
- **Post 84 (AI Buzzwords):** Add at least one code snippet showing how to interact with Now Assist via API, or a screenshot-equivalent description of AI Agent Studio configuration.
- **Post 83 (Now Assist):** Add the required plugin names (`com.snc.now_assist_platform`, SKU details), explain the embedding model, or show how to check Now Assist skill configuration.
- **Post 82 (CSDM):** Add the actual CSDM table names (`cmdb_ci_service`, `cmdb_ci_business_app`, `cmdb_ci_service_discovered`) and show a GlideRecord query connecting business services to application services.
- **Post 80 (ITSM):** Add at least the table names and a simple GlideRecord example for incident creation.
- **Post 81 (CMDB):** Reference the CMDB Health Dashboard, IRE rules, or Discovery — something beyond the conceptual level.

---

### 2.4 — Interview 206: UI Policy vs Client Script Execution Order Nuance

**Interview ID:** 206  
**The issue:** States "the UI Policy wins because it runs after the Client Script." While this is the general behavior, the actual execution order is more nuanced:
- `onLoad` Client Scripts run first, then UI Policies evaluate
- `onChange` Client Scripts fire on value change, then UI Policies re-evaluate
- UI Policies with the "Reverse if false" option can create additional complexity

The answer also oversimplifies with "never use both on the same field" — in practice, they coexist frequently and the correct guidance is to understand the evaluation order and avoid conflicting logic, not avoid all overlap.

**Fix:** Add the specific execution order details and replace "never use both" with "ensure they don't set conflicting states on the same field."

---

### 2.5 — Interview 216: Missing Flow Designer Debugging and Limits

**Interview ID:** 216 (Flow Designer)  
**The issue:** The answer covers the basics well but misses critical practitioner knowledge:
- **Flow Execution Details:** How to debug a failed flow (System Logs > Flow Execution Details)
- **Governor limits:** Flows have execution time limits and action limits per execution
- **Actions vs Subflows vs Spokes:** The distinction between these reusable components isn't explained
- **Process Automation Designer (PAD):** Mentioned in passing but PAD is the strategic tool for complex multi-stage processes and deserves more explanation

**Fix:** Add a section on debugging flows and mention governor limits as a gotcha.

---

### 2.6 — Interview 217: Missing Email Troubleshooting

**Interview ID:** 217 (Notifications)  
**The issue:** Doesn't mention how to troubleshoot notifications that don't fire:
- Check `sys_email` table for sent/failed emails
- Check email log (`syslog_email`) for errors
- Verify `glide.email.test.user` property isn't redirecting all emails in sub-prod
- Check that the notification isn't inactive or that the user hasn't unsubscribed

These are the first things you check in production and a real interviewer would probe for them.

**Fix:** Add a troubleshooting section covering these common debugging steps.

---

### 2.7 — Interview 204: Missing Business Rule Ordering

**Interview ID:** 204 (Business Rules)  
**The issue:** Doesn't mention the `Order` field on Business Rules. When multiple Business Rules of the same type (e.g., multiple "before" BRs) exist on the same table, the `Order` field (default 100) determines execution sequence. This is critical for production debugging when BRs conflict.

**Fix:** Add a note: "When multiple BRs of the same type exist on a table, the `Order` field (default 100, lower runs first) determines execution sequence."

---

### 2.8 — Post 55: Insecure Password Reset Implementation

**Post ID:** 55 ("PagerDuty to Virtual Agent")  
**Location:** AfterHoursPasswordReset Script Include  
**The issue:** The code demonstrates multiple security anti-patterns simultaneously:
1. Stores a temporary password in a custom field `u_temporary_password` (passwords should never be stored in readable fields)
2. Sends the password in plain text via email
3. Uses a REST call to the instance's own `sys_email` table with Basic Auth instead of using the built-in email API (`GlideEmailOutbound` or `gs.eventQueue`)
4. `setWorkflow(false)` bypasses business rules, which could skip audit logging

This would fail a security review in any enterprise.

**Fix:** Replace with ServiceNow's actual password reset mechanism (password reset workflow/portal page) or clearly label this as pseudocode not suitable for production.

---

## SEVERITY 3 — MINOR ISSUES AND NICE-TO-HAVES

---

### 3.1 — Post 84: Grammatical Error in Opening Paragraph

**Post ID:** 84  
**Location:** Second `<p>` tag  
**The issue:** The sentence is malformed:  
> "If you are new I have been through enough enterprise rollouts to know that most teams get lost in the terminology before they even start building., use this as a translation guide..."

There's a misplaced sentence fragment spliced into the middle, creating a run-on.

**Fix:** Rewrite as: "If you are new, use this as a translation guide from **marketing language** to **implementation thinking**. I have been through enough enterprise rollouts to know that most teams get lost in the terminology before they even start building."

---

### 3.2 — Interview 209: getRowCount() Warning Could Be Stronger

**Interview ID:** 209  
**Location:** Key Methods list  
**The issue:** Lists `getRowCount()` with just "(use carefully on large tables)." In practice, `getRowCount()` executes a full `COUNT(*)` query against the database and is a significant performance concern. Many ServiceNow architects ban its use entirely.

**Fix:** Strengthen to: "`getRowCount()` — Executes a full COUNT(*) query. Avoid on large tables (incident, task, sys_audit). Use `GlideAggregate` with `addAggregate('COUNT')` instead for counts."

---

### 3.3 — Interview 210: Variable Storage Table Imprecision

**Interview ID:** 210 (Service Catalog)  
**Location:** Interview Tip  
**The issue:** States variable answers are stored in `sc_item_option_mtom`. The actual values are in `sc_item_option`; the `sc_item_option_mtom` table is the many-to-many linking table that connects requested items to their option values. The distinction matters for anyone writing integration scripts.

**Fix:** Change to: "Variable values are stored in `sc_item_option`, linked to the RITM via the `sc_item_option_mtom` many-to-many table."

---

### 3.4 — Post 75: Closed HTML Tags Issues

**Post ID:** 75  
**Location:** Multiple places  
**The issue:** There are `</h2>` closing tags where `</div>` or other tags are expected. For example, after the anti-patterns list and after the step-by-step section. These would render incorrectly in a browser.

**Fix:** Audit and correct the HTML tag nesting throughout the post.

---

### 3.5 — Multiple Posts: Outdated Release References

**Post IDs:** 54, 60, 64, 70, and others  
**The issue:** Multiple posts reference "Vancouver" as the current or recent release. As of March 2026, ServiceNow is on the Xanadu or later release family. Washington DC was released in 2024, Xanadu in 2025. "Vancouver" content is 2+ years old.

**Fix:** Update release references or add a note about which release the content was written for. Alternatively, reference features by their general availability date rather than release names.

---

### 3.6 — Interview 113: ATF Test Cleanup

**Interview ID:** 113 (ATF)  
**Location:** Code example  
**The issue:** The ATF test step manually calls `gr.deleteRecord()` for cleanup. ATF has built-in test data cleanup via the "Delete records created during this test" option in test properties. Manually deleting records is fragile (if the test fails before cleanup, orphaned records remain).

**Fix:** Mention ATF's built-in cleanup mechanism and note that manual cleanup is an anti-pattern for ATF tests.

---

### 3.7 — Inconsistent Depth Across Interview Tiers

**The issue:** The beginner interviews (200–217) are consistently well-written with clear explanations and practical code. The senior interviews (47–66) vary significantly: some have production-quality scripts (e.g., 47, 53) while others have fabricated APIs (e.g., 65 with `NotificationEmailTemplate`). The .NET-bridge interviews (103–120) are the strongest overall, with accurate technical comparisons.

**Fix:** Audit all senior interview code examples against actual ServiceNow API documentation. The .NET bridge interviews should be used as the quality benchmark.

---

## CONTENT GAPS

Important ServiceNow topics that are completely absent or have only superficial coverage.

---

### Gap 1: No Dedicated ATF (Automated Test Framework) Content

ATF is mentioned in passing in several posts and interview 113 covers it from a .NET perspective, but there's no standalone blog post or interview question dedicated to ATF. Given its importance for CI/CD and upgrade safety, this is a significant gap.

### Gap 2: No REST API Best Practices Post

Multiple posts include REST code examples, but there's no dedicated content on ServiceNow REST API patterns: authentication methods (Basic, OAuth, mutual auth), pagination with `sysparm_offset`/`sysparm_limit`, rate limiting, batch API, and the Table API vs Scripted REST decision framework.

### Gap 3: No Performance Analytics Coverage

Performance Analytics is referenced repeatedly but never explained. PA indicators, breakdowns, data collection, and dashboards are core skills for any ServiceNow architect.

### Gap 4: No UI Builder / Next Experience Development

Post 104 mentions UI Builder briefly in a comparison, but there's no deep-dive on building custom pages, data resources, or workspace configuration. This is ServiceNow's strategic UI direction.

### Gap 5: No Integration Hub Spoke Development

Despite many posts discussing Integration Hub, none cover how to build a custom spoke, create custom actions, or configure connection aliases — essential for enterprise integrations.

### Gap 6: No Domain Separation Deep-Dive

Post 60 covers multi-tenancy conceptually but conflates Domain Separation with ACL-based security. A dedicated post on Domain Separation configuration, data domain hierarchy, and domain-aware scripting is missing.

### Gap 7: No ITIL 4 vs ITIL v3 Distinction

All ITSM content references "ITIL" generically. ServiceNow has been aligning with ITIL 4 practices (value streams, service value chain) since the Paris release. The content doesn't distinguish between the frameworks.

### Gap 8: Missing GRC/IRM Technical Depth

Post 78 covers IRM at a marketing level. No content exists on the actual GRC tables (`sn_grc_policy`, `sn_grc_control`, `sn_grc_risk`), policy exception workflows, or control testing automation.

---

## SUMMARY TABLE

| Severity | Count | Category |
|----------|-------|----------|
| Critical (S1) | 13 | Wrong APIs, fabricated methods, broken code, reversed evaluation orders |
| Significant (S2) | 8 | Missing nuances, shallow depth, missing practitioner knowledge |
| Minor (S3) | 7 | Typos, imprecise terminology, outdated references |
| Content Gaps | 8 | Missing topics that a complete portfolio should cover |

**Overall Assessment:**  
The .NET-to-ServiceNow bridge interviews (103–120) and the beginner interviews (200–217) are the strongest content — technically accurate, well-structured, and genuinely useful. The advanced blog posts (46–75) contain valuable architectural thinking but are undermined by fabricated API references and code examples that wouldn't run on a real instance. The beginner blog posts (76–84) are too thin to demonstrate technical expertise and read like marketing summaries.

**Highest-priority fixes:**
1. Audit all code examples for fabricated APIs (especially posts 65, 69, 70, 71, and interview 65)
2. Fix the ACL evaluation order in post 60
3. Fix the GlideRecord insert with user_name in interview 209
4. Fix the table inheritance error for `sc_req_item` in interview 212
5. Add at least one technical element (table names, code, configuration) to each beginner post (76–84)
