// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CIROOS INCIDENT MANAGEMENT — STORE CERTIFICATION FIX SCRIPTS             ║
// ║                                                                            ║
// ║  Run AFTER ciroos_security_fix_scripts.js                                  ║
// ║  Run each section individually in Scripts - Background                     ║
// ║  (System Definition > Scripts - Background)                               ║
// ║                                                                            ║
// ║  These scripts fix the remaining certification blockers that the           ║
// ║  security fix scripts did not cover.                                       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 1 — Create ACL for Client-Callable Script Include
//
// ServiceNow requires a platform-level ACL of type
// "client_callable_script_include" / operation "execute" on every
// client-callable Script Include. This is the #2 top certification failure.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var scriptIncludeName = 'CiroosIntegrationConfig';
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var existing = new GlideRecord('sys_security_acl');
    existing.addQuery('name', scriptIncludeName);
    existing.addQuery('type', 'client_callable_script_include');
    existing.addQuery('operation', 'execute');
    existing.query();

    if (existing.next()) {
        gs.info('CERT FIX 1: ACL already exists for ' + scriptIncludeName + ' — skipping');
        return;
    }

    var acl = new GlideRecord('sys_security_acl');
    acl.initialize();
    acl.setValue('name', scriptIncludeName);
    acl.setValue('operation', 'execute');
    acl.setValue('type', 'client_callable_script_include');
    acl.setValue('active', true);
    acl.setValue('admin_overrides', true);
    acl.setValue('advanced', false);
    acl.setValue('sys_scope', APP_SCOPE);
    var aclSysId = acl.insert();

    if (aclSysId) {
        var roleGR = new GlideRecord('sys_user_role');
        roleGR.addQuery('name', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        roleGR.query();
        if (roleGR.next()) {
            var aclRole = new GlideRecord('sys_security_acl_role');
            aclRole.initialize();
            aclRole.setValue('sys_security_acl', aclSysId);
            aclRole.setValue('sys_user_role', roleGR.getUniqueValue());
            aclRole.insert();
            gs.info('CERT FIX 1: Created client_callable_script_include ACL for ' +
                scriptIncludeName + ' with role ciroos_integration_config_user');
        } else {
            gs.warn('CERT FIX 1: ACL created but role not found — add role manually');
        }
    } else {
        gs.error('CERT FIX 1: Failed to create ACL');
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 2 — Add Roles to All Application Modules
//
// #4 top certification failure: modules without roles are visible to anyone
// who can see the Application Menu. All modules need explicit roles.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';
    var ROLE = 'x_ciroo_ciroos_i_0.ciroos_integration_config_user';

    var gr = new GlideRecord('sys_app_module');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.addQuery('roles', '');
    gr.query();

    var count = 0;
    while (gr.next()) {
        gr.setValue('roles', ROLE);
        gr.update();
        count++;
        gs.info('CERT FIX 2: Added role to module: ' +
            (gr.getValue('title') || gr.getValue('name') || gr.getUniqueValue()));
    }
    gs.info('CERT FIX 2: Updated ' + count + ' modules with role: ' + ROLE);
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 3 — Move Global-Scoped Event Registrations to App Scope
//
// Three event registrations are in Global scope (sys_package="Global")
// instead of the app scope. They will orphan on uninstall.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';
    var APP_PACKAGE = '051a81a993b372909d51afa877373c18';

    var eventNames = [
        'ciroos.incident.created',
        'ciroos.incident.updated',
        'ciroos.outbound.failed'
    ];

    for (var i = 0; i < eventNames.length; i++) {
        var gr = new GlideRecord('sysevent_register');
        gr.addQuery('event_name', eventNames[i]);
        gr.addQuery('sys_scope', APP_SCOPE);
        gr.query();

        while (gr.next()) {
            var currentPkg = gr.getValue('sys_package');
            if (currentPkg === 'global' || (currentPkg && currentPkg !== APP_PACKAGE)) {
                gr.setValue('sys_package', APP_PACKAGE);
                gr.update();
                gs.info('CERT FIX 3: Moved event "' + eventNames[i] + '" from Global to app scope');
            } else {
                gs.info('CERT FIX 3: Event "' + eventNames[i] + '" already in app scope — OK');
            }
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 4 — Remove/Deactivate Inactive Artifacts
//
// Inactive artifacts (modules, business rules) are clutter that can be
// flagged during certification review. Deactivate cleanly or remove.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    // 4A: Ensure legacy "Incident Updated Trigger to Ciroos" BR stays inactive
    var legacyBR = new GlideRecord('sys_script');
    legacyBR.addQuery('name', 'Incident Updated Trigger to Ciroos');
    legacyBR.addQuery('sys_scope', APP_SCOPE);
    legacyBR.query();
    if (legacyBR.next()) {
        if (legacyBR.getValue('active') == 'true' || legacyBR.getValue('active') == '1') {
            legacyBR.setValue('active', false);
            legacyBR.update();
            gs.info('CERT FIX 4A: Deactivated legacy BR');
        } else {
            gs.info('CERT FIX 4A: Legacy BR already inactive — OK');
        }
    }

    // 4B: Deactivate "Config Records" list module (inactive and roleless)
    var configListModule = new GlideRecord('sys_app_module');
    configListModule.addQuery('sys_scope', APP_SCOPE);
    configListModule.addQuery('active', false);
    configListModule.query();
    var deactivatedCount = 0;
    while (configListModule.next()) {
        deactivatedCount++;
        gs.info('CERT FIX 4B: Inactive module found: ' +
            (configListModule.getValue('title') || configListModule.getValue('name') || configListModule.getUniqueValue()) +
            ' — consider removing via Studio');
    }
    gs.info('CERT FIX 4B: Found ' + deactivatedCount + ' inactive modules — review for removal');
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 5 — Add filter_condition to Outbound Notification Business Rule
//
// Defense-in-depth: the script already filters by Ciroos origin, but adding
// a filter_condition on the BR record itself makes the intent visible to
// reviewers and reduces unnecessary rule evaluation.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var gr = new GlideRecord('sys_script');
    gr.addQuery('name', 'Ciroos - Outbound Notification');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.query();

    if (gr.next()) {
        var currentFilter = gr.getValue('filter_condition') || '';
        if (!currentFilter) {
            gr.setValue('filter_condition', 'correlation_idISNOTEMPTY^ORcontact_type=Ciroos');
            gr.update();
            gs.info('CERT FIX 5: Added filter_condition to Outbound Notification BR');
        } else {
            gs.info('CERT FIX 5: Outbound Notification BR already has filter_condition — OK');
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 6 — Use GlideRecordSecure in Client-Callable Script Include
//
// When a client-callable script include queries platform tables on behalf
// of a user, certification reviewers may flag use of GlideRecord instead
// of GlideRecordSecure. This script patches the CiroosIntegrationConfig
// script include to use GlideRecordSecure for platform table queries.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosIntegrationConfig');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.query();

    if (!gr.next()) {
        gs.error('CERT FIX 6: Could not find CiroosIntegrationConfig');
        return;
    }

    var script = gr.getValue('script');

    // Replace GlideRecord with GlideRecordSecure for platform table queries
    // Only target the three platform tables, not our custom config table
    var replacements = [
        {
            from: "new GlideRecord('sys_dictionary')",
            to: "new GlideRecordSecure('sys_dictionary')"
        },
        {
            from: "new GlideRecord('sys_choice')",
            to: "new GlideRecordSecure('sys_choice')"
        },
        {
            from: "new GlideRecord('sys_user_group')",
            to: "new GlideRecordSecure('sys_user_group')"
        }
    ];

    var changed = false;
    for (var i = 0; i < replacements.length; i++) {
        if (script.indexOf(replacements[i].from) > -1) {
            script = script.replace(
                new RegExp(replacements[i].from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                replacements[i].to
            );
            changed = true;
        }
    }

    if (changed) {
        gr.setValue('script', script);
        gr.update();
        gs.info('CERT FIX 6: Updated CiroosIntegrationConfig to use GlideRecordSecure for platform tables');
    } else {
        gs.info('CERT FIX 6: GlideRecordSecure already in use or no platform table queries found — OK');
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 7 — Set enforce_acl on all REST API Operations
//
// Each sys_ws_operation currently has empty enforce_acl.
// Setting it explicitly provides defense-in-depth.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    // First, find the parent REST API definition's ACL value
    var wsDef = new GlideRecord('sys_ws_definition');
    wsDef.addQuery('name', 'Ciroos Incident API');
    wsDef.addQuery('sys_scope', APP_SCOPE);
    wsDef.query();

    var parentAcl = '';
    if (wsDef.next()) {
        parentAcl = wsDef.getValue('enforce_acl') || '';
    }

    if (!parentAcl) {
        gs.warn('CERT FIX 7: Parent REST API definition has no enforce_acl — skipping operation-level fix. Set ACL on the parent Scripted REST API first.');
        return;
    }

    var gr = new GlideRecord('sys_ws_operation');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.addQuery('enforce_acl', '');
    gr.query();

    var count = 0;
    while (gr.next()) {
        gr.setValue('enforce_acl', parentAcl);
        gr.update();
        count++;
        gs.info('CERT FIX 7: Set enforce_acl on operation: ' + gr.getValue('name'));
    }

    gs.info('CERT FIX 7: Updated ' + count + ' REST operations with enforce_acl');
})();


// ════════════════════════════════════════════════════════════════════════════════
// CERT FIX 8 — VERIFICATION
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    gs.info('═══ CERTIFICATION FIX VERIFICATION ═══');
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';
    var allGood = true;

    // 1. Client-callable SI ACL
    var aclCheck = new GlideRecord('sys_security_acl');
    aclCheck.addQuery('name', 'CiroosIntegrationConfig');
    aclCheck.addQuery('type', 'client_callable_script_include');
    aclCheck.addQuery('operation', 'execute');
    aclCheck.query();
    if (aclCheck.next()) {
        gs.info('  ✓ Client-callable Script Include ACL exists');
    } else {
        gs.error('  ✗ Client-callable Script Include ACL MISSING');
        allGood = false;
    }

    // 2. Module roles
    var noRoleModules = new GlideRecord('sys_app_module');
    noRoleModules.addQuery('sys_scope', APP_SCOPE);
    noRoleModules.addQuery('active', true);
    noRoleModules.addQuery('roles', '');
    noRoleModules.query();
    if (noRoleModules.getRowCount() === 0) {
        gs.info('  ✓ All active modules have roles assigned');
    } else {
        gs.error('  ✗ ' + noRoleModules.getRowCount() + ' active modules still have no roles');
        allGood = false;
    }

    // 3. Global-scope events
    var globalEvents = new GlideRecord('sysevent_register');
    globalEvents.addQuery('sys_scope', APP_SCOPE);
    globalEvents.addQuery('sys_package', 'global');
    globalEvents.query();
    if (globalEvents.getRowCount() === 0) {
        gs.info('  ✓ No global-scoped event registrations');
    } else {
        gs.error('  ✗ ' + globalEvents.getRowCount() + ' events still in global scope');
        allGood = false;
    }

    // 4. Legacy BR inactive
    var legacyBR = new GlideRecord('sys_script');
    legacyBR.addQuery('name', 'Incident Updated Trigger to Ciroos');
    legacyBR.addQuery('sys_scope', APP_SCOPE);
    legacyBR.query();
    if (legacyBR.next() && legacyBR.getValue('active') != 'true') {
        gs.info('  ✓ Legacy BR is inactive');
    } else {
        gs.warn('  ⚠ Legacy BR status unclear — verify manually');
    }

    // 5. Outbound BR filter_condition
    var outboundBR = new GlideRecord('sys_script');
    outboundBR.addQuery('name', 'Ciroos - Outbound Notification');
    outboundBR.addQuery('sys_scope', APP_SCOPE);
    outboundBR.query();
    if (outboundBR.next() && outboundBR.getValue('filter_condition')) {
        gs.info('  ✓ Outbound Notification BR has filter_condition');
    } else {
        gs.warn('  ⚠ Outbound Notification BR missing filter_condition');
    }

    // 6. GlideRecordSecure usage
    var siCheck = new GlideRecord('sys_script_include');
    siCheck.addQuery('name', 'CiroosIntegrationConfig');
    siCheck.addQuery('sys_scope', APP_SCOPE);
    siCheck.query();
    if (siCheck.next()) {
        var script = siCheck.getValue('script');
        if (script.indexOf('GlideRecordSecure') > -1) {
            gs.info('  ✓ CiroosIntegrationConfig uses GlideRecordSecure for platform tables');
        } else {
            gs.warn('  ⚠ CiroosIntegrationConfig may still use GlideRecord for platform tables');
        }
    }

    // 7. REST enforce_acl
    var noAclOps = new GlideRecord('sys_ws_operation');
    noAclOps.addQuery('sys_scope', APP_SCOPE);
    noAclOps.addQuery('enforce_acl', '');
    noAclOps.query();
    if (noAclOps.getRowCount() === 0) {
        gs.info('  ✓ All REST operations have enforce_acl set');
    } else {
        gs.warn('  ⚠ ' + noAclOps.getRowCount() + ' REST operations still have empty enforce_acl');
    }

    gs.info('═══ VERIFICATION COMPLETE — ' +
        (allGood ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS NEED ATTENTION ⚠') + ' ═══');
})();
