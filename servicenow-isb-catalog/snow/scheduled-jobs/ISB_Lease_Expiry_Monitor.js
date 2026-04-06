/**
 * Scheduled Job: ISB Lease Expiry Monitor
 * 
 * Runs periodically to check for sandbox leases nearing expiration.
 * Notifies users 24 hours before expiration and again at 4 hours.
 *
 * Create in: System Definition > Scheduled Jobs > New
 * Schedule: Every 4 hours
 * Run as: System
 */

(function executeISBLeaseExpiryMonitor() {
    var client = new ISBApiClient();
    var pageIdentifier = '';
    var totalChecked = 0;
    var notificationsSent = 0;

    try {
        do {
            var url = '/leases?pageSize=50';
            if (pageIdentifier) {
                url += '&pageIdentifier=' + encodeURIComponent(pageIdentifier);
            }

            var restMessage = new sn_ws.RESTMessageV2();
            restMessage.setHttpMethod('GET');
            restMessage.setEndpoint(gs.getProperty('x_tema_isb.api_base_url') + url);
            restMessage.setRequestHeader('Authorization', 'Bearer ' + client.getAuthToken());
            restMessage.setRequestHeader('Accept', 'application/json');
            restMessage.setHttpTimeout(30000);

            var response = restMessage.execute();
            var body = JSON.parse(response.getBody());

            if (response.getStatusCode() != 200 || body.status !== 'success') {
                gs.error('ISB_Lease_Expiry_Monitor: Failed to fetch leases');
                break;
            }

            var leases = body.data.result || [];
            pageIdentifier = body.data.nextPageIdentifier || '';

            for (var i = 0; i < leases.length; i++) {
                totalChecked++;
                var lease = leases[i];

                if (lease.status !== 'Active' && lease.status !== 'Frozen') {
                    continue;
                }

                if (!lease.expirationDate) continue;

                var expiry = new GlideDateTime(lease.expirationDate);
                var now = new GlideDateTime();
                var hoursRemaining = gs.dateDiff(now.getValue(), expiry.getValue(), true) / 3600;

                if (hoursRemaining <= 0) continue;

                var ritmGr = new GlideRecord('sc_req_item');
                ritmGr.addQuery('u_isb_lease_id', lease.leaseId || lease.uuid);
                ritmGr.addQuery('state', '!=', 3);
                ritmGr.query();

                if (hoursRemaining <= 4) {
                    _sendExpiryNotification(lease, hoursRemaining, 'URGENT', ritmGr);
                    notificationsSent++;
                } else if (hoursRemaining <= 24) {
                    _sendExpiryNotification(lease, hoursRemaining, 'WARNING', ritmGr);
                    notificationsSent++;
                }
            }

        } while (pageIdentifier);

        gs.info('ISB_Lease_Expiry_Monitor: Checked ' + totalChecked + ' leases, sent ' +
                notificationsSent + ' notifications.');

    } catch (e) {
        gs.error('ISB_Lease_Expiry_Monitor: Exception - ' + e.message);
    }

    function _sendExpiryNotification(lease, hoursRemaining, severity, ritmGr) {
        var userEmail = lease.userEmail;
        if (!userEmail) return;

        var subject = '[' + severity + '] AWS Innovation Sandbox Expiring in ' +
                      Math.round(hoursRemaining) + ' hours';

        var body = 'Hello,\n\n' +
            'Your AWS Innovation Sandbox lease is expiring soon.\n\n' +
            'Lease ID: ' + (lease.leaseId || lease.uuid) + '\n' +
            'AWS Account: ' + (lease.awsAccountId || 'N/A') + '\n' +
            'Expiration: ' + lease.expirationDate + '\n' +
            'Hours Remaining: ~' + Math.round(hoursRemaining) + '\n\n' +
            'If you need to extend your lease, please submit a new request ' +
            'before the current one expires.\n\n' +
            'After expiration, the account will be automatically cleaned up ' +
            'and all resources will be deleted.\n\n' +
            'Regards,\nCloud Platform Team';

        gs.eventQueue('x_tema_isb.sandbox_expiry_warning', null, userEmail,
                      subject + '|||' + body);
    }

})();
