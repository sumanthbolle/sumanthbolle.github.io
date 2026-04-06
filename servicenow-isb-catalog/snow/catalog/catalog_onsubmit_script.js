/**
 * Catalog Client Script – onSubmit
 * Catalog Item: Temasek – AWS Innovation Sandbox Account (Assign / Release)
 *
 * Validates form before submission.
 * Type: onSubmit
 */

function onSubmit() {
    var requestType = g_form.getValue('request_type');
    var acceptTerms = g_form.getValue('accept_terms');

    if (acceptTerms !== 'true' && acceptTerms !== '1') {
        g_form.addErrorMessage('You must accept the Terms of Service before submitting.');
        return false;
    }

    if (requestType === 'assign') {
        var email = g_form.getValue('requester_email');
        if (!email || email.indexOf('@') === -1) {
            g_form.addErrorMessage('A valid corporate email address is required.');
            return false;
        }

        var budget = parseInt(g_form.getValue('max_budget_usd'), 10);
        if (isNaN(budget) || budget < 10 || budget > 1000) {
            g_form.addErrorMessage('Budget must be between $10 and $1,000.');
            return false;
        }

        var justification = g_form.getValue('business_justification');
        if (!justification || justification.trim().length < 20) {
            g_form.addErrorMessage('Please provide a detailed business justification (minimum 20 characters).');
            return false;
        }
    }

    if (requestType === 'release') {
        var leaseId = g_form.getValue('existing_lease_id');
        if (!leaseId || leaseId.trim().length === 0) {
            g_form.addErrorMessage('Existing Lease ID is required for release requests.');
            return false;
        }
    }

    return true;
}
