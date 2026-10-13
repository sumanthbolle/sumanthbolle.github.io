/* UPSC Today — shared answer renderer.
 *
 * Turns edition notes and Ask Summaverick answers into the same reading
 * components: tag line, one-line box, question headings, bold-label bullets,
 * source chips at the claim, a real key-numbers table and practice blocks in
 * native <details>. Every field is treated as untrusted: text is escaped and
 * only http(s) links are emitted. Pure string output, no DOM access.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UpscAnswerRender = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var OFFICIAL_HOST = /(^|\.)(gov\.in|nic\.in|rbi\.org\.in|gov|un\.org|who\.int|europa\.eu|imf\.org|worldbank\.org|wto\.org|unep\.org|ipcc\.ch|unfccc\.int|oecd\.org)$/i;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KIND_LABEL = { news: 'News', editorial: 'Editorial', explained: 'Explained' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function safeUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    return /^https?:\/\/[^\s]/i.test(raw) ? raw : '';
  }

  function hostOf(url) {
    var m = String(url || '').match(/^https?:\/\/([^\/?#:]+)/i);
    return m ? m[1].replace(/^www\./i, '').toLowerCase() : '';
  }

  function clip(value, max) {
    var s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function list(value) { return Array.isArray(value) ? value : []; }

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

  function isOfficial(source) {
    if (!isObject(source)) return false;
    if (source.kind === 'official') return true;
    if (source.kind) return false;
    return OFFICIAL_HOST.test(hostOf(safeUrl(source.url)));
  }

  function sourceNumber(source, index) {
    var n = Number(source && (source.n != null ? source.n : source.index));
    return n > 0 && n < 1000 && Math.floor(n) === n ? n : index + 1;
  }

  function sourceMap(sources) {
    var map = {};
    list(sources).forEach(function (source, i) {
      if (!isObject(source)) return;
      map[sourceNumber(source, i)] = source;
    });
    return map;
  }

  /* ── source chips ── */

  function sourceChip(source, fallbackN) {
    if (!isObject(source)) return '';
    var n = sourceNumber(source, (fallbackN || 1) - 1);
    var url = safeUrl(source.url);
    var official = isOfficial(source);
    var badge = official ? 'Official' : 'Secondary';
    var publisher = clip(source.publisher || source.source || hostOf(url) || source.title || 'Source', 40);
    var title = clip(source.title || publisher, 160);
    var cls = 'ue-chip ue-chip--' + (official ? 'official' : 'secondary');
    var numbered = !(fallbackN === 0 && source.n == null && source.index == null);
    var inner = (numbered ? '<span class="ue-chip__n">' + esc(n) + '</span>' : '') +
      '<span class="ue-chip__pub">' + esc(publisher) + '</span>' +
      '<span class="ue-chip__badge">' + badge + '</span>';
    var label = (numbered ? 'Source ' + n : 'Source') + ': ' + publisher + ', ' + badge + '. ' + title;
    if (!url) return '<span class="' + cls + '" title="' + esc(title) + '">' + inner + '</span>';
    return '<a class="' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
      esc(label) + '" title="' + esc(title) + '">' + inner + '</a>';
  }

  function resolveRef(ref, map) {
    if (isObject(ref)) return ref;
    var n = Number(ref);
    return map[n] || null;
  }

  function chipsFor(refs, map) {
    var seen = [];
    var html = list(refs).map(function (ref) {
      var source = resolveRef(ref, map);
      if (!source) return '';
      var key = isObject(ref) ? JSON.stringify(ref) : String(Number(ref));
      if (seen.indexOf(key) !== -1) return '';
      seen.push(key);
      return sourceChip(source, Number(ref) || 1);
    }).join('');
    return html ? ' <span class="ue-cites">' + html + '</span>' : '';
  }

  /* ── shared blocks ── */

  function labelled(label, textHtml) {
    var l = clip(label, 120);
    if (!l) return textHtml;
    if (!/[.:?!]$/.test(l)) l += '.';
    return '<strong>' + esc(l) + '</strong> ' + textHtml;
  }

  function dateText(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
    return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
  }

  function oneLineBox(text) {
    var t = clip(text, 600);
    return t ? '<div class="ue-oneline"><p class="ue-box__label">In one line</p><p>' + esc(t) + '</p></div>' : '';
  }

  function cellHtml(cell) {
    if (isObject(cell) && typeof cell.html === 'string') return cell.html;
    return esc(clip(cell, 400));
  }

  function cellText(cell) {
    if (isObject(cell)) return clip(cell.label || '', 80);
    return clip(cell, 80);
  }

  // Cells may be plain strings (escaped here) or {html} built by this module.
  function renderTable(headers, rows, opts) {
    var settings = opts || {};
    var head = list(headers).slice(0, 8);
    var body = list(rows).filter(Array.isArray).slice(0, 40);
    if (!head.length && !body.length) return '';
    var width = head.length;
    body.forEach(function (row) { width = Math.max(width, Math.min(row.length, 8)); });
    if (!width) return '';
    var cols = [];
    for (var i = 0; i < width; i++) cols.push(i < head.length ? cellText(head[i]) : '');
    var thead = '<thead><tr>' + cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead>';
    var tbody = '<tbody>' + body.map(function (row) {
      var cells = [];
      for (var j = 0; j < width; j++) {
        cells.push('<td data-label="' + esc(cols[j]) + '">' + (j < row.length ? cellHtml(row[j]) : '') + '</td>');
      }
      return '<tr>' + cells.join('') + '</tr>';
    }).join('') + '</tbody>';
    var caption = settings.caption ? '<caption>' + esc(clip(settings.caption, 160)) + '</caption>' : '';
    return '<div class="ue-table-wrap" role="region" tabindex="0" aria-label="' + esc(clip(settings.label || settings.caption || 'Table', 80)) + '">' +
      '<table class="ue-table">' + caption + thead + tbody + '</table></div>';
  }

  function misconceptionHtml(value) {
    var html = '';
    if (typeof value === 'string' && clip(value)) {
      html = '<p>' + esc(clip(value, 600)) + '</p>';
    } else if (isObject(value)) {
      var myth = clip(value.myth || value.wrong || value.claim, 400);
      var fact = clip(value.fact || value.right || value.correction, 400);
      if (myth) html += '<p><strong>Not quite:</strong> ' + esc(myth) + '</p>';
      if (fact) html += '<p><strong>Actually:</strong> ' + esc(fact) + '</p>';
    }
    return html ? '<aside class="ue-misconception"><p class="ue-box__label">Common misreading</p>' + html + '</aside>' : '';
  }

  function sourceListItems(sources) {
    return list(sources).map(function (source, i) {
      if (!isObject(source)) return '';
      var url = safeUrl(source.url);
      var title = clip(source.title || source.publisher || source.source || hostOf(url), 200);
      if (!title) return '';
      var date = clip(source.date, 30);
      return '<li>' + sourceChip(source, i + 1) + ' ' +
        (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a>' : '<span>' + esc(title) + '</span>') +
        (date ? ' <span class="ue-date">' + esc(date) + '</span>' : '') + '</li>';
    }).filter(Boolean).join('');
  }

  /* ── Ask Summaverick JSON contract ── */

  function isAnswerContract(data) {
    return isObject(data) && typeof data.oneLine === 'string' && Array.isArray(data.sections);
  }

  function tableFromAnswer(table) {
    if (Array.isArray(table) && table.length && Array.isArray(table[0])) {
      return renderTable(table[0], table.slice(1));
    }
    if (isObject(table) && (Array.isArray(table.headers) || Array.isArray(table.rows))) {
      return renderTable(table.headers || [], table.rows || [], { caption: table.caption });
    }
    return '';
  }

  function renderBlocks(answer) {
    if (!isObject(answer)) return '';
    var map = sourceMap(answer.sources);
    var out = [];
    out.push(oneLineBox(answer.oneLine));
    list(answer.sections).slice(0, 8).forEach(function (section) {
      if (!isObject(section)) return;
      var points = list(section.points).slice(0, 10).map(function (point) {
        if (typeof point === 'string') point = { text: point };
        if (!isObject(point) || !clip(point.text)) return '';
        return '<li>' + labelled(point.label, esc(clip(point.text, 900))) + chipsFor(point.cite, map) + '</li>';
      }).filter(Boolean).join('');
      var heading = clip(section.heading, 200);
      if (!heading && !points) return;
      out.push('<section class="ue-section">' + (heading ? '<h3 class="ue-q">' + esc(heading) + '</h3>' : '') +
        (points ? '<ul class="ue-points">' + points + '</ul>' : '') + '</section>');
    });
    out.push(tableFromAnswer(answer.table));
    out.push(misconceptionHtml(answer.misconception));
    if (isObject(answer.examAngle)) {
      var pre = clip(answer.examAngle.prelims, 600);
      var mains = clip(answer.examAngle.mains, 600);
      if (pre || mains) {
        out.push('<div class="ue-exam"><p class="ue-label">Exam angle</p>' +
          (pre ? '<p><strong>Prelims.</strong> ' + esc(pre) + '</p>' : '') +
          (mains ? '<p><strong>Mains.</strong> ' + esc(mains) + '</p>' : '') + '</div>');
      }
    }
    var items = sourceListItems(answer.sources);
    if (items) out.push('<div class="ue-sourcelist"><p class="ue-label">Sources</p><ol class="ue-sources">' + items + '</ol></div>');
    var retrieval = list(answer.retrieval).map(function (row) {
      var url = isObject(row) ? safeUrl(row.url) : '';
      if (!url) return '';
      return esc(row.status === 'read' ? 'Read' : 'Linked') + ' · ' + esc(hostOf(url));
    }).filter(Boolean);
    if (retrieval.length) out.push('<p class="ue-retrieval">Documents: ' + retrieval.join('; ') + '</p>');
    var follow = list(answer.followUps).map(function (q) { return clip(q, 160); }).filter(function (q) { return q.length > 3; }).slice(0, 4);
    if (follow.length) {
      out.push('<div class="ue-followups"><p class="ue-label">Follow-ups</p>' + follow.map(function (q) {
        return '<button type="button" class="ue-followup" data-followup="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('') + '</div>');
    }
    return '<div class="ue-answer">' + out.filter(Boolean).join('') + '</div>';
  }

  /* ── safe Markdown subset (fallback for non-JSON answers) ── */

  function inline(raw, map) {
    // Links become placeholders first, so citation and bold rewriting below
    // can never touch an href (e.g. https://x/doc[1]) or the link text.
    var links = [];
    var s = esc(raw).replace(/\u0000/g, '');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (all, text, url) {
      var safe = safeUrl(url);
      links.push(safe ? '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + text + '</a>' : text);
      return '\u0000' + (links.length - 1) + '\u0000';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[(\d{1,3})\]/g, function (all, n) {
      var source = map[Number(n)];
      return source ? '<span class="ue-cites">' + sourceChip(source, Number(n)) + '</span>' : all;
    });
    return s.replace(/\u0000(\d+)\u0000/g, function (all, i) { return links[Number(i)]; });
  }

  function splitRow(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }

  function renderMarkdown(text, sources) {
    var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (!src.trim()) return '';
    var map = sourceMap(sources);
    var lines = src.split('\n');
    var out = [];
    var para = [];
    var listType = '';
    var items = [];

    function flushPara() {
      if (!para.length) return;
      var raw = para.join('\n');
      var html = para.map(function (line) { return inline(line, map); }).join('<br>');
      if (/^\*\*(in one line|summary|bottom line|short answer)\b/i.test(raw.trim())) out.push('<p class="ue-oneline">' + html + '</p>');
      else out.push('<p>' + html + '</p>');
      para = [];
    }
    function flushList() {
      if (!items.length) return;
      out.push('<' + listType + ' class="ue-points">' + items.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</' + listType + '>');
      items = [];
      listType = '';
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) { flushPara(); flushList(); continue; }
      var heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) {
        flushPara(); flushList();
        out.push(heading[1].length <= 2
          ? '<h3 class="ue-q">' + inline(heading[2], map) + '</h3>'
          : '<h4>' + inline(heading[2], map) + '</h4>');
        continue;
      }
      if (trimmed.charAt(0) === '|' && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        flushPara(); flushList();
        var headers = splitRow(trimmed);
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim().charAt(0) === '|') {
          rows.push(splitRow(lines[i]).map(function (cell) { return { html: inline(cell, map), label: cell }; }));
          i++;
        }
        i--;
        out.push(renderTable(headers, rows));
        continue;
      }
      var bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      var numbered = line.match(/^\s*\d{1,3}[.)]\s+(.+)$/);
      if (bullet || numbered) {
        flushPara();
        var type = bullet ? 'ul' : 'ol';
        if (listType && listType !== type) flushList();
        listType = type;
        items.push(inline((bullet || numbered)[1], map));
        continue;
      }
      flushList();
      para.push(trimmed);
    }
    flushPara();
    flushList();
    return out.join('');
  }

  /* ── edition note ── */

  function safeId(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80) || 'note';
  }

  function sectionBody(body, refsHtml) {
    var parts = [];
    var bullets = [];
    function flush() {
      if (bullets.length) parts.push('<ul class="ue-points">' + bullets.join('') + '</ul>');
      bullets = [];
    }
    var rows = list(body).filter(function (item) {
      return typeof item === 'string' ? clip(item) : isObject(item) && clip(item.text);
    });
    rows.forEach(function (item, index) {
      if (typeof item === 'string') item = { text: item };
      var tail = index === rows.length - 1 ? refsHtml : '';
      var textHtml = esc(clip(item.text, 1200));
      if (item.label) bullets.push('<li>' + labelled(item.label, textHtml) + tail + '</li>');
      else { flush(); parts.push('<p>' + textHtml + tail + '</p>'); }
    });
    flush();
    if (!rows.length && refsHtml) parts.push('<p class="ue-cites-only">' + refsHtml + '</p>');
    return parts.join('');
  }

  function practiceHtml(practice, noteId) {
    if (!isObject(practice)) return '';
    var blocks = [];
    var mcq = practice.mcq;
    if (isObject(mcq) && clip(mcq.stem) && list(mcq.options).length >= 2) {
      var options = list(mcq.options).slice(0, 6);
      var answer = typeof mcq.answer === 'number' && Math.floor(mcq.answer) === mcq.answer &&
        mcq.answer >= 0 && mcq.answer < options.length ? mcq.answer : -1;
      var name = 'ue-mcq-' + safeId(noteId);
      var opts = options.map(function (opt, i) {
        return '<label class="ue-mcq__opt"><input type="radio" name="' + name + '" value="' + i + '"><span><span class="ue-mcq__letter">(' +
          String.fromCharCode(97 + i) + ')</span> ' + esc(clip(opt, 400)) + '</span></label>';
      }).join('');
      blocks.push('<details class="ue-practice ue-practice--mcq"><summary>Prelims MCQ</summary>' +
        '<div class="ue-mcq"' + (answer >= 0 ? ' data-answer="' + answer + '"' : '') + '>' +
        '<p class="ue-mcq__stem">' + esc(clip(mcq.stem, 1200)) + '</p>' +
        '<fieldset class="ue-mcq__opts"><legend class="sr-only">Options</legend>' + opts + '</fieldset>' +
        (answer >= 0 ? '<button type="button" class="ue-btn" data-ue-check>Check answer</button>' +
          '<div class="ue-mcq__result" role="status" hidden><p class="ue-mcq__verdict"></p>' +
          (clip(mcq.trap) ? '<p class="ue-mcq__trap"><strong>The trap.</strong> ' + esc(clip(mcq.trap, 900)) + '</p>' : '') + '</div>' : '') +
        '</div></details>');
    }
    var mains = practice.mains;
    if (isObject(mains) && clip(mains.question)) {
      var marks = typeof mains.marks === 'number' && mains.marks > 0 && mains.marks <= 250 ? mains.marks : 0;
      var structure = isObject(mains.structure) ? mains.structure : {};
      var bodyItems = list(structure.body).map(function (b) { return clip(b, 400); }).filter(Boolean);
      var plan = '';
      if (clip(structure.intro)) plan += '<li><strong>Introduction.</strong> ' + esc(clip(structure.intro, 400)) + '</li>';
      if (bodyItems.length) plan += '<li><strong>Body.</strong><ul>' + bodyItems.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></li>';
      if (clip(structure.conclusion)) plan += '<li><strong>Conclusion.</strong> ' + esc(clip(structure.conclusion, 400)) + '</li>';
      blocks.push('<details class="ue-practice ue-practice--mains"><summary>Mains question' + (marks ? ' · ' + marks + ' marks' : '') + '</summary>' +
        '<p class="ue-mains__q">' + esc(clip(mains.question, 600)) + '</p>' +
        (clip(mains.directive) ? '<p><strong>Directive.</strong> ' + esc(clip(mains.directive, 60)) + '</p>' : '') +
        (clip(mains.demand) ? '<p><strong>What it wants.</strong> ' + esc(clip(mains.demand, 600)) + '</p>' : '') +
        (plan ? '<p class="ue-label">Answer structure</p><ol class="ue-structure">' + plan + '</ol>' : '') +
        '</details>');
    }
    var pyq = practice.pyq;
    if (isObject(pyq) && clip(pyq.question)) {
      var year = typeof pyq.year === 'number' ? pyq.year : 0;
      var meta = [year ? String(year) : '', clip(pyq.paper, 40), typeof pyq.marks === 'number' ? pyq.marks + ' marks' : ''].filter(Boolean).join(' · ');
      blocks.push('<details class="ue-practice ue-practice--pyq"><summary>Previous year question' + (year ? ' · ' + year : '') + '</summary>' +
        (meta ? '<p class="ue-meta">' + esc(meta) + '</p>' : '') +
        '<p class="ue-mains__q">' + esc(clip(pyq.question, 800)) + '</p>' +
        (clip(pyq.why) ? '<p><strong>Why it is linked.</strong> ' + esc(clip(pyq.why, 400)) + '</p>' : '') + '</details>');
    }
    var faq = list(practice.faq).filter(function (row) { return isObject(row) && clip(row.q) && clip(row.a); }).slice(0, 5);
    if (faq.length) {
      blocks.push('<details class="ue-practice ue-practice--faq"><summary>Quick questions</summary><dl class="ue-faq">' +
        faq.map(function (row) { return '<dt>' + esc(clip(row.q, 300)) + '</dt><dd>' + esc(clip(row.a, 600)) + '</dd>'; }).join('') +
        '</dl></details>');
    }
    return blocks.length ? '<section class="ue-practice-set"><h3 class="ue-label-head">Practice</h3>' + blocks.join('') + '</section>' : '';
  }

  // Whole minutes from a number (current editions) or an "N min" string (older ones).
  function readMinutes(value) {
    var n = typeof value === 'number' ? value
      : (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*(min|mins|minutes?)?\s*$/i.test(value) ? parseFloat(value) : NaN);
    return isFinite(n) && n > 0 && n < 120 ? Math.round(n) : 0;
  }

  function renderNote(note) {
    if (!isObject(note)) return '';
    var map = sourceMap(note.sources);
    var out = [];
    var codes = list(note.codes).map(function (c) { return clip(c, 12); }).filter(Boolean).slice(0, 3);
    var papers = list(note.papers).map(function (p) { return clip(p, 8); }).filter(Boolean);
    var paper = papers[0] || (codes[0] ? codes[0].split('.')[0] : '');
    var crumbs = ['<a href="?view=brief" data-ue-back>UPSC Today</a>'];
    if (paper) crumbs.push('<span>' + esc(paper) + '</span>');
    if (clip(note.subject)) crumbs.push('<span>' + esc(clip(note.subject, 40)) + '</span>');
    var meta = [];
    var published = dateText(note.publishedAt);
    if (published) meta.push('<span>' + esc(published) + '</span>');
    var minutes = readMinutes(note.readTime);
    if (minutes) meta.push('<span>' + minutes + ' min read</span>');
    if (KIND_LABEL[note.kind]) meta.push('<span>' + KIND_LABEL[note.kind] + '</span>');
    var firstSource = list(note.sources).filter(isObject)[0];
    if (firstSource && clip(firstSource.publisher)) meta.push('<span>Source: ' + esc(clip(firstSource.publisher, 40)) + '</span>');
    if (codes.length) meta.push('<span class="ue-codes">' + codes.map(function (c) { return '<span class="ue-code">' + esc(c) + '</span>'; }).join(' ') + '</span>');
    out.push('<header class="ue-note__head">' +
      '<p class="ue-breadcrumb">' + crumbs.join('<span class="ue-crumb-sep" aria-hidden="true"> › </span>') + '</p>' +
      '<h2 class="ue-note__title" id="ueNoteTitle" tabindex="-1">' + esc(clip(note.title, 240)) + '</h2>' +
      (clip(note.deck) ? '<p class="ue-deck">' + esc(clip(note.deck, 400)) + '</p>' : '') +
      (meta.length ? '<p class="ue-meta-row">' + meta.join('') + '</p>' : '') + '</header>');
    out.push(oneLineBox(note.oneLine));

    var updates = list(note.updates).filter(function (u) { return isObject(u) && clip(u.text); });
    if (updates.length) {
      out.push('<aside class="ue-updates"><p class="ue-label">Updated</p><ul>' + updates.map(function (u) {
        return '<li>' + (clip(u.at) ? '<span class="ue-date">' + esc(clip(u.at, 30)) + '</span> ' : '') + esc(clip(u.text, 500)) +
          chipsFor(u.source != null ? [u.source] : [], map) + '</li>';
      }).join('') + '</ul></aside>');
    }

    if (isObject(note.whyInNews) && clip(note.whyInNews.text)) {
      out.push('<section class="ue-why"><h3 class="ue-label-head">Why in news</h3><p>' + esc(clip(note.whyInNews.text, 900)) +
        chipsFor(note.whyInNews.sources, map) + '</p></section>');
    }

    var qn = 0;
    list(note.sections).forEach(function (section) {
      if (!isObject(section)) return;
      var heading = clip(section.heading, 200);
      var body = sectionBody(section.body, chipsFor(section.sources, map));
      if (!heading && !body) return;
      out.push('<section class="ue-section">' + (heading ? '<h3 class="ue-q" id="ue-q-' + (++qn) + '">' + esc(heading) + '</h3>' : '') + body + '</section>');
    });

    var numbers = list(note.keyNumbers).filter(function (row) { return isObject(row) && clip(row.figure) && clip(row.meaning); });
    if (numbers.length) {
      out.push('<section class="ue-keynumbers"><h3 class="ue-label-head">Key numbers</h3>' +
        renderTable(['Figure', 'What it means', 'Source'], numbers.map(function (row) {
          var chip = chipsFor(row.source != null ? [row.source] : [], map);
          return [{ html: '<strong>' + esc(clip(row.figure, 60)) + '</strong>' }, clip(row.meaning, 300), { html: chip || '—' }];
        }), { label: 'Key numbers' }) +
        '<span id="ue-keynumbers-end" class="ue-sentinel" aria-hidden="true"></span></section>');
    }

    var basics = note.back2basics;
    if (isObject(basics) && clip(basics.text)) {
      out.push('<aside class="ue-basics"><p class="ue-box__label">Back to basics</p>' +
        (clip(basics.concept) ? '<p class="ue-basics__concept"><strong>' + esc(clip(basics.concept, 120)) + '</strong></p>' : '') +
        '<p>' + esc(clip(basics.text, 1200)) + '</p></aside>');
    }

    var way = list(note.wayForward).filter(function (row) { return isObject(row) && clip(row.text); });
    if (way.length) {
      out.push('<section class="ue-section ue-way"><h3 class="ue-q">Way forward</h3><ul class="ue-points">' + way.map(function (row) {
        return '<li>' + labelled(row.label, esc(clip(row.text, 800))) + chipsFor(row.source != null ? [row.source] : [], map) + '</li>';
      }).join('') + '</ul></section>');
    }

    out.push(misconceptionHtml(note.misconception));
    out.push(practiceHtml(note.practice, note.id));

    var items = sourceListItems(note.sources);
    if (items) out.push('<section class="ue-sourcelist"><h3 class="ue-label-head">Sources</h3><ol class="ue-sources">' + items + '</ol></section>');

    return '<article class="ue-note" data-note-id="' + esc(clip(note.id, 120)) + '" data-paper="' + esc(papers[0] || '') +
      '" data-anchor="' + esc(clip(note.anchor, 120)) + '" data-published="' + esc(clip(note.publishedAt, 30)) + '">' +
      out.filter(Boolean).join('') + '</article>';
  }

  return {
    esc: esc,
    safeUrl: safeUrl,
    hostOf: hostOf,
    isOfficial: isOfficial,
    sourceChip: sourceChip,
    renderTable: renderTable,
    isAnswerContract: isAnswerContract,
    renderBlocks: renderBlocks,
    renderMarkdown: renderMarkdown,
    renderNote: renderNote,
    readMinutes: readMinutes
  };
});
