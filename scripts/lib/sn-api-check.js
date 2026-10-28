// scripts/lib/sn-api-check.js
// =============================================================================
// SERVICENOW API NAME CHECK
// =============================================================================
// Finds ServiceNow class and method names used in an interview answer's code
// (<pre> blocks and <code> spans) and checks them against data/sn-api-index.json,
// which is built from the official API reference. It catches the failure that
// matters most in generated content: an invented class or method.
//
// What it checks:
//   - `new X(` and `X.method(` where X looks like a ServiceNow class
//     (Glide*, sn_*.Class, RESTMessageV2, CartJS...): X must be in the index.
//   - `v.method(` where v has a known type: platform globals (gs, g_form,
//     g_user, current...) or a variable assigned with `new X(`. The method must
//     be documented on that class (GlideAggregate and GlideRecordSecure also
//     get GlideRecord's methods; current.field gets GlideElement's).
// Untyped variables are skipped, so the check under-reports rather than guesses.
// =============================================================================

const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, '..', '..', 'data', 'sn-api-index.json');

// Real classes the Brazil index has no page for, mapped to the class whose
// methods they share (null: exists, methods not checked).
const EXTRA_CLASSES = {
  GlideRecordSecure: 'GlideRecord',
  GlideAggregate: 'GlideRecord',
  GlideappCalculationHelper: null,
  GlideUpdateSet: null,
  GlideEncrypter: null,
  GlideImportSetLoader: null,
  GlideImportSetTable: null,
  GlideImportSetTransformer: null,
  GlideTransformMap: null,
  GlideOAuthClient: null,
  GlideOAuthClientRequest: null,
  GlideOAuthClientResponse: null,
  GlideOAuthToken: null,
  GlideJWTAPI: null,
  GlideCertificateEncryption: null,
  GlideStringUtil: null,
  GlideEmailOutbound: null,
  GlideXMLDocument: null,
  GlideImpersonate: null,
  GlideSecureRandomUtil: null,
  GlideChoiceList: null,
  GlideController: null,
  GlideSysAttachmentInputStream: null,
  Catalog: 'CatalogJS',
};

// Namespaces whose classes are real but have no reference page in the index.
const EXTRA_NAMESPACES = ['sn_ws_err'];

// Global-scope GlideSystem methods the scoped reference page does not list.
const EXTRA_METHODS = {
  GlideSystem: [
    'log', 'logError', 'logWarning', 'print', 'sleep', 'secondsAgo', 'minutesAgo', 'hoursAgo', 'daysAgo',
    'monthsAgo', 'yearsAgo', 'beginningOfToday', 'endOfToday', 'beginningOfYesterday', 'endOfYesterday',
    'beginningOfThisWeek', 'endOfThisWeek', 'beginningOfThisMonth', 'endOfThisMonth', 'beginningOfThisQuarter',
    'endOfThisQuarter', 'beginningOfThisYear', 'endOfThisYear',
  ],
};

// Globals with a fixed type. Client globals use the "client:" index keys.
const ROOT_TYPES = {
  gs: 'GlideSystem',
  current: 'GlideRecord',
  previous: 'GlideRecord',
  $sp: 'GlideSPScriptable',
  g_form: 'client:GlideForm',
  g_user: 'client:GlideUser',
  g_list: 'client:GlideList2',
  g_aw: 'client:GlideAgentWorkspace',
  g_navigation: 'client:GlideNavigation',
  g_service_catalog: 'client:g_service_catalog',
  spUtil: 'client:spUtil',
  spModal: 'client:spModal',
  spAriaUtil: 'client:spAriaUtil',
};

const CLASS_NAME = /^(Glide[A-Za-z0-9]*|RESTMessageV2|SOAPMessageV2|RESTResponseV2|SOAPResponseV2|CartJS|CatItem|CatalogSearch|CatCategory|IdentificationEngine|DecisionTableAPI|FlowAPI|PDFGenerationAPI)$/;

let cached = null;
function loadIndex(file) {
  if (!file && cached) return cached;
  const raw = JSON.parse(fs.readFileSync(file || INDEX_FILE, 'utf8'));
  const methods = {};
  Object.keys(raw.classes).forEach((k) => { methods[k] = new Set(raw.classes[k].methods); });
  const byName = {};
  Object.keys(raw.classes).forEach((k) => {
    const bare = k.replace(/^client:/, '');
    (byName[bare] = byName[bare] || []).push(k);
  });
  const index = { raw, methods, byName };
  if (!file) cached = index;
  return index;
}

