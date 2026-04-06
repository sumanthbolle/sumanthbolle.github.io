# ServiceNow Store Certification Gap Analysis

**Application:** Ciroos Incident Management (`x_ciroo_ciroos_i_0`)  
**Analysis Date:** April 6, 2026  
**Context:** After applying the security fix scripts from `ciroos_security_fix_scripts.js`

---

## Short Answer

**No** — even after running the fix scripts, this app will **not pass** the ServiceNow Store certification as-is. The fix scripts address the code-level security vulnerabilities (injection, credential exposure, SSRF, etc.), but the Store certification process checks a broader set of requirements that include structural/architectural items, ACL configurations, module roles, Jelly safety, and documentation that the scripts do not cover.

Below is a complete gap analysis organized by **what the fix scripts already solve** vs. **what still needs to be fixed**.

---

## What the Fix Scripts ALREADY Solve

| # | Certification Requirement | Status |
|---|--------------------------|--------|
| 1 | No hardcoded credentials in scripts | **PASS** (already clean) |
| 2 | No `eval()`, `Function()`, or dynamic code execution | **PASS** (already clean) |
| 3 | No SQL injection (parameterized GlideRecord queries) | **PASS** (already clean) |
| 4 | No dot-walking to `.sys_id` (uses `getValue()`) | **PASS** (already clean) |
| 5 | XSS prevention in UI pages (proper escapeHtml/ccEsc) | **PASS** (already clean) |
| 6 | Client-callable Script Include has internal role checks | **PASS** (after Part 1 fix) |
| 7 | API token encrypted at rest (`password2` field type) | **PASS** (after Part 7C fix) |
| 8 | System properties have `read_roles`/`write_roles` | **PASS** (after Part 7A fix) |
| 9 | Error responses don't leak internal details | **PASS** (after Part 3 fix) |
| 10 | Input validation on API endpoints | **PASS** (after Part 3 fix) |
| 11 | No SSRF vulnerabilities | **PASS** (after Part 1 fix) |
| 12 | Loop prevention is robust | **PASS** (after Parts 5/6 fix) |
| 13 | Outbound data scoped to integration-relevant records | **PASS** (after Part 6B fix) |

---

## What STILL NEEDS TO BE FIXED for Certification

### BLOCKER 1 — Missing ACL on Client-Callable Script Include

**This is the #2 most common certification failure.**

`CiroosIntegrationConfig` is `client_callable=true` but there is **no ACL of type `client_callable_script_include` with operation `execute`** in the app. ServiceNow certification requires a dedicated ACL for every client-callable script include — the internal `gs.hasRole()` check we added is good defense-in-depth but does not satisfy the platform-level ACL requirement.

**Fix — Run this additional background script:**

```javascript
(function() {
    var scriptIncludeName = 'CiroosIntegrationConfig';

    // Check if ACL already exists
    var existing = new GlideRecord('sys_security_acl');
    existing.addQuery('name', scriptIncludeName);
    existing.addQuery('type', 'client_callable_script_include');
    existing.addQuery('operation', 'execute');
    existing.query();

    if (existing.next()) {
        gs.info('ACL already exists for ' + scriptIncludeName);
        return;
    }

    // Create the ACL
    var acl = new GlideRecord('sys_security_acl');
    acl.initialize();
    acl.setValue('name', scriptIncludeName);
    acl.setValue('operation', 'execute');
    acl.setValue('type', 'client_callable_script_include');
    acl.setValue('active', true);
    acl.setValue('admin_overrides', true);
    acl.setValue('advanced', false);
    acl.setValue('sys_scope', '051a81a993b372909d51afa877373c18');
    var aclSysId = acl.insert();

    if (aclSysId) {
        // Assign the config_user role
        var roleGR = new GlideRecord('sys_user_role');
        roleGR.addQuery('name', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        roleGR.query();
        if (roleGR.next()) {
            var aclRole = new GlideRecord('sys_security_acl_role');
            aclRole.initialize();
            aclRole.setValue('sys_security_acl', aclSysId);
            aclRole.setValue('sys_user_role', roleGR.getUniqueValue());
            aclRole.insert();
        }
        gs.info('Created client_callable_script_include ACL for ' + scriptIncludeName);
    }
})();
```

---

### BLOCKER 2 — Missing Roles on Application Modules

**This is the #4 most common certification failure.**

Out of ~14 `sys_app_module` records, **only 2 have roles assigned**:
- The config table module has `ciroos_integration_config_user`
- The application menu has `admin,user,ciroos_integration_config_user`

The remaining **12 modules have `<roles/>` (empty)**, meaning visibility is controlled only by the parent Application Menu role, which the certification team will flag. Affected modules include:

