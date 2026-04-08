/*
 * SBSearch — tokenized search with TF-IDF ranking, fuzzy matching, and Apple-style UI
 * Usage:
 *   SBSearch.init({ items: [...], fields: [...], onSelect: fn, placeholder: '...' })
 *   Items are indexed on init. Search icon is injected into .nav-c.
 *   Cmd/Ctrl+K opens the search modal.
 */
(function() {
  'use strict';

  // ── Search Engine ──

  function tokenize(text) {
    if (!text) return [];
    return text.replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/[^a-zA-Z0-9_.\-]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(function(t) { return t.length > 1; });
  }

  function buildIndex(items, fields) {
    var index = [];
    var docCount = items.length;
    var df = {};

    items.forEach(function(item, docIdx) {
      var termFreqs = {};
      var totalTerms = 0;

      fields.forEach(function(f) {
        var weight = f.weight || 1;
        var tokens = tokenize(item[f.name]);
        tokens.forEach(function(token) {
          termFreqs[token] = (termFreqs[token] || 0) + weight;
          totalTerms += weight;
        });
      });

      var uniqueTerms = Object.keys(termFreqs);
      uniqueTerms.forEach(function(t) {
        df[t] = (df[t] || 0) + 1;
      });

      index.push({
        item: item,
        termFreqs: termFreqs,
        totalTerms: totalTerms,
        tokens: uniqueTerms
      });
    });

    return { index: index, df: df, docCount: docCount };
  }

  function search(query, searchIndex, maxResults) {
    maxResults = maxResults || 12;
    var queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    var scores = [];

    searchIndex.index.forEach(function(doc, idx) {
      var score = 0;
      var matchedTokens = 0;

      queryTokens.forEach(function(qt) {
        var bestMatch = 0;

        doc.tokens.forEach(function(dt) {
          var sim = 0;
          if (dt === qt) {
            sim = 1.0;
          } else if (dt.indexOf(qt) === 0) {
            sim = 0.85;
          } else if (dt.indexOf(qt) !== -1) {
            sim = 0.6;
          } else if (qt.length >= 3 && editDistance(qt, dt) <= 1) {
            sim = 0.5;
          }

          if (sim > 0) {
            var tf = doc.termFreqs[dt] / doc.totalTerms;
            var idf = Math.log(searchIndex.docCount / (searchIndex.df[dt] || 1));
            var tfidf = tf * idf * sim;
            if (tfidf > bestMatch) bestMatch = tfidf;
          }
        });

        if (bestMatch > 0) matchedTokens++;
        score += bestMatch;
      });

      if (matchedTokens > 0) {
        var coverage = matchedTokens / queryTokens.length;
        score *= (0.5 + 0.5 * coverage);
        scores.push({ item: doc.item, score: score, coverage: coverage });
      }
    });

    scores.sort(function(a, b) { return b.score - a.score; });
    return scores.slice(0, maxResults);
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    var matrix = [];
    for (var i = 0; i <= a.length; i++) {
      matrix[i] = [i];
      for (var j = 1; j <= b.length; j++) {
        if (i === 0) { matrix[i][j] = j; continue; }
        var cost = a[i-1] === b[j-1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i-1][j] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j-1] + cost
        );
        if (matrix[i][j] > 2) return 2;
      }
    }
    return matrix[a.length][b.length];
  }

  function highlightMatch(text, query) {
    if (!text || !query) return text || '';
    var tokens = tokenize(query);
    var result = text;
    tokens.forEach(function(qt) {
      var re = new RegExp('(' + qt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      result = result.replace(re, '<mark>$1</mark>');
    });
    return result;
  }

  // ── Apple-Style UI ──

  var CSS = '\n\
.sb-search-btn{background:none;border:1px solid rgba(128,128,128,0.25);border-radius:10px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;color:inherit;font-family:inherit;font-size:13px;transition:all 0.2s;opacity:0.7}\n\
.sb-search-btn:hover{opacity:1;border-color:rgba(128,128,128,0.5)}\n\
.sb-search-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}\n\
.sb-search-btn kbd{font-family:inherit;font-size:11px;padding:2px 6px;border-radius:5px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.15);line-height:1;opacity:0.7}\n\
.sb-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:100000;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s}\n\
.sb-search-overlay.open{opacity:1;visibility:visible}\n\
.sb-search-modal{position:fixed;top:min(20vh,140px);left:50%;transform:translateX(-50%) scale(0.98);width:min(640px,92vw);max-height:min(520px,70vh);background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,0.25),0 0 0 1px rgba(0,0,0,0.08);z-index:100001;display:flex;flex-direction:column;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s,transform 0.2s}\n\
.sb-search-modal.open{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}\n\
.sb-search-input-wrap{display:flex;align-items:center;padding:0 20px;border-bottom:1px solid rgba(0,0,0,0.08)}\n\
.sb-search-input-wrap svg{width:18px;height:18px;stroke:#86868b;fill:none;stroke-width:2;flex-shrink:0}\n\
.sb-search-input{flex:1;border:none;outline:none;font-size:17px;padding:16px 14px;background:none;font-family:inherit;color:#1d1d1f}\n\
.sb-search-input::placeholder{color:#86868b}\n\
.sb-search-esc{font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.06);border:none;color:#86868b;cursor:pointer;font-family:inherit;flex-shrink:0}\n\
.sb-search-results{overflow-y:auto;flex:1;padding:8px}\n\
.sb-search-results::-webkit-scrollbar{width:6px}\n\
.sb-search-results::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12);border-radius:3px}\n\
.sb-search-empty{padding:40px 20px;text-align:center;color:#86868b;font-size:14px}\n\
.sb-search-hint{padding:32px 20px;text-align:center;color:#86868b;font-size:13px;line-height:1.8}\n\
.sb-search-result{display:flex;align-items:flex-start;gap:14px;padding:12px 16px;border-radius:12px;cursor:pointer;transition:background 0.15s}\n\
.sb-search-result:hover,.sb-search-result.active{background:rgba(0,102,204,0.06)}\n\
.sb-search-result-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;margin-top:2px}\n\
.sb-search-result-body{flex:1;min-width:0}\n\
.sb-search-result-title{font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n\
.sb-search-result-title mark{background:rgba(0,102,204,0.15);color:#0066CC;border-radius:2px;padding:0 1px}\n\
.sb-search-result-meta{font-size:12px;color:#86868b;margin-top:3px;display:flex;gap:10px;flex-wrap:wrap}\n\
.sb-search-result-excerpt{font-size:13px;color:#6e6e73;margin-top:4px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n\
.sb-search-result-excerpt mark{background:rgba(0,102,204,0.12);color:#0055aa;border-radius:2px;padding:0 1px}\n\
.sb-search-footer{padding:10px 16px;border-top:1px solid rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#86868b}\n\
.sb-search-footer kbd{font-family:inherit;font-size:11px;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.08);margin:0 2px}\n\
@media(prefers-color-scheme:dark){\n\
  .sb-search-modal{background:#1c1c1e;box-shadow:0 24px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.1)}\n\
  .sb-search-input{color:#f5f5f7}\n\
  .sb-search-result-title{color:#f5f5f7}\n\
  .sb-search-result-excerpt{color:#98989d}\n\
  .sb-search-result:hover,.sb-search-result.active{background:rgba(255,255,255,0.06)}\n\
  .sb-search-esc{background:rgba(255,255,255,0.1);color:#98989d}\n\
  .sb-search-input-wrap{border-bottom-color:rgba(255,255,255,0.08)}\n\
  .sb-search-footer{border-top-color:rgba(255,255,255,0.06)}\n\
}\n\
@media(max-width:768px){\n\
  .sb-search-btn kbd{display:none}\n\
  .sb-search-modal{top:12px;max-height:calc(100vh - 24px);border-radius:14px}\n\
  .sb-search-footer{display:none}\n\
}\n\
';

  var searchIcon = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

  var overlayEl, modalEl, inputEl, resultsEl;
  var activeIdx = -1;
  var resultItems = [];
  var searchIndexCache = null;
  var config = null;

  function injectCSS() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function createDOM() {
    var navC = document.querySelector('.nav-c');
    if (!navC) return;

    var btn = document.createElement('button');
    btn.className = 'sb-search-btn';
    btn.setAttribute('aria-label', 'Search');
    btn.innerHTML = searchIcon + '<span>Search</span><kbd>\u2318K</kbd>';
    btn.addEventListener('click', openSearch);

    var toggle = navC.querySelector('.menu-toggle');
    if (toggle) navC.insertBefore(btn, toggle);
    else navC.appendChild(btn);

    overlayEl = document.createElement('div');
    overlayEl.className = 'sb-search-overlay';
    overlayEl.addEventListener('click', closeSearch);

    modalEl = document.createElement('div');
    modalEl.className = 'sb-search-modal';
    modalEl.innerHTML =
      '<div class="sb-search-input-wrap">' + searchIcon +
        '<input class="sb-search-input" type="text" placeholder="' + (config.placeholder || 'Search...') + '" autocomplete="off" spellcheck="false">' +
        '<button class="sb-search-esc">ESC</button>' +
      '</div>' +
      '<div class="sb-search-results">' +
        '<div class="sb-search-hint">Start typing to search across all content</div>' +
      '</div>' +
      '<div class="sb-search-footer">' +
        '<span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>' +
        '<span><kbd>&#9166;</kbd> open</span>' +
        '<span><kbd>esc</kbd> close</span>' +
      '</div>';

    modalEl.addEventListener('click', function(e) { e.stopPropagation(); });

    document.body.appendChild(overlayEl);
    document.body.appendChild(modalEl);

    inputEl = modalEl.querySelector('.sb-search-input');
    resultsEl = modalEl.querySelector('.sb-search-results');

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeydown);
    modalEl.querySelector('.sb-search-esc').addEventListener('click', closeSearch);
  }

  function openSearch() {
    overlayEl.classList.add('open');
    modalEl.classList.add('open');
    inputEl.value = '';
    resultsEl.innerHTML = '<div class="sb-search-hint">Start typing to search across all content</div>';
    activeIdx = -1;
    resultItems = [];
    setTimeout(function() { inputEl.focus(); }, 50);
    document.body.style.overflow = 'hidden';
  }

  function closeSearch() {
    overlayEl.classList.remove('open');
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  var debounceTimer;
  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 120);
  }

  function doSearch() {
    var q = inputEl.value.trim();
    if (q.length < 2) {
      resultsEl.innerHTML = q.length === 0
        ? '<div class="sb-search-hint">Start typing to search across all content</div>'
        : '<div class="sb-search-hint">Type at least 2 characters</div>';
      resultItems = [];
      activeIdx = -1;
      return;
    }

    if (!searchIndexCache) {
      searchIndexCache = buildIndex(config.items, config.fields);
    }

    var results = search(q, searchIndexCache, 15);

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="sb-search-empty">No results for &ldquo;' + escHtml(q) + '&rdquo;</div>';
      resultItems = [];
      activeIdx = -1;
      return;
    }

    var html = '';
    results.forEach(function(r, i) {
      var item = r.item;
      var title = config.renderTitle ? config.renderTitle(item) : (item.title || item.question || '');
      var excerpt = config.renderExcerpt ? config.renderExcerpt(item) : (item.excerpt || '');
      var meta = config.renderMeta ? config.renderMeta(item) : '';
      var color = config.getColor ? config.getColor(item) : '#0066CC';
      var icon = config.getIcon ? config.getIcon(item) : (title.charAt(0) || '?').toUpperCase();

      html += '<div class="sb-search-result" data-idx="' + i + '">' +
        '<div class="sb-search-result-icon" style="background:' + color + '">' + icon + '</div>' +
        '<div class="sb-search-result-body">' +
          '<div class="sb-search-result-title">' + highlightMatch(escHtml(title), q) + '</div>' +
          (meta ? '<div class="sb-search-result-meta">' + meta + '</div>' : '') +
          (excerpt ? '<div class="sb-search-result-excerpt">' + highlightMatch(escHtml(excerpt), q) + '</div>' : '') +
        '</div></div>';
    });

    resultsEl.innerHTML = html;
    resultItems = results;
    activeIdx = -1;

    resultsEl.querySelectorAll('.sb-search-result').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.dataset.idx);
        selectResult(idx);
      });
      el.addEventListener('mouseenter', function() {
        setActive(parseInt(el.dataset.idx));
      });
    });
  }

  function onKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIdx < resultItems.length - 1 ? activeIdx + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIdx > 0 ? activeIdx - 1 : resultItems.length - 1);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      selectResult(activeIdx);
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  }

  function setActive(idx) {
    resultsEl.querySelectorAll('.sb-search-result').forEach(function(el, i) {
      el.classList.toggle('active', i === idx);
      if (i === idx) el.scrollIntoView({ block: 'nearest' });
    });
    activeIdx = idx;
  }

  function selectResult(idx) {
    if (idx < 0 || idx >= resultItems.length) return;
    closeSearch();
    if (config.onSelect) config.onSelect(resultItems[idx].item);
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Public API ──

  window.SBSearch = {
    init: function(opts) {
      config = opts;
      searchIndexCache = null;
      injectCSS();
      createDOM();

      document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          openSearch();
        }
      });
    },
    refresh: function(items) {
      if (config) config.items = items;
      searchIndexCache = null;
    }
  };
})();
