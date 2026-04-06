/**
 * Script Include: ISBUserGroupManager
 * Scope: Global (or scoped app: x_tema_isb)
 *
 * Manages user group membership in IAM Identity Center (IDC) via
 * the dedicated Lambda-backed API Gateway endpoint.
 *
 * System Properties Required:
 *   x_tema_isb.idc_lambda_api_url  - API Gateway URL for IDC Lambda
 *   x_tema_isb.idc_api_key         - API key for IDC Lambda endpoint
 *   x_tema_isb.identity_store_id   - IAM Identity Center Identity Store ID
 */

var ISBUserGroupManager = Class.create();
ISBUserGroupManager.prototype = {
    initialize: function() {
        this.apiUrl         = gs.getProperty('x_tema_isb.idc_lambda_api_url', '');
        this.apiKey         = gs.getProperty('x_tema_isb.idc_api_key', '');
        this.identityStoreId = gs.getProperty('x_tema_isb.identity_store_id', '');

        if (!this.apiUrl) {
            throw new Error('ISBUserGroupManager: x_tema_isb.idc_lambda_api_url is not configured.');
        }
    },

    /**
     * Add a user to the temaisb_UserGroup in IAM Identity Center.
     * @param {string} userEmail - Corporate email of the user
     * @returns {object} { success: boolean, data?: object, error?: string }
     */
    addUserToGroup: function(userEmail) {
        var restMessage = new sn_ws.RESTMessageV2('ISB_IDC_UserGroup_API', 'AddUserToGroup');
        restMessage.setStringParameterNoEscape('user_email', userEmail);
        restMessage.setStringParameterNoEscape('identity_store_id', this.identityStoreId);
        restMessage.setStringParameterNoEscape('idc_api_key', this.apiKey);
        restMessage.setHttpTimeout(30000);

        var response   = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body       = response.getBody();

        gs.info('ISBUserGroupManager.addUserToGroup: HTTP ' + httpStatus + ' for ' + userEmail);

        if (httpStatus != 200 && httpStatus != 201) {
            var parsed;
            try { parsed = JSON.parse(body); } catch(e) { parsed = {}; }

            if (httpStatus == 409 || (parsed.message && parsed.message.indexOf('already a member') > -1)) {
                gs.info('ISBUserGroupManager.addUserToGroup: User ' + userEmail + ' already in group - continuing.');
                return { success: true, alreadyMember: true, data: parsed };
            }

            gs.error('ISBUserGroupManager.addUserToGroup: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        return { success: true, data: JSON.parse(body) };
    },

    /**
     * Remove a user from the temaisb_UserGroup in IAM Identity Center.
     * @param {string} userEmail - Corporate email of the user
     * @returns {object} { success: boolean, data?: object, error?: string }
     */
    removeUserFromGroup: function(userEmail) {
        var restMessage = new sn_ws.RESTMessageV2('ISB_IDC_UserGroup_API', 'RemoveUserFromGroup');
        restMessage.setStringParameterNoEscape('user_email', userEmail);
        restMessage.setStringParameterNoEscape('identity_store_id', this.identityStoreId);
        restMessage.setStringParameterNoEscape('idc_api_key', this.apiKey);
        restMessage.setHttpTimeout(30000);

        var response   = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body       = response.getBody();

        gs.info('ISBUserGroupManager.removeUserFromGroup: HTTP ' + httpStatus + ' for ' + userEmail);

        if (httpStatus != 200) {
            gs.error('ISBUserGroupManager.removeUserFromGroup: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        return { success: true, data: JSON.parse(body) };
    },

    type: 'ISBUserGroupManager'
};
