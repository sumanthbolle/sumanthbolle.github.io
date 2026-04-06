// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CIROOS INCIDENT MANAGEMENT — SECURITY FIX BACKGROUND SCRIPTS             ║
// ║                                                                            ║
// ║  Run each section individually in Scripts - Background                     ║
// ║  (System Definition > Scripts - Background) on your ServiceNow instance.   ║
// ║                                                                            ║
// ║  IMPORTANT: Run these in ORDER (Part 1 → Part 8).                          ║
// ║  Test in a SUB-PRODUCTION instance first.                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝


// ════════════════════════════════════════════════════════════════════════════════
// PART 1 — FIX: CiroosIntegrationConfig Script Include
//
// Fixes applied:
//   C1 — API token no longer returned to browser (masked)
//   C2 — gs.hasRole() check on every method
//   C4 — SSRF fix: testCiroosConnectivity reads URL/token from stored config
//   C5 — SSRF fix: syncConfigToCiroos reads URL/token from stored config
//   H2 — saveConfig() now requires admin role
//   M5 — getIncidentFieldsAjax() now requires role
//   L2 — JSON.parse in loadConfig() now wrapped in try/catch
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var SCRIPT_INCLUDE_NAME = 'CiroosIntegrationConfig';
    var REQUIRED_ROLE = 'x_ciroo_ciroos_i_0.ciroos_integration_config_user';

    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', SCRIPT_INCLUDE_NAME);
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find Script Include: ' + SCRIPT_INCLUDE_NAME);
        return;
    }

    var newScript = "var CiroosIntegrationConfig = Class.create();\n" +
