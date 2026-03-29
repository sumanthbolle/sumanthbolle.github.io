# ServiceNow Catalog Item + Integration Methods for Azure DevOps Project Onboarding

## 1) Catalog Item Definition (ServiceNow)

### 1.1 Catalog Metadata
- **Catalog**: Azure DevOps Services
- **Catalog Item Name**: Create Azure DevOps Project
- **Item Type**: Standard Request Item (RITM)
- **Audience**: Temasek + approved partner users
- **Fulfillment Group**: Cloud DevOps
- **Execution Model**: Approval-gated, fully automated

### 1.2 Variables (Form Fields)

#### A. Project Details
- `project_name` (String, Mandatory)
  - Regex: `^[a-z0-9][a-z0-9-]{2,63}$`
  - Must be unique in target ADO org
- `project_description` (Multi-line, Mandatory)
- `visibility` (Choice, Mandatory): `private | public`
- `process_template` (Choice, Mandatory): `Agile | Scrum | Basic`
- `business_justification` (Multi-line, Mandatory)

#### B. Access Provisioning
- `project_administrators` (List Collector or CSV, Mandatory)
- `contributors` (List Collector or CSV, Mandatory)
- `readers` (List Collector or CSV, Optional)
- Validation rule: identity email/domain must be from approved domains (example: `temasek.com`, `partner.com`)

#### C. Notifications
- `notify_requestor` (Boolean, default true)
- `notify_cloud_devops` (Boolean, default true)
- `cloud_devops_email_dl` (String, default distribution list)

### 1.3 UI Policies / Client Validation
- Show inline naming convention help for `project_name`.
- Block submission when mandatory role lists are empty.
- Client-side domain format check (server-side check still mandatory).

### 1.4 Server-Side Validation (Before Fulfillment)
- Enforce naming regex.
- Enforce approved domains.
- Confirm approval flags are `true`.
- Check idempotency (project exists already by same name).

---

## 2) Workflow (Flow Designer)

## 2.1 Linear Flow
1. **Trigger**: Catalog item submitted (RITM created).
2. **Step**: Validate payload (script action).
3. **Step**: Manager approval.
4. **Step**: Cloud DevOps approval.
5. **Step**: Invoke ADO provisioning integration.
6. **Step**: Update RITM work notes with execution details.
7. **Step**: Send email notifications (requestor + Cloud DevOps).
8. **Step**: Close task as success / failed / partial success.

## 2.2 Rejection Path
- Any rejection sets RITM state to `Closed Incomplete / Rejected`.
- Work note + email include rejection actor + reason.

---

## 3) Required Integration Methods (ServiceNow -> Azure DevOps)

## 3.1 Method A (Recommended): Outbound REST via ServiceNow Flow / Scripted Action

Use ServiceNow RESTMessageV2 (or IntegrationHub REST) to call Azure DevOps APIs directly.

### Authentication
- PAT stored in ServiceNow Credential / Connection Alias (never hardcoded).
- Header:
  - `Authorization: Basic base64(":"+PAT)`
  - `Content-Type: application/json`

### Required ADO APIs

#### A. Project Existence Check (Idempotency)
- `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1-preview.4&$top=1000`
- Compare `name` case-insensitively.
- If exists: skip creation and continue with role assignment reconciliation.

#### B. Project Creation
- `POST https://dev.azure.com/{org}/_apis/projects?api-version=7.1-preview.4`
- Body:
```json
{
  "name": "tmk-data-platform-demo",
  "description": "Project for onboarding",
  "visibility": "private",
  "capabilities": {
    "versioncontrol": { "sourceControlType": "Git" },
    "processTemplate": { "templateTypeId": "<process-template-guid>" }
  }
}
```

#### C. Provisioning Status Poll
- `GET https://dev.azure.com/{org}/_apis/projects/{projectId}?api-version=7.1-preview.4`
- Wait until state = `wellFormed`.

#### D. Resolve Project Security Groups
- `GET https://vssps.dev.azure.com/{org}/_apis/graph/groups?scopeDescriptor=scp.{projectId}&api-version=7.1-preview.1`
- Map roles by display name:
  - `Project Administrators`
  - `Contributors`
  - `Readers`

