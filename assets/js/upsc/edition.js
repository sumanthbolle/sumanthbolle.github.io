/* UPSC Today — twice-daily edition desk and note reader.
 *
 * Loads data/upsc/editions/index.json, shows today's AM/PM editions with a
 * coverage counter, quick facts, revision cards and missed editions, and
 * opens notes in a reader at ?view=brief&note=<slug>. When no edition index
 * exists the desk stays hidden and the page is left exactly as it was.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.UpscEdition = api;
    if (typeof document !== 'undefined' && document.getElementById) {
      var start = function () { api.mount(); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var BASE = 'data/upsc/editions/';
  var MISSED_DAYS = 7;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SLOT_DUE = { am: '06:30', pm: '18:30' };
  var SLOT_LATE = { am: '07:00', pm: '19:00' };

  function dep(name, file) {
    if (root && root[name]) return root[name];
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { return require(file); } catch (error) { return null; }
    }
    return null;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function clip(value, max) {
    var s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

  function istShift(now) { return new Date((now instanceof Date ? now.getTime() : Date.now()) + 330 * 60000); }

  function istClock(now) { return istShift(now).toISOString().slice(11, 16); }

  function istClockFromIso(iso) {
    var t = Date.parse(iso);
    return isNaN(t) ? '' : istClock(new Date(t));
  }

  function dateLabel(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] : '';
  }

  function addDays(iso, days) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function noteFromUrl(href) {
    var url;
    try { url = new URL(href); } catch (error) { return ''; }
    var view = url.searchParams.get('view');
    if (view && view !== 'brief') return '';
    if (url.searchParams.has('article')) return '';
    return clip(url.searchParams.get('note'), 160);
  }

  function noteHref(slug) {
    return '?view=brief&note=' + encodeURIComponent(String(slug || ''));
  }

  function validEntry(row) {
    return isObject(row) && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) && (row.slot === 'am' || row.slot === 'pm') &&
      typeof row.path === 'string' && /^[\w\/.-]+\.json$/.test(row.path) && row.path.indexOf('..') === -1 &&
      row.status !== 'delayed';
  }

  function slotOrder(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.slot === b.slot ? 0 : (a.slot === 'am' ? -1 : 1);
  }

  // Which index entries to show today, and which to scan for missed notes.
  function pickEditions(index, todayISO) {
    var rows = (isObject(index) && Array.isArray(index.editions) ? index.editions : []).filter(validEntry);
    var today = rows.filter(function (row) { return row.date === todayISO; }).sort(slotOrder);
    var shownDate = todayISO;
    var fallback = false;
    if (!today.length) {
      var past = rows.filter(function (row) { return row.date < todayISO; }).map(function (row) { return row.date; }).sort();
      if (past.length) {
        shownDate = past[past.length - 1];
        today = rows.filter(function (row) { return row.date === shownDate; }).sort(slotOrder);
        fallback = true;
      }
    }
    var from = addDays(todayISO, -MISSED_DAYS);
    var shownIds = today.map(function (row) { return row.id; });
    var recent = rows.filter(function (row) {
      return row.date >= from && row.date < todayISO && shownIds.indexOf(row.id) === -1;
    }).sort(slotOrder);
    return { today: today, recent: recent, shownDate: shownDate, fallback: fallback };
  }

  function uniqueIds(editions, key) {
    var out = [];
    editions.forEach(function (edition) {
      (Array.isArray(edition[key]) ? edition[key] : []).forEach(function (id) {
        if (typeof id === 'string' && edition.notes && isObject(edition.notes[id]) && out.indexOf(id) === -1) out.push(id);
      });
    });
    return out;
  }

  function createDesk(options) {
    var opts = options || {};
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    var win = opts.win || (typeof window !== 'undefined' ? window : null);
    var fetchFn = opts.fetch || (win && win.fetch ? win.fetch.bind(win) : null);
    var Render = opts.Render || dep('UpscAnswerRender', './answer-render.js');
    var Progress = opts.Progress || dep('UpscEditionProgress', './edition-progress.js');
    var now = opts.now || function () { return new Date(); };
    var base = opts.base || BASE;
    var storage = opts.storage !== undefined ? opts.storage : (function () {
      try { return win && win.localStorage; } catch (error) { return null; }
    })();
    var deskEl = doc && doc.getElementById('editionDesk');
    var readerEl = doc && doc.getElementById('editionReader');
    var viewEl = doc && doc.getElementById('view-brief');

    var state = {
      loaded: false, reading: false, pick: null, today: [], recent: [], notes: {}, noteEdition: {},
      openId: '', revealed: '', reached: {}, mcq: {}, savedScroll: 0, syncMessage: '',
      background: Promise.resolve()
    };
    var progress = Progress ? Progress.create(storage, Progress.istDate(now())) : null;

    function getJson(path) {
      return fetchFn(base + path, { cache: 'no-cache' }).then(function (response) {
        if (!response || !response.ok) throw new Error('HTTP ' + (response && response.status));
        return response.json();
      });
    }

    function loadEdition(row) {
      return getJson(row.path).then(function (edition) {
        if (!isObject(edition) || !isObject(edition.notes)) return null;
        edition.id = edition.id || row.id;
        edition.date = edition.date || row.date;
        edition.slot = edition.slot === 'pm' || edition.slot === 'am' ? edition.slot : row.slot;
        Object.keys(edition.notes).forEach(function (id) {
          var note = edition.notes[id];
          if (!isObject(note)) { delete edition.notes[id]; return; }
          note.id = typeof note.id === 'string' && note.id ? note.id : id;
          if (!state.notes[note.id]) {
            state.notes[note.id] = note;
            state.noteEdition[note.id] = edition;
          }
        });
        return edition;
      }).catch(function () { return null; });
    }

    function load() {
      if (!deskEl || !fetchFn || !Render || !progress) return Promise.resolve(false);
      var todayISO = Progress.istDate(now());
      return getJson('index.json').then(function (index) {
        var pick = pickEditions(index, todayISO);
        if (!pick.today.length) return false;
        state.pick = pick;
        return Promise.all(pick.today.map(loadEdition)).then(function (editions) {
          state.today = editions.filter(Boolean);
          if (!state.today.length) return false;
          state.loaded = true;
          render();
          route();
          bindOnce();
          state.background = Promise.all(pick.recent.map(loadEdition)).then(function (recent) {
            state.recent = recent.filter(Boolean);
            render();
            if (state.openId === '' && noteFromUrl(win.location.href)) route();
          });
          return true;
        });
      }).catch(function () { return false; });
    }

    /* ── desk ── */

    function counterHtml(c) {
      var line = 'Prelims ' + c.prelims[0] + '/' + c.prelims[1] + ' · Mains ' + c.mains[0] + '/' + c.mains[1] + ' · Revise ' + c.revise;
      return '<div class="ue-counter" id="ueCounter" data-complete="' + (c.complete ? 'true' : 'false') + '">' +
        '<p class="ue-counter__text">' + (c.complete ? '<strong class="ue-counter__done">Today covered</strong><span aria-hidden="true"> · </span>' : '') + esc(line) + '</p>' +
        '<div class="ue-progress" role="progressbar" aria-label="Today’s coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + c.percent + '">' +
        '<span class="ue-progress__bar" style="width:' + c.percent + '%"></span></div></div>';
    }

    function slotPills() {
      var byslot = {};
      state.today.forEach(function (e) { byslot[e.slot] = e; });
      return '<p class="ue-pills">' + ['am', 'pm'].map(function (slot) {
        var e = byslot[slot];
        var name = slot.toUpperCase();
        if (e) {
          var time = istClockFromIso(e.closedAt);
          var partial = e.status === 'partial';
          return '<span class="ue-pill ue-pill--' + (partial ? 'partial' : 'done') + '">' + name + (partial ? ' · partial' : ' ✓') + (time ? ' ' + esc(time) : '') + '</span>';
        }
        return '<span class="ue-pill">' + name + ' · by ' + SLOT_DUE[slot] + '</span>';
      }).join('') + '</p>';
    }

    function delayNotice() {
      var clock = istClock(now());
      var pick = state.pick;
      if (pick.fallback) {
        var late = clock >= SLOT_LATE.am;
        return '<p class="ue-notice" role="status">' + (late
          ? 'Today’s AM edition is late. Showing the ' + esc(dateLabel(pick.shownDate)) + ' edition until it closes.'
          : 'Today’s AM edition closes by 06:30 IST. Showing the ' + esc(dateLabel(pick.shownDate)) + ' edition for now.') + '</p>';
      }
      var hasPm = state.today.some(function (e) { return e.slot === 'pm'; });
      if (!hasPm && clock >= SLOT_LATE.pm) return '<p class="ue-notice" role="status">The PM edition is late. It will appear here when it closes.</p>';
      return '';
    }

    function tagline(note) {
      var bits = (Array.isArray(note.codes) ? note.codes : []).slice(0, 2).map(function (c) { return '<span class="ue-code">' + esc(clip(c, 12)) + '</span>'; });
      if (note.subject) bits.push('<span>' + esc(clip(note.subject, 40)) + '</span>');
      if (typeof note.readTime === 'number' && note.readTime > 0) bits.push('<span>' + Math.round(note.readTime) + ' min</span>');
      return bits.length ? '<p class="ue-tagline">' + bits.join('<span class="ue-dot" aria-hidden="true"> · </span>') + '</p>' : '';
    }

    function noteCard(id) {
      var note = state.notes[id];
      if (!note) return '';
      var done = progress.isDone(id);
      return '<li class="ue-card" data-done="' + done + '"><a class="ue-card__link" href="' + esc(noteHref(note.slug || id)) + '" data-ue-open="' + esc(id) + '">' +
        tagline(note) + '<h4 class="ue-card__title">' + esc(clip(note.title, 200)) + '</h4>' +
        (note.oneLine ? '<p class="ue-card__line">' + esc(clip(note.oneLine, 280)) + '</p>' : '') + '</a>' +
        '<span class="ue-card__state">' + (done ? '<span aria-hidden="true">✓ </span>Done' : 'To read') + '</span></li>';
    }

    function sectionBlock(id, title, inner, extraClass) {
      return '<section class="ue-block' + (extraClass ? ' ' + extraClass : '') + '" aria-labelledby="' + id + '"><h3 class="ue-block__title" id="' + id + '">' + title + '</h3>' + inner + '</section>';
    }

    function glimpseHtml() {
      var rows = [];
      state.today.forEach(function (e) {
        (Array.isArray(e.glimpse) ? e.glimpse : []).forEach(function (g) {
          if (!isObject(g) || !clip(g.line)) return;
          var note = state.notes[g.noteId];
          var line = (g.code ? '<span class="ue-code">' + esc(clip(g.code, 12)) + '</span> ' : '') + esc(clip(g.line, 240));
          rows.push('<li>' + (note
            ? '<a href="' + esc(noteHref(note.slug || note.id)) + '" data-ue-open="' + esc(note.id) + '">' + line + '</a>' + (progress.isDone(note.id) ? ' <span class="ue-tick" aria-label="done">✓</span>' : '')
            : line) + '</li>');
        });
      });
      return rows.length ? sectionBlock('ueGlimpse', 'Glimpse', '<ol class="ue-glimpse">' + rows.join('') + '</ol>', 'ue-block--glimpse') : '';
    }

    function factsHtml() {
      var rows = [];
      var seen = {};
      state.today.forEach(function (e) {
        (Array.isArray(e.quickFacts) ? e.quickFacts : []).forEach(function (f) {
          if (!isObject(f) || typeof f.id !== 'string' || seen[f.id] || !clip(f.fact)) return;
          seen[f.id] = true;
          var ticked = progress.isFactTicked(f.id);
          rows.push('<li class="ue-fact" data-done="' + ticked + '"><label class="ue-fact__label"><input type="checkbox" data-ue-fact="' + esc(f.id) + '"' + (ticked ? ' checked' : '') + '>' +
            '<span>' + (f.code ? '<span class="ue-code">' + esc(clip(f.code, 12)) + '</span> ' : '') + esc(clip(f.fact, 400)) + '</span></label>' +
            (isObject(f.source) ? Render.sourceChip(f.source, 0) : '') + '</li>');
        });
      });
      return rows.length ? sectionBlock('ueFacts', 'Quick facts', '<ul class="ue-facts">' + rows.join('') + '</ul>') : '';
    }

    function reviseHtml() {
      var due = progress.dueCards();
      if (!due.length) return sectionBlock('ueRevise', 'Revise today', '<p class="ue-meta">Nothing due. Finished notes come back here after 1, 3, 7, 21 and 60 days.</p>', 'ue-revise');
      var card = due[0];
      var shown = state.revealed === card.id;
      var inner = '<div class="ue-flash" data-card="' + esc(card.id) + '">' +
        '<p class="ue-flash__front">' + esc(card.front) + '</p>' +
        (shown
          ? '<p class="ue-flash__back">' + esc(card.back) + '</p><div class="ue-flash__grade">' +
            '<button type="button" class="ue-btn" data-ue-grade="1">Remembered</button>' +
            '<button type="button" class="ue-btn ue-btn--quiet" data-ue-grade="0">Forgot</button></div>'
          : '<button type="button" class="ue-btn" data-ue-reveal>Show answer</button>') +
        '</div>' + (due.length > 1 ? '<p class="ue-meta">' + (due.length - 1) + ' more after this.</p>' : '');
      return sectionBlock('ueRevise', 'Revise today <span class="ue-count">' + due.length + '</span>', inner, 'ue-revise');
    }

    function missedHtml() {
      var rows = progress.missed(state.recent);
      if (!rows.length) return '';
      var total = 0;
      var groups = rows.map(function (row) {
        var edition = state.recent.filter(function (e) { return e.id === row.editionId; })[0];
        if (!edition) return '';
        var ids = uniqueIds([edition], 'prelims').concat(uniqueIds([edition], 'mains')).filter(function (id, i, all) {
          return all.indexOf(id) === i && !progress.isDone(id);
        });
        total += ids.length;
        return '<li><p class="ue-meta">' + esc(dateLabel(row.date)) + ' · ' + row.slot.toUpperCase() + '</p><ul class="ue-missed__notes">' + ids.map(function (id) {
          var note = state.notes[id] && state.noteEdition[id] === edition ? state.notes[id] : edition.notes[id];
          return '<li><a href="' + esc(noteHref(note.slug || id)) + '" data-ue-open="' + esc(id) + '">' + esc(clip(note.title, 200)) + '</a></li>';
        }).join('') + '</ul></li>';
      }).join('');
      if (!total) return '';
      return '<details class="ue-missed"><summary>Missed in the last 7 days · ' + total + ' note' + (total === 1 ? '' : 's') + '</summary><ol class="ue-missed__list">' + groups + '</ol></details>';
    }

    function heldHtml() {
      var held = 0;
      state.today.forEach(function (e) { held += Array.isArray(e.held) ? e.held.length : 0; });
      return held ? '<p class="ue-meta ue-held">' + held + ' topic' + (held === 1 ? '' : 's') + ' held back because the official evidence could not be checked.</p>' : '';
    }

    function syncHtml() {
      return '<details class="ue-sync"><summary>Move progress to another device</summary>' +
        '<p class="ue-meta">Progress stays in this browser. Copy it here and paste it on the other device.</p>' +
        '<label class="sr-only" for="ueSyncText">Progress data</label>' +
        '<textarea id="ueSyncText" rows="3" spellcheck="false"></textarea>' +
        '<p class="ue-sync__actions"><button type="button" class="ue-btn" data-ue-export>Copy progress</button>' +
        '<button type="button" class="ue-btn ue-btn--quiet" data-ue-import>Import</button></p>' +
        '<p class="ue-meta" id="ueSyncStatus" role="status">' + esc(state.syncMessage) + '</p></details>';
    }

    function render() {
      if (!state.loaded || !deskEl) return;
      var c = progress.counter(state.today);
      var prelims = uniqueIds(state.today, 'prelims');
      var mains = uniqueIds(state.today, 'mains');
      var date = state.pick.fallback ? state.pick.shownDate : Progress.istDate(now());
      var collapsed = deskEl.querySelector && deskEl.querySelector('.ue-counter.is-collapsed');
      var openDetails = {};
      ['ue-missed', 'ue-sync'].forEach(function (cls) {
        var node = deskEl.querySelector && deskEl.querySelector('details.' + cls);
        openDetails[cls] = !!(node && node.open);
      });
      var syncText = deskEl.querySelector && deskEl.querySelector('#ueSyncText');
      var syncValue = syncText ? syncText.value : '';
      deskEl.innerHTML = counterHtml(c) +
        '<header class="ue-desk__head"><p class="ue-kicker">Edition · ' + esc(dateLabel(date)) + '</p>' +
        '<h2 id="editionTitle">' + (c.complete ? 'Today covered' : 'What to cover today') + '</h2>' + slotPills() + delayNotice() + '</header>' +
        (c.complete ? '<p class="ue-covered">Every note is read, every fact ticked and nothing is due. Come back for the next edition.</p>' : '') +
        glimpseHtml() +
        (prelims.length ? sectionBlock('uePrelims', 'Prelims', '<ul class="ue-cards">' + prelims.map(noteCard).join('') + '</ul>') : '') +
        (mains.length ? sectionBlock('ueMains', 'Mains', '<ul class="ue-cards">' + mains.map(noteCard).join('') + '</ul>') : '') +
        factsHtml() + reviseHtml() + missedHtml() +
        '<footer class="ue-desk__foot">' + heldHtml() + syncHtml() + '</footer>';
      deskEl.hidden = state.reading;
      if (deskEl.querySelector) {
        if (collapsed) { var counter = deskEl.querySelector('.ue-counter'); if (counter) counter.classList.add('is-collapsed'); }
        Object.keys(openDetails).forEach(function (cls) {
          var node = deskEl.querySelector('details.' + cls);
          if (node && openDetails[cls]) node.open = true;
        });
        var text = deskEl.querySelector('#ueSyncText');
        if (text && syncValue) text.value = syncValue;
      }
    }

    /* ── reader ── */

    function findNote(slug) {
      if (!slug) return null;
      if (state.notes[slug]) return state.notes[slug];
      var ids = Object.keys(state.notes);
      for (var i = 0; i < ids.length; i++) if (state.notes[ids[i]].slug === slug) return state.notes[ids[i]];
      return null;
    }

    function readingOrder() {
      var ids = uniqueIds(state.today, 'prelims').concat(uniqueIds(state.today, 'mains'));
      return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
    }

    function nextNote(id) {
      var order = readingOrder();
      var start = order.indexOf(id);
      for (var step = 1; step <= order.length; step++) {
        var candidate = order[(start + step + order.length) % order.length];
        if (candidate !== id && !progress.isDone(candidate)) return state.notes[candidate];
      }
      return null;
    }

    function doneBar(note) {
      var done = progress.isDone(note.id);
      var next = nextNote(note.id);
      return '<div class="ue-donebar">' +
        (done
          ? '<p class="ue-donebar__state" role="status"><span aria-hidden="true">✓ </span>Done. Revision cards are scheduled.</p>'
          : '<button type="button" class="ue-btn" data-ue-done>Mark done</button>') +
        (next
          ? '<a class="ue-next" href="' + esc(noteHref(next.slug || next.id)) + '" data-ue-open="' + esc(next.id) + '"><span>Next note</span><strong>' + esc(clip(next.title, 160)) + '</strong></a>'
          : '<a class="ue-next" href="?view=brief" data-ue-back><span>Next</span><strong>Back to today’s desk</strong></a>') +
        '</div>';
    }

    function readerHtml(note) {
      var edition = state.noteEdition[note.id];
      var meta = edition ? dateLabel(edition.date) + ' · ' + String(edition.slot || '').toUpperCase() + ' edition' : '';
      return '<nav class="ue-reader__bar" aria-label="Note"><a class="ue-back" href="?view=brief" data-ue-back><span aria-hidden="true">← </span>Today</a>' +
        (meta ? '<span class="ue-reader__meta">' + esc(meta) + '</span>' : '') + '</nav>' +
        Render.renderNote(note) + doneBar(note);
    }

    function setReading(on) {
      if (viewEl) viewEl.toggleAttribute('data-ue-reading', on);
      if (doc && doc.body) doc.body.classList.toggle('ue-reading', on);
      state.reading = on;
      if (readerEl) readerEl.hidden = !on;
      if (deskEl && state.loaded) deskEl.hidden = on;
    }

    function showReader(slug) {
      var note = findNote(slug);
      state.openId = note ? note.id : '';
      readerEl.innerHTML = note ? readerHtml(note)
        : '<nav class="ue-reader__bar"><a class="ue-back" href="?view=brief" data-ue-back><span aria-hidden="true">← </span>Today</a></nav>' +
          '<p class="ue-notice">This note is not in the last 7 days of editions. It may have been replaced by a newer edition.</p>';
      setReading(true);
      if (doc && note) doc.title = clip(note.title, 120) + ' — UPSC Today';
      observeEnd();
      dispatch('upsc:chromechange');
    }

    function route() {
      if (!state.loaded || !readerEl || !win) return;
      var slug = noteFromUrl(win.location.href);
      if (slug) {
        showReader(slug);
      } else if (state.reading) {
        state.openId = '';
        readerEl.innerHTML = '';
        setReading(false);
        if (doc) doc.title = 'UPSC Today';
        render();
        dispatch('upsc:chromechange');
      }
    }

    function openNote(id, push) {
      var note = findNote(id);
      if (!note || !win) return false;
      if (!state.openId) state.savedScroll = win.scrollY || 0;
      if (push !== false && win.history && win.history.pushState) {
        var url = new URL(win.location.href);
        url.searchParams.delete('article');
        url.searchParams.set('view', 'brief');
        url.searchParams.set('note', note.slug || note.id);
        url.hash = '';
        win.history.pushState({ view: 'brief', note: note.id }, '', url.pathname + url.search);
      }
      showReader(note.slug || note.id);
      if (readerEl.querySelector) {
        var title = readerEl.querySelector('#ueNoteTitle');
        if (title && title.focus) title.focus({ preventScroll: true });
      }
      if (win.scrollTo) win.scrollTo(0, 0);
      return true;
    }

    function closeNote(push) {
      if (!win) return;
      if (push !== false && win.history && win.history.pushState) {
        var url = new URL(win.location.href);
        url.searchParams.delete('note');
        url.searchParams.delete('view');
        win.history.pushState({ view: 'brief' }, '', url.pathname + url.search);
      }
      var restore = state.savedScroll;
      route();
      if (win.scrollTo) win.scrollTo(0, restore || 0);
    }

    function dispatch(name) {
      try {
        if (doc && doc.dispatchEvent && typeof Event === 'function') doc.dispatchEvent(new Event(name));
      } catch (error) { /* optional chrome hooks */ }
    }

    /* ── progress actions ── */

    function maybeDone(id) {
      var note = state.notes[id];
      if (!note || progress.isDone(id)) return;
      var hasNumbers = Array.isArray(note.keyNumbers) && note.keyNumbers.length > 0;
      var hasMcq = !!(note.practice && note.practice.mcq && Array.isArray(note.practice.mcq.options));
      if (!hasNumbers && !hasMcq) return;
      var endOk = !hasNumbers || state.reached[id];
      var mcqOk = !hasMcq || Object.prototype.hasOwnProperty.call(state.mcq, id);
      if (endOk && mcqOk) markDone(id, hasMcq ? state.mcq[id] : null);
    }

    function reachedEnd(id) { state.reached[id] = true; maybeDone(id); }

    function answeredMcq(id, correct) { state.mcq[id] = !!correct; maybeDone(id); }

    function markDone(id, mcqCorrect) {
      var note = state.notes[id];
      if (!note) return false;
      progress.markDone(note, typeof mcqCorrect === 'boolean' ? mcqCorrect : null);
      render();
      if (state.openId === id && readerEl && readerEl.querySelector) {
        var bar = readerEl.querySelector('.ue-donebar');
        if (bar) {
          var wrap = doc.createElement('div');
          wrap.innerHTML = doneBar(note);
          bar.parentNode.replaceChild(wrap.firstChild, bar);
        }
      }
      return true;
    }

    function tickFact(id, on) {
      progress.tickFact(id, on !== false);
      render();
    }

    function grade(remembered) {
      var due = progress.dueCards();
      if (!due.length) return;
      progress.gradeCard(due[0].id, remembered);
      state.revealed = '';
      render();
      var next = deskEl.querySelector && deskEl.querySelector('.ue-revise [data-ue-reveal], .ue-revise .ue-block__title');
      if (next && next.focus) next.focus({ preventScroll: true });
    }

    /* ── browser wiring ── */

    var observer = null;
    function observeEnd() {
      if (opts.observe === false || !win || !readerEl.querySelector || !state.openId) return;
      if (observer) observer.disconnect();
      var sentinel = readerEl.querySelector('#ue-keynumbers-end');
      if (!sentinel || typeof win.IntersectionObserver !== 'function') return;
      var id = state.openId;
      observer = new win.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { reachedEnd(id); observer.disconnect(); }
        });
      });
      observer.observe(sentinel);
    }

    function checkMcq(button) {
      var box = button.closest('.ue-mcq');
      if (!box) return;
      var answer = Number(box.getAttribute('data-answer'));
      var picked = box.querySelector('input:checked');
      var result = box.querySelector('.ue-mcq__result');
      var verdict = box.querySelector('.ue-mcq__verdict');
      if (!picked) { if (result && verdict) { result.hidden = false; verdict.textContent = 'Pick an option first.'; } return; }
      var correct = Number(picked.value) === answer;
      Array.prototype.forEach.call(box.querySelectorAll('.ue-mcq__opt'), function (label) {
        var input = label.querySelector('input');
        label.classList.toggle('is-correct', Number(input.value) === answer);
        label.classList.toggle('is-wrong', input === picked && !correct);
        input.disabled = true;
      });
      button.disabled = true;
      if (result) result.hidden = false;
      if (verdict) verdict.innerHTML = '<strong>' + (correct ? 'Correct.' : 'Not quite.') + '</strong> The answer is (' + String.fromCharCode(97 + answer) + ').';
      if (state.openId) answeredMcq(state.openId, correct);
    }

    function copyText(text) {
      try {
        if (win.navigator && win.navigator.clipboard) return win.navigator.clipboard.writeText(text);
      } catch (error) { /* fall through */ }
      return Promise.reject(new Error('no clipboard'));
    }

    function onClick(event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var open = target.closest('[data-ue-open]');
      if (open && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button !== 1) {
        event.preventDefault();
        openNote(open.getAttribute('data-ue-open'), true);
        return;
      }
      if (target.closest('[data-ue-back]') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        closeNote(true);
        return;
      }
      if (target.closest('[data-ue-done]')) { if (state.openId) markDone(state.openId, state.mcq[state.openId]); return; }
      var check = target.closest('[data-ue-check]');
      if (check) { checkMcq(check); return; }
      if (target.closest('[data-ue-reveal]')) {
        var due = progress.dueCards();
        state.revealed = due.length ? due[0].id : '';
        render();
        var gradeBtn = deskEl.querySelector('[data-ue-grade]');
        if (gradeBtn) gradeBtn.focus({ preventScroll: true });
        return;
      }
      var gradeEl = target.closest('[data-ue-grade]');
      if (gradeEl) { grade(gradeEl.getAttribute('data-ue-grade') === '1'); return; }
      if (target.closest('[data-ue-export]')) {
        var data = progress.exportJSON();
        var area = deskEl.querySelector('#ueSyncText');
        if (area) { area.value = data; area.select && area.select(); }
        copyText(data).then(function () { setSync('Copied. Paste it into the same box on your other device.'); },
          function () { setSync('Select the text above and copy it.'); });
        return;
      }
      if (target.closest('[data-ue-import]')) {
        var box = deskEl.querySelector('#ueSyncText');
        var ok = box && progress.importJSON(box.value);
        state.syncMessage = ok ? 'Imported. Your progress is up to date.' : 'That text is not valid progress data.';
        render();
      }
    }

    function setSync(message) {
      state.syncMessage = message;
      var status = deskEl.querySelector('#ueSyncStatus');
      if (status) status.textContent = message;
    }

    var bound = false;
    function bindOnce() {
      if (bound || !win || !deskEl.addEventListener || opts.observe === false) return;
      bound = true;
      deskEl.addEventListener('click', onClick);
      readerEl.addEventListener('click', onClick);
      deskEl.addEventListener('change', function (event) {
        var box = event.target.closest && event.target.closest('[data-ue-fact]');
        if (box) {
          tickFact(box.getAttribute('data-ue-fact'), box.checked);
          var again = deskEl.querySelector('[data-ue-fact="' + String(box.getAttribute('data-ue-fact')).replace(/["\\]/g, '\\$&') + '"]');
          if (again) again.focus({ preventScroll: true });
        }
      });
      win.addEventListener('popstate', route);
      win.addEventListener('upsc:viewchange', route);
      var lastY = win.scrollY || 0;
      var ticking = false;
      win.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        (win.requestAnimationFrame || setTimeout)(function () {
          ticking = false;
          var y = win.scrollY || 0;
          var counter = deskEl.querySelector('.ue-counter');
          if (counter && Math.abs(y - lastY) > 4) {
            counter.classList.toggle('is-collapsed', y > lastY && y > 160);
            lastY = y;
          }
        });
      }, { passive: true });
    }

    return {
      load: load,
      ready: function () { return state.background; },
      render: render,
      route: route,
      openNote: openNote,
      closeNote: closeNote,
      markDone: markDone,
      tickFact: tickFact,
      reachedEnd: reachedEnd,
      answeredMcq: answeredMcq,
      grade: grade,
      progress: function () { return progress; },
      currentNote: function () { return state.openId ? state.notes[state.openId] : null; }
    };
  }

  var mounted = null;
  function mount() {
    if (mounted || typeof document === 'undefined' || !document.getElementById('editionDesk')) return mounted;
    mounted = createDesk({});
    mounted.load();
    return mounted;
  }

  return {
    BASE: BASE,
    istClock: istClock,
    dateLabel: dateLabel,
    noteFromUrl: noteFromUrl,
    noteHref: noteHref,
    pickEditions: pickEditions,
    createDesk: createDesk,
    mount: mount
  };
});
