# Security Analysis: Ciroos Incident Management (ServiceNow Custom App)

**Application:** Ciroos Incident Management (`x_ciroo_ciroos_i_0`)  
**Analysis Date:** April 6, 2026  
**Scope:** Full application export XML — Script Includes, Business Rules, Scripted REST APIs, ACLs, UI Pages, System Properties, Table Schema, Event Handlers

---

## Executive Summary

The **Ciroos Incident Management** app is a ServiceNow scoped application that integrates ServiceNow incidents with an external "Ciroos" platform via bidirectional REST APIs. The analysis identified **6 Critical**, **7 High**, **8 Medium**, and **5 Low** severity findings across credential handling, access control, input validation, data leakage, and architectural concerns.

The most urgent issues involve **API token exposure to any authenticated user** via a client-callable Script Include with no role checks, **plaintext credential storage**, and an **outbound business rule that sends ALL incidents to the external Ciroos API** regardless of origin.

---

## Application Architecture Overview

| Component | Count | Details |
|-----------|-------|---------|
| Script Includes | 5 | CiroosOutboundHandler, CiroosUtils, CiroosFieldConfigHelper, CiroosInboundHandler, CiroosIntegrationConfig |
| Business Rules | 5 | 4 active + 1 inactive on `incident` table |
| Scripted REST Operations | 8 | CRUD for incidents + field config management |
| ACLs | 6 | Table-level (4) + UI page (3); No field-level ACLs |
| UI Pages | 3 | ConfigDashboard, GuidedSetup, IntegrationConfig wizard |
| System Properties | 5 | Integration feature flags & config |
| Custom Tables | 1 | `ciroos_integration_config` |
| Event Registrations | 7 | Inbound/outbound lifecycle events |
| Script Actions | 1 | Outbound event dispatcher |

---

## Findings Summary

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| C1 | **CRITICAL** | Credential Exposure | API token returned to browser via client-callable GlideAjax |
| C2 | **CRITICAL** | Access Control | `CiroosIntegrationConfig` — no role checks in any method |
| C3 | **CRITICAL** | Credential Storage | API token stored as plaintext `string`, not `password2` |
| C4 | **CRITICAL** | SSRF | `testCiroosConnectivity()` — user-controlled URL from any user |
| C5 | **CRITICAL** | SSRF | `syncConfigToCiroos()` — POST with instance info to user-controlled URL |
| C6 | **CRITICAL** | Authorization Bypass | `validateOrgId()` accepts any non-empty string |
| H1 | **HIGH** | Data Leakage | ALL incidents sent to external Ciroos API, not just Ciroos-originated |
| H2 | **HIGH** | Config Tampering | Any authenticated user can call `saveConfig()` and hijack integration |
| H3 | **HIGH** | Info Disclosure | Internal exception messages returned in API error responses |
| H4 | **HIGH** | Mass Assignment | Unrestricted `u_*` custom field writes on incidents |
| H5 | **HIGH** | Access Control | System properties have no read/write role restrictions |
| H6 | **HIGH** | Missing ACL | No field-level ACL on `ciroos_api_token` |
| H7 | **HIGH** | Info Disclosure | Raw HTTP response bodies stamped into work notes |
| M1 | **MEDIUM** | Performance/DoS | Synchronous HTTP call in `after` business rule (15s timeout) |
| M2 | **MEDIUM** | Loop Prevention | Session-based flag has no `try/finally` — can get stuck |
| M3 | **MEDIUM** | Loop Prevention | Username prefix-based detection is fragile |
| M4 | **MEDIUM** | Input Validation | No type/range validation on incident field values |
| M5 | **MEDIUM** | Info Disclosure | Incident field metadata exposed to all authenticated users |
| M6 | **MEDIUM** | Data Integrity | No rate limiting or soft-delete on destructive operations |
| M7 | **MEDIUM** | Info Disclosure | User-supplied identifiers echoed in error responses |
| M8 | **MEDIUM** | ACL Gap | REST operations have empty `enforce_acl` at operation level |
| L1 | **LOW** | Logic | Resolved incidents (state=6) can be modified via API |
| L2 | **LOW** | Robustness | Unprotected `JSON.parse` in `loadConfig()` |
| L3 | **LOW** | Logic | Event payload in queue exposes incident data (3500 chars) |
| L4 | **LOW** | Maintainability | Inactive business rule would cause issues if re-enabled |
| L5 | **LOW** | Scope | Global-scoped event registration may orphan on uninstall |

