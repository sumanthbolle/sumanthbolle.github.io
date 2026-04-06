# Temasek – AWS Innovation Sandbox Catalog (ServiceNow + ISB)

End-to-end implementation of a ServiceNow catalog item that integrates with [Innovation Sandbox on AWS](https://github.com/aws-solutions/innovation-sandbox-on-aws) APIs to automatically assign and release sandbox accounts.

## What This Does

Replaces the existing **Terraform – Create AWS Sandbox Account** catalog item with an API-driven workflow:

1. User fills out a form and submits a request (Assign or Release)
2. Request goes through the same approval chain (Manager + Group approval)
3. Once approved, ServiceNow orchestrates three API calls in sequence:
   - **API 1**: Trigger AWS Lambda start script and update S3 bucket configuration
   - **IDC API**: Add user to `temaisb_UserGroup` in IAM Identity Center
   - **API 2**: Create a lease in the ISB platform (assign sandbox)
4. ServiceNow polls until the sandbox is active, retrieves the login URL, and notifies the user

## Repository Structure

```
servicenow-isb-catalog/
├── snow/                              # ServiceNow artifacts
│   ├── catalog/
│   │   ├── catalog_item_definition.xml    # Catalog item metadata
│   │   ├── catalog_variables.xml          # Form fields definition
│   │   ├── catalog_client_script.js       # onChange: toggle fields by request type
│   │   ├── catalog_onsubmit_script.js     # onSubmit: form validation
│   │   ├── notification_templates.xml     # Email notification templates
│   │   └── system_properties.xml          # System properties for API config
│   ├── flows/
│   │   ├── ISB_Sandbox_Provision_Flow.js  # Main Flow Designer flow
│   │   ├── ISB_Sandbox_Assign_Subflow.js  # Subflow: assign sandbox
│   │   └── ISB_Sandbox_Release_Subflow.js # Subflow: release sandbox
│   ├── script-includes/
│   │   ├── ISBApiClient.js                # Core ISB API client (auth, lease CRUD)
│   │   ├── ISBUserGroupManager.js         # IDC group management client
│   │   ├── ISBLambdaStartManager.js       # Lambda start/stop script client
│   │   ├── ISBSandboxOrchestrator.js      # Master orchestrator (assign/release)
│   │   └── ISBSandboxStatusAjax.js        # AJAX endpoint for status UI
│   ├── rest-messages/
│   │   └── isb_rest_message.xml           # REST Message definitions (3 APIs)
│   ├── scheduled-jobs/
│   │   └── ISB_Lease_Expiry_Monitor.js    # Scheduled job: expiry notifications
│   └── ui-pages/
│       └── isb_sandbox_status.xml         # UI page: sandbox status lookup
├── aws/
│   └── lambda/
│       └── isb-user-group-manager/
│           ├── index.py                   # Lambda function code
│           ├── requirements.txt           # Python dependencies
│           └── template.yaml              # SAM template (Lambda + API Gateway)
└── docs/
    └── DEPLOYMENT_GUIDE.md                # Step-by-step deployment instructions
```

## Key Components

### ServiceNow Script Includes

| Script Include | Purpose |
|---|---|
| **ISBApiClient** | Handles ISB API authentication (with token caching), lease creation, retrieval, termination, and status polling |
| **ISBUserGroupManager** | Calls the IDC Lambda to add/remove users from `temaisb_UserGroup` |
| **ISBLambdaStartManager** | Triggers the Lambda start/stop script and S3 bucket updates |
| **ISBSandboxOrchestrator** | Coordinates the full provisioning pipeline: Lambda → IDC → ISB → Poll → Notify |
| **ISBSandboxStatusAjax** | Client-callable AJAX endpoint for the status lookup UI page |

### AWS Lambda

The **isb-user-group-manager** Lambda function manages IAM Identity Center group membership:
- `POST /user-group/add` – Add user to group (idempotent)
- `POST /user-group/remove` – Remove user from group

Deployed via AWS SAM with API Gateway and API key authentication.

### ISB API Integration

Integrates with the [Innovation Sandbox on AWS OpenAPI spec](https://github.com/aws-solutions/innovation-sandbox-on-aws/blob/main/docs/openapi/innovation-sandbox-api.yaml):
- `POST /leases` – Create a new lease (assign sandbox)
- `GET /leases/{leaseId}` – Check lease status
- `POST /leases/{leaseId}/terminate` – Release a sandbox
- `GET /configurations` – Retrieve login URLs and system config

## Quick Start

See the full [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) for step-by-step instructions.

### TL;DR

1. Deploy the IDC Lambda: `cd aws/lambda/isb-user-group-manager && sam build && sam deploy --guided`
2. Configure ServiceNow system properties with API URLs and keys
3. Create REST Messages, Script Includes, and Flow in ServiceNow
4. Create the catalog item with form variables
5. Test with a sample request

## Approval Flow

The approval chain mirrors the existing Terraform catalog:
- **Manager Approval**: Requested-for user's manager
- **Group Approval**: Cloud Platform Approvers group
- Both approvals required before provisioning begins

## Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Request Type | Select | Yes | Assign / Release |
| Requested For | Reference | Yes | Defaults to current user |
| Requester Email | Email | Yes | Must match IDC identity |
| Department | Text | Yes | Auto-populated |
| Cost Center | Text | Yes | For billing |
| Lease Template UUID | Text | Yes (Assign) | ISB lease template ID |
| Sandbox Duration | Select | Yes (Assign) | 8h to 30 days |
| Maximum Budget (USD) | Numeric | Yes (Assign) | $10 – $1,000 |
| Preferred AWS Region | Select | Yes (Assign) | ap-southeast-1 default |
| Cost Report Group | Text | No | For cost allocation |
| Existing Lease ID | Text | Yes (Release) | Lease to terminate |
| Business Justification | Multi-line | Yes | Minimum 20 characters |
| Project Name | Text | Yes | Initiative name |
| Start Date/Time | DateTime | No | Leave blank for immediate |
| Accept Terms | Checkbox | Yes | Must accept ToS |
