/**
 * Script Include: ISBLambdaStartManager
 * Scope: Global (or scoped app: x_tema_isb)
 *
 * Triggers the AWS Lambda start script based on scheduled start time
 * and updates the S3 bucket with sandbox configuration.
 *
 * This is API 1 in the provisioning flow (called before ISB lease creation).
 *
 * System Properties Required:
 *   x_tema_isb.lambda_start_api_url  - API Gateway URL for Lambda start
 *   x_tema_isb.lambda_api_key        - API key for Lambda endpoint
 *   x_tema_isb.s3_bucket_name        - S3 bucket for sandbox configuration
 */

var ISBLambdaStartManager = Class.create();
ISBLambdaStartManager.prototype = {
    initialize: function() {
        this.apiUrl     = gs.getProperty('x_tema_isb.lambda_start_api_url', '');
        this.apiKey     = gs.getProperty('x_tema_isb.lambda_api_key', '');
        this.s3Bucket   = gs.getProperty('x_tema_isb.s3_bucket_name', '');

        if (!this.apiUrl) {
            throw new Error('ISBLambdaStartManager: x_tema_isb.lambda_start_api_url is not configured.');
        }
    },

    /**
     * Trigger the Lambda start script and S3 bucket update.
     * @param {string} userEmail - User email
     * @param {string} startTime - ISO 8601 start time
     * @param {string} leaseId - Lease ID (may be empty for pre-creation)
     * @param {string} awsRegion - Target AWS region
     * @param {string} action - "start" or "stop"
     * @returns {object} { success: boolean, data?: object, error?: string }
     */
    triggerStartScript: function(userEmail, startTime, leaseId, awsRegion, action) {
        action = action || 'start';

        var restMessage = new sn_ws.RESTMessageV2('ISB_Lambda_Start_Script', 'TriggerStartScript');
        restMessage.setStringParameterNoEscape('user_email', userEmail);
        restMessage.setStringParameterNoEscape('start_time', startTime);
        restMessage.setStringParameterNoEscape('lease_id', leaseId || '');
        restMessage.setStringParameterNoEscape('s3_bucket_name', this.s3Bucket);
        restMessage.setStringParameterNoEscape('aws_region', awsRegion);
        restMessage.setStringParameterNoEscape('action', action);
        restMessage.setStringParameterNoEscape('lambda_api_key', this.apiKey);
        restMessage.setHttpTimeout(60000);

        var response   = restMessage.execute();
        var httpStatus = response.getStatusCode();
        var body       = response.getBody();

        gs.info('ISBLambdaStartManager.triggerStartScript: HTTP ' + httpStatus +
                ' action=' + action + ' user=' + userEmail);

        if (httpStatus != 200 && httpStatus != 202) {
            gs.error('ISBLambdaStartManager.triggerStartScript: Failed - HTTP ' + httpStatus + ': ' + body);
            return { success: false, error: body, httpStatus: httpStatus };
        }

        var parsed;
        try { parsed = JSON.parse(body); } catch(e) { parsed = { rawBody: body }; }
        return { success: true, data: parsed };
    },

    type: 'ISBLambdaStartManager'
};