---

## Detailed Findings

---

### C1 — CRITICAL: API Token Exposed to Any Authenticated User via GlideAjax

**Component:** `CiroosIntegrationConfig` (Script Include), `ciroos_integration_config` (UI Page)

**Description:** The `CiroosIntegrationConfig` script include is declared as `client_callable=true` with `access=public`. Multiple methods — `loadConfig()`, `getExistingConfig()`, and `getConfigData()` — return the full plaintext Ciroos API bearer token in their JSON response:

```javascript
// In getExistingConfig() and getConfigData():
ciroos_api_url: gr.getValue('ciroos_api_url') || '',
ciroos_api_token: gr.getValue('ciroos_api_token') || '',
```

The UI page client script then places this token into a DOM input field:

```javascript
document.getElementById('ccToken').value = ec.ciroos_api_token || '';
```

Since this script include is `client_callable`, **any authenticated ServiceNow user** can execute:

```javascript
var ga = new GlideAjax('CiroosIntegrationConfig');
ga.addParam('sysparm_name', 'loadConfig');
ga.getXMLAnswer(function(answer) { /* full token is in answer */ });
```

**Impact:** Complete compromise of the Ciroos API integration credential. An attacker can impersonate ServiceNow to the Ciroos platform.

**Recommendation:**
1. Never return the raw token to the client. Return a masked version (e.g., `'••••••••'`) or a boolean `has_token: true`.
2. For connection testing, have the server read the token from the saved config record by `sys_id` rather than accepting it as a client parameter.
3. Add `gs.hasRole()` checks to every method (see C2).

---

### C2 — CRITICAL: No Role Checks in Client-Callable Script Include

**Component:** `CiroosIntegrationConfig`

**Description:** The script include has `client_callable=true`, `access=public`, and **zero** `gs.hasRole()` checks in any of its methods. This means any authenticated ServiceNow user can:

- **`saveConfig()`** — Overwrite the integration config including API URL and token
- **`testCiroosConnectivity()`** — Make outbound HTTP calls from the ServiceNow instance
- **`syncConfigToCiroos()`** — Send instance metadata to any URL
- **`getExistingConfig()`** — Retrieve the full API token
- **`getIncidentFieldsAjax()`** — Enumerate all incident table fields
- **`getAssignmentGroups()`** — Search and enumerate all assignment groups

**Impact:** Complete takeover of the integration configuration. An attacker could redirect outbound incident data to their own server and steal the API token.

**Recommendation:** Add role authorization at the top of every method:

```javascript
if (!gs.hasRole('x_ciroo_ciroos_i_0.ciroos_integration_config_user')) {
    return JSON.stringify({ success: false, message: 'Insufficient privileges' });
}
```

Consider splitting into two script includes: a client-callable one with safe read-only operations and a server-only one for sensitive operations.

---

### C3 — CRITICAL: API Token Stored as Plaintext

**Component:** `sys_dictionary` field definition for `ciroos_api_token`

