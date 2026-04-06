/**
 * Script Include: ISBSandboxStatusAjax
 * Scope: Global (or scoped app: x_tema_isb)
 * Client callable: true
 * Accessible from: All application scopes
 *
 * AJAX endpoint for the UI Page sandbox status lookup.
 */

var ISBSandboxStatusAjax = Class.create();
ISBSandboxStatusAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    getLeaseStatus: function() {
        var ritmNumber = this.getParameter('sysparm_ritm_number');

        if (!ritmNumber) {
            return JSON.stringify({ error: 'RITM number is required.' });
        }

        var ritm = new GlideRecord('sc_req_item');
        ritm.addQuery('number', ritmNumber);
        ritm.query();

        if (!ritm.next()) {
            return JSON.stringify({ error: 'RITM ' + ritmNumber + ' not found.' });
        }

        var currentUser = gs.getUserID();
        var requestedFor = ritm.variables.requested_for ?
            ritm.variables.requested_for.toString() : '';
        if (requestedFor !== currentUser && !gs.hasRole('admin,itil')) {
            return JSON.stringify({ error: 'You do not have permission to view this RITM.' });
        }

        var leaseId = ritm.getValue('u_isb_lease_id') || '';
        var awsAccountId = ritm.getValue('u_aws_account_id') || '';
        var result = {
            ritmNumber: ritmNumber,
            leaseId: leaseId,
            awsAccountId: awsAccountId,
            ritmState: ritm.getValue('state'),
            requestType: ritm.variables.request_type ?
                ritm.variables.request_type.toString() : ''
        };

        if (leaseId) {
            try {
                var client = new ISBApiClient();
                var leaseResult = client.getLease(leaseId);

                if (leaseResult.success) {
                    result.leaseStatus = leaseResult.data.status;
                    result.expirationDate = leaseResult.data.expirationDate || '';
                    result.totalCostAccrued = leaseResult.data.totalCostAccrued || 0;
                    result.startDate = leaseResult.data.startDate || '';
                }

                var configResult = client.getConfiguration();
                if (configResult.success && configResult.data && configResult.data.auth) {
                    result.loginUrl = configResult.data.auth.awsAccessPortalUrl || '';
                    result.webAppUrl = configResult.data.auth.webAppUrl || '';
                }
            } catch (e) {
                gs.warn('ISBSandboxStatusAjax: Error fetching live status: ' + e.message);
                result.leaseStatus = 'Unknown (API unavailable)';
            }
        }

        return JSON.stringify(result);
    },

    type: 'ISBSandboxStatusAjax'
});
