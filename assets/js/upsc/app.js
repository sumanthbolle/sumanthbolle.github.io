/* Anchor — wiring: cycle position, brief retrieval, topic lookup, notes,
 * and the retrieval queue. Depends on store.js and render.js. */
;(function () {
  'use strict';

  var ENDPOINT = (window.SB_UPSC_ENDPOINT || '').replace(/\/$/, '');
  var BRIEF_TIMEOUT_MS = 60000;
  var LOOKUP_TIMEOUT_MS = 50000;

  var Store = window.AnchorStore;
  var Cycle = window.AnchorCycle;
  var Render = window.AnchorRender;

  function el(id) {
    return document.getElementById(id);
  }

  var state = {
    view: 'brief',
    scope: Store.getScope(),
    briefs: { daily: null, weekly: null },
    briefError: '',
    briefLoading: false,
    papers: [],
    notePapers: [],
    verifiedOnly: false,
    query: '',
    lookup: null,
    lookupError: '',
    lookupLoading: false,
    queue: [],
    queueIndex: 0,
    queuePassed: 0,
    queueReset: 0,
    mode: null,
  };

  /* ───────────────────────────── position ───────────────────────────── */

  function renderMode() {
    var position = { stage: el('stage').value, examDate: el('examDate').value };
    var result = Cycle.compute(position.stage, position.examDate);
    state.mode = result.mode;

    var nameEl = el('modeName');
    var tEl = el('modeT');
    var lineEl = el('modeLine');

    if (!result.mode) {
      nameEl.textContent = position.examDate ? 'Check the date' : 'Set a date';
      nameEl.setAttribute('data-mode', '');
      tEl.textContent = '—';
      lineEl.textContent = result.note ||
        'Add the date of your next paper and this page switches to the mode that suits it.';
    } else {
      nameEl.textContent = result.mode.name;
      nameEl.setAttribute('data-mode', result.mode.name);
      tEl.textContent = result.days === null ? '—' : 'T−' + result.days;
      lineEl.textContent = result.mode.line + (result.note ? ' ' + result.note : '');
    }

    renderRail();
    renderBriefMeta();
  }

  function savePosition() {
    Cycle.setPosition({ stage: el('stage').value, examDate: el('examDate').value });
    renderMode();
  }

  /* ─────────────────────────────── views ─────────────────────────────── */

  var VIEWS = ['brief', 'lookup', 'notes', 'revise'];

  function setView(name) {
    if (VIEWS.indexOf(name) === -1) return;
    state.view = name;
    VIEWS.forEach(function (view) {
      var tab = el('tab-' + view);
      var panel = el('view-' + view);
      var active = view === name;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      panel.hidden = !active;
    });
    if (name === 'revise') startQueue();
    if (name === 'notes') renderNotes();
  }

  /* ────────────────────────────── the brief ────────────────────────────── */

  function briefStateEl() {
    return el('briefState');
  }

  function showBriefState(title, body, buttonLabel) {
    var node = briefStateEl();
    node.hidden = false;
    node.innerHTML = '<h3>' + Render.esc(title) + '</h3><p>' + Render.esc(body) + '</p>' +
      (buttonLabel
        ? '<button type="button" class="btn btn-primary" id="loadBrief">' + Render.esc(buttonLabel) + '</button>'
        : '');
  }

  function loadBrief(force) {
    if (!ENDPOINT) {
      state.briefError = 'The retrieval endpoint is not configured for this page.';
      renderBrief();
      return;
    }
    if (state.briefLoading) return;
    if (!force && state.briefs[state.scope]) {
      renderBrief();
      return;
    }

    state.briefLoading = true;
    state.briefError = '';
    briefStateEl().hidden = true;
    el('briefEntries').innerHTML = '';
    el('clusterBlock').hidden = true;
    el('discardBlock').hidden = true;
    el('briefLoading').hidden = false;
    el('briefMeta').textContent = 'Retrieving, filtering and scoring — about twenty seconds.';

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, BRIEF_TIMEOUT_MS);

    fetch(ENDPOINT + '/upsc/brief?scope=' + encodeURIComponent(state.scope), {
      signal: controller.signal,
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (!payload || !payload.success || !payload.data) {
          throw new Error((payload && payload.error) || 'The brief could not be built.');
        }
        state.briefs[state.scope] = payload.data;
      })
      .catch(function (error) {
        state.briefError = error && error.name === 'AbortError'
          ? 'The brief took too long. Retrieval can be slow at peak times — try again.'
          : (error && error.message) || 'The brief could not be built.';
      })
      .then(function () {
        window.clearTimeout(timer);
        state.briefLoading = false;
        el('briefLoading').hidden = true;
        renderBrief();
      });
  }

  function currentBrief() {
    return state.briefs[state.scope];
  }

  function matchesQuery(item) {
    if (!state.query) return true;
    var haystack = [item.title, item.anchor, item.use, item.what, item.why, item.debate,
      (item.codes || []).join(' ')].join(' ').toLowerCase();
    return haystack.indexOf(state.query) !== -1;
  }

  function filteredItems() {
    var brief = currentBrief();
    if (!brief) return [];
    return brief.items.filter(function (item) {
      if (state.verifiedOnly && !item.verified) return false;
      if (state.papers.length) {
        var hit = item.papers.some(function (paper) { return state.papers.indexOf(paper) !== -1; });
        if (!hit) return false;
      }
      return matchesQuery(item);
    });
  }

  function renderBriefMeta() {
    var brief = currentBrief();
    var meta = el('briefMeta');
    if (!brief) {
      if (!state.briefLoading) meta.textContent = 'Not loaded yet.';
      return;
    }

    var time = new Date(brief.generatedAt);
    var stamp = isNaN(time.getTime())
      ? ''
      : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var shown = filteredItems().length;
    var bits = [];
    bits.push('<strong>' + shown + '</strong> of ' + brief.stats.total + ' kept');
    bits.push('<strong>' + brief.stats.verified + '</strong> from primary sources');
    if (stamp) bits.push('retrieved ' + Render.esc(stamp));

    var lockNote = '';
    if (state.mode && state.mode.name === 'LOCK') {
      lockNote = ' In lock mode this is for confirming what you already hold — do not start anything new from it.';
    } else if (state.mode && state.mode.name === 'COMPRESS') {
      lockNote = ' In compress mode, save only what scores high enough to be worth a revision slot.';
    }

    meta.innerHTML = bits.join(' · ') + '. Scores rank revision priority, not likelihood.' + Render.esc(lockNote);
  }

  function renderBrief() {
    el('briefTitle').textContent = state.scope === 'weekly' ? 'Weekly brief' : 'Daily brief';
    var list = el('briefEntries');
    var brief = currentBrief();

    if (state.briefLoading) return;

    if (state.briefError) {
      list.innerHTML = '';
      el('clusterBlock').hidden = true;
      el('discardBlock').hidden = true;
      el('briefMeta').textContent = 'Retrieval failed.';
      showBriefState('The brief could not be built', state.briefError +
        ' Your saved notes and the revision queue are stored on this device and still work.', 'Try again');
      return;
    }

    if (!brief) {
      list.innerHTML = '';
      showBriefState('Load ' + (state.scope === 'weekly' ? "the week's brief" : "today's brief"),
        state.scope === 'weekly'
          ? 'Seven days of news and government sources, filtered by the examinability test, with the repeated anchors clustered. It takes about twenty seconds.'
          : "Retrieval runs against news and government sources from the last 24 hours, applies the examinability test, and keeps only what survives it. It takes about twenty seconds.",
        'Build the brief');
      renderBriefMeta();
      return;
    }

    var items = filteredItems();
    briefStateEl().hidden = items.length > 0;

    if (!items.length) {
      list.innerHTML = '';
      showBriefState('Nothing matches those filters',
        'Clear the paper filters, the search box or the primary-source toggle to see the rest of the brief.', '');
    } else {
      list.innerHTML = items.map(Render.briefEntry).join('');
    }

    var clusterBlock = el('clusterBlock');
    if (brief.clusters && brief.clusters.length) {
      el('clusterList').innerHTML = Render.clusters(brief.clusters);
      clusterBlock.hidden = false;
    } else {
      clusterBlock.hidden = true;
    }

    var discardBlock = el('discardBlock');
    if (brief.discarded && brief.discarded.length) {
      el('discardList').innerHTML = Render.discards(brief.discarded);
      discardBlock.hidden = false;
    } else {
      discardBlock.hidden = true;
    }

    renderBriefMeta();
  }

  /* ────────────────────────────── the lookup ────────────────────────────── */

  function doLookup() {
    var topic = el('q').value.trim();
    if (topic.length < 3) {
      el('q').focus();
      return;
    }
    if (!ENDPOINT) {
      state.lookupError = 'The lookup endpoint is not configured for this page.';
      setView('lookup');
      renderLookup();
      return;
    }
    if (state.lookupLoading) return;

    setView('lookup');
    state.lookupLoading = true;
    state.lookupError = '';
    state.lookup = null;
    el('lookupState').hidden = true;
    el('lookupResult').hidden = true;
    el('lookupLoading').hidden = false;

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, LOOKUP_TIMEOUT_MS);

    fetch(ENDPOINT + '/upsc/topic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic, paper: el('lookupPaper').value }),
      signal: controller.signal,
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (!payload || !payload.success || !payload.data) {
          throw new Error((payload && payload.error) || 'That lookup returned nothing usable.');
        }
        state.lookup = payload.data;
      })
      .catch(function (error) {
        state.lookupError = error && error.name === 'AbortError'
          ? 'The lookup timed out. Try a narrower concept.'
          : (error && error.message) || 'That lookup returned nothing usable.';
      })
      .then(function () {
        window.clearTimeout(timer);
        state.lookupLoading = false;
        el('lookupLoading').hidden = true;
        renderLookup();
      });
  }

  function renderLookup() {
    var result = el('lookupResult');
    var empty = el('lookupState');

    if (state.lookupError) {
      result.hidden = true;
      empty.hidden = false;
      empty.innerHTML = '<h3>Lookup failed</h3><p>' + Render.esc(state.lookupError) + '</p>';
      return;
    }

    if (!state.lookup) {
      result.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    result.hidden = false;
    result.innerHTML = Render.lookupNote(state.lookup);
  }

  /* Map a lookup into the note format. The Use line takes the strongest
   * value-add when there is one, because that is what an examiner rewards. */
  function lookupToNote(note) {
    var use = '';
    if (note.valueAdds.length) {
      use = note.valueAdds[0].item + ' — ' + note.valueAdds[0].note;
    } else if (note.points.length > 1) {
      use = note.points[1];
    } else {
      use = note.points[0] || '';
    }

    var debate = '';
    if (note.debateFor.length && note.debateAgainst.length) {
      debate = note.debateFor[0] + ' / ' + note.debateAgainst[0];
    }

    var primary = null;
    note.sources.forEach(function (source) {
      if (!primary && source.primary) primary = source;
    });
    var source = primary || note.sources[0] || null;

    return {
      title: note.topic,
      anchor: note.anchor,
      codes: note.codes,
      what: note.oneLiner,
      why: note.points[0] || '',
      debate: debate,
      use: use,
      prelimsFact: note.prelimsFacts[0] || '',
      sourceUrl: source ? source.url : '',
      sourceName: source ? source.source : '',
      verified: !!(source && source.primary),
      score: null,
      band: '',
      origin: 'lookup',
    };
  }

  /* ─────────────────────────────── notes ─────────────────────────────── */

  function noteMatchesQuery(note) {
    if (!state.query) return true;
    var haystack = [note.title, note.anchor, note.use, note.what, note.why, note.debate,
      (note.codes || []).join(' ')].join(' ').toLowerCase();
    return haystack.indexOf(state.query) !== -1;
  }

  function renderNotes() {
    var notes = Store.list();
    var list = el('notesList');
    var empty = el('notesState');

    var shown = notes.filter(function (note) {
      if (state.notePapers.length) {
        var hit = (note.papers || []).some(function (paper) {
          return state.notePapers.indexOf(paper) !== -1;
        });
        if (!hit) return false;
      }
      return noteMatchesQuery(note);
    });

    if (!notes.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<h3>Nothing saved yet</h3><p>Save items from the brief or from a lookup. ' +
        'Each saved note enters the revision queue at day 1, 3, 7, 21 and 60 — and a note you never retrieve should never have been recorded.</p>';
      el('notesMeta').textContent = 'Nothing saved yet.';
      return;
    }

    if (!shown.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<h3>No notes match</h3><p>Clear the paper filters or the search box.</p>';
    } else {
      empty.hidden = true;
      var todayISO = Cycle.today();
      list.innerHTML = shown.map(function (note) {
        var due = note.dueOn <= todayISO;
        return Render.noteEntry(note, Store.dueLabel(note, todayISO), due);
      }).join('');
    }

    var stats = Store.stats();
    el('notesMeta').innerHTML = '<strong>' + shown.length + '</strong> of ' + stats.total +
      ' held · <strong>' + stats.due + '</strong> due for retrieval · ' +
      stats.unverified + ' unverified';
    renderRail();
  }

  function status(message, tone) {
    var node = el('notesStatus');
    node.textContent = message;
    node.setAttribute('data-tone', tone || 'ok');
    node.hidden = false;
    window.setTimeout(function () { node.hidden = true; }, 4000);
  }

  function countWords(value) {
    var trimmed = String(value || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function updateWordCount() {
    var total = countWords(el('nWhat').value) + countWords(el('nWhy').value) +
      countWords(el('nDebate').value) + countWords(el('nUse').value);
    var node = el('wordCount');
    node.textContent = total + ' / 60 words across the four lines';
    node.setAttribute('data-over', total > 60 ? 'true' : 'false');
  }

  function saveOwnNote() {
    var result = Store.add({
      title: el('nTitle').value.trim(),
      anchor: el('nAnchor').value.trim(),
      codes: el('nCodes').value,
      what: el('nWhat').value.trim(),
      why: el('nWhy').value.trim(),
      debate: el('nDebate').value.trim(),
      use: el('nUse').value.trim(),
      sourceUrl: el('nSource').value.trim(),
      verified: false,
      origin: 'own',
    });

    if (result === 'error') {
      status('A title and a static anchor are both required — no anchor, no entry.', 'error');
      return;
    }
    if (result === 'duplicate') {
      status('You already hold a note with that anchor and title.', 'error');
      return;
    }

    ['nTitle', 'nAnchor', 'nCodes', 'nWhat', 'nWhy', 'nDebate', 'nUse', 'nSource'].forEach(function (id) {
      el(id).value = '';
    });
    updateWordCount();
    status('Saved. First retrieval is due tomorrow.');
    renderNotes();
    renderCounts();
  }

  /* ────────────────────────────── retrieval ────────────────────────────── */

  function startQueue() {
    state.queue = Store.due();
    state.queueIndex = 0;
    state.queuePassed = 0;
    state.queueReset = 0;
    renderRevise();
  }

  function renderRevise() {
    var body = el('reviseBody');
    var meta = el('reviseMeta');
    var total = state.queue.length;

    if (!total) {
      var stats = Store.stats();
      body.innerHTML = '<div class="an-state"><h3>' +
        (stats.total ? 'Nothing due' : 'Nothing saved yet') + '</h3><p>' +
        (stats.total
          ? 'You hold ' + stats.total + ' notes and none are due today. Come back tomorrow rather than rereading them — rereading is what produces the feeling of knowing.'
          : 'Save a few notes first. When something is due you will see its title alone, and reconstruct the rest from memory before revealing it.') +
        '</p></div>';
      meta.textContent = 'Retrieval, not rereading.';
      return;
    }

    if (state.queueIndex >= total) {
      body.innerHTML = '<div class="an-state"><h3>Queue clear</h3><p>' +
        state.queuePassed + ' reconstructed, ' + state.queueReset +
        ' reset to day 1. Items that keep failing at day 60 are either badly written — fix the note — or genuinely hard, in which case write a practice answer on them.</p></div>';
      meta.textContent = 'Done for today.';
      renderCounts();
      renderRail();
      return;
    }

    meta.innerHTML = '<strong>' + (total - state.queueIndex) + '</strong> left today';
    body.innerHTML = Render.reviseCard(state.queue[state.queueIndex], state.queueIndex, total);
  }

  function handleReviseClick(event) {
    var button = event.target.closest('[data-act]');
    if (!button) return;
    var act = button.getAttribute('data-act');
    var card = button.closest('.an-card');
    if (!card) return;
    var id = card.getAttribute('data-id');

    if (act === 'reveal') {
      card.querySelector('#reveal').hidden = false;
      button.hidden = true;
      card.querySelector('[data-act="pass"]').hidden = false;
      card.querySelector('[data-act="fail"]').hidden = false;
      return;
    }

    if (act === 'pass' || act === 'fail') {
      Store.review(id, act === 'pass' ? 'pass' : 'fail');
      if (act === 'pass') state.queuePassed += 1;
      else state.queueReset += 1;
      state.queueIndex += 1;
      renderRevise();
      renderCounts();
    }
  }

  /* ───────────────────────────── rail, counts ───────────────────────────── */

  function renderCounts() {
    var stats = Store.stats();
    el('countNotes').textContent = stats.total;
    el('countDue').textContent = stats.due;
  }

  function renderRail() {
    var stats = Store.stats();
    el('railMode').textContent = state.mode ? state.mode.name : '—';
    var days = Cycle.compute(el('stage').value, el('examDate').value).days;
    el('railDays').textContent = days === null || days < 0 ? '—' : days;
    el('railDue').textContent = stats.due;
    el('railNotes').textContent = stats.total;
    el('railUnverified').textContent = stats.unverifiedPct + '%';
    el('railUnverifiedStat').setAttribute('data-warn', stats.unverifiedPct > 15 ? 'true' : 'false');
    renderCounts();
  }

  /* ───────────────────────────── export ───────────────────────────── */

  function copyNotes() {
    var markdown = Store.toMarkdown();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(markdown).then(function () {
        status('Notes copied as Markdown.');
      }, function () {
        status('Could not reach the clipboard. Use Download instead.', 'error');
      });
    } else {
      status('This browser blocks clipboard access. Use Download instead.', 'error');
    }
  }

  function downloadNotes() {
    var blob = new Blob([Store.toMarkdown()], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'anchor-notes-' + Cycle.today() + '.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    status('Downloaded.');
  }

  /* ─────────────────────────────── wiring ─────────────────────────────── */

  function toggleChip(button, bucket) {
    var paper = button.getAttribute('data-paper');
    var pressed = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    var index = bucket.indexOf(paper);
    if (pressed && index !== -1) bucket.splice(index, 1);
    if (!pressed && index === -1) bucket.push(paper);
  }

  function init() {
    if (!Store || !Cycle || !Render) return;

    if (window.SBShared) {
      window.SBShared.initNavMenu();
      window.SBShared.initThemeToggle();
    }

    /* The shared nav script toggles classes only, so keep the announced state
     * of the two chrome buttons in step with what they actually did. */
    var menuToggle = document.querySelector('.menu-toggle');
    var mobileMenu = el('mobileMenu');
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', function () {
        menuToggle.setAttribute('aria-expanded', mobileMenu.classList.contains('active') ? 'true' : 'false');
      });
    }

    var themeToggle = el('themeToggle');
    if (themeToggle) {
      var syncTheme = function () {
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
        themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      };
      syncTheme();
      themeToggle.addEventListener('click', syncTheme);
    }

    var position = Cycle.getPosition();
    /* Bound the picker rather than hardcoding a cycle: a date input otherwise
     * accepts six-digit years, which produces a nonsense countdown. */
    var dateField = el('examDate');
    dateField.min = Cycle.addDays(Cycle.today(), -365);
    dateField.max = Cycle.addDays(Cycle.today(), 365 * 5);
    el('stage').value = position.stage;
    dateField.value = position.examDate;
    el('stage').addEventListener('change', savePosition);
    el('examDate').addEventListener('change', savePosition);
    renderMode();

    /* Views */
    document.querySelectorAll('[role="tab"][data-view]').forEach(function (tab) {
      tab.addEventListener('click', function () { setView(tab.getAttribute('data-view')); });
    });

    /* Scope */
    ['scopeDaily', 'scopeWeekly'].forEach(function (id) {
      el(id).addEventListener('click', function () {
        var scope = el(id).getAttribute('data-scope');
        if (scope === state.scope) return;
        state.scope = scope;
        Store.setScope(scope);
        el('scopeDaily').setAttribute('aria-pressed', scope === 'daily' ? 'true' : 'false');
        el('scopeWeekly').setAttribute('aria-pressed', scope === 'weekly' ? 'true' : 'false');
        state.briefError = '';
        renderBrief();
      });
    });
    el('scopeDaily').setAttribute('aria-pressed', state.scope === 'daily' ? 'true' : 'false');
    el('scopeWeekly').setAttribute('aria-pressed', state.scope === 'weekly' ? 'true' : 'false');

    /* Filters */
    el('paperFilter').addEventListener('click', function (event) {
      var button = event.target.closest('.an-chip');
      if (!button) return;
      toggleChip(button, state.papers);
      renderBrief();
    });

    el('notesFilter').addEventListener('click', function (event) {
      var button = event.target.closest('.an-chip');
      if (!button) return;
      toggleChip(button, state.notePapers);
      renderNotes();
    });

    el('verifiedOnly').addEventListener('change', function (event) {
      state.verifiedOnly = event.target.checked;
      renderBrief();
    });

    /* Retrieval + lookup */
    el('refreshBrief').addEventListener('click', function () { loadBrief(true); });
    briefStateEl().addEventListener('click', function (event) {
      if (event.target.id === 'loadBrief') loadBrief(true);
    });
    el('lookupBtn').addEventListener('click', doLookup);

    /* Search: filters what is on screen; Enter fetches a fresh note. */
    var search = el('q');
    search.addEventListener('input', function () {
      state.query = search.value.trim().toLowerCase();
      if (state.view === 'notes') renderNotes();
      else renderBrief();
    });
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        doLookup();
      }
      if (event.key === 'Escape') {
        search.value = '';
        state.query = '';
        renderBrief();
        renderNotes();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      var tag = (event.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
      event.preventDefault();
      search.focus();
      search.select();
    });

    /* Saving from the brief */
    el('briefEntries').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act="save"]');
      if (!button) return;
      var brief = currentBrief();
      if (!brief) return;
      var id = button.getAttribute('data-id');
      var item = null;
      brief.items.forEach(function (candidate) {
        if (candidate.id === id) item = candidate;
      });
      if (!item) return;

      var result = Store.add({
        title: item.title,
        anchor: item.anchor,
        codes: item.codes,
        what: item.what,
        why: item.why,
        debate: item.debate,
        use: item.use,
        prelimsFact: item.prelimsFact,
        sourceUrl: item.sourceUrl,
        sourceName: item.sourceName,
        verified: item.verified,
        score: item.score,
        band: item.band,
        origin: 'brief',
      });

      button.disabled = true;
      button.textContent = result === 'duplicate' ? 'Already saved' : 'Saved · due tomorrow';
      renderCounts();
      renderRail();
    });

    /* Saving from a lookup */
    el('lookupResult').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act="save-lookup"]');
      if (!button || !state.lookup) return;
      var result = Store.add(lookupToNote(state.lookup));
      button.disabled = true;
      button.textContent = result === 'duplicate' ? 'Already saved' : 'Saved · due tomorrow';
      renderCounts();
      renderRail();
    });

    /* Notes list + composer */
    el('notesList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act="delete"]');
      if (!button) return;
      Store.remove(button.getAttribute('data-id'));
      renderNotes();
      renderCounts();
      status('Deleted. Pruning is maintenance, not loss.');
    });

    ['nWhat', 'nWhy', 'nDebate', 'nUse'].forEach(function (id) {
      el(id).addEventListener('input', updateWordCount);
    });
    el('saveNote').addEventListener('click', saveOwnNote);
    updateWordCount();

    /* Retrieval queue */
    el('reviseBody').addEventListener('click', handleReviseClick);

    /* Export and reset */
    el('copyNotes').addEventListener('click', copyNotes);
    el('downloadNotes').addEventListener('click', downloadNotes);
    el('clearData').addEventListener('click', function () {
      var stats = Store.stats();
      var message = stats.total
        ? 'Delete ' + stats.total + ' saved notes, the revision queue and your exam date from this browser? This cannot be undone.'
        : 'Clear the saved exam date from this browser?';
      if (!window.confirm(message)) return;
      Store.clearAll();
      var reset = Cycle.getPosition();
      el('stage').value = reset.stage;
      el('examDate').value = reset.examDate;
      renderMode();
      renderNotes();
      startQueue();
      renderCounts();
    });

    renderNotes();
    renderCounts();
    renderRail();
    renderBrief();

    /* ?topic= hands a concept over from the Pattern Atlas: the atlas holds the
     * static anchor, this fetches the current trigger layer for it. */
    var requested = new URLSearchParams(window.location.search).get('topic');
    if (requested) {
      search.value = requested.slice(0, 160);
      doLookup();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
