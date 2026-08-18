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

  var SUBJECTS = [
    {
      id: 'polity-governance', label: 'Polity & Governance', paper: 'GS2', readMinutes: 10,
      keywords: ['constitution', 'parliament', 'court', 'judicial', 'governance', 'election', 'rights', 'commission', 'ministry', 'scheme', 'welfare', 'cabinet', 'regulation', 'portal'],
      publishers: [],
      coreTopics: ['Constitution and institutions', 'Parliament and judiciary', 'Federalism', 'Governance and welfare delivery'],
      lens: 'Connect the institution, legal basis, implementation design and accountability gap.',
      prelimsPrompt: 'Identify the institution, legal instrument, eligibility rule and implementing authority.',
      mainsPrompt: 'Assess constitutional fit, implementation capacity, federal implications and accountability.',
      studyLens: ['Name the institution and its mandate.', 'Locate the legal or policy basis.', 'Separate design from implementation.', 'Build a balanced reform-oriented conclusion.'],
    },
    {
      id: 'economy', label: 'Economy', paper: 'GS3', readMinutes: 10,
      keywords: ['fiscal federalism', 'monetary policy', 'economy', 'economic', 'fiscal', 'monetary', 'inflation', 'bank', 'market', 'securities', 'investment', 'manufacturing', 'trade', 'finance', 'liquidity', 'repo', 'gdp', 'agriculture', 'crop', 'msme', 'infrastructure'],
      publishers: ['rbi', 'sebi'],
      coreTopics: ['Growth and inflation', 'Fiscal and monetary policy', 'Banking and markets', 'Agriculture, industry and infrastructure'],
      lens: 'Connect the policy instrument to growth, inflation, jobs, inclusion and fiscal or financial stability.',
      prelimsPrompt: 'Identify the institution, instrument, target variable and transmission channel.',
      mainsPrompt: 'Examine intended outcomes, transmission, distributional effects and policy trade-offs.',
      studyLens: ['Define the economic instrument.', 'Trace its transmission channel.', 'Identify winners, costs and exclusions.', 'End with stability plus inclusive growth.'],
    },
    {
      id: 'environment', label: 'Environment', paper: 'GS3', readMinutes: 10,
      keywords: ['climate', 'biodiversity', 'forest', 'wildlife', 'wetland', 'pollution', 'ecosystem', 'environment', 'grassland', 'desertification', 'energy transition', 'conservation', 'disaster'],
      publishers: [],
      coreTopics: ['Ecology and biodiversity', 'Climate mitigation and adaptation', 'Pollution', 'Disaster resilience'],
      lens: 'Connect ecology, governance, finance, livelihoods and community participation.',
      prelimsPrompt: 'Identify the ecosystem, species or convention, responsible institution and protected status.',
      mainsPrompt: 'Assess ecological outcomes, implementation capacity, climate justice and livelihood trade-offs.',
      studyLens: ['Define the ecological problem.', 'Map institutions and obligations.', 'Connect livelihoods with conservation.', 'Conclude with resilience and participation.'],
    },
    {
      id: 'international-relations', label: 'International Relations', paper: 'GS2', readMinutes: 9,
      keywords: ['bilateral', 'multilateral', 'strategic', 'diplomatic', 'foreign', 'summit', 'brics', 'asean', 'united nations', 'sanction', 'war', 'conflict', 'council', 'treaty', 'partnership', 'global south'],
      publishers: ['mea', 'un-news', 'eu-council'],
      coreTopics: ['India and its neighbourhood', 'Major-power relations', 'Multilateral institutions', 'Global governance'],
      lens: 'Connect the actors and institution to India’s interests, strategic autonomy and the Global South.',
      prelimsPrompt: 'Identify membership, headquarters, mandate, geography and the nature of the agreement.',
      mainsPrompt: 'Evaluate convergences, constraints, India’s interests and the wider balance of power.',
      studyLens: ['Name the actors and forum.', 'State India’s concrete interest.', 'Separate convergence from constraint.', 'Link the issue to strategic autonomy.'],
    },
    {
      id: 'science-technology', label: 'Science & Technology', paper: 'GS3', readMinutes: 9,
      keywords: ['technology', 'digital', 'space', 'satellite', 'quantum', 'semiconductor', 'electronics', 'artificial intelligence', 'cyber', 'biotechnology', 'research', 'innovation', 'telecom', 'network'],
      publishers: [],
      coreTopics: ['Digital public infrastructure', 'Space and defence technology', 'Biotechnology', 'Emerging technology governance'],
      lens: 'Connect how the technology works to public value, strategic capacity, risk and regulation.',
      prelimsPrompt: 'Identify the basic mechanism, application, responsible institution and technical limitation.',
      mainsPrompt: 'Assess capacity, access, security, ethics, regulation and dependence on critical inputs.',
      studyLens: ['Explain the mechanism simply.', 'Name the public or strategic application.', 'Identify access and security risks.', 'End with responsible innovation.'],
    },
    {
      id: 'society-social-justice', label: 'Society & Social Justice', paper: 'GS1 · GS2', readMinutes: 9,
      keywords: ['de-notified', 'social justice', 'health', 'education', 'youth', 'women', 'child', 'community', 'social', 'rehabilitation', 'inclusion', 'empowerment', 'nomadic', 'poverty', 'nutrition', 'disability', 'tribal', 'caste', 'migration', 'housing', 'skill'],
      publishers: ['who'],
      coreTopics: ['Health and education', 'Vulnerable groups', 'Urbanisation and migration', 'Social empowerment'],
      lens: 'Connect the affected group to rights, access, state capacity and measurable outcomes.',
      prelimsPrompt: 'Identify the target group, entitlement, nodal institution and delivery mechanism.',
      mainsPrompt: 'Examine structural exclusion, access barriers, implementation and rights-based remedies.',
      studyLens: ['Identify the affected group.', 'Name the access barrier.', 'Separate entitlement from delivery.', 'Conclude with dignity and capability.'],
    },
    {
      id: 'history-culture', label: 'History & Culture', paper: 'GS1', readMinutes: 8,
      keywords: ['heritage', 'culture', 'archaeology', 'history', 'civilisation', 'museum', 'manuscript', 'language', 'literature', 'art', 'architecture', 'anniversary'],
      publishers: [],
      coreTopics: ['Ancient and medieval India', 'Modern India', 'Art and architecture', 'Living cultural traditions'],
      lens: 'Place the development in chronology, identify its cultural form and explain continuity or change.',
      prelimsPrompt: 'Identify period, region, patronage, material features and associated tradition.',
      mainsPrompt: 'Explain historical context, cultural significance, continuity and conservation challenges.',
      studyLens: ['Place it in time and region.', 'Identify defining features.', 'Explain wider significance.', 'Connect preservation with living culture.'],
    },
    {
      id: 'geography', label: 'Geography', paper: 'GS1', readMinutes: 8,
      keywords: ['geography', 'monsoon', 'ocean', 'river', 'mountain', 'urban', 'population', 'earthquake', 'cyclone', 'map', 'region', 'natural resource'],
      publishers: [],
      coreTopics: ['Physical geography', 'Indian geography', 'Resources', 'Population and settlements'],
      lens: 'Connect spatial pattern, physical process, human use and regional consequence.',
      prelimsPrompt: 'Locate the region and identify the physical process, resource or spatial pattern.',
      mainsPrompt: 'Explain the process, spatial variation, human impact and region-specific response.',
      studyLens: ['Locate it on a map.', 'Explain the physical process.', 'Connect people and resources.', 'Use a region-specific response.'],
    },
    {
      id: 'ethics-essay', label: 'Ethics & Essay', paper: 'GS4 · Essay', readMinutes: 8,
      keywords: ['ethics', 'integrity', 'accountability', 'transparency', 'probity', 'civil service', 'leadership', 'values', 'dignity', 'courage'],
      publishers: [],
      coreTopics: ['Public-service values', 'Probity and accountability', 'Ethical dilemmas', 'Essay examples'],
      lens: 'Identify stakeholders, competing values, consequences and the option that best serves constitutional morality.',
      prelimsPrompt: 'Treat the item as an example; do not memorise moral claims as factual rules.',
      mainsPrompt: 'Map stakeholders, value conflict, feasible options, consequences and a reasoned public-interest choice.',
      studyLens: ['Map every stakeholder.', 'Name the value conflict.', 'Test options against consequences.', 'Choose with constitutional morality.'],
    },
  ];

  function publicSubject(subject) {
    return {
      id: subject.id, label: subject.label, paper: subject.paper,
      readMinutes: subject.readMinutes, coreTopics: subject.coreTopics.slice(),
      lens: subject.lens, prelimsPrompt: subject.prelimsPrompt,
      mainsPrompt: subject.mainsPrompt, studyLens: subject.studyLens.slice(),
    };
  }

  function subjectText(record) {
    return [record && record.title, record && record.officialSummary, record && record.anchor]
      .join(' ').toLowerCase();
  }

  function inferSubject(record) {
    var row = record || {};
    var text = subjectText(row);
    var scores = {};
    SUBJECTS.forEach(function (subject) {
      var score = subject.publishers.indexOf(row.publisherId) === -1 ? 0 : 2;
      subject.keywords.forEach(function (keyword) {
        if (text.indexOf(keyword) !== -1) score += keyword.indexOf(' ') === -1 ? 3 : 5;
      });
      scores[subject.id] = score;
    });
    var codes = Array.isArray(row.codes) ? row.codes : [];
    if (codes.some(function (code) { return code.indexOf('GS4.') === 0 || code.indexOf('ESSAY.') === 0; })) scores['ethics-essay'] += 2;
    if (codes.some(function (code) { return code.indexOf('GS2.') === 0; })) scores['polity-governance'] += 2;
    if (codes.some(function (code) { return code.indexOf('GS3.') === 0; })) scores.economy += 1;
    if (codes.some(function (code) { return code.indexOf('GS1.') === 0; })) scores['society-social-justice'] += 1;
    var best = SUBJECTS[0];
    SUBJECTS.forEach(function (subject) {
      if (scores[subject.id] > scores[best.id]) best = subject;
    });
    return publicSubject(best);
  }

  function importanceScore(record) {
    var text = subjectText(record);
    var score = Number(record.priority) || 0;
    if (record.sourceVerified) score += 4;
    if (/\bpolicy\b|\bmission\b|\bscheme\b|\bact\b|\bbill\b|judgment|\breport\b|agreement|summit|guidance|regulation|rights|climate|biodiversity|grassland|desertification|unccd|health|reform/.test(text)) score += 18;
    if (/money market operations as on|auction of government|tender|vacancy|appointment|courtesy call/.test(text)) score -= 24;
    score += Math.min(8, Math.floor(String(record.officialSummary || '').length / 250));
    return score;
  }

  function buildDailyEdition(records, options) {
    var value = options || {};
    var limit = Math.max(1, Math.min(15, Number(value.limit) || 12));
    var rows = (Array.isArray(records) ? records : []).slice().sort(function (a, b) {
      return b.publishedAt.localeCompare(a.publishedAt);
    });
    if (!rows.length) return { editionDate: '', items: [], groups: [] };
    var editionDate = rows[0].publishedAt.slice(0, 10);
    var editionTime = Date.parse(editionDate + 'T23:59:59Z');
    var cutoff = editionTime - (3 * 24 * 60 * 60 * 1000);
    var candidates = rows.filter(function (row) {
      var parsed = Date.parse(row.publishedAt);
      return Number.isFinite(parsed) && parsed >= cutoff && parsed <= editionTime;
    }).map(function (row) {
      return Object.assign({}, row, { subject: inferSubject(row), editionScore: importanceScore(row) });
    }).sort(function (a, b) {
      return b.editionScore - a.editionScore || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);
    });
    var buckets = {};
    candidates.forEach(function (row) {
      if (!buckets[row.subject.id]) buckets[row.subject.id] = [];
      buckets[row.subject.id].push(row);
    });
    var selected = [];
    while (selected.length < limit) {
      var added = false;
      SUBJECTS.forEach(function (subject) {
        if (selected.length >= limit || !buckets[subject.id] || !buckets[subject.id].length) return;
        selected.push(buckets[subject.id].shift());
        added = true;
      });
      if (!added) break;
    }
    var groups = SUBJECTS.map(function (subject) {
      var items = selected.filter(function (row) { return row.subject.id === subject.id; });
      return items.length ? { subject: publicSubject(subject), items: items } : null;
    }).filter(Boolean);
    return { editionDate: editionDate, items: selected, groups: groups };
  }

  function selectTopicOfDay(records, notes) {
    var edition = buildDailyEdition(records, { limit: 15 });
    var ranked = edition.items.slice().sort(function (a, b) {
      var aDepth = String(a.officialSummary || '').length - String(a.title || '').length;
      var bDepth = String(b.officialSummary || '').length - String(b.title || '').length;
      var aTopicScore = a.editionScore + (aDepth <= 24 ? -12 : Math.min(12, Math.floor(aDepth / 20)));
      var bTopicScore = b.editionScore + (bDepth <= 24 ? -12 : Math.min(12, Math.floor(bDepth / 20)));
      return bTopicScore - aTopicScore || b.publishedAt.localeCompare(a.publishedAt);
    });
    if (!ranked.length) return null;
    var source = ranked[0];
    return Object.assign({}, source, { kind: 'source' });
  }

  function subjectLibrary(records) {
    var counts = {};
    (Array.isArray(records) ? records : []).forEach(function (row) {
      var id = inferSubject(row).id;
      counts[id] = (counts[id] || 0) + 1;
    });
    return SUBJECTS.map(function (subject) {
      return Object.assign(publicSubject(subject), { currentCount: counts[subject.id] || 0 });
    });
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
    inferSubject: inferSubject,
    buildDailyEdition: buildDailyEdition,
    selectTopicOfDay: selectTopicOfDay,
    subjectLibrary: subjectLibrary,
    normalizeExamIndex: normalizeExamIndex,
    groupBySyllabus: groupBySyllabus,
    normalizeSyllabusIndex: normalizeSyllabusIndex,
  });
})();
