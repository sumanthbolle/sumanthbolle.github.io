/* UPSC notebook: the coordinator's morning briefs, evening check-ins, weekly
   reviews, current-affairs notes, deadline alarms and plan versions.

   Reads data/upsc/notebook/index.json (built by scripts/upsc/notebook-index.js)
   and renders Markdown post files on demand. When the notebook is locked
   (index.lock present) every entry, the schedule and the progress log are
   envelopes from notebook-crypto.js; the page asks for the passphrase,
   unwraps the private key and decrypts on the device. URL contract:
     ?view=notebook                  entries, newest first
     ?view=notebook&cat=<category>   entries filtered to one category
     ?view=notebook&post=<id>        one entry
     ?view=notebook&tab=progress     readiness metrics and the daily log form
   app.js owns the tab itself; this module only fills #view-notebook. */
;(function () {
  'use strict';

  var INDEX_URL = 'data/upsc/notebook/index.json';
  var FALLBACK_CATEGORIES = [
    { id: 'morning-brief', label: 'Morning briefs' },
    { id: 'nightly-checkin', label: 'Evening check-ins' },
    { id: 'weekly-review', label: 'Weekly reviews' },
    { id: 'current-affairs', label: 'Current affairs' },
    { id: 'deadline-alert', label: 'Deadlines' },
    { id: 'plan', label: 'Plan' }
  ];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeHref(url) {
    var value = String(url || '').trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (/^(mailto:|\/|\.\/|\.\.\/|#|\?)/.test(value)) return value;
    if (/^[\w./-]+(\?.*)?(#.*)?$/.test(value)) return value;
    return '#';
  }

  /* ───────────────────────── Markdown (small, escaped) ───────────────────────── */

  function inline(text) {
    var out = esc(text);
    out = out.replace(/`([^`]+)`/g, function (m, code) { return '<code>' + code + '</code>'; });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      var url = safeHref(href.replace(/&amp;/g, '&'));
      var external = /^https?:\/\//i.test(url);
      return '<a href="' + esc(url) + '"' + (external ? ' rel="noopener noreferrer" target="_blank"' : '') + '>' + label + '</a>';
    });
    out = out.replace(/(^|[^*])\*\*([^*\n]+)\*\*/g, '$1<strong>$2</strong>');
    out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    return out;
  }

  function tableHtml(rows) {
    var cells = rows.map(function (row) {
      return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    });
    if (cells.length < 2 || !/^:?-{2,}:?$/.test(cells[1][0].replace(/\s/g, ''))) return null;
    var head = cells[0];
    var body = cells.slice(2);
    var html = '<div class="nb-table"><table><thead><tr>';
    head.forEach(function (c) { html += '<th scope="col">' + inline(c) + '</th>'; });
    html += '</tr></thead><tbody>';
    body.forEach(function (row) {
      html += '<tr>';
      head.forEach(function (c, i) { html += '<td>' + inline(row[i] || '') + '</td>'; });
      html += '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  function markdown(src) {
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var html = '';
    var i = 0;
    var para = [];

    function flushPara() {
      if (!para.length) return;
      html += '<p>' + inline(para.join(' ')) + '</p>';
      para = [];
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^```/.test(line)) {
        flushPara();
        var code = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
        i += 1;
        html += '<pre><code>' + esc(code.join('\n')) + '</code></pre>';
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushPara();
        var level = Math.min(heading[1].length + 1, 4); /* post title is the h2 */
        html += '<h' + level + '>' + inline(heading[2].replace(/\s+#+\s*$/, '')) + '</h' + level + '>';
        i += 1;
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushPara();
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
        var table = tableHtml(rows);
        if (table) html += table;
        else rows.forEach(function (row) { html += '<p>' + inline(row) + '</p>'; });
        continue;
      }

      if (/^\s*>/.test(line)) {
        flushPara();
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
        html += '<blockquote>' + markdown(quote.join('\n')) + '</blockquote>';
        continue;
      }

      var listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (listMatch) {
        flushPara();
        var ordered = /\d/.test(listMatch[2]);
        var items = [];
        while (i < lines.length) {
          var m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (m && (/\d/.test(m[2]) === ordered)) {
            items.push(m[3]);
            i += 1;
          } else if (items.length && /^\s{2,}\S/.test(lines[i]) && !lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+/)) {
            items[items.length - 1] += ' ' + lines[i].trim();
            i += 1;
          } else break;
        }
        html += (ordered ? '<ol>' : '<ul>') + items.map(function (item) { return '<li>' + inline(item) + '</li>'; }).join('') + (ordered ? '</ol>' : '</ul>');
        continue;
      }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushPara();
        html += '<hr>';
        i += 1;
        continue;
      }

      if (!line.trim()) { flushPara(); i += 1; continue; }

      para.push(line.trim());
      i += 1;
    }
    flushPara();
    return html;
  }

  function stripFrontmatter(text) {
    var m = String(text || '').match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    return m ? m[1] : String(text || '');
  }

  /* ───────────────────────────── dates and labels ───────────────────────────── */

  function longDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return esc(iso);
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
    return day + ' ' + (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
  }

  function monthKey(iso) { return String(iso || '').slice(0, 7); }

  function monthLabel(key) {
    var m = String(key).match(/^(\d{4})-(\d{2})$/);
    return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : key;
  }

  function categoryLabel(categories, id) {
    for (var i = 0; i < categories.length; i += 1) if (categories[i].id === id) return categories[i].label;
    return id;
  }

  function metaLine(post, categories) {
    var parts = ['<span>' + esc(categoryLabel(categories, post.category)) + '</span>'];
    parts.push('<span>' + longDate(post.date) + (post.time ? ', ' + esc(post.time) + ' SGT' : '') + '</span>');
    if (post.daysToGo !== null && post.daysToGo !== undefined) parts.push('<span>' + esc(post.daysToGo) + ' days to Prelims</span>');
    if (post.week !== null && post.week !== undefined) parts.push('<span>Week ' + esc(post.week) + (post.phase ? ', ' + esc(post.phase) : '') + '</span>');
    else if (post.phase) parts.push('<span>' + esc(post.phase) + '</span>');
    if (post.updated && post.updated !== post.date) parts.push('<span>updated ' + longDate(post.updated) + '</span>');
    return parts.join('');
  }


  /* ───────────────────────────────── state ───────────────────────────────── */

  var REPO = 'sumanthbolle/sumanthbolle.github.io';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var NB = 'data/upsc/notebook/';
  var TOKEN_KEY = 'nb_gh_token';
  var SESSION_KEY = 'nb_private_jwk';

  var Crypto = window.UPSCNotebookCrypto;
  var Metrics = window.UPSCNotebookMetrics;

  var state = {
    index: null, error: null, loading: false,
    postCache: {},            /* id -> markdown body (decrypted) */
    privateJwk: null,         /* in memory only; mirrored to sessionStorage for the tab */
    decrypting: false, decryptedCount: 0,
    schedule: null, logs: null,
    busy: '', notice: ''
  };
  var els = {};

  function el(id) { return els[id] || (els[id] = document.getElementById(id)); }

  function urlState() {
    var url = new URL(window.location.href);
    return {
      active: url.searchParams.get('view') === 'notebook',
      post: url.searchParams.get('post') || '',
      cat: url.searchParams.get('cat') || '',
      tab: url.searchParams.get('tab') || 'entries'
    };
  }

  function href(params) {
    var url = new URL(window.location.href);
    url.searchParams.set('view', 'notebook');
    ['post', 'cat', 'tab', 'article', 'note'].forEach(function (k) { url.searchParams.delete(k); });
    url.hash = '';
    if (params && params.post) url.searchParams.set('post', params.post);
    if (params && params.cat) url.searchParams.set('cat', params.cat);
    if (params && params.tab && params.tab !== 'entries') url.searchParams.set('tab', params.tab);
    return url.pathname + url.search;
  }

  function navigate(params) {
    if (window.history && window.history.pushState) window.history.pushState({ view: 'notebook' }, '', href(params));
    render();
  }

  function store(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
  }
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function sessionStore(key, value) {
    try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function sessionRead(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }

  function todayIso() {
    /* Singapore date, whatever the device clock's zone. */
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }

  /* ──────────────────────────────── loading ──────────────────────────────── */

  function loadIndex() {
    if (state.index || state.loading) return;
    state.loading = true;
    fetch(INDEX_URL + '?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        state.index = {
          categories: Array.isArray(json.categories) && json.categories.length ? json.categories : FALLBACK_CATEGORIES,
          posts: Array.isArray(json.posts) ? json.posts.filter(validPost) : [],
          logs: Array.isArray(json.logs) ? json.logs : [],
          lock: json.lock && json.lock.publicKeyPath ? json.lock : null,
          generated: json.generated || ''
        };
        state.loading = false;
        var saved = sessionRead(SESSION_KEY);
        if (saved && state.index.lock) {
          try { state.privateJwk = JSON.parse(saved); } catch (e) { state.privateJwk = null; }
          if (state.privateJwk && state.privateJwk.kid !== state.index.lock.kid) state.privateJwk = null;
        }
        render();
        if (unlocked()) afterUnlock();
      })
      .catch(function (error) {
        state.loading = false;
        state.error = error && error.message ? error.message : 'unavailable';
        render();
      });
  }

  function validPost(p) {
    return p && typeof p.id === 'string' && /^[\w-]+$/.test(p.id) && typeof p.path === 'string' &&
      /^data\/upsc\/notebook\/posts\/[\w-]+\.md(\.enc)?$/.test(p.path) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date));
  }

  function locked() { return !!(state.index && state.index.lock); }
  function unlocked() { return !locked() || !!state.privateJwk; }

  function fetchText(path) {
    return fetch(path + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function decryptText(text) {
    if (!Crypto.isEnvelope(text)) return Promise.resolve(text);
    if (!state.privateJwk) return Promise.reject(new Error('locked'));
    return Crypto.decrypt(state.privateJwk, text);
  }

  function loadPost(post) {
    if (state.postCache[post.id]) return Promise.resolve(state.postCache[post.id]);
    return fetchText(post.path).then(decryptText).then(function (text) {
      var meta = parseFrontmatterLite(text);
      if (post.encrypted && meta) {
        /* An encrypted entry's index row carries only date and category; the
           rest comes from the decrypted frontmatter. */
        post.title = meta.title || post.title || 'Untitled';
        post.summary = meta.summary || '';
        post.time = meta.time || null;
        post.week = meta.week !== undefined ? Number(meta.week) : null;
        post.phase = meta.phase || null;
        post.daysToGo = meta.days_to_go !== undefined ? Number(meta.days_to_go) : null;
        post.updated = meta.updated || null;
        if (meta.category && meta.category !== post.category) post.category = meta.category;
      }
      var body = stripFrontmatter(text);
      state.postCache[post.id] = body;
      return body;
    });
  }

  function parseFrontmatterLite(text) {
    var m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    var meta = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i === -1) return;
      var v = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
      meta[line.slice(0, i).trim()] = v;
    });
    return meta;
  }

  /* After unlocking: decrypt every entry's frontmatter so the list has titles,
     then load the schedule and logs for the Progress view. */
  function afterUnlock() {
    if (state.decrypting) return;
    state.decrypting = true;
    state.decryptedCount = 0;
    render();
    var enc = state.index.posts.filter(function (p) { return p.encrypted && !state.postCache[p.id]; });
    var chain = Promise.resolve();
    enc.forEach(function (post) {
      chain = chain.then(function () {
        return loadPost(post).catch(function (e) { post.title = 'Could not decrypt (' + e.message + ')'; }).then(function () {
          state.decryptedCount += 1;
          if (state.decryptedCount % 5 === 0) render();
        });
      });
    });
    chain.then(loadProgressData).then(function () { state.decrypting = false; render(); });
  }

  function loadProgressData() {
    var schedPath = NB + 'schedule.json';
    return fetchText(schedPath + '.enc').then(decryptText, function () { return fetchText(schedPath); })
      .then(function (text) { state.schedule = JSON.parse(text); })
      .catch(function () { state.schedule = null; })
      .then(function () {
        var logs = state.index.logs || [];
        return Promise.all(logs.map(function (row) {
          return fetchText(row.path).then(decryptText).then(function (t) { return JSON.parse(t); }).catch(function () { return null; });
        }));
      })
      .then(function (rows) { state.logs = rows.filter(Boolean); });
  }

  /* ───────────────────────────── GitHub writes ───────────────────────────── */

  function token() { return read(TOKEN_KEY) || ''; }

  function ghHeaders() {
    return { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  function utf8b64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function ghSha(path) {
    return fetch(API + path + '?ref=main', { headers: ghHeaders() }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('GitHub read ' + r.status + ' for ' + path);
      return r.json();
    }).then(function (j) { return j ? j.sha : null; });
  }

  function ghPut(path, text, message) {
    return ghSha(path).then(function (sha) {
      var body = { message: message, content: utf8b64(text), branch: 'main' };
      if (sha) body.sha = sha;
      return fetch(API + path, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error('GitHub write ' + r.status + ': ' + (j.message || path)); });
      return r.json();
    });
  }

  function ghDelete(path, message) {
    return ghSha(path).then(function (sha) {
      if (!sha) return null;
      return fetch(API + path, { method: 'DELETE', headers: ghHeaders(), body: JSON.stringify({ message: message, sha: sha, branch: 'main' }) })
        .then(function (r) { if (!r.ok) throw new Error('GitHub delete ' + r.status + ' for ' + path); return r.json(); });
    });
  }

  function ghRaw(path) {
    return fetch(API + path + '?ref=main', { headers: ghHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('GitHub read ' + r.status + ' for ' + path);
      return r.json();
    }).then(function (j) {
      var bin = atob(String(j.content || '').replace(/\n/g, ''));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return { text: new TextDecoder().decode(bytes), sha: j.sha };
    });
  }

  function ghList(dir) {
    return fetch(API + dir + '?ref=main', { headers: ghHeaders() }).then(function (r) {
      if (r.status === 404) return [];
      if (!r.ok) throw new Error('GitHub list ' + r.status + ' for ' + dir);
      return r.json();
    });
  }

  /* ─────────────────────────────── lock setup ────────────────────────────── */

  function setupLock(passphrase) {
    var publicJwk, privateJwk, wrapped;
    var steps = [];
    function note(s) { state.busy = s; render(); }
    note('Generating the key pair in this browser…');
    return Crypto.generateKeyPair().then(function (pair) {
      publicJwk = pair.publicJwk; privateJwk = pair.privateJwk;
      note('Wrapping the private key with your passphrase…');
      return Crypto.wrapPrivate(privateJwk, passphrase);
    }).then(function (w) {
      wrapped = w;
      note('Committing the keys…');
      return ghPut(NB + 'keys/public.jwk', JSON.stringify(publicJwk, null, 2) + '\n', 'notebook: add public key ' + publicJwk.kid);
    }).then(function () {
      return ghPut(NB + 'keys/private.enc', JSON.stringify(wrapped) + '\n', 'notebook: add passphrase-wrapped private key');
    }).then(function () {
      return ghList(NB + 'posts');
    }).then(function (files) {
      var plain = files.filter(function (f) { return /\.md$/.test(f.name); });
      var chain = Promise.resolve();
      plain.forEach(function (f, i) {
        chain = chain.then(function () {
          note('Encrypting entry ' + (i + 1) + ' of ' + plain.length + ': ' + f.name);
          return ghRaw(NB + 'posts/' + f.name).then(function (r) {
            return Crypto.encrypt(publicJwk, r.text);
          }).then(function (env) {
            return ghPut(NB + 'posts/' + f.name + '.enc', JSON.stringify(env) + '\n', 'notebook: encrypt ' + f.name);
          }).then(function () {
            return ghDelete(NB + 'posts/' + f.name, 'notebook: remove plaintext ' + f.name);
          });
        });
      });
      return chain;
    }).then(function () {
      note('Encrypting the schedule…');
      return ghRaw(NB + 'schedule.json').then(function (r) {
        return Crypto.encrypt(publicJwk, r.text).then(function (env) {
          return ghPut(NB + 'schedule.json.enc', JSON.stringify(env) + '\n', 'notebook: encrypt schedule');
        }).then(function () { return ghDelete(NB + 'schedule.json', 'notebook: remove plaintext schedule'); });
      }, function () { return null; });
    }).then(function () {
      return ghList(NB + 'log');
    }).then(function (files) {
      var plain = files.filter(function (f) { return /\.json$/.test(f.name); });
      var chain = Promise.resolve();
      plain.forEach(function (f) {
        chain = chain.then(function () {
          note('Encrypting log ' + f.name);
          return ghRaw(NB + 'log/' + f.name).then(function (r) { return Crypto.encrypt(publicJwk, r.text); })
            .then(function (env) { return ghPut(NB + 'log/' + f.name + '.enc', JSON.stringify(env) + '\n', 'notebook: encrypt log ' + f.name); })
            .then(function () { return ghDelete(NB + 'log/' + f.name, 'notebook: remove plaintext log ' + f.name); });
        });
      });
      return chain;
    }).then(function () {
      state.busy = '';
      state.privateJwk = privateJwk;
      sessionStore(SESSION_KEY, JSON.stringify(privateJwk));
      return { privateJwk: privateJwk, kid: publicJwk.kid };
    }).catch(function (e) { state.busy = ''; throw e; });
  }

  function unlock(passphrase) {
    state.busy = 'Unlocking…'; render();
    return fetchText(state.index.lock.privateKeyPath).then(function (wrapped) {
      return Crypto.unwrapPrivate(wrapped, passphrase);
    }).then(function (jwk) {
      state.privateJwk = jwk;
      sessionStore(SESSION_KEY, JSON.stringify(jwk));
      state.busy = ''; state.notice = '';
      render();
      afterUnlock();
    }).catch(function (e) {
      state.busy = ''; state.notice = e.message === 'wrong passphrase' ? 'That passphrase does not open this notebook.' : 'Could not unlock: ' + e.message;
      render();
    });
  }

  function lockNow() {
    state.privateJwk = null;
    sessionStore(SESSION_KEY, null);
    state.postCache = {}; state.logs = null; state.schedule = null;
    state.index.posts.forEach(function (p) { if (p.encrypted) { p.title = null; p.summary = null; } });
    render();
  }

  /* ───────────────────────────── log entries ─────────────────────────────── */

  function saveLog(entry) {
    var path = NB + 'log/' + entry.date + '.json' + (locked() ? '.enc' : '');
    var text = JSON.stringify(entry, null, 1) + '\n';
    var write = locked()
      ? fetchText(state.index.lock.publicKeyPath).then(function (t) { return Crypto.encrypt(JSON.parse(t), text); }).then(function (env) { return JSON.stringify(env) + '\n'; })
      : Promise.resolve(text);
    state.busy = 'Saving ' + entry.date + '…'; render();
    return write.then(function (payload) { return ghPut(path, payload, 'notebook: log ' + entry.date); }).then(function () {
      state.logs = (state.logs || []).filter(function (l) { return l.date !== entry.date; }).concat([entry]);
      if (!state.index.logs.some(function (r) { return r.date === entry.date; })) state.index.logs.unshift({ date: entry.date, path: path, encrypted: locked() });
      state.busy = ''; state.notice = 'Saved ' + entry.date + '. The index rebuilds within a few minutes; this page already shows it.';
      render();
    }).catch(function (e) { state.busy = ''; state.notice = 'Not saved: ' + e.message; render(); });
  }

  /* ─────────────────────────────── rendering ─────────────────────────────── */

  function chipsHtml(categories, posts, activeCat) {
    var total = posts.length;
    var html = '<a class="an-chip" aria-pressed="' + (!activeCat ? 'true' : 'false') + '" href="' + esc(href({})) + '" data-nb-cat="">All <span class="nb-chip__count">' + total + '</span></a>';
    categories.forEach(function (c) {
      var count = posts.filter(function (p) { return p.category === c.id; }).length;
      if (!count) return;
      html += '<a class="an-chip" aria-pressed="' + (activeCat === c.id ? 'true' : 'false') + '" href="' + esc(href({ cat: c.id })) + '" data-nb-cat="' + esc(c.id) + '">' + esc(c.label) + ' <span class="nb-chip__count">' + count + '</span></a>';
    });
    return html;
  }

  function listHtml(posts, categories, activeCat) {
    var shown = activeCat ? posts.filter(function (p) { return p.category === activeCat; }) : posts;
    if (!shown.length) return '<p class="pr-message">Nothing here yet. The first entry appears when the next scheduled run publishes.</p>';
    var html = '';
    var currentMonth = '';
    shown.forEach(function (post) {
      var key = monthKey(post.date);
      if (key !== currentMonth) {
        if (currentMonth) html += '</ol></section>';
        currentMonth = key;
        html += '<section class="pr-shelf nb-month"><h3 class="pr-shelf__title">' + esc(monthLabel(key)) + '</h3><ol class="pr-list">';
      }
      var title = post.title || (post.encrypted ? 'Decrypting…' : 'Untitled');
      html += '<li class="pr-story"><a class="pr-story__link" href="' + esc(href({ post: post.id })) + '" data-nb-post="' + esc(post.id) + '">' +
        '<span class="pr-story__index">' + esc(post.date.slice(8)) + ' ' + esc(MONTHS[+post.date.slice(5, 7) - 1].slice(0, 3)) + (post.time ? '<br>' + esc(post.time) : '') + '</span>' +
        '<span class="pr-story__content"><span class="pr-story__meta">' + metaLine(post, categories) + '</span>' +
        '<h4>' + esc(title) + '</h4>' +
        (post.summary ? '<p>' + esc(post.summary) + '</p>' : '') + '</span>' +
        '<span class="pr-story__arrow" aria-hidden="true">→</span></a></li>';
    });
    if (currentMonth) html += '</ol></section>';
    return html;
  }

  function neighbour(posts, post, step) {
    var idx = posts.indexOf(post);
    var next = idx + step;
    return next >= 0 && next < posts.length ? posts[next] : null;
  }

  function readerHtml(post, body, categories, posts) {
    var newer = neighbour(posts, post, -1);
    var older = neighbour(posts, post, 1);
    var nav = '';
    if (older) nav += '<a class="btn" href="' + esc(href({ post: older.id })) + '" data-nb-post="' + esc(older.id) + '">← Older: ' + esc(older.title || older.date) + '</a>';
    if (newer) nav += '<a class="btn" href="' + esc(href({ post: newer.id })) + '" data-nb-post="' + esc(newer.id) + '">Newer: ' + esc(newer.title || newer.date) + ' →</a>';
    return '<a class="pr-reader__back" href="' + esc(href({ cat: post.category })) + '" data-nb-cat="' + esc(post.category) + '">← ' + esc(categoryLabel(categories, post.category)) + '</a>' +
      '<p class="pr-reader__meta">' + metaLine(post, categories) + '</p>' +
      '<h2 tabindex="-1" id="nbPostTitle">' + esc(post.title || post.date) + '</h2>' +
      (post.summary ? '<p class="pr-reader__dek">' + esc(post.summary) + '</p>' : '') +
      '<div class="pr-reader__body nb-body">' + markdown(body) + '</div>' +
      '<p class="pr-section-source">Written by the Prelims 2027 coordinator from the master plan and the daily log.' + (post.encrypted ? ' Stored encrypted.' : '') + '</p>' +
      (nav ? '<div class="nb-postnav" role="navigation" aria-label="Other entries">' + nav + '</div>' : '');
  }

  function lockPanelHtml() {
    var hasToken = !!token();
    if (!locked()) {
      return '<section class="nb-lock" aria-labelledby="nbLockTitle">' +
        '<h3 id="nbLockTitle">This notebook is public</h3>' +
        '<p>Lock it so only you can read it. Every entry, the study schedule and your progress log are encrypted in this browser before they reach the repository; the page then asks for your passphrase to read them. The scheduled tasks keep publishing (they only need the public key).</p>' +
        '<form class="nb-form" id="nbSetupForm">' +
        '<label>GitHub token <span class="an-counter">fine-grained, contents read and write on this repository only</span><input type="password" name="token" value="' + esc(token()) + '" autocomplete="off" required></label>' +
        '<label>Passphrase<input type="password" name="pass1" autocomplete="new-password" minlength="12" required></label>' +
        '<label>Passphrase again<input type="password" name="pass2" autocomplete="new-password" minlength="12" required></label>' +
        '<p class="nb-warn">There is no reset. If the passphrase is lost the entries are unreadable, including by the coordinator. Twelve characters or more.</p>' +
        '<div class="an-formactions"><button type="submit" class="btn btn-primary"' + (state.busy ? ' disabled' : '') + '>Lock the notebook</button></div>' +
        '</form>' + statusHtml() + '</section>';
    }
    if (!unlocked()) {
      return '<section class="nb-lock" aria-labelledby="nbLockTitle">' +
        '<h3 id="nbLockTitle">Private notebook</h3>' +
        '<p>The entries are encrypted. Enter the passphrase to read them on this device; nothing is sent anywhere.</p>' +
        '<form class="nb-form nb-form--inline" id="nbUnlockForm">' +
        '<label>Passphrase<input type="password" name="pass" autocomplete="current-password" required autofocus></label>' +
        '<button type="submit" class="btn btn-primary"' + (state.busy ? ' disabled' : '') + '>Unlock</button>' +
        '</form>' + statusHtml() + '</section>';
    }
    return '';
  }

  function statusHtml() {
    return (state.busy ? '<p class="nb-status" role="status">' + esc(state.busy) + '</p>' : '') +
      (state.notice ? '<p class="nb-status nb-status--notice" role="alert">' + esc(state.notice) + '</p>' : '');
  }

  function settingsHtml() {
    return '<details class="nb-settings"><summary>Settings</summary><div class="nb-settings__body">' +
      '<form class="nb-form nb-form--inline" id="nbTokenForm"><label>GitHub token <span class="an-counter">kept in this browser only</span><input type="password" name="token" value="' + esc(token()) + '" autocomplete="off"></label>' +
      '<button type="submit" class="btn btn-sm">Save token</button><button type="button" class="btn btn-sm" data-nb-act="forget-token">Forget token</button></form>' +
      (locked() ? '<p><button type="button" class="btn btn-sm" data-nb-act="lock-now">Lock now</button> <span class="an-counter">Forgets the key in this tab. Key id ' + esc(state.index.lock.kid || '') + '.</span></p>' : '') +
      '</div></details>';
  }

  function tabsHtml(active) {
    return '<div class="an-segmented nb-tabs" role="group" aria-label="Notebook sections">' +
      '<a href="' + esc(href({})) + '" data-nb-tab="entries" aria-pressed="' + (active === 'entries' ? 'true' : 'false') + '">Entries</a>' +
      '<a href="' + esc(href({ tab: 'progress' })) + '" data-nb-tab="progress" aria-pressed="' + (active === 'progress' ? 'true' : 'false') + '">Progress</a>' +
      '</div>';
  }

  /* ───────────────────────────── progress view ───────────────────────────── */

  function tile(label, value, sub, tone) {
    return '<div class="nb-tile' + (tone ? ' nb-tile--' + tone : '') + '"><span class="nb-tile__label">' + esc(label) + '</span><span class="nb-tile__value">' + value + '</span>' + (sub ? '<span class="nb-tile__sub">' + sub + '</span>' : '') + '</div>';
  }
  function toneFor(score) { return score >= 0.85 ? 'good' : score >= 0.55 ? 'mid' : 'bad'; }
  function pc(x) { return Math.round(x * 100) + '%'; }

  function progressHtml() {
    if (!state.schedule) return '<p class="pr-message">The study schedule is not available, so there is nothing to measure against.</p>';
    var today = todayIso();
    var m = Metrics.compute({ logs: state.logs || [], schedule: state.schedule, today: today });
    var r = m.readiness;
    var html = '<section class="nb-readiness nb-readiness--' + esc(r.grade) + '" aria-labelledby="nbReadyTitle">' +
      '<div class="nb-readiness__score"><span class="nb-readiness__num">' + r.score + '</span><span class="nb-readiness__grade">' + esc(r.grade) + '</span></div>' +
      '<div class="nb-readiness__text"><h3 id="nbReadyTitle">Exam preparedness, ' + longDate(today) + '</h3>' +
      '<p class="nb-readiness__verdict">' + esc(r.verdict) + '</p>' +
      '<p class="nb-readiness__risk"><strong>Biggest risk.</strong> ' + esc(r.biggestRisk) + '</p>' +
      (r.caps.length ? '<ul class="nb-caps">' + r.caps.map(function (c) { return '<li>Capped at ' + c.cap + ': ' + esc(c.reason) + '</li>'; }).join('') + '</ul>' : '') +
      '</div></section>';

    html += '<div class="nb-tiles">' +
      tile('Hours vs plan to date', esc(m.hours.logged) + ' / ' + esc(m.hours.plannedToDate), 'deficit ' + esc(m.hours.deficit) + ' h · ' + pc(m.hours.ratio), toneFor(m.hours.score)) +
      tile('Projected total by exam', esc(m.hours.projectedTotal) + ' h', 'plan needs ' + esc(m.hours.requiredTotal) + ' · rate ' + esc(m.hours.weeklyRate) + ' h/week', m.hours.projectedTotal >= 660 ? 'good' : m.hours.projectedTotal >= 500 ? 'mid' : 'bad') +
      tile('Days logged', esc(m.consistency.loggedDays) + ' / ' + esc(m.consistency.plannedDays), 'zero days ' + esc(m.consistency.zeroDays) + ' · longest gap ' + esc(m.consistency.longestZeroStreak) + ' · streak ' + esc(m.consistency.currentStreak), toneFor(m.consistency.score)) +
      tile('Syllabus coverage', esc(m.coverage.unitsDone) + ' / ' + esc(m.coverage.unitsDue) + ' due', esc(m.coverage.unitsOverdue) + ' overdue · ' + esc(m.coverage.buildUnitsDone) + ' of ' + esc(m.coverage.buildUnitsTotal) + ' Build units', toneFor(m.coverage.score)) +
      tile('PYQ accuracy (last 50)', m.pyq.rolling50 === null ? '—' : pc(m.pyq.rolling50), (m.pyq.attempted ? esc(m.pyq.attempted) + ' attempted · overall ' + pc(m.pyq.accuracy || 0) : 'none logged') + ' · need 65 to 72%', toneFor(m.pyq.score)) +
      tile('CSAT, latest timed', m.csat.latest === null ? '—' : esc(m.csat.latest) + ' / 200', 'qualify 66 · target 90' + (m.csat.best !== null ? ' · best ' + esc(m.csat.best) : ''), toneFor(m.csat.score)) +
      tile('Projected GS-I', m.projection.gsScore ? esc(m.projection.gsScore) + ' / 200' : '—', 'cutoff band 88 to 100 · target 110 · ' + esc(m.projection.basis), toneFor(m.projection.score)) +
      tile('Mocks', esc(m.mocks.count), m.mocks.lastThreeAverage === null ? 'none yet; they start in March' : 'last three average ' + esc(m.mocks.lastThreeAverage), m.mocks.count ? toneFor((m.mocks.lastThreeAverage - 60) / 50) : '') +
      '</div>';

    html += '<section class="nb-block"><h3>How the score is built</h3><table class="nb-components"><thead><tr><th scope="col">Component</th><th scope="col">Score</th><th scope="col">Weight</th></tr></thead><tbody>' +
      r.components.map(function (c) { return '<tr><td>' + esc(c.label) + '</td><td>' + c.score + '</td><td>' + c.weight + '</td></tr>'; }).join('') +
      '</tbody></table><p class="an-counter">Weighted sum ' + r.raw + ', capped at ' + (r.caps.length ? Math.min.apply(null, r.caps.map(function (c) { return c.cap; })) : 100) + '. Missing data scores zero. The projection assumes you only attempt what you have covered and applies the one-third penalty at your rolling accuracy.</p></section>';

    if (m.coverage.overdueUnits.length) {
      html += '<section class="nb-block"><h3>Overdue units</h3><ul>' + m.coverage.overdueUnits.map(function (u) { return '<li>' + esc(u.label) + ' <span class="an-counter">due ' + esc(u.date) + '</span></li>'; }).join('') + '</ul></section>';
    }
    html += '<section class="nb-block"><h3>By subject</h3><table class="nb-components"><thead><tr><th scope="col">Subject</th><th scope="col">Done</th><th scope="col">Due by today</th><th scope="col">In Build</th></tr></thead><tbody>' +
      m.coverage.bySubject.map(function (s) { return '<tr><td>' + esc(s.subject) + '</td><td>' + s.done + '</td><td>' + s.due + '</td><td>' + s.total + '</td></tr>'; }).join('') + '</tbody></table></section>';

    html += logFormHtml(today);
    html += logTableHtml();
    return html;
  }

  function unitOptions(selectedDate, chosen) {
    var sel = chosen || [];
    var units = state.schedule.units.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var near = units.filter(function (u) { return Math.abs((Date.parse(u.date) - Date.parse(selectedDate)) / 86400000) <= 21; });
    var list = near.length ? near : units;
    return list.map(function (u) {
      return '<label class="nb-unit"><input type="checkbox" name="units" value="' + esc(u.id) + '"' + (sel.indexOf(u.id) !== -1 ? ' checked' : '') + '> <span>' + esc(u.date.slice(5)) + ' · ' + esc(u.label) + '</span></label>';
    }).join('');
  }

  function logFormHtml(today) {
    var existing = (state.logs || []).filter(function (l) { return l.date === today; })[0] || {};
    var canWrite = !!token();
    return '<section class="nb-block" id="nbLogSection"><h3>Log a day</h3>' +
      (canWrite ? '' : '<p class="nb-warn">Add a GitHub token in Settings to save entries to the repository.</p>') +
      '<form class="nb-form nb-logform" id="nbLogForm">' +
      '<div class="an-formgrid">' +
      '<label>Date<input type="date" name="date" value="' + esc(today) + '" required></label>' +
      '<label>Hours studied<input type="number" name="hours" min="0" max="16" step="0.25" value="' + esc(existing.hours !== undefined ? existing.hours : '') + '" required></label>' +
      '<label>PYQs attempted<input type="number" name="pyqAttempted" min="0" max="200" value="' + esc(existing.pyq ? existing.pyq.attempted : '') + '"></label>' +
      '<label>PYQs correct<input type="number" name="pyqCorrect" min="0" max="200" value="' + esc(existing.pyq ? existing.pyq.correct : '') + '"></label>' +
      '<label>CSAT questions attempted<input type="number" name="csatAttempted" min="0" max="80" value="' + esc(existing.csat ? existing.csat.attempted : '') + '"></label>' +
      '<label>CSAT correct<input type="number" name="csatCorrect" min="0" max="80" value="' + esc(existing.csat ? existing.csat.correct : '') + '"></label>' +
      '<label class="nb-check"><input type="checkbox" name="csatTimed"' + (existing.csat && existing.csat.timed ? ' checked' : '') + '> CSAT was a full timed paper</label>' +
      '<label>Mock GS-I score (0 to 200)<input type="number" name="mockGs" min="0" max="200" value="' + esc(existing.mock ? existing.mock.gsScore : '') + '"></label>' +
      '<label class="nb-check"><input type="checkbox" name="revisionDone"' + (existing.revisionDone ? ' checked' : '') + '> Revision queue done before new reading</label>' +
      '<label class="nb-check"><input type="checkbox" name="caDone"' + (existing.caDone ? ' checked' : '') + '> Current affairs done (20 min)</label>' +
      '<label class="an-field--full">Blockers or notes<textarea name="note" maxlength="400">' + esc(existing.note || '') + '</textarea></label>' +
      '</div>' +
      '<fieldset class="nb-units"><legend>Units completed <span class="an-counter">schedule within three weeks of the date</span></legend><div id="nbUnitList">' + unitOptions(today, existing.units) + '</div></fieldset>' +
      '<div class="an-formactions"><button type="submit" class="btn btn-primary"' + (canWrite && !state.busy ? '' : ' disabled') + '>Save day</button></div>' +
      '</form>' + statusHtml() + '</section>';
  }

  function logTableHtml() {
    var logs = (state.logs || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (!logs.length) return '<section class="nb-block"><h3>Log</h3><p class="pr-message">No days logged.</p></section>';
    return '<section class="nb-block"><h3>Log</h3><div class="nb-table"><table><thead><tr><th scope="col">Date</th><th scope="col">Hours</th><th scope="col">Units</th><th scope="col">PYQ</th><th scope="col">CSAT</th><th scope="col">Note</th></tr></thead><tbody>' +
      logs.map(function (l) {
        return '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.hours) + '</td><td>' + esc((l.units || []).length) + '</td>' +
          '<td>' + (l.pyq && l.pyq.attempted ? esc(l.pyq.correct) + '/' + esc(l.pyq.attempted) : '') + '</td>' +
          '<td>' + (l.csat && (l.csat.attempted || l.csat.score) ? (l.csat.score ? esc(l.csat.score) : esc(l.csat.correct) + '/' + esc(l.csat.attempted)) + (l.csat.timed ? ' timed' : '') : '') + '</td>' +
          '<td>' + esc(l.note || '') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function readLogForm(form) {
    var f = new FormData(form);
    var n = function (k) { var v = f.get(k); return v === '' || v === null ? null : Number(v); };
    var entry = { date: f.get('date'), hours: n('hours') || 0, units: f.getAll('units'), revisionDone: f.get('revisionDone') === 'on', caDone: f.get('caDone') === 'on', note: String(f.get('note') || '').trim(), savedAt: new Date().toISOString() };
    if (n('pyqAttempted')) entry.pyq = { attempted: n('pyqAttempted'), correct: n('pyqCorrect') || 0 };
    if (n('csatAttempted')) entry.csat = { attempted: n('csatAttempted'), correct: n('csatCorrect') || 0, timed: f.get('csatTimed') === 'on' };
    if (n('mockGs')) entry.mock = { gsScore: n('mockGs') };
    return entry;
  }

  /* ───────────────────────────────── render ──────────────────────────────── */

  function render() {
    var panel = el('view-notebook');
    if (!panel) return;
    var current = urlState();
    if (!current.active) return;
    loadIndex();

    var meta = el('notebookMeta');
    var chips = el('notebookFilter');
    var list = el('notebookList');
    var reader = el('notebookReader');
    var intro = el('notebookIntro');
    var tools = el('notebookTools');

    if (state.error && !state.index) {
      list.innerHTML = '<p class="pr-message">The notebook index could not be loaded (' + esc(state.error) + ').</p>';
      meta.textContent = ''; tools.innerHTML = ''; return;
    }
    if (!state.index) { list.innerHTML = '<p class="pr-message">Loading the notebook…</p>'; meta.textContent = ''; tools.innerHTML = ''; return; }

    if (!unlocked()) {
      intro.hidden = true; chips.hidden = true; list.hidden = true; reader.hidden = true;
      meta.textContent = state.index.posts.length + ' entries, private.';
      tools.innerHTML = lockPanelHtml();
      return;
    }

    var posts = state.index.posts;
    var categories = state.index.categories;
    var post = null;
    if (current.post) for (var i = 0; i < posts.length; i += 1) if (posts[i].id === current.post) { post = posts[i]; break; }

    tools.innerHTML = tabsHtml(post ? 'entries' : current.tab) + (locked() ? '' : lockPanelHtml()) + settingsHtml();

    if (current.tab === 'progress' && !post) {
      intro.hidden = true; chips.hidden = true; reader.hidden = true; reader.innerHTML = '';
      list.hidden = false;
      meta.textContent = (state.logs ? state.logs.length : 0) + ' days logged.';
      list.innerHTML = state.decrypting && !state.schedule ? '<p class="pr-message">Decrypting… ' + state.decryptedCount + ' entries so far.</p>' : progressHtml();
      return;
    }

    if (post) {
      chips.hidden = true; list.hidden = true; intro.hidden = true; reader.hidden = false;
      meta.textContent = '';
      reader.innerHTML = readerHtml(post, state.postCache[post.id] || '', categories, posts);
      if (!state.postCache[post.id]) {
        reader.querySelector('.nb-body').innerHTML = '<p class="pr-message">Loading…</p>';
        loadPost(post).then(function () { if (urlState().post === post.id) render(); }).catch(function (error) {
          var body = reader.querySelector('.nb-body');
          if (body) body.innerHTML = '<p class="pr-message">This entry could not be loaded (' + esc(error.message) + ').</p>';
        });
      }
      window.scrollTo({ top: Math.max(0, panel.getBoundingClientRect().top + window.pageYOffset - 128), behavior: 'auto' });
      return;
    }

    reader.hidden = true; reader.innerHTML = '';
    chips.hidden = false; list.hidden = false; intro.hidden = false;
    var missing = current.post && !post;
    chips.innerHTML = chipsHtml(categories, posts, current.cat);
    list.innerHTML = (missing ? '<p class="pr-message">That entry is not in the notebook. Here is everything else.</p>' : '') + listHtml(posts, categories, current.cat);
    var count = current.cat ? posts.filter(function (p) { return p.category === current.cat; }).length : posts.length;
    meta.textContent = count + (count === 1 ? ' entry' : ' entries') + (posts.length ? ', newest first. Latest: ' + longDate(posts[0].date) : '.') + (state.decrypting ? ' Decrypting ' + state.decryptedCount + '…' : '');
  }

  /* ──────────────────────────────── wiring ──────────────────────────────── */

  function onClick(event) {
    var link = event.target.closest('[data-nb-post], [data-nb-cat], [data-nb-tab], [data-nb-act]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (link.hasAttribute('data-nb-act')) {
      event.preventDefault();
      var act = link.getAttribute('data-nb-act');
      if (act === 'forget-token') { store(TOKEN_KEY, null); state.notice = 'Token forgotten.'; render(); }
      if (act === 'lock-now') lockNow();
      return;
    }
    event.preventDefault();
    if (link.hasAttribute('data-nb-post')) navigate({ post: link.getAttribute('data-nb-post') });
    else if (link.hasAttribute('data-nb-tab')) navigate({ tab: link.getAttribute('data-nb-tab') });
    else navigate({ cat: link.getAttribute('data-nb-cat') });
  }

  function onSubmit(event) {
    var form = event.target;
    if (form.id === 'nbUnlockForm') {
      event.preventDefault();
      unlock(new FormData(form).get('pass'));
    } else if (form.id === 'nbSetupForm') {
      event.preventDefault();
      var f = new FormData(form);
      if (f.get('pass1') !== f.get('pass2')) { state.notice = 'The two passphrases differ.'; render(); return; }
      if (!window.confirm('Lock the notebook now? Every entry and log in the repository will be re-committed encrypted. There is no passphrase reset.')) return;
      store(TOKEN_KEY, String(f.get('token')).trim());
      state.notice = '';
      setupLock(String(f.get('pass1'))).then(function (result) {
        state.index.lock = { kid: result.kid, publicKeyPath: NB + 'keys/public.jwk', privateKeyPath: NB + 'keys/private.enc' };
        state.index.posts.forEach(function (p) { if (!p.encrypted) { p.encrypted = true; p.path = p.path + '.enc'; } });
        state.notice = 'Locked. Copy the private key below into a Project doc named upsc/notebook-private-key.md so the scheduled tasks can read your log; it is shown once.';
        render();
        var box = document.createElement('section');
        box.className = 'nb-lock';
        box.innerHTML = '<h3>Private key (shown once)</h3><p>Paste this whole line into the Project doc <code>upsc/notebook-private-key.md</code>. Without it the coordinator can publish but cannot read your log or the entries.</p><textarea class="nb-keybox" readonly>' + esc(JSON.stringify(result.privateJwk)) + '</textarea><p><button type="button" class="btn btn-sm" id="nbCopyKey">Copy</button></p>';
        el('notebookTools').prepend(box);
        box.querySelector('#nbCopyKey').addEventListener('click', function () {
          navigator.clipboard.writeText(JSON.stringify(result.privateJwk)).then(function () { box.querySelector('#nbCopyKey').textContent = 'Copied'; });
        });
      }).catch(function (e) { state.notice = 'Setup failed: ' + e.message + '. Nothing has been lost; fix the token and try again.'; render(); });
    } else if (form.id === 'nbTokenForm') {
      event.preventDefault();
      store(TOKEN_KEY, String(new FormData(form).get('token')).trim());
      state.notice = 'Token saved in this browser.'; render();
    } else if (form.id === 'nbLogForm') {
      event.preventDefault();
      if (!token()) { state.notice = 'Add a GitHub token first.'; render(); return; }
      saveLog(readLogForm(form));
    }
  }

  function onChange(event) {
    if (event.target.name === 'date' && event.target.form && event.target.form.id === 'nbLogForm' && state.schedule) {
      var checked = Array.prototype.map.call(event.target.form.querySelectorAll('input[name="units"]:checked'), function (i) { return i.value; });
      el('nbUnitList').innerHTML = unitOptions(event.target.value, checked);
    }
  }

  function init() {
    var panel = el('view-notebook');
    if (!panel) return;
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    panel.addEventListener('change', onChange);
    window.addEventListener('upsc:viewchange', render);
    window.addEventListener('popstate', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.UPSCNotebook = { markdown: markdown, stripFrontmatter: stripFrontmatter, longDate: longDate };
})();