**Description:** The `ciroos_api_token` field on `x_ciroo_ciroos_i_0_ciroos_integration_config` uses `internal_type=string` (max_length=1000) instead of `password2` (ServiceNow's encrypted field type). The token is:

- Stored **unencrypted** in the database
- Readable via GlideRecord `getValue()`, list views, XML exports, and REST Table API
- Has no field-level read/write role restrictions
- Has no `is_private` flag

**Impact:** Anyone with `ciroos_integration_config_user` role can read the raw token from the table. The token also appears in update set exports, instance clones, and backups.

**Recommendation:**
1. Change the field type to `password2` (encrypted at rest).
2. Update server-side code to use `gr.getDecryptedValue('ciroos_api_token')` instead of `gr.getValue('ciroos_api_token')`.
3. Alternatively, use ServiceNow's Connection & Credential Aliases (`sys_connection_alias` / `sys_credential`) for proper credential management.
4. Create a field-level ACL restricting read/write to `admin` only.

---

### C4 — CRITICAL: Server-Side Request Forgery (SSRF) via `testCiroosConnectivity()`

**Component:** `CiroosIntegrationConfig.testCiroosConnectivity()`

**Description:** This client-callable method accepts a user-provided URL and token, then makes an outbound HTTP GET request from the ServiceNow instance:

```javascript
testCiroosConnectivity: function() {
    var url = this.getParameter('sysparm_url');
    var token = this.getParameter('sysparm_token');
    var rm = new sn_ws.RESTMessageV2();
    rm.setEndpoint(url + '/api/v1/health');
    rm.setHttpMethod('GET');
    rm.setRequestHeader('Authorization', 'Bearer ' + token);
    // ... response is returned to caller
```

Any authenticated user can cause the ServiceNow instance to make HTTP requests to arbitrary URLs, including:
- Cloud metadata services (`http://169.254.169.254/latest/meta-data/`)
- Internal network services
- Port scanning of internal hosts

The response status code and parsed body are returned to the caller.

**Impact:** Internal network reconnaissance, potential credential theft from cloud metadata services, probing of internal services.

**Recommendation:**
1. Add role checks to this method.
2. Validate the URL (HTTPS only, block private/internal IP ranges).
3. Accept only a config `sys_id` and read the URL from the stored config server-side.

---

### C5 — CRITICAL: SSRF with Instance Info Exfiltration via `syncConfigToCiroos()`

**Component:** `CiroosIntegrationConfig.syncConfigToCiroos()`

**Description:** Similar to C4, but worse — this method makes a **POST** request to a user-controlled URL and includes ServiceNow instance metadata in the payload:

```javascript
var metadata = {
    instance_url: gs.getProperty('glide.servlet.uri'),
    instance_name: gs.getProperty('instance_name'),
    // ... other config data
};
rm.setEndpoint(ciroosUrl + '/api/v1/integrations/servicenow/config');
rm.setHttpMethod('POST');
rm.setRequestBody(JSON.stringify(metadata));
```

**Impact:** An attacker can exfiltrate the ServiceNow instance URL, instance name, and integration configuration to any external server.

**Recommendation:** Same as C4. Read the URL from stored config server-side and add role checks.

---

### C6 — CRITICAL: Organization ID Validation is Effectively a No-Op

**Component:** `CiroosFieldConfigHelper.validateOrgId()`

**Description:** All 5 field-config REST API endpoints validate the `x-organization-id` header using this method:

```javascript
validateOrgId: function(requestOrgId) {
    return (requestOrgId && requestOrgId.trim().length > 0);
},
```

This only checks that the header is **non-empty**. It does not compare against any stored or expected organization ID. Any caller providing `x-organization-id: anything` passes validation.

**Impact:** The field-config REST endpoints have no effective application-level authorization beyond ServiceNow's platform authentication. Any authenticated user with API access can read, modify, or delete all field configurations.

**Recommendation:** Validate the `x-organization-id` against a stored value in the integration config:

```javascript
validateOrgId: function(requestOrgId) {
    if (!requestOrgId || !requestOrgId.trim()) return false;
    var config = new CiroosUtils().getActiveConfig();
    if (!config) return false;
    return config.organization_id === requestOrgId.trim();
},
```

---

### H1 — HIGH: ALL Incidents Sent to External API (Data Leakage)

**Component:** "Ciroos - Outbound Notification" Business Rule

**Description:** The outbound notification business rule fires on **every** incident insert and update — not just Ciroos-originated incidents. The code comment explicitly confirms: *"ALL incidents, not just Ciroos."* Every incident created in the entire ServiceNow instance is sent to the external Ciroos API, including:

- `short_description`
- `description`
- `assigned_to`, `assignment_group`
- `priority`, `impact`, `urgency`
- `cmdb_ci`, `business_service`
- `state`, `category`, `subcategory`

**Impact:** Sensitive incidents (HR, security, legal, executive) are all forwarded to the third-party Ciroos platform. This is a significant data exfiltration concern and likely violates data handling policies.

**Recommendation:** Add a filter to only send Ciroos-originated or explicitly tagged incidents:

```javascript
if (current.operation() === 'insert') {
    if (!current.getValue('correlation_id')) {
        return; // Don't send non-Ciroos incidents
    }
}
```

---

### H2 — HIGH: Any User Can Hijack Integration via `saveConfig()`

**Component:** `CiroosIntegrationConfig.saveConfig()`

**Description:** Because `saveConfig()` has no role checks and is client-callable, any authenticated user can:

1. Change `ciroos_api_url` to point to an attacker-controlled server, capturing all outbound incident data
2. Change `ciroos_api_token` to any value
3. Modify mandatory fields and trigger field configuration
4. Overwrite any existing config by specifying a known `sys_id`

**Impact:** Complete integration hijacking — attacker can silently redirect all outbound incident data to their own server.

**Recommendation:** Add role checks (see C2) and consider requiring re-authentication for credential changes.

---

### H3 — HIGH: Internal Exception Details Returned in API Responses

**Component:** `CiroosInboundHandler.createIncident()`, `updateIncident()`

**Description:** Raw JavaScript/Rhino exception messages are returned to external API callers:

```javascript
} catch (e) {
    return this._error(500, 'Internal error: ' + e.message);
}
```

**Impact:** Exception messages can reveal internal table structures, field names, database errors, GlideRecord internals, and ServiceNow version information.

**Recommendation:** Return a generic message to callers and log details server-side only:

```javascript
} catch (e) {
    this.utils.error('createIncident exception: ' + e.message);
    return this._error(500, 'An internal error occurred. Contact your administrator.');
}
```

---

### H4 — HIGH: Mass Assignment via Unrestricted `u_*` Field Writes

**Component:** `CiroosInboundHandler.updateIncident()`, `_applyFields()`

**Description:** The inbound handler dynamically sets **any** custom field on the incident that starts with `u_` and passes `isValidField()`:

```javascript
for (var key in payload) {
    if (key.indexOf('u_') === 0 && gr.isValidField(key)) {
        gr.setValue(key, payload[key]);
    }
}
```

`isValidField()` only checks if the field exists, not whether it should be writable by the integration.

**Impact:** An API caller can overwrite arbitrary custom fields on incidents, including fields with business logic implications (e.g., `u_approval_status`, `u_cost_center`, `u_internal_notes`).

**Recommendation:** Use an explicit allowlist of permitted `u_*` fields:

```javascript
var allowedCustomFields = ['u_ciroos_sync_status', 'u_ciroos_field_1'];
for (var key in payload) {
    if (key.indexOf('u_') === 0 && allowedCustomFields.indexOf(key) !== -1) {
        gr.setValue(key, payload[key]);
    }
}
```

---

### H5 — HIGH: System Properties Have No Role Restrictions

**Component:** All 5 `sys_properties` records

**Description:** All system properties (`ciroos.integration.enabled`, `source_identifier`, `retry_count`, `loop_prevention.field`, `debug`) have `is_private=false` with empty `read_roles` and `write_roles`.

**Impact:** Any authenticated user can:
- Disable the integration by setting `enabled=false`
- Break loop prevention by changing the `loop_prevention.field`
- Enable debug logging to expose operational details
- Cause DoS via excessive retries or disable retries entirely

**Recommendation:** Set `write_roles` to `admin` or `x_ciroo_ciroos_i_0.ciroos_integration_config_user` on all properties.

---

### H6 — HIGH: No Field-Level ACL on `ciroos_api_token`

**Component:** Missing `sys_security_acl` for field-level protection

**Description:** There are no field-level ACLs on the `ciroos_api_token` field. The only protection is the table-level record ACL requiring `ciroos_integration_config_user`. Anyone with this role can read the full token.

**Recommendation:** Create field-level ACLs on `ciroos_api_token`:
- **read**: Restrict to `admin` only
- **write**: Restrict to `admin` only

---

### H7 — HIGH: Raw HTTP Response Bodies in Work Notes

**Component:** `CiroosOutboundHandler`, "Ciroos - Outbound Notification" BR

**Description:** The outbound handler writes HTTP response details into incident work notes, and the inactive business rule writes the **entire response body**:

```javascript
// Active rule - writes HTTP status and trace ID
gr.work_notes = '══ Ciroos Sync: ' + payload.event_type + ' ══\n'
    + 'Status: ' + (parseInt(httpStatus) < 400 ? '✓ Sent' : '✗ Failed') + '\n'
    + 'HTTP: ' + httpStatus;

// Inactive rule - writes full response body
gr.work_notes = '══ Ciroos Sync: CREATED ══\nHTTP: ' + status + '\nResponse: ' + body;
```

Work notes are visible to any `itil` user.

**Impact:** If the Ciroos API returns error details, stack traces, internal URLs, or tokens in its responses, they become visible to all incident viewers.

**Recommendation:** Limit work notes to success/failure status only. Log full details to system log.

---

### M1 — MEDIUM: Synchronous HTTP Call in `after` Business Rule

**Component:** "Ciroos - Outbound Notification" BR

**Description:** The outbound notification makes a synchronous REST call (`rm.execute()`) in an `after` business rule with a 15-second timeout. If the Ciroos API is slow or down, every incident insert/update in the entire instance is delayed.

**Recommendation:** Use `rm.executeAsync()` or move to an `async` business rule, or use the event queue pattern (the app already has event registrations for this purpose).

---

### M2 — MEDIUM: Session Flag Loop Prevention Has No try/finally

**Component:** `CiroosOutboundHandler`, "Ciroos - Outbound Notification" BR

**Description:** Session flags (`ciroos_stamp_update`, `ciroos_inbound_update`) are set before `gr.update()` and cleared after, but without `try/finally`. If an exception occurs during the update, the flags remain set for the rest of the session, silently suppressing all subsequent outbound notifications.

**Recommendation:** Wrap in `try/finally`:

```javascript
try {
    gs.getSession().putClientData('ciroos_stamp_update', 'true');
    gr.update();
} finally {
    gs.getSession().putClientData('ciroos_stamp_update', 'false');
}
```

---

### M3 — MEDIUM: Username Prefix-Based Loop Detection is Fragile

**Component:** "Ciroos - Loop Prevention Guard" BR

**Description:** Loop prevention checks if `sys_updated_by` starts with `svc_ciroos` or `ciroos`:

```javascript
if (updatedBy.indexOf('svc_ciroos') === 0 || updatedBy.indexOf('ciroos') === 0) {
    utils.setInboundFlag();
}
```

Any user whose name starts with "ciroos" triggers loop prevention. Conversely, if the service account is renamed, the check breaks.

**Recommendation:** Use a configurable system property for the service account username, or check by `sys_id`.

---

### M4 — MEDIUM: No Type/Range Validation on Incident Field Values

**Component:** `CiroosInboundHandler`

**Description:** Values from the JSON payload are passed directly to `gr.setValue()` without type checking. Fields like `state`, `priority`, `impact`, `urgency` should be constrained numeric values but accept arbitrary strings. Reference fields accept arbitrary strings that may silently clear the reference.

**Recommendation:** Validate field value types and ranges before calling `setValue()`.

---

### M5 — MEDIUM: Incident Field Metadata Exposed to All Users

**Component:** `CiroosIntegrationConfig.getIncidentFieldsAjax()`

**Description:** Any authenticated user can enumerate all incident table fields, their types, reference targets, and mandatory flags via GlideAjax. This is valuable reconnaissance information.

**Recommendation:** Add role checks to this method.

---

### M6 — MEDIUM: No Rate Limiting on Destructive Operations

**Component:** DELETE /field-config endpoint

**Description:** A single API call can wipe all field configurations. Combined with the weak `validateOrgId` check, a compromised caller can destroy integration configuration instantly with no confirmation, soft-delete, or undo capability.

**Recommendation:** Implement soft-delete (mark as inactive) and add application-level audit logging.

---

### M7 — MEDIUM: User-Supplied Identifiers Echoed in Error Responses

**Component:** `CiroosInboundHandler`, REST API operations

**Description:** Error messages echo user-supplied values (identifiers, technical names) verbatim in response bodies:

```javascript
return this._error(404, 'Incident not found for identifier: ' + identifier);
```

**Recommendation:** Return generic error messages: `'Incident not found'`.

---

### M8 — MEDIUM: REST Operations Have Empty `enforce_acl`

**Component:** All 8 `sys_ws_operation` records

**Description:** While the parent `sys_ws_definition` sets ACL enforcement, individual operations have empty `enforce_acl`. If the parent ACL is misconfigured or removed, operations become unprotected.

**Recommendation:** Explicitly set `enforce_acl` on each operation for defense-in-depth.

---

### L1 — LOW: Resolved Incidents Can Be Modified

**Component:** `CiroosInboundHandler.updateIncident()`

**Description:** Only states 7 (Closed) and 8 (Cancelled) block updates. State 6 (Resolved) is not blocked. The allowlist includes `state` itself, so the API can re-open resolved incidents.

---

### L2 — LOW: Unprotected JSON.parse in `loadConfig()`

**Component:** `CiroosIntegrationConfig.loadConfig()`

**Description:** `JSON.parse` calls for `mandatory_fields` and `update_trigger_fields` lack try/catch. Corrupted stored data would crash the AJAX response. Other code paths (`CiroosUtils.getActiveConfig()`) properly use `_safeParse()`.

---

### L3 — LOW: Event Payload Exposes Incident Data

**Component:** `CiroosOutboundHandler`

**Description:** Outbound failure events store up to 3500 characters of the incident payload in the event queue `parm2` field, accessible to admins and via reporting.

---

### L4 — LOW: Inactive Business Rule Would Cause Issues If Re-Enabled

**Component:** "Incident Updated Trigger to Ciroos" BR

**Description:** The inactive rule has no loop prevention, no retry logic, makes synchronous HTTP calls, and would create duplicate notifications alongside the active rule. It also logs full payloads via `gs.info()`.

---

### L5 — LOW: Global-Scoped Event Registration

**Component:** `ciroos.outbound.failed` event registration

**Description:** This event is registered in Global scope rather than the app scope. It would orphan if the app is uninstalled.

---

## Positive Security Findings

The following areas are implemented correctly:

- **No hardcoded credentials** — all credentials are dynamic
- **No SQL injection** — all database access uses parameterized `GlideRecord.addQuery()`
- **No eval() or dynamic code execution**
- **No gs.include()** — clean scoped app boundaries
- **XSS prevention** — UI pages use proper `escapeHtml()` / `ccEsc()` DOM text node sanitization
- **CSRF protection** — GlideAjax uses ServiceNow's built-in `sysparm_ck` token
- **REST authentication** — all REST operations have `requires_authentication=true` and `requires_snc_internal_role=true`
- **sys_id validation** — proper regex check `^[a-f0-9]{32}$` for sys_id parameters
- **Table-level ACLs** — all 4 CRUD operations covered on the config table
- **Retry logic with exponential backoff** — outbound handler has proper retry implementation

---

## Prioritized Remediation Roadmap

### Phase 1 — Immediate (Security-Critical)

1. **Add role checks to all methods in `CiroosIntegrationConfig`** — gate every method with `gs.hasRole('x_ciroo_ciroos_i_0.ciroos_integration_config_user')`
2. **Stop returning API token to the client** — mask or omit `ciroos_api_token` in all GlideAjax responses
3. **Change `ciroos_api_token` to `password2` type** — encrypt at rest, use `getDecryptedValue()` server-side
4. **Fix `testCiroosConnectivity()` SSRF** — accept config `sys_id` only, read URL server-side, validate HTTPS scheme
5. **Fix `syncConfigToCiroos()` SSRF** — same approach as above
6. **Fix `validateOrgId()`** — validate against stored organization ID

### Phase 2 — High Priority

7. **Filter outbound notifications** — only send Ciroos-originated incidents, not all incidents
8. **Create field-level ACL** on `ciroos_api_token` restricted to `admin`
9. **Set `write_roles`** on all system properties
10. **Sanitize error responses** — return generic messages, log details server-side
11. **Implement `u_*` field allowlist** — replace wildcard `u_` acceptance with explicit list
12. **Remove raw response bodies from work notes**

### Phase 3 — Hardening

13. **Move outbound HTTP calls to async** — use `executeAsync()` or async business rule
14. **Add `try/finally` to session flag management**
15. **Replace username prefix loop detection** with configurable service account check
16. **Add input validation** for incident field value types and ranges
17. **Set `enforce_acl` on individual REST operations**
18. **Implement soft-delete** for field config operations
19. **Delete or sanitize inactive business rule** to prevent accidental re-enablement

---

## Architecture Recommendations

1. **Use ServiceNow's Credential Store** — Replace the custom `ciroos_api_token` field with a Connection & Credential Alias (`sys_connection_alias`). This provides encrypted storage, rotation support, and MID server integration.

2. **Split `CiroosIntegrationConfig`** — Separate into:
   - A `client_callable=false` server-only Script Include for sensitive operations (save, token handling, connectivity tests)
   - A `client_callable=true` Script Include with role checks for safe UI operations (field metadata, config display)

3. **Use Event Queue for Outbound** — The app already has event registrations (`ciroos.outbound.send`) and a script action (`Ciroos - Outbound Sender`). Use the event queue pattern consistently instead of synchronous HTTP calls in `after` business rules. This provides better resilience, retry capability, and prevents user-facing latency.

4. **Add Application-Level Audit Logging** — Log all configuration changes, connectivity tests, and destructive operations to a custom log table or `syslog_app_scope` for compliance and forensic purposes.

5. **Consider OAuth 2.0** — Replace Bearer token authentication with OAuth 2.0 client credentials flow for both inbound and outbound, using ServiceNow's built-in OAuth provider/consumer capabilities.
