/* Pattern Atlas — the standing compilation, made filterable and drillable.
 *
 * Reads data/upsc-patterns.json (the anchors) and, when the daily job has run,
 * data/upsc-triggers.json (what is currently live on some of them). Recall
 * state lives in AnchorMastery; anything saved for later goes into the same
 * notes corpus Anchor uses, so the two pages share one set of notes.
 */
;(function () {
  'use strict';

  var PATTERNS_URL = 'data/upsc-patterns.json';
  var TRIGGERS_URL = 'data/upsc-triggers.json';
  var ENDPOINT = (window.SB_UPSC_ENDPOINT || '').replace(/\/$/, '');
  var LIVE_TIMEOUT_MS = 50000;

  var Mastery = window.AnchorMastery;
  var Notes = window.AnchorStore;

  var state = {
    view: 'atlas',
    data: null,
    triggers: {},
    papers: [],
    bands: [],
    verb: '',
    sort: 'frequency',
    query: '',
    open: '',
    live: {},          // anchorId -> { loading, error, note }
    drill: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) {
    return esc(value).replace(/\s+/g, ' ');
  }

  var STATE_LABEL = { cold: 'Not drilled', weak: 'Weak', held: 'Held', secure: 'Secure' };
  var BAND_LABEL = { perennial: 'Perennial', high: 'High', medium: 'Medium', emerging: 'Emerging' };

  /* ─────────────────────────────── loading ─────────────────────────────── */

  function load() {
    fetch(PATTERNS_URL)
      .then(function (response) {
        if (!response.ok) throw new Error('The compilation could not be loaded (' + response.status + ').');
        return response.json();
      })
      .then(function (data) {
        state.data = data;
        el('atlasLoading').hidden = true;
        buildVerbFilter();
        renderMethodology();
        renderHead();
        applyDeepLink();
        render();
      })
      .catch(function (error) {
        el('atlasLoading').hidden = true;
        var node = el('atlasState');
        node.hidden = false;
        node.innerHTML = '<h3>The atlas could not be loaded</h3><p>' + esc(error.message) +
          ' The file is a plain JSON dataset at <a href="' + PATTERNS_URL + '">' + PATTERNS_URL + '</a>.</p>';
      });

    /* The trigger file only exists once the daily refresh has run, so a 404 is
     * a normal state rather than an error. */
    fetch(TRIGGERS_URL)
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (data && data.anchors) {
          state.triggers = data.anchors;
          if (state.data) render();
        }
      })
      .catch(function () { /* no persisted trigger layer yet */ });
  }

  function anchors() {
    return (state.data && state.data.anchors) || [];
  }

  function anchorById(id) {
    var found = null;
    anchors().forEach(function (anchor) { if (anchor.id === id) found = anchor; });
    return found;
  }

  function renderHead() {
    el('headAnchorCount').textContent = anchors().length;
    el('headCompiled').textContent = (state.data && state.data.compiled) || '—';
  }

  function buildVerbFilter() {
    var select = el('verbFilter');
    var used = [];
    anchors().forEach(function (anchor) {
      (anchor.verbs || []).forEach(function (verb) {
        if (used.indexOf(verb) === -1) used.push(verb);
      });
    });
    used.sort();
    used.forEach(function (verb) {
      var option = document.createElement('option');
      option.value = verb;
      option.textContent = verb.charAt(0).toUpperCase() + verb.slice(1);
      select.appendChild(option);
    });
  }

  function renderMethodology() {
    var method = (state.data && state.data.methodology) || {};
    el('methodIntro').textContent = method.whatThisIs || '';
    var blocks = [
      ['Frequency', method.frequencyEst],
      ['Recency gap', method.recencyGapEst],
      ['Question stems', method.stems],
      ['Figures', method.facts],
      ['Making it real', method.howToMakeItReal],
      ['Conflicts', method.conflicts],
    ].filter(function (row) { return row[1]; });

    el('methodGrid').innerHTML = blocks.map(function (row) {
      return '<div><h3>' + esc(row[0]) + '</h3><p>' + esc(row[1]) + '</p></div>';
    }).join('');
  }

  /* ─────────────────────────────── filtering ─────────────────────────────── */

  function matchesQuery(anchor) {
    if (!state.query) return true;
    var haystack = [
      anchor.anchor, anchor.id, anchor.prelims_angle,
      (anchor.aliases || []).join(' '),
      (anchor.codes || []).join(' '),
      (anchor.static_core || []).join(' '),
      (anchor.traps || []).join(' '),
      (anchor.skeleton || []).join(' '),
      (anchor.stems || []).map(function (s) { return s.stem; }).join(' '),
    ].join(' ').toLowerCase();
    return haystack.indexOf(state.query) !== -1;
  }

  function selection() {
    var list = anchors().filter(function (anchor) {
      if (state.papers.length && !(anchor.papers || []).some(function (p) { return state.papers.indexOf(p) !== -1; })) return false;
      if (state.bands.length && state.bands.indexOf(anchor.band) === -1) return false;
      if (state.verb && (anchor.verbs || []).indexOf(state.verb) === -1) return false;
      return matchesQuery(anchor);
    });

    var weight = { weak: 0, cold: 1, held: 2, secure: 3 };
    list.sort(function (a, b) {
      if (state.sort === 'alpha') return a.anchor.localeCompare(b.anchor);
      if (state.sort === 'gap') return b.recency_gap_est - a.recency_gap_est;
      if (state.sort === 'weak') {
        var diff = weight[Mastery.state(a.id)] - weight[Mastery.state(b.id)];
        if (diff !== 0) return diff;
        return b.frequency_est - a.frequency_est;
      }
      return b.frequency_est - a.frequency_est;
    });

    return list;
  }

  /* ─────────────────────────────── rendering ─────────────────────────────── */

  function labelledList(label, items, ordered) {
    if (!items || !items.length) return '';
    var tag = ordered ? 'ol' : 'ul';
    var cls = ordered ? 'an-tests' : 'an-list';
    return '<div class="atlas-group"><span class="an-label">' + esc(label) + '</span>' +
      '<' + tag + ' class="' + cls + '">' +
      items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
      '</' + tag + '></div>';
  }

  function stemsHtml(stems) {
    if (!stems || !stems.length) return '';
    return '<div class="atlas-group atlas-detail__wide"><span class="an-label">Practice stems — write these, do not read them</span>' +
      '<ul class="an-stems">' + stems.map(function (stem) {
        return '<li class="an-stem"><p>' + esc(stem.stem) + '</p><p class="an-stem__meta">' +
          '<span class="an-stem__verb">' + esc(stem.verb) + '</span>' +
          '<span>' + esc(stem.paper) + '</span>' +
          '<span class="an-num">' + esc(stem.marks) + ' marks</span></p></li>';
      }).join('') + '</ul></div>';
  }

  function triggerHtml(anchor) {
    var persisted = state.triggers[anchor.id];
    var live = state.live[anchor.id];
    var parts = [];

    parts.push('<div class="atlas-live"><div class="atlas-live__head">' +
      '<span class="an-label">Current trigger layer</span>' +
      (persisted && persisted.refreshedAt
        ? '<span class="atlas-live__stamp">refreshed ' + esc(String(persisted.refreshedAt).slice(0, 10)) + '</span>'
        : '') +
      '</div>');

    if (persisted && persisted.items && persisted.items.length) {
      parts.push('<ul class="atlas-triggers">' + persisted.items.map(function (item) {
        return '<li class="atlas-trigger">' +
          '<h5>' + esc(item.title) + '</h5>' +
          (item.why ? '<p>' + esc(item.why) + '</p>' : '') +
          (item.use ? '<p><em>' + esc(item.use) + '</em></p>' : '') +
          '<p class="atlas-trigger__meta">' +
            (item.url ? '<a href="' + attr(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.source || 'source') + '</a>' : '') +
            (item.date ? '<span class="an-num">' + esc(item.date) + '</span>' : '') +
            (item.primary ? '<span>primary source</span>' : '<span>confirm against the primary document</span>') +
          '</p></li>';
      }).join('') + '</ul>');
    } else {
      parts.push('<p class="atlas-live__intro">No stored trigger layer for this anchor yet. Pull what is live on it now — you get points, the anchors an examiner rewards, and sources.</p>');
    }

    if (live && live.loading) {
      parts.push('<p class="atlas-live__intro">Retrieving…</p>');
    } else if (live && live.error) {
      parts.push('<p class="atlas-live__intro">' + esc(live.error) + '</p>');
    } else if (live && live.note) {
      parts.push(liveNoteHtml(anchor, live.note));
    }

    if (!live || (!live.loading && !live.note)) {
      parts.push('<div class="atlas-actions" style="border-top:0;padding-top:12px;margin-top:12px">' +
        '<button type="button" class="btn btn-sm" data-act="live" data-id="' + attr(anchor.id) + '">Pull what is live</button>' +
        '</div>');
    }

    parts.push('</div>');
    return parts.join('');
  }

  function liveNoteHtml(anchor, note) {
    var parts = ['<div style="margin-top:14px">'];

    if (note.points && note.points.length) {
      parts.push('<span class="an-label">Live points</span><ol class="an-points">' +
        note.points.map(function (point) { return '<li>' + esc(point) + '</li>'; }).join('') + '</ol>');
    }

    if (note.valueAdds && note.valueAdds.length) {
      parts.push('<ul class="an-valueadds">' + note.valueAdds.map(function (row) {
        return '<li><span class="an-label">' + esc(row.type) + '</span>' +
          '<div><strong>' + esc(row.item) + '</strong><p>' + esc(row.note) + '</p></div></li>';
      }).join('') + '</ul>');
    }

    if (note.sources && note.sources.length) {
      parts.push('<ul class="an-sources">' + note.sources.map(function (row) {
        return '<li><a href="' + attr(row.url) + '" target="_blank" rel="noopener noreferrer">' + esc(row.title) + '</a> ' +
          '<span>' + esc(row.source) + (row.primary ? ' · primary' : '') + '</span></li>';
      }).join('') + '</ul>');
    }

    parts.push('<div class="atlas-actions">' +
      '<button type="button" class="btn btn-sm" data-act="save-live" data-id="' + attr(anchor.id) + '">Save to my notes</button>' +
      '<span class="an-treatment" style="margin:0">Verify every figure and name in the source before it enters permanent notes.</span>' +
      '</div>');

    parts.push('</div>');
    return parts.join('');
  }

  function rowHtml(anchor) {
    var recall = Mastery.state(anchor.id);
    var open = state.open === anchor.id;

    var detail =
      '<div class="atlas-detail">' +
        labelledList('Static core', anchor.static_core, false) +
        labelledList('Answer skeleton', anchor.skeleton, true) +
        '<div class="atlas-group"><span class="an-label">Prelims angle</span>' +
          '<p class="atlas-prelims">' + esc(anchor.prelims_angle) + '</p></div>' +
        labelledList('Verify before you memorise', anchor.verify, false) +
        '<div class="atlas-group atlas-detail__wide"><div class="an-trap" style="margin-top:0">' +
          '<span class="an-label">Where marks are lost</span>' +
          '<ul class="an-list" style="margin-top:6px">' +
            (anchor.traps || []).map(function (trap) { return '<li>' + esc(trap) + '</li>'; }).join('') +
          '</ul></div></div>' +
        stemsHtml(anchor.stems) +
        (anchor.linked && anchor.linked.length
          ? '<div class="atlas-group atlas-detail__wide"><span class="an-label">Cross-paper links</span><div class="atlas-linked">' +
              anchor.linked.map(function (id) {
                var target = anchorById(id);
                return target
                  ? '<button type="button" class="atlas-linkbtn" data-act="goto" data-id="' + attr(id) + '">' + esc(target.anchor) + '</button>'
                  : '';
              }).join('') +
            '</div></div>'
          : '') +
      '</div>' +
      triggerHtml(anchor) +
      '<div class="atlas-actions">' +
        '<button type="button" class="btn btn-sm" data-act="drill-one" data-id="' + attr(anchor.id) + '">Drill this anchor</button>' +
        '<a href="upsc.html?topic=' + encodeURIComponent(anchor.anchor) + '">Look it up on Anchor</a>' +
        '<a href="?anchor=' + encodeURIComponent(anchor.id) + '" data-act="permalink">Permalink</a>' +
      '</div>';

    return '<li class="an-entry" id="a-' + attr(anchor.id) + '" data-id="' + attr(anchor.id) + '" data-band="' + attr(anchor.band) + '">' +
      '<div class="an-entry__margin">' +
        '<span class="an-entry__score" title="Editorial recurrence estimate, not a count">' + esc(anchor.frequency_est) + '</span>' +
        '<span class="an-entry__band">' + esc(BAND_LABEL[anchor.band] || anchor.band) + '</span>' +
      '</div>' +
      '<div class="an-entry__body">' +
        '<div class="atlas-row__head">' +
          '<h3>' + esc(anchor.anchor) + '</h3>' +
          '<span class="atlas-pill" data-state="' + recall + '">' + esc(STATE_LABEL[recall]) + '</span>' +
        '</div>' +
        '<p class="an-entry__tags">' +
          (anchor.codes || []).map(function (code) { return '<span class="an-code">' + esc(code) + '</span>'; }).join('') +
          '<span class="atlas-recurrence">' + esc(anchor.recurrence) + '</span>' +
          '<span class="atlas-verbs">' + esc((anchor.verbs || []).join(' · ')) + '</span>' +
        '</p>' +
        '<details class="an-entry__expand"' + (open ? ' open' : '') + ' data-id="' + attr(anchor.id) + '">' +
          '<summary>Pattern</summary>' + detail +
        '</details>' +
      '</div>' +
    '</li>';
  }

  function render() {
    if (!state.data) return;
    var list = selection();
    var listNode = el('atlasList');
    var stateNode = el('atlasState');

    if (!list.length) {
      listNode.innerHTML = '';
      stateNode.hidden = false;
      stateNode.innerHTML = '<h3>Nothing matches</h3><p>Clear the filters or the search box to see the whole compilation.</p>';
    } else {
      stateNode.hidden = true;
      listNode.innerHTML = list.map(rowHtml).join('');
    }

    var total = anchors().length;
    el('atlasMeta').innerHTML = '<strong>' + list.length + '</strong> of ' + total +
      ' anchors · ' + (state.data.provisional ? 'recurrence is an editorial estimate' : 'recurrence from a tagged corpus');
    el('countAnchors').textContent = list.length;
    renderRail();
  }

  function renderRail() {
    var ids = anchors().map(function (anchor) { return anchor.id; });
    var stats = Mastery.stats(ids);
    el('railTotal').textContent = stats.total;
    el('railSecure').textContent = stats.secure;
    el('railHeld').textContent = stats.held;
    el('railWeak').textContent = stats.weak;
    el('railCold').textContent = stats.cold;
    el('railDue').textContent = stats.due;
    el('railWeakStat').setAttribute('data-warn', stats.weak > 0 ? 'true' : 'false');
    el('countDue').textContent = stats.due;
  }

  /* ───────────────────────────── the live layer ───────────────────────────── */

  function pullLive(anchorId) {
    var anchor = anchorById(anchorId);
    if (!anchor) return;

    if (!ENDPOINT) {
      state.live[anchorId] = { error: 'The retrieval endpoint is not configured for this page.' };
      render();
      return;
    }

    state.live[anchorId] = { loading: true };
    state.open = anchorId;
    render();

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, LIVE_TIMEOUT_MS);

    fetch(ENDPOINT + '/upsc/topic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: anchor.anchor, paper: (anchor.papers || [])[0] || 'any' }),
      signal: controller.signal,
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (!payload || !payload.success || !payload.data) {
          throw new Error((payload && payload.error) || 'Nothing usable came back.');
        }
        state.live[anchorId] = { note: payload.data };
      })
      .catch(function (error) {
        state.live[anchorId] = {
          error: error && error.name === 'AbortError'
            ? 'That took too long. Try again in a moment.'
            : (error && error.message) || 'Nothing usable came back.',
        };
      })
      .then(function () {
        window.clearTimeout(timer);
        render();
      });
  }

  function saveLive(anchorId) {
    var anchor = anchorById(anchorId);
    var live = state.live[anchorId];
    if (!anchor || !live || !live.note) return 'error';

    var note = live.note;
    var primary = null;
    (note.sources || []).forEach(function (source) { if (!primary && source.primary) primary = source; });
    var source = primary || (note.sources || [])[0] || null;
    var use = (note.valueAdds || []).length
      ? note.valueAdds[0].item + ' — ' + note.valueAdds[0].note
      : (note.points || [])[0] || '';

    return Notes.add({
      title: anchor.anchor + ' — current trigger',
      anchor: anchor.anchor,
      codes: anchor.codes,
      what: note.oneLiner || '',
      why: (note.points || [])[0] || '',
      debate: (note.debateFor || []).length && (note.debateAgainst || []).length
        ? note.debateFor[0] + ' / ' + note.debateAgainst[0] : '',
      use: use,
      prelimsFact: (note.prelimsFacts || [])[0] || '',
      sourceUrl: source ? source.url : '',
      sourceName: source ? source.source : '',
      verified: !!(source && source.primary),
      origin: 'atlas',
    });
  }

  /* ─────────────────────────────── the drill ─────────────────────────────── */

  function drillPool(scope) {
    var ids;
    if (scope === 'filter') ids = selection().map(function (a) { return a.id; });
    else if (scope === 'weak') ids = anchors().filter(function (a) { return Mastery.state(a.id) === 'weak'; }).map(function (a) { return a.id; });
    else if (scope === 'due') ids = Mastery.dueToday(anchors().map(function (a) { return a.id; }));
    else ids = anchors().map(function (a) { return a.id; });
    return ids;
  }

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function startDrill(forcedIds) {
    var direction = el('drillDirection').value;
    var scope = el('drillScope').value;
    var length = parseInt(el('drillLength').value, 10) || 12;
    var ids = forcedIds && forcedIds.length ? forcedIds : shuffle(drillPool(scope)).slice(0, length);

    if (!ids.length) {
      el('drillBody').innerHTML = '<div class="an-state"><h3>Nothing in that scope</h3>' +
        '<p>' + (scope === 'weak'
          ? 'No weak anchors — nothing has been missed yet. Try “due today” or the current filter.'
          : 'Widen the scope, or clear the filters on the Atlas tab first.') + '</p></div>';
      return;
    }

    state.drill = {
      ids: ids,
      index: 0,
      direction: direction,
      held: 0,
      missed: 0,
      missedIds: [],
      revealed: false,
    };
    setView('drill');
    renderDrill();
  }

  function drillDirectionFor(anchor) {
    var direction = state.drill.direction;
    if (direction === 'mixed') {
      return (anchor.stems || []).length && Math.random() < 0.4 ? 'stem' : 'anchor';
    }
    if (direction === 'stem' && !(anchor.stems || []).length) return 'anchor';
    return direction;
  }

  function renderDrill() {
    var drill = state.drill;
    var body = el('drillBody');
    if (!drill) {
      body.innerHTML = '';
      return;
    }

    el('drillSetup').hidden = drill.index < drill.ids.length;

    if (drill.index >= drill.ids.length) {
      var total = drill.held + drill.missed;
      body.innerHTML = '<div class="an-card">' +
        '<span class="atlas-drill__kicker">Session complete</span>' +
        '<div class="atlas-summary__grid">' +
          '<div><strong>' + total + '</strong><span>Anchors drilled</span></div>' +
          '<div><strong>' + drill.held + '</strong><span>Reconstructed</span></div>' +
          '<div><strong>' + drill.missed + '</strong><span>Reset to day 1</span></div>' +
        '</div>' +
        (drill.missedIds.length
          ? '<p class="an-railnote" style="margin-top:20px">These are now flagged weak. Open the pattern and write the skeleton once before you drill them again.</p>' +
            '<ul class="atlas-weaklist">' + drill.missedIds.map(function (id) {
              var anchor = anchorById(id);
              return anchor ? '<li><button type="button" data-act="goto" data-id="' + attr(id) + '">' + esc(anchor.anchor) + '</button></li>' : '';
            }).join('') + '</ul>'
          : '<p class="an-railnote" style="margin-top:20px">Nothing missed. Move the scope to “everything” and raise the length rather than repeating this set.</p>') +
        '</div>';
      el('drillMeta').textContent = 'Done for now.';
      renderRail();
      return;
    }

    var anchor = anchorById(drill.ids[drill.index]);
    if (!anchor) {
      drill.index += 1;
      renderDrill();
      return;
    }

    var direction = drill.currentDirection || (drill.currentDirection = drillDirectionFor(anchor));
    var stem = (anchor.stems || [])[0];
    var pct = Math.round((drill.index / drill.ids.length) * 100);

    var prompt = direction === 'stem' && stem
      ? '<p class="atlas-drill__prompt atlas-drill__prompt--stem">' + esc(stem.stem) + '</p>'
      : '<p class="atlas-drill__prompt">' + esc(anchor.anchor) + '</p>';

    var ask = direction === 'stem' && stem
      ? 'Name the static anchor this belongs to, the directive verb it uses, and the scope qualifier you would have to respect.'
      : 'Reconstruct the static core, the verbs this anchor attracts, and the trap it sets — out loud, before you reveal.';

    var revealed = direction === 'stem' && stem
      ? '<div><span class="an-label">Anchor</span><p class="atlas-prelims"><strong>' + esc(anchor.anchor) + '</strong> · ' +
          esc((anchor.papers || []).join(', ')) + ' · ' + esc(stem.verb) + '</p></div>' +
        labelledList('Static core', anchor.static_core, false)
      : labelledList('Static core', anchor.static_core, false) +
        '<div><span class="an-label">Verbs it attracts</span><p class="atlas-prelims">' + esc((anchor.verbs || []).join(' · ')) + '</p></div>' +
        labelledList('Where marks are lost', anchor.traps, false);

    body.innerHTML = '<div class="an-card" data-id="' + attr(anchor.id) + '">' +
      '<span class="atlas-drill__kicker">' + (drill.index + 1) + ' of ' + drill.ids.length +
        ' · ' + (direction === 'stem' ? 'stem to anchor' : 'anchor to pattern') + '</span>' +
      prompt +
      '<p class="atlas-drill__meta">' +
        '<span>' + esc((anchor.papers || []).join(' · ')) + '</span>' +
        '<span>' + esc(BAND_LABEL[anchor.band] || anchor.band) + '</span>' +
        '<span class="an-num">recurrence ' + esc(anchor.frequency_est) + '</span>' +
      '</p>' +
      '<p class="atlas-drill__ask">' + esc(ask) + '</p>' +
      '<div class="atlas-drill__reveal" id="drillReveal" hidden>' + revealed + '</div>' +
      '<div class="an-revise__actions">' +
        '<button type="button" class="btn" data-act="reveal">Reveal</button>' +
        '<button type="button" class="btn btn-primary" data-act="held" hidden>Held it</button>' +
        '<button type="button" class="btn" data-act="missed" hidden>Missed it</button>' +
      '</div>' +
      '<div class="atlas-progress" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
    '</div>';

    el('drillMeta').innerHTML = '<strong>' + (drill.ids.length - drill.index) + '</strong> left in this set';
  }

  function gradeDrill(result) {
    var drill = state.drill;
    if (!drill) return;
    var id = drill.ids[drill.index];
    Mastery.record(id, result === 'held' ? 'held' : 'missed');
    if (result === 'held') drill.held += 1;
    else {
      drill.missed += 1;
      if (drill.missedIds.indexOf(id) === -1) drill.missedIds.push(id);
    }
    drill.index += 1;
    drill.currentDirection = null;
    renderDrill();
    renderRail();
  }

  /* ─────────────────────────────── navigation ─────────────────────────────── */

  var VIEWS = ['atlas', 'drill'];

  function setView(name) {
    if (VIEWS.indexOf(name) === -1) return;
    state.view = name;
    VIEWS.forEach(function (view) {
      el('tab-' + view).setAttribute('aria-selected', view === name ? 'true' : 'false');
      el('view-' + view).hidden = view !== name;
    });
  }

  function openAnchor(id) {
    if (!anchorById(id)) return;
    state.open = id;
    /* Clearing filters so a permalink or a cross-link always resolves, even if
     * the anchor sits outside the current selection. */
    if (!selection().some(function (anchor) { return anchor.id === id; })) resetFilters();
    setView('atlas');
    render();
    var node = el('a-' + id);
    if (node) {
      var details = node.querySelector('details');
      if (details) details.open = true;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function applyDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('anchor') || (window.location.hash || '').replace(/^#a-/, '');
    if (id && anchorById(id)) state.open = id;
  }

  function resetFilters() {
    state.papers = [];
    state.bands = [];
    state.verb = '';
    state.query = '';
    el('q').value = '';
    el('verbFilter').value = '';
    document.querySelectorAll('#paperFilter .an-chip, #bandFilter .an-chip').forEach(function (chip) {
      chip.setAttribute('aria-pressed', 'false');
    });
  }

  /* ─────────────────────────────── wiring ─────────────────────────────── */

  function toggleChip(button, bucket, key) {
    var value = button.getAttribute(key);
    var pressed = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    var index = bucket.indexOf(value);
    if (pressed && index !== -1) bucket.splice(index, 1);
    if (!pressed && index === -1) bucket.push(value);
  }

  function init() {
    if (!Mastery || !Notes) return;

    if (window.SBShared) {
      window.SBShared.initNavMenu();
      window.SBShared.initThemeToggle();
    }

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

    document.querySelectorAll('[role="tab"][data-view]').forEach(function (tab) {
      tab.addEventListener('click', function () { setView(tab.getAttribute('data-view')); });
    });

    el('paperFilter').addEventListener('click', function (event) {
      var chip = event.target.closest('.an-chip');
      if (!chip) return;
      toggleChip(chip, state.papers, 'data-paper');
      render();
    });

    el('bandFilter').addEventListener('click', function (event) {
      var chip = event.target.closest('.an-chip');
      if (!chip) return;
      toggleChip(chip, state.bands, 'data-band');
      render();
    });

    el('verbFilter').addEventListener('change', function (event) {
      state.verb = event.target.value;
      render();
    });

    el('sortBy').addEventListener('change', function (event) {
      state.sort = event.target.value;
      render();
    });

    el('resetFilters').addEventListener('click', function () {
      resetFilters();
      render();
    });

    var search = el('q');
    search.addEventListener('input', function () {
      state.query = search.value.trim().toLowerCase();
      render();
    });
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        search.value = '';
        state.query = '';
        render();
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

    /* One delegated handler for the whole list: the rows are re-rendered often
     * and per-row listeners would leak. */
    el('atlasList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act]');
      if (!button) return;
      var act = button.getAttribute('data-act');
      var id = button.getAttribute('data-id');

      if (act === 'permalink') return; // a real link; let it navigate

      event.preventDefault();
      if (act === 'goto') openAnchor(id);
      if (act === 'live') pullLive(id);
      if (act === 'drill-one') startDrill([id]);
      if (act === 'save-live') {
        var result = saveLive(id);
        button.disabled = true;
        button.textContent = result === 'duplicate' ? 'Already in notes' : 'Saved to notes';
      }
    });

    /* Keep the open row in state so a re-render does not collapse it. */
    el('atlasList').addEventListener('toggle', function (event) {
      var details = event.target;
      if (!details || details.tagName !== 'DETAILS') return;
      var id = details.getAttribute('data-id');
      if (details.open) state.open = id;
      else if (state.open === id) state.open = '';
    }, true);

    el('startDrill').addEventListener('click', function () { startDrill(); });

    el('drillBody').addEventListener('click', function (event) {
      var button = event.target.closest('[data-act]');
      if (!button) return;
      var act = button.getAttribute('data-act');

      if (act === 'goto') {
        openAnchor(button.getAttribute('data-id'));
        return;
      }

      var card = button.closest('.an-card');
      if (!card) return;

      if (act === 'reveal') {
        card.querySelector('#drillReveal').hidden = false;
        button.hidden = true;
        card.querySelector('[data-act="held"]').hidden = false;
        card.querySelector('[data-act="missed"]').hidden = false;
        return;
      }

      if (act === 'held' || act === 'missed') gradeDrill(act);
    });

    el('clearMastery').addEventListener('click', function () {
      var stats = Mastery.stats(anchors().map(function (a) { return a.id; }));
      var drilled = stats.total - stats.cold;
      if (!drilled) {
        window.alert('There is no recall record to clear yet.');
        return;
      }
      if (!window.confirm('Delete the recall record for ' + drilled + ' anchors from this browser? This cannot be undone.')) return;
      Mastery.clear();
      state.drill = null;
      renderDrill();
      render();
    });

    window.addEventListener('hashchange', function () {
      var id = (window.location.hash || '').replace(/^#a-/, '');
      if (id && anchorById(id)) openAnchor(id);
    });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
