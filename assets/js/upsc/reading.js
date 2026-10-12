/* Short source-linked articles, with verified news updates and evergreen reads. */
(function () {
  'use strict';
  var Render = window.AnchorRender;

  function canonicalJson(value) {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
      .map(function (key) { return JSON.stringify(key) + ':' + canonicalJson(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }

  function sourceUrl(value) {
    try {
      var url = new URL(String(value || '').trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function readMinutes(article) {
    var text = [article.title, article.excerpt, article.takeaway, article.question];
    (article.sections || []).forEach(function (section) {
      text.push(section.heading);
      text = text.concat(section.paragraphs || []);
    });
    if (article.example) text.push(article.example.heading, article.example.text);
    if (article.comparison) {
      text.push(article.comparison.heading);
      (article.comparison.rows || []).forEach(function (row) { text = text.concat(row); });
    }
    text.push(article.recallAnswer || '');
    return Math.max(1, Math.ceil(text.join(' ').trim().split(/\s+/).length / 180));
  }

  function filterArticles(articles, query) {
    var term = String(query || '').trim().toLowerCase();
    return articles.filter(function (article) {
      return !term || [article.title, article.excerpt, article.subject, article.anchor,
        article.takeaway, (article.codes || []).join(' ')].join(' ').toLowerCase().indexOf(term) !== -1;
    });
  }

  function articleHref(article) {
    return '?article=' + encodeURIComponent(article.id) + '#pocketReader';
  }

  function dateLabel(value) {
    var date = new Date(value + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
  }

  function libraryHtml(articles, heading) {
    var esc = Render.esc;
    var tag = heading === 4 ? 'h4' : 'h3';
    if (!articles.length) return '<p class="pr-message">No short reads match. Try a topic such as economy, Parliament or wetlands.</p>';
    return '<ol class="pr-list">' + articles.map(function (article, index) {
      var titleId = 'pocket-title-' + article.id;
      return '<li class="pr-story"><a class="pr-story__link" href="' + articleHref(article) +
        '" data-pocket-article="' + esc(article.id) + '" aria-labelledby="' + esc(titleId) + '">' +
        '<div class="pr-story__index">' +
        esc(article.kind || 'Explainer') + '</div>' +
        '<div class="pr-story__content"><div class="pr-story__meta"><span>' + esc(article.subject) + '</span><span>' +
          esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span>' +
          (article.sourceId ? '<span>' + (article.publicationDateKind === 'detected' ? 'Detected ' : '') + esc(dateLabel(article.publishedOn)) + '</span>' : '') + '</div>' +
        '<' + tag + ' id="' + esc(titleId) + '">' + esc(article.title) + '</' + tag + '><p>' + esc(article.excerpt) + '</p></div>' +
        '<span class="pr-story__arrow" aria-hidden="true">→</span></a></li>';
    }).join('') + '</ol>';
  }

  function readingEditionHtml(articles, query) {
    var matches = filterArticles(articles, query);
    if (String(query || '').trim() || !matches.length) return libraryHtml(matches);
    var recommended = matches.slice(0, 3);
    var remaining = matches.slice(3);
    var latest = remaining.filter(function (article) { return !!article.sourceId; });
    var foundations = remaining.filter(function (article) { return !article.sourceId; });
    function shelf(title, rows) {
      return rows.length ? '<section class="pr-shelf"><h3 class="pr-shelf__title">' + title + '</h3>' +
        libraryHtml(rows, 4) + '</section>' : '';
    }
    return shelf('Recommended reads', recommended) + shelf('Latest updates', latest) + shelf('Fundamentals', foundations);
  }

  function sectionSources(section, article) {
    var esc = Render.esc;
    var sources = (Array.isArray(section.sourceRefs) ? section.sourceRefs : []).map(function (index) { return (article.sources || [])[index]; })
      .filter(function (source) { return source && sourceUrl(source.url); });
    return sources.length ? '<div class="pr-section-source">Source: ' + sources.map(function (source) {
      return '<a href="' + esc(sourceUrl(source.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(source.label) + '</a>';
    }).join(' · ') + '</div>' : '';
  }

  function articleHtml(article, next) {
    var esc = Render.esc;
    return '<article class="pr-reader" data-pocket-anchor="' + esc(article.anchor) + '" data-paper="' + esc(article.paper) + '" data-published="' + esc(article.publishedOn) + '"><a class="pr-reader__back" href="upsc.html#pocketLibrary" data-pocket-back>← Pocket reads</a>' +
      '<header><p class="pr-reader__meta"><span>' + esc(article.subject) + '</span><span>' +
        esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span><span>' +
        (article.publicationDateKind === 'detected' ? 'Detected ' : '') + '<time datetime="' + esc(article.publishedOn) + '">' +
        esc(dateLabel(article.publishedOn)) + '</time></span>' +
        (article.updatedOn ? '<span>Updated ' + esc(dateLabel(article.updatedOn)) + '</span>' : '') + '</p>' +
      '<h2 id="pocketArticleTitle" tabindex="-1">' + esc(article.title) + '</h2>' +
      '<p class="pr-reader__dek">' + esc(article.excerpt) + '</p>' +
      '</header>' +
      '<div class="pr-reader__tools"><button type="button" class="btn" data-pocket-ask>Ask Summaverick</button>' +
      '<button type="button" class="btn" data-reading-size aria-pressed="false">Larger text</button></div>' +
      '<div class="pr-reader__body">' + article.sections.map(function (section) {
        return '<section><h3>' + esc(section.heading) + '</h3>' + section.paragraphs.map(function (paragraph) {
          return '<p>' + esc(paragraph) + '</p>';
        }).join('') + sectionSources(section, article) + '</section>';
      }).join('') + '</div>' +
      (article.example ? '<section class="pr-example"><p class="an-label">Worked example · illustration</p><h3>' + esc(article.example.heading) + '</h3><p>' + esc(article.example.text) + '</p></section>' : '') +
      (article.comparison ? '<section class="pr-comparison"><h3>' + esc(article.comparison.heading) + '</h3><table><thead><tr>' +
        article.comparison.columns.map(function (column) { return '<th scope="col">' + esc(column) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + article.comparison.rows.map(function (row) {
          return '<tr><th scope="row">' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>';
        }).join('') + '</tbody></table></section>' : '') +
      '<aside class="pr-takeaway"><h3>Takeaway</h3><p>' + esc(article.takeaway) + '</p></aside>' +
      (article.question ? '<section class="pr-question"><h3>Try it yourself</h3><p>' + esc(article.question) + '</p>' +
      (article.recallAnswer ? '<details><summary>Check your answer</summary><p>' + esc(article.recallAnswer) + '</p></details>' : '') + '</section>' : '') +
      '<section class="pr-reader__sources"><h3>Sources &amp; further reading</h3><ul>' +
        (article.sources || []).map(function (source) {
          var url = sourceUrl(source.url);
          return url ? '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(source.label) + ' ↗</a>' + (source.note ? '<p>' + esc(source.note) + '</p>' : '') + '</li>' : '';
        }).join('') + '</ul></section>' +
      '<div class="pr-reader__actions"><button type="button" class="btn btn-primary" data-pocket-save="' +
        esc(article.id) + '">Save the takeaway</button>' +
        '<button type="button" class="btn" data-pocket-check>Test my understanding</button>' +
        (article.patternId ? '<a class="btn" href="upsc-patterns.html?anchor=' + encodeURIComponent(article.patternId) + '">Explore this concept</a>' : '') +
        '<span class="pr-save-status" id="pocketSaveStatus" role="status"></span></div>' +
      (next ? '<a class="pr-reader__next" href="' + articleHref(next) + '" data-pocket-article="' + esc(next.id) +
        '"><span>Next article · ' + readMinutes(next) + ' min</span><strong>' + esc(next.title) + ' →</strong></a>' : '') +
      '</article>';
  }

  function validFeed(payload) {
    return payload && payload.version === 1 && Number.isFinite(Date.parse(payload.generatedAt))
      && typeof payload.revision === 'string' && Array.isArray(payload.articles)
      && payload.articles.length <= 100 && payload.articles.every(function (article) {
        var check = article && article.verification;
        return article && /^news-src_[a-f0-9]{64}$/.test(article.id)
          && article.id === 'news-' + article.sourceId && check && check.agrees === true
          && check.verificationVersion === 2
          && /^[a-f0-9]{64}$/.test(article.sourceContentHash)
          && typeof check.confidence === 'number' && check.confidence >= 0.7 && check.confidence <= 1
          && Array.isArray(check.flagged_claims) && check.flagged_claims.length === 0
          && check.sourceContentHash === article.sourceContentHash
          && typeof article.title === 'string' && typeof article.excerpt === 'string'
          && (!article.example || (typeof article.example.heading === 'string' && article.example.heading.trim()
            && typeof article.example.text === 'string' && article.example.text.trim() && article.example.text.length <= 900))
          && ['question', 'recallAnswer'].every(function (key) {
            return article[key] === undefined || (typeof article[key] === 'string' && article[key].length <= 1000);
          })
          && Array.isArray(article.sections) && article.sections.length >= 2
          && article.sections.every(function (section) {
            return typeof section.heading === 'string' && Array.isArray(section.paragraphs)
              && section.paragraphs.length && section.paragraphs.every(function (text) { return typeof text === 'string'; });
          }) && Array.isArray(article.sources) && article.sources.length && article.sources.every(function (source) {
            return /^https:\/\//.test(sourceUrl(source.url));
          });
      });
  }

  function mergeArticles(news, evergreen) {
    var seen = new Set();
    return news.concat(evergreen).filter(function (article) {
      if (seen.has(article.id)) return false;
      seen.add(article.id);
      return true;
    });
  }

  window.UPSCPocketReads = { readMinutes: readMinutes, filterArticles: filterArticles,
    libraryHtml: libraryHtml, readingEditionHtml: readingEditionHtml, articleHtml: articleHtml, validFeed: validFeed, mergeArticles: mergeArticles };
  if (typeof document === 'undefined') return;

  var articles = [];
  var evergreen = [];
  var news = [];
  var revision = '';
  var snapshotDate = '';
  var pendingFeed = null;
  var heldArticle = false;
  var refreshing = false;
  var etag = '';
  var loaded = false;
  var list = document.getElementById('pocketList');
  var library = document.getElementById('pocketLibrary');
  var reader = document.getElementById('pocketReader');
  var main = document.getElementById('main');
  var search = document.getElementById('q');
  if (!list || !reader || !library) return;
  var baseTitle = document.title;
  var activeReadingId = null;
  var activeReadingVersion = '';
  var feedStatus = document.getElementById('pocketFeedStatus');
  var updateButton = document.getElementById('pocketFeedRefresh');
  var largeText = false;
  var browse = document.getElementById('readerBrowse');
  try { largeText = localStorage.getItem('upsc.reading-size') === 'large'; } catch (error) { /* optional preference */ }

  function applyReadingSize() {
    reader.classList.toggle('pr-large-text', largeText);
    var button = reader.querySelector('[data-reading-size]');
    if (button) {
      button.setAttribute('aria-pressed', largeText ? 'true' : 'false');
      button.textContent = largeText ? 'Standard text' : 'Larger text';
    }
  }

  function currentArticle() {
    var url = new URL(window.location.href);
    if (url.searchParams.has('view') && url.searchParams.get('view') !== 'brief') return null;
    return articles.find(function (article) { return article.id === url.searchParams.get('article'); });
  }

  function render() {
    if (!loaded) return;
    if (pendingFeed && !currentArticle()) { applyFeed(pendingFeed, false); return; }
    var article = currentArticle();
    if (article) {
      var index = articles.indexOf(article);
      var body = articleHtml(article, articles[(index + 1) % articles.length]);
      if (canonicalJson(article) !== activeReadingVersion) reader.innerHTML = body;
      else {
        var template = document.createElement('div');
        template.innerHTML = body;
        var oldNext = reader.querySelector('.pr-reader__next');
        var newNext = template.querySelector('.pr-reader__next');
        if (oldNext && newNext) oldNext.replaceWith(newNext);
      }
    } else {
      var url = new URL(window.location.href);
      var unknown = url.searchParams.has('article') && !url.searchParams.has('view');
      list.innerHTML = (unknown ? '<p class="pr-message">That short read is unavailable. Choose another below.</p>' : '') +
        readingEditionHtml(articles, search.value);
    }
    library.hidden = !!article;
    reader.hidden = !article;
    main.toggleAttribute('data-reading', !!article);
    document.body.classList.toggle('upsc-reading', !!article);
    if (browse && (!!article !== !!activeReadingId)) browse.open = !article;
    document.title = article ? article.title + ' — UPSC Today' : baseTitle;
    applyReadingSize();
    var id = article ? article.id : null;
    var version = article ? canonicalJson(article) : '';
    if (id !== activeReadingId || version !== activeReadingVersion) {
      activeReadingId = id;
      activeReadingVersion = version;
      document.dispatchEvent(new CustomEvent('upsc:articlechange', { detail: { id: id } }));
    }
    document.dispatchEvent(new Event('upsc:chromechange'));
  }

  function focusArticle() {
    var title = document.getElementById('pocketArticleTitle');
    if (!title) return;
    title.focus({ preventScroll: true });
    reader.querySelector('.pr-reader').scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function navigate(id) {
    if (pendingFeed) applyFeed(pendingFeed, false);
    var url = new URL(window.location.href);
    url.searchParams.delete('view');
    url.searchParams.delete('subject');
    if (id) url.searchParams.set('article', id);
    else url.searchParams.delete('article');
    url.hash = id ? 'pocketReader' : 'pocketLibrary';
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    render();
    if (id && currentArticle()) { focusArticle(); return; }
    var target = document.getElementById('pocketLibraryTitle');
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function loadArticles() {
    list.innerHTML = '<p class="pr-message">Loading short reads…</p>';
    fetch('data/upsc-pocket-reads.json').then(function (response) {
      if (!response.ok) throw new Error('Article library unavailable');
      return response.json();
    }).then(function (payload) {
      if (!Array.isArray(payload.articles) || !payload.articles.length) throw new Error('Empty article library');
      evergreen = payload.articles;
      articles = mergeArticles(news, evergreen);
      loaded = true;
      render();
      if (currentArticle()) {
        focusArticle();
      }
    }).catch(function () {
      list.innerHTML = '<div class="pr-message"><p>The short reads could not load. The official updates are still available below.</p>' +
        '<button type="button" class="btn" data-pocket-retry>Try again</button></div>';
    }).finally(refreshFeed);
  }

  function applyFeed(payload, background) {
    if (!validFeed(payload)) throw new Error('Invalid news snapshot');
    if (Date.parse(payload.generatedAt) < Date.parse(pendingFeed ? pendingFeed.generatedAt : snapshotDate)) return;
    if (Date.parse(payload.generatedAt) === Date.parse(snapshotDate) && revision && revision !== payload.revision) return;
    if (revision === payload.revision) return;
    if (background && currentArticle() && (revision || payload.articles.length)) {
      pendingFeed = payload;
      var open = currentArticle();
      var updated = payload.articles.find(function (row) { return row.id === open.id; });
      function content(row) { return row && canonicalJson([row.sourceContentHash, row.title, row.excerpt, row.sections,
        row.takeaway, row.question, row.recallAnswer, row.example, row.comparison, row.sources]); }
      if (open.sourceId && content(updated) !== content(open)) {
        if (feedStatus) feedStatus.parentElement.setAttribute('data-correction', '');
        if (feedStatus) {
          feedStatus.setAttribute('role', 'alert');
          feedStatus.textContent = updated ? 'This note has changed. Load the checked update before using it.' : 'This note is no longer in the verified feed. Load the latest reads or open its source below.';
        }
        Array.prototype.forEach.call(reader.querySelectorAll('[data-pocket-save], [data-pocket-ask], [data-pocket-check]'), function (button) { button.disabled = true; });
        if (!heldArticle) document.dispatchEvent(new CustomEvent('upsc:articlechange', { detail: { id: open.id, withdrawn: true } }));
        heldArticle = true;
      } else if (feedStatus && !heldArticle) feedStatus.textContent = 'New updates available';
      if (updateButton) updateButton.textContent = 'Load updates';
      document.dispatchEvent(new Event('upsc:chromechange'));
      return;
    }
    var previousArticle = currentArticle();
    news = payload.articles;
    articles = mergeArticles(news, evergreen);
    revision = payload.revision;
    snapshotDate = payload.generatedAt;
    pendingFeed = null;
    heldArticle = false;
    if (feedStatus) {
      feedStatus.setAttribute('role', 'status');
      feedStatus.parentElement.removeAttribute('data-correction');
    }
    loaded = true;
    if (updateButton) updateButton.textContent = 'Check for updates';
    render();
    if (!previousArticle && currentArticle()) {
      focusArticle();
    }
  }

  function feedDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
  }

  function refreshFeed() {
    if (refreshing || document.visibilityState === 'hidden') return;
    refreshing = true;
    if (updateButton) updateButton.disabled = true;
    function request(url, headers) {
      return fetch(url, { cache: 'no-store', headers: headers || {}, signal: AbortSignal.timeout(10000) }).then(function (response) {
        if (response.status === 304) return null;
        if (!response.ok) throw new Error('News feed unavailable');
        return response.json().then(function (payload) {
          if (!validFeed(payload)) throw new Error('Invalid news snapshot');
          return { payload: payload, etag: response.headers.get('ETag') || '' };
        });
      });
    }
    var endpoint;
    try { endpoint = new URL('/upsc/pocket', window.SB_UPSC_ENDPOINT).href; } catch (error) { endpoint = ''; }
    var remote = endpoint ? request(endpoint, etag ? { 'If-None-Match': etag } : {}) : Promise.reject(new Error('No endpoint'));
    remote.catch(function () { return request('data/upsc/pocket-feed.json').then(function (result) {
      if (result) result.snapshot = true;
      return result;
    }); }).then(function (result) {
      if (!result) {
        if (!pendingFeed && feedStatus) feedStatus.textContent = news.length ? 'Updated ' + feedDate(snapshotDate) : 'Evergreen reads';
        return;
      }
      etag = result.etag;
      applyFeed(result.payload, true);
      if (!pendingFeed && feedStatus) feedStatus.textContent = news.length
        ? (result.snapshot ? 'Last published update ' : 'Updated ') + feedDate(snapshotDate) : 'Evergreen reads';
    }).catch(function () {
      if (feedStatus && !heldArticle) feedStatus.textContent = news.length ? 'Connection interrupted · showing last updates' : 'News feed unavailable';
    }).finally(function () {
      refreshing = false;
      if (updateButton) updateButton.disabled = false;
    });
  }

  if (updateButton) updateButton.addEventListener('click', function () {
    if (pendingFeed) {
      var payload = pendingFeed;
      applyFeed(payload, false);
      if (feedStatus) feedStatus.textContent = payload.articles.length ? 'Updated ' + feedDate(payload.generatedAt) : 'Evergreen reads';
    } else refreshFeed();
  });
  window.setInterval(refreshFeed, 30000);
  window.addEventListener('focus', refreshFeed);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') refreshFeed(); });

  main.addEventListener('click', function (event) {
    var link = event.target.closest('[data-pocket-article], [data-pocket-back]');
    if (link) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.getAttribute('data-pocket-article'));
      return;
    }
    if (event.target.closest('[data-pocket-retry]')) { loadArticles(); return; }
    if (event.target.closest('[data-pocket-ask], [data-pocket-check]')) {
      if (heldArticle) return;
      var checking = !!event.target.closest('[data-pocket-check]');
      document.dispatchEvent(new CustomEvent('upsc:ask', { detail: {
        chip: checking ? 'understanding' : 'sources',
        query: checking ? 'Check my understanding of this article against its primary sources. Ask one applied question without revealing the answer. Wait for my reply, then explain what I got right or missed and cite the supporting document.'
          : 'Explain this article more thoroughly using its primary sources. Separate the mechanism, a worked example and what the source actually establishes. Cite the documents you use.'
      } }));
      return;
    }
    if (event.target.closest('[data-reading-size]')) {
      largeText = !largeText;
      try { localStorage.setItem('upsc.reading-size', largeText ? 'large' : 'standard'); } catch (error) { /* optional preference */ }
      applyReadingSize();
      return;
    }
    var button = event.target.closest('[data-pocket-save]');
    if (!button || heldArticle) return;
    var article = currentArticle();
    if (!article) return;
    var result = window.AnchorStore.add({
      title: article.title, anchor: article.anchor, codes: article.codes,
      what: article.excerpt, why: article.question, use: article.takeaway,
      sourceUrl: article.sources[0].url, sourceName: article.sources[0].label,
      sourceId: article.id, origin: 'pocket-read', verified: false,
    });
    document.getElementById('pocketSaveStatus').textContent = {
      added: 'Saved for revision.', duplicate: 'Already in your revision notes.',
      error: 'Could not save. Check that browser storage is available.',
    }[result];
    window.dispatchEvent(new Event('upsc:noteschange'));
  });
  window.addEventListener('popstate', render);
  window.addEventListener('upsc:viewchange', render);
  loadArticles();
})();
