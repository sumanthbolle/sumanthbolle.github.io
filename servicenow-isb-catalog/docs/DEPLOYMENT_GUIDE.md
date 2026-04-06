# Temasek – AWS Innovation Sandbox Catalog: Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [AWS Infrastructure Setup](#aws-infrastructure-setup)
5. [ServiceNow Configuration](#servicenow-configuration)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This catalog item replaces the existing **Terraform – Create AWS Sandbox Account** catalog and provides an automated, API-driven workflow to:

- **Assign** a new AWS Innovation Sandbox to a user
- **Release** an existing sandbox when no longer needed

### End-to-End Flow

```
User submits form → RITM created → Manager + Group Approval
    → Approved?
        ├── Yes → API 1: Trigger Lambda start script & update S3
        │       → Add user to temaisb_UserGroup (IDC)
        │       → API 2: Create ISB lease (assign sandbox)
        │       → Poll until Active
        │       → Return login URL & details to user
        │       → Close RITM
        └── No  → Close RITM as rejected
```

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────────┐
│  ServiceNow  │────▶│  API Gateway     │────▶│  Lambda: Start Script  │
│  Catalog     │     │  (Lambda Start)  │     │  + S3 Bucket Update    │
│  + Flow      │     └──────────────────┘     └────────────────────────┘
│  Designer    │
│              │     ┌──────────────────┐     ┌────────────────────────┐
│              │────▶│  API Gateway     │────▶│  Lambda: User Group    │
│              │     │  (IDC Lambda)    │     │  Manager (IDC)         │
│              │     └──────────────────┘     └────────────────────────┘
│              │
│              │     ┌──────────────────┐     ┌────────────────────────┐
│              │────▶│  ISB API Gateway │────▶│  Innovation Sandbox    │
│              │     │  (ISB Solution)  │     │  on AWS Solution       │
└──────────────┘     └──────────────────┘     └────────────────────────┘
```

---

## Prerequisites

### AWS Side
- Innovation Sandbox on AWS solution deployed and operational
- IAM Identity Center (IDC) configured with `temaisb_UserGroup` group created
- AWS SAM CLI installed for Lambda deployment
- Appropriate IAM permissions for deployment

### ServiceNow Side
- Admin access to the ServiceNow instance
- Flow Designer enabled
- REST Message plugin available
- Existing "Terraform – Create AWS Sandbox Account" catalog (for reference/migration)

---

## AWS Infrastructure Setup

### Step 1: Deploy the IDC User Group Manager Lambda

```bash
cd aws/lambda/isb-user-group-manager

# Build and deploy with SAM
sam build
sam deploy --guided \
  --stack-name isb-user-group-manager \
  --parameter-overrides \
    IdentityStoreId=d-XXXXXXXXXX \
    GroupName=temaisb_UserGroup \
  --capabilities CAPABILITY_IAM
```

After deployment, note the outputs:
- **ApiUrl** – Set this as `x_tema_isb.idc_lambda_api_url` in ServiceNow
- **ApiKeyId** – Retrieve the actual key value:
  ```bash
  aws apigateway get-api-keys --include-values --query "items[?id=='<ApiKeyId>'].value"
  ```

### Step 2: Create/Confirm the temaisb_UserGroup in IAM Identity Center

If the group doesn't exist yet:

```bash
aws identitystore create-group \
  --identity-store-id d-XXXXXXXXXX \
  --display-name temaisb_UserGroup \
  --description "Innovation Sandbox users group"
```

### Step 3: Note ISB API Details

From your Innovation Sandbox on AWS deployment, gather:
- **API Base URL** (API Gateway endpoint)
- **Authentication credentials** (client ID / secret or API key)
- **Lease Template UUIDs** available for users

---

## ServiceNow Configuration

### Step 1: Create System Properties

Navigate to **System Properties > All Properties** and create each property listed in `snow/catalog/system_properties.xml`:

| Property | Description | Type |
|----------|-------------|------|
| `x_tema_isb.api_base_url` | ISB API Gateway base URL | String |
| `x_tema_isb.api_client_id` | OAuth Client ID | String |
| `x_tema_isb.api_client_secret` | OAuth Client Secret | Password |
| `x_tema_isb.idc_lambda_api_url` | IDC Lambda API Gateway URL | String |
| `x_tema_isb.idc_api_key` | IDC Lambda API Key | Password |
| `x_tema_isb.identity_store_id` | Identity Store ID | String |
| `x_tema_isb.lambda_start_api_url` | Lambda Start Script API URL | String |
| `x_tema_isb.lambda_api_key` | Lambda Start API Key | Password |
| `x_tema_isb.s3_bucket_name` | S3 Configuration Bucket | String |

### Step 2: Create REST Messages

Navigate to **System Web Services > Outbound > REST Message** and create:

1. **ISB_Sandbox_API** – As defined in `snow/rest-messages/isb_rest_message.xml`
   - Create each HTTP Method (Authenticate, CreateLease, GetLease, TerminateLease, etc.)
   - Use variable substitution `${variable_name}` for parameterized values

2. **ISB_IDC_UserGroup_API** – For the IDC Lambda integration
3. **ISB_Lambda_Start_Script** – For the Lambda start/stop trigger

### Step 3: Create Script Includes

Navigate to **System Definition > Script Includes** and create:

| Script Include | Client Callable | Description |
|----------------|-----------------|-------------|
| `ISBApiClient` | No | Core ISB API client with auth, lease CRUD, polling |
| `ISBUserGroupManager` | No | IDC user group add/remove operations |
| `ISBLambdaStartManager` | No | Lambda start script trigger |
| `ISBSandboxOrchestrator` | No | Master orchestrator coordinating all API calls |
| `ISBSandboxStatusAjax` | Yes | AJAX endpoint for status lookup UI |

### Step 4: Create the Catalog Item

Navigate to **Service Catalog > Catalog Definitions > Maintain Items > New**:

1. **Name**: `Temasek – AWS Innovation Sandbox Account (Assign / Release)`
2. **Category**: Cloud Services
3. **Short Description**: Request assignment or release of an AWS Innovation Sandbox account
4. **Variables**: Create all variables from `snow/catalog/catalog_variables.xml`
5. **Client Scripts**: Add both onChange and onSubmit scripts from `snow/catalog/`

### Step 5: Add Custom Fields to sc_req_item

Add two custom fields to the `sc_req_item` table:

| Column Name | Type | Label |
|-------------|------|-------|
| `u_isb_lease_id` | String (200) | ISB Lease ID |
| `u_aws_account_id` | String (20) | AWS Account ID |

### Step 6: Create the Flow

In **Flow Designer**, create:

1. **Main Flow**: `ISB Sandbox Provision Flow` (see `snow/flows/ISB_Sandbox_Provision_Flow.js`)
   - Trigger: Service Catalog
   - Associate with the catalog item
2. **Subflow**: `ISB Sandbox Assign Subflow` (see `snow/flows/ISB_Sandbox_Assign_Subflow.js`)
3. **Subflow**: `ISB Sandbox Release Subflow` (see `snow/flows/ISB_Sandbox_Release_Subflow.js`)

#### Approval Configuration

The approval step should mirror the existing **Terraform – Create AWS Sandbox Account** catalog:
- **Group Approval**: Cloud Platform Approvers (or your equivalent group)
- **Manager Approval**: Requested for user's manager
- Both must approve before provisioning proceeds

### Step 7: Register Events

Navigate to **System Policy > Events > Registry** and create:

| Event Name | Table | Description |
|------------|-------|-------------|
| `x_tema_isb.sandbox_provisioned` | sc_req_item | Fired when sandbox is assigned |
| `x_tema_isb.sandbox_expiry_warning` | – | Fired by scheduled job for expiry warnings |
| `x_tema_isb.sandbox_released` | sc_req_item | Fired when sandbox is released |

### Step 8: Create Notifications

Navigate to **System Notification > Email > Notifications** and create the notification templates from `snow/catalog/notification_templates.xml`.

### Step 9: Create Scheduled Job

Navigate to **System Definition > Scheduled Jobs > New**:
- **Name**: ISB Lease Expiry Monitor
- **Run**: Every 4 hours
- **Script**: Content from `snow/scheduled-jobs/ISB_Lease_Expiry_Monitor.js`

### Step 10: Create UI Page (Optional)

Navigate to **System UI > UI Pages** and create the status lookup page from `snow/ui-pages/isb_sandbox_status.xml`.

---

## Testing

### Unit Test Checklist

1. **System Properties**: Verify all properties are set correctly
   ```
   gs.getProperty('x_tema_isb.api_base_url')
   ```

2. **REST Message Test**: Use the REST Message "Test" button for each HTTP Method

3. **Script Include Test**: Run in Background Scripts:
   ```javascript
   var client = new ISBApiClient();
   var token = client.getAuthToken();
   gs.info('Token obtained: ' + (token ? 'Yes' : 'No'));
   
   var config = client.getConfiguration();
   gs.info('Config: ' + JSON.stringify(config));
   ```

4. **IDC Lambda Test**:
   ```javascript
   var mgr = new ISBUserGroupManager();
   var result = mgr.addUserToGroup('test-user@company.com');
   gs.info('Add user result: ' + JSON.stringify(result));
   ```

### Integration Test

1. Submit the catalog item as a test user
2. Approve the request
3. Verify the following sequence in RITM work notes:
   - Step 1: Lambda start script triggered
   - Step 2: User added to IDC group
   - Step 3: ISB lease created
   - Step 4: Lease reached Active status
   - Step 5: Access details retrieved
4. Verify the user received an email with login URL
5. Verify the RITM is closed with complete details

### Release Flow Test

1. Submit a "Release" request with an existing lease ID
2. Approve the request
3. Verify the lease is terminated
4. Verify the RITM is closed

---

## Troubleshooting

### Common Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| `ISB authentication failed` | Invalid credentials or expired token | Verify `api_client_id` and `api_client_secret` properties |
| `User not found in Identity Store` | Email doesn't match IDC username | Ensure email matches the IAM Identity Center user principal name |
| `Lease creation failed (409)` | User already has max active leases | Check ISB `maxLeasesPerUser` configuration |
| `Polling timed out` | Provisioning taking too long | Increase poll attempts or interval; check ISB logs |
| `Lambda timeout` | IDC API latency | Increase Lambda timeout in template.yaml |

### Logs

- **ServiceNow**: System Logs > All (`source: ISBApiClient OR ISBSandboxOrchestrator`)
- **AWS Lambda**: CloudWatch Logs > `/aws/lambda/isb-user-group-manager`
- **ISB API**: Check the Innovation Sandbox solution logs in CloudWatch

### Rollback

To deactivate the catalog without deleting it:
1. Set the catalog item to **Inactive**
2. Deactivate the Flow in Flow Designer
3. Disable the Scheduled Job

To revert to the old catalog:
1. Reactivate the **Terraform – Create AWS Sandbox Account** catalog item