function decode(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// Code from <pre> blocks (whole programs) and <code> spans (inline snippets).
function codeOf(html) {
  const blocks = [];
  String(html).replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (m, body) => { blocks.push(decode(body)); return ''; })
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (m, body) => { blocks.push(decode(body)); return ''; });
  return blocks;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1').replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

// Index of the parenthesis that closes the one at `open`, or -1.
function closingParen(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function knownClass(index, name) {
  if (index.byName[name]) return true;
  return Object.prototype.hasOwnProperty.call(EXTRA_CLASSES, name);
}

// Method set for a type key or bare class name; null means "don't check".
function methodsFor(index, type) {
  if (index.methods[type]) {
    const set = new Set(index.methods[type]);
    if (type === 'GlideAggregate' || type === 'GlideRecordSecure') index.methods.GlideRecord.forEach((m) => set.add(m));
    (EXTRA_METHODS[type] || []).forEach((m) => set.add(m));
    return set;
  }
  if (Object.prototype.hasOwnProperty.call(EXTRA_CLASSES, type)) {
    const base = EXTRA_CLASSES[type];
    return base && index.methods[base] ? methodsFor(index, base) : null;
  }
  const keys = index.byName[type];
  if (keys && keys.length) {
    const set = new Set();
    keys.forEach((k) => index.methods[k].forEach((m) => set.add(m)));
    return set;
  }
  return null;
}

function check(html, opts) {
  const index = loadIndex(opts && opts.indexFile);
  const problems = [];
  const seen = new Set();
  const report = (kind, name, message) => {
    const key = kind + ':' + name;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ kind, name, message });
  };

  codeOf(html).forEach((raw) => {
    const code = stripComments(raw);
    const types = {};
    Object.keys(ROOT_TYPES).forEach((g) => { types[g] = ROOT_TYPES[g]; });
    // Shadowed globals (var current = ...) lose their fixed type.
    code.replace(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?!new\b)/g, (m, v) => { delete types[v]; return m; });
    // Only `v = new X(...)` on its own types v; `v = new X().build()` returns something else.
    const assign = /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:([a-z_][\w]*)\.)?([A-Za-z_$][\w$]*)\s*\(/g;
    let a;
    while ((a = assign.exec(code))) {
      const [, v, ns, cls] = a;
      const end = closingParen(code, assign.lastIndex - 1);
      const chained = end > 0 && /^\s*\./.test(code.slice(end + 1));
      if (!chained && (CLASS_NAME.test(cls) || ns)) types[v] = cls;
      else delete types[v];
    }

    code.replace(/\bnew\s+(?:([a-z_][\w]*)\.)?([A-Za-z_$][\w$]*)\s*\(/g, (m, ns, cls) => {
      if (ns && EXTRA_NAMESPACES.includes(ns)) return m;
      if ((ns && /^sn_/.test(ns)) || CLASS_NAME.test(cls)) {
        if (!knownClass(index, cls)) report('class', (ns ? ns + '.' : '') + cls, `class ${cls} is not in the API reference`);
      }
      return m;
    });

    // receiver.method( — receiver may be `current.field` (GlideElement).
    code.replace(/(^|[^\w$.])([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\.([A-Za-z_$][\w$]*)\s*\(/g, (m, pre, recv, mid, method) => {
      let type = null;
      if (mid) {
        if ((recv === 'current' || recv === 'previous') && types[recv] === 'GlideRecord') type = 'GlideElement';
        else if (/^sn_/.test(recv) && CLASS_NAME.test(mid)) type = mid;
        else return m;
      } else if (types[recv]) {
        type = types[recv];
      } else if (CLASS_NAME.test(recv)) {
        if (!knownClass(index, recv)) { report('class', recv, `class ${recv} is not in the API reference`); return m; }
        type = recv;
      } else {
        return m;
      }
      const methods = methodsFor(index, type);
      if (methods && !methods.has(method)) {
        report('method', type.replace(/^client:/, '') + '.' + method, `${type.replace(/^client:/, '')}.${method}() is not documented in the API reference`);
      }
      return m;
    });
  });
  return problems;
}

module.exports = { check, codeOf, loadIndex, EXTRA_CLASSES, EXTRA_METHODS, ROOT_TYPES };
