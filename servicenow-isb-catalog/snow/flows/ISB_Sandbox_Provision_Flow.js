/**
 * Flow Designer Flow: ISB_Sandbox_Provision_Flow
 * 
 * This is the MAIN FLOW that runs when the catalog item is submitted.
 * Create this in: Flow Designer > New Flow
 *
 * Trigger: Service Catalog (when catalog item is requested)
 * Catalog Item: Temasek – AWS Innovation Sandbox Account (Assign / Release)
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  FLOW STRUCTURE                                             │
 * │                                                             │
 * │  1. Trigger: Service Catalog Item Requested                 │
 * │  2. Get RITM record and variables                           │
 * │  3. Route for Approval (same as existing catalog)           │
 * │  4. If Approved → Run Subflow based on request_type         │
 * │     ├── assign  → ISB_Sandbox_Assign_Subflow                │
 * │     └── release → ISB_Sandbox_Release_Subflow               │
 * │  5. If Rejected → Close RITM as rejected                    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * IMPLEMENTATION STEPS (in Flow Designer UI):
 *
 * 1. Create a new Flow named "ISB Sandbox Provision Flow"
 * 2. Set Trigger to "Service Catalog"
 * 3. Add steps as described below
 * 4. Activate the flow
 * 5. Associate with the catalog item's "Flow" field
 */

// =====================================================================
// STEP-BY-STEP FLOW CONFIGURATION (Flow Designer JSON-like pseudocode)
// =====================================================================

var ISB_Sandbox_Provision_Flow = {
    name: 'ISB Sandbox Provision Flow',
    description: 'Handles approval and provisioning of AWS Innovation Sandbox accounts via ISB APIs.',
    application: 'Global',
    trigger: {
        type: 'Service Catalog',
        catalog_item: 'Temasek – AWS Innovation Sandbox Account (Assign / Release)',
        table: 'sc_req_item'
    },

    steps: [
        // ── Step 1: Log & Initialize ──────────────────────────────────
        {
            step: 1,
            type: 'Action',
            name: 'Log - Request Received',
            action: 'sn_fd.FlowAPI.log',
            inputs: {
                message: 'ISB Sandbox request received. RITM: ' +
                         'fd_data.trigger.current.number'
            }
        },

        // ── Step 2: Get Catalog Variables ─────────────────────────────
        {
            step: 2,
            type: 'Action',
            name: 'Get Catalog Variables',
            action: 'sn_sc.CatItemVariableUtil.getVariablesForRITM',
            inputs: {
                ritm_sys_id: 'fd_data.trigger.current.sys_id'
            },
            outputs: {
                request_type: 'request_type',
                requester_email: 'requester_email',
                lease_template_uuid: 'lease_template_uuid',
                business_justification: 'business_justification'
            }
        },

        // ── Step 3: Approval (same as existing catalog) ───────────────
        {
            step: 3,
            type: 'Action',
            name: 'Ask for Approval',
            action: 'sn_fd.FlowAPI.askForApproval',
            description: 'Routes to the same approval group as the existing Terraform - Create AWS Sandbox Account catalog.',
            inputs: {
                record: 'fd_data.trigger.current',
                approval_rules: [
                    {
                        type: 'Group Approval',
                        group: 'Cloud Platform Approvers',
                        approval_requirement: 'Anyone in group',
                        wait_for: 'Approval or Rejection'
                    },
                    {
                        type: 'Manager Approval',
                        source: 'Requested for user\'s manager',
                        approval_requirement: 'Manager must approve',
                        wait_for: 'Approval or Rejection'
                    }
                ]
            },
            outputs: {
                approval_status: 'approval_result'
            }
        },

        // ── Step 4: If-Else on Approval Result ───────────────────────
        {
            step: 4,
            type: 'IfElse',
            name: 'Check Approval Status',
            conditions: {
                if_condition: 'approval_result == "approved"',
                then_steps: [
                    // ── Step 4a: If-Else on Request Type ──────────────
                    {
                        step: '4a',
                        type: 'IfElse',
                        name: 'Check Request Type',
                        conditions: {
                            if_condition: 'request_type == "assign"',
                            then_steps: [
                                {
                                    step: '4a-i',
                                    type: 'Subflow',
                                    name: 'Run ISB Sandbox Assign Subflow',
                                    subflow: 'ISB_Sandbox_Assign_Subflow',
                                    inputs: {
                                        ritm_sys_id: 'fd_data.trigger.current.sys_id'
                                    }
                                }
                            ],
                            else_steps: [
                                {
                                    step: '4a-ii',
                                    type: 'Subflow',
                                    name: 'Run ISB Sandbox Release Subflow',
                                    subflow: 'ISB_Sandbox_Release_Subflow',
                                    inputs: {
                                        ritm_sys_id: 'fd_data.trigger.current.sys_id'
                                    }
                                }
                            ]
                        }
                    }
                ],
                else_steps: [
                    // Approval rejected
                    {
                        step: '4b',
                        type: 'Action',
                        name: 'Update RITM - Rejected',
                        action: 'sn_fd.FlowAPI.updateRecord',
                        inputs: {
                            table: 'sc_req_item',
                            sys_id: 'fd_data.trigger.current.sys_id',
                            values: {
                                state: 4,
                                close_notes: 'Request rejected during approval process.',
                                work_notes: 'Sandbox request has been REJECTED. No provisioning will occur.'
                            }
                        }
                    }
                ]
            }
        }
    ]
};
