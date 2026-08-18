/* Anchor public-content contracts. Pure normalization and filtering only. */
;(function () {
  'use strict';

  function clean(value, max) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function safeHttpUrl(value) {
    try {
      var url = new URL(clean(value, 600));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch (error) {
      return '';
    }
  }

  function cleanCodes(value) {
    if (!Array.isArray(value)) return [];
    var seen = {};
    return value.map(function (code) { return clean(code, 20).toUpperCase(); })
      .filter(function (code) {
        if (!/^(GS[1-4]\.\d{1,2}|ESSAY\.[AB])$/.test(code) || seen[code]) return false;
        seen[code] = true;
        return true;
      }).slice(0, 3);
  }

  function normalizeSource(row) {
    if (!row || typeof row !== 'object') return null;
    var url = safeHttpUrl(row.sourceUrl);
    var id = clean(row.id, 90);
    var title = clean(row.title, 240);
    var publisherId = clean(row.publisherId, 64);
    var publishedAt = clean(row.publishedAt, 32);
    if (!id || !title || !publisherId || !url || !/^\d{4}-\d{2}-\d{2}T/.test(publishedAt)) return null;
    var state = clean(row.editorialState, 24);
    if (['source-only', 'draft', 'source-backed', 'reviewed'].indexOf(state) === -1) {
      state = 'source-only';
    }
    return {
      id: id,
      title: title,
      publisherId: publisherId,
      publisherName: clean(row.publisherName, 120) || publisherId,
      publishedAt: publishedAt,
      sourceUrl: url,
      officialSummary: clean(row.officialSummary, 2000),
      sourceType: clean(row.sourceType, 40) || 'official-update',
      jurisdiction: clean(row.jurisdiction, 12).toUpperCase(),
      sourceVerified: row.sourceVerified === true,
      editorialState: state,
      codes: cleanCodes(row.codes),
      priority: Number.isFinite(Number(row.priority)) ? Math.max(0, Math.min(100, Number(row.priority))) : 0,
    };
  }

  function normalizeSourceIndex(payload) {
    var rows = payload && Array.isArray(payload.records) ? payload.records : [];
    return {
      generatedAt: clean(payload && payload.generatedAt, 32),
      records: rows.map(normalizeSource).filter(Boolean),
    };
  }

  function primaryPaper(code) {
    return code.indexOf('ESSAY.') === 0 ? 'ESSAY' : code.split('.')[0];
  }

  function filterSources(records, filters) {
    var value = filters || {};
    var query = clean(value.query, 160).toLocaleLowerCase();
    var publishers = Array.isArray(value.publishers) ? value.publishers : [];
    var papers = Array.isArray(value.papers) ? value.papers : [];
    var sourceTypes = Array.isArray(value.sourceTypes) ? value.sourceTypes : [];
    var jurisdiction = clean(value.jurisdiction, 20).toLowerCase() || 'all';
    var date = clean(value.date, 10);
    return (Array.isArray(records) ? records : []).filter(function (row) {
      if (query) {
        var text = [row.title, row.officialSummary, row.publisherName, row.sourceType]
          .join(' ').toLocaleLowerCase();
        if (text.indexOf(query) === -1) return false;
      }
      if (publishers.length && publishers.indexOf(row.publisherId) === -1) return false;
      if (sourceTypes.length && sourceTypes.indexOf(row.sourceType) === -1) return false;
      if (date && row.publishedAt.slice(0, 10) !== date) return false;
      if (jurisdiction === 'india' && row.jurisdiction !== 'IN') return false;
      if (jurisdiction === 'international' && row.jurisdiction === 'IN') return false;
      if (papers.length) {
        var rowPapers = row.codes.map(primaryPaper);
        if (!rowPapers.some(function (paper) { return papers.indexOf(paper) !== -1; })) return false;
      }
      return true;
    });
  }

  function groupPublishers(records) {
    var groups = {};
    (Array.isArray(records) ? records : []).forEach(function (row) {
      if (!groups[row.publisherId]) {
        groups[row.publisherId] = { id: row.publisherId, name: row.publisherName, count: 0 };
      }
      groups[row.publisherId].count += 1;
    });
    return Object.keys(groups).sort().map(function (id) { return groups[id]; });
  }

  function cleanList(value, limit, max) {
    return (Array.isArray(value) ? value : []).map(function (row) {
      return clean(row, max);
    }).filter(Boolean).slice(0, limit);
  }

  function normalizeOfficialFact(row) {
    if (!row || typeof row !== 'object') return null;
    var text = clean(row.text, 360);
    if (!text) return null;
    var verification = clean(row.verification, 24);
    if (['source-backed', 'reviewed', 'needs-review'].indexOf(verification) === -1) {
      verification = 'needs-review';
    }
    var fact = {
      text: text,
      evidenceUrl: safeHttpUrl(row.evidenceUrl),
      evidenceLocator: clean(row.evidenceLocator, 80),
      verification: verification,
    };
    var prompt = clean(row.cloze && row.cloze.prompt, 360);
    var answer = clean(row.cloze && row.cloze.answer, 120);
    if ((verification === 'source-backed' || verification === 'reviewed') &&
        prompt && answer && prompt.split('____').length === 2) {
      fact.cloze = { prompt: prompt, answer: answer };
    }
    return fact;
  }

  function normalizePractice(row) {
    if (!row || typeof row !== 'object') return null;
    var directive = clean(row.directive || row.verb, 30).toLowerCase();
    var marks = Number(row.marks);
    var stem = clean(row.stem, 320);
    if (!directive || [10, 15].indexOf(marks) === -1 || !stem) return null;
    var introChoices = cleanList(row.introChoices || row.intro_choices, 2, 180);
    var bodyDimensions = cleanList(row.bodyDimensions || row.body_dimensions, 4, 180);
    var counterPosition = clean(row.counterPosition || row.counter_position, 220);
    var diagramSuggestion = clean(row.diagramSuggestion || row.diagram_suggestion, 180);
    var conclusionPrompt = clean(row.conclusionPrompt || row.conclusion_prompt, 220);
    return {
      directive: directive,
      marks: marks,
      wordBudget: marks === 10 ? 150 : 250,
      timeMinutes: marks === 10 ? 7 : 11,
      stem: stem,
      introChoices: introChoices,
      bodyDimensions: bodyDimensions,
      counterPosition: counterPosition,
      diagramSuggestion: diagramSuggestion,
      conclusionPrompt: conclusionPrompt,
      skeleton: introChoices.concat(bodyDimensions, counterPosition, conclusionPrompt).filter(Boolean),
    };
  }

  function normalizeExamNote(row) {
    if (!row || typeof row !== 'object') return null;
    var sourceId = clean(row.sourceId, 90);
    var title = clean(row.title || row.sourceTitle, 240);
    var sourceUrl = safeHttpUrl(row.sourceUrl);
    var publishedAt = clean(row.publishedAt, 32);
    var anchor = clean(row.anchor, 100);
    var codes = cleanCodes(row.codes);
    var use = clean(row.use, 360);
    if (!sourceId || !title || !sourceUrl || !/^\d{4}-\d{2}-\d{2}T/.test(publishedAt) ||
        !anchor || !codes.length || !use) return null;
    var editorialStatus = clean(row.editorialStatus, 24);
    if (['draft', 'source-backed', 'reviewed'].indexOf(editorialStatus) === -1) {
      editorialStatus = 'draft';
    }
    var officialFacts = (Array.isArray(row.officialFacts) ? row.officialFacts : [])
      .map(normalizeOfficialFact).filter(Boolean).slice(0, 6);
    var factsReady = officialFacts.length > 0 && officialFacts.every(function (fact) {
      return !!fact.evidenceUrl && !!fact.evidenceLocator &&
        (fact.verification === 'source-backed' || fact.verification === 'reviewed');
    });
    var reusableKinds = ['constitutional', 'judicial', 'committee', 'report', 'data', 'international'];
    var reusableAnchors = (Array.isArray(row.reusableAnchors) ? row.reusableAnchors : [])
      .map(function (item) {
        return { kind: clean(item && item.kind, 24).toLowerCase(), label: clean(item && item.label, 180) };
      }).filter(function (item) {
        return reusableKinds.indexOf(item.kind) !== -1 && item.label;
      }).slice(0, 6);
    var prelimsTraps = (Array.isArray(row.prelimsTraps) ? row.prelimsTraps : [])
      .map(function (item) {
        return {
          statement: clean(item && item.statement, 260),
          correct: !!(item && item.correct),
          explanation: clean(item && item.explanation, 260),
        };
      }).filter(function (item) { return item.statement && item.explanation; }).slice(0, 4);
    return {
      sourceId: sourceId,
      sourceContentHash: clean(row.sourceContentHash, 90),
      title: title,
      sourceUrl: sourceUrl,
      publisherName: clean(row.publisherName, 120),
      publishedAt: publishedAt,
      anchor: anchor,
      codes: codes,
      papers: codes.map(primaryPaper).filter(function (paper, index, all) {
        return all.indexOf(paper) === index;
      }),
      whyInNews: clean(row.whyInNews, 320),
      staticDefinition: clean(row.staticDefinition, 320),
      background: cleanList(row.background, 5, 240),
      reusableAnchors: reusableAnchors,
      officialFacts: officialFacts,
      argumentsFor: cleanList(row.argumentsFor, 4, 240),
      argumentsAgainst: cleanList(row.argumentsAgainst, 4, 240),
      indiaImplications: cleanList(row.indiaImplications, 4, 240),
      wayForward: cleanList(row.wayForward, 4, 240),
      prelimsTraps: prelimsTraps,
      mainsPractice: (Array.isArray(row.mainsPractice) ? row.mainsPractice : [])
        .map(normalizePractice).filter(Boolean).slice(0, 3),
      use: use,
      recallCard: clean(row.recallCard, 480),
      priority: Number.isFinite(Number(row.priority))
        ? Math.max(0, Math.min(100, Number(row.priority))) : 0,
      priorityProvisional: row.priorityProvisional === true,
      editorialStatus: editorialStatus,
      canMemorize: (editorialStatus === 'source-backed' || editorialStatus === 'reviewed') && factsReady,
      notePath: clean(row.notePath, 240),
    };
  }

  function normalizeExamIndex(payload) {
    var rows = payload && Array.isArray(payload.notes) ? payload.notes : [];
    return {
      generatedAt: clean(payload && payload.generatedAt, 32),
      notes: rows.map(normalizeExamNote).filter(Boolean),
    };
  }

  function codeRank(code) {
    if (code.indexOf('ESSAY.') === 0) return 5000 + (code === 'ESSAY.A' ? 1 : 2);
    var match = /^GS([1-4])\.(\d{1,2})$/.exec(code);
    return match ? Number(match[1]) * 100 + Number(match[2]) : 9999;
  }

  function groupBySyllabus(notes) {
    var groups = {};
    (Array.isArray(notes) ? notes : []).forEach(function (raw) {
      var note = normalizeExamNote(raw);
      if (!note) return;
      note.codes.forEach(function (code) {
        if (!groups[code]) groups[code] = [];
        if (!groups[code].some(function (item) { return item.sourceId === note.sourceId; })) {
          groups[code].push(note);
        }
      });
    });
    var ordered = {};
    Object.keys(groups).sort(function (a, b) { return codeRank(a) - codeRank(b); })
      .forEach(function (code) {
        ordered[code] = groups[code].sort(function (a, b) {
          return b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt);
        });
      });
    return ordered;
  }

  function normalizeSyllabusIndex(payload) {
    var codes = payload && payload.codes && typeof payload.codes === 'object'
      ? payload.codes : {};
    var groups = [];
    Object.keys(codes).filter(function (code) { return cleanCodes([code]).length === 1; })
      .sort(function (a, b) { return codeRank(a) - codeRank(b); })
      .forEach(function (code) {
        var anchors = codes[code] && codes[code].anchors && typeof codes[code].anchors === 'object'
          ? codes[code].anchors : {};
        Object.keys(anchors).sort().forEach(function (key) {
          var row = anchors[key] || {};
          var anchor = clean(row.anchor, 100);
          if (!anchor) return;
          groups.push({
            code: code,
            key: clean(key, 120),
            anchor: anchor,
            staticDefinition: clean(row.staticDefinition, 320),
            noteIds: cleanList(row.noteIds, 200, 90),
            reusableAnchors: (Array.isArray(row.reusableAnchors) ? row.reusableAnchors : [])
              .map(function (item) {
                return { kind: clean(item && item.kind, 24), label: clean(item && item.label, 180) };
              }).filter(function (item) { return item.kind && item.label; }).slice(0, 12),
            practiceIds: cleanList(row.practiceIds, 200, 140),
            monthlySyntheses: (Array.isArray(row.monthlySyntheses) ? row.monthlySyntheses : [])
              .map(function (item) {
                return {
                  month: clean(item && item.month, 7),
                  noteIds: cleanList(item && item.noteIds, 50, 90),
                  uses: cleanList(item && item.uses, 20, 360),
                };
              }).filter(function (item) { return /^\d{4}-\d{2}$/.test(item.month); }),
          });
        });
      });
    return { generatedAt: clean(payload && payload.generatedAt, 32), groups: groups };
  }

  window.AnchorContent = Object.freeze({
    normalizeSourceIndex: normalizeSourceIndex,
    filterSources: filterSources,
    groupPublishers: groupPublishers,
    normalizeExamIndex: normalizeExamIndex,
    groupBySyllabus: groupBySyllabus,
    normalizeSyllabusIndex: normalizeSyllabusIndex,
  });
})();