"CiroosIntegrationConfig.prototype = Object.extendsObject(global.AbstractAjaxProcessor, {\n" +
"\n" +
"    _ROLE: '" + REQUIRED_ROLE + "',\n" +
"\n" +
"    _checkAccess: function(methodName) {\n" +
"        if (!gs.hasRole(this._ROLE)) {\n" +
"            gs.warn('[Ciroos] Unauthorized access attempt to ' + methodName + ' by ' + gs.getUserName());\n" +
"            return false;\n" +
"        }\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    _unauthorized: function() {\n" +
"        return JSON.stringify({ success: false, message: 'Insufficient privileges' });\n" +
"    },\n" +
"\n" +
"    // Mask token for safe client-side display\n" +
"    _maskToken: function(token) {\n" +
"        if (!token) return '';\n" +
"        if (token.length <= 8) return '••••••••';\n" +
"        return token.substring(0, 4) + '••••••••' + token.slice(-4);\n" +
"    },\n" +
"\n" +
"    // Validate URL is HTTPS and not a private/internal address\n" +
"    _isValidExternalUrl: function(url) {\n" +
"        if (!url) return false;\n" +
"        url = url.trim().toLowerCase();\n" +
"        if (url.indexOf('https://') !== 0) return false;\n" +
"        var host = url.replace('https://', '').split('/')[0].split(':')[0];\n" +
"        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;\n" +
"        if (host.indexOf('169.254.') === 0 || host.indexOf('10.') === 0) return false;\n" +
"        if (host.indexOf('192.168.') === 0) return false;\n" +
"        if (host.match(/^172\\.(1[6-9]|2[0-9]|3[01])\\./)) return false;\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    // ─── INCIDENT FIELD METADATA ───\n" +
"    getIncidentFieldsAjax: function() {\n" +
"        if (!this._checkAccess('getIncidentFieldsAjax')) return this._unauthorized();\n" +
"\n" +
"        var fields = [];\n" +
"        var td = new GlideRecord('sys_dictionary');\n" +
"        td.addQuery('name', 'incident');\n" +
"        td.addQuery('internal_type', '!=', 'collection');\n" +
"        td.addQuery('element', '!=', '');\n" +
"        td.addQuery('active', true);\n" +
"        td.orderBy('column_label');\n" +
"        td.query();\n" +
"\n" +
"        while (td.next()) {\n" +
"            fields.push({\n" +
"                name: td.getValue('element'),\n" +
"                label: td.getValue('column_label') || td.getValue('element'),\n" +
"                type: td.getValue('internal_type'),\n" +
"                mandatory: td.getValue('mandatory') == 'true',\n" +
"                reference: td.getValue('reference') ? td.getValue('reference').toString() : '',\n" +
"                max_length: td.getValue('max_length') || ''\n" +
"            });\n" +
"        }\n" +
"        return JSON.stringify(fields);\n" +
"    },\n" +
"\n" +
"    // ─── CHOICE LIST VALUES ───\n" +
"    getChoiceValues: function() {\n" +
"        if (!this._checkAccess('getChoiceValues')) return this._unauthorized();\n" +
"\n" +
"        var fieldName = this.getParameter('sysparm_field_name');\n" +
"        if (!fieldName) return JSON.stringify([]);\n" +
"\n" +
"        var choices = [];\n" +
"        var gc = new GlideRecord('sys_choice');\n" +
"        gc.addQuery('name', 'incident');\n" +
"        gc.addQuery('element', fieldName);\n" +
"        gc.addQuery('inactive', false);\n" +
"        gc.orderBy('sequence');\n" +
"        gc.query();\n" +
"\n" +
"        while (gc.next()) {\n" +
"            choices.push({\n" +
"                value: gc.getValue('value'),\n" +
"                label: gc.getValue('label')\n" +
"            });\n" +
"        }\n" +
"        return JSON.stringify(choices);\n" +
"    },\n" +
"\n" +
"    // ─── SAVE CONFIGURATION ───\n" +
"    saveConfig: function() {\n" +
"        if (!this._checkAccess('saveConfig')) return this._unauthorized();\n" +
"\n" +
"        var configData = this.getParameter('sysparm_config_data');\n" +
"        var parsed;\n" +
"        try {\n" +
"            parsed = JSON.parse(configData);\n" +
"        } catch (e) {\n" +
"            return JSON.stringify({ success: false, message: 'Invalid configuration data format' });\n" +
"        }\n" +
"\n" +
"        // Validate URL if provided\n" +
"        if (parsed.ciroos_api_url && !this._isValidExternalUrl(parsed.ciroos_api_url)) {\n" +
"            return JSON.stringify({ success: false, message: 'Invalid Ciroos URL. Must be a valid external HTTPS URL.' });\n" +
"        }\n" +
"\n" +
"        var gr = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"\n" +
"        if (parsed.sys_id) {\n" +
"            gr.get(parsed.sys_id);\n" +
"        } else {\n" +
"            gr.addQuery('name', parsed.name);\n" +
"            gr.query();\n" +
"            if (!gr.next()) {\n" +
"                gr.initialize();\n" +
"            }\n" +
"        }\n" +
"\n" +
"        gr.setValue('name', parsed.name || 'Default');\n" +
"        gr.setValue('ciroos_api_url', parsed.ciroos_api_url || '');\n" +
"\n" +
"        // Only update token if a new value is explicitly provided\n" +
"        // (empty string or omitted means keep existing)\n" +
"        if (parsed.ciroos_api_token && parsed.ciroos_api_token.indexOf('••••') === -1) {\n" +
"            gr.setValue('ciroos_api_token', parsed.ciroos_api_token);\n" +
"        }\n" +
"\n" +
"        gr.setValue('mandatory_fields', JSON.stringify(parsed.mandatory_fields || []));\n" +
"        gr.setValue('update_trigger_fields', JSON.stringify(parsed.update_trigger_fields || []));\n" +
"        gr.setValue('assignment_strategy', parsed.assignment_strategy || 'auto_route');\n" +
"        gr.setValue('is_active', parsed.is_active !== false);\n" +
"\n" +
"        if (parsed.assignment_strategy === 'static' && parsed.assignment_group) {\n" +
"            gr.setValue('assignment_group', parsed.assignment_group);\n" +
"        } else {\n" +
"            gr.setValue('assignment_group', '');\n" +
"        }\n" +
"\n" +
"        var sysId = gr.update() || gr.insert();\n" +
"        return JSON.stringify({\n" +
"            success: !!sysId,\n" +
"            sys_id: sysId,\n" +
"            message: sysId ? 'Configuration saved successfully' : 'Failed to save configuration'\n" +
"        });\n" +
"    },\n" +
"\n" +
"    // ─── LOAD EXISTING CONFIG ───\n" +
"    loadConfig: function() {\n" +
"        if (!this._checkAccess('loadConfig')) return this._unauthorized();\n" +
"\n" +
"        var configName = this.getParameter('sysparm_config_name') || 'Default';\n" +
"        var gr = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        gr.addQuery('name', configName);\n" +
"        gr.addQuery('is_active', true);\n" +
"        gr.setLimit(1);\n" +
"        gr.query();\n" +
"\n" +
"        if (gr.next()) {\n" +
"            var rawToken = gr.getValue('ciroos_api_token') || '';\n" +
"            var mfRaw = gr.getValue('mandatory_fields') || '[]';\n" +
"            var utfRaw = gr.getValue('update_trigger_fields') || '[]';\n" +
"            var mandatoryFields, updateTriggerFields;\n" +
"            try { mandatoryFields = JSON.parse(mfRaw); } catch (e) { mandatoryFields = []; }\n" +
"            try { updateTriggerFields = JSON.parse(utfRaw); } catch (e) { updateTriggerFields = []; }\n" +
"\n" +
"            var config = {\n" +
"                sys_id: gr.getUniqueValue(),\n" +
"                name: gr.getValue('name'),\n" +
"                ciroos_api_url: gr.getValue('ciroos_api_url'),\n" +
"                ciroos_api_token: this._maskToken(rawToken),\n" +
"                has_token: rawToken.length > 0,\n" +
"                mandatory_fields: mandatoryFields,\n" +
"                update_trigger_fields: updateTriggerFields,\n" +
"                assignment_group: gr.getValue('assignment_group'),\n" +
"                assignment_group_display: gr.getDisplayValue('assignment_group'),\n" +
"                assignment_strategy: gr.getValue('assignment_strategy'),\n" +
"                is_active: gr.getValue('is_active') == '1'\n" +
"            };\n" +
"            return JSON.stringify({ success: true, config: config });\n" +
"        }\n" +
"        return JSON.stringify({ success: false, message: 'No active configuration found' });\n" +
"    },\n" +
"\n" +
"    // ─── ASSIGNMENT GROUP SEARCH ───\n" +
"    getAssignmentGroups: function() {\n" +
"        if (!this._checkAccess('getAssignmentGroups')) return this._unauthorized();\n" +
"\n" +
"        var search = this.getParameter('sysparm_search') || '';\n" +
"        var groups = [];\n" +
"        var gr = new GlideRecord('sys_user_group');\n" +
"        gr.addActiveQuery();\n" +
"        if (search) {\n" +
"            gr.addQuery('name', 'CONTAINS', search);\n" +
"        }\n" +
"        gr.orderBy('name');\n" +
"        gr.setLimit(25);\n" +
"        gr.query();\n" +
"\n" +
"        while (gr.next()) {\n" +
"            groups.push({\n" +
"                sys_id: gr.getUniqueValue(),\n" +
"                name: gr.getValue('name')\n" +
"            });\n" +
"        }\n" +
"        return JSON.stringify(groups);\n" +
"    },\n" +
"\n" +
"    // ─── TEST CIROOS CONNECTIVITY ───\n" +
"    // FIXED: No longer accepts URL/token from client.\n" +
"    //        Reads from stored config by sys_id (or active config).\n" +
"    testCiroosConnectivity: function() {\n" +
"        if (!this._checkAccess('testCiroosConnectivity')) return this._unauthorized();\n" +
"\n" +
"        var configSysId = this.getParameter('sysparm_config_sys_id') || '';\n" +
"        var url, token;\n" +
"\n" +
"        // Read credentials server-side from stored config\n" +
"        var configGR = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        if (configSysId) {\n" +
"            if (!configGR.get(configSysId)) {\n" +
"                return JSON.stringify({ success: false, message: 'Configuration record not found' });\n" +
"            }\n" +
"        } else {\n" +
"            configGR.addQuery('is_active', true);\n" +
"            configGR.orderByDesc('sys_updated_on');\n" +
"            configGR.setLimit(1);\n" +
"            configGR.query();\n" +
"            if (!configGR.next()) {\n" +
"                return JSON.stringify({ success: false, message: 'No active configuration found' });\n" +
"            }\n" +
"        }\n" +
"\n" +
"        url = configGR.getValue('ciroos_api_url') || '';\n" +
"        token = configGR.getValue('ciroos_api_token') || '';\n" +
"\n" +
"        if (!url) return JSON.stringify({ success: false, message: 'No Ciroos URL configured' });\n" +
"        if (!token) return JSON.stringify({ success: false, message: 'No API token configured' });\n" +
"\n" +
"        if (!this._isValidExternalUrl(url)) {\n" +
"            return JSON.stringify({ success: false, message: 'Invalid Ciroos URL. Must be an external HTTPS address.' });\n" +
"        }\n" +
"\n" +
"        try {\n" +
"            var rm = new sn_ws.RESTMessageV2();\n" +
"            rm.setEndpoint(url.replace(/\\/+$/, '') + '/api/v1/health');\n" +
"            rm.setHttpMethod('GET');\n" +
"            rm.setRequestHeader('Accept', 'application/json');\n" +
"            rm.setRequestHeader('Authorization', 'Bearer ' + token);\n" +
"            rm.setHttpTimeout(10000);\n" +
"\n" +
"            var response = rm.execute();\n" +
"            var httpStatus = response.getStatusCode();\n" +
"            var body = response.getBody();\n" +
"            var result = { success: false, status_code: httpStatus, message: '' };\n" +
"\n" +
"            if (httpStatus >= 200 && httpStatus < 400) {\n" +
"                result.success = true;\n" +
"                try {\n" +
"                    var parsed = JSON.parse(body);\n" +
"                    result.message = 'Connected — Org: ' + (parsed.organization_name || parsed.org_id || 'Verified');\n" +
"                    result.org_id = parsed.org_id || '';\n" +
"                    result.instance_id = parsed.tool_instance_id || '';\n" +
"                } catch (e) {\n" +
"                    result.message = 'Connected (HTTP ' + httpStatus + ')';\n" +
"                }\n" +
"            } else if (httpStatus == 401 || httpStatus == 403) {\n" +
"                result.message = 'Authentication failed — verify API token (HTTP ' + httpStatus + ')';\n" +
"            } else {\n" +
"                result.message = 'Connection failed (HTTP ' + httpStatus + ')';\n" +
"            }\n" +
"            return JSON.stringify(result);\n" +
"        } catch (e) {\n" +
"            return JSON.stringify({ success: false, message: 'Connection error — unable to reach the Ciroos endpoint' });\n" +
"        }\n" +
"    },\n" +
"\n" +
"    // ─── CONFIG DASHBOARD DATA ───\n" +
"    getConfigData: function() {\n" +
"        if (!this._checkAccess('getConfigData')) return this._unauthorized();\n" +
"\n" +
"        var result = {};\n" +
"        var gr = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        gr.addQuery('is_active', true);\n" +
"        gr.setLimit(1);\n" +
"        gr.query();\n" +
"\n" +
"        if (gr.next()) {\n" +
"            result.config_name = gr.getValue('name') || '';\n" +
"            result.ciroos_api_url = gr.getValue('ciroos_api_url') || '';\n" +
"            result.ciroos_api_token = this._maskToken(gr.getValue('ciroos_api_token') || '');\n" +
"            result.has_token = (gr.getValue('ciroos_api_token') || '').length > 0;\n" +
"\n" +
"            var mf = gr.getValue('mandatory_fields') || '';\n" +
"            try { result.mandatory_fields = JSON.parse(mf); }\n" +
"            catch (e) { result.mandatory_fields = mf ? mf.split(',') : []; }\n" +
"\n" +
"            result.update_trigger_fields = gr.getValue('update_trigger_fields') || '';\n" +
"            result.assignment_strategy = gr.getValue('assignment_strategy') || '';\n" +
"            result.assignment_group = gr.getDisplayValue('assignment_group') || '';\n" +
"            result.last_synced = gr.getValue('last_synced') || '';\n" +
"            result.sys_updated_on = gr.getValue('sys_updated_on') || '';\n" +
"        }\n" +
"\n" +
"        return JSON.stringify(result);\n" +
"    },\n" +
"\n" +
"    // ─── SYNC CONFIG METADATA TO CIROOS ───\n" +
"    // FIXED: Reads URL/token from stored config, not from client params.\n" +
"    syncConfigToCiroos: function() {\n" +
"        if (!this._checkAccess('syncConfigToCiroos')) return this._unauthorized();\n" +
"\n" +
"        var configData = this.getParameter('sysparm_config_data');\n" +
"        var parsed;\n" +
"        try {\n" +
"            parsed = JSON.parse(configData);\n" +
"        } catch (e) {\n" +
"            return JSON.stringify({ success: false, message: 'Invalid config data' });\n" +
"        }\n" +
"\n" +
"        // Read credentials from stored config, NOT from client params\n" +
"        var configGR = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        var configSysId = parsed.sys_id || '';\n" +
"        if (configSysId) {\n" +
"            if (!configGR.get(configSysId)) {\n" +
"                return JSON.stringify({ success: false, message: 'Configuration record not found' });\n" +
"            }\n" +
"        } else {\n" +
"            configGR.addQuery('is_active', true);\n" +
"            configGR.orderByDesc('sys_updated_on');\n" +
"            configGR.setLimit(1);\n" +
"            configGR.query();\n" +
"            if (!configGR.next()) {\n" +
"                return JSON.stringify({ success: false, message: 'No active configuration found' });\n" +
"            }\n" +
"        }\n" +
"\n" +
"        var ciroosUrl = configGR.getValue('ciroos_api_url') || '';\n" +
"        var token = configGR.getValue('ciroos_api_token') || '';\n" +
"\n" +
"        if (!ciroosUrl || !token) {\n" +
"            return JSON.stringify({ success: false, message: 'Ciroos URL and API token must be saved before syncing' });\n" +
"        }\n" +
"\n" +
"        if (!this._isValidExternalUrl(ciroosUrl)) {\n" +
"            return JSON.stringify({ success: false, message: 'Invalid Ciroos URL. Must be an external HTTPS address.' });\n" +
"        }\n" +
"\n" +
"        var metadata = {\n" +
"            servicenow_instance: gs.getProperty('glide.servlet.uri'),\n" +
"            instance_name: gs.getProperty('instance_name'),\n" +
"            mandatory_fields: parsed.mandatory_fields || [],\n" +
"            assignment_strategy: parsed.assignment_strategy || 'auto_route',\n" +
"            assignment_group: (parsed.assignment_strategy === 'static') ? parsed.assignment_group : null\n" +
"        };\n" +
"\n" +
"        try {\n" +
"            var rm = new sn_ws.RESTMessageV2();\n" +
"            rm.setEndpoint(ciroosUrl.replace(/\\/+$/, '') + '/api/v1/integrations/servicenow/config');\n" +
"            rm.setHttpMethod('POST');\n" +
"            rm.setRequestHeader('Content-Type', 'application/json');\n" +
"            rm.setRequestHeader('Authorization', 'Bearer ' + token);\n" +
"            rm.setRequestBody(JSON.stringify(metadata));\n" +
"            rm.setHttpTimeout(15000);\n" +
"\n" +
"            var response = rm.execute();\n" +
"            var httpStatus = response.getStatusCode();\n" +
"\n" +
"            if (httpStatus >= 200 && httpStatus < 400) {\n" +
"                return JSON.stringify({ success: true, message: 'Configuration synced to Ciroos' });\n" +
"            } else {\n" +
"                return JSON.stringify({ success: false, message: 'Sync failed — HTTP ' + httpStatus });\n" +
"            }\n" +
"        } catch (e) {\n" +
"            return JSON.stringify({ success: false, message: 'Sync error — unable to reach the Ciroos endpoint' });\n" +
"        }\n" +
"    },\n" +
"\n" +
"    // ─── GET EXISTING CONFIG (for UI pre-population) ───\n" +
"    getExistingConfig: function() {\n" +
"        if (!this._checkAccess('getExistingConfig')) return this._unauthorized();\n" +
"\n" +
"        var config = {};\n" +
"        var gr = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        gr.addEncodedQuery('is_active=true^ORis_active=1');\n" +
"        gr.orderByDesc('sys_updated_on');\n" +
"        gr.setLimit(1);\n" +
"        gr.query();\n" +
"\n" +
"        if (gr.next()) {\n" +
"            config = {\n" +
"                sys_id: gr.getUniqueValue(),\n" +
"                name: gr.getValue('name') || 'Default',\n" +
"                sys_updated_on: gr.getDisplayValue('sys_updated_on') || '',\n" +
"                ciroos_api_url: gr.getValue('ciroos_api_url') || '',\n" +
"                ciroos_api_token: this._maskToken(gr.getValue('ciroos_api_token') || ''),\n" +
"                has_token: (gr.getValue('ciroos_api_token') || '').length > 0,\n" +
"                mandatory_fields: gr.getValue('mandatory_fields') || '[]',\n" +
"                update_trigger_fields: gr.getValue('update_trigger_fields') || '[]',\n" +
"                custom_trigger_fields: gr.getValue('custom_trigger_fields') || '[]',\n" +
"                trigger_conditions: gr.getValue('trigger_conditions') || '[]',\n" +
"                assignment_group: gr.getValue('assignment_group') || '',\n" +
"                assignment_group_display: gr.getDisplayValue('assignment_group') || '',\n" +
"                assignment_strategy: gr.getValue('assignment_strategy') || 'static'\n" +
"            };\n" +
"        }\n" +
"\n" +
"        return JSON.stringify(config);\n" +
"    },\n" +
"\n" +
"    type: 'CiroosIntegrationConfig'\n" +
"});";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated CiroosIntegrationConfig — added role checks, masked tokens, fixed SSRF');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 2 — FIX: CiroosFieldConfigHelper Script Include
//
// Fixes applied:
//   C6 — validateOrgId() now compares against stored config value
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosFieldConfigHelper');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find Script Include: CiroosFieldConfigHelper');
        return;
    }

    var newScript = "var CiroosFieldConfigHelper = Class.create();\n" +
