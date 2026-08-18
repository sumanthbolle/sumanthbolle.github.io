/* Anchor active-recall derivation. Pure: no DOM, storage, clocks, or randomness. */
;(function () {
  'use strict';

  function clean(value, max) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function payloadOf(note) {
    return note && note.recallPayload && typeof note.recallPayload === 'object'
      ? note.recallPayload : (note || {});
  }

  function sourceFactsReady(note) {
    return note && (note.editorialStatus === 'source-backed' ||
      note.editorialStatus === 'reviewed' || note.verified === true);
  }

  function createRecallPrompt(note) {
    var payload = payloadOf(note);
    return {
      type: 'recall',
      questions: [
        'What is the static anchor?',
        'Why does this matter structurally?',
        'What are the two positions?',
        'What exact line would you use in an answer?',
      ],
      answer: {
        anchor: clean(note && note.anchor, 100),
        whyInNews: clean(note && note.whyInNews || note && note.why, 320),
        argumentsFor: (payload.argumentsFor || []).map(function (row) { return clean(row, 240); }).filter(Boolean).slice(0, 4),
        argumentsAgainst: (payload.argumentsAgainst || []).map(function (row) { return clean(row, 240); }).filter(Boolean).slice(0, 4),
        use: clean(payload.use || note && note.use, 360),
      },
    };
  }

  function createClozeDrills(note) {
    if (!sourceFactsReady(note)) return [];
    var payload = payloadOf(note);
    return (Array.isArray(payload.officialFacts) ? payload.officialFacts : [])
      .map(function (fact) {
        var backed = fact && (fact.verification === 'source-backed' || fact.verification === 'reviewed');
        var prompt = clean(fact && fact.cloze && fact.cloze.prompt, 360);
        var answer = clean(fact && fact.cloze && fact.cloze.answer, 120);
        if (!backed || !prompt || !answer || prompt.split('____').length !== 2) return null;
        return {
          type: 'cloze',
          prompt: prompt,
          answer: answer,
          fact: clean(fact.text, 360),
          evidenceUrl: clean(fact.evidenceUrl || note.sourceUrl, 600),
          evidenceLocator: clean(fact.evidenceLocator, 80),
        };
      }).filter(Boolean);
  }

  function createPrelimsDrills(note) {
    var payload = payloadOf(note);
    return (Array.isArray(payload.prelimsTraps) ? payload.prelimsTraps : [])
      .map(function (trap) {
        var prompt = clean(trap && trap.statement, 260);
        var explanation = clean(trap && trap.explanation, 260);
        if (!prompt || !explanation) return null;
        return {
          type: 'prelims-trap', prompt: prompt,
          answer: !!trap.correct, explanation: explanation,
        };
      }).filter(Boolean);
  }

  function createSkeletonDrill(note) {
    var payload = payloadOf(note);
    var practice = Array.isArray(payload.mainsPractice) ? payload.mainsPractice[0] : null;
    if (!practice) return null;
    var prompt = clean(practice.stem, 320);
    var directive = clean(practice.directive, 30).toLowerCase();
    var marks = Number(practice.marks);
    var answer = (Array.isArray(practice.skeleton) ? practice.skeleton : [])
      .map(function (row) { return clean(row, 220); }).filter(Boolean).slice(0, 8);
    if (!prompt || !directive || [10, 15].indexOf(marks) === -1 || !answer.length) return null;
    return { type: 'skeleton', prompt: prompt, directive: directive, marks: marks, answer: answer };
  }

  function paperOf(note) {
    var code = clean(note && note.codes && note.codes[0], 20).toUpperCase();
    if (/^GS[1-4]\./.test(code)) return code.slice(0, 3);
    if (code.indexOf('ESSAY.') === 0) return 'ESSAY';
    return 'UNCODED';
  }

  function buildSession(notes) {
    var order = ['GS1', 'GS2', 'GS3', 'GS4', 'ESSAY', 'UNCODED'];
    var groups = {};
    order.forEach(function (paper) { groups[paper] = []; });
    (Array.isArray(notes) ? notes : []).slice().sort(function (a, b) {
      var dueA = clean(a && (a.dueAt || a.dueOn), 40);
      var dueB = clean(b && (b.dueAt || b.dueOn), 40);
      return dueA.localeCompare(dueB) || clean(a && a.id, 100).localeCompare(clean(b && b.id, 100));
    }).forEach(function (note) { groups[paperOf(note)].push(note); });
    var result = [];
    var remaining = true;
    while (remaining) {
      remaining = false;
      order.forEach(function (paper) {
        if (groups[paper].length) {
          result.push(groups[paper].shift());
          remaining = true;
        }
      });
    }
    return result;
  }

  window.AnchorMemory = Object.freeze({
    createRecallPrompt: createRecallPrompt,
    createClozeDrills: createClozeDrills,
    createPrelimsDrills: createPrelimsDrills,
    createSkeletonDrill: createSkeletonDrill,
    buildSession: buildSession,
  });
})();
