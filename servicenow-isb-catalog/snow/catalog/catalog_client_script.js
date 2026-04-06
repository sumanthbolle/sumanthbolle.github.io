/**
 * Catalog Client Script
 * Catalog Item: Temasek – AWS Innovation Sandbox Account (Assign / Release)
 *
 * Controls form field visibility based on request_type selection.
 * Type: onChange
 * Variable: request_type
 * Applies to: Catalog Item / Variable Set
 */

function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) return;

    var isRelease = (newValue === 'release');
    var isAssign  = (newValue === 'assign');

    g_form.setDisplay('existing_lease_id', isRelease);
    g_form.setMandatory('existing_lease_id', isRelease);

    g_form.setDisplay('section_release', isRelease);

    g_form.setDisplay('lease_template_uuid', isAssign);
    g_form.setMandatory('lease_template_uuid', isAssign);
    g_form.setDisplay('sandbox_duration_hours', isAssign);
    g_form.setMandatory('sandbox_duration_hours', isAssign);
    g_form.setDisplay('max_budget_usd', isAssign);
    g_form.setMandatory('max_budget_usd', isAssign);
    g_form.setDisplay('aws_region', isAssign);
    g_form.setDisplay('cost_report_group', isAssign);
    g_form.setDisplay('start_date', isAssign);
    g_form.setDisplay('section_sandbox_config', isAssign);
}