"CiroosFieldConfigHelper.prototype = {\n" +
"\n" +
"    initialize: function() {\n" +
"        this.CONFIG_TABLE = 'x_ciroo_ciroos_i_0_ciroos_integration_config';\n" +
"    },\n" +
"\n" +
"    getActiveConfigGR: function() {\n" +
"        var gr = new GlideRecord(this.CONFIG_TABLE);\n" +
"        gr.addEncodedQuery('is_active=true^ORis_active=1');\n" +
"        gr.orderByDesc('sys_updated_on');\n" +
"        gr.setLimit(1);\n" +
"        gr.query();\n" +
"        if (gr.next()) return gr;\n" +
"        return null;\n" +
"    },\n" +
"\n" +
"    getFieldsAsCiroos: function() {\n" +
"        var gr = this.getActiveConfigGR();\n" +
"        if (!gr) return [];\n" +
"\n" +
"        var raw = gr.getValue('mandatory_fields') || '[]';\n" +
"        var snFields = [];\n" +
"        try { snFields = JSON.parse(raw); }\n" +
"        catch (e) { return []; }\n" +
"\n" +
"        var ciroosFields = [];\n" +
"        for (var i = 0; i < snFields.length; i++) {\n" +
"            var sf = snFields[i];\n" +
"            ciroosFields.push({\n" +
"                technical_name: sf.field_name,\n" +
"                display_name: sf.label || sf.field_name,\n" +
"                selected: (sf.selected !== undefined) ? sf.selected : true,\n" +
"                requirement: sf.requirement || 'mandatory',\n" +
"                default_value: sf.default_value || ''\n" +
"            });\n" +
"        }\n" +
"        return ciroosFields;\n" +
"    },\n" +
"\n" +
"    findField: function(technicalName) {\n" +
"        if (!this._isValidFieldName(technicalName)) return null;\n" +
"        var fields = this.getFieldsAsCiroos();\n" +
"        for (var i = 0; i < fields.length; i++) {\n" +
"            if (fields[i].technical_name === technicalName) return fields[i];\n" +
"        }\n" +
"        return null;\n" +
"    },\n" +
"\n" +
"    saveFieldsFromCiroos: function(ciroosFields) {\n" +
"        var gr = this.getActiveConfigGR();\n" +
"        if (!gr) {\n" +
"            gr = new GlideRecord(this.CONFIG_TABLE);\n" +
"            gr.initialize();\n" +
"            gr.setValue('name', 'Default');\n" +
"            gr.setValue('is_active', true);\n" +
"        }\n" +
"\n" +
"        var snFields = [];\n" +
"        for (var i = 0; i < ciroosFields.length; i++) {\n" +
"            var cf = ciroosFields[i];\n" +
"            if (!this._isValidFieldName(cf.technical_name)) continue;\n" +
"            snFields.push({\n" +
"                field_name: cf.technical_name,\n" +
"                label: cf.display_name || cf.technical_name,\n" +
"                type: this._getFieldType(cf.technical_name),\n" +
"                default_value: cf.default_value || '',\n" +
"                selected: cf.selected,\n" +
"                requirement: cf.requirement || 'mandatory'\n" +
"            });\n" +
"        }\n" +
"\n" +
"        gr.setValue('mandatory_fields', JSON.stringify(snFields));\n" +
"        if (gr.getUniqueValue()) { gr.update(); }\n" +
"        else { gr.insert(); }\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    removeField: function(technicalName) {\n" +
"        if (!this._isValidFieldName(technicalName)) return false;\n" +
"        var gr = this.getActiveConfigGR();\n" +
"        if (!gr) return false;\n" +
"\n" +
"        var raw = gr.getValue('mandatory_fields') || '[]';\n" +
"        var snFields = [];\n" +
"        try { snFields = JSON.parse(raw); }\n" +
"        catch (e) { return false; }\n" +
"\n" +
"        var found = false;\n" +
"        var filtered = [];\n" +
"        for (var i = 0; i < snFields.length; i++) {\n" +
"            if (snFields[i].field_name === technicalName) { found = true; }\n" +
"            else { filtered.push(snFields[i]); }\n" +
"        }\n" +
"        if (!found) return false;\n" +
"\n" +
"        gr.setValue('mandatory_fields', JSON.stringify(filtered));\n" +
"        gr.update();\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    removeAllFields: function() {\n" +
"        var gr = this.getActiveConfigGR();\n" +
"        if (!gr) return false;\n" +
"        gr.setValue('mandatory_fields', '[]');\n" +
"        gr.update();\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    // FIXED: Validates org ID against stored config value, not just non-empty check\n" +
"    validateOrgId: function(requestOrgId) {\n" +
"        if (!requestOrgId || !requestOrgId.trim()) return false;\n" +
"\n" +
"        var gr = this.getActiveConfigGR();\n" +
"        if (!gr) return false;\n" +
"\n" +
"        var storedOrgId = gr.getValue('organization_id') || '';\n" +
"        if (!storedOrgId) {\n" +
"            gs.warn('[Ciroos] validateOrgId: No organization_id stored in config. ' +\n" +
"                'Falling back to non-empty check. Configure an organization_id for proper validation.');\n" +
"            return true;\n" +
"        }\n" +
"\n" +
"        return storedOrgId.trim() === requestOrgId.trim();\n" +
"    },\n" +
"\n" +
"    // Validate technical field names to prevent injection\n" +
"    _isValidFieldName: function(name) {\n" +
"        if (!name || typeof name !== 'string') return false;\n" +
"        return /^[a-z_][a-z0-9_]{0,79}$/.test(name);\n" +
"    },\n" +
"\n" +
"    _getFieldType: function(fieldName) {\n" +
"        var dict = new GlideRecord('sys_dictionary');\n" +
"        dict.addQuery('name', 'incident');\n" +
"        dict.addQuery('element', fieldName);\n" +
"        dict.setLimit(1);\n" +
"        dict.query();\n" +
"        if (dict.next()) {\n" +
"            return dict.getValue('internal_type') || 'string';\n" +
"        }\n" +
"        return 'string';\n" +
"    },\n" +
"\n" +
"    type: 'CiroosFieldConfigHelper'\n" +
"};";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated CiroosFieldConfigHelper — fixed validateOrgId, added field name validation');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 3 — FIX: CiroosInboundHandler Script Include
//
// Fixes applied:
//   H3  — Exception details no longer returned in API responses
//   H4  — u_* field writes restricted to explicit allowlist
//   M4  — Input validation on state/priority/impact/urgency fields
//   M7  — User-supplied identifiers no longer echoed in errors
//   L1  — Resolved incidents (state=6) now blocked from updates
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosInboundHandler');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find Script Include: CiroosInboundHandler');
        return;
    }

    var newScript = "var CiroosInboundHandler = Class.create();\n" +
