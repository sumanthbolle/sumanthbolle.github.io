const fs = require('fs');

let posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));
let interviews = JSON.parse(fs.readFileSync('data/interviews.json', 'utf8'));

let pFixes = 0;
let iFixes = 0;

function fixPost(id, old, nw) {
  const p = posts.find(x => x.id === id);
  if (!p) { console.log('  SKIP: post ' + id + ' not found'); return; }
  if (!p.content.includes(old)) { console.log('  SKIP: post ' + id + ' string not found: ' + old.substring(0,60)); return; }
  p.content = p.content.replace(old, nw);
  pFixes++;
}

function fixPostAll(id, old, nw) {
  const p = posts.find(x => x.id === id);
  if (!p) return;
  while (p.content.includes(old)) { p.content = p.content.replace(old, nw); pFixes++; }
}

function fixInterview(id, old, nw) {
  const iv = interviews.find(i => i.id === id);
  if (!iv) { console.log('  SKIP: interview ' + id + ' not found'); return; }
  if (!iv.answer.includes(old)) { console.log('  SKIP: interview ' + id + ' string not found: ' + old.substring(0,60)); return; }
  iv.answer = iv.answer.replace(old, nw);
  iFixes++;
}

// ========================================================
// 1. Post 65: gs.sleep() does not exist
// Replace with scheduling pattern
// ========================================================
console.log('Fixing Post 65: gs.sleep()...');
fixPost(65,
  "// Exponential backoff + jitter\n                var delay = baseDelay * Math.pow(2, retryCount - 1) + (Math.random() * 1000);\n                gs.sleep(delay);",
  "// Exponential backoff: schedule a retry via event queue\n                // Note: gs.sleep() does not exist in ServiceNow.\n                // Use event-driven retries or Flow Designer Wait actions instead.\n                gs.eventQueue('x_int.retry_integration', current, correlationId, String(retryCount));"
);

// ========================================================
// 2. Post 71: Fabricated APIs in Hands-On block
// Replace the FlowAPI usage with correct syntax
// ========================================================
console.log('Fixing Post 71: FlowAPI syntax...');
fixPost(71,
  "// Auto-remediate: Restart app process\n        var flow = new sn_fd.FlowAPI();\n        var inputs = { 'ci_id': gr.sys_id, 'action': 'restart_tomcat' };\n        flow.startFlow('global.auto_remediate_cpu', null, inputs);",
  "// Auto-remediate: Trigger a Flow Designer flow\n        // sn_fd.FlowAPI uses a static builder pattern, not a constructor\n        sn_fd.FlowAPI.getRunner()\n            .flow('global.auto_remediate_cpu')\n            .inBackground()\n            .withInputs({ ci_id: gr.sys_id, action: 'restart_tomcat' })\n            .run();"
);

// Also fix the fabricated log_analytics_signal table reference
fixPost(71,
  "var logEntry = new GlideRecord('log_analytics_signal');\n        logEntry.initialize();\n        logEntry.message = 'High CPU on ' + gr.name + ' impacting ' + serviceGr.name;\n        logEntry.severity = 3;\n        logEntry.insert();",
  "// Log the anomaly as an event (Health Log Analytics ingests events)\n        var event = new GlideRecord('em_event');\n        event.initialize();\n        event.source = 'Custom-CMDB-Monitor';\n        event.node = gr.name;\n        event.type = 'High CPU';\n        event.description = 'High CPU on ' + gr.name + ' impacting ' + serviceGr.name;\n        event.severity = 3;\n        event.insert();"
);

// Fix dependent_cis which is not a real CMDB field
fixPost(71,
  "serviceGr.addQuery('dependent_cis', 'CONTAINS', gr.sys_id);",
  "// Use cmdb_rel_ci to find upstream services impacted by this CI\n    var relGr = new GlideRecord('cmdb_rel_ci');\n    relGr.addQuery('child', gr.sys_id);\n    relGr.query();\n    if (relGr.next()) {\n        var serviceGr = new GlideRecord('cmdb_ci_service');\n        serviceGr.get(relGr.getValue('parent'));"
);
// Fix the corresponding close bracket
fixPost(71,
  "serviceGr.query();\n    if (serviceGr.next()) {",
  "if (serviceGr.isValidRecord()) {"
);

