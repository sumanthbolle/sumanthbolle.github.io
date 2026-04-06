/**
 * Flow Designer Subflow: ISB_Sandbox_Assign_Subflow
 *
 * Called by the main flow after approval for "assign" request type.
 * Executes the full provisioning sequence using ISBSandboxOrchestrator.
 *
 * Create in: Flow Designer > New Subflow
 *
 * Input: ritm_sys_id (String) - sys_id of the RITM record
 */

var ISB_Sandbox_Assign_Subflow = {
    name: 'ISB Sandbox Assign Subflow',
    description: 'Provisions a new sandbox by calling ISB APIs in order: Lambda Start, IDC Group Add, Create Lease.',
    inputs: [
        { name: 'ritm_sys_id', type: 'String', mandatory: true }
    ],

    steps: [
        // ── Step 1: Run Script - Execute Orchestrator ─────────────────
        {
            step: 1,
            type: 'Action',
            name: 'Execute Sandbox Assignment',
            action: 'sn_fd.FlowAPI.runScript',
            inputs: {
                /**
                 * This is the actual server-side script that runs in the subflow.
                 * It invokes the ISBSandboxOrchestrator to execute the full
                 * provisioning pipeline.
                 */
                script: function(inputs, outputs) {
                    var ritmSysId = inputs.ritm_sys_id;
                    var ritm = new GlideRecord('sc_req_item');

                    if (!ritm.get(ritmSysId)) {
                        gs.error('ISB_Sandbox_Assign_Subflow: RITM not found: ' + ritmSysId);
                        outputs.success = false;
                        outputs.error_message = 'RITM record not found';
                        return;
                    }

                    try {
                        var orchestrator = new ISBSandboxOrchestrator();
                        var result = orchestrator.assignSandbox(ritm);

                        outputs.success = result.success;
                        if (result.success) {
                            outputs.lease_id = result.leaseId;
                            outputs.aws_account_id = result.awsAccountId;
                            outputs.login_url = result.loginUrl;
                            outputs.web_app_url = result.webAppUrl;
                            outputs.lease_status = result.leaseStatus;
                            outputs.expiration_date = result.expirationDate;
                        } else {
                            outputs.error_message = result.error || 'Unknown error during provisioning';
                        }
                    } catch (e) {
                        gs.error('ISB_Sandbox_Assign_Subflow: Exception - ' + e.message);
                        outputs.success = false;
                        outputs.error_message = e.message;

                        ritm.work_notes = 'CRITICAL ERROR during sandbox provisioning: ' + e.message;
                        ritm.setValue('state', 18);
                        ritm.update();
                    }
                }
            },
            outputs: {
                success: 'Boolean',
                lease_id: 'String',
                aws_account_id: 'String',
                login_url: 'String',
                web_app_url: 'String',
                lease_status: 'String',
                expiration_date: 'String',
                error_message: 'String'
            }
        },

        // ── Step 2: Error Handling ────────────────────────────────────
        {
            step: 2,
            type: 'IfElse',
            name: 'Check Result',
            conditions: {
                if_condition: 'outputs.success == false',
                then_steps: [
                    {
                        step: '2a',
                        type: 'Action',
                        name: 'Send Error Notification',
                        action: 'sn_fd.FlowAPI.sendEmail',
                        inputs: {
                            to: 'cloud-platform-team@company.com',
                            subject: 'ISB Sandbox Provisioning Failed - RITM: ${fd_data.trigger.current.number}',
                            body: 'Sandbox provisioning failed.\n\nError: ${outputs.error_message}\n\n' +
                                  'Please investigate and take corrective action.'
                        }
                    }
                ]
            }
        }
    ]
};