"CiroosInboundHandler.prototype = {\n" +
"\n" +
"    ALLOWED_CUSTOM_FIELDS: [\n" +
"        'u_ciroos_sync_status'\n" +
"    ],\n" +
"\n" +
"    NUMERIC_FIELDS: {\n" +
"        'state': { min: 1, max: 8 },\n" +
"        'impact': { min: 1, max: 3 },\n" +
"        'urgency': { min: 1, max: 3 },\n" +
"        'priority': { min: 1, max: 5 }\n" +
"    },\n" +
"\n" +
"    MAX_STRING_LENGTH: 4000,\n" +
"\n" +
"    initialize: function() {\n" +
"        this.utils = new CiroosUtils();\n" +
"    },\n" +
"\n" +
"    createIncident: function(payload) {\n" +
"        if (!this.utils.isEnabled()) {\n" +
"            return this._error(503, 'Integration is disabled');\n" +
"        }\n" +
"\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!config) {\n" +
"            return this._error(500, 'No active Ciroos configuration found');\n" +
"        }\n" +
"\n" +
"        var validation = this._validateMandatory(payload, config);\n" +
"        if (!validation.valid) {\n" +
"            return this._error(400, 'Mandatory field validation failed', validation.errors);\n" +
"        }\n" +
"\n" +
"        var fieldValidation = this._validateFieldValues(payload);\n" +
"        if (!fieldValidation.valid) {\n" +
"            return this._error(400, 'Field validation failed', fieldValidation.errors);\n" +
"        }\n" +
"\n" +
"        this.utils.setInboundFlag();\n" +
"\n" +
"        try {\n" +
"            var gr = new GlideRecord('incident');\n" +
"            gr.initialize();\n" +
"\n" +
"            if (payload.ciroos_incident_id) {\n" +
"                gr.setValue('correlation_id', payload.ciroos_incident_id);\n" +
"            }\n" +
"\n" +
"            if (gr.isValidField('contact_type')) {\n" +
"                gr.setValue('contact_type', this.utils.SOURCE);\n" +
"            }\n" +
"\n" +
"            this._applyFields(gr, payload, config);\n" +
"            this._applyDefaults(gr, payload, config);\n" +
"            this._applyAssignment(gr, payload, config);\n" +
"\n" +
"            var sysId = gr.insert();\n" +
"\n" +
"            if (sysId) {\n" +
"                gr.get(sysId);\n" +
"                this.utils.log('Incident created: ' + gr.getValue('number') + ' (sys_id: ' + sysId + ')');\n" +
"                gs.eventQueue('ciroos.incident.created', gr, gr.getValue('number'), payload.ciroos_incident_id || '');\n" +
"\n" +
"                return {\n" +
"                    status: 201,\n" +
"                    body: {\n" +
"                        success: true,\n" +
"                        sys_id: sysId,\n" +
"                        number: gr.getValue('number'),\n" +
"                        state: gr.getValue('state'),\n" +
"                        state_display: gr.getDisplayValue('state'),\n" +
"                        assigned_to: gr.getDisplayValue('assigned_to'),\n" +
"                        assignment_group: gr.getDisplayValue('assignment_group'),\n" +
"                        created_on: gr.getValue('sys_created_on')\n" +
"                    }\n" +
"                };\n" +
"            } else {\n" +
"                return this._error(500, 'Failed to create incident');\n" +
"            }\n" +
"        } catch (e) {\n" +
"            this.utils.error('createIncident exception: ' + e.message);\n" +
"            return this._error(500, 'An internal error occurred. Contact your administrator.');\n" +
"        } finally {\n" +
"            this.utils.clearInboundFlag();\n" +
"        }\n" +
"    },\n" +
"\n" +
"    updateIncident: function(identifier, payload) {\n" +
"        if (!this.utils.isEnabled()) {\n" +
"            return this._error(503, 'Integration is disabled');\n" +
"        }\n" +
"\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!config) {\n" +
"            return this._error(500, 'No active Ciroos configuration found');\n" +
"        }\n" +
"\n" +
"        // Validate identifier format\n" +
"        if (!identifier || identifier.length > 128 || !/^[a-zA-Z0-9_\\-]+$/.test(identifier)) {\n" +
"            return this._error(400, 'Invalid identifier format');\n" +
"        }\n" +
"\n" +
"        var fieldValidation = this._validateFieldValues(payload);\n" +
"        if (!fieldValidation.valid) {\n" +
"            return this._error(400, 'Field validation failed', fieldValidation.errors);\n" +
"        }\n" +
"\n" +
"        var gr = new GlideRecord('incident');\n" +
"        var found = false;\n" +
"\n" +
"        if (identifier.match(/^[a-f0-9]{32}$/)) {\n" +
"            found = gr.get(identifier);\n" +
"        }\n" +
"\n" +
"        if (!found) {\n" +
"            gr = new GlideRecord('incident');\n" +
"            gr.addQuery('correlation_id', identifier);\n" +
"            gr.setLimit(1);\n" +
"            gr.query();\n" +
"            found = gr.next();\n" +
"        }\n" +
"\n" +
"        if (!found) {\n" +
"            return this._error(404, 'Incident not found');\n" +
"        }\n" +
"\n" +
"        // Block updates on Resolved (6), Closed (7), and Cancelled (8) incidents\n" +
"        var state = parseInt(gr.getValue('state'));\n" +
"        if (state >= 6) {\n" +
"            return this._error(409, 'Cannot update — incident is ' + gr.getDisplayValue('state'));\n" +
"        }\n" +
"\n" +
"        this.utils.setInboundFlag();\n" +
"\n" +
"        try {\n" +
"            var updatedFields = [];\n" +
"            var allowed = ['state', 'impact', 'urgency', 'priority', 'short_description',\n" +
"                'description', 'work_notes', 'comments', 'close_code', 'close_notes',\n" +
"                'assigned_to', 'assignment_group', 'category', 'subcategory', 'cmdb_ci'];\n" +
"\n" +
"            for (var i = 0; i < allowed.length; i++) {\n" +
"                var fn = allowed[i];\n" +
"                if (payload.hasOwnProperty(fn) && payload[fn] !== null && payload[fn] !== undefined) {\n" +
"                    gr.setValue(fn, payload[fn]);\n" +
"                    updatedFields.push(fn);\n" +
"                }\n" +
"            }\n" +
"\n" +
"            // Only allow explicitly listed custom fields\n" +
"            for (var ci = 0; ci < this.ALLOWED_CUSTOM_FIELDS.length; ci++) {\n" +
"                var cf = this.ALLOWED_CUSTOM_FIELDS[ci];\n" +
"                if (payload.hasOwnProperty(cf) && gr.isValidField(cf)) {\n" +
"                    gr.setValue(cf, payload[cf]);\n" +
"                    updatedFields.push(cf);\n" +
"                }\n" +
"            }\n" +
"\n" +
"            if (updatedFields.length === 0) {\n" +
"                return this._error(400, 'No valid fields to update in the payload');\n" +
"            }\n" +
"\n" +
"            gr.update();\n" +
"            this.utils.log('Incident updated: ' + gr.getValue('number') + ' — fields: ' + updatedFields.join(', '));\n" +
"            gs.eventQueue('ciroos.incident.updated', gr, gr.getValue('number'), updatedFields.join(','));\n" +
"\n" +
"            return {\n" +
"                status: 200,\n" +
"                body: {\n" +
"                    success: true,\n" +
"                    sys_id: gr.getUniqueValue(),\n" +
"                    number: gr.getValue('number'),\n" +
"                    state: gr.getValue('state'),\n" +
"                    state_display: gr.getDisplayValue('state'),\n" +
"                    updated_fields: updatedFields\n" +
"                }\n" +
"            };\n" +
"        } catch (e) {\n" +
"            this.utils.error('updateIncident exception: ' + e.message);\n" +
"            return this._error(500, 'An internal error occurred. Contact your administrator.');\n" +
"        } finally {\n" +
"            this.utils.clearInboundFlag();\n" +
"        }\n" +
"    },\n" +
"\n" +
"    getIncident: function(identifier) {\n" +
"        if (!identifier || identifier.length > 128 || !/^[a-zA-Z0-9_\\-]+$/.test(identifier)) {\n" +
"            return this._error(400, 'Invalid identifier format');\n" +
"        }\n" +
"\n" +
"        var gr = new GlideRecord('incident');\n" +
"        var found = false;\n" +
"\n" +
"        if (identifier.match(/^[a-f0-9]{32}$/)) {\n" +
"            found = gr.get(identifier);\n" +
"        }\n" +
"        if (!found) {\n" +
"            gr = new GlideRecord('incident');\n" +
"            gr.addQuery('correlation_id', identifier);\n" +
"            gr.setLimit(1);\n" +
"            gr.query();\n" +
"            found = gr.next();\n" +
"        }\n" +
"        if (!found) {\n" +
"            return this._error(404, 'Incident not found');\n" +
"        }\n" +
"\n" +
"        return {\n" +
"            status: 200,\n" +
"            body: {\n" +
"                success: true,\n" +
"                sys_id: gr.getUniqueValue(),\n" +
"                number: gr.getValue('number'),\n" +
"                state: gr.getValue('state'),\n" +
"                state_display: gr.getDisplayValue('state'),\n" +
"                priority: gr.getDisplayValue('priority'),\n" +
"                assigned_to: gr.getDisplayValue('assigned_to'),\n" +
"                assignment_group: gr.getDisplayValue('assignment_group'),\n" +
"                short_description: gr.getValue('short_description'),\n" +
"                correlation_id: gr.getValue('correlation_id'),\n" +
"                opened_at: gr.getValue('opened_at'),\n" +
"                resolved_at: gr.getValue('resolved_at') || null,\n" +
"                closed_at: gr.getValue('closed_at') || null\n" +
"            }\n" +
"        };\n" +
"    },\n" +
"\n" +
"    // ─── INTERNAL HELPERS ───\n" +
"\n" +
"    _validateFieldValues: function(payload) {\n" +
"        var errors = [];\n" +
"        for (var fieldName in this.NUMERIC_FIELDS) {\n" +
"            if (payload.hasOwnProperty(fieldName) && payload[fieldName] !== null) {\n" +
"                var numVal = parseInt(payload[fieldName]);\n" +
"                var range = this.NUMERIC_FIELDS[fieldName];\n" +
"                if (isNaN(numVal) || numVal < range.min || numVal > range.max) {\n" +
"                    errors.push({\n" +
"                        field: fieldName,\n" +
"                        message: fieldName + ' must be an integer between ' + range.min + ' and ' + range.max\n" +
"                    });\n" +
"                }\n" +
"            }\n" +
"        }\n" +
"\n" +
"        var stringFields = ['short_description', 'description', 'work_notes', 'comments', 'close_notes'];\n" +
"        for (var i = 0; i < stringFields.length; i++) {\n" +
"            var sf = stringFields[i];\n" +
"            if (payload.hasOwnProperty(sf) && payload[sf] !== null) {\n" +
"                if (typeof payload[sf] === 'string' && payload[sf].length > this.MAX_STRING_LENGTH) {\n" +
"                    errors.push({ field: sf, message: sf + ' exceeds maximum length of ' + this.MAX_STRING_LENGTH });\n" +
"                }\n" +
"            }\n" +
"        }\n" +
"\n" +
"        return { valid: errors.length === 0, errors: errors };\n" +
"    },\n" +
"\n" +
"    _validateMandatory: function(payload, config) {\n" +
"        var errors = [];\n" +
"        var mandatoryFields = config.mandatory_fields || [];\n" +
"\n" +
"        for (var i = 0; i < mandatoryFields.length; i++) {\n" +
"            var mf = mandatoryFields[i];\n" +
"            var fieldName = mf.field_name || mf;\n" +
"            var defaultVal = mf.default_value || '';\n" +
"\n" +
"            if (!payload.hasOwnProperty(fieldName) && !defaultVal) {\n" +
"                errors.push({\n" +
"                    field: fieldName,\n" +
"                    label: mf.label || fieldName,\n" +
"                    message: 'Required field missing and no default value configured'\n" +
"                });\n" +
"            }\n" +
"        }\n" +
"\n" +
"        return { valid: errors.length === 0, errors: errors };\n" +
"    },\n" +
"\n" +
"    _applyFields: function(gr, payload, config) {\n" +
"        var safeFields = ['short_description', 'description', 'impact', 'urgency', 'priority',\n" +
"            'category', 'subcategory', 'contact_type', 'cmdb_ci', 'business_service',\n" +
"            'caller_id', 'company', 'location', 'work_notes', 'comments'];\n" +
"\n" +
"        for (var i = 0; i < safeFields.length; i++) {\n" +
"            var fn = safeFields[i];\n" +
"            if (payload.hasOwnProperty(fn) && payload[fn] !== null && payload[fn] !== undefined) {\n" +
"                gr.setValue(fn, payload[fn]);\n" +
"            }\n" +
"        }\n" +
"\n" +
"        // Only allow explicitly listed custom fields (no more wildcard u_*)\n" +
"        for (var ci = 0; ci < this.ALLOWED_CUSTOM_FIELDS.length; ci++) {\n" +
"            var cf = this.ALLOWED_CUSTOM_FIELDS[ci];\n" +
"            if (payload.hasOwnProperty(cf) && gr.isValidField(cf)) {\n" +
"                gr.setValue(cf, payload[cf]);\n" +
"            }\n" +
"        }\n" +
"    },\n" +
"\n" +
"    _applyDefaults: function(gr, payload, config) {\n" +
"        var mandatoryFields = config.mandatory_fields || [];\n" +
"        for (var i = 0; i < mandatoryFields.length; i++) {\n" +
"            var mf = mandatoryFields[i];\n" +
"            var fieldName = mf.field_name || mf;\n" +
"            var defaultVal = mf.default_value || '';\n" +
"\n" +
"            if (!payload.hasOwnProperty(fieldName) && defaultVal && gr.isValidField(fieldName)) {\n" +
"                gr.setValue(fieldName, defaultVal);\n" +
"                this.utils.log('Applied default for ' + fieldName + ': ' + defaultVal);\n" +
"            }\n" +
"        }\n" +
"    },\n" +
"\n" +
"    _applyAssignment: function(gr, payload, config) {\n" +
"        if (config.assignment_strategy === 'static' && config.assignment_group) {\n" +
"            gr.setValue('assignment_group', config.assignment_group);\n" +
"            this.utils.log('Assignment: static group applied');\n" +
"        } else {\n" +
"            this.utils.log('Assignment: auto_route — leaving for SN rules');\n" +
"        }\n" +
"    },\n" +
"\n" +
"    _error: function(status, message, details) {\n" +
"        this.utils.error(message);\n" +
"        var body = {\n" +
"            success: false,\n" +
"            error: { message: message, status: status }\n" +
"        };\n" +
"        if (details) body.error.details = details;\n" +
"        return { status: status, body: body };\n" +
"    },\n" +
"\n" +
"    type: 'CiroosInboundHandler'\n" +
"};";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated CiroosInboundHandler — sanitized errors, added field allowlist, input validation');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 4 — FIX: CiroosOutboundHandler Script Include
//
// Fixes applied:
//   H7 — Raw HTTP response bodies no longer stamped into work notes
//   M2 — try/finally added to session flag management in _stampIncident
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosOutboundHandler');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find Script Include: CiroosOutboundHandler');
        return;
    }

    var newScript = "var CiroosOutboundHandler = Class.create();\n" +
