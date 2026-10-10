/* Short, source-linked articles. No network service or account is needed. */
(function () {
  'use strict';
  var Render = window.AnchorRender;

  function readMinutes(article) {
    var text = [article.title, article.excerpt, article.takeaway, article.question];
    (article.sections || []).forEach(function (section) {
      text.push(section.heading);
      text = text.concat(section.paragraphs || []);
    });
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
      return '<li class="pr-story"><div class="pr-story__index">' +
        String(index + 1).padStart(2, '0') + '<span>' + esc(article.kind) + '</span></div>' +
        '<div><div class="pr-story__meta"><span>' + esc(article.subject) + '</span><span>' +
          esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span></div>' +
        '<h3><a href="' + articleHref(article) + '" data-pocket-article="' + esc(article.id) + '">' +
          esc(article.title) + '</a></h3><p>' + esc(article.excerpt) + '</p></div>' +
        '<span class="pr-story__arrow" aria-hidden="true">→</span></li>';
    }).join('') + '</ol>';
  }

  function articleHtml(article, next) {
    var esc = Render.esc;
    return '<article class="pr-reader"><a class="pr-reader__back" href="upsc.html#pocketLibrary" data-pocket-back>← All short reads</a>' +
      '<header><p class="pr-reader__meta"><span>' + esc(article.subject) + '</span><span>' +
        esc(article.paper) + '</span><span>' + readMinutes(article) + ' min read</span></p>' +
      '<h2 id="pocketArticleTitle" tabindex="-1">' + esc(article.title) + '</h2>' +
      '<p class="pr-reader__dek">' + esc(article.excerpt) + '</p>' +
      '<p class="pr-reader__date">Explainer · Published <time datetime="' + esc(article.publishedOn) + '">' +
        esc(dateLabel(article.publishedOn)) + '</time></p></header>' +
      '<div class="pr-reader__body">' + article.sections.map(function (section) {
        return '<section><h3>' + esc(section.heading) + '</h3>' + section.paragraphs.map(function (paragraph) {
          return '<p>' + esc(paragraph) + '</p>';
        }).join('') + '</section>';
      }).join('') + '</div>' +
      '<aside class="pr-takeaway"><h3>Keep this in mind</h3><p>' + esc(article.takeaway) + '</p></aside>' +
      '<section class="pr-question"><h3>A question to sit with</h3><p>' + esc(article.question) + '</p></section>' +
      '<section class="pr-reader__sources"><h3>Sources &amp; further reading</h3><ul>' +
        (article.sources || []).map(function (source) {
          var url = Render.safeHttpUrl(source.url);
          return url ? '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(source.label) + ' ↗</a></li>' : '';
        }).join('') + '</ul></section>' +
      '<div class="pr-reader__actions"><button type="button" class="btn btn-primary" data-pocket-save="' +
        esc(article.id) + '">Save the takeaway</button>' +
        '<span class="pr-save-status" id="pocketSaveStatus" role="status"></span></div>' +
      (next ? '<a class="pr-reader__next" href="' + articleHref(next) + '" data-pocket-article="' + esc(next.id) +
        '"><span>Another short read · ' + readMinutes(next) + ' min</span><strong>' + esc(next.title) + ' →</strong></a>' : '') +
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

  function currentArticle() {
    var url = new URL(window.location.href);
    if (url.searchParams.has('view') && url.searchParams.get('view') !== 'brief') return null;
    return articles.find(function (article) { return article.id === url.searchParams.get('article'); });
  }

  function render() {
    if (!loaded) return;
    var article = currentArticle();
    library.hidden = !!article;
    reader.hidden = !article;
    main.toggleAttribute('data-reading', !!article);
    document.title = article ? article.title + ' — UPSC Today' : baseTitle;
    if (article) {
      var index = articles.indexOf(article);
      reader.innerHTML = articleHtml(article, articles[(index + 1) % articles.length]);
    } else {
      var url = new URL(window.location.href);
      var unknown = url.searchParams.has('article') && !url.searchParams.has('view');
      list.innerHTML = (unknown ? '<p class="pr-message">That short read is unavailable. Choose another below.</p>' : '') +
        libraryHtml(filterArticles(articles, search.value));
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
