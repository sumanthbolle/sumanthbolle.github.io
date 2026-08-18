/* Anchor — wiring: cycle position, brief retrieval, topic lookup, notes,
 * and the retrieval queue. Depends on store.js and render.js. */
;(function () {
  'use strict';

  var ENDPOINT = (window.SB_UPSC_ENDPOINT || '').replace(/\/$/, '');
  var LOOKUP_TIMEOUT_MS = 50000;

  var Store = window.AnchorStore;
  var Cycle = window.AnchorCycle;
  var Content = window.AnchorContent;
  var Memory = window.AnchorMemory;
  var Render = window.AnchorRender;

  function el(id) {
    return document.getElementById(id);
  }

  var state = {
    view: 'source',
    sources: [],
    sourceGeneratedAt: '',
    sourceError: '',
    sourceLoading: false,
    sourceFilters: {
      query: '', publishers: [], papers: [], sourceTypes: [],
      jurisdiction: 'all', date: '',
    },
    scope: Store.getScope(),
    examSummaries: [],
    examDetails: {},
    examGeneratedAt: '',
    examExpandedId: '',
    examDetailLoading: '',
    briefError: '',
    briefLoading: false,
    syllabusGroups: [],
    syllabusGeneratedAt: '',
    syllabusError: '',
    syllabusLoading: false,
    practiceLoading: false,
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
    memoryMode: 'due',
    drillQueue: [],
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

    el('main').setAttribute('data-cycle', result.mode ? result.mode.name.toLowerCase() : '');
    renderRail();
    renderBriefMeta();
  }

  function savePosition() {
    Cycle.setPosition({ stage: el('stage').value, examDate: el('examDate').value });
    renderMode();
    if (state.mode && state.mode.name === 'LOCK') setView('memory');
  }

  /* ─────────────────────────────── views ─────────────────────────────── */

  var VIEWS = ['source', 'brief', 'syllabus', 'answer', 'memory'];

  function setView(name) {
    if (VIEWS.indexOf(name) === -1) return;
    state.view = name;
    VIEWS.forEach(function (view) {
      var tab = el('tab-' + view);
      var panel = el('view-' + view);
      var active = view === name;
      if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false');
      if (panel) panel.hidden = !active;
    });
    if (name === 'source') renderSourceDesk();
    if (name === 'brief') renderBrief();
    if (name === 'syllabus') renderSyllabus();
    if (name === 'answer') loadPracticeNotes();
    if (name === 'memory') setMemoryMode(state.memoryMode);
  }

  /* ─────────────────────────── official sources ─────────────────────────── */

  function sourceFiltersFromControls() {
    state.sourceFilters = {
      query: el('sourceQuery').value.trim().toLowerCase(),
      publishers: el('sourcePublisher').value ? [el('sourcePublisher').value] : [],
      papers: el('sourcePaper').value ? [el('sourcePaper').value] : [],
      sourceTypes: el('sourceType').value ? [el('sourceType').value] : [],
      jurisdiction: el('sourceJurisdiction').value || 'all',
      date: el('sourceDate').value || '',
    };
  }

  function populateSourceFilters() {
    var publishers = Content.groupPublishers(state.sources);
    var publisherSelect = el('sourcePublisher');
    while (publisherSelect.options.length > 1) publisherSelect.remove(1);
    publishers.forEach(function (publisher) {
      var option = document.createElement('option');
      option.value = publisher.id;
      option.textContent = publisher.name + ' (' + publisher.count + ')';
      publisherSelect.appendChild(option);
    });
    var types = {};
    state.sources.forEach(function (row) { types[row.sourceType] = true; });
    var typeSelect = el('sourceType');
    while (typeSelect.options.length > 1) typeSelect.remove(1);
    Object.keys(types).sort().forEach(function (type) {
      var option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
  }

  function renderSourceDesk() {
    if (!Content) return;
    var list = el('sourceEntries');
    var empty = el('sourceState');
    if (state.sourceLoading) {
      empty.hidden = false;
      empty.innerHTML = '<h3>Loading official records</h3><p>Reading the last published source index.</p>';
      list.innerHTML = '';
      return;
    }
    if (state.sourceError && !state.sources.length) {
      empty.hidden = false;
      empty.innerHTML = '<h3>Source index unavailable</h3><p>' + Render.esc(state.sourceError) +
        ' Open the official directory below or use the last generated static archive.</p>' +
        '<p><a href="upsc-study/index.html">Browse static study archive</a> · ' +
        '<a href="https://pib.gov.in" target="_blank" rel="noopener noreferrer">PIB</a> · ' +
        '<a href="https://www.rbi.org.in" target="_blank" rel="noopener noreferrer">RBI</a> · ' +
        '<a href="https://news.un.org" target="_blank" rel="noopener noreferrer">UN News</a></p>';
      list.innerHTML = '';
      el('sourceMeta').textContent = 'Last valid archive preserved.';
      return;
    }
    var shown = Content.filterSources(state.sources, state.sourceFilters);
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      empty.innerHTML = '<h3>No official records match</h3><p>Clear one or more filters. Source Desk never deletes low-priority items.</p>';
      list.innerHTML = '';
    } else {
      list.innerHTML = shown.map(Render.sourceEntry).join('');
    }
    el('sourceMeta').innerHTML = '<strong>' + shown.length + '</strong> of ' + state.sources.length +
      ' official records' + (state.sourceGeneratedAt ? ' · index ' + Render.esc(state.sourceGeneratedAt.slice(0, 10)) : '') + '.';
  }

  function loadSourceIndex() {
    if (!Content || state.sourceLoading) return;
    state.sourceLoading = true;
    state.sourceError = '';
    renderSourceDesk();
    fetch('data/upsc/source-index.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Published source data could not be loaded.');
        return response.json();
      })
      .then(function (payload) {
        var normalized = Content.normalizeSourceIndex(payload);
        state.sources = normalized.records;
        state.sourceGeneratedAt = normalized.generatedAt;
        populateSourceFilters();
      })
      .catch(function (error) {
        state.sourceError = (error && error.message) || 'Published source data could not be loaded.';
      })
      .then(function () {
        state.sourceLoading = false;
        renderSourceDesk();
      });

    fetch('data/upsc/coverage.json', { cache: 'no-cache' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) { el('sourceCoverage').innerHTML = Render.coverageStatus(payload); })
      .catch(function () { el('sourceCoverage').innerHTML = Render.coverageStatus(null); });
  }

  /* ────────────────────────────── the brief ────────────────────────────── */

  function briefStateEl() {
    return el('briefState');
  }

  function showBriefState(title, body) {
    var node = briefStateEl();
    node.hidden = false;
    node.innerHTML = '<h3>' + Render.esc(title) + '</h3><p>' + Render.esc(body) + '</p>';
  }

  function loadBrief() {
    if (state.briefLoading) return;
    state.briefLoading = true;
    state.briefError = '';
    el('briefLoading').hidden = false;
    el('briefMeta').textContent = 'Loading the latest published exam index.';
    fetch('data/upsc/exam-index.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('The published exam index could not be loaded.');
        return response.json();
      })
      .then(function (payload) {
        var normalized = Content.normalizeExamIndex(payload);
        Object.keys(state.examDetails).forEach(function (id) {
          var summary = normalized.notes.find(function (note) { return note.sourceId === id; });
          if (!summary || summary.sourceContentHash !== state.examDetails[id].sourceContentHash) {
            delete state.examDetails[id];
          }
        });
        state.examSummaries = normalized.notes;
        state.examGeneratedAt = normalized.generatedAt;
      })
      .catch(function (error) {
        state.briefError = (error && error.message) || 'The published exam index could not be loaded.';
      })
      .then(function () {
        state.briefLoading = false;
        el('briefLoading').hidden = true;
        renderBrief();
        if (state.view === 'answer') loadPracticeNotes();
      });
  }

  function latestExamDay() {
    return state.examSummaries.reduce(function (latest, note) {
      var day = note.publishedAt.slice(0, 10);
      return day > latest ? day : latest;
    }, '');
  }

  function matchesQuery(item) {
    if (!state.query) return true;
    var haystack = [item.title, item.anchor, item.use, item.whyInNews,
      (item.codes || []).join(' ')].join(' ').toLowerCase();
    return haystack.indexOf(state.query) !== -1;
  }

  function filteredItems() {
    var latest = latestExamDay();
    var latestTime = latest ? Date.parse(latest + 'T00:00:00Z') : 0;
    return state.examSummaries.filter(function (item) {
      var day = item.publishedAt.slice(0, 10);
      if (state.scope === 'daily' && latest && day !== latest) return false;
      if (state.scope === 'weekly' && latest && latestTime - Date.parse(day + 'T00:00:00Z') > 6 * 86400000) return false;
      if (state.verifiedOnly && ['source-backed', 'reviewed'].indexOf(item.editorialStatus) === -1) return false;
      if (state.papers.length) {
        var hit = item.papers.some(function (paper) { return state.papers.indexOf(paper) !== -1; });
        if (!hit) return false;
      }
      return matchesQuery(item);
    });
  }

  function renderBriefMeta() {
    var meta = el('briefMeta');
    if (!state.examSummaries.length) {
      if (!state.briefLoading) meta.textContent = state.briefError ? 'Publication unavailable.' : 'No mapped notes published yet.';
      return;
    }
    var shown = filteredItems().length;
    var lockNote = '';
    if (state.mode && state.mode.name === 'LOCK') {
      lockNote = ' In lock mode this is for confirming what you already hold — do not start anything new from it.';
    } else if (state.mode && state.mode.name === 'COMPRESS') {
      lockNote = ' In compress mode, save only what scores high enough to be worth a revision slot.';
    }

    meta.innerHTML = '<strong>' + shown + '</strong> of ' + state.examSummaries.length +
      ' mapped notes · latest trigger ' + Render.esc(latestExamDay()) +
      (state.examGeneratedAt ? ' · built ' + Render.esc(state.examGeneratedAt.slice(0, 16).replace('T', ' ')) + ' UTC' : '') +
      '. Scores rank revision priority, not likelihood.' + Render.esc(lockNote);
  }

  function renderBrief() {
    el('briefTitle').textContent = state.scope === 'weekly' ? 'Published weekly brief' : 'Published daily brief';
    var list = el('briefEntries');
    if (state.briefLoading) return;
    if (state.briefError) {
      list.innerHTML = '';
      el('clusterBlock').hidden = true;
      el('discardBlock').hidden = true;
      el('briefMeta').textContent = 'Publication unavailable.';
      showBriefState('The published brief is unavailable', state.briefError +
        ' Source Desk, the static archive, and your device-local memory queue still work.');
      return;
    }
    if (!state.examSummaries.length) {
      list.innerHTML = '';
      showBriefState('No topper notes published yet',
        'Every official record remains in Source Desk while mapping and evidence checks continue.');
      renderBriefMeta();
      return;
    }
    var items = filteredItems();
    briefStateEl().hidden = items.length > 0;
    if (!items.length) {
      list.innerHTML = '';
      showBriefState('Nothing matches those filters',
        'Clear the paper filters, search box, or ready-for-recall toggle to see the rest of the publication.');
    } else {
      list.innerHTML = items.map(function (item) {
        if (state.examExpandedId === item.sourceId && state.examDetails[item.sourceId]) {
          return '<li class="an-exam-expanded">' + Render.examNote(state.examDetails[item.sourceId], {}) + '</li>';
        }
        return '<li>' + Render.examSummary(item, { loading: state.examDetailLoading === item.sourceId }) + '</li>';
      }).join('');
    }
    el('clusterBlock').hidden = true;
    el('discardBlock').hidden = true;
    renderBriefMeta();
  }

  function loadExamDetail(sourceId) {
    if (!/^src_[a-f0-9]{64}$/i.test(sourceId)) return Promise.reject(new Error('Invalid note identity.'));
    if (state.examDetails[sourceId]) return Promise.resolve(state.examDetails[sourceId]);
    return fetch('data/upsc/notes/' + encodeURIComponent(sourceId) + '.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('The full note could not be loaded.');
        return response.json();
      })
      .then(function (payload) {
        var normalized = Content.normalizeExamIndex({ notes: [payload] }).notes[0];
        if (!normalized || normalized.sourceId !== sourceId) throw new Error('The full note failed validation.');
        state.examDetails[sourceId] = normalized;
        return normalized;
      });
  }

  function openExamDetail(sourceId) {
    if (state.examExpandedId === sourceId && state.examDetails[sourceId]) {
      state.examExpandedId = '';
      renderBrief();
      return;
    }
    state.examDetailLoading = sourceId;
    renderBrief();
    loadExamDetail(sourceId).then(function () {
      state.examExpandedId = sourceId;
    }).catch(function (error) {
      state.briefError = error.message;
    }).then(function () {
      state.examDetailLoading = '';
      renderBrief();
    });
  }

  function loadSyllabus() {
    if (state.syllabusLoading) return;
    state.syllabusLoading = true;
    fetch('data/upsc/syllabus-index.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('The syllabus index could not be loaded.');
        return response.json();
      })
      .then(function (payload) {
        var normalized = Content.normalizeSyllabusIndex(payload);
        state.syllabusGroups = normalized.groups;
        state.syllabusGeneratedAt = normalized.generatedAt;
      })
      .catch(function (error) { state.syllabusError = error.message; })
      .then(function () { state.syllabusLoading = false; renderSyllabus(); });
  }

  function renderSyllabus() {
    var list = el('syllabusList');
    var empty = el('syllabusState');
    if (state.syllabusLoading) {
      empty.hidden = false;
      empty.innerHTML = '<h3>Loading the syllabus map</h3><p>Joining static anchors to current official triggers.</p>';
      return;
    }
    if (state.syllabusError) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<h3>Syllabus map unavailable</h3><p>' + Render.esc(state.syllabusError) + '</p>';
      return;
    }
    var groups = state.syllabusGroups.filter(function (group) {
      if (!state.query) return true;
      return [group.code, group.anchor, group.staticDefinition].join(' ').toLowerCase().indexOf(state.query) !== -1;
    });
    empty.hidden = groups.length > 0;
    list.innerHTML = groups.map(Render.syllabusAnchor).join('');
    el('syllabusMeta').innerHTML = '<strong>' + groups.length + '</strong> anchor-code groups' +
      (state.syllabusGeneratedAt ? ' · built ' + Render.esc(state.syllabusGeneratedAt.slice(0, 10)) : '') + '.';
  }

  function loadPracticeNotes() {
    renderAnswerLab();
    if (state.practiceLoading || !state.examSummaries.length) return;
    var missing = state.examSummaries.filter(function (note) { return !state.examDetails[note.sourceId]; });
    if (!missing.length) return;
    state.practiceLoading = true;
    Promise.all(missing.map(function (note) {
      return loadExamDetail(note.sourceId).catch(function () { return null; });
    })).then(function () {
      state.practiceLoading = false;
      renderAnswerLab();
    });
  }

  function renderAnswerLab() {
    var list = el('answerPracticeList');
    var empty = el('answerPracticeState');
    if (!list || !empty) return;
    var practices = [];
    Object.keys(state.examDetails).forEach(function (id) {
      state.examDetails[id].mainsPractice.forEach(function (practice) {
        practices.push({ note: state.examDetails[id], practice: practice });
      });
    });
    empty.hidden = practices.length > 0;
    empty.innerHTML = state.practiceLoading
      ? '<h3>Loading answer scaffolds</h3><p>Opening the published notes without calling a live model.</p>'
      : '<h3>No published practice yet</h3><p>Use the optional lookup below while mapped answer scaffolds are prepared.</p>';
    list.innerHTML = practices.map(function (row) {
      return '<section class="an-practice-note"><p class="an-entry__tags">' +
        '<span class="an-anchor"><span class="an-label">Anchor</span> ' + Render.esc(row.note.anchor) + '</span></p>' +
        Render.answerOutline(row.practice) + '</section>';
    }).join('');
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
      setView('answer');
      renderLookup();
      return;
    }
    if (state.lookupLoading) return;

    setView('answer');
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
    state.queue = Memory ? Memory.buildSession(Store.due()) : Store.due();
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

  function drillsFor(note, mode) {
    if (!Memory) return [];
    if (mode === 'cloze') return Memory.createClozeDrills(note);
    if (mode === 'prelims') return Memory.createPrelimsDrills(note);
    if (mode === 'skeleton') {
      var skeleton = Memory.createSkeletonDrill(note);
      return skeleton ? [skeleton] : [];
    }
    return [];
  }

  function buildDrillQueue(mode) {
    var due = Memory ? Memory.buildSession(Store.due()) : Store.due();
    state.drillQueue = due.map(function (note) {
      var drills = drillsFor(note, mode);
      if (!drills.length) return null;
      return { note: note, drill: drills[(note.stage || 0) % drills.length] };
    }).filter(Boolean);
  }

  function renderDerivedDrill() {
    var body = el('memoryDrillBody');
    var meta = el('memoryDrillMeta');
    buildDrillQueue(state.memoryMode);
    if (!state.drillQueue.length) {
      body.innerHTML = '<div class="an-state"><h3>No matching drill due</h3><p>' +
        (Store.stats().due
          ? 'The due notes do not contain this evidence-safe drill type. Use Due recall instead.'
          : 'Nothing is due today. Derived drills follow the parent schedule rather than creating extra reviews.') +
        '</p></div>';
      meta.textContent = 'Derived from due notes; no separate schedule records.';
      return;
    }
    var entry = state.drillQueue[0];
    meta.innerHTML = '<strong>' + state.drillQueue.length + '</strong> parent notes available for this drill.';
    body.innerHTML = Render.memoryDrill(entry.drill, entry.note, 0, state.drillQueue.length);
  }

  function handleDrillClick(event) {
    var button = event.target.closest('[data-act]');
    if (!button) return;
    var card = button.closest('.an-memory-drill');
    if (!card) return;
    var act = button.getAttribute('data-act');
    if (act === 'drill-reveal') {
      var answer = card.querySelector('[data-drill-answer]');
      answer.hidden = false;
      button.hidden = true;
      button.setAttribute('aria-expanded', 'true');
      card.querySelector('[data-act="drill-pass"]').hidden = false;
      card.querySelector('[data-act="drill-fail"]').hidden = false;
      return;
    }
    if (act === 'drill-pass' || act === 'drill-fail') {
      Store.review(card.getAttribute('data-id'), act === 'drill-pass' ? 'pass' : 'fail');
      renderDerivedDrill();
      renderCounts();
      renderRail();
    }
  }

  function setMemoryMode(mode) {
    var allowed = ['due', 'cloze', 'prelims', 'skeleton', 'notes'];
    state.memoryMode = allowed.indexOf(mode) === -1 ? 'due' : mode;
    document.querySelectorAll('[data-memory-mode]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-memory-mode') === state.memoryMode ? 'true' : 'false');
    });
    el('memoryNotesPanel').hidden = state.memoryMode !== 'notes';
    el('memoryDuePanel').hidden = state.memoryMode !== 'due';
    el('memoryDrillPanel').hidden = ['cloze', 'prelims', 'skeleton'].indexOf(state.memoryMode) === -1;
    if (state.memoryMode === 'notes') renderNotes();
    else if (state.memoryMode === 'due') startQueue();
    else renderDerivedDrill();
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

    ['sourceQuery', 'sourcePublisher', 'sourceDate', 'sourceJurisdiction', 'sourceType', 'sourcePaper'].forEach(function (id) {
      var control = el(id);
      control.addEventListener(id === 'sourceQuery' ? 'input' : 'change', function () {
        sourceFiltersFromControls();
        renderSourceDesk();
      });
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
    el('refreshBrief').addEventListener('click', loadBrief);
    el('lookupBtn').addEventListener('click', doLookup);

    /* Search: filters what is on screen; Enter fetches a fresh note. */
    var search = el('q');
    search.addEventListener('input', function () {
      state.query = search.value.trim().toLowerCase();
      if (state.view === 'source') {
        el('sourceQuery').value = search.value;
        sourceFiltersFromControls();
        renderSourceDesk();
      } else if (state.view === 'memory') renderNotes();
      else if (state.view === 'syllabus') renderSyllabus();
      else if (state.view === 'answer') renderAnswerLab();
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
        el('sourceQuery').value = '';
        sourceFiltersFromControls();
        renderSourceDesk();
        renderBrief();
        renderSyllabus();
        renderAnswerLab();
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

    /* Published topper-note expansion, recall reveal, and evidence-gated save. */
    el('briefEntries').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act]');
      if (!button) return;
      var act = button.getAttribute('data-act');
      var id = button.getAttribute('data-id');
      if (act === 'open-exam') {
        openExamDetail(id);
        return;
      }
      if (act === 'reveal-exam') {
        var target = document.getElementById(button.getAttribute('aria-controls'));
        if (!target) return;
        var opening = target.hidden;
        target.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
        button.textContent = opening ? 'Hide recall' : 'Reveal recall';
        return;
      }
      if (act !== 'save-exam') return;
      var note = state.examDetails[id];
      if (!note || !note.canMemorize) return;
      if (state.mode && state.mode.name === 'LOCK' && button.getAttribute('data-lock-confirmed') !== 'true') {
        button.setAttribute('data-lock-confirmed', 'true');
        button.textContent = 'Save anyway';
        status('LOCK mode: retrieve what you already hold. Save only if this closes a known gap.', 'error');
        return;
      }
      var result = Store.add({
        title: note.title,
        anchor: note.anchor,
        codes: note.codes,
        sourceId: note.sourceId,
        what: note.staticDefinition,
        why: note.whyInNews,
        whyInNews: note.whyInNews,
        debate: (note.argumentsFor[0] || '') + (note.argumentsAgainst[0] ? ' / ' + note.argumentsAgainst[0] : ''),
        use: note.use,
        prelimsFact: note.officialFacts[0] ? note.officialFacts[0].text : '',
        sourceUrl: note.sourceUrl,
        sourceName: note.publisherName,
        verified: note.canMemorize,
        score: note.priority,
        band: note.priority >= 75 ? 'core' : (note.priority >= 50 ? 'strong' : 'thin'),
        origin: 'publication',
        recallPayload: {
          officialFacts: note.officialFacts,
          argumentsFor: note.argumentsFor,
          argumentsAgainst: note.argumentsAgainst,
          prelimsTraps: note.prelimsTraps,
          mainsPractice: note.mainsPractice,
          use: note.use,
        },
      });
      button.disabled = true;
      button.textContent = result === 'duplicate' ? 'Already saved' : 'Saved · due tomorrow';
      renderNotes();
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
    el('memoryDrillBody').addEventListener('click', handleDrillClick);
    document.querySelectorAll('[data-memory-mode]').forEach(function (button) {
      button.addEventListener('click', function () {
        setMemoryMode(button.getAttribute('data-memory-mode'));
      });
    });

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
    loadSourceIndex();
    loadBrief();
    loadSyllabus();
    if (state.mode && state.mode.name === 'LOCK') setView('memory');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
