/* Short, source-linked articles. No network service or account is needed. */
(function () {
  'use strict';
  var Render = window.AnchorRender;

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

  function libraryHtml(articles) {
    var esc = Render.esc;
    if (!articles.length) return '<p class="pr-message">No short reads match. Try a topic such as economy, Parliament or wetlands.</p>';
    return '<ol class="pr-list">' + articles.map(function (article, index) {
      var titleId = 'pocket-title-' + article.id;
      return '<li class="pr-story"><a class="pr-story__link" href="' + articleHref(article) +
        '" data-pocket-article="' + esc(article.id) + '" aria-labelledby="' + esc(titleId) + '">' +
        '<div class="pr-story__index">' +
        String(index + 1).padStart(2, '0') + '<span>' + esc(article.kind) + '</span></div>' +
        '<div class="pr-story__content"><div class="pr-story__meta"><span>' + esc(article.subject) + '</span><span>' +
          esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span></div>' +
        '<h3 id="' + esc(titleId) + '">' + esc(article.title) + '</h3><p>' + esc(article.excerpt) + '</p></div>' +
        '<span class="pr-story__arrow" aria-hidden="true">→</span></a></li>';
    }).join('') + '</ol>';
  }

  function articleHtml(article, next) {
    var esc = Render.esc;
    return '<article class="pr-reader" data-pocket-anchor="' + esc(article.anchor) + '" data-paper="' + esc(article.paper) + '" data-published="' + esc(article.publishedOn) + '"><a class="pr-reader__back" href="upsc.html#pocketLibrary" data-pocket-back>← Pocket reads</a>' +
      '<header><p class="pr-reader__meta"><span>' + esc(article.subject) + '</span><span>' +
        esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span></p>' +
      '<h2 id="pocketArticleTitle" tabindex="-1">' + esc(article.title) + '</h2>' +
      '<p class="pr-reader__dek">' + esc(article.excerpt) + '</p>' +
      '<p class="pr-reader__date">Published <time datetime="' + esc(article.publishedOn) + '">' +
        esc(dateLabel(article.publishedOn)) + '</time>' + (article.updatedOn ? ' · Updated ' + esc(dateLabel(article.updatedOn)) : '') + '</p></header>' +
      '<div class="pr-reader__tools"><button type="button" class="btn" data-pocket-ask>Ask Summaverick</button>' +
      '<button type="button" class="btn" data-reading-size aria-pressed="false">Larger text</button></div>' +
      '<div class="pr-reader__body">' + article.sections.map(function (section) {
        return '<section><h3>' + esc(section.heading) + '</h3>' + section.paragraphs.map(function (paragraph) {
          return '<p>' + esc(paragraph) + '</p>';
        }).join('') + '</section>';
      }).join('') + '</div>' +
      (article.example ? '<section class="pr-example"><p class="an-label">Worked example · illustration</p><h3>' + esc(article.example.heading) + '</h3><p>' + esc(article.example.text) + '</p></section>' : '') +
      (article.comparison ? '<section class="pr-comparison"><h3>' + esc(article.comparison.heading) + '</h3><table><thead><tr>' +
        article.comparison.columns.map(function (column) { return '<th scope="col">' + esc(column) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + article.comparison.rows.map(function (row) {
          return '<tr><th scope="row">' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>';
        }).join('') + '</tbody></table></section>' : '') +
      '<aside class="pr-takeaway"><h3>Takeaway</h3><p>' + esc(article.takeaway) + '</p></aside>' +
      '<section class="pr-question"><h3>Recall question</h3><p>' + esc(article.question) + '</p>' +
      (article.recallAnswer ? '<details><summary>Check your answer</summary><p>' + esc(article.recallAnswer) + '</p></details>' : '') + '</section>' +
      '<section class="pr-reader__sources"><h3>Sources &amp; further reading</h3><ul>' +
        (article.sources || []).map(function (source) {
          var url = sourceUrl(source.url);
          return url ? '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(source.label) + ' ↗</a>' + (source.note ? '<p>' + esc(source.note) + '</p>' : '') + '</li>' : '';
        }).join('') + '</ul></section>' +
      '<div class="pr-reader__actions"><button type="button" class="btn btn-primary" data-pocket-save="' +
        esc(article.id) + '">Save the takeaway</button>' +
        '<span class="pr-save-status" id="pocketSaveStatus" role="status"></span></div>' +
      (next ? '<a class="pr-reader__next" href="' + articleHref(next) + '" data-pocket-article="' + esc(next.id) +
        '"><span>Next article · ' + readMinutes(next) + ' min</span><strong>' + esc(next.title) + ' →</strong></a>' : '') +
      '</article>';
  }

  window.UPSCPocketReads = { readMinutes: readMinutes, filterArticles: filterArticles,
    libraryHtml: libraryHtml, articleHtml: articleHtml };
  if (typeof document === 'undefined') return;

  var articles = [];
  var loaded = false;
  var list = document.getElementById('pocketList');
  var library = document.getElementById('pocketLibrary');
  var reader = document.getElementById('pocketReader');
  var main = document.getElementById('main');
  var search = document.getElementById('q');
  if (!list || !reader || !library) return;
  var baseTitle = document.title;
  var activeReadingId = null;
  var largeText = false;
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
    var article = currentArticle();
    if (article) {
      var index = articles.indexOf(article);
      var body = articleHtml(article, articles[(index + 1) % articles.length]);
      reader.innerHTML = body;
    } else {
      var url = new URL(window.location.href);
      var unknown = url.searchParams.has('article') && !url.searchParams.has('view');
      list.innerHTML = (unknown ? '<p class="pr-message">That short read is unavailable. Choose another below.</p>' : '') +
        libraryHtml(filterArticles(articles, search.value));
    }
    library.hidden = !!article;
    reader.hidden = !article;
    main.toggleAttribute('data-reading', !!article);
    document.title = article ? article.title + ' — UPSC Today' : baseTitle;
    applyReadingSize();
    var id = article ? article.id : null;
    if (id !== activeReadingId) {
      activeReadingId = id;
      document.dispatchEvent(new CustomEvent('upsc:articlechange', { detail: { id: id } }));
    }
  }

  function navigate(id) {
    var url = new URL(window.location.href);
    url.searchParams.delete('view');
    url.searchParams.delete('subject');
    if (id) url.searchParams.set('article', id);
    else url.searchParams.delete('article');
    url.hash = id ? 'pocketReader' : 'pocketLibrary';
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    render();
    var target = document.getElementById(id ? 'pocketArticleTitle' : 'pocketLibraryTitle');
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
      articles = payload.articles;
      loaded = true;
      render();
      if (currentArticle()) {
        var title = document.getElementById('pocketArticleTitle');
        title.focus({ preventScroll: true });
        title.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }).catch(function () {
      list.innerHTML = '<div class="pr-message"><p>The short reads could not load. The official updates are still available below.</p>' +
        '<button type="button" class="btn" data-pocket-retry>Try again</button></div>';
    });
  }

  main.addEventListener('click', function (event) {
    var link = event.target.closest('[data-pocket-article], [data-pocket-back]');
    if (link) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.getAttribute('data-pocket-article'));
      return;
    }
    if (event.target.closest('[data-pocket-retry]')) { loadArticles(); return; }
    if (event.target.closest('[data-pocket-ask]')) {
      document.dispatchEvent(new CustomEvent('upsc:ask', { detail: {
        query: 'Explain this article more thoroughly using its primary sources. Separate the mechanism, a worked example and what the source actually establishes. Cite the documents you use.'
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
    if (!button) return;
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
