// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CIROOS INCIDENT MANAGEMENT — PROTECTION POLICY FIX                       ║
// ║                                                                            ║
// ║  Sets appropriate sys_policy on all Script Includes and Business Rules.   ║
// ║  Run in Scripts - Background AFTER the security and certification fixes.  ║
// ║                                                                            ║
// ║  Protection Policy Levels:                                                ║
// ║    ""          = None — customer can read, edit, and delete               ║
// ║    "read"      = Read — customer can read source but not edit             ║
// ║    "protected" = Protected — customer cannot read or edit the source      ║
// ║                                                                            ║
// ║  For Store apps, ServiceNow recommends "protected" for core logic         ║
// ║  that contains your IP, and "read" for code customers may need to         ║
// ║  reference for debugging or extension.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝


// ════════════════════════════════════════════════════════════════════════════════
// PART 1 — Script Include Protection Policies
//
// Strategy:
//   "protected" for handlers containing core integration logic (your IP)
//   "read" for the utility/config SI that customers may need to reference
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var policies = {
        'CiroosInboundHandler':      'protected',
        'CiroosOutboundHandler':     'protected',
        'CiroosFieldConfigHelper':   'protected',
        'CiroosIntegrationConfig':   'protected',
        'CiroosUtils':               'read'
    };

    for (var name in policies) {
        var gr = new GlideRecord('sys_script_include');
        gr.addQuery('name', name);
        gr.addQuery('sys_scope', APP_SCOPE);
        gr.query();

        if (gr.next()) {
            var current = gr.getValue('sys_policy') || '';
            var target = policies[name];

            if (current === target) {
                gs.info('PROTECTION: Script Include "' + name + '" already set to "' + target + '" — OK');
            } else {
                gr.setValue('sys_policy', target);
                gr.update();
                gs.info('PROTECTION: Script Include "' + name + '" changed from "' + current + '" to "' + target + '"');
            }
        } else {
            gs.warn('PROTECTION: Script Include "' + name + '" not found');
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 2 — Business Rule Protection Policies
//
// Strategy:
//   "protected" for all BRs — they contain integration logic that
//   customers should not modify (modifications could break loop
//   prevention, outbound sync, or assignment strategy).
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var brNames = [
        'Ciroos - Loop Prevention Guard',
        'Ciroos - Apply Assignment Strategy',
        'Ciroos - Apply Default Values',
        'Ciroos - Outbound Notification',
        'Incident Updated Trigger to Ciroos'
    ];

    for (var i = 0; i < brNames.length; i++) {
        var gr = new GlideRecord('sys_script');
        gr.addQuery('name', brNames[i]);
        gr.addQuery('sys_scope', APP_SCOPE);
        gr.query();

        if (gr.next()) {
            var current = gr.getValue('sys_policy') || '';

            if (current === 'protected') {
                gs.info('PROTECTION: BR "' + brNames[i] + '" already set to "protected" — OK');
            } else {
                gr.setValue('sys_policy', 'protected');
                gr.update();
                gs.info('PROTECTION: BR "' + brNames[i] + '" changed from "' +
                    (current || 'none') + '" to "protected"');
            }
        } else {
            gs.warn('PROTECTION: BR "' + brNames[i] + '" not found');
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 3 — Script Action Protection Policy
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    var gr = new GlideRecord('sysevent_script_action');
    gr.addQuery('name', 'Ciroos - Outbound Sender');
    gr.addQuery('sys_scope', APP_SCOPE);
    gr.query();

    if (gr.next()) {
        var current = gr.getValue('sys_policy') || '';
        if (current === 'protected') {
            gs.info('PROTECTION: Script Action "Ciroos - Outbound Sender" already "protected" — OK');
        } else {
            gr.setValue('sys_policy', 'protected');
            gr.update();
            gs.info('PROTECTION: Script Action "Ciroos - Outbound Sender" changed from "' +
                (current || 'none') + '" to "protected"');
        }
    } else {
        gs.warn('PROTECTION: Script Action "Ciroos - Outbound Sender" not found');
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 4 — REST API Operations (verify "protected")
//
// Your REST operations and definition are already "protected" — this
// verifies and catches any that may have been missed.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';

    // REST API Definition
    var wsDef = new GlideRecord('sys_ws_definition');
    wsDef.addQuery('sys_scope', APP_SCOPE);
    wsDef.query();
    while (wsDef.next()) {
        var current = wsDef.getValue('sys_policy') || '';
        if (current !== 'protected') {
            wsDef.setValue('sys_policy', 'protected');
            wsDef.update();
            gs.info('PROTECTION: REST API Def "' + wsDef.getValue('name') +
                '" changed from "' + (current || 'none') + '" to "protected"');
        } else {
            gs.info('PROTECTION: REST API Def "' + wsDef.getValue('name') + '" already "protected" — OK');
        }
    }

    // REST Operations
    var wsOp = new GlideRecord('sys_ws_operation');
    wsOp.addQuery('sys_scope', APP_SCOPE);
    wsOp.query();
    var opCount = 0;
    var opFixed = 0;
    while (wsOp.next()) {
        opCount++;
        var opCurrent = wsOp.getValue('sys_policy') || '';
        if (opCurrent !== 'protected') {
            wsOp.setValue('sys_policy', 'protected');
            wsOp.update();
            opFixed++;
            gs.info('PROTECTION: REST Op "' + wsOp.getValue('name') +
                '" changed from "' + (opCurrent || 'none') + '" to "protected"');
        }
    }
    gs.info('PROTECTION: REST Operations — ' + opCount + ' total, ' +
        opFixed + ' fixed, ' + (opCount - opFixed) + ' already correct');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 5 — VERIFICATION
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    gs.info('═══ PROTECTION POLICY VERIFICATION ═══');
    var APP_SCOPE = '051a81a993b372909d51afa877373c18';
    var allGood = true;

    // Script Includes
    var si = new GlideRecord('sys_script_include');
    si.addQuery('sys_scope', APP_SCOPE);
    si.query();
    while (si.next()) {
        var policy = si.getValue('sys_policy') || '';
        var name = si.getValue('name');
        if (policy === 'protected' || policy === 'read') {
            gs.info('  ✓ SI "' + name + '" → ' + policy);
        } else {
            gs.error('  ✗ SI "' + name + '" → "' + (policy || 'NONE') + '" — NEEDS PROTECTION');
            allGood = false;
        }
    }

    // Business Rules
    var br = new GlideRecord('sys_script');
    br.addQuery('sys_scope', APP_SCOPE);
    br.query();
    while (br.next()) {
        var brPolicy = br.getValue('sys_policy') || '';
        var brName = br.getValue('name');
        if (brPolicy === 'protected') {
            gs.info('  ✓ BR "' + brName + '" → protected');
        } else {
            gs.error('  ✗ BR "' + brName + '" → "' + (brPolicy || 'NONE') + '" — NEEDS PROTECTION');
            allGood = false;
        }
    }

    // Script Action
    var sa = new GlideRecord('sysevent_script_action');
    sa.addQuery('sys_scope', APP_SCOPE);
    sa.query();
    while (sa.next()) {
        var saPolicy = sa.getValue('sys_policy') || '';
        var saName = sa.getValue('name');
        if (saPolicy === 'protected') {
            gs.info('  ✓ SA "' + saName + '" → protected');
        } else {
            gs.error('  ✗ SA "' + saName + '" → "' + (saPolicy || 'NONE') + '" — NEEDS PROTECTION');
            allGood = false;
        }
    }

    // REST API
    var ws = new GlideRecord('sys_ws_definition');
    ws.addQuery('sys_scope', APP_SCOPE);
    ws.query();
    while (ws.next()) {
        var wsPolicy = ws.getValue('sys_policy') || '';
        if (wsPolicy === 'protected') {
            gs.info('  ✓ REST API "' + ws.getValue('name') + '" → protected');
        } else {
            gs.error('  ✗ REST API "' + ws.getValue('name') + '" → "' + (wsPolicy || 'NONE') + '"');
            allGood = false;
        }
    }

    var wsOp = new GlideRecord('sys_ws_operation');
    wsOp.addQuery('sys_scope', APP_SCOPE);
    wsOp.query();
    var protectedOps = 0;
    var unprotectedOps = 0;
    while (wsOp.next()) {
        if ((wsOp.getValue('sys_policy') || '') === 'protected') {
            protectedOps++;
        } else {
            unprotectedOps++;
            gs.error('  ✗ REST Op "' + wsOp.getValue('name') + '" unprotected');
            allGood = false;
        }
    }
    if (protectedOps > 0 && unprotectedOps === 0) {
        gs.info('  ✓ All ' + protectedOps + ' REST Operations → protected');
    }

    // UI Pages
    var uiPage = new GlideRecord('sys_ui_page');
    uiPage.addQuery('sys_scope', APP_SCOPE);
    uiPage.query();
    while (uiPage.next()) {
        var upPolicy = uiPage.getValue('sys_policy') || '';
        var upName = uiPage.getValue('name');
        if (upPolicy === 'protected') {
            gs.info('  ✓ UI Page "' + upName + '" → protected');
        } else {
            gs.warn('  ⚠ UI Page "' + upName + '" → "' + (upPolicy || 'NONE') + '"');
        }
    }

    gs.info('═══ VERIFICATION COMPLETE — ' +
        (allGood ? 'ALL CHECKS PASSED ✓' : 'SOME ITEMS NEED ATTENTION ⚠') + ' ═══');
})();
