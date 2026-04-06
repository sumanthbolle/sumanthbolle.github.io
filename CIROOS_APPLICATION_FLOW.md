# Ciroos Incident Management — Application Flow

## What This App Does

This is a **bidirectional incident integration** between ServiceNow and an external platform called **Ciroos**. The Ciroos platform detects incidents (likely via monitoring/observability tooling) and pushes them into ServiceNow for ITSM workflow. When ServiceNow agents work on those incidents, updates flow back out to Ciroos so both systems stay in sync.

---

## High-Level Architecture

```
┌──────────────────────┐                           ┌──────────────────────┐
│                      │    Inbound REST API        │                      │
│   Ciroos Platform    │ ────────────────────────►  │     ServiceNow       │
│   (External)         │  POST /incident            │                      │
│                      │  PUT  /incident/{id}       │  ┌────────────────┐  │
│                      │  GET  /incident/{id}       │  │   Incident      │  │
│                      │                            │  │   Table         │  │
│                      │  PUT  /field-config         │  └────────────────┘  │
│                      │  GET  /field-config         │                      │
│                      │  DELETE /field-config       │  ┌────────────────┐  │
│                      │                            │  │  Config Table   │  │
│                      │    Outbound REST            │  │  (API URL,     │  │
│                      │ ◄────────────────────────  │  │   Token, etc.) │  │
│                      │  POST /incident/events     │  └────────────────┘  │
│                      │  (CREATED/UPDATED/         │                      │
│                      │   DELETED/JOURNAL_ENTRY)   │  ┌────────────────┐  │
│                      │                            │  │  Admin UI      │  │
│                      │                            │  │  (Config       │  │
│                      │                            │  │   Wizard)      │  │
└──────────────────────┘                            │  └────────────────┘  │
                                                    └──────────────────────┘
```

---

## The Three Data Flows

### Flow 1: Inbound (Ciroos → ServiceNow)

**When:** Ciroos detects an incident and sends it to ServiceNow, or sends updates to an existing one.

```
Ciroos Platform
    │
    │  POST /api/x_ciroo_ciroos_i_0/ciroos_incident_api/incident
    │  (Basic Auth via svc_ciroos service account)
    │  Body: { short_description, priority, ciroos_incident_id, ... }
    ▼
┌─────────────────────────┐
│ Scripted REST API       │  requires_authentication = true
│ "Create Incident"       │  requires_snc_internal_role = true
│ (sys_ws_operation)      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ CiroosInboundHandler    │  Script Include
│ .createIncident()       │
│                         │
│  1. Check integration   │  ← CiroosUtils.isEnabled()
│     enabled             │    reads sys_property: ciroos.integration.enabled
│                         │
│  2. Load active config  │  ← CiroosUtils.getActiveConfig()
│                         │    reads from: x_ciroo_ciroos_i_0_ciroos_integration_config
│                         │    gets: mandatory_fields, assignment_strategy, etc.
│                         │
│  3. Validate mandatory  │  ← _validateMandatory()
│     fields              │    checks payload has all required fields
│                         │    or defaults are configured
│                         │
│  4. Set loop prevention │  ← CiroosUtils.setInboundFlag()
│     flag                │    session flag: ciroos_inbound_active = true
│                         │
│  5. Set correlation_id  │  ← payload.ciroos_incident_id → incident.correlation_id
│     (bidirectional key) │    This links SN incident ↔ Ciroos incident
│                         │
│  6. Set contact_type    │  ← "Ciroos" (from sys_property source_identifier)
│                         │    Tags the incident as Ciroos-originated
│                         │
│  7. Apply payload       │  ← _applyFields(): short_description, priority, etc.
│     fields              │    Only allows safeFields + explicit u_ allowlist
│                         │
│  8. Apply defaults      │  ← _applyDefaults(): fills empty mandatory fields
│     for missing fields  │    with values from config.mandatory_fields[].default_value
│                         │
│  9. Apply assignment    │  ← _applyAssignment()
│     strategy            │    "static" → sets specific assignment_group
│                         │    "auto_route" → leaves empty for SN rules
│                         │
│ 10. gr.insert()         │  → Creates the incident record
│                         │
│ 11. Fire event          │  → gs.eventQueue('ciroos.incident.created', ...)
│                         │
│ 12. Clear loop flag     │  ← CiroosUtils.clearInboundFlag() (in finally block)
│                         │
│ 13. Return 201 +        │  → { sys_id, number, state, assigned_to, ... }
│     incident details    │
└─────────────────────────┘
             │
             │ insert triggers...
             ▼
┌─────────────────────────────────────────────────┐
│ Business Rules on incident (before insert):     │
│                                                 │
│  1. "Ciroos - Apply Assignment Strategy"        │
│      order=50, checks correlation_id present,   │
│      applies static group or leaves for SN      │
│                                                 │
│  2. "Ciroos - Apply Default Values"             │
│      order=100, checks correlation_id present,  │
│      fills empty mandatory fields with defaults │
└─────────────────────────────────────────────────┘
```