| Module | Query/Link | Roles |
|--------|-----------|-------|
| `--- Setup ---` (separator) | — | **EMPTY** |
| Syslog viewer | `syslog_list.do?...LIKECiroos` | **EMPTY** |
| Script Includes | `sys_script_include_list.do?...LIKECiroos` | **EMPTY** |
| Config list (inactive) | `ciroos_integration_config_list.do` | **EMPTY** |
| System Properties | `sys_properties_list.do?...LIKEciroos` | **EMPTY** |
| Guided Setup | `ciroos_guided_setup.do` | **EMPTY** |
| Config Dashboard | (UI page link) | **EMPTY** |
| Business Rules | `sys_script_list.do?...LIKECiroos` | **EMPTY** |
| REST APIs | `sys_ws_definition_list.do?...LIKECiroos` | **EMPTY** |
| Email Notifications | `sysevent_email_action_list.do?...LIKECiroos` | **EMPTY** |
| Events | `sysevent_register_list.do?...LIKEciroos` | **EMPTY** |
| Ciroos Incidents (inactive) | `incident_list.do?...correlation_id` | **EMPTY** |
| Integration Config (UI page) | `ciroos_integration_config.do` | **EMPTY** |

**Fix — Run this additional background script:**

```javascript
(function() {
    var ROLE = 'x_ciroo_ciroos_i_0.ciroos_integration_config_user';

    var gr = new GlideRecord('sys_app_module');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.addQuery('roles', '');
    gr.query();

    var count = 0;
    while (gr.next()) {
        gr.setValue('roles', ROLE);
        gr.update();
        count++;
        gs.info('Added role to module: ' + (gr.getValue('title') || gr.getValue('name') || gr.getUniqueValue()));
    }
    gs.info('Updated ' + count + ' modules with role: ' + ROLE);
})();
```

---

### BLOCKER 3 — UI Pages Missing Proper Jelly Escaping

The certification tool checks for **unsafe Jelly statements** in UI pages. Your 3 UI pages use `<g:evaluate>` and `<j:set>` Jelly tags for initial data rendering. While the client-side JavaScript uses proper `escapeHtml()`/`ccEsc()`, the **Jelly-layer** itself may be flagged by the automated scanner.

**What to verify on your vendor instance:**
1. Run the **Certification Self-Test Tool** and check for any Jelly-related failures
2. Ensure all `<g:evaluate>` blocks only output to JavaScript variables, not directly to HTML
3. Ensure any `${...}` or `$[...]` Jelly variable output uses `jvar_` prefixed variables with `<g:no_escape>` only where safe

---

### BLOCKER 4 — Global-Scoped Event Registrations

Two event registrations are in the **Global** scope (`sys_package="Global"`) instead of the app scope:
- `ciroos.incident.created`
- `ciroos.incident.updated`

Additionally, `ciroos.outbound.failed` is in Global scope. The certification team flags global-scope artifacts in scoped apps because they orphan on uninstall and can collide with other apps.

**Fix:** These events need to be recreated with `sys_package` pointing to your app scope (`051a81a993b372909d51afa877373c18`). This must be done in the app development UI, not via background script (updating `sys_package` on event registrations via script may not be supported).

---

### BLOCKER 5 — No ATF (Automated Test Framework) Tests

The ServiceNow certification process requires a **Test Plan with results**. While this can be manual documentation, best practice (and increasingly expected for Store apps) is to include **ATF test suites** in your app that validate:
- Incident creation via the REST API
- Incident update via the REST API
- Field config CRUD operations
- Role-based access (positive and negative tests)
- Loop prevention behavior
- Outbound notification triggers

**Action:** Create ATF tests on your vendor instance covering the core happy paths and security scenarios.

---

### HIGH — Business Rules Missing `role_conditions`

While business rules firing on the `incident` table don't strictly require `role_conditions` (they run in system context), the certification team may flag that 4 out of 5 business rules have empty `role_conditions`. At minimum, ensure the business rules have appropriate `condition` or `filter_condition` fields to limit their scope.

**Action:** Consider adding `filter_condition` on the outbound notification BR to `correlation_idISNOTEMPTY` (now that we filter in script, having it in the filter_condition too is defense-in-depth and more transparent to reviewers).

---

### HIGH — Missing Installation/Uninstallation Guide

The certification submission requires:
1. **Design Document** — Architecture overview, data flow diagrams
2. **Test Plan with results** — What was tested and outcomes
3. **Installation Guide** — Step-by-step customer-facing guide covering:
   - Prerequisites (ServiceNow version, plugins required)
   - How to create the service account (`svc_ciroos`)
   - How to assign roles
   - How to configure the API token
   - How to verify connectivity
   - Post-installation validation steps

---

### MEDIUM — `GlideRecord` vs `GlideRecordSecure` in Client-Callable Methods