// ========================================================
// 3. Post 69: sys_app insert via GlideRecord (not possible)
// Replace with catalog request pattern
// ========================================================
console.log('Fixing Post 69: sys_app GlideRecord insert...');
fixPost(69,
  "// Create scoped app metadata via Studio-equivalent\n    var appGR = new GlideRecord('sys_app');\n    appGR.initialize();\n    appGR.name = 'Generated from Catalog: ' + inputs.app_name;\n    appGR.scope = 'x_custom_humanitec'; // Your dev namespace\n    appGR.insert();\n    \n    // Trigger Flow Designer: Like Humanitec deployment\n    var flowAPI = new sn_fd.FlowAPI();\n    flowAPI.startFlow('global.humanitec_deploy_flow', null, {\n        app_id: appGR.sys_id,\n        blueprint: inputs\n    });",
  "// Note: Scoped applications cannot be created via GlideRecord.\n    // They are managed through Studio, App Engine Management Center,\n    // or the Application Manager. Instead, log the validated request\n    // and trigger a provisioning flow.\n    var reqGR = new GlideRecord('sc_req_item');\n    reqGR.initialize();\n    reqGR.short_description = 'App Provisioning: ' + inputs.app_name;\n    reqGR.insert();\n    \n    // Trigger the provisioning flow via correct FlowAPI syntax\n    sn_fd.FlowAPI.getRunner()\n        .flow('x_custom_humanitec.deploy_flow')\n        .inBackground()\n        .withInputs({ request_id: reqGR.sys_id, blueprint: inputs })\n        .run();"
);

// ========================================================
// 4. Post 64: vaActions.execute() is not a real VA API
// Replace with correct vaSystem/vaVars pattern
// ========================================================
console.log('Fixing Post 64: vaActions.execute()...');
fixPostAll(64,
  "vaActions.execute('show_message', {msg: 'Cannot access your account. Contact HR.'});",
  "vaVars.message = 'Cannot access your account. Contact HR.';"
);
fixPostAll(64,
  "vaActions.execute('show_message', {\n        msg: 'New password sent to ' + userEmail + '. Login at /sp.'\n    });",
  "vaVars.message = 'New password sent to ' + userEmail + '. Login at /sp.';"
);
fixPostAll(64,
  "vaActions.execute('no_match');",
  "vaVars.error = 'No account found for that email address.';\n    vaVars.success = false;"
);

// Also fix the insecure password storage
fixPost(64,
  "var tempPass = GlideStringUtil.base64Encode(gs.generateGUID().substring(0,8));\n    gr.setValue('u_temp_password', tempPass);\n    gr.setWorkflow(false); // Bypass business rules for speed\n    gr.update();",
  "// Trigger the platform's built-in password reset mechanism\n    // Never store passwords in custom fields or use base64 (not encryption)\n    var pwdReset = new GlideRecord('pwd_reset_request');\n    pwdReset.initialize();\n    pwdReset.user = gr.sys_id;\n    pwdReset.insert();"
);

// Fix vaContext which is also not standard
fixPost(64,
  "vaContext.putVar('reset_user_sys_id', gr.getUniqueValue());",
  "vaVars.reset_user_sys_id = gr.getUniqueValue();"
);

// ========================================================
// 5. Post 70: Fix FlowAPI syntax
// ========================================================
console.log('Fixing Post 70: FlowAPI syntax...');
fixPost(70,
  "var flow = new sn_fd.FlowAPI();\n        flow.startFlow('global.humanitec_deploy_flow', null, {\n            app_id: appGR.sys_id,\n            blueprint: inputs\n        });",
  "sn_fd.FlowAPI.getRunner()\n        .flow('global.humanitec_deploy_flow')\n        .inBackground()\n        .withInputs({ app_id: appGR.sys_id, blueprint: inputs })\n        .run();"
);

// ========================================================
// 6. Interview 48: COUNT_DISTINCT not supported
// ========================================================
console.log('Fixing Interview 48: COUNT_DISTINCT...');
fixInterview(48,
  "ga.addAggregate('COUNT');\nga.addAggregate('COUNT_DISTINCT', 'sys_domain');",
  "ga.addAggregate('COUNT');\nga.groupBy('sys_domain'); // Group to count per domain"
);
fixInterview(48,
  "domains += ga.getAggregate('COUNT_DISTINCT', 'sys_domain');",
  "domains++; // Each group = one distinct domain"
);

