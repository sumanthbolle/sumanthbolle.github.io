/* UPSC notebook: the coordinator's morning briefs, evening check-ins, weekly
   reviews, current-affairs notes, deadline alarms and plan versions.

   Reads data/upsc/notebook/index.json (built by scripts/upsc/notebook-index.js)
   and renders Markdown post files on demand. URL contract:
     ?view=notebook                  list, newest first
     ?view=notebook&cat=<category>   list filtered to one category
     ?view=notebook&post=<id>        one post
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

  var state = { index: null, error: null, loading: false, postCache: {} };
  var els = {};

  function el(id) { return els[id] || (els[id] = document.getElementById(id)); }

  function urlState() {
    var url = new URL(window.location.href);
    return {
      active: url.searchParams.get('view') === 'notebook',
      post: url.searchParams.get('post') || '',
      cat: url.searchParams.get('cat') || ''
    };
  }

  function href(params) {
    var url = new URL(window.location.href);
    url.searchParams.set('view', 'notebook');
    url.searchParams.delete('post');
    url.searchParams.delete('cat');
    url.searchParams.delete('article');
    url.searchParams.delete('note');
    url.hash = '';
    if (params && params.post) url.searchParams.set('post', params.post);
    if (params && params.cat) url.searchParams.set('cat', params.cat);
    return url.pathname + url.search;
  }

  function navigate(params) {
    if (window.history && window.history.pushState) window.history.pushState({ view: 'notebook' }, '', href(params));
    render();
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
          generated: json.generated || ''
        };
        state.loading = false;
        render();
      })
      .catch(function (error) {
        state.loading = false;
        state.error = error && error.message ? error.message : 'unavailable';
        render();
      });
  }

  function validPost(p) {
    return p && typeof p.id === 'string' && /^[\w-]+$/.test(p.id) && typeof p.path === 'string' &&
      /^data\/upsc\/notebook\/posts\/[\w-]+\.md$/.test(p.path) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date));
  }

  function loadPost(post) {
    if (state.postCache[post.id]) return Promise.resolve(state.postCache[post.id]);
    return fetch(post.path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var body = stripFrontmatter(text);
      state.postCache[post.id] = body;
      return body;
    });
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
    if (!shown.length) {
      return '<p class="pr-message">Nothing here yet. The first entry appears when the next scheduled run publishes.</p>';
    }
    var html = '';
    var currentMonth = '';
    shown.forEach(function (post) {
      var key = monthKey(post.date);
      if (key !== currentMonth) {
        if (currentMonth) html += '</ol></section>';
        currentMonth = key;
        html += '<section class="pr-shelf nb-month"><h3 class="pr-shelf__title">' + esc(monthLabel(key)) + '</h3><ol class="pr-list">';
      }
      html += '<li class="pr-story"><a class="pr-story__link" href="' + esc(href({ post: post.id })) + '" data-nb-post="' + esc(post.id) + '">' +
        '<span class="pr-story__index">' + esc(post.date.slice(8)) + ' ' + esc(MONTHS[+post.date.slice(5, 7) - 1].slice(0, 3)) + (post.time ? '<br>' + esc(post.time) : '') + '</span>' +
        '<span class="pr-story__content"><span class="pr-story__meta">' + metaLine(post, categories) + '</span>' +
        '<h4>' + esc(post.title) + '</h4>' +
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
    if (older) nav += '<a class="btn" href="' + esc(href({ post: older.id })) + '" data-nb-post="' + esc(older.id) + '">← Older: ' + esc(older.title) + '</a>';
    if (newer) nav += '<a class="btn" href="' + esc(href({ post: newer.id })) + '" data-nb-post="' + esc(newer.id) + '">Newer: ' + esc(newer.title) + ' →</a>';
    return '<a class="pr-reader__back" href="' + esc(href({ cat: post.category })) + '" data-nb-cat="' + esc(post.category) + '">← ' + esc(categoryLabel(categories, post.category)) + '</a>' +
      '<p class="pr-reader__meta">' + metaLine(post, categories) + '</p>' +
      '<h2 tabindex="-1" id="nbPostTitle">' + esc(post.title) + '</h2>' +
      (post.summary ? '<p class="pr-reader__dek">' + esc(post.summary) + '</p>' : '') +
      '<div class="pr-reader__body nb-body">' + markdown(body) + '</div>' +
      '<p class="pr-section-source">Written by the Prelims 2027 coordinator from the master plan and the daily log. <a href="' + esc(safeHref('https://github.com/sumanthbolle/sumanthbolle.github.io/blob/main/' + post.path)) + '" rel="noopener noreferrer" target="_blank">Source file</a></p>' +
      (nav ? '<div class="nb-postnav" role="navigation" aria-label="Other entries">' + nav + '</div>' : '');
  }

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

    if (state.error && !state.index) {
      list.innerHTML = '<p class="pr-message">The notebook index could not be loaded (' + esc(state.error) + '). <a href="' + esc(safeHref('https://github.com/sumanthbolle/sumanthbolle.github.io/tree/main/data/upsc/notebook/posts')) + '" rel="noopener noreferrer" target="_blank">Read the posts on GitHub</a>.</p>';
      meta.textContent = '';
      return;
    }
    if (!state.index) {
      list.innerHTML = '<p class="pr-message">Loading the notebook…</p>';
      meta.textContent = '';
      return;
    }

    var posts = state.index.posts;
    var categories = state.index.categories;
    var post = null;
    if (current.post) {
      for (var i = 0; i < posts.length; i += 1) if (posts[i].id === current.post) { post = posts[i]; break; }
    }

    if (post) {
      chips.hidden = true;
      list.hidden = true;
      intro.hidden = true;
      reader.hidden = false;
      meta.textContent = '';
      reader.innerHTML = readerHtml(post, state.postCache[post.id] || '', categories, posts);
      if (!state.postCache[post.id]) {
        reader.querySelector('.nb-body').innerHTML = '<p class="pr-message">Loading…</p>';
        loadPost(post).then(function () {
          if (urlState().post === post.id) render();
        }).catch(function (error) {
          var body = reader.querySelector('.nb-body');
          if (body) body.innerHTML = '<p class="pr-message">This entry could not be loaded (' + esc(error.message) + ').</p>';
        });
      }
      window.scrollTo({ top: Math.max(0, panel.getBoundingClientRect().top + window.pageYOffset - 128), behavior: 'auto' });
      return;
    }

    reader.hidden = true;
    reader.innerHTML = '';
    chips.hidden = false;
    list.hidden = false;
    intro.hidden = false;
    var missing = current.post && !post;
    chips.innerHTML = chipsHtml(categories, posts, current.cat);
    list.innerHTML = (missing ? '<p class="pr-message">That entry is not in the notebook. Here is everything else.</p>' : '') + listHtml(posts, categories, current.cat);
    var count = current.cat ? posts.filter(function (p) { return p.category === current.cat; }).length : posts.length;
    meta.textContent = count + (count === 1 ? ' entry' : ' entries') + (posts.length ? ', newest first. Latest: ' + longDate(posts[0].date) : '.');
  }

  /* ──────────────────────────────── wiring ──────────────────────────────── */

  function onClick(event) {
    var link = event.target.closest('[data-nb-post], [data-nb-cat]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (link.hasAttribute('data-nb-post')) navigate({ post: link.getAttribute('data-nb-post') });
    else navigate({ cat: link.getAttribute('data-nb-cat') });
  }

  function init() {
    var panel = el('view-notebook');
    if (!panel) return;
    panel.addEventListener('click', onClick);
    window.addEventListener('upsc:viewchange', render);
    window.addEventListener('popstate', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.UPSCNotebook = { markdown: markdown, stripFrontmatter: stripFrontmatter, longDate: longDate };
})();