**Update flow** is similar — `PUT /incident/{id}` → `CiroosInboundHandler.updateIncident()` — but locates the existing incident by sys_id or correlation_id, validates it's not closed/resolved, and only updates allowed fields.

---

### Flow 2: Outbound (ServiceNow → Ciroos)

**When:** A ServiceNow agent (or automation) updates an incident that was originally created by Ciroos.

```
Agent updates incident in ServiceNow
(e.g., changes state, adds work note, reassigns)
    │
    ▼
┌───────────────────────────────────────────────────┐
│ Business Rule: "Ciroos - Loop Prevention Guard"   │
│ (before, update, order=10)                        │
│                                                   │
│  Checks if sys_updated_by matches the Ciroos      │
│  service account name. If yes, sets session flag   │
│  ciroos_inbound_active = true to prevent echo.    │
└────────────────────┬──────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────┐
│ Business Rule: "Ciroos - Outbound Notification"   │
│ (after, insert+update, order=900)                 │
│                                                   │
│  Guard checks:                                    │
│    ✗ ciroos_stamp_update == true? → skip          │
│    ✗ ciroos_inbound_update == true? → skip        │
│    ✗ integration disabled? → skip                 │
│    ✗ no config / missing URL/token? → skip        │
│    ✗ not a Ciroos-originated incident? → skip     │
│      (checks correlation_id or contact_type)      │
│                                                   │
│  If all guards pass:                              │
│                                                   │
│  INSERT → build CREATED payload                   │
│  UPDATE → check which trigger fields changed      │
│           build UPDATED payload (changes array)   │
│           + check journal fields (work_notes,     │
│             comments, close_notes) for             │
│             JOURNAL_ENTRY payloads                 │
│                                                   │
│  Send each payload via sendPayload():             │
└────────────────────┬──────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────┐
│ sendPayload() — inside the Business Rule          │
│                                                   │
│  1. RESTMessageV2 → POST to:                     │
│     {ciroos_api_url}/api/v1/servicenow/           │
│     incident/events                               │
│     Authorization: Bearer {ciroos_api_token}      │
│                                                   │
│  2. Payload structure:                            │
│     {                                             │
│       event_type: "CREATED"|"UPDATED"|            │
│                   "DELETED"|"JOURNAL_ENTRY",      │
│       incident_sys_id: "...",                     │
│       incident_number: "INC0012345",              │
│       timestamp: "2026-04-06T12:00:00Z",          │
│       data: { short_description, state, ... }     │
│       // or: changes: [ { field, old, new } ]     │
│       // or: journal: { element, value, added_by }│
│     }                                             │
│                                                   │
│  3. After send → stamp work note on incident:     │
│     "══ Ciroos Sync: UPDATED ══"                  │
│     + set u_ciroos_sync_status = synced|failed    │
│                                                   │
│  4. Session flags prevent re-trigger:             │
│     ciroos_stamp_update + ciroos_inbound_update   │
│     set to "true" before update, cleared in       │
│     finally block                                 │
└───────────────────────────────────────────────────┘
                     │
                     ▼
             Ciroos Platform receives the event
             and updates its own incident record
```