// ========================================================
// 7. Interview 65: NotificationEmailTemplate
// ========================================================
console.log('Fixing Interview 65: NotificationEmailTemplate...');
fixInterview(65,
  "new NotificationEmailTemplate(notif).send(current.control_owner);",
  "gs.eventQueue('control.evidence.missing', current, current.getValue('control_owner'), '');"
);
// Remove the orphaned notif variable setup if present
fixInterview(65,
  "var notif = new GlideRecord('sysevent_email_action');\n            notif.get('name', 'GRC Evidence Missing Alert');\n            notif.mail_script = 'Evidence missing on control test: ' + current.sys_id;\n            ",
  "// Trigger notification via event queue (platform handles email delivery)\n            "
);

// ========================================================
// 8. Post 75: Fix stray </h2> tags (should be closing other elements)
// ========================================================
console.log('Fixing Post 75: malformed HTML...');
fixPost(75,
  "</li></ol></h2><h3>Q",
  "</li></ol>\n<h3>Q"
);
fixPost(75,
  "</li></ul></h2><h3>Q",
  "</li></ul>\n<h3>Q"
);

// ========================================================
// 9. Update Vancouver references to be release-agnostic
// ========================================================
console.log('Updating Vancouver references...');

// Post 71
fixPost(71, 'Procure Vancouver+ instance with ITOM Visibility license',
  'Ensure your instance has the ITOM Visibility license and plugins activated');

// Post 70
fixPost(70, 'zero ROI after six months of Vancouver upgrades',
  'zero ROI after six months of platform upgrades');

// Post 69
fixPost(69, "Fortune 500s adopting ServiceNow Vancouver+",
  "Fortune 500s adopting ServiceNow's latest releases");

// Post 67
fixPost(67, "// PDI: Vancouver+ with Now Assist &amp; Virtual Ag",
  "// PDI: Latest release with Now Assist &amp; Virtual Ag");
if (posts.find(p=>p.id===67)) {
  fixPost(67, "// PDI: Vancouver+ with Now Assist & Virtual Ag",
    "// PDI: Latest release with Now Assist & Virtual Ag");
}

// Post 66 - multiple refs
fixPostAll(66, 'Vancouver-era', 'earlier-release');
fixPostAll(66, 'Vancouver+', 'current release');
fixPostAll(66, 'Vancouver configs', 'older configs');
fixPostAll(66, 'Vancouver deprecation', 'platform deprecation cycles');

// Post 61
fixPostAll(61, 'Vancouver+ release', 'current platform release');
fixPostAll(61, 'Vancouver Process Mining', 'ServiceNow Process Mining');
fixPostAll(61, 'Vancouver sandbox', 'platform sandbox');

// Post 58
fixPost(58, 'Vancouver/Xanadu upgrades', 'platform upgrades');
fixPost(58, 'Vancouver+', 'current release');

// Post 57
fixPost(57, "ServiceNow Vancouver", "ServiceNow's latest release");

// Post 54
fixPost(54, "Vancouver→Yokohama", "across release");

// Post 50
fixPost(50, "Vancouver lags on cross-scope", "older releases lag on cross-scope");

// Post 46
fixPost(46, "Vancouver+; handles", "recent releases; handles");

// Interview 65
fixInterview(65, "Vancouver UX", "Next Experience UX");

// Interview 55
fixInterview(55, "Vancouver+ IntegrationHub", "IntegrationHub");

// Interview 51
fixInterview(51, "Vancouver-&gt;Washington upgrade drift",
  "cross-release upgrade drift");

// ========================================================
// WRITE
// ========================================================
fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
fs.writeFileSync('data/interviews.json', JSON.stringify(interviews, null, 2));
fs.copyFileSync('data/posts.json', 'posts.json');
fs.copyFileSync('data/interviews.json', 'interviews.json');

console.log('\nPost fixes applied: ' + pFixes);
console.log('Interview fixes applied: ' + iFixes);