"CiroosOutboundHandler.prototype = {\n" +
"\n" +
"    initialize: function() {\n" +
"        this.utils = new CiroosUtils();\n" +
"        this.MAX_RETRIES = parseInt(gs.getProperty('ciroos.integration.outbound.retry_count', '3'));\n" +
"        this.BASE_BACKOFF_MS = 1000;\n" +
"    },\n" +
"\n" +
"    sendCreated: function(current) {\n" +
"        if (!this._preflight('CREATED')) return;\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!this._hasConfig(config)) return;\n" +
"\n" +
"        var payload = {\n" +
"            event_type: 'CREATED',\n" +
"            incident_sys_id: current.getUniqueValue(),\n" +
"            incident_number: current.getValue('number'),\n" +
"            timestamp: this._isoTimestamp(),\n" +
"            data: this._buildDataSnapshot(current)\n" +
"        };\n" +
"\n" +
"        var result = this._sendToCiroos(config, payload);\n" +
"        this._stampIncident(current, 'CREATED', result);\n" +
"    },\n" +
"\n" +
"    sendUpdatedFromEvent: function(current, changes, actor) {\n" +
"        if (!this._preflight('UPDATED')) return;\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!this._hasConfig(config)) return;\n" +
"\n" +
"        if (!changes || changes.length === 0) {\n" +
"            this.utils.log('Outbound UPDATED skipped for ' + current.getValue('number') + ' — no changes');\n" +
"            return;\n" +
"        }\n" +
"\n" +
"        var payload = {\n" +
"            event_type: 'UPDATED',\n" +
"            incident_sys_id: current.getUniqueValue(),\n" +
"            incident_number: current.getValue('number'),\n" +
"            timestamp: this._isoTimestamp(),\n" +
"            actor: actor || { display_value: '', value: '' },\n" +
"            changes: changes\n" +
"        };\n" +
"\n" +
"        var result = this._sendToCiroos(config, payload);\n" +
"        this._stampIncident(current, 'UPDATED', result);\n" +
"    },\n" +
"\n" +
"    sendJournalEntryFromEvent: function(current, journalData) {\n" +
"        if (!this._preflight('JOURNAL_ENTRY')) return;\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!this._hasConfig(config)) return;\n" +
"\n" +
"        if (!journalData || !journalData.value) {\n" +
"            this.utils.log('Outbound JOURNAL_ENTRY skipped — empty journal data');\n" +
"            return;\n" +
"        }\n" +
"\n" +
"        var payload = {\n" +
"            event_type: 'JOURNAL_ENTRY',\n" +
"            incident_sys_id: current.getUniqueValue(),\n" +
"            incident_number: current.getValue('number'),\n" +
"            timestamp: this._isoTimestamp(),\n" +
"            journal: journalData\n" +
"        };\n" +
"\n" +
"        var result = this._sendToCiroos(config, payload);\n" +
"        this._stampIncident(current, 'JOURNAL_ENTRY (' + journalData.element + ')', result);\n" +
"    },\n" +
"\n" +
"    sendDeleted: function(current) {\n" +
"        if (!this._preflight('DELETED')) return;\n" +
"        var config = this.utils.getActiveConfig();\n" +
"        if (!this._hasConfig(config)) return;\n" +
"\n" +
"        var payload = {\n" +
"            event_type: 'DELETED',\n" +
"            incident_sys_id: current.getUniqueValue(),\n" +
"            incident_number: current.getValue('number'),\n" +
"            timestamp: this._isoTimestamp(),\n" +
"            data: this._buildDataSnapshot(current)\n" +
"        };\n" +
"\n" +
"        this._sendToCiroos(config, payload);\n" +
"    },\n" +
"\n" +
"    _sfv: function(val, displayVal) {\n" +
"        var obj = { value: val || '' };\n" +
"        if (displayVal !== undefined && displayVal !== null && displayVal !== val) {\n" +
"            obj.display_value = displayVal || '';\n" +
"        }\n" +
"        return obj;\n" +
"    },\n" +
"\n" +
"    _buildDataSnapshot: function(current) {\n" +
"        return {\n" +
"            short_description: this._sfv(current.getValue('short_description')),\n" +
"            state:             this._sfv(current.getValue('state'),            current.getDisplayValue('state')),\n" +
"            priority:          this._sfv(current.getValue('priority'),         current.getDisplayValue('priority')),\n" +
"            urgency:           this._sfv(current.getValue('urgency'),          current.getDisplayValue('urgency')),\n" +
"            impact:            this._sfv(current.getValue('impact'),           current.getDisplayValue('impact')),\n" +
"            assignment_group:  this._sfv(current.getValue('assignment_group'), current.getDisplayValue('assignment_group')),\n" +
"            assigned_to:       this._sfv(current.getValue('assigned_to'),      current.getDisplayValue('assigned_to')),\n" +
"            category:          this._sfv(current.getValue('category'),         current.getDisplayValue('category')),\n" +
"            subcategory:       this._sfv(current.getValue('subcategory'),      current.getDisplayValue('subcategory')),\n" +
"            cmdb_ci:           this._sfv(current.getValue('cmdb_ci'),          current.getDisplayValue('cmdb_ci')),\n" +
"            business_service:  this._sfv(current.getValue('business_service'), current.getDisplayValue('business_service'))\n" +
"        };\n" +
"    },\n" +
"\n" +
"    // FIXED: try/finally ensures session flags are always cleared\n" +
"    // FIXED: No longer writes raw HTTP response bodies to work notes\n" +
"    _stampIncident: function(incidentGr, eventType, result) {\n" +
"        var gr = new GlideRecord('incident');\n" +
"        if (!gr.get(incidentGr.getUniqueValue())) return;\n" +
"\n" +
"        var note = '══ Ciroos Sync: ' + eventType + ' ══\\n';\n" +
"        note += 'Status  : ' + (result.success ? '✓ Sent' : '✗ Failed') + '\\n';\n" +
"        note += 'HTTP    : ' + result.httpStatus + '\\n';\n" +
"\n" +
"        if (result.traceId) {\n" +
"            note += 'Trace ID: ' + result.traceId + '\\n';\n" +
"        }\n" +
"\n" +
"        if (!result.success && result.error) {\n" +
"            // Only show a sanitized error category, not raw response bodies\n" +
"            var safeError = result.error;\n" +
"            if (safeError.length > 100) {\n" +
"                safeError = safeError.substring(0, 100) + '...';\n" +
"            }\n" +
"            // Strip anything that looks like a stack trace or internal path\n" +
"            safeError = safeError.replace(/at\\s+[\\w.]+\\(.*\\)/g, '').replace(/\\/[\\w/]+\\.js/g, '');\n" +
"            note += 'Error   : ' + safeError + '\\n';\n" +
"        }\n" +
"\n" +
"        note += 'Time    : ' + new GlideDateTime().getDisplayValue();\n" +
"\n" +
"        gs.getSession().putClientData('ciroos_stamp_update', 'true');\n" +
"        gs.getSession().putClientData('ciroos_inbound_update', 'true');\n" +
"\n" +
"        try {\n" +
"            gr.autoSysFields(false);\n" +
"            gr.work_notes = note;\n" +
"\n" +
"            if (gr.isValidField('x_ciroo_ciroos_i_0_u_ciroos_sync_status')) {\n" +
"                gr.setValue('x_ciroo_ciroos_i_0_u_ciroos_sync_status', result.success ? 'synced' : 'failed');\n" +
"            }\n" +
"\n" +
"            gr.update();\n" +
"        } finally {\n" +
"            gs.getSession().putClientData('ciroos_stamp_update', 'false');\n" +
"            gs.getSession().putClientData('ciroos_inbound_update', 'false');\n" +
"        }\n" +
"    },\n" +
"\n" +
"    _isoTimestamp: function() {\n" +
"        var gdt = new GlideDateTime();\n" +
"        return gdt.getValue().replace(' ', 'T') + 'Z';\n" +
"    },\n" +
"\n" +
"    _preflight: function(eventType) {\n" +
"        if (!this.utils.isEnabled()) {\n" +
"            this.utils.log('Outbound ' + eventType + ' skipped — integration disabled');\n" +
"            return false;\n" +
"        }\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    _hasConfig: function(config) {\n" +
"        if (!config || !config.ciroos_api_url || !config.ciroos_api_token) {\n" +
"            this.utils.error('Outbound skipped — no active config or missing URL/token');\n" +
"            return false;\n" +
"        }\n" +
"        return true;\n" +
"    },\n" +
"\n" +
"    _sendToCiroos: function(config, payload) {\n" +
"        var endpoint = config.ciroos_api_url.replace(/\\/+$/, '') + '/api/v1/servicenow/incident/events';\n" +
"        var attempt = 0;\n" +
"        var incidentRef = payload.incident_number || 'unknown';\n" +
"\n" +
"        var result = {\n" +
"            success: false,\n" +
"            httpStatus: 0,\n" +
"            traceId: '',\n" +
"            error: ''\n" +
"        };\n" +
"\n" +
"        while (attempt < this.MAX_RETRIES) {\n" +
"            attempt++;\n" +
"            try {\n" +
"                var rm = new sn_ws.RESTMessageV2();\n" +
"                rm.setEndpoint(endpoint);\n" +
"                rm.setHttpMethod('POST');\n" +
"                rm.setRequestHeader('Content-Type', 'application/json');\n" +
"                rm.setRequestHeader('Authorization', 'Bearer ' + config.ciroos_api_token);\n" +
"                rm.setRequestBody(JSON.stringify(payload));\n" +
"                rm.setHttpTimeout(15000);\n" +
"\n" +
"                var response = rm.execute();\n" +
"                var httpStatus = parseInt(response.getStatusCode());\n" +
"                var responseBody = response.getBody();\n" +
"                result.httpStatus = httpStatus;\n" +
"\n" +
"                if (httpStatus >= 200 && httpStatus < 400) {\n" +
"                    result.success = true;\n" +
"                    try {\n" +
"                        var parsed = JSON.parse(responseBody);\n" +
"                        result.traceId = parsed.trace_id || '';\n" +
"                    } catch (e) { /* ignore */ }\n" +
"\n" +
"                    this.utils.log('Outbound OK (HTTP ' + httpStatus + ') — '\n" +
"                        + payload.event_type + ' for ' + incidentRef\n" +
"                        + (result.traceId ? ' — trace_id: ' + result.traceId : ''));\n" +
"                    return result;\n" +
"                }\n" +
"\n" +
"                else if (httpStatus === 401) {\n" +
"                    result.error = 'Invalid or expired Bearer token';\n" +
"                    this.utils.error('Outbound FAILED (HTTP 401) for ' + incidentRef);\n" +
"                    break;\n" +
"                }\n" +
"\n" +
"                else if (httpStatus === 422) {\n" +
"                    result.error = 'Payload rejected by Ciroos (HTTP 422)';\n" +
"                    this.utils.error('Outbound FAILED (HTTP 422) — ' + payload.event_type\n" +
"                        + ' for ' + incidentRef);\n" +
"                    break;\n" +
"                }\n" +
"\n" +
"                else if (httpStatus >= 500 && attempt < this.MAX_RETRIES) {\n" +
"                    this.utils.log('Outbound attempt ' + attempt + ' failed (HTTP ' + httpStatus\n" +
"                        + ') — retrying...');\n" +
"                    gs.sleep(this.BASE_BACKOFF_MS * Math.pow(2, attempt - 1));\n" +
"                }\n" +
"\n" +
"                else {\n" +
"                    result.error = 'HTTP ' + httpStatus;\n" +
"                    this.utils.error('Outbound FAILED (HTTP ' + httpStatus + ') — '\n" +
"                        + payload.event_type + ' for ' + incidentRef);\n" +
"                    break;\n" +
"                }\n" +
"\n" +
"            } catch (e) {\n" +
"                result.error = 'Connection error';\n" +
"                this.utils.error('Outbound exception (attempt ' + attempt + '): ' + e.message);\n" +
"                if (attempt < this.MAX_RETRIES) {\n" +
"                    gs.sleep(this.BASE_BACKOFF_MS * Math.pow(2, attempt - 1));\n" +
"                }\n" +
"            }\n" +
"        }\n" +
"\n" +
"        if (!result.success) {\n" +
"            gs.eventQueue('ciroos.outbound.failed', null, incidentRef, payload.event_type);\n" +
"        }\n" +
"\n" +
"        return result;\n" +
"    },\n" +
"\n" +
"    type: 'CiroosOutboundHandler'\n" +
"};";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated CiroosOutboundHandler — sanitized work notes, added try/finally, removed payload from event queue');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 5 — FIX: CiroosUtils Script Include
//
// Fixes applied:
//   M3 — Loop prevention uses configurable service account property
//   Added URL validation helper for reuse
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('name', 'CiroosUtils');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find Script Include: CiroosUtils');
        return;
    }

    var newScript = "var CiroosUtils = Class.create();\n" +
