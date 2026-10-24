// scripts/sn-reference/build-api-index.js
// =============================================================================
// SERVICENOW API INDEX
// =============================================================================
// Builds data/sn-api-index.json from a folder of API reference pages saved as
// plain text by scrape-reference.mjs (one file per page; line 1 "URL: ...",
// line 2 "TITLE: ..."). The index lists every class, the methods documented on
// it, the client-side globals (g_form, g_user...) and the REST endpoints. The
// interview generator and validator use it to reject API names that do not
// exist in the reference.
//
// Usage:
//   node scripts/sn-reference/build-api-index.js <pages-dir> [release]
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'sn-api-index.json');

// A method heading: "getXML(Function callback)", "getXMLWait()", "open(Object options).then(fn)", or a long
// signature wrapped onto the next line ("getXMLAnswer(Function callback, Object additionalParam, Object").
const SIGNATURE = /^([A-Za-z_$][\w$]*) ?\(\s*(?:\)(?:\.[\w$]+\([^)]*\))?\s*$|[A-Z][\w.<>\[\]]*\s+[\w$]+)/;
// Example code on a page calls the class through its usual variable name.
const EXAMPLE_ALIASES = {
  GlideSystem: ['gs'], 'client:GlideForm': ['g_form'], 'client:GlideUser': ['g_user'], 'client:GlideList2': ['g_list'],
  'client:spModal': ['spModal'], 'client:spUtil': ['spUtil'], 'client:spAriaUtil': ['spAriaUtil'],
  'client:g_service_catalog': ['g_service_catalog'], 'client:GlideAgentWorkspace': ['g_aw'], GlideSPScriptable: ['\\$sp'],
};
const REST_PATH = /^(GET|POST|PUT|PATCH|DELETE) (\/[^\s].*)$/;

function className(title) {
  return title
    .replace(/\s+-\s+(Scoped|Global).*$/, '')
    .replace(/\s*\((deprecated)\)/gi, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

// "GlideForm (g_form)" and "GlideMenu (g_menu and g_item)" name their globals.
function globalsIn(title) {
  const m = title.match(/\(([^)]*g_[^)]*)\)/);
  return m ? m[1].split(/\s+and\s+|,\s*/).map((s) => s.trim()).filter((s) => /^g_\w+$/.test(s)) : [];
}

function namespaceOf(url, type) {
  if (type !== 'server') return null;
  const seg = (url.split('/server/')[1] || '').split('/')[0];
  if (!seg || seg === 'no-namespace') return null;
  return seg.replace(/-namespace$/, '');
}

function build(dir, release) {
  const index = { release, generated: new Date().toISOString().slice(0, 10), pages: [], classes: {}, globals: {}, rest: [] };
  for (const type of ['server', 'client', 'rest']) {
    const folder = path.join(dir, type);
    if (!fs.existsSync(folder)) continue;
    for (const file of fs.readdirSync(folder).sort()) {
      const lines = fs.readFileSync(path.join(folder, file), 'utf8').split('\n');
      const url = (lines[0] || '').replace(/^URL:\s*/, '').trim();
      const title = (lines[1] || '').replace(/^TITLE:\s*/, '').trim();
      if (url) index.pages.push(url);
      if (type === 'rest') {
        lines.forEach((l) => {
          const m = l.match(REST_PATH);
          if (m) index.rest.push(m[1] + ' ' + m[2].replace(/\s+/g, ''));
        });
        continue;
      }
      const name = className(title);
      if (!name) continue;
      const methods = new Set();
      lines.forEach((l) => {
        const m = l.trim().match(SIGNATURE);
        if (m) methods.add(m[1]);
      });
      const key = type === 'client' ? 'client:' + name : name;
      const text = lines.join('\n');
      [name.replace(/[^\w$]/g, '')].concat(EXAMPLE_ALIASES[key] || []).forEach((alias) => {
        const re = new RegExp('(?:^|[^\\w$.])' + alias + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
        let m;
        while ((m = re.exec(text))) methods.add(m[1]);
      });
      const entry = index.classes[key] || { type, namespace: namespaceOf(url, type), url, methods: [] };
      entry.methods = Array.from(new Set(entry.methods.concat(Array.from(methods)))).sort();
      index.classes[key] = entry;
      // First page wins: GlideForm before Mobile GlideForm, GlideList2 before the deprecated GlideListV3.
      globalsIn(title).forEach((g) => { if (!index.globals[g]) index.globals[g] = key; });
    }
  }
  index.pages.sort();
  index.rest = Array.from(new Set(index.rest)).sort();
  return index;
}

if (require.main === module) {
  const [dir, release = 'brazil'] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node scripts/sn-reference/build-api-index.js <pages-dir> [release]');
    process.exit(1);
  }
  const index = build(dir, release);
  fs.writeFileSync(OUT, JSON.stringify(index, null, 1) + '\n');
  const methods = Object.values(index.classes).reduce((n, c) => n + c.methods.length, 0);
  console.log(`${index.pages.length} pages, ${Object.keys(index.classes).length} classes, ${methods} methods, ${Object.keys(index.globals).length} globals, ${index.rest.length} REST endpoints -> ${path.relative(ROOT, OUT)}`);
}

module.exports = { build, className, globalsIn };
