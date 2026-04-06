// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CIROOS — CALLER_ID MAPPING FIX                                           ║
// ║                                                                            ║
// ║  Problem: When Ciroos creates an incident inbound, caller_id is never     ║
// ║  explicitly set to the service account. It either stays blank (if Ciroos  ║
// ║  doesn't send it), or gets set to whatever arbitrary value Ciroos passes. ║
// ║                                                                            ║
// ║  Fix: If caller_id is not provided in the payload (or is empty), default  ║
// ║  it to the Ciroos service account user (svc_ciroos). This ensures:        ║
// ║    - Every Ciroos incident has a valid caller_id                          ║
// ║    - SLAs and notifications that depend on caller_id work correctly       ║
// ║    - It's clear the incident was raised by the integration account       ║
// ║                                                                            ║
// ║  Also adds a new system property to make the caller mapping configurable. ║
// ║                                                                            ║
// ║  Run in Scripts - Background AFTER all other fix scripts.                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝


// ════════════════════════════════════════════════════════════════════════════════
// PART 1 — Create system property for default caller_id
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var propName = 'x_ciroo_ciroos_i_0.ciroos.integration.default_caller';

    var gr = new GlideRecord('sys_properties');
    gr.addQuery('name', propName);
    gr.query();

    if (!gr.next()) {
        gr.initialize();
        gr.setValue('name', propName);
        gr.setValue('value', 'svc_ciroos');
        gr.setValue('description',
            'Username of the ServiceNow user to set as caller_id on Ciroos-created incidents ' +
            'when the inbound payload does not provide one. Typically the Ciroos service account. ' +
            'Leave empty to skip auto-mapping (caller_id will remain blank unless Ciroos provides it).');
        gr.setValue('type', 'string');
        gr.setValue('is_private', false);
        gr.setValue('read_roles', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        gr.setValue('write_roles', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        gr.setValue('ignore_cache', true);
        gr.insert();
        gs.info('CALLER FIX: Created property "' + propName + '" with value "svc_ciroos"');
    } else {
        gs.info('CALLER FIX: Property "' + propName + '" already exists — OK');
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 2 — Update CiroosInboundHandler to auto-map caller_id
//
// Adds _applyCallerMapping() after _applyFields() in createIncident().
// If caller_id is still empty after field application, looks up the
// configured default caller by username and sets caller_id to their sys_id.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosInboundHandler');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.query();

    if (!gr.next()) {
        gs.error('CALLER FIX: Could not find CiroosInboundHandler');
        return;
    }

    var script = gr.getValue('script');

    // Check if fix already applied
    if (script.indexOf('_applyCallerMapping') > -1) {
        gs.info('CALLER FIX: _applyCallerMapping already present in CiroosInboundHandler — skipping');
        return;
    }

    // ── Inject _applyCallerMapping() call into createIncident() ──
    // Insert after _applyFields but before _applyDefaults
    var insertAfter = "this._applyFields(gr, payload, config);";
    var insertLine = insertAfter + "\n            this._applyCallerMapping(gr, payload);";
    script = script.replace(insertAfter, insertLine);

    // ── Add the _applyCallerMapping method before _applyDefaults ──
    var newMethod =
"    _applyCallerMapping: function(gr, payload) {\n" +
"        // If caller_id was already set by the payload, keep it\n" +
"        var currentCaller = gr.getValue('caller_id') || '';\n" +
"        if (currentCaller) return;\n" +
"\n" +
"        // If Ciroos sent a caller_id but it was empty/null, or didn't send it at all,\n" +
"        // look up the configured default caller (typically svc_ciroos service account)\n" +
"        var defaultCallerUsername = gs.getProperty(\n" +
"            'ciroos.integration.default_caller', '');\n" +
"\n" +
"        if (!defaultCallerUsername) {\n" +
"            this.utils.log('caller_id not set and no default_caller configured — leaving blank');\n" +
"            return;\n" +
"        }\n" +
"\n" +
"        var userGR = new GlideRecord('sys_user');\n" +
"        userGR.addQuery('user_name', defaultCallerUsername);\n" +
"        userGR.addQuery('active', true);\n" +
"        userGR.setLimit(1);\n" +
"        userGR.query();\n" +
"\n" +
"        if (userGR.next()) {\n" +
"            gr.setValue('caller_id', userGR.getUniqueValue());\n" +
"            this.utils.log('caller_id mapped to service account: ' +\n" +
"                defaultCallerUsername + ' (' + userGR.getUniqueValue() + ')');\n" +
"        } else {\n" +
"            this.utils.error('Default caller user not found: ' + defaultCallerUsername +\n" +
"                ' — caller_id will remain empty');\n" +
"        }\n" +
"    },\n\n";

    // Insert before _applyDefaults
    var insertBefore = "    _applyDefaults:";
    script = script.replace(insertBefore, newMethod + insertBefore);

    gr.setValue('script', script);
    gr.update();
    gs.info('CALLER FIX: Updated CiroosInboundHandler — added _applyCallerMapping()');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 3 — VERIFICATION
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    gs.info('═══ CALLER_ID MAPPING VERIFICATION ═══');
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    // Check property exists
    var prop = new GlideRecord('sys_properties');
    prop.addQuery('name', 'x_ciroo_ciroos_i_0.ciroos.integration.default_caller');
    prop.query();
    if (prop.next()) {
        gs.info('  ✓ Property "default_caller" exists with value: "' + prop.getValue('value') + '"');
    } else {
        gs.error('  ✗ Property "default_caller" NOT FOUND');
    }

    // Check script has the method
    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'CiroosInboundHandler');
    si.addQuery('sys_scope', APP_SCOPE);
    si.query();
    if (si.next()) {
        var script = si.getValue('script');
        if (script.indexOf('_applyCallerMapping') > -1) {
            gs.info('  ✓ CiroosInboundHandler has _applyCallerMapping() method');
        } else {
            gs.error('  ✗ CiroosInboundHandler MISSING _applyCallerMapping()');
        }

        if (script.indexOf('default_caller') > -1) {
            gs.info('  ✓ _applyCallerMapping reads default_caller property');
        } else {
            gs.error('  ✗ _applyCallerMapping does NOT reference default_caller property');
        }
    }

    // Check if the service account user exists
    var callerUsername = gs.getProperty(
        'x_ciroo_ciroos_i_0.ciroos.integration.default_caller', 'svc_ciroos');
    if (callerUsername) {
        var userGR = new GlideRecord('sys_user');
        userGR.addQuery('user_name', callerUsername);
        userGR.setLimit(1);
        userGR.query();
        if (userGR.next()) {
            gs.info('  ✓ Service account user "' + callerUsername +
                '" exists (sys_id: ' + userGR.getUniqueValue() + ', active: ' +
                userGR.getValue('active') + ')');
        } else {
            gs.warn('  ⚠ Service account user "' + callerUsername +
                '" NOT FOUND in sys_user — create this user before using the integration');
        }
    }

    gs.info('═══ VERIFICATION COMPLETE ═══');
})();
