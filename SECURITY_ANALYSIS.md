# Ciroos Incident Management — Security & Logic Analysis

**Application:** Ciroos Incident Management (`x_ciroo_ciroos_i_0`)  
**Scope ID:** `051a81a993b372909d51afa877373c18`  
**Analysis Date:** 2026-04-06

---

## Executive Summary

This is a ServiceNow scoped application that provides a bidirectional integration between the **Ciroos** platform and **ServiceNow Incident Management**. The app exposes REST APIs for inbound incident creation/update, sends outbound notifications to Ciroos on incident changes, and provides a configuration UI (wizard + dashboard).

After a thorough review of all script includes, business rules, REST API operations, ACLs, UI pages, properties, roles, and scope privileges, I have identified **15 security findings** and **8 logic concerns** categorized by severity.

---

## Table of Contents

1. [CRITICAL — Security Findings](#1-critical--security-findings)
2. [HIGH — Security Findings](#2-high--security-findings)
3. [MEDIUM — Security & Logic Findings](#3-medium--security--logic-findings)
4. [LOW — Logic & Best Practice Findings](#4-low--logic--best-practice-findings)
5. [Component-Level Details](#5-component-level-details)
6. [Remediation Roadmap](#6-remediation-roadmap)

---

## 1. CRITICAL — Security Findings

### 1.1 API Token Stored in Plain Text (Credential Exposure)

**Component:** `CiroosIntegrationConfig` (Script Include), `ciroos_integration_config` table  
**Lines affected:** `saveConfig()`, `loadConfig()`, `getExistingConfig()`, `getConfigData()`

The Ciroos API token (`ciroos_api_token`) is stored as a regular **plain text string field** on the `x_ciroo_ciroos_i_0_ciroos_integration_config` table. This means:

- Any user with read access to the config table can view the token in clear text.
- The `loadConfig()` and `getExistingConfig()` GlideAjax methods return the raw token to the **client-side** browser.
- The token is transmitted in GlideAjax responses, visible in browser dev tools and network traffic.
- The `testCiroosConnectivity()` method receives the token as a **client-side parameter** (`sysparm_token`), meaning the token travels from client → server on each test call.

**Recommendation:**
- Store the API token using a **Credential** record (e.g., `discovery_credentials` or a custom encrypted field) or use **Connection & Credential Aliases** with OAuth/Basic auth profiles.
- Never return the full token to the client. Use a masked version (e.g., `****last4`) for display.
- When testing connectivity, read the token server-side from the credential store, not from the client parameter.

---

### 1.2 Weak Organization ID Validation (Broken Authentication on Field Config APIs)

**Component:** `CiroosFieldConfigHelper.validateOrgId()`, all `/field-config/*` REST operations  
**Line:** 6762–6764

```javascript
validateOrgId: function(requestOrgId) {
    return (requestOrgId && requestOrgId.trim().length > 0);
}
```

The `validateOrgId()` method only checks that the `x-organization-id` header is **non-empty**. It does **not** validate the value against any stored organization ID. Any caller who sends any non-empty string in this header passes validation, making this effectively a no-op security check.

The field-config API endpoints (`PUT /field-config`, `PUT /field-config/{name}`, `DELETE /field-config/{name}`, `GET /field-config`) all rely on this validation as their primary authorization gate beyond basic SN authentication.

**Recommendation:**
- Store the expected `org_id` (obtained during the connectivity test from the `/api/v1/health` response) in the config record.
- Validate the incoming `x-organization-id` header against the stored value.
- Return `403 Forbidden` on mismatch instead of `400`.

---

### 1.3 Client-Callable Script Include Exposes Sensitive Operations

**Component:** `CiroosIntegrationConfig` Script Include  
**Property:** `client_callable: true`

This script include extends `AbstractAjaxProcessor` and is marked **client-callable**. It exposes the following sensitive methods to any authenticated user with the app role via GlideAjax:

| Method | Risk |
|--------|------|
| `saveConfig()` | Writes API URL, token, fields, and strategy to config table |
| `loadConfig()` | Returns full config including plain-text API token |
| `getExistingConfig()` | Returns full config including plain-text API token |
| `getConfigData()` | Returns full config including plain-text API token |
| `testCiroosConnectivity()` | Makes outbound HTTP calls to arbitrary URLs with supplied tokens |
| `syncConfigToCiroos()` | Sends instance metadata to external endpoints |
| `getAssignmentGroups()` | Enumerates all assignment groups |
| `getIncidentFieldsAjax()` | Enumerates all incident fields from sys_dictionary |
| `getChoiceValues()` | Enumerates choice values for any incident field |

**Recommendation:**
- Implement explicit role checks (e.g., `x_ciroo_ciroos_i_0.admin`) at the start of each sensitive method using `gs.hasRole()`.
- Never return the raw API token in any client-facing response.
- Validate the `sysparm_url` parameter in `testCiroosConnectivity()` against an allowlist or URL pattern to prevent SSRF.

---

## 2. HIGH — Security Findings

### 2.1 Server-Side Request Forgery (SSRF) via Connectivity Test

**Component:** `CiroosIntegrationConfig.testCiroosConnectivity()`  
**Lines:** 8982–9033

The `testCiroosConnectivity()` method accepts an arbitrary URL from the client (`sysparm_url`) and makes an outbound HTTP GET request to `url + '/api/v1/health'`. A malicious user could supply internal network URLs (e.g., `http://169.254.169.254` for cloud metadata, or internal ServiceNow endpoints) to probe internal services.

**Recommendation:**
- Validate the URL against an allowlist of permitted Ciroos domains.
- At minimum, block RFC 1918 addresses, link-local addresses, and localhost.
- Consider using a **REST Message** record instead of ad-hoc `RESTMessageV2` calls so that MID server/proxy rules apply.

---

### 2.2 Missing `write` / `create` ACL Role Requirements on Config Table

**Component:** ACLs on `x_ciroo_ciroos_i_0_ciroos_integration_config`

The config table has the following ACLs:

| Operation | ACL Exists | Role Required |
|-----------|-----------|---------------|
| `read` | Yes | `ciroos_integration_config_user` |
| `write` | No explicit ACL found | — |
| `create` | No explicit ACL found | — |
| `delete` | Yes | Default (auto-generated) |

There is **no explicit `write` or `create` ACL** with a role requirement on the config table. Combined with the fact that the table's `sys_db_object` has `create_access: false` and `update_access: false` at the table level but `ws_access: true`, write operations through the REST API or GlideAjax (`saveConfig`) may bypass intended restrictions.

**Recommendation:**
- Create explicit `write` and `create` ACLs on the config table requiring `x_ciroo_ciroos_i_0.admin` role.
- Verify the table-level permissions align with the ACL strategy.

---

### 2.3 Business Rule Makes Synchronous Outbound REST Calls

**Component:** `Ciroos - Outbound Notification` (Business Rule, sys_id: `c9571925933772909d51afa877373c7f`)  
**When:** `after` (synchronous)

This business rule fires on **every incident insert, update, and delete** and makes synchronous outbound HTTP calls to the Ciroos API. This creates multiple risks:

1. **Performance/DoS:** Every incident save blocks until the HTTP call completes (up to 15-second timeout). Under load or if Ciroos is slow/down, this stalls the incident form for all users.
2. **Data loss:** If the HTTP call fails, the stamp-update re-queries and updates the same incident, potentially overwriting concurrent changes.
3. **Scope:** The BR fires for **ALL incidents** on insert (line 8657: `if (current.operation() === 'insert')`) — not just Ciroos-originated ones. This leaks every new incident to the external Ciroos platform.

**Recommendation:**
- Change the BR to `async` or use the existing event-queue pattern (`ciroos.outbound.send` event + Script Action) consistently.
- Only send outbound notifications for Ciroos-originated incidents (check `correlation_id` or source identifier).
- Consider using a Flow Designer or Scheduled Job for retry logic instead of blocking `gs.sleep()`.

---

### 2.4 Duplicate Outbound Logic — Two Competing Business Rules

**Component:** `Ciroos - Outbound Notification` (BR, after) AND `Incident Updated Trigger to Ciroos` (BR, async_always)

There are **two separate business rules** that both send outbound data to Ciroos:

1. **`Ciroos - Outbound Notification`** (after, fires on insert/update/delete) — line 8578
2. **`Incident Updated Trigger to Ciroos`** (async_always) — line 8054

Both construct a payload and call `sendPayload()` / direct REST call to the same Ciroos endpoint. This means:
- **Duplicate events** are sent to Ciroos for the same incident change.
- The async_always BR fires even when the "after" BR already sent the data.
- No coordination between the two to prevent double-posting.

**Recommendation:**
- Consolidate into a single outbound mechanism. The recommended pattern is: BR captures changes → fires event → Script Action sends payload using `CiroosOutboundHandler`.
- Disable or remove the redundant business rule.

---

### 2.5 Outbound BR Sends ALL Incidents (Data Leakage)

**Component:** `Ciroos - Outbound Notification` Business Rule  
**Line:** 8656–8667

```javascript
if (current.operation() === 'insert') {
    // Sends CREATED for ALL incidents, not just Ciroos ones
    sendPayload(createdPayload);
    return;
}
```

Unlike the other BRs that check `correlation_id` to filter for Ciroos-originated incidents, the outbound notification BR fires for **every** incident insert, including internally-created incidents, P1 incidents from other sources, HR incidents, etc. All of these get sent to the external Ciroos platform.

**Recommendation:**
- Add a filter condition: only fire when the incident has a Ciroos `correlation_id` or `contact_type` matching the configured source identifier.
- Alternatively, add a condition on the BR record itself to scope it to Ciroos incidents.

---

## 3. MEDIUM — Security & Logic Findings

### 3.1 No Input Sanitization on Inbound Payload Fields

**Component:** `CiroosInboundHandler.createIncident()`, `updateIncident()`  
**Lines:** 7346–7363 (`_applyFields`), 7230–7248 (`updateIncident`)

The inbound handler accepts payload values and writes them directly to incident fields using `gr.setValue(fn, payload[fn])`. There is no sanitization or validation of:

- HTML/script content in `short_description`, `description`, `work_notes`, `comments`
- Length constraints (the payload could send multi-MB strings)
- Type correctness (sending a string for a numeric field like `priority`)

While ServiceNow's GlideRecord provides some built-in protection, journal fields (`work_notes`, `comments`) can contain HTML that is rendered in the activity stream.

**Recommendation:**
- Validate field value types and lengths before calling `setValue()`.
- Strip or encode HTML in journal fields if cross-site scripting is a concern.
- Enforce maximum payload size in the REST API operation.

---

### 3.2 Unrestricted `u_` Custom Field Updates

**Component:** `CiroosInboundHandler._applyFields()` and `updateIncident()`  
**Lines:** 7359–7363, 7243–7248

```javascript
for (var key in payload) {
    if (key.indexOf('u_') === 0 && gr.isValidField(key)) {
        gr.setValue(key, payload[key]);
    }
}
```

Any custom field starting with `u_` on the incident table can be set by an inbound Ciroos payload. This is an open-ended write surface that could be abused to modify sensitive custom fields like `u_pii_data`, `u_financial_amount`, `u_approval_status`, etc.

**Recommendation:**
- Maintain an explicit allowlist of custom fields that Ciroos is permitted to set.
- Or, restrict to custom fields within the app's scope prefix (`x_ciroo_ciroos_i_0_u_*`).

---

### 3.3 Properties Have No `read_roles` or `write_roles`

**Component:** System Properties  
**Properties:** `ciroos.integration.enabled`, `ciroos.integration.debug`, `ciroos.integration.source_identifier`, `ciroos.integration.loop_prevention.field`, `ciroos.integration.outbound.retry_count`

All five system properties have empty `read_roles` and `write_roles`. This means any user with `admin` role can modify them (which is default), but more importantly, **any scoped app or integration user can read them**. The `debug` property when enabled causes verbose logging including incident data.

**Recommendation:**
- Set `write_roles` to `x_ciroo_ciroos_i_0.admin` on all Ciroos properties.
- Set `read_roles` as appropriate.

---

### 3.4 Module Links Have No Role Restrictions

**Component:** Application Modules (`sys_app_module`)

Several navigation modules have empty `roles` fields:

| Module | Link | Roles |
|--------|------|-------|
| Properties | `/sys_properties_list.do?sysparm_query=nameLIKEciroos` | (empty) |
| Events | `/sysevent_register_list.do?sysparm_query=event_nameLIKEciroos` | (empty) |
| Config Dashboard | Direct link | (empty) |

Without role restrictions, any authenticated user can navigate to these modules and see system properties, event registrations, etc.

**Recommendation:**
- Add `x_ciroo_ciroos_i_0.admin` or `x_ciroo_ciroos_i_0.user` role to all application modules.

---

### 3.5 Loop Prevention Relies Solely on Session Flags

**Component:** `CiroosUtils.isFromCiroos()`, `setInboundFlag()`, `clearInboundFlag()`  
**Lines:** 6295–6307

```javascript
isFromCiroos: function(incidentGR) {
    return gs.getSession().getClientData('ciroos_inbound_active') == 'true';
}
```

Loop prevention is implemented using session-level `clientData` flags. This approach has weaknesses:

1. **Race conditions:** If two concurrent requests process in the same session, flags can interfere.
2. **Not persistent:** If the session expires between flag set and clear, the flag is lost.
3. **Spoofable:** `clientData` can technically be set by client-side scripts via GlideAjax in some configurations.
4. **Cross-node issues:** In clustered SN environments, session affinity is not guaranteed.

**Recommendation:**
- Use a **correlation_id check** as the primary loop prevention mechanism (already partially implemented via the `contact_type` field).
- Set a dedicated scoped field (e.g., `x_ciroo_ciroos_i_0_u_last_sync_source`) on the incident to indicate "last updated by Ciroos."
- Keep session flags as a secondary guard.

---

### 3.6 `getConfigData()` Uses Wrong Field Names

**Component:** `CiroosIntegrationConfig.getConfigData()`  
**Lines:** 9045–9073

This method queries with `u_active` (should be `is_active`), reads `config_name` (should be `name`), and reads `u_mandatory_fields` (should be `mandatory_fields`). These field name mismatches mean this method likely returns empty/null data in production.

**Recommendation:**
- Align field names with the actual table schema: `is_active`, `name`, `mandatory_fields`.
- Consider removing this method if it duplicates `getExistingConfig()`.

---

## 4. LOW — Logic & Best Practice Findings

### 4.1 `autoSysFields(false)` Used Without Justification

**Component:** `CiroosOutboundHandler._stampIncident()`  
**Line:** 1186

```javascript
gr.autoSysFields(false);
```

This disables automatic `sys_updated_on` / `sys_updated_by` population on the stamp update. While this is presumably done to avoid triggering another outbound event based on `sys_updated_by`, it means the incident's audit trail will not reflect the sync timestamp accurately.

**Recommendation:**
- Document the reason for this call.
- If the goal is to prevent BR re-triggering, use the session flags (which are already set) and remove `autoSysFields(false)`.

---

### 4.2 `gs.sleep()` Used in Server-Side Scripts

**Component:** `CiroosOutboundHandler._sendToCiroos()`  
**Line:** 1297

```javascript
gs.sleep(this.BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
```

Using `gs.sleep()` blocks the current thread/transaction. In a Business Rule context, this holds a database transaction open. For async contexts (Script Action), it consumes a thread from the worker pool.

**Recommendation:**
- For retries, re-queue the event using `gs.eventQueue()` with a scheduled delay instead of blocking.
- Alternatively, use Flow Designer with retry capabilities.

---

### 4.3 Hardcoded Trigger Fields in Outbound BR

**Component:** `Ciroos - Outbound Notification` Business Rule  
**Line:** 8690

```javascript
var triggerFields = ['state', 'priority', 'urgency', 'impact', 'assigned_to', 'assignment_group', 'close_code'];
```

The trigger fields are hardcoded in the business rule rather than reading from the configured `update_trigger_fields` in the config table. This means configuration changes in the UI wizard have no effect on which fields trigger outbound notifications.

**Recommendation:**
- Read trigger fields from `config.update_trigger_fields` (which the config UI wizard saves).
- This is already correctly implemented in `CiroosUtils.shouldNotifyCiroos()` but not used in this BR.

---

### 4.4 Inconsistent Error Response Formats

**Component:** REST API operations

The incident APIs return errors in format:
```json
{ "success": false, "error": { "message": "...", "status": 400 } }
```

But the field-config APIs return errors in format:
```json
{ "status": "error", "message": "..." }
```

**Recommendation:**
- Standardize on a single error response schema across all API endpoints.

---

### 4.5 No Rate Limiting on Inbound APIs

**Component:** REST API operations for `Create Incident`, `Update Incident`

There is no rate limiting or throttling on the inbound REST APIs. A compromised Ciroos instance or attacker with valid credentials could flood the ServiceNow instance with incident creation requests.

**Recommendation:**
- Implement rate limiting using a counter in `sys_properties` or a lightweight cache table.
- Consider ServiceNow's built-in rate limiting capabilities for Scripted REST APIs.

---

### 4.6 Email Notification Subject Line Uses `current.variables.*`

**Component:** `Ciroos - Incident Created` Email Notification  
**Line:** 4358

```
Subject: Ciroos Alert: Incident ${current.variables.number} created — ${current.variables.short_description}
```

The `current.variables.*` syntax is for catalog variables, not incident fields. The correct syntax is `${number}` and `${short_description}`. This subject line will render with empty variable values.

**Recommendation:**
- Change to: `Ciroos Alert: Incident ${number} created — ${short_description}`

---

## 5. Component-Level Details

### 5.1 Roles Defined

| Role | Description | Elevated |
|------|-------------|----------|
| `x_ciroo_ciroos_i_0.admin` | Admin role | No |
| `x_ciroo_ciroos_i_0.user` | Default user role | No |
| `ciroos_integration_config_user` | Config table user role | No |

### 5.2 ACL Summary

| Table / Resource | Operation | Role | Type |
|-----------------|-----------|------|------|
| `ciroos_integration_config` | read | `ciroos_integration_config_user` | record |
| `ciroos_integration_config` | write | **(missing)** | — |
| `ciroos_integration_config` | create | **(missing)** | — |
| `ciroos_integration_config` | delete | (auto-generated, no role) | record |
| `ciroos_guided_setup` (UI Page) | read | (no role) | ui_page |
| `ConfigDashboard` (UI Page) | read | `itil` | ui_page |
| `ciroos_integration_config` (UI Page) | read | (no role) | ui_page |

### 5.3 REST API Endpoints

| Method | Path | Auth | ACL | Notes |
|--------|------|------|-----|-------|
| POST | `/incident` | Yes | Yes | Create incident |
| PUT | `/incident/{id}` | Yes | Yes | Update incident |
| GET | `/incident/{id}` | Yes | Yes | Get incident status |
| PUT | `/field-config` | Yes | Yes | Bulk replace field config |
| PUT | `/field-config/{name}` | Yes | Yes | Update single field config |
| DELETE | `/field-config/{name}` | Yes | Yes | Delete single field config |
| GET | `/field-config` | Yes | Yes | Get field config (presumed) |

All endpoints have `requires_authentication`, `requires_acl_authorization`, and `requires_snc_internal_role` set to `true`.

### 5.4 System Properties

| Property | Type | Default | read_roles | write_roles |
|----------|------|---------|------------|-------------|
| `ciroos.integration.enabled` | boolean | `true` | (empty) | (empty) |
| `ciroos.integration.debug` | boolean | `false` | (empty) | (empty) |
| `ciroos.integration.source_identifier` | string | `Ciroos` | (empty) | (empty) |
| `ciroos.integration.loop_prevention.field` | string | `correlation_id` | (empty) | (empty) |
| `ciroos.integration.outbound.retry_count` | integer | `3` | (empty) | (empty) |

---

## 6. Remediation Roadmap

### Phase 1 — Critical (Immediate)

| # | Finding | Action |
|---|---------|--------|
| 1.1 | Plain-text API token | Migrate to Credential / Connection Alias; mask in UI responses |
| 1.2 | Weak org ID validation | Validate against stored org ID from health check |
| 1.3 | Unguarded client-callable methods | Add `gs.hasRole()` checks; stop returning raw tokens |
| 2.5 | All incidents sent to Ciroos | Add filter for Ciroos-originated incidents only |

### Phase 2 — High (Next Sprint)

| # | Finding | Action |
|---|---------|--------|
| 2.1 | SSRF via connectivity test | Validate URLs; block internal addresses |
| 2.2 | Missing write/create ACLs | Create explicit ACLs with admin role |
| 2.3 | Synchronous outbound REST calls | Migrate to async event-based pattern |
| 2.4 | Duplicate outbound BRs | Consolidate to single mechanism |

### Phase 3 — Medium (Backlog)

| # | Finding | Action |
|---|---------|--------|
| 3.1 | No input sanitization | Add type/length/content validation |
| 3.2 | Unrestricted `u_` field writes | Implement explicit field allowlist |
| 3.3 | Unprotected properties | Add read/write roles |
| 3.4 | Unprotected modules | Add navigation role requirements |
| 3.5 | Session-only loop prevention | Add record-level source tracking |
| 3.6 | Wrong field names in `getConfigData()` | Fix field name mismatches |

### Phase 4 — Low (Housekeeping)

| # | Finding | Action |
|---|---------|--------|
| 4.1 | `autoSysFields(false)` | Document or remove |
| 4.2 | `gs.sleep()` in retries | Use event re-queue instead |
| 4.3 | Hardcoded trigger fields | Read from config table |
| 4.4 | Inconsistent error formats | Standardize API response schema |
| 4.5 | No rate limiting | Add request throttling |
| 4.6 | Email subject syntax | Fix `${current.variables.*}` to `${field}` |

---

*Analysis performed against the full application XML export (10,589 lines) covering all script includes, business rules, REST API operations, ACLs, UI pages, system properties, roles, events, email notifications, and scope privileges.*