#### E. Resolve Identity Descriptors (Users/Groups)
- Prefer exact match by email/principalName using:
  - `GET https://vssps.dev.azure.com/{org}/_apis/graph/users?api-version=7.1-preview.1`
  - `GET https://vssps.dev.azure.com/{org}/_apis/graph/groups?api-version=7.1-preview.1`

#### F. Add Membership
- `PUT https://vssps.dev.azure.com/{org}/_apis/graph/memberships/{subjectDescriptor}/{containerDescriptor}?api-version=7.1-preview.1`
- Handle `409` as idempotent "already member".

## 3.2 Method B (Alternative): ServiceNow Scripted REST + External Worker

When outbound controls are strict:
1. ServiceNow Flow calls internal Scripted REST API.
2. External worker (Azure Function / automation runtime) receives request.
3. Worker executes ADO API sequence and posts result back.

Use this method if:
- PAT cannot be exposed to ServiceNow runtime directly.
- Enterprise network policy requires managed egress through approved integration layer.

## 3.3 Method C (Alternative): IntegrationHub Spoke (if licensed/available)

Implement custom ADO Spoke actions:
- `Create Project`
- `Check Project`
- `Assign Role Members`
- `Get Provisioning Status`

Use for low-code maintainability; internally still calls APIs listed in 3.1.

---

## 4) Process Template Mapping

Maintain in one config table/script include:

| Template | templateTypeId |
|---|---|
| Agile | `adcc42ab-9882-485e-a3ed-7678f01f66bc` |
| Scrum | `6b724908-ef14-45cf-84f8-768b5384da45` |
| Basic | Resolve dynamically from `/work/processes` and cache |

Recommended: call `GET /_apis/work/processes` at startup and cache by name to avoid hardcoding environment-specific values.

---

## 5) Request/Response Contract for Flow Steps

## 5.1 Payload Sent by ServiceNow
```json
{
  "requestNumber": "RITM0012345",
  "requestedBy": "john.doe@temasek.com",
  "project": {
    "name": "tmk-data-platform-demo",
    "description": "Project for onboarding",
    "visibility": "private",
    "processTemplate": "Agile"
  },
  "roleAssignments": {
    "projectAdministrators": ["devops-admins@temasek.com"],
    "contributors": ["dev-team@temasek.com"],
    "readers": ["audit-team@temasek.com"]
  },
  "approval": {
    "managerApproved": true,
    "platformApproved": true
  },
  "notification": {
    "requestorEmail": "john.doe@temasek.com",
    "platformEmail": "cloud.devops@temasek.com"
  }
}
```

## 5.2 Response Expected by ServiceNow
```json
{
  "status": "SUCCESS",
  "requestNumber": "RITM0012345",
  "project": {
    "name": "tmk-data-platform-demo",
    "id": "<ado-project-id>",
    "url": "https://dev.azure.com/<org>/tmk-data-platform-demo",
    "existed": false
  },
  "summary": {
    "assigned": 4,
    "skipped": 1,
    "failed": 0
  },
  "workNotes": [
    "...timestamped messages..."
  ],
  "errors": []
}
```

Allowed statuses:
- `SUCCESS`
- `PARTIAL_SUCCESS` (some role assignments failed)
- `FAILED`

---

## 6) Error Handling, Notifications, and Audit

## 6.1 Error Categories
- Validation errors (naming, missing approvals, bad domain)
- API/auth errors (401/403/5xx)
- Identity resolution errors
- Membership assignment errors

## 6.2 Work Notes Standard
Always append:
- request number
- project creation action + result
- role assignment summary by role
- final status and errors

## 6.3 Email Notifications
- **Requestor**: success/failure with project URL or rejection/failure reason
- **Cloud DevOps**: full technical summary + retry guidance

## 6.4 Auditability
- Keep full RITM history (approvals + transitions)
- Store structured execution JSON in attachment or integration log table
- Do not log PAT or sensitive headers

---

## 7) Security Controls

- PAT in encrypted credential store only
- least privilege PAT scope (project + graph membership management only)
- approved-domain allowlist enforced server-side
- strict input validation and output sanitization
- optional rate limiting and retry with exponential backoff

---

## 8) Idempotency Rules

1. If project exists by same name, **do not create duplicate**.
2. Membership add returning conflict/already exists => **idempotent skip**.
3. Retries on transient API failures only (`429`, `5xx`, timeout).
4. Re-run same RITM safely (same outcome without duplicates).