The `CiroosIntegrationConfig` script include queries several platform tables (`sys_dictionary`, `sys_choice`, `sys_user_group`) using `GlideRecord` instead of `GlideRecordSecure`. While these are server-side calls, the certification team may flag that a client-callable script include should use `GlideRecordSecure` to respect ACLs when reading data on behalf of a user.

**Recommendation:** Replace `new GlideRecord('sys_dictionary')` with `new GlideRecordSecure('sys_dictionary')` in `getIncidentFieldsAjax()`, `getChoiceValues()`, and `getAssignmentGroups()`.

---

### MEDIUM — Application Logo/Icon

Store apps require a proper application logo. The app has a `db_image` record (the Ciroos logo), which is good, but verify it meets the Store's image size and format requirements.

---

### MEDIUM — Store Listing Requirements

Beyond code, the Store listing review requires:
- Accurate app description
- Screenshots/demo video
- Supported ServiceNow versions listed
- Pricing model defined
- Support contact information
- EULA/Terms of Service

---

### LOW — Inactive Artifacts Should Be Removed

The app contains inactive artifacts that add clutter:
- Inactive module: "Ciroos Incidents" list view
- Inactive module: "Config Records" list view
- Inactive business rule: "Incident Updated Trigger to Ciroos"

The certification team may flag these as unnecessary artifacts. Consider removing them entirely rather than just deactivating.

---

## Complete Certification Readiness Checklist

| # | Requirement | Current Status | Action Needed |
|---|------------|----------------|---------------|
| 1 | Build Partner Program membership | Unknown | Verify enrollment at `tpp.servicenow.com` |
| 2 | Developed on vendor instance | Unknown | Must use `venXXXXX.service-now.com` |
| 3 | Certification Self-Test Tool run | Not run | Run v3.1.0 on vendor instance |
| 4 | No hardcoded credentials | **PASS** | — |
| 5 | No `eval()`/dynamic code execution | **PASS** | — |
| 6 | No SQL injection | **PASS** | — |
| 7 | No dot-walking to `.sys_id` | **PASS** | — |
| 8 | XSS prevention in UI pages | **PASS** | Verify Jelly layer via Self-Test Tool |
| 9 | ACL on client-callable script includes | **FAIL** | Add `client_callable_script_include` ACL |
| 10 | Roles on all application modules | **FAIL** | Add roles to 12 modules |
| 11 | UI page ACLs present | **PASS** | — |
| 12 | Table-level ACLs (CRUD) | **PASS** | — |
| 13 | Field-level ACL on sensitive fields | **PASS** (after fix) | — |
| 14 | `password2` for credential storage | **PASS** (after fix) | — |
| 15 | System properties role-restricted | **PASS** (after fix) | — |
| 16 | No global-scope artifacts in scoped app | **FAIL** | Move 3 event registrations to app scope |
| 17 | Proper error handling (no info leakage) | **PASS** (after fix) | — |
| 18 | Input validation on APIs | **PASS** (after fix) | — |
| 19 | No SSRF vulnerabilities | **PASS** (after fix) | — |
| 20 | Role checks in client-callable methods | **PASS** (after fix) | — |
| 21 | `GlideRecordSecure` in client-callable SI | **NEEDS REVIEW** | Consider replacing `GlideRecord` |
| 22 | No inactive/orphan artifacts | **FAIL** | Remove or justify inactive items |
| 23 | ATF test suite | **MISSING** | Create ATF tests |
| 24 | Design document | **MISSING** | Create architecture doc |
| 25 | Test plan with results | **MISSING** | Create and execute test plan |
| 26 | Installation guide | **MISSING** | Create customer-facing guide |
| 27 | Store listing content | **MISSING** | Create marketing materials |
| 28 | App logo meets Store specs | **VERIFY** | Check size/format requirements |
| 29 | Business rule `filter_condition` | **RECOMMENDED** | Add to outbound notification BR |
| 30 | `enforce_acl` on REST operations | **RECOMMENDED** | Set on each `sys_ws_operation` |

---

## Recommended Next Steps (in priority order)

1. **Run the Certification Self-Test Tool** on your vendor instance — this catches ~80-90% of issues automatically and gives you specific corrective actions
2. **Fix Blocker 1** — Create the `client_callable_script_include` ACL (script provided above)
3. **Fix Blocker 2** — Add roles to all application modules (script provided above)
4. **Fix Blocker 4** — Move global-scoped event registrations to app scope (do in Studio)
5. **Fix Blocker 5** — Create ATF tests for core scenarios
6. **Create documentation** — Design doc, test plan, installation guide
7. **Clean up** — Remove inactive artifacts
8. **Submit to Store Publisher Portal** at `tpp.servicenow.com`

---

## Additional Background Scripts for Remaining Fixes

The scripts for Blockers 1 and 2 are provided above. Blocker 4 (global-scope events) and Blocker 5 (ATF tests) must be done through the ServiceNow Studio UI on your vendor instance, not via background scripts.
