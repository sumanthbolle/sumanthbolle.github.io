/* Anchor — local state: cycle position, notes, and the retrieval schedule.
 *
 * Everything here is device-local. No account, no sync, no server copy: the
 * aspirant owns the corpus, which is also what makes the export honest.
 *
 * Exposes window.AnchorCycle (mode derivation) and window.AnchorStore (notes).
 */
;(function () {
  'use strict';

  var KEY_POSITION = 'anchor.position';
  var KEY_NOTES = 'anchor.notes';
  var KEY_SCOPE = 'anchor.scope';

  /* Spaced repetition: day 1, 3, 7, 21, 60, then monthly. */
  var INTERVALS = [1, 3, 7, 21, 60];
  var MONTHLY = 30;
  var GRADUATE_STAGE = 3;   // day 21 onwards
  var GRADUATE_STREAK = 2;  // two consecutive clean reconstructions

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    var date = new Date(iso + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function daysBetween(fromISO, toISO) {
    var a = Date.parse(fromISO + 'T00:00:00Z');
    var b = Date.parse(toISO + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ─────────────────────────── cycle position ─────────────────────────── */

  var MODES = {
    BUILD: {
      name: 'BUILD',
      line: 'Static syllabus, PYQ tagging, slow answer writing. If a source is ever going to be added, it is now — after this window, adding costs more than it returns.',
    },
    CONVERGE: {
      name: 'CONVERGE',
      line: 'Test series, current-affairs consolidation, daily answer writing. Stop collecting and start writing; coverage is no longer the binding constraint.',
    },
    COMPRESS: {
      name: 'COMPRESS',
      line: 'Revision cycles shorten, notes shorten, no new material. Use the brief to confirm what you already hold, not to discover more.',
    },
    LOCK: {
      name: 'LOCK',
      line: 'Revision of existing notes, full-length mocks, sleep and logistics. Adding anything new now is net-negative, and this page will not pretend otherwise.',
    },
    BOARD: {
      name: 'BOARD',
      line: 'The board responds to your DAF and to you, not to a syllabus. Read your own DAF, hold positions you can defend under pressure, and stay current on the last year rather than the last decade.',
    },
  };

  function computeCycle(stage, examDate, todayISO) {
    var now = todayISO || today();
    if (!examDate) {
      return { mode: null, days: null, stage: stage, note: 'Add the date of your next paper.' };
    }

    var days = daysBetween(now, examDate);
    if (days === null) {
      return {
        mode: null,
        days: null,
        stage: stage,
        note: 'That date could not be read — pick one from the calendar.',
      };
    }
    if (days < 0) {
      return {
        mode: null,
        days: days,
        stage: stage,
        note: 'That date has passed. Set the next milestone so the mode is right.',
      };
    }

    /* A date input will hand back a four-digit year the browser considers
     * merely out of range, so reject anything too far out to plan from. */
    if (days > 365 * 5) {
      return {
        mode: null,
        days: days,
        stage: stage,
        note: 'That date is further out than any published calendar — check the year.',
      };
    }

    if (stage === 'interview') {
      return { mode: MODES.BOARD, days: days, stage: stage, note: '' };
    }

    var mode;
    if (days < 15) mode = MODES.LOCK;
    else if (days < 60) mode = MODES.COMPRESS;
    else if (days <= 180) mode = MODES.CONVERGE;
    else mode = MODES.BUILD;

    var note = '';
    /* The Mains window is short whatever the calendar says, so base-building
     * is never the right recommendation once Mains is the next paper. */
    if (stage === 'mains' && mode === MODES.BUILD) {
      mode = MODES.CONVERGE;
      note = 'Mains is the next paper, so this stays at converge regardless of the gap — the window between result and Mains is always short.';
    }

    return { mode: mode, days: days, stage: stage, note: note };
  }

  window.AnchorCycle = {
    compute: computeCycle,
    today: today,
    addDays: addDays,
    daysBetween: daysBetween,
    getPosition: function () {
      var saved = read(KEY_POSITION, null);
      return {
        stage: (saved && saved.stage) || 'prelims',
        examDate: (saved && saved.examDate) || '',
      };
    },
    setPosition: function (position) {
      return write(KEY_POSITION, {
        stage: position.stage || 'prelims',
        examDate: position.examDate || '',
      });
    },
  };

  /* ───────────────────────────── notes store ───────────────────────────── */

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  function fingerprint(note) {
    return slug(note.anchor) + '::' + slug(note.title).slice(0, 40);
  }

  var CODE_SHAPE = /^(GS[1-4]\.\d{1,2}|ESSAY\.[AB])$/;

  function normalizeCodes(codes) {
    var raw = Array.isArray(codes) ? codes : String(codes || '').split(',');
    var out = [];
    raw.forEach(function (value) {
      var code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
      if (CODE_SHAPE.test(code) && out.indexOf(code) === -1) out.push(code);
    });
    return out.slice(0, 3);
  }

  function papersFor(codes) {
    var papers = [];
    normalizeCodes(codes).forEach(function (code) {
      var paper = code.split('.')[0];
      if (paper && papers.indexOf(paper) === -1) papers.push(paper);
    });
    return papers;
  }

  function load() {
    var notes = read(KEY_NOTES, []);
    return Array.isArray(notes) ? notes : [];
  }

  function save(notes) {
    return write(KEY_NOTES, notes);
  }

  function dueLabel(note, todayISO) {
    var days = daysBetween(todayISO || today(), note.dueOn);
    if (days === null) return '';
    if (days <= 0) return 'Due now';
    if (days === 1) return 'Due tomorrow';
    return 'Due in ' + days + ' days';
  }

  var Store = {
    list: function () {
      return load();
    },

    get: function (id) {
      var found = null;
      load().forEach(function (note) {
        if (note.id === id) found = note;
      });
      return found;
    },

    /* Returns 'added' | 'duplicate' | 'error' so the UI can say what happened
     * rather than silently doing nothing. */
    add: function (input) {
      var notes = load();
      var codes = normalizeCodes(input.codes);
      var note = {
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: String(input.title || '').slice(0, 160),
        anchor: String(input.anchor || '').slice(0, 60),
        codes: codes,
        papers: papersFor(codes),
        what: String(input.what || '').slice(0, 320),
        why: String(input.why || '').slice(0, 320),
        debate: String(input.debate || '').slice(0, 320),
        use: String(input.use || '').slice(0, 320),
        prelimsFact: String(input.prelimsFact || '').slice(0, 260),
        sourceUrl: String(input.sourceUrl || '').slice(0, 500),
        sourceName: String(input.sourceName || '').slice(0, 80),
        verified: input.verified === true,
        score: Number.isFinite(Number(input.score)) ? Number(input.score) : null,
        band: input.band || '',
        origin: input.origin || 'own',
        createdAt: today(),
        stage: 0,
        streak: 0,
        lateStreak: 0,
        graduated: false,
        dueOn: addDays(today(), INTERVALS[0]),
        reviews: [],
      };

      if (!note.title || !note.anchor) return 'error';

      var print = fingerprint(note);
      var clash = false;
      notes.forEach(function (existing) {
        if (fingerprint(existing) === print) clash = true;
      });
      if (clash) return 'duplicate';

      notes.unshift(note);
      return save(notes) ? 'added' : 'error';
    },

    remove: function (id) {
      var notes = load().filter(function (note) { return note.id !== id; });
      return save(notes);
    },

    /* result: 'pass' reconstructed from the title alone, 'fail' did not. */
    review: function (id, result) {
      var notes = load();
      var changed = false;

      notes.forEach(function (note) {
        if (note.id !== id) return;
        changed = true;
        note.reviews = (note.reviews || []).slice(-9);
        note.reviews.push({ on: today(), result: result });

        if (result === 'pass') {
          note.streak = (note.streak || 0) + 1;
          /* Graduation is two consecutive clean reconstructions from day 21
           * onwards, which walks the whole ladder — day 21, then day 60 — before
           * the item drops to monthly. */
          note.lateStreak = note.stage >= GRADUATE_STAGE ? (note.lateStreak || 0) + 1 : 0;

          if (note.graduated || note.lateStreak >= GRADUATE_STREAK) {
            note.graduated = true;
            note.dueOn = addDays(today(), MONTHLY);
          } else {
            note.stage = Math.min(note.stage + 1, INTERVALS.length - 1);
            note.dueOn = addDays(today(), INTERVALS[note.stage]);
          }
        } else {
          /* A failed reconstruction resets the item, which is the whole point
           * of retrieval practice: the schedule follows recall, not effort. */
          note.stage = 0;
          note.streak = 0;
          note.lateStreak = 0;
          note.graduated = false;
          note.dueOn = addDays(today(), INTERVALS[0]);
        }
      });

      if (changed) save(notes);
      return changed;
    },

    due: function (todayISO) {
      var now = todayISO || today();
      return load()
        .filter(function (note) { return note.dueOn <= now; })
        .sort(function (a, b) { return a.dueOn < b.dueOn ? -1 : 1; });
    },

    stats: function () {
      var notes = load();
      var unverified = notes.filter(function (note) { return !note.verified; }).length;
      return {
        total: notes.length,
        due: Store.due().length,
        unverified: unverified,
        unverifiedPct: notes.length ? Math.round((unverified / notes.length) * 100) : 0,
      };
    },

    intervals: INTERVALS,
    dueLabel: dueLabel,
    normalizeCodes: normalizeCodes,
    papersFor: papersFor,

    getScope: function () {
      var scope = read(KEY_SCOPE, 'daily');
      return scope === 'weekly' ? 'weekly' : 'daily';
    },

    setScope: function (scope) {
      return write(KEY_SCOPE, scope === 'weekly' ? 'weekly' : 'daily');
    },

    clearAll: function () {
      try {
        localStorage.removeItem(KEY_NOTES);
        localStorage.removeItem(KEY_POSITION);
        localStorage.removeItem(KEY_SCOPE);
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Month-end export, in the compressed brief format so it can be pasted
     * straight into a notes file or handed to another assistant. */
    toMarkdown: function () {
      var notes = load();
      if (!notes.length) return '# Anchor notes\n\nNothing saved yet.\n';

      var byAnchor = {};
      notes.forEach(function (note) {
        var key = note.anchor || 'unanchored';
        if (!byAnchor[key]) byAnchor[key] = [];
        byAnchor[key].push(note);
      });

      var stats = Store.stats();
      var lines = [];
      lines.push('# Anchor notes — exported ' + today());
      lines.push('');
      lines.push('**Held:** ' + stats.total + ' · **Due for retrieval:** ' + stats.due +
        ' · **Unverified:** ' + stats.unverified + ' (' + stats.unverifiedPct + '%)');
      lines.push('');
      lines.push('Clustered by static anchor. Any anchor with three or more items is a candidate for one 250-word synthesis — that synthesis, not the individual items, is what you revise later.');
      lines.push('');

      Object.keys(byAnchor).sort().forEach(function (anchor) {
        var group = byAnchor[anchor];
        lines.push('## ' + anchor + ' (' + group.length + ')');
        lines.push('');
        group.forEach(function (note) {
          lines.push('### ' + note.title);
          lines.push('');
          if (note.codes.length) lines.push('- **Codes:** ' + note.codes.join(', '));
          if (note.what) lines.push('- **What:** ' + note.what);
          if (note.why) lines.push('- **Why:** ' + note.why);
          if (note.debate) lines.push('- **Debate:** ' + note.debate);
          if (note.use) lines.push('- **Use:** ' + note.use);
          if (note.prelimsFact) lines.push('- **Prelims fact:** ' + note.prelimsFact);
          if (note.sourceUrl) {
            lines.push('- **Source:** ' + note.sourceUrl +
              ' — ' + (note.verified ? 'primary source' : 'secondary coverage, unverified'));
          }
          var meta = [];
          if (note.score !== null) meta.push('score ' + note.score);
          meta.push('next retrieval ' + note.dueOn);
          meta.push('saved ' + note.createdAt);
          lines.push('- **Status:** ' + meta.join(' · '));
          lines.push('');
        });
      });

      lines.push('---');
      lines.push('');
      lines.push('Scores rank items for revision priority. The anchor-frequency term is an editorial estimate from twenty years of recurring themes, not a tagged corpus of past questions. Verify every figure, article number and committee name against the primary source before memorising it.');
      lines.push('');
      return lines.join('\n');
    },
  };

  window.AnchorStore = Store;

  /* ─────────────────────── anchor mastery (Pattern Atlas) ───────────────────────
   * The notes store schedules news items. This schedules concepts: which of the
   * standing anchors you can still reconstruct from the name alone. Same ladder,
   * separate key, because the two corpora are pruned on different logic — a news
   * item can be deleted once it stops mattering, an anchor cannot.
   */
  var KEY_MASTERY = 'anchor.mastery';

  function loadMastery() {
    var data = read(KEY_MASTERY, {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  var Mastery = {
    all: function () {
      return loadMastery();
    },

    get: function (anchorId) {
      return loadMastery()[anchorId] || null;
    },

    /* result: 'held' reconstructed from the anchor name alone, 'missed' did not. */
    record: function (anchorId, result) {
      if (!anchorId) return null;
      var data = loadMastery();
      var entry = data[anchorId] || {
        stage: 0, streak: 0, lateStreak: 0, graduated: false,
        attempts: 0, held: 0, dueOn: today(), firstSeen: today(),
      };

      entry.attempts += 1;
      entry.lastSeen = today();
      entry.lastResult = result === 'held' ? 'held' : 'missed';

      if (result === 'held') {
        entry.held += 1;
        entry.streak += 1;
        entry.lateStreak = entry.stage >= GRADUATE_STAGE ? (entry.lateStreak || 0) + 1 : 0;
        if (entry.graduated || entry.lateStreak >= GRADUATE_STREAK) {
          entry.graduated = true;
          entry.dueOn = addDays(today(), MONTHLY);
        } else {
          entry.stage = Math.min(entry.stage + 1, INTERVALS.length - 1);
          entry.dueOn = addDays(today(), INTERVALS[entry.stage]);
        }
      } else {
        entry.stage = 0;
        entry.streak = 0;
        entry.lateStreak = 0;
        entry.graduated = false;
        entry.dueOn = addDays(today(), INTERVALS[0]);
      }

      data[anchorId] = entry;
      write(KEY_MASTERY, data);
      return entry;
    },

    /* held → reconstructed at least once and not currently failing.
     * weak  → last attempt was a miss.
     * cold  → never drilled. */
    state: function (anchorId) {
      var entry = loadMastery()[anchorId];
      if (!entry) return 'cold';
      if (entry.lastResult === 'missed') return 'weak';
      return entry.graduated ? 'secure' : 'held';
    },

    dueToday: function (anchorIds) {
      var data = loadMastery();
      var now = today();
      return (anchorIds || Object.keys(data)).filter(function (id) {
        var entry = data[id];
        return !entry || entry.dueOn <= now;
      });
    },

    stats: function (anchorIds) {
      var data = loadMastery();
      var ids = anchorIds || Object.keys(data);
      var counts = { total: ids.length, cold: 0, weak: 0, held: 0, secure: 0, due: 0 };
      var now = today();
      ids.forEach(function (id) {
        var entry = data[id];
        if (!entry) { counts.cold += 1; counts.due += 1; return; }
        if (entry.dueOn <= now) counts.due += 1;
        if (entry.lastResult === 'missed') counts.weak += 1;
        else if (entry.graduated) counts.secure += 1;
        else counts.held += 1;
      });
      return counts;
    },

    clear: function () {
      try {
        localStorage.removeItem(KEY_MASTERY);
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  window.AnchorMastery = Mastery;
})();
