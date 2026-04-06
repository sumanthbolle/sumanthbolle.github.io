/**
 * Flow Designer Subflow: ISB_Sandbox_Release_Subflow
 *
 * Called by the main flow after approval for "release" request type.
 * Terminates the lease and optionally removes the user from the IDC group.
 *
 * Create in: Flow Designer > New Subflow
 *
 * Input: ritm_sys_id (String) - sys_id of the RITM record
 */

var ISB_Sandbox_Release_Subflow = {
    name: 'ISB Sandbox Release Subflow',
    description: 'Releases (terminates) an existing sandbox lease and triggers cleanup.',
    inputs: [
        { name: 'ritm_sys_id', type: 'String', mandatory: true }
    ],

    steps: [
        // ── Step 1: Run Script - Execute Release ──────────────────────
        {
            step: 1,
            type: 'Action',
            name: 'Execute Sandbox Release',
            action: 'sn_fd.FlowAPI.runScript',
            inputs: {
                script: function(inputs, outputs) {
                    var ritmSysId = inputs.ritm_sys_id;
                    var ritm = new GlideRecord('sc_req_item');

                    if (!ritm.get(ritmSysId)) {
                        gs.error('ISB_Sandbox_Release_Subflow: RITM not found: ' + ritmSysId);
                        outputs.success = false;
                        outputs.error_message = 'RITM record not found';
                        return;
                    }

                    try {
                        var orchestrator = new ISBSandboxOrchestrator();
                        var result = orchestrator.releaseSandbox(ritm);

                        outputs.success = result.success;
                        if (result.success) {
                            outputs.lease_id = result.leaseId;
                            outputs.status = result.status;
                        } else {
                            outputs.error_message = result.error || 'Unknown error during release';
                        }
                    } catch (e) {
                        gs.error('ISB_Sandbox_Release_Subflow: Exception - ' + e.message);
                        outputs.success = false;
                        outputs.error_message = e.message;

                        ritm.work_notes = 'CRITICAL ERROR during sandbox release: ' + e.message;
                        ritm.setValue('state', 18);
                        ritm.update();
                    }
                }
            },
            outputs: {
                success: 'Boolean',
                lease_id: 'String',
                status: 'String',
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
                            subject: 'ISB Sandbox Release Failed - RITM: ${fd_data.trigger.current.number}',
                            body: 'Sandbox release failed.\n\nError: ${outputs.error_message}\n\n' +
                                  'Please investigate and take corrective action.'
                        }
                    }
                ]
            }
        }
    ]
};
