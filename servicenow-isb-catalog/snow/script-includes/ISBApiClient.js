/**
 * Script Include: ISBApiClient
 * Scope: Global (or scoped app: x_tema_isb)
 * Accessible from: All application scopes
 * 
 * Central client for all Innovation Sandbox on AWS (ISB) API interactions.
 * Handles authentication, lease CRUD, and lease lifecycle operations.
 *
 * System Properties Required:
 *   x_tema_isb.api_base_url       - ISB API Gateway base URL
 *   x_tema_isb.api_client_id      - OAuth client ID for ISB
 *   x_tema_isb.api_client_secret  - OAuth client secret for ISB (stored encrypted)
 *   x_tema_isb.auth_token_cache   - Cached auth token (auto-managed)
 *   x_tema_isb.auth_token_expiry  - Token expiry timestamp (auto-managed)
 */

var ISBApiClient = Class.create();
ISBApiClient.prototype = {
    initialize: function() {
        this.baseUrl      = gs.getProperty('x_tema_isb.api_base_url', '');
        this.clientId     = gs.getProperty('x_tema_isb.api_client_id', '');
        this.clientSecret = gs.getProperty('x_tema_isb.api_client_secret', '');
        this.authToken    = '';

        if (!this.baseUrl) {
            throw new Error('ISBApiClient: x_tema_isb.api_base_url is not configured.');
        }
    },

    // ─── Authentication ───────────────────────────────────────────────

    /**
     * Obtain a Bearer token. Uses cached token if still valid.
     * @returns {string} Bearer token
     */
    getAuthToken: function() {
        var cachedToken  = gs.getProperty('x_tema_isb.auth_token_cache', '');
        var cachedExpiry = gs.getProperty('x_tema_isb.auth_token_expiry', '0');

        if (cachedToken && parseInt(cachedExpiry, 10) > new GlideDateTime().getNumericValue()) {
            this.authToken = cachedToken;
            return this.authToken;
        }

        var restMessage = new sn_ws.RESTMessageV2('ISB_Sandbox_API', 'Authenticate');
        restMessage.setStringParameterNoEscape('client_id', this.clientId);
        restMessage.setStringParameterNoEscape('client_secret', this.clientSecret);
        restMessage.setHttpTimeout(15000);

        var response = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body = response.getBody();

        if (httpStatus != 200 && httpStatus != 201) {
            gs.error('ISBApiClient.getAuthToken: Failed with status ' + httpStatus + ': ' + body);
            throw new Error('ISB authentication failed: HTTP ' + httpStatus);
        }

        var parsed = JSON.parse(body);
        this.authToken = parsed.data.token || parsed.access_token || '';

        if (!this.authToken) {
            throw new Error('ISBApiClient.getAuthToken: No token in response.');
        }

        var expiresIn = (parsed.data.expiresIn || parsed.expires_in || 3600) * 1000;
        var expiry = new GlideDateTime().getNumericValue() + expiresIn - 60000;
        gs.setProperty('x_tema_isb.auth_token_cache', this.authToken);
        gs.setProperty('x_tema_isb.auth_token_expiry', String(expiry));

        return this.authToken;
    },

    /**
     * Ensure we have a valid auth token before making API calls.
     */
    _ensureAuth: function() {
        if (!this.authToken) {
            this.getAuthToken();
        }
    },

    // ─── Lease Operations ─────────────────────────────────────────────

    /**
     * Create a new lease (assign sandbox to user).
     * @param {string} leaseTemplateUuid - UUID of the lease template
     * @param {string} userEmail - Email of the user to assign
     * @param {string} comments - Business justification / comments
     * @returns {object} Lease object from ISB API
     */
    createLease: function(leaseTemplateUuid, userEmail, comments) {
        this._ensureAuth();

        var restMessage = new sn_ws.RESTMessageV2('ISB_Sandbox_API', 'CreateLease');
        restMessage.setStringParameterNoEscape('auth_token', this.authToken);
        restMessage.setStringParameterNoEscape('lease_template_uuid', leaseTemplateUuid);
        restMessage.setStringParameterNoEscape('user_email', userEmail);
        restMessage.setStringParameterNoEscape('comments', comments || '');
        restMessage.setHttpTimeout(30000);

        var response = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body = response.getBody();

        gs.info('ISBApiClient.createLease: HTTP ' + httpStatus + ' for user ' + userEmail);

        if (httpStatus != 201 && httpStatus != 200) {
            gs.error('ISBApiClient.createLease: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        var parsed = JSON.parse(body);
        return { success: true, data: parsed.data, httpStatus: httpStatus };
    },

    /**
     * Get lease details by lease ID.
     * @param {string} leaseId - Base64 encoded lease ID
     * @returns {object} Lease details
     */
    getLease: function(leaseId) {
        this._ensureAuth();

        var restMessage = new sn_ws.RESTMessageV2('ISB_Sandbox_API', 'GetLease');
        restMessage.setStringParameterNoEscape('auth_token', this.authToken);
        restMessage.setStringParameterNoEscape('lease_id', leaseId);
        restMessage.setHttpTimeout(15000);

        var response = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body = response.getBody();

        if (httpStatus != 200) {
            gs.error('ISBApiClient.getLease: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        var parsed = JSON.parse(body);
        return { success: true, data: parsed.data, httpStatus: httpStatus };
    },

    /**
     * Terminate a lease (release sandbox).
     * @param {string} leaseId - Base64 encoded lease ID
     * @returns {object} Result
     */
    terminateLease: function(leaseId) {
        this._ensureAuth();

        var restMessage = new sn_ws.RESTMessageV2('ISB_Sandbox_API', 'TerminateLease');
        restMessage.setStringParameterNoEscape('auth_token', this.authToken);
        restMessage.setStringParameterNoEscape('lease_id', leaseId);
        restMessage.setHttpTimeout(30000);

        var response = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body = response.getBody();

        gs.info('ISBApiClient.terminateLease: HTTP ' + httpStatus + ' for lease ' + leaseId);

        if (httpStatus != 200) {
            gs.error('ISBApiClient.terminateLease: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        var parsed = JSON.parse(body);
        return { success: true, data: parsed.data, httpStatus: httpStatus };
    },

    /**
     * Get the ISB global configuration (for login URLs, etc.)
     * @returns {object} Configuration data
     */
    getConfiguration: function() {
        this._ensureAuth();

        var restMessage = new sn_ws.RESTMessageV2('ISB_Sandbox_API', 'GetConfiguration');
        restMessage.setStringParameterNoEscape('auth_token', this.authToken);
        restMessage.setHttpTimeout(15000);

        var response = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body = response.getBody();

        if (httpStatus != 200) {
            gs.error('ISBApiClient.getConfiguration: Failed - HTTP ' + httpStatus);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        var parsed = JSON.parse(body);
        return { success: true, data: parsed.data, httpStatus: httpStatus };
    },

    /**
     * Poll lease status until it reaches a terminal or active state.
     * @param {string} leaseId - Base64 encoded lease ID
     * @param {number} maxAttempts - Max polling attempts (default 20)
     * @param {number} intervalMs - Interval between polls in ms (default 15000)
     * @returns {object} Final lease state
     */
    pollLeaseUntilReady: function(leaseId, maxAttempts, intervalMs) {
        maxAttempts = maxAttempts || 20;
        intervalMs  = intervalMs  || 15000;

        var terminalStatuses = [
            'Active', 'Expired', 'BudgetExceeded', 'ManuallyTerminated',
            'AccountQuarantined', 'Ejected', 'ProvisioningFailed', 'ApprovalDenied'
        ];

        for (var i = 0; i < maxAttempts; i++) {
            var result = this.getLease(leaseId);
            if (!result.success) {
                gs.warn('ISBApiClient.pollLeaseUntilReady: Attempt ' + (i+1) + ' failed: ' + result.error);
                gs.sleep(intervalMs);
                continue;
            }

            var status = result.data.status;
            gs.info('ISBApiClient.pollLeaseUntilReady: Attempt ' + (i+1) + ' - Status: ' + status);

            if (terminalStatuses.indexOf(status) !== -1) {
                return result;
            }

            gs.sleep(intervalMs);
        }

        gs.error('ISBApiClient.pollLeaseUntilReady: Timed out after ' + maxAttempts + ' attempts');
        return { success: false, error: 'Polling timed out', timedOut: true };
    },

    type: 'ISBApiClient'
};