**There is also an alternative outbound path** via the Event Queue + Script Action:
- The outbound BR (or handler code) can fire `gs.eventQueue('ciroos.outbound.send', ...)`
- The **Script Action** "Ciroos - Outbound Sender" picks this up asynchronously
- It dispatches to `CiroosOutboundHandler.sendCreated()`, `.sendUpdatedFromEvent()`, `.sendJournalEntryFromEvent()`, or `.sendDeleted()`
- `CiroosOutboundHandler._sendToCiroos()` handles the actual REST call with retry logic (exponential backoff, up to 3 attempts)
- On final failure → fires `ciroos.outbound.failed` event → triggers email notification "Ciroos - Outbound Delivery Failed" to admins

---

### Flow 3: Configuration & Admin Setup

**When:** An admin sets up the integration for the first time or modifies settings.

```
Admin opens Ciroos menu in ServiceNow
    │
    ├── "Integration Config" module
    │     → x_ciroo_ciroos_i_0_ciroos_integration_config.do (UI Page)
    │
    ├── "Guided Setup" module
    │     → x_ciroo_ciroos_i_0_CiroosGuidedSetup.do (6-step wizard)
    │
    └── "Dashboard" module
          → x_ciroo_ciroos_i_0_ConfigDashboard.do (status overview)
```

**Main Config Wizard Flow (`ciroos_integration_config.do`):**

```
┌─────────────────────────────────────────────────────┐
│  Config Wizard UI Page (client-side JavaScript)     │
│                                                     │
│  On Load:                                           │
│    1. GlideAjax → CiroosIntegrationConfig           │
│       .getExistingConfig()                          │
│       Returns: URL, masked token, mandatory_fields, │
│                assignment_strategy, etc.             │
│                                                     │
│  Tab 1 — Connection:                                │
│    • Enter Ciroos API URL (https://...)              │
│    • Enter API Bearer Token                         │
│    • "Test Connection" button →                     │
│        GlideAjax → .testCiroosConnectivity()        │
│        (reads URL/token from saved config server-   │
│         side, calls Ciroos /api/v1/health)           │
│        Returns: org_name, instance_id               │
│                                                     │
│  Tab 2 — Inbound Setup:                             │
│    • Shows ServiceNow REST API endpoint URL         │
│    • Service account (svc_ciroos) setup guide       │
│    • Basic Auth credentials for Ciroos to use       │
│                                                     │
│  Tab 3 — Incident Fields:                           │
│    • GlideAjax → .getIncidentFieldsAjax()           │
│      Lists all incident table fields                │
│    • Admin selects mandatory fields                 │
│    • Admin sets default values per field             │
│    • GlideAjax → .getChoiceValues(field)            │
│      Gets dropdown options for choice fields        │
│                                                     │
│  Tab 4 — Assignment:                                │
│    • Strategy: "Auto-Route" or "Static"             │
│    • If Static → search assignment groups           │
│      GlideAjax → .getAssignmentGroups(search)       │
│                                                     │
│  Tab 5 — Triggers:                                  │
│    • Select which field changes trigger outbound    │
│      notifications (state, priority, etc.)          │
│    • Configure conditions for triggering            │
│                                                     │
│  Tab 6 — Review & Save:                             │
│    • Summary of all settings                        │
│    • "Save" → GlideAjax → .saveConfig()             │
│      Writes to config table                         │
│    • "Save & Sync" → saves, then                    │
│      GlideAjax → .syncConfigToCiroos()              │
│      POSTs metadata to Ciroos so it knows:          │
│        - SN instance URL                            │
│        - Mandatory fields                           │
│        - Assignment strategy                        │
└─────────────────────────────────────────────────────┘
```

**Field Config REST API (Ciroos → ServiceNow):**

The Ciroos platform can also manage field configuration remotely via REST:
```
GET    /field-config              → List all configured fields
PUT    /field-config              → Bulk replace all field configs
PUT    /field-config/{name}       → Update/add a single field config
DELETE /field-config/{name}       → Remove a single field config
DELETE /field-config              → Clear all field configs

All require: x-organization-id header + Basic Auth
```

---

## Loop Prevention Architecture

Preventing infinite ping-pong between Ciroos and ServiceNow is critical:

```
Ciroos sends update → SN creates/updates incident
                          │
                          ├── Before BR: "Loop Prevention Guard"
                          │   Detects svc_ciroos username → sets
                          │   ciroos_inbound_active = true
                          │
                          ├── After BR: "Outbound Notification"
                          │   Checks ciroos_inbound_update flag → TRUE
                          │   → SKIPS outbound (breaks the loop)
                          │
                          ├── CiroosInboundHandler sets flag BEFORE
                          │   insert/update, clears AFTER in finally
                          │
                          └── CiroosOutboundHandler._stampIncident()
                              sets ciroos_stamp_update before work note
                              update, clears in finally block
```

**Three layers of loop prevention:**
1. **Session flag `ciroos_inbound_active`** — set by InboundHandler and Loop Prevention Guard BR
2. **Session flag `ciroos_stamp_update`** — set during work note stamping to prevent outbound BR from re-firing
3. **Session flag `ciroos_inbound_update`** — additional guard flag

---

## Component Inventory

| Component | Type | Purpose |
|-----------|------|---------|
| `CiroosUtils` | Script Include | Config reader, loop flags, field change detection, logging |
| `CiroosInboundHandler` | Script Include | Creates/updates/reads incidents from Ciroos payloads |
| `CiroosOutboundHandler` | Script Include | Sends incident events to Ciroos with retry logic |
| `CiroosFieldConfigHelper` | Script Include | CRUD for mandatory field configuration |
| `CiroosIntegrationConfig` | Script Include (client-callable) | UI backend: GlideAjax handler for config wizard |
| `Ciroos Incident API` | Scripted REST API (8 operations) | Inbound REST endpoints for Ciroos |
| `Ciroos - Loop Prevention Guard` | Business Rule (before, update) | Detects Ciroos service account, sets flag |
| `Ciroos - Apply Assignment Strategy` | Business Rule (before, insert) | Applies static/auto-route assignment |
| `Ciroos - Apply Default Values` | Business Rule (before, insert) | Fills empty mandatory fields with defaults |
| `Ciroos - Outbound Notification` | Business Rule (after, insert+update) | Sends events to Ciroos when incidents change |
| `Ciroos - Outbound Sender` | Script Action | Async dispatcher for outbound events |
| `ciroos_integration_config` | UI Page | Main configuration wizard |
| `CiroosGuidedSetup` | UI Page | 6-step onboarding wizard |
| `ConfigDashboard` | UI Page | Configuration status overview |
| `Ciroos - Outbound Delivery Failed` | Email Notification | Alerts admins on delivery failure |
| `ciroos_integration_config` | Custom Table | Stores API URL, token, field config, assignment strategy |
| `u_ciroos_sync_status` | Custom Field (on incident) | Tracks sync status: synced/failed |

---

## Custom Table Schema

**`x_ciroo_ciroos_i_0_ciroos_integration_config`**

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string(40) | Config profile name (e.g., "Default") |
| `ciroos_api_url` | string(300) | Ciroos platform API base URL |
| `ciroos_api_token` | password2(1000) | Bearer token for outbound auth (encrypted after fix) |
| `is_active` | boolean | Only one config should be active |
| `assignment_group` | reference(sys_user_group) | Static assignment group (if strategy=static) |
| `assignment_strategy` | choice | "auto_route" or "static" |
| `mandatory_fields` | string(4000) | JSON array of field configs with defaults |
| `update_trigger_fields` | string(8000) | JSON array of field names that trigger outbound |
| `field_mapping` | string(8000) | Custom field mappings |

---

## Authentication Model

| Direction | Method | Details |
|-----------|--------|---------|
| **Inbound** (Ciroos → SN) | Basic Auth | Service account `svc_ciroos` with SN credentials. Enforced by `requires_authentication=true` on all REST operations. |
| **Outbound** (SN → Ciroos) | Bearer Token | `Authorization: Bearer {ciroos_api_token}` header. Token stored in config table (encrypted as `password2` after fix). |
| **Admin UI** | Session + Role | ServiceNow session auth. Config operations require `ciroos_integration_config_user` role (enforced after fix). |