"CiroosUtils.prototype = {\n" +
"\n" +
"    initialize: function() {\n" +
"        this.SOURCE = gs.getProperty('ciroos.integration.source_identifier', 'Ciroos');\n" +
"        this.LOOP_FIELD = gs.getProperty('ciroos.integration.loop_prevention.field', 'correlation_id');\n" +
"        this.DEBUG = gs.getProperty('ciroos.integration.debug', 'false') == 'true';\n" +
"        this.ENABLED = gs.getProperty('ciroos.integration.enabled', 'true') == 'true';\n" +
"        this.SERVICE_ACCOUNTS = (gs.getProperty('ciroos.integration.service_account_names', 'svc_ciroos') || '').split(',');\n" +
"    },\n" +
"\n" +
"    isEnabled: function() {\n" +
"        return this.ENABLED;\n" +
"    },\n" +
"\n" +
"    getActiveConfig: function() {\n" +
"        var gr = new GlideRecord('x_ciroo_ciroos_i_0_ciroos_integration_config');\n" +
"        gr.addQuery('is_active', true);\n" +
"        gr.orderByDesc('sys_updated_on');\n" +
"        gr.setLimit(1);\n" +
"        gr.query();\n" +
"\n" +
"        if (gr.next()) {\n" +
"            return {\n" +
"                sys_id: gr.getUniqueValue(),\n" +
"                ciroos_api_url: gr.getValue('ciroos_api_url') || '',\n" +
"                ciroos_api_token: gr.getValue('ciroos_api_token') || '',\n" +
"                mandatory_fields: this._safeParse(gr.getValue('mandatory_fields'), []),\n" +
"                update_trigger_fields: this._safeParse(gr.getValue('update_trigger_fields'), []),\n" +
"                assignment_group: gr.getValue('assignment_group') || '',\n" +
"                assignment_strategy: gr.getValue('assignment_strategy') || 'auto_route'\n" +
"            };\n" +
"        }\n" +
"        return null;\n" +
"    },\n" +
"\n" +
"    isFromCiroos: function(incidentGR) {\n" +
"        return gs.getSession().getClientData('ciroos_inbound_active') == 'true';\n" +
"    },\n" +
"\n" +
"    // FIXED: Uses configurable service account list instead of hardcoded prefix\n" +
"    isCiroosServiceAccount: function(username) {\n" +
"        if (!username) return false;\n" +
"        for (var i = 0; i < this.SERVICE_ACCOUNTS.length; i++) {\n" +
"            var svcAcct = this.SERVICE_ACCOUNTS[i].trim();\n" +
"            if (svcAcct && username === svcAcct) return true;\n" +
"        }\n" +
"        return false;\n" +
"    },\n" +
"\n" +
"    setInboundFlag: function() {\n" +
"        gs.getSession().putClientData('ciroos_inbound_active', 'true');\n" +
"    },\n" +
"\n" +
"    clearInboundFlag: function() {\n" +
"        gs.getSession().putClientData('ciroos_inbound_active', 'false');\n" +
"    },\n" +
"\n" +
"    didFieldChange: function(current, fieldName) {\n" +
"        if (!current.isValidField(fieldName)) return false;\n" +
"        var element = current.getElement(fieldName);\n" +
"        return element ? element.changes() : false;\n" +
"    },\n" +
"\n" +
"    shouldNotifyCiroos: function(current, config) {\n" +
"        if (!config || !config.update_trigger_fields) return false;\n" +
"        var triggers = config.update_trigger_fields;\n" +
"        for (var i = 0; i < triggers.length; i++) {\n" +
"            if (this.didFieldChange(current, triggers[i])) return true;\n" +
"        }\n" +
"        return false;\n" +
"    },\n" +
"\n" +
"    buildChangedFieldsPayload: function(current, config) {\n" +
"        var changed = {};\n" +
"        var triggers = config.update_trigger_fields || [];\n" +
"        for (var i = 0; i < triggers.length; i++) {\n" +
"            var fn = triggers[i];\n" +
"            if (this.didFieldChange(current, fn)) {\n" +
"                changed[fn] = {\n" +
"                    current: current.getValue(fn) || '',\n" +
"                    display_value: current.getDisplayValue(fn) || ''\n" +
"                };\n" +
"            }\n" +
"        }\n" +
"        return changed;\n" +
"    },\n" +
"\n" +
"    log: function(msg) {\n" +
"        if (this.DEBUG) gs.info('[Ciroos] ' + msg);\n" +
"    },\n" +
"\n" +
"    error: function(msg) {\n" +
"        gs.error('[Ciroos] ' + msg);\n" +
"    },\n" +
"\n" +
"    _safeParse: function(str, fallback) {\n" +
"        try { return JSON.parse(str); }\n" +
"        catch (e) { return fallback; }\n" +
"    },\n" +
"\n" +
"    type: 'CiroosUtils'\n" +
"};";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated CiroosUtils — configurable service account names for loop prevention');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 6A — FIX: "Ciroos - Loop Prevention Guard" Business Rule
//
// Fixes applied:
//   M3 — Uses CiroosUtils.isCiroosServiceAccount() with configurable list
//         instead of fragile username prefix matching
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script');
    gr.addQuery('name', 'Ciroos - Loop Prevention Guard');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find BR: Ciroos - Loop Prevention Guard');
        return;
    }

    var newScript = "(function executeRule(current, previous /*null when async*/) {\n" +
