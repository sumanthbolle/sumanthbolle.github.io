/**
 * Script Include: ISBSandboxOrchestrator
 * Scope: Global (or scoped app: x_tema_isb)
 *
 * Master orchestrator that coordinates the full sandbox provisioning or
 * release workflow. Called from the Flow Designer flow after approval.
 *
 * Provisioning Sequence (Assign):
 *   1. API 1 - Trigger Lambda start script & update S3 bucket
 *   2. Add user to temaisb_UserGroup in IAM Identity Center
 *   3. API 2 - Create ISB lease (assign sandbox)
 *   4. Poll lease until Active
 *   5. Retrieve login URL & access details
 *   6. Update RITM with results
 *
 * Release Sequence:
 *   1. Terminate lease via ISB API
 *   2. Optionally remove user from IDC group
 *   3. Update RITM
 */

var ISBSandboxOrchestrator = Class.create();
ISBSandboxOrchestrator.prototype = {
    initialize: function() {
        this.isbClient      = new ISBApiClient();
        this.userGroupMgr   = new ISBUserGroupManager();
        this.lambdaStartMgr = new ISBLambdaStartManager();
    },

    /**
     * Execute the full sandbox assignment workflow.
     * @param {GlideRecord} ritm - sc_req_item GlideRecord
     * @returns {object} Result with sandbox details or error
     */
    assignSandbox: function(ritm) {
        var userEmail        = this._getVariable(ritm, 'requester_email');
        var leaseTemplateId  = this._getVariable(ritm, 'lease_template_uuid');
        var justification    = this._getVariable(ritm, 'business_justification');
        var projectName      = this._getVariable(ritm, 'project_name');
        var startDate        = this._getVariable(ritm, 'start_date');
        var awsRegion        = this._getVariable(ritm, 'aws_region');
        var ritmNumber       = ritm.getValue('number');

        var comments = 'RITM: ' + ritmNumber + ' | Project: ' + projectName + ' | ' + justification;

        this._updateRitmState(ritm, 2, 'Provisioning sandbox - Step 1: Triggering start script...');

        // ─── Step 1: Trigger Lambda Start Script (API 1) ──────────────
        var startTime = startDate || new GlideDateTime().getValue();
        var lambdaResult = this.lambdaStartMgr.triggerStartScript(
            userEmail, startTime, '', awsRegion, 'start'
        );

        if (!lambdaResult.success) {
            return this._handleError(ritm, 'Lambda start script failed', lambdaResult.error);
        }

        this._addWorkNote(ritm, 'Step 1 Complete: Lambda start script triggered successfully.');

        // ─── Step 2: Add User to IDC Group ────────────────────────────
        this._updateRitmState(ritm, 2, 'Step 2: Adding user to temaisb_UserGroup...');

        var groupResult = this.userGroupMgr.addUserToGroup(userEmail);
        if (!groupResult.success) {
            return this._handleError(ritm, 'Failed to add user to IDC group', groupResult.error);
        }

        var groupMsg = groupResult.alreadyMember
            ? 'Step 2 Complete: User already in temaisb_UserGroup.'
            : 'Step 2 Complete: User added to temaisb_UserGroup.';
        this._addWorkNote(ritm, groupMsg);

        // ─── Step 3: Create ISB Lease (API 2) ─────────────────────────
        this._updateRitmState(ritm, 2, 'Step 3: Creating ISB sandbox lease...');

        var leaseResult = this.isbClient.createLease(leaseTemplateId, userEmail, comments);
        if (!leaseResult.success) {
            return this._handleError(ritm, 'ISB lease creation failed', leaseResult.error);
        }

        var leaseData = leaseResult.data;
        var leaseId   = leaseData.leaseId || leaseData.uuid;

        this._addWorkNote(ritm, 'Step 3 Complete: Lease created - ID: ' + leaseId +
            ' | Status: ' + leaseData.status);

        // ─── Step 4: Poll Until Active ────────────────────────────────
        this._updateRitmState(ritm, 2, 'Step 4: Waiting for sandbox to become Active...');

        var finalLease = this.isbClient.pollLeaseUntilReady(leaseId, 20, 15000);
        if (!finalLease.success) {
            return this._handleError(ritm, 'Sandbox provisioning timed out or failed', finalLease.error);
        }

        if (finalLease.data.status === 'ProvisioningFailed' ||
            finalLease.data.status === 'ApprovalDenied') {
            return this._handleError(ritm, 'Sandbox provisioning ended with status: ' +
                finalLease.data.status, JSON.stringify(finalLease.data));
        }

        // ─── Step 5: Get Login URL & Configuration ────────────────────
        this._updateRitmState(ritm, 2, 'Step 5: Retrieving access details...');

        var configResult = this.isbClient.getConfiguration();
        var loginUrl     = '';
        var webAppUrl    = '';

        if (configResult.success && configResult.data && configResult.data.auth) {
            loginUrl  = configResult.data.auth.awsAccessPortalUrl || '';
            webAppUrl = configResult.data.auth.webAppUrl || '';
        }

        // ─── Step 6: Update RITM with Results ─────────────────────────
        var successMessage = this._buildSuccessMessage(finalLease.data, loginUrl, webAppUrl, awsRegion);
        this._completeRitm(ritm, successMessage, finalLease.data);

        return {
            success: true,
            leaseId: leaseId,
            leaseStatus: finalLease.data.status,
            awsAccountId: finalLease.data.awsAccountId,
            loginUrl: loginUrl,
            webAppUrl: webAppUrl,
            expirationDate: finalLease.data.expirationDate
        };
    },

    /**
     * Execute the sandbox release workflow.
     * @param {GlideRecord} ritm - sc_req_item GlideRecord
     * @returns {object} Result
     */
    releaseSandbox: function(ritm) {
        var userEmail = this._getVariable(ritm, 'requester_email');
        var leaseId   = this._getVariable(ritm, 'existing_lease_id');
        var ritmNumber = ritm.getValue('number');

        this._updateRitmState(ritm, 2, 'Releasing sandbox - Terminating lease ' + leaseId + '...');

        // ─── Step 1: Terminate the lease ──────────────────────────────
        var termResult = this.isbClient.terminateLease(leaseId);
        if (!termResult.success) {
            return this._handleError(ritm, 'Failed to terminate lease', termResult.error);
        }

        this._addWorkNote(ritm, 'Lease ' + leaseId + ' terminated successfully.');

        // ─── Step 2: Trigger Lambda stop script ───────────────────────
        var lambdaResult = this.lambdaStartMgr.triggerStartScript(
            userEmail, new GlideDateTime().getValue(), leaseId, '', 'stop'
        );
        if (lambdaResult.success) {
            this._addWorkNote(ritm, 'Lambda stop script triggered.');
        } else {
            this._addWorkNote(ritm, 'Warning: Lambda stop script failed (non-critical): ' + lambdaResult.error);
        }

        // ─── Step 3: Complete ─────────────────────────────────────────
        var releaseMessage = '=== Sandbox Release Complete ===\n\n' +
            'Lease ID: ' + leaseId + '\n' +
            'User: ' + userEmail + '\n' +
            'RITM: ' + ritmNumber + '\n' +
            'Status: Terminated\n\n' +
            'The sandbox account has been released and will undergo automated cleanup.';

        this._completeRitm(ritm, releaseMessage, termResult.data);

        return { success: true, leaseId: leaseId, status: 'Terminated' };
    },

    // ─── Private Helper Methods ───────────────────────────────────────

    _getVariable: function(ritm, varName) {
        var vars = ritm.variables;
        return vars[varName] ? vars[varName].toString() : '';
    },

    _updateRitmState: function(ritm, state, description) {
        ritm.setValue('state', state); // 2 = Work in Progress
        ritm.setValue('short_description', description);
        ritm.update();
    },

    _addWorkNote: function(ritm, note) {
        ritm.work_notes = note;
        ritm.update();
    },

    _handleError: function(ritm, message, detail) {
        var fullMessage = 'ERROR: ' + message + '\nDetail: ' + (detail || 'No detail available');
        gs.error('ISBSandboxOrchestrator: ' + fullMessage);
        ritm.work_notes = fullMessage;
        ritm.setValue('state', 18); // Pending vendor / error state
        ritm.update();
        return { success: false, error: message, detail: detail };
    },

    _buildSuccessMessage: function(leaseData, loginUrl, webAppUrl, awsRegion) {
        var msg = '=== AWS Innovation Sandbox - Assignment Complete ===\n\n';
        msg += '--- Sandbox Details ---\n';
        msg += 'Lease ID: ' + (leaseData.leaseId || leaseData.uuid) + '\n';
        msg += 'AWS Account ID: ' + (leaseData.awsAccountId || 'Pending') + '\n';
        msg += 'Status: ' + leaseData.status + '\n';
        msg += 'Region: ' + (awsRegion || 'N/A') + '\n';
        msg += 'Start Date: ' + (leaseData.startDate || 'N/A') + '\n';
        msg += 'Expiration Date: ' + (leaseData.expirationDate || 'N/A') + '\n';
        msg += 'Maximum Budget: $' + (leaseData.maxSpend || 'N/A') + '\n';
        msg += 'Cost Accrued: $' + (leaseData.totalCostAccrued || '0.00') + '\n\n';

        msg += '--- Access Information ---\n';
        msg += 'AWS Access Portal (SSO Login): ' + (loginUrl || 'Contact your cloud administrator') + '\n';
        msg += 'ISB Web Application: ' + (webAppUrl || 'Contact your cloud administrator') + '\n\n';

        msg += '--- Login Instructions ---\n';
        msg += '1. Navigate to the AWS Access Portal URL above.\n';
        msg += '2. Sign in using your corporate credentials (IAM Identity Center SSO).\n';
        msg += '3. Select the sandbox account assigned to you.\n';
        msg += '4. Choose the role presented and click "Management Console" or "Command line or programmatic access".\n\n';

        msg += '--- Guidelines ---\n';
        msg += '• This sandbox is for experimentation and prototyping ONLY.\n';
        msg += '• Do NOT store production data or PII in sandbox accounts.\n';
        msg += '• The sandbox will be automatically cleaned up upon lease expiration.\n';
        msg += '• Monitor your spend via the ISB Web Application dashboard.\n';
        msg += '• If you need to extend your lease, submit a new request before expiration.\n';
        msg += '• For issues, contact the Cloud Platform team.\n';

        return msg;
    },

    _completeRitm: function(ritm, message, data) {
        ritm.work_notes = message;
        ritm.comments = message;
        ritm.setValue('state', 3); // Closed Complete
        ritm.setValue('close_notes', 'Sandbox provisioned successfully via ISB API.');

        if (data && data.awsAccountId) {
            ritm.setValue('u_aws_account_id', data.awsAccountId);
        }
        if (data && (data.leaseId || data.uuid)) {
            ritm.setValue('u_isb_lease_id', data.leaseId || data.uuid);
        }

        ritm.update();

        this._notifyRequester(ritm, message);
    },

    _notifyRequester: function(ritm, message) {
        var userEmail = this._getVariable(ritm, 'requester_email');
        if (!userEmail) return;

        try {
            gs.eventQueue('x_tema_isb.sandbox_provisioned', ritm, userEmail, message);
        } catch(e) {
            gs.warn('ISBSandboxOrchestrator: Could not queue notification event: ' + e.message);
        }
    },

    type: 'ISBSandboxOrchestrator'
};
