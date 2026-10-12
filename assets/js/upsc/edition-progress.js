/* UPSC Today — edition progress and spaced revision (pure, device-local).
 *
 * Tracks which edition notes are done, which quick facts are ticked and the
 * revision cards created from finished notes. Everything lives under one
 * localStorage key so it can be exported and imported between devices.
 * Storage failures are tolerated: the tracker keeps working in memory.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UpscEditionProgress = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STORAGE_KEY = 'upscEdition.v1';
  var INTERVALS = [1, 3, 7, 21, 60];
  var MISSED_DAYS = 7;
  var MAX_CARDS_PER_NOTE = 3;
  var TEXT_MAX = 600;

  function addDays(iso, days) {
    var date = new Date(String(iso) + 'T00:00:00Z');
    if (isNaN(date.getTime())) return String(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  // Calendar date in India (UTC+05:30, no daylight saving).
  function istDate(now) {
    var ms = (now instanceof Date ? now.getTime() : Date.now()) + 330 * 60000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function isISODate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function text(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || TEXT_MAX);
  }

  function emptyState() {
    return { v: 1, done: {}, facts: {}, unticked: {}, cards: [] };
  }

  // Monotonic change stamp, so merges can tell which copy of a card or tick is newer.
  var lastStamp = 0;
  function stamp() {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return lastStamp;
  }

  function stampOf(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  // Accept only the fields we understand; anything malformed is dropped.
  function sanitise(raw) {
    var state = emptyState();
    if (!isPlainObject(raw) || raw.v !== 1) return null;
    if (isPlainObject(raw.done)) {
      Object.keys(raw.done).forEach(function (id) {
        var entry = raw.done[id];
        if (!id) return;
        state.done[id] = {
          at: isISODate(entry && entry.at) ? entry.at : '',
          mcq: entry && typeof entry.mcq === 'boolean' ? entry.mcq : null
        };
      });
    }
    if (isPlainObject(raw.facts)) {
      // true (older format) or the stamp of the tick.
      Object.keys(raw.facts).forEach(function (id) {
        var value = raw.facts[id];
        if (id && (value === true || stampOf(value))) state.facts[id] = value === true ? true : stampOf(value);
      });
    }
    if (isPlainObject(raw.unticked)) {
      Object.keys(raw.unticked).forEach(function (id) { if (id && stampOf(raw.unticked[id])) state.unticked[id] = stampOf(raw.unticked[id]); });
    }
    if (Array.isArray(raw.cards)) {
      var seen = {};
      raw.cards.forEach(function (card) {
        if (!isPlainObject(card) || typeof card.id !== 'string' || !card.id || seen[card.id]) return;
        if (!isISODate(card.due)) return;
        var stage = Math.floor(Number(card.stage));
        seen[card.id] = true;
        state.cards.push({
          id: card.id,
          noteId: text(card.noteId, 200),
          front: text(card.front),
          back: text(card.back),
          stage: stage >= 0 && stage < INTERVALS.length ? stage : 0,
          due: card.due,
          t: stampOf(card.t)
        });
      });
    }
    return state;
  }

  function newerCard(a, b) {
    if (a.t !== b.t) return a.t > b.t ? a : b;
    if (a.due !== b.due) return a.due > b.due ? a : b;
    return a.stage >= b.stage ? a : b;
  }

  // Union of two states: every done note and card is kept; for the same card
  // the newer copy wins; a tick and an untick of the same fact resolve by stamp.
  function merge(stored, local) {
    var out = emptyState();
    [stored, local].forEach(function (src) {
      Object.keys(src.done).forEach(function (id) {
        var prev = out.done[id];
        var next = src.done[id];
        out.done[id] = !prev ? { at: next.at, mcq: next.mcq } : {
          at: prev.at && (!next.at || prev.at <= next.at) ? prev.at : next.at,
          mcq: next.mcq !== null ? next.mcq : prev.mcq
        };
      });
    });
    var ticks = {};
    var unticks = {};
    [stored, local].forEach(function (src) {
      Object.keys(src.facts).forEach(function (id) {
        var t = src.facts[id] === true ? 0 : src.facts[id];
        ticks[id] = Object.prototype.hasOwnProperty.call(ticks, id) ? Math.max(ticks[id], t) : t;
      });
      Object.keys(src.unticked).forEach(function (id) { unticks[id] = Math.max(unticks[id] || 0, src.unticked[id]); });
    });
    Object.keys(ticks).forEach(function (id) {
      if (!unticks[id] || ticks[id] > unticks[id]) out.facts[id] = ticks[id] || true;
    });
    Object.keys(unticks).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(out.facts, id)) out.unticked[id] = unticks[id];
    });
    var byId = {};
    var order = [];
    stored.cards.concat(local.cards).forEach(function (card) {
      if (!byId[card.id]) { order.push(card.id); byId[card.id] = card; }
      else byId[card.id] = newerCard(byId[card.id], card);
    });
    out.cards = order.map(function (id) { return Object.assign({}, byId[id]); });
    return out;
  }

  function readState(storage) {
    if (!storage) return emptyState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return sanitise(JSON.parse(raw)) || emptyState();
    } catch (error) {
      return emptyState();
    }
  }

  function noteCards(note, todayISO) {
    var cards = [];
    var due = addDays(todayISO, INTERVALS[0]);
    var title = text(note.title, 200) || 'This note';
    if (note.oneLine) {
      cards.push({ id: note.id + ':oneline', front: title + ' — what is it about, in one line?', back: text(note.oneLine) });
    }
    var key = Array.isArray(note.keyNumbers) ? note.keyNumbers.filter(function (row) {
      return row && row.figure && row.meaning;
    })[0] : null;
    if (key) {
      cards.push({ id: note.id + ':number', front: title + ' — ' + text(key.meaning, 240) + '?', back: text(key.figure, 120) });
    }
    var mcq = note.practice && note.practice.mcq;
    if (mcq && mcq.stem && Array.isArray(mcq.options) && mcq.trap) {
      var answer = mcq.options[Number(mcq.answer)];
      cards.push({
        id: note.id + ':trap',
        front: text(mcq.stem),
        back: (answer != null ? 'Answer: ' + text(answer, 200) + '. ' : '') + text(mcq.trap)
      });
    }
    return cards.slice(0, MAX_CARDS_PER_NOTE).map(function (card) {
      card.noteId = note.id;
      card.stage = 0;
      card.due = due;
      return card;
    });
  }

  function uniq(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
      if (typeof id === 'string' && id && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  function editionList(editionsByDate) {
    if (Array.isArray(editionsByDate)) return editionsByDate.filter(isPlainObject);
    if (!isPlainObject(editionsByDate)) return [];
    var out = [];
    Object.keys(editionsByDate).forEach(function (date) {
      var value = editionsByDate[date];
      (Array.isArray(value) ? value : [value]).forEach(function (edition) {
        if (isPlainObject(edition)) out.push(edition);
      });
    });
    return out;
  }

  function hashText(value) {
    var h = 5381;
    var s = String(value || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function create(storage, todayISO) {
    var today = isISODate(todayISO) ? todayISO : istDate(new Date());
    var state = readState(storage);

    // Another tab or another script (Summaverick's Save to revision) may have
    // written since this instance read storage: merge before writing.
    function save() {
      if (!storage) return false;
      try {
        state = merge(readState(storage), state);
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (error) { return false; }
    }

    function reload() {
      if (storage) state = merge(readState(storage), state);
      return true;
    }

    function hasCard(id) {
      return state.cards.some(function (card) { return card.id === id; });
    }

    function isDone(noteId) {
      return Object.prototype.hasOwnProperty.call(state.done, noteId);
    }

    function markDone(note, mcqCorrect) {
      if (!isPlainObject(note) || typeof note.id !== 'string' || !note.id) return false;
      var mcq = typeof mcqCorrect === 'boolean' ? mcqCorrect : null;
      var existing = state.done[note.id];
      state.done[note.id] = { at: existing && existing.at ? existing.at : today, mcq: mcq === null && existing ? existing.mcq : mcq };
      noteCards(note, today).forEach(function (card) {
        if (!hasCard(card.id)) { card.t = stamp(); state.cards.push(card); }
      });
      save();
      return true;
    }

    function isFactTicked(id) { return Object.prototype.hasOwnProperty.call(state.facts, id); }

    function tickFact(id, on) {
      if (typeof id !== 'string' || !id) return false;
      if (on === false) { delete state.facts[id]; state.unticked[id] = stamp(); }
      else { state.facts[id] = stamp(); delete state.unticked[id]; }
      save();
      return true;
    }

    function dueCards(onISO) {
      var day = isISODate(onISO) ? onISO : today;
      return state.cards.filter(function (card) { return card.due <= day; })
        .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : (a.id < b.id ? -1 : 1); })
        .map(function (card) { return Object.assign({}, card); });
    }

    function gradeCard(cardId, remembered) {
      var card = state.cards.filter(function (c) { return c.id === cardId; })[0];
      if (!card) return false;
      if (remembered) {
        card.stage = Math.min(card.stage + 1, INTERVALS.length - 1);
        card.due = addDays(today, INTERVALS[card.stage]);
      } else {
        card.stage = 0;
        card.due = addDays(today, INTERVALS[0]);
      }
      card.t = stamp();
      save();
      return true;
    }

    function addCard(input) {
      if (!isPlainObject(input)) return null;
      var front = text(input.front);
      var back = text(input.back);
      if (!front || !back) return null;
      var noteId = text(input.noteId, 200) || 'coach';
      var id = noteId + ':saved:' + hashText(front + '|' + back);
      if (!hasCard(id)) {
        state.cards.push({ id: id, noteId: noteId, front: front, back: back, stage: 0, due: addDays(today, INTERVALS[0]), t: stamp() });
        save();
      }
      return id;
    }

    function counter(editions) {
      var list = editionList(editions);
      var prelims = [], mains = [], facts = [];
      list.forEach(function (edition) {
        uniq(edition.prelims).forEach(function (id) { if (prelims.indexOf(id) === -1) prelims.push(id); });
        uniq(edition.mains).forEach(function (id) { if (mains.indexOf(id) === -1) mains.push(id); });
        (Array.isArray(edition.quickFacts) ? edition.quickFacts : []).forEach(function (fact) {
          if (fact && typeof fact.id === 'string' && facts.indexOf(fact.id) === -1) facts.push(fact.id);
        });
      });
      var pd = prelims.filter(isDone).length;
      var md = mains.filter(isDone).length;
      var fd = facts.filter(isFactTicked).length;
      var revise = dueCards(today).length;
      var total = prelims.length + mains.length + facts.length;
      var done = pd + md + fd;
      var percent = total + revise ? Math.round(100 * done / (total + revise)) : 0;
      return {
        prelims: [pd, prelims.length],
        mains: [md, mains.length],
        facts: [fd, facts.length],
        revise: revise,
        percent: percent,
        complete: total > 0 && done === total && revise === 0
      };
    }

    function missed(editionsByDate) {
      var from = addDays(today, -MISSED_DAYS);
      return editionList(editionsByDate).filter(function (edition) {
        return isISODate(edition.date) && edition.date >= from && edition.date < today;
      }).map(function (edition) {
        var ids = uniq([].concat(uniq(edition.prelims), uniq(edition.mains)));
        return {
          editionId: String(edition.id || edition.date + '-' + edition.slot),
          date: edition.date,
          slot: edition.slot === 'pm' ? 'pm' : 'am',
          left: ids.filter(function (id) { return !isDone(id); }).length
        };
      }).filter(function (row) { return row.left > 0; })
        .sort(function (a, b) {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          return a.slot === b.slot ? 0 : (a.slot === 'am' ? -1 : 1);
        });
    }

    function exportJSON() {
      return JSON.stringify(state);
    }

    function importJSON(raw) {
      var parsed;
      try { parsed = JSON.parse(String(raw)); } catch (error) { return false; }
      var next = sanitise(parsed);
      if (!next) return false;
      state = next;
      save();
      return true;
    }

    return {
      today: today,
      _storage: storage,
      isDone: isDone,
      markDone: markDone,
      isFactTicked: isFactTicked,
      tickFact: tickFact,
      counter: counter,
      dueCards: dueCards,
      allCards: function () { return state.cards.map(function (c) { return Object.assign({}, c); }); },
      gradeCard: gradeCard,
      addCard: addCard,
      reload: reload,
      missed: missed,
      exportJSON: exportJSON,
      importJSON: importJSON
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    merge: function (a, b) { return merge(sanitise(a) || emptyState(), sanitise(b) || emptyState()); },
    INTERVALS: INTERVALS,
    istDate: istDate,
    addDays: addDays,
    create: create
  };
});