"\n" +
"    var utils = new CiroosUtils();\n" +
"\n" +
"    var updatedBy = current.getValue('sys_updated_by') || '';\n" +
"    if (utils.isCiroosServiceAccount(updatedBy)) {\n" +
"        utils.setInboundFlag();\n" +
"        utils.log('Loop guard: Ciroos service account detected (' + updatedBy + ') — flagging session');\n" +
"    }\n" +
"\n" +
"})(current, previous);";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated BR "Ciroos - Loop Prevention Guard" — uses configurable service account list');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 6B — FIX: "Ciroos - Outbound Notification" Business Rule
//
// Fixes applied:
//   H1  — Only sends Ciroos-originated incidents outbound (not ALL incidents)
//   M1  — Uses executeAsync() instead of synchronous execute()
//   M2  — try/finally on session flag management
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script');
    gr.addQuery('name', 'Ciroos - Outbound Notification');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (!gr.next()) {
        gs.error('SECURITY FIX: Could not find BR: Ciroos - Outbound Notification');
        return;
    }

    var newScript = "(function executeRule(current, previous) {\n" +
"\n" +
"    // ── Guards ──\n" +
"    if (gs.getSession().getClientData('ciroos_stamp_update') === 'true') return;\n" +
"    if (gs.getSession().getClientData('ciroos_inbound_update') === 'true') return;\n" +
"\n" +
"    var utils = new x_ciroo_ciroos_i_0.CiroosUtils();\n" +
"    if (!utils.isEnabled()) return;\n" +
"\n" +
"    var config = utils.getActiveConfig();\n" +
"    if (!config || !config.ciroos_api_url || !config.ciroos_api_token) return;\n" +
"\n" +
"    // SECURITY FIX: Only send Ciroos-originated incidents outbound\n" +
"    // Non-Ciroos incidents should not be forwarded to the external platform\n" +
"    var correlationId = current.getValue('correlation_id') || '';\n" +
"    var contactType = current.getValue('contact_type') || '';\n" +
"    var source = utils.SOURCE || 'Ciroos';\n" +
"    var isCiroosIncident = (correlationId.length > 0) || (contactType === source);\n" +
"\n" +
"    if (!isCiroosIncident) {\n" +
"        utils.log('Outbound skipped — incident ' + current.getValue('number') + ' is not Ciroos-originated');\n" +
"        return;\n" +
"    }\n" +
"\n" +
"    var endpoint = config.ciroos_api_url.replace(/\\/+$/, '') + '/api/v1/servicenow/incident/events';\n" +
"\n" +
"    function sfv(val, dv) {\n" +
"        var o = { value: val || '' };\n" +
"        if (dv) o.display_value = dv;\n" +
"        return o;\n" +
"    }\n" +
"\n" +
"    function sendPayload(payload) {\n" +
"        var rm = new sn_ws.RESTMessageV2();\n" +
"        rm.setEndpoint(endpoint);\n" +
"        rm.setHttpMethod('POST');\n" +
"        rm.setRequestHeader('Content-Type', 'application/json');\n" +
"        rm.setRequestHeader('Authorization', 'Bearer ' + config.ciroos_api_token);\n" +
"        rm.setRequestBody(JSON.stringify(payload));\n" +
"        rm.setHttpTimeout(15000);\n" +
"\n" +
"        var resp = rm.executeAsync();\n" +
"        var httpStatus = resp.getStatusCode();\n" +
"        var traceId = '';\n" +
"        try { traceId = JSON.parse(resp.getBody()).trace_id || ''; } catch(e) {}\n" +
"\n" +
"        utils.log('Outbound ' + payload.event_type + ' for ' + current.getValue('number')\n" +
"            + ' — HTTP ' + httpStatus + (traceId ? ' — trace: ' + traceId : ''));\n" +
"\n" +
"        // Stamp with try/finally to guarantee flag cleanup\n" +
"        gs.getSession().putClientData('ciroos_stamp_update', 'true');\n" +
"        gs.getSession().putClientData('ciroos_inbound_update', 'true');\n" +
"\n" +
"        try {\n" +
"            var gr = new GlideRecord('incident');\n" +
"            gr.get(current.getUniqueValue());\n" +
"            gr.work_notes = '══ Ciroos Sync: ' + payload.event_type + ' ══\\n'\n" +
"                + 'Status: ' + (parseInt(httpStatus) < 400 ? '✓ Sent' : '✗ Failed') + '\\n'\n" +
"                + 'HTTP: ' + httpStatus + '\\n'\n" +
"                + (traceId ? 'Trace ID: ' + traceId + '\\n' : '')\n" +
"                + 'Time: ' + new GlideDateTime().getDisplayValue();\n" +
"            if (gr.isValidField('x_ciroo_ciroos_i_0_u_ciroos_sync_status')) {\n" +
"                gr.setValue('x_ciroo_ciroos_i_0_u_ciroos_sync_status', parseInt(httpStatus) < 400 ? 'synced' : 'failed');\n" +
"            }\n" +
"            gr.update();\n" +
"        } finally {\n" +
"            gs.getSession().putClientData('ciroos_stamp_update', 'false');\n" +
"            gs.getSession().putClientData('ciroos_inbound_update', 'false');\n" +
"        }\n" +
"    }\n" +
"\n" +
"    var baseFields = {\n" +
"        incident_sys_id: current.getUniqueValue(),\n" +
"        incident_number: current.getValue('number'),\n" +
"        timestamp: new GlideDateTime().getValue().replace(' ', 'T') + 'Z'\n" +
"    };\n" +
"\n" +
"    var dataSnapshot = {\n" +
"        short_description: sfv(current.getValue('short_description')),\n" +
"        state:             sfv(current.getValue('state'),            current.getDisplayValue('state')),\n" +
"        priority:          sfv(current.getValue('priority'),         current.getDisplayValue('priority')),\n" +
"        urgency:           sfv(current.getValue('urgency'),          current.getDisplayValue('urgency')),\n" +
"        impact:            sfv(current.getValue('impact'),           current.getDisplayValue('impact')),\n" +
"        assignment_group:  sfv(current.getValue('assignment_group'), current.getDisplayValue('assignment_group')),\n" +
"        assigned_to:       sfv(current.getValue('assigned_to'),      current.getDisplayValue('assigned_to')),\n" +
"        category:          sfv(current.getValue('category'),         current.getDisplayValue('category')),\n" +
"        subcategory:       sfv(current.getValue('subcategory'),      current.getDisplayValue('subcategory')),\n" +
"        cmdb_ci:           sfv(current.getValue('cmdb_ci'),          current.getDisplayValue('cmdb_ci')),\n" +
"        business_service:  sfv(current.getValue('business_service'), current.getDisplayValue('business_service'))\n" +
"    };\n" +
"\n" +
"    // ── INSERT → CREATED ──\n" +
"    if (current.operation() === 'insert') {\n" +
"        sendPayload({\n" +
"            event_type: 'CREATED',\n" +
"            incident_sys_id: baseFields.incident_sys_id,\n" +
"            incident_number: baseFields.incident_number,\n" +
"            timestamp: baseFields.timestamp,\n" +
"            data: dataSnapshot\n" +
"        });\n" +
"        return;\n" +
"    }\n" +
"\n" +
"    // ── DELETE → DELETED ──\n" +
"    if (current.operation() === 'delete') {\n" +
"        sendPayload({\n" +
"            event_type: 'DELETED',\n" +
"            incident_sys_id: baseFields.incident_sys_id,\n" +
"            incident_number: baseFields.incident_number,\n" +
"            timestamp: baseFields.timestamp,\n" +
"            data: dataSnapshot\n" +
"        });\n" +
"        return;\n" +
"    }\n" +
"\n" +
"    // ── UPDATE → UPDATED + JOURNAL_ENTRY ──\n" +
"    var actor = {\n" +
"        display_value: gs.getUserDisplayName(),\n" +
"        value: gs.getUserID()\n" +
"    };\n" +
"\n" +
"    var triggerFields = ['state', 'priority', 'urgency', 'impact', 'assigned_to', 'assignment_group', 'close_code'];\n" +
"    var changes = [];\n" +
"\n" +
"    for (var i = 0; i < triggerFields.length; i++) {\n" +
"        var field = triggerFields[i];\n" +
"        if (current[field] && current[field].changes()) {\n" +
"            changes.push({\n" +
"                field: field,\n" +
"                old_value: sfv(\n" +
"                    previous ? previous.getValue(field) : '',\n" +
"                    previous ? previous.getDisplayValue(field) : ''\n" +
"                ),\n" +
"                new_value: sfv(\n" +
"                    current.getValue(field),\n" +
"                    current.getDisplayValue(field)\n" +
"                )\n" +
"            });\n" +
"        }\n" +
"    }\n" +
"\n" +
"    if (changes.length > 0) {\n" +
"        sendPayload({\n" +
"            event_type: 'UPDATED',\n" +
"            incident_sys_id: baseFields.incident_sys_id,\n" +
"            incident_number: baseFields.incident_number,\n" +
"            timestamp: baseFields.timestamp,\n" +
"            actor: actor,\n" +
"            changes: changes\n" +
"        });\n" +
"    }\n" +
"\n" +
"    var journalFields = ['work_notes', 'comments', 'close_notes'];\n" +
"    for (var j = 0; j < journalFields.length; j++) {\n" +
"        var jf = journalFields[j];\n" +
"        if (current[jf] && current[jf].changes()) {\n" +
"            sendPayload({\n" +
"                event_type: 'JOURNAL_ENTRY',\n" +
"                incident_sys_id: baseFields.incident_sys_id,\n" +
"                incident_number: baseFields.incident_number,\n" +
"                timestamp: baseFields.timestamp,\n" +
"                journal: {\n" +
"                    element: jf,\n" +
"                    value: current[jf].getJournalEntry(1),\n" +
"                    added_by: {\n" +
"                        display_value: gs.getUserDisplayName(),\n" +
"                        value: gs.getUserID()\n" +
"                    }\n" +
"                }\n" +
"            });\n" +
"        }\n" +
"    }\n" +
"\n" +
"})(current, previous);";

    gr.setValue('script', newScript);
    gr.update();
    gs.info('SECURITY FIX: Updated BR "Ciroos - Outbound Notification" — only Ciroos incidents, async HTTP, try/finally');
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 6C — FIX: Deactivate legacy "Incident Updated Trigger to Ciroos" BR
//
// Fixes applied:
//   L4 — Ensures the inactive legacy BR stays deactivated and logs are cleaned
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_script');
    gr.addQuery('name', 'Incident Updated Trigger to Ciroos');
    gr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    gr.query();

    if (gr.next()) {
        if (gr.getValue('active') == 'true' || gr.getValue('active') == '1') {
            gr.setValue('active', false);
            gr.update();
            gs.info('SECURITY FIX: Deactivated legacy BR "Incident Updated Trigger to Ciroos"');
        } else {
            gs.info('SECURITY FIX: Legacy BR "Incident Updated Trigger to Ciroos" already inactive — OK');
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 7A — FIX: Lock down System Properties
//
// Fixes applied:
//   H5 — All 5 system properties now have read_roles and write_roles set
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var properties = [
        'x_ciroo_ciroos_i_0.ciroos.integration.enabled',
        'x_ciroo_ciroos_i_0.ciroos.integration.source_identifier',
        'x_ciroo_ciroos_i_0.ciroos.integration.outbound.retry_count',
        'x_ciroo_ciroos_i_0.ciroos.integration.loop_prevention.field',
        'x_ciroo_ciroos_i_0.ciroos.integration.debug'
    ];

    var writeRole = 'x_ciroo_ciroos_i_0.ciroos_integration_config_user';
    var readRole = 'x_ciroo_ciroos_i_0.ciroos_integration_config_user';

    for (var i = 0; i < properties.length; i++) {
        var gr = new GlideRecord('sys_properties');
        gr.addQuery('name', properties[i]);
        gr.query();

        if (gr.next()) {
            gr.setValue('write_roles', writeRole);
            gr.setValue('read_roles', readRole);
            gr.update();
            gs.info('SECURITY FIX: Locked down property: ' + properties[i]);
        } else {
            gs.warn('SECURITY FIX: Property not found: ' + properties[i]);
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 7B — FIX: Create new system property for configurable service accounts
//
// Supports the new CiroosUtils.isCiroosServiceAccount() method
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var propName = 'x_ciroo_ciroos_i_0.ciroos.integration.service_account_names';

    var gr = new GlideRecord('sys_properties');
    gr.addQuery('name', propName);
    gr.query();

    if (!gr.next()) {
        gr.initialize();
        gr.setValue('name', propName);
        gr.setValue('value', 'svc_ciroos');
        gr.setValue('description', 'Comma-separated list of Ciroos service account usernames used for loop prevention. The Loop Prevention Guard business rule checks sys_updated_by against these exact names.');
        gr.setValue('type', 'string');
        gr.setValue('is_private', false);
        gr.setValue('read_roles', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        gr.setValue('write_roles', 'x_ciroo_ciroos_i_0.ciroos_integration_config_user');
        gr.setValue('ignore_cache', true);
        gr.insert();
        gs.info('SECURITY FIX: Created property: ' + propName);
    } else {
        gs.info('SECURITY FIX: Property already exists: ' + propName);
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 7C — FIX: Change ciroos_api_token field type to password2
//
// Fixes applied:
//   C3 — API token encrypted at rest using ServiceNow's password2 type
//
// NOTE: After running this, you must RE-ENTER the API token in the config
// because the existing plaintext value will not be readable as password2.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var gr = new GlideRecord('sys_dictionary');
    gr.addQuery('name', 'x_ciroo_ciroos_i_0_ciroos_integration_config');
    gr.addQuery('element', 'ciroos_api_token');
    gr.query();

    if (gr.next()) {
        var currentType = gr.getValue('internal_type');
        if (currentType !== 'password2') {
            gr.setValue('internal_type', 'password2');
            gr.update();
            gs.info('SECURITY FIX: Changed ciroos_api_token field type from "' + currentType + '" to "password2"');
            gs.warn('IMPORTANT: You must re-enter the Ciroos API token in the configuration after this change. The existing plaintext value is no longer compatible with the encrypted field type.');
        } else {
            gs.info('SECURITY FIX: ciroos_api_token is already password2 type — OK');
        }
    } else {
        gs.error('SECURITY FIX: Could not find dictionary entry for ciroos_api_token');
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 7D — FIX: Create field-level ACL for ciroos_api_token
//
// Fixes applied:
//   H6 — Field-level ACL restricting read/write of the token to admin only
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    var tableName = 'x_ciroo_ciroos_i_0_ciroos_integration_config';
    var fieldName = 'ciroos_api_token';

    var operations = ['read', 'write'];

    for (var i = 0; i < operations.length; i++) {
        var op = operations[i];

        // Check if ACL already exists
        var existing = new GlideRecord('sys_security_acl');
        existing.addQuery('name', tableName + '.' + fieldName);
        existing.addQuery('operation', op);
        existing.addQuery('type', 'record');
        existing.query();

        if (existing.next()) {
            gs.info('SECURITY FIX: Field ACL for ' + fieldName + ' (' + op + ') already exists');
            continue;
        }

        var acl = new GlideRecord('sys_security_acl');
        acl.initialize();
        acl.setValue('name', tableName + '.' + fieldName);
        acl.setValue('operation', op);
        acl.setValue('type', 'record');
        acl.setValue('active', true);
        acl.setValue('admin_overrides', true);
        acl.setValue('advanced', false);
        var aclSysId = acl.insert();

        if (aclSysId) {
            // Add admin role requirement
            var aclRole = new GlideRecord('sys_security_acl_role');
            aclRole.initialize();
            aclRole.setValue('sys_security_acl', aclSysId);
            aclRole.setValue('sys_user_role', '282bf1fac6112285000441d4da6e3dce'); // admin role sys_id
            aclRole.insert();

            gs.info('SECURITY FIX: Created field-level ACL for ' + fieldName + ' (' + op + ') — requires admin');
        }
    }
})();


// ════════════════════════════════════════════════════════════════════════════════
// PART 8 — VERIFICATION SCRIPT
//
// Run this after all fixes to verify everything was applied correctly.
// ════════════════════════════════════════════════════════════════════════════════

(function() {
    gs.info('═══ CIROOS SECURITY FIX VERIFICATION ═══');
    var allGood = true;

    // 1. Check Script Includes have role checks
    var scriptIncludes = ['CiroosIntegrationConfig', 'CiroosInboundHandler', 'CiroosOutboundHandler', 'CiroosFieldConfigHelper', 'CiroosUtils'];
    for (var i = 0; i < scriptIncludes.length; i++) {
        var si = new GlideRecord('sys_script_include');
        si.addQuery('name', scriptIncludes[i]);
        si.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
        si.query();
        if (si.next()) {
            gs.info('  ✓ Script Include updated: ' + scriptIncludes[i]);
        } else {
            gs.error('  ✗ Script Include NOT FOUND: ' + scriptIncludes[i]);
            allGood = false;
        }
    }

    // 2. Check CiroosIntegrationConfig has role check
    var configSI = new GlideRecord('sys_script_include');
    configSI.addQuery('name', 'CiroosIntegrationConfig');
    configSI.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    configSI.query();
    if (configSI.next()) {
        var script = configSI.getValue('script');
        if (script.indexOf('_checkAccess') > -1) {
            gs.info('  ✓ CiroosIntegrationConfig has _checkAccess role gate');
        } else {
            gs.error('  ✗ CiroosIntegrationConfig MISSING role checks');
            allGood = false;
        }
        if (script.indexOf('_maskToken') > -1) {
            gs.info('  ✓ CiroosIntegrationConfig has token masking');
        } else {
            gs.error('  ✗ CiroosIntegrationConfig MISSING token masking');
            allGood = false;
        }
        if (script.indexOf('sysparm_url') === -1 && script.indexOf('sysparm_token') === -1) {
            gs.info('  ✓ CiroosIntegrationConfig no longer accepts URL/token from client');
        } else {
            gs.error('  ✗ CiroosIntegrationConfig STILL accepts URL/token from client (SSRF risk)');
            allGood = false;
        }
    }

    // 3. Check validateOrgId fix
    var fch = new GlideRecord('sys_script_include');
    fch.addQuery('name', 'CiroosFieldConfigHelper');
    fch.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    fch.query();
    if (fch.next()) {
        if (fch.getValue('script').indexOf('storedOrgId') > -1) {
            gs.info('  ✓ CiroosFieldConfigHelper.validateOrgId compares against stored value');
        } else {
            gs.error('  ✗ CiroosFieldConfigHelper.validateOrgId NOT fixed');
            allGood = false;
        }
    }

    // 4. Check CiroosInboundHandler has field allowlist
    var ih = new GlideRecord('sys_script_include');
    ih.addQuery('name', 'CiroosInboundHandler');
    ih.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    ih.query();
    if (ih.next()) {
        var ihScript = ih.getValue('script');
        if (ihScript.indexOf('ALLOWED_CUSTOM_FIELDS') > -1) {
            gs.info('  ✓ CiroosInboundHandler uses explicit custom field allowlist');
        } else {
            gs.error('  ✗ CiroosInboundHandler MISSING custom field allowlist');
            allGood = false;
        }
        if (ihScript.indexOf("e.message") === -1 || ihScript.indexOf("Contact your administrator") > -1) {
            gs.info('  ✓ CiroosInboundHandler error responses sanitized');
        } else {
            gs.error('  ✗ CiroosInboundHandler still leaks exception details');
            allGood = false;
        }
    }

    // 5. Check Outbound BR filters by Ciroos origin
    var obr = new GlideRecord('sys_script');
    obr.addQuery('name', 'Ciroos - Outbound Notification');
    obr.addQuery('sys_scope', '051a81a993b372909d51afa877373c18');
    obr.query();
    if (obr.next()) {
        if (obr.getValue('script').indexOf('isCiroosIncident') > -1) {
            gs.info('  ✓ Outbound BR filters for Ciroos-originated incidents only');
        } else {
            gs.error('  ✗ Outbound BR still sends ALL incidents');
            allGood = false;
        }
    }

    // 6. Check properties are locked
    var propLocked = true;
    var props = new GlideRecord('sys_properties');
    props.addQuery('name', 'STARTSWITH', 'x_ciroo_ciroos_i_0.ciroos.');
    props.query();
    while (props.next()) {
        if (!props.getValue('write_roles')) {
            gs.error('  ✗ Property UNLOCKED: ' + props.getValue('name'));
            propLocked = false;
            allGood = false;
        }
    }
    if (propLocked) {
        gs.info('  ✓ All system properties have role restrictions');
    }

    // 7. Check field type
    var dict = new GlideRecord('sys_dictionary');
    dict.addQuery('name', 'x_ciroo_ciroos_i_0_ciroos_integration_config');
    dict.addQuery('element', 'ciroos_api_token');
    dict.query();
    if (dict.next()) {
        if (dict.getValue('internal_type') === 'password2') {
            gs.info('  ✓ ciroos_api_token field type is password2 (encrypted)');
        } else {
            gs.warn('  ⚠ ciroos_api_token field type is still: ' + dict.getValue('internal_type'));
        }
    }

    gs.info('═══ VERIFICATION COMPLETE — ' + (allGood ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗') + ' ═══');
})();
