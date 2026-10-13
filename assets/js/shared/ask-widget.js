/* Ask Summaverick, in place.
   SBAsk.init({ getContext }) wires any [data-ask] button and [data-ask-form] form on the page.
   Questions go to the Summaverick worker with the page's numbers attached; answers open in a side panel. */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://wandering-haze-b394.sumanthbolle312.workers.dev';
  var STYLE = ' (Answer in plain English in under 150 words. Use short paragraphs or a few bullets. Use the numbers given. Finish every sentence.)';
  var MAX_HISTORY = 6;

  var getContext = function () { return ''; };
  var history = [];
  var busy = false;
  var panel, list, form, input, fullLink, lastFocus;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inline(text, sources) {
    var t = esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t.replace(/\[(\d+)\]/g, function (m, n) {
      var s = sources[Number(n) - 1];
      return s && s.url
        ? '<a class="ask-cite" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + n + '</a>'
        : '';
    });
  }

  function markdown(md, sources) {
    var out = [];
    var para = [];
    var items = [];
    function flushPara() {
      if (para.length) out.push('<p>' + inline(para.join(' '), sources) + '</p>');
      para = [];
    }
    function flushList() {
      if (items.length) out.push('<ul>' + items.map(function (l) { return '<li>' + inline(l, sources) + '</li>'; }).join('') + '</ul>');
      items = [];
    }
    String(md || '').replace(/\r\n/g, '\n').split('\n').forEach(function (line) {
      var t = line.trim();
      var bullet = t.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
      var heading = t.match(/^#{1,4}\s+(.*)$/);
      if (!t) { flushPara(); flushList(); return; }
      if (heading) { flushPara(); flushList(); out.push('<p><strong>' + inline(heading[1], sources) + '</strong></p>'); return; }
      if (bullet) { flushPara(); items.push(bullet[1]); return; }
      flushList();
      para.push(t);
    });
    flushPara();
    flushList();
    return out.join('');
  }

  function build() {
    panel = document.createElement('div');
    panel.className = 'ask-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ask-panel__scrim" data-ask-close></div>' +
      '<section class="ask-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="askPanelTitle">' +
        '<header class="ask-panel__head">' +
          '<h2 id="askPanelTitle">Summaverick</h2>' +
          '<a class="ask-panel__full" href="summaverick.html" target="_blank" rel="noopener">Open full chat</a>' +
          '<button type="button" class="ask-panel__close" data-ask-close aria-label="Close">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</header>' +
        '<div class="ask-panel__list" aria-live="polite"></div>' +
        '<form class="ask-panel__form">' +
          '<input type="text" maxlength="300" placeholder="Ask a follow-up" aria-label="Follow-up question">' +
          '<button type="submit" class="ask-panel__send" aria-label="Send">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' +
          '</button>' +
        '</form>' +
      '</section>';
    document.body.appendChild(panel);
    list = panel.querySelector('.ask-panel__list');
    form = panel.querySelector('.ask-panel__form');
    input = form.querySelector('input');
    fullLink = panel.querySelector('.ask-panel__full');

    panel.querySelectorAll('[data-ask-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value.trim());
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });
  }

  function open() {
    if (!panel.hidden) return;
    lastFocus = document.activeElement;
    panel.hidden = false;
    document.documentElement.classList.add('ask-open');
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
  }

  function close() {
    panel.classList.remove('is-open');
    document.documentElement.classList.remove('ask-open');
    setTimeout(function () { panel.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function add(className, html) {
    var node = document.createElement('div');
    node.className = 'ask-msg ' + className;
    node.innerHTML = html;
    list.appendChild(node);
    list.scrollTop = list.scrollHeight;
    return node;
  }

  function ask(question, label) {
    if (!question || busy) return;
    var context = getContext() || '';
    open();
    input.value = '';
    var asked = add('ask-msg--user', esc(label || question));
    var pending = add('ask-msg--bot is-loading', '<span class="ask-dots"><i></i><i></i><i></i></span>');
    busy = true;
    form.classList.add('is-busy');
    fullLink.href = 'summaverick.html?q=' + encodeURIComponent((context + '\n\n' + question).slice(0, 1000));

    var query = (history.length ? '' : context + '\n\n') + question + STYLE;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, context: history.slice(-MAX_HISTORY) })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var result = data && data.success && data.result;
        if (!result || !result.answer) throw new Error('empty');
        var sources = result.sources || [];
        pending.classList.remove('is-loading');
        pending.innerHTML = markdown(result.answer, sources) + sourceList(sources);
        list.scrollTop = asked.offsetTop - list.offsetTop - 12;
        history.push({ role: 'user', content: history.length ? question : context + '\n\n' + question });
        history.push({ role: 'assistant', content: result.answer });
      })
      .catch(function () {
        pending.classList.remove('is-loading');
        pending.classList.add('is-error');
        pending.textContent = 'Could not get an answer. Try again.';
      })
      .then(function () {
        busy = false;
        form.classList.remove('is-busy');
      });
  }

  function sourceList(sources) {
    var linked = sources.filter(function (s) { return s && s.url; }).slice(0, 4);
    if (!linked.length) return '';
    return '<p class="ask-sources">' + linked.map(function (s, i) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' +
        (s.index || i + 1) + '. ' + esc(s.source || s.title || 'Source') + '</a>';
    }).join('') + '</p>';
  }

  function init(opts) {
    if (opts && typeof opts.getContext === 'function') getContext = opts.getContext;
    build();
    document.querySelectorAll('[data-ask]').forEach(function (btn) {
      btn.addEventListener('click', function () { ask(btn.getAttribute('data-ask'), btn.textContent.trim()); });
    });
    document.querySelectorAll('[data-ask-form]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var field = f.querySelector('input');
        ask(field.value.trim());
        field.value = '';
      });
    });
  }

  global.SBAsk = { init: init, ask: ask, _markdown: markdown };
})(window);
