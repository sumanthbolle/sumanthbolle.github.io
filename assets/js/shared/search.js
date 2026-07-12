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

  function markdownToHtml(md) {
    if (!md) return '';
    var html = md;
    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
      return '<pre>' + escHtml(code.trim()) + '</pre>';
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Citation markers [1] [2] etc
    html = html.replace(/\[(\d+)\]/g, '<a class="sb-cite" href="#" data-cite="$1">$1</a>');
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, function(m) {
      if (m.indexOf('<ul>') === -1) return '<ul>' + m + '</ul>';
      return m;
    });
    // Merge consecutive <ul> tags
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Paragraphs — split by double newline
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newlines after block elements are fine, others become <br>
    html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');
    // Wrap in paragraph if not starting with a block element
    if (!/^<(h[23]|ul|ol|pre|div|p)/.test(html.trim())) {
      html = '<p>' + html + '</p>';
    }
    return html;
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

  // ── Web Search (Best from the Web) ──

  var webSearchTimer;
  var lastWebQuery = '';

  function fetchWebResult(query, callback) {
    var endpoint = config && config.aiSearchEndpoint;
    if (!endpoint) {
      callback(buildFallbackLinks(query));
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 12000;

    xhr.onload = function() {
      try {
        var data = JSON.parse(xhr.responseText);
        if (data.success && data.result) {
          callback(data.result);
        } else {
          callback(buildFallbackLinks(query));
        }
      } catch(e) {
        callback(buildFallbackLinks(query));
      }
    };

    xhr.onerror = function() { callback(buildFallbackLinks(query)); };
    xhr.ontimeout = function() { callback(buildFallbackLinks(query)); };

    xhr.send(JSON.stringify({ query: query }));
  }

  function buildFallbackLinks(query) {
    var q = query.toLowerCase().replace(/\s+/g, ' ').trim();
    var tokens = tokenize(query);

    var sources = [
      { domain: 'docs.servicenow.com', name: 'ServiceNow Docs', prefix: 'site:docs.servicenow.com ServiceNow ', icon: '\uD83D\uDCD6', weight: 3 },
      { domain: 'developer.servicenow.com', name: 'Developer Portal', prefix: 'site:developer.servicenow.com ', icon: '\uD83D\uDCBB', weight: 2 },
      { domain: 'community.servicenow.com', name: 'Community', prefix: 'site:community.servicenow.com ServiceNow ', icon: '\uD83D\uDCAC', weight: 1 }
    ];

    var searchTerms = {
      'gliderecord': {source: 0, query: 'GlideRecord API'},
      'glideajax': {source: 0, query: 'GlideAjax'},
      'business rule': {source: 0, query: 'business rules'},
      'client script': {source: 0, query: 'client scripts'},
      'script include': {source: 0, query: 'script includes'},
      'ui policy': {source: 0, query: 'UI policy'},
      'flow designer': {source: 0, query: 'flow designer'},
      'acl': {source: 0, query: 'access control rules ACL'},
      'cmdb': {source: 0, query: 'CMDB configuration management'},
      'csdm': {source: 0, query: 'common service data model CSDM'},
      'service catalog': {source: 0, query: 'service catalog'},
      'update set': {source: 0, query: 'update sets'},
      'import set': {source: 0, query: 'import sets transform map'},
      'service portal': {source: 0, query: 'service portal widget'},
      'now assist': {source: 0, query: 'now assist AI'},
      'discovery': {source: 0, query: 'discovery ITOM'},
      'service mapping': {source: 0, query: 'service mapping'},
      'atf': {source: 0, query: 'automated test framework ATF'},
      'rest api': {source: 1, query: 'REST API'},
      'performance': {source: 2, query: 'ServiceNow performance best practices'},
      'domain separation': {source: 0, query: 'domain separation'},
      'notification': {source: 0, query: 'email notification'},
      'g_form': {source: 1, query: 'g_form API methods'},
      'glideaggregate': {source: 0, query: 'GlideAggregate'},
      'glidedatetime': {source: 0, query: 'GlideDateTime'},
      'encoded query': {source: 0, query: 'encoded query'},
    };

    var bestSource = sources[0];
    var bestQuery = 'ServiceNow ' + query;
    var reason = 'Search official documentation';

    for (var key in searchTerms) {
      if (q.indexOf(key) !== -1) {
        var match = searchTerms[key];
        bestSource = sources[match.source];
        bestQuery = match.query;
        reason = 'Matched: ' + key;
        break;
      }
    }

    var results = sources.map(function(src) {
      return {
        title: src.name + ': ' + query,
        snippet: 'Search ' + src.name + ' for detailed documentation and examples',
        url: 'https://www.google.com/search?q=' + encodeURIComponent(src.prefix + bestQuery),
        source: src.domain,
        icon: src.icon,
        reason: reason
      };
    });

    return { type: 'multi', results: results, query: query };
  }

  function fetchJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 5000;
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(JSON.parse(xhr.responseText)); } catch(e) { cb(null); }
      } else { cb(null); }
    };
    xhr.onerror = function() { cb(null); };
    xhr.ontimeout = function() { cb(null); };
    xhr.send();
  }

  function parseDDGResponse(data, query) {
    if (data.AbstractURL && data.Abstract) {
      return {
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL,
        source: extractDomain(data.AbstractURL),
        reason: data.AbstractSource ? 'From ' + data.AbstractSource + ' — comprehensive reference' : 'Top reference match'
      };
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      for (var i = 0; i < data.RelatedTopics.length; i++) {
        var topic = data.RelatedTopics[i];
        if (topic.FirstURL && topic.Text) {
          return {
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: extractDomain(topic.FirstURL),
            reason: 'Most relevant related topic'
          };
        }
        if (topic.Topics) {
          for (var j = 0; j < topic.Topics.length; j++) {
            if (topic.Topics[j].FirstURL) {
              return {
                title: topic.Topics[j].Text.split(' - ')[0] || topic.Topics[j].Text.substring(0, 80),
                snippet: topic.Topics[j].Text,
                url: topic.Topics[j].FirstURL,
                source: extractDomain(topic.Topics[j].FirstURL),
                reason: 'Related ' + (topic.Name || 'topic')
              };
            }
          }
        }
      }
    }
    if (data.Results && data.Results.length > 0 && data.Results[0].FirstURL) {
      return {
        title: data.Results[0].Text || query,
        snippet: data.Results[0].Text,
        url: data.Results[0].FirstURL,
        source: extractDomain(data.Results[0].FirstURL),
        reason: 'Direct answer'
      };
    }
    return null;
  }

  function pickBestGoogleResult(items, query) {
    var dominated = ['docs.servicenow.com', 'developer.servicenow.com', 'servicenow.com'];
    var best = items[0];
    for (var i = 0; i < items.length; i++) {
      var domain = extractDomain(items[i].link);
      for (var d = 0; d < dominated.length; d++) {
        if (domain.indexOf(dominated[d]) !== -1) { best = items[i]; break; }
      }
    }
    return {
      title: best.title,
      snippet: best.snippet,
      url: best.link,
      source: extractDomain(best.link),
      reason: best.link.indexOf('docs.servicenow.com') !== -1
        ? 'Official ServiceNow documentation'
        : best.link.indexOf('community.servicenow.com') !== -1
        ? 'ServiceNow community discussion'
        : 'Highest relevance match'
    };
  }

  function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch(e) { return url; }
  }

  function renderWebResult(result, query) {
    var webEl = resultsEl.querySelector('.sb-web-section');
    if (!webEl) return;
    clearWebProgress();

    var arrow = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    if (!result) {
      webEl.innerHTML =
        '<div class="sb-web-label"><span class="sb-web-label-icon">&#10024;</span> AI Research</div>' +
        '<div class="sb-web-noresult">No external results found for this query</div>';
      return;
    }

    if (result.type === 'multi') {
      var fhtml = '<div class="sb-web-label"><span class="sb-web-label-icon">&#127760;</span> Search the Web</div>';
      result.results.forEach(function(r) {
        fhtml += '<a class="sb-web-result" href="' + escHtml(r.url) + '" target="_blank" rel="noopener">' +
          '<div class="sb-web-result-icon-sm">' + r.icon + '</div>' +
          '<div class="sb-web-result-body">' +
            '<div class="sb-web-result-title">' + escHtml(r.source) + '</div>' +
            '<div class="sb-web-result-snippet">Search for &ldquo;' + escHtml(result.query) + '&rdquo;</div>' +
          '</div>' +
          '<div class="sb-web-arrow">' + arrow + '</div></a>';
      });
      webEl.innerHTML = fhtml;
      return;
    }

    if (result.type === 'rich') {
      var html = '<div class="sb-web-label"><span class="sb-web-label-icon">&#10024;</span> AI Research</div>';

      if (result.answer) {
        var formatted = markdownToHtml(result.answer);
        html += '<div class="sb-ai-answer">' + formatted + '</div>';
      }

      if (result.sources && result.sources.length > 0) {
        html += '<div class="sb-sources-label">Sources</div>';
        result.sources.forEach(function(s) {
          html += '<a class="sb-source-card" href="' + escHtml(s.url) + '" target="_blank" rel="noopener">' +
            '<div class="sb-source-num">' + s.index + '</div>' +
            '<div class="sb-source-body">' +
              '<div class="sb-source-title">' + escHtml(s.title || s.source) + '</div>' +
              '<div class="sb-source-domain">' + escHtml(s.source) + ' ' + arrow + '</div>' +
            '</div>' +
          '</a>';
        });
      }

      if (result.relatedQuestions && result.relatedQuestions.length > 0) {
        html += '<div class="sb-sources-label" style="margin-top:12px">Related</div>';
        result.relatedQuestions.forEach(function(rq) {
          html += '<div class="sb-related-q" onclick="document.querySelector(\'.sb-search-input\').value=\'' + escHtml(rq).replace(/'/g, "\\'") + '\';document.querySelector(\'.sb-search-input\').dispatchEvent(new Event(\'input\'));">' + escHtml(rq) + '</div>';
        });
      }

      webEl.innerHTML = html;

      webEl.querySelectorAll('.sb-cite').forEach(function(cite) {
        cite.addEventListener('click', function(e) {
          e.preventDefault();
          var idx = parseInt(cite.dataset.cite) - 1;
          if (result.sources[idx]) window.open(result.sources[idx].url, '_blank');
        });
      });
      return;
    }

    webEl.innerHTML =
      '<div class="sb-web-label"><span class="sb-web-label-icon">&#10024;</span> AI Research</div>' +
      '<a class="sb-web-result sb-web-result-ai" href="' + escHtml(result.url) + '" target="_blank" rel="noopener">' +
        '<div class="sb-web-result-body">' +
          '<div class="sb-web-result-title">' + highlightMatch(escHtml(result.title), query) + '</div>' +
          '<div class="sb-web-result-snippet">' + escHtml(result.snippet) + '</div>' +
          '<div class="sb-web-result-meta">' +
            '<span class="sb-web-source">&#128279; ' + escHtml(result.source) + '</span>' +
          '</div>' +
          '<div class="sb-web-reason-block">' + escHtml(result.reason) + '</div>' +
        '</div>' +
        '<div class="sb-web-arrow">' + arrow + '</div>' +
      '</a>';
  }

  var webProgressSteps = [
    {text: 'Researching across ServiceNow sources...', icon: '&#128269;', delay: 0},
    {text: 'Analyzing docs.servicenow.com...', icon: '&#128196;', delay: 900},
    {text: 'Checking developer portal & community...', icon: '&#128172;', delay: 1800},
    {text: 'Selecting the single best resource...', icon: '&#9889;', delay: 2700}
  ];
  var webProgressTimer = null;

  function renderWebLoading() {
    var webEl = resultsEl.querySelector('.sb-web-section');
    if (!webEl) return;
    clearWebProgress();
    webEl.innerHTML =
      '<div class="sb-web-label"><span class="sb-web-label-icon">&#10024;</span> AI Research</div>' +
      '<div class="sb-web-progress">' +
        '<div class="sb-web-step active"><span class="sb-web-step-dot"></span><span class="sb-web-step-text">' + webProgressSteps[0].text + '</span></div>' +
      '</div>';

    var stepIdx = 1;
    webProgressTimer = setInterval(function() {
      if (stepIdx >= webProgressSteps.length) { clearInterval(webProgressTimer); return; }
      var prog = webEl.querySelector('.sb-web-progress');
      if (!prog) { clearInterval(webProgressTimer); return; }
      var steps = prog.querySelectorAll('.sb-web-step');
      steps.forEach(function(s) { s.classList.remove('active'); s.classList.add('done'); });
      var step = webProgressSteps[stepIdx];
      prog.innerHTML += '<div class="sb-web-step active"><span class="sb-web-step-dot"></span><span class="sb-web-step-text">' + step.text + '</span></div>';
      stepIdx++;
    }, 700);
  }

  function clearWebProgress() {
    if (webProgressTimer) { clearInterval(webProgressTimer); webProgressTimer = null; }
  }

  function renderWebComplete() {
    clearWebProgress();
    var webEl = resultsEl.querySelector('.sb-web-section');
    if (!webEl) return;
    var prog = webEl.querySelector('.sb-web-progress');
    if (prog) {
      prog.querySelectorAll('.sb-web-step').forEach(function(s) { s.classList.remove('active'); s.classList.add('done'); });
      prog.innerHTML += '<div class="sb-web-step done"><span class="sb-web-step-dot"></span><span class="sb-web-step-text">Found best match &#10003;</span></div>';
    }
  }

  var CSS = '\n\
.sb-search-btn{background:none;border:1px solid rgba(128,128,128,0.25);border-radius:10px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;color:inherit;font-family:inherit;font-size:13px;transition:all 0.2s;opacity:0.7}\n\
.sb-search-btn:hover{opacity:1;border-color:rgba(128,128,128,0.5)}\n\
.sb-search-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}\n\
.sb-search-btn kbd{font-family:inherit;font-size:11px;padding:2px 6px;border-radius:5px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.15);line-height:1;opacity:0.7}\n\
.sb-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:100000;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s}\n\
.sb-search-overlay.open{opacity:1;visibility:visible}\n\
.sb-search-modal{position:fixed;top:min(10vh,80px);left:50%;transform:translateX(-50%) scale(0.98);width:min(1060px,95vw);max-height:min(600px,80vh);background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,0.25),0 0 0 1px rgba(0,0,0,0.08);z-index:100001;display:flex;flex-direction:column;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s,transform 0.2s}\n\
.sb-search-modal.open{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}\n\
.sb-search-input-wrap{display:flex;align-items:center;padding:0 20px;border-bottom:1px solid rgba(0,0,0,0.08)}\n\
.sb-search-input-wrap svg{width:18px;height:18px;stroke:#86868b;fill:none;stroke-width:2;flex-shrink:0}\n\
.sb-search-input{flex:1;border:none;outline:none;font-size:17px;padding:16px 14px;background:none;font-family:inherit;color:#1d1d1f}\n\
.sb-search-input::placeholder{color:#86868b}\n\
.sb-search-esc{font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.06);border:none;color:#86868b;cursor:pointer;font-family:inherit;flex-shrink:0}\n\
.sb-search-results{overflow-y:auto;flex:1;padding:0;display:flex}\n\
.sb-search-results::-webkit-scrollbar{width:6px}\n\
.sb-search-results::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12);border-radius:3px}\n\
.sb-local-section{flex:1;overflow-y:auto;padding:8px;min-width:0}\n\
.sb-local-section::-webkit-scrollbar{width:5px}\n\
.sb-local-section::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.1);border-radius:3px}\n\
.sb-search-empty{padding:40px 20px;text-align:center;color:#86868b;font-size:14px}\n\
.sb-search-hint{padding:32px 20px;text-align:center;color:#86868b;font-size:13px;line-height:1.8}\n\
.sb-section-label{font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;padding:8px 16px 4px;display:flex;align-items:center;gap:6px}\n\
.sb-web-result-ai{border:1px solid rgba(168,85,247,0.15);background:rgba(168,85,247,0.03)}\n\
.sb-web-result-ai:hover{background:rgba(168,85,247,0.07);border-color:rgba(168,85,247,0.25)}\n\
.sb-web-result-ai .sb-web-result-title mark{background:rgba(168,85,247,0.15);color:#7c3aed}\n\
.sb-web-reason-block{font-size:12px;color:#7c3aed;margin-top:6px;padding:6px 10px;background:rgba(168,85,247,0.06);border-radius:6px;line-height:1.5;font-style:italic}\n\
.sb-ai-answer{font-size:13.5px;line-height:1.75;color:#333;padding:8px 4px 12px;margin-bottom:8px}\n\
.sb-ai-answer p{margin-bottom:10px}\n\
.sb-ai-answer h2,.sb-ai-answer h3{font-size:13px;font-weight:700;color:#1d1d1f;margin:14px 0 6px;letter-spacing:-0.2px}\n\
.sb-ai-answer strong{font-weight:600;color:#1d1d1f}\n\
.sb-ai-answer ul,.sb-ai-answer ol{margin:6px 0 10px 16px;font-size:13px}\n\
.sb-ai-answer li{margin-bottom:4px;line-height:1.6}\n\
.sb-ai-answer code{font-size:12px;background:rgba(0,0,0,0.05);padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace}\n\
.sb-ai-answer pre{font-size:11.5px;background:rgba(0,0,0,0.04);padding:10px 12px;border-radius:8px;overflow-x:auto;margin:8px 0;line-height:1.5;font-family:ui-monospace,monospace}\n\
.sb-cite{color:#7c3aed;font-size:10px;font-weight:700;text-decoration:none;cursor:pointer;vertical-align:super;padding:0 1px;background:rgba(168,85,247,0.08);border-radius:3px;margin:0 1px}\n\
.sb-cite:hover{background:rgba(168,85,247,0.18)}\n\
.sb-sources-label{font-size:10px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;padding:6px 4px 6px}\n\
.sb-source-card{display:flex;align-items:center;gap:8px;padding:8px 6px;border-radius:8px;cursor:pointer;transition:background 0.15s;text-decoration:none;color:inherit}\n\
.sb-source-card:hover{background:rgba(168,85,247,0.06)}\n\
.sb-source-num{width:22px;height:22px;border-radius:6px;background:rgba(168,85,247,0.1);color:#7c3aed;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}\n\
.sb-source-body{flex:1;min-width:0}\n\
.sb-source-title{font-size:12.5px;font-weight:500;color:#1d1d1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n\
.sb-source-domain{font-size:10.5px;color:#86868b;display:flex;align-items:center;gap:4px;margin-top:1px}\n\
.sb-source-domain svg{opacity:0.5}\n\
.sb-related-q{font-size:12.5px;color:#7c3aed;padding:7px 6px;cursor:pointer;border-radius:6px;transition:background 0.15s;line-height:1.4}\n\
.sb-related-q:hover{background:rgba(168,85,247,0.06)}\n\
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
.sb-web-section{border-left:1px solid rgba(0,0,0,0.06);width:420px;flex-shrink:0;overflow-y:auto;padding:12px 14px}\n\
.sb-web-section::-webkit-scrollbar{width:5px}\n\
.sb-web-section::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.1);border-radius:3px}\n\
.sb-web-label{font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;padding:8px 16px 6px;display:flex;align-items:center;gap:6px}\n\
.sb-web-label-icon{font-size:14px}\n\
.sb-web-trigger{display:flex;align-items:center;gap:8px;padding:10px 16px;margin:0 8px 4px;border-radius:10px;border:1px dashed rgba(168,85,247,0.3);background:rgba(168,85,247,0.04);cursor:pointer;transition:all 0.2s;color:#6e6e73;font-size:13px;font-family:inherit}\n\
.sb-web-trigger:hover{border-color:rgba(168,85,247,0.5);background:rgba(168,85,247,0.08);color:#1d1d1f}\n\
.sb-web-trigger svg{width:16px;height:16px;stroke:#7c3aed;fill:none;stroke-width:2}\n\
.sb-web-trigger-label{flex:1}\n\
.sb-web-trigger kbd{font-family:inherit;font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(0,0,0,0.05);border:1px solid rgba(0,0,0,0.08);color:#86868b}\n\
.sb-web-progress{padding:4px 16px 8px}\n\
.sb-web-step{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:#86868b;opacity:0;animation:sbStepIn 0.3s ease forwards}\n\
.sb-web-step.done{color:#16a34a}\n\
.sb-web-step.active .sb-web-step-dot{animation:sbPulse 1s ease-in-out infinite}\n\
.sb-web-step-dot{width:6px;height:6px;border-radius:50%;background:#16a34a;flex-shrink:0}\n\
.sb-web-step.done .sb-web-step-dot{background:#16a34a}\n\
.sb-web-step.active .sb-web-step-dot{background:#f59e0b}\n\
.sb-web-noresult{padding:8px 16px 12px;font-size:12px;color:#86868b;font-style:italic}\n\
@keyframes sbStepIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}\n\
@keyframes sbPulse{0%,100%{opacity:1}50%{opacity:0.4}}\n\
.sb-web-result{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:12px;cursor:pointer;transition:background 0.15s;text-decoration:none;color:inherit}\n\
.sb-web-result:hover{background:rgba(52,199,89,0.06)}\n\
.sb-web-result-body{flex:1;min-width:0}\n\
.sb-web-result-title{font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n\
.sb-web-result-title mark{background:rgba(52,199,89,0.15);color:#16a34a;border-radius:2px;padding:0 1px}\n\
.sb-web-result-snippet{font-size:13px;color:#6e6e73;margin-top:4px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n\
.sb-web-result-meta{display:flex;gap:12px;margin-top:6px;font-size:11px;flex-wrap:wrap}\n\
.sb-web-source{color:#16a34a;font-weight:600}\n\
.sb-web-reason{color:#86868b;font-style:italic}\n\
.sb-web-arrow{color:#86868b;flex-shrink:0;margin-top:4px}\n\
.sb-web-result-icon-sm{font-size:20px;width:32px;text-align:center;flex-shrink:0;margin-top:2px}\n\
.sb-web-loading{padding:12px 16px}\n\
.sb-web-loading-bar{height:12px;background:rgba(0,0,0,0.05);border-radius:6px;margin-bottom:8px;animation:sbShimmer 1.2s ease-in-out infinite}\n\
.sb-web-loading-bar.short{width:60%}\n\
@keyframes sbShimmer{0%,100%{opacity:0.4}50%{opacity:0.8}}\n\
@media(prefers-color-scheme:dark){\n\
  .sb-web-section{border-left-color:rgba(255,255,255,0.06)}\n\
  .sb-web-result:hover{background:rgba(52,199,89,0.08)}\n\
  .sb-web-result-title{color:#f5f5f7}\n\
  .sb-web-result-snippet{color:#98989d}\n\
  .sb-web-trigger{border-color:rgba(168,85,247,0.2);background:rgba(168,85,247,0.05);color:#98989d}\n\
  .sb-web-trigger:hover{color:#f5f5f7;border-color:rgba(168,85,247,0.4);background:rgba(168,85,247,0.1)}\n\
  .sb-web-trigger kbd{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.1);color:#6e6e73}\n\
  .sb-web-result-ai{border-color:rgba(168,85,247,0.2);background:rgba(168,85,247,0.05)}\n\
  .sb-web-result-ai:hover{background:rgba(168,85,247,0.1);border-color:rgba(168,85,247,0.3)}\n\
  .sb-web-reason-block{background:rgba(168,85,247,0.1);color:#c084fc}\n\
  .sb-ai-answer{color:#d1d5db}\n\
  .sb-ai-answer h2,.sb-ai-answer h3,.sb-ai-answer strong{color:#f5f5f7}\n\
  .sb-ai-answer code{background:rgba(255,255,255,0.08)}\n\
  .sb-ai-answer pre{background:rgba(255,255,255,0.06)}\n\
  .sb-source-title{color:#f5f5f7}\n\
  .sb-source-num{background:rgba(168,85,247,0.15)}\n\
  .sb-source-card:hover{background:rgba(168,85,247,0.1)}\n\
  .sb-related-q:hover{background:rgba(168,85,247,0.1)}\n\
}\n\
@media(max-width:768px){\n\
  .sb-search-btn kbd{display:none}\n\
  .sb-search-modal{top:8px;width:96vw;max-height:calc(100vh - 16px);border-radius:14px}\n\
  .sb-search-results{flex-direction:column}\n\
  .sb-local-section{max-height:50vh}\n\
  .sb-web-section{width:100%;border-left:none;border-top:1px solid rgba(0,0,0,0.06);max-height:40vh}\n\
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
    if (!navC) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { createDOM(); });
      }
      return;
    }
    if (document.querySelector('.sb-search-btn')) return;

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
        '<div class="sb-search-hint">Search across articles + the best from the web</div>' +
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
    if (!overlayEl || !modalEl) { createDOM(); if (!overlayEl) return; }
    overlayEl.classList.add('open');
    modalEl.classList.add('open');
    inputEl.value = '';
    resultsEl.innerHTML = '<div class="sb-local-section"><div class="sb-search-hint">Type to search articles<br><span style="font-size:11px;opacity:0.7">&#10024; AI Research appears on the right</span></div></div><div class="sb-web-section"><div class="sb-search-hint" style="padding:24px 12px;font-size:12px">&#10024; AI Research<br>Results will appear here when you search</div></div>';
    activeIdx = -1;
    resultItems = [];
    webSearchInFlight = false;
    clearWebProgress();
    clearTimeout(webSearchTimer);
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
        ? '<div class="sb-local-section"><div class="sb-search-hint">Type to search articles</div></div><div class="sb-web-section"><div class="sb-search-hint" style="padding:24px 12px;font-size:12px">&#10024; AI Research</div></div>'
        : '<div class="sb-local-section"><div class="sb-search-hint">Type at least 2 characters</div></div><div class="sb-web-section"></div>';
      resultItems = [];
      activeIdx = -1;
      return;
    }

    if (!searchIndexCache) {
      searchIndexCache = buildIndex(config.items, config.fields);
    }

    var results = search(q, searchIndexCache, 15);

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="sb-local-section"><div class="sb-search-empty">No results for &ldquo;' + escHtml(q) + '&rdquo;</div></div>';
      resultItems = [];
      activeIdx = -1;
      if (config.enableWebSearch !== false) {
        resultsEl.innerHTML += '<div class="sb-web-section"></div>';
        triggerWebSearch(q);
      }
      return;
    }

    var html = '<div class="sb-local-section"><div class="sb-section-label">From My Articles</div>';
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

    html += '</div>';
    if (config.enableWebSearch !== false) {
      html += '<div class="sb-web-section"></div>';
    }
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

    if (config.enableWebSearch !== false) {
      var currentQuery = q;
      clearTimeout(webSearchTimer);
      webSearchTimer = setTimeout(function() {
        if (inputEl.value.trim() !== currentQuery) return;
        triggerWebSearch(currentQuery);
      }, 300);
    }
  }

  var webSearchInFlight = false;

  function triggerWebSearch(query) {
    if (webSearchInFlight) return;
    webSearchInFlight = true;
    var triggerBtn = document.getElementById('sbWebTrigger');
    if (triggerBtn) triggerBtn.style.display = 'none';
    renderWebLoading();
    fetchWebResult(query, function(result) {
      webSearchInFlight = false;
      if (inputEl.value.trim() !== query) return;
      renderWebResult(result, query);
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
    } else if (e.altKey && e.key === 'w') {
      e.preventDefault();
      var q = inputEl.value.trim();
      if (q.length >= 2) triggerWebSearch(q);
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
      if (!opts || !opts.items || !opts.items.length) return;
      config = opts;
      searchIndexCache = null;
      injectCSS();

      var doInit = function() {
        createDOM();
        if (!document.querySelector('.sb-search-btn')) {
          setTimeout(function() { createDOM(); }, 500);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInit);
      } else {
        doInit();
      }

      document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          if (!overlayEl) createDOM();
          if (overlayEl) openSearch();
        }
      });
    },
    refresh: function(items) {
      if (config) config.items = items;
      searchIndexCache = null;
    },
    /** Open the search modal. Optional query prefills and runs local search. */
    open: function(query) {
      if (!config) return;
      if (!overlayEl) createDOM();
      if (!overlayEl) return;
      openSearch();
      if (typeof query === 'string' && query.trim()) {
        inputEl.value = query.trim();
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };
})();
