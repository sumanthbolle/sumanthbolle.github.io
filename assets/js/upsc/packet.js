/* UPSC Today — canonical Topic Packet.
 *
 * One current trigger becomes one structured object: study priority, static
 * anchor, PYQ bridge, Prelims Vault, Mains Kit and a source strip. The public
 * page never treats this score as a prediction of what UPSC will ask.
 */
;(function () {
  'use strict';

  var BANDS = ['must_know', 'useful', 'background', 'skip'];
  var BAND_LABELS = {
    must_know: 'Must Know',
    useful: 'Useful',
    background: 'Background',
    skip: 'Skip',
  };
  var CONTENT_TYPES = [
    'CURRENT_EVENT', 'EDITORIAL_DEBATE', 'BILL_OR_ACT', 'JUDGMENT', 'SCHEME',
    'REPORT_OR_INDEX', 'INSTITUTION', 'INTERNATIONAL_ORGANISATION',
    'TREATY_OR_GROUPING', 'SPECIES', 'PLACE_IN_NEWS', 'SCI_TECH_CONCEPT',
    'ECONOMIC_CONCEPT', 'HISTORY_LINK', 'ART_CULTURE', 'DATA_RELEASE',
    'COMMITTEE', 'PERSON_IN_NEWS',
  ];
  var WEIGHTS = {
    syllabus_fit: 0.25,
    primary_source_weight: 0.20,
    pyq_proximity: 0.20,
    anchor_recurrence: 0.15,
    conceptual_depth: 0.10,
    recency: 0.10,
  };
  var LOW_VALUE = /\b(auction of|tender|vacancy|appointment of|courtesy call|weekly schedule|felicitation|inaugurates an exhibition|lays the foundation|shares glimpses|text of pm)\b/i;
  var DEPTH = /\b(scheme|mission|act|bill|judgment|report|index|federal|climate|biodiversity|regulation|rights|devolution|commission|treaty|mou|policy|preparedness|surveillance)\b/i;

  function clean(value, max) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ').trim().slice(0, max || 400);
  }

  function clamp(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  var STOP = {
    the: 1, and: 1, for: 1, with: 1, from: 1, that: 1, this: 1, under: 1,
    india: 1, indian: 1, national: 1, union: 1, government: 1, state: 1,
    ministry: 1, minister: 1, official: 1, update: 1, report: 1, release: 1,
  };

  function tokens(value) {
    return clean(value, 2000).toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(function (token) { return token.length > 3 && !STOP[token]; });
  }

  function unique(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function primaryPaper(code) {
    var value = clean(code, 20).toUpperCase();
    if (value.indexOf('ESSAY') === 0) return 'ESSAY';
    return value.split('.')[0] || '';
  }

  function inferContentType(record) {
    var text = [record && record.title, record && record.officialSummary, record && record.sourceType]
      .join(' ').toLowerCase();
    if (/\b(scheme|mission shakti|fellowship|scholarship)\b/.test(text)) return 'SCHEME';
    if (/\b(bill|act|law|notification)\b/.test(text)) return 'BILL_OR_ACT';
    if (/\b(judgment|court|bench|penalty|sanction)\b/.test(text)) return 'JUDGMENT';
    if (/\b(report|index|bulletin|survey|statistical)\b/.test(text)) return 'REPORT_OR_INDEX';
    if (/\b(commission|authority|board|regulator)\b/.test(text)) return 'INSTITUTION';
    if (/\b(mou|treaty|agreement|declaration)\b/.test(text)) return 'TREATY_OR_GROUPING';
    if (/\b(brics|united nations|who|asean|imf|world bank)\b/.test(text)) return 'INTERNATIONAL_ORGANISATION';
    if (/\b(heritage|classical|culture|manuscript)\b/.test(text)) return 'ART_CULTURE';
    if (/\b(gdp|inflation|repo|monetary|fiscal|auction)\b/.test(text)) return 'ECONOMIC_CONCEPT';
    if (/\b(data|quarterly|census)\b/.test(text)) return 'DATA_RELEASE';
    return 'CURRENT_EVENT';
  }

  function inferTriggerType(record, atlas) {
    if (atlas && atlas.trigger_types && atlas.trigger_types[0]) return atlas.trigger_types[0];
    var type = inferContentType(record);
    if (type === 'JUDGMENT') return 'JUDGMENT';
    if (type === 'BILL_OR_ACT') return 'LEGISLATION';
    if (type === 'REPORT_OR_INDEX' || type === 'DATA_RELEASE') return 'REPORT';
    return 'EVENT';
  }

  function sourceTier(record) {
    var publisher = clean(record && record.publisherId, 40).toLowerCase();
    if (['pib', 'rbi', 'sebi', 'mea', 'eci', 'cag'].indexOf(publisher) !== -1) return 1;
    if (['un-news', 'who', 'eu-council', 'imf', 'world-bank'].indexOf(publisher) !== -1) return 2;
    return record && record.sourceVerified ? 2 : 3;
  }

  function recencyScore(publishedAt, nowISO) {
    var published = Date.parse(publishedAt);
    var now = Date.parse(nowISO || new Date().toISOString());
    if (!Number.isFinite(published) || !Number.isFinite(now)) return 40;
    var days = Math.max(0, Math.round((now - published) / 86400000));
    if (days <= 1) return 100;
    if (days <= 3) return 85;
    if (days <= 7) return 70;
    if (days <= 21) return 50;
    if (days <= 45) return 30;
    return 10;
  }

  function matchAtlas(record, anchors) {
    var list = Array.isArray(anchors) ? anchors : [];
    var hay = tokens([
      record && record.title,
      record && record.officialSummary,
      record && record.anchor,
      record && record.subject && record.subject.label,
    ].join(' '));
    if (!hay.length || !list.length) return null;
    var best = null;
    list.forEach(function (anchor) {
      if (!anchor || !anchor.id) return;
      var bag = tokens([anchor.anchor, anchor.id].concat(anchor.aliases || []).join(' '));
      var hits = 0;
      var distinctive = 0;
      bag.forEach(function (token) {
        if (hay.indexOf(token) === -1) return;
        hits += token.length > 8 ? 4 : 2;
        if (token.length > 6) distinctive += 1;
      });
      if (!hits || !distinctive) return;
      var papers = record && record.subject && record.subject.paper
        ? String(record.subject.paper) : '';
      (anchor.papers || []).forEach(function (paper) {
        if (papers.indexOf(paper) !== -1) hits += 1;
      });
      if (!best || hits > best.score) best = { score: hits, anchor: anchor };
    });
    if (!best || best.score < 4) return null;
    return best.anchor;
  }

  function linkPyqs(anchorId, pyqIndex, limit) {
    var rows = pyqIndex && anchorId && Array.isArray(pyqIndex[anchorId])
      ? pyqIndex[anchorId] : [];
    return rows.slice(0, limit || 4).map(function (row) {
      var exam = clean(row.exam, 16).toLowerCase();
      return {
        id: clean(row.id, 80),
        year: Number(row.year) || 0,
        paper: clean(row.paper, 12),
        exam: exam,
        type: exam === 'prelims' ? 'adjacent' : 'direct',
        theme: (row.tags && row.tags[0]) ? clean(row.tags[0], 80) : clean(row.source, 80),
        directive: '',
        paraphrase: clean(row.question, 280),
        why_linked: 'Shares the same Pattern Atlas static anchor.',
        source: clean(row.source, 120),
      };
    });
  }

  function scorePriority(parts) {
    var values = parts || {};
    var components = {
      syllabus_fit: clamp(values.syllabus_fit),
      primary_source_weight: clamp(values.primary_source_weight),
      pyq_proximity: clamp(values.pyq_proximity),
      anchor_recurrence: clamp(values.anchor_recurrence),
      conceptual_depth: clamp(values.conceptual_depth),
      recency: clamp(values.recency),
    };
    var score = 0;
    Object.keys(WEIGHTS).forEach(function (key) {
      score += components[key] * WEIGHTS[key];
    });
    score = clamp(score);
    var band = 'skip';
    if (score >= 80) band = 'must_know';
    else if (score >= 60) band = 'useful';
    else if (score >= 40) band = 'background';
    return { score: score, band: band, components: components };
  }

  function inferPriorityInputs(record, atlas, pyqs) {
    var text = [record && record.title, record && record.officialSummary].join(' ');
    var codes = (record && record.codes) || (atlas && atlas.codes) || [];
    var syllabus = codes.length ? 78 : (atlas ? 62 : 28);
    if (record && record.subject) syllabus += 8;
    var primary = record && record.sourceVerified ? 86 : 40;
    primary += sourceTier(record) === 1 ? 8 : 0;
    var pyqCount = (pyqs || []).length;
    var pyqScore = pyqCount ? Math.min(100, 55 + ((pyqCount - 1) * 20)) : 0;
    var recurrence = atlas ? clamp(atlas.frequency_est) : 18;
    var depth = DEPTH.test(text) ? 72 : 34;
    if (atlas && atlas.band === 'perennial' && record && record.sourceVerified) depth += 12;
    if (LOW_VALUE.test(text)) {
      syllabus = Math.min(syllabus, 24);
      depth = Math.min(depth, 16);
    }
    if (record && record.editorialState === 'reviewed') depth += 10;
    return {
      syllabus_fit: syllabus,
      primary_source_weight: primary,
      pyq_proximity: pyqScore,
      anchor_recurrence: recurrence,
      conceptual_depth: depth,
      recency: recencyScore(record && record.publishedAt),
    };
  }

  function emptyVault() {
    return {
      facts: [],
      traps: [],
      confusing_pairs: [],
      numbers: [],
      do_not_memorize: [],
    };
  }

  function emptyMains() {
    return {
      skeleton: [],
      opening_line: '',
      dimensions: [],
      evidence: [],
      counter_view: '',
      way_forward: [],
      closing_line: '',
      questions: [],
    };
  }

  function packetFromSource(source, context) {
    var record = source || {};
    var extras = context || {};
    var atlas = extras.atlas || matchAtlas(record, extras.anchors);
    var pyqs = extras.pyqs || linkPyqs(atlas && atlas.id, extras.pyqIndex);
    var scored = extras.priority || scorePriority(inferPriorityInputs(record, atlas, pyqs));
    var subject = record.subject || extras.subject || null;
    var codes = unique((record.codes || []).concat((atlas && atlas.codes) || [])).slice(0, 3);
    var papers = unique(codes.map(primaryPaper).concat((atlas && atlas.papers) || [])
      .concat(subject && subject.paper ? [String(subject.paper).split(' · ')[0]] : []))
      .filter(Boolean);
    var summary = clean(record.officialSummary || record.title, 420);
    var remember = [];
    if (atlas && atlas.static_core && atlas.static_core[0]) remember.push(atlas.static_core[0]);
    if (summary && remember.indexOf(summary) === -1) remember.push(summary);
    var vault = emptyVault();
    if (atlas) {
      (atlas.traps || []).slice(0, 3).forEach(function (trap) {
        vault.traps.push({ statement: clean(trap, 260), correct: false, explanation: 'Pattern Atlas trap on this static anchor — verify against the official record before memorising.' });
      });
      if (atlas.prelims_angle) vault.facts.push(clean(atlas.prelims_angle, 280));
    }
    var mains = emptyMains();
    if (atlas) {
      mains.skeleton = (atlas.skeleton || []).slice(0, 6).map(function (row) { return clean(row, 180); });
      mains.opening_line = (atlas.static_core && atlas.static_core[0]) ? clean(atlas.static_core[0], 220) : '';
      mains.questions = (atlas.stems || []).slice(0, 2).map(function (stem) {
        return {
          paper: clean(stem.paper, 8),
          marks: Number(stem.marks) || 10,
          directive: clean(stem.verb, 30),
          question: clean(stem.stem, 320),
        };
      });
      mains.counter_view = (atlas.traps && atlas.traps[0]) ? clean(atlas.traps[0], 220) : '';
    }
    var title = clean(record.title, 240);
    var date = clean(record.publishedAt, 32).slice(0, 10);
    return {
      id: clean(record.id, 90),
      title: title,
      date: date,
      status: clean(record.editorialState, 24) || 'source-only',
      priority: scored.band,
      priority_score: scored.score,
      priority_components: scored.components,
      priority_note: 'Study priority, not a prediction of what UPSC will ask.',
      content_type: inferContentType(record),
      stage: papers.indexOf('GS4') !== -1 || papers.indexOf('ESSAY') !== -1
        ? ['MAINS'] : ['PRELIMS', 'MAINS'],
      papers: papers,
      syllabus_codes: codes,
      subjects: unique([subject && subject.label, atlas && atlas.anchor].filter(Boolean)),
      trigger: {
        type: inferTriggerType(record, atlas),
        summary: summary,
      },
      anchors: atlas ? [{ id: atlas.id, label: atlas.anchor, relationship: 'primary' }] : [],
      layers: {
        scan: {
          why_upsc: atlas
            ? 'Maps to the standing ' + atlas.anchor + ' anchor.'
            : (subject ? 'Filed under ' + subject.label + '.' : 'Official update awaiting a static mapping.'),
          remember: remember.slice(0, 3),
        },
        brief: {
          what_happened: summary,
          why_it_matters: atlas
            ? ['Static concept: ' + atlas.anchor, (atlas.static_core && atlas.static_core[1]) || atlas.prelims_angle || '']
              .filter(Boolean).slice(0, 3)
            : [subject && subject.lens ? subject.lens : 'Read the official record before treating this as an exam note.'].filter(Boolean),
          remember: remember.slice(0, 5),
          upsc_link: {
            prelims: atlas ? clean(atlas.prelims_angle, 220) : 'No cleared Prelims fact yet.',
            mains: atlas && atlas.stems && atlas.stems[0] ? clean(atlas.stems[0].stem, 220) : 'No Mains stem attached yet.',
            essay: '',
          },
        },
        understand: {
          static_anchor: atlas && atlas.static_core ? atlas.static_core.join(' ') : '',
          how_it_works: atlas ? (atlas.static_core || []).slice(0, 4) : [],
          what_changed: {
            before: atlas ? 'Standing syllabus position on ' + atlas.anchor + '.' : '',
            now: summary,
            unresolved: atlas && atlas.verify && atlas.verify[0] ? atlas.verify[0] : 'Confirm current figures from the official record.',
          },
          dimensions: subject ? [{ label: subject.label, points: (subject.coreTopics || []).slice(0, 3) }] : [],
          debate: [],
        },
        deep_dive: {
          background: [],
          timeline: [],
          stakeholders: [],
          arguments: [],
          counterarguments: [],
          way_forward: [],
        },
      },
      prelims: vault,
      mains: mains,
      pyq_links: pyqs,
      story_cluster_id: atlas ? atlas.id : clean(record.id, 90),
      sources: [{
        publisher: clean(record.publisherName || record.publisherId, 120),
        url: clean(record.sourceUrl, 400),
        tier: sourceTier(record),
        role: 'primary',
        accessed: date,
      }],
      claims: [],
      revision: { eligible: scored.band !== 'skip', fact_expiry: null },
      subject: subject,
      sourceId: clean(record.id, 90),
      sourceUrl: clean(record.sourceUrl, 400),
      publisherName: clean(record.publisherName || record.publisherId, 120),
      publishedAt: clean(record.publishedAt, 32),
      atlas: atlas ? { id: atlas.id, label: atlas.anchor, band: atlas.band } : null,
      hasExamNote: false,
      read_minutes: scored.band === 'must_know' ? 5 : (scored.band === 'useful' ? 4 : 2),
    };
  }

  function packetFromExamNote(note, context) {
    var extras = context || {};
    var base = packetFromSource({
      id: note.sourceId,
      title: note.title,
      officialSummary: note.whyInNews || note.use,
      sourceType: 'exam-note',
      publisherId: extras.source && extras.source.publisherId,
      publisherName: note.publisherName,
      publishedAt: note.publishedAt,
      sourceUrl: note.sourceUrl,
      sourceVerified: note.canMemorize === true,
      editorialState: note.editorialStatus,
      codes: note.codes,
      subject: extras.subject,
      anchor: note.anchor,
    }, extras);
    var scored = scorePriority(Object.assign({}, inferPriorityInputs({
      title: note.title,
      officialSummary: note.whyInNews,
      publishedAt: note.publishedAt,
      sourceVerified: note.canMemorize,
      editorialState: note.editorialStatus,
      codes: note.codes,
      subject: extras.subject,
    }, extras.atlas, base.pyq_links), {
      conceptual_depth: note.canMemorize ? 88 : 54,
      syllabus_fit: 90,
    }));
    base.priority = scored.band;
    base.priority_score = scored.score;
    base.priority_components = scored.components;
    base.hasExamNote = true;
    base.status = note.editorialStatus;
    base.anchors = [{
      id: (extras.atlas && extras.atlas.id) || clean(note.anchor, 80).toLowerCase().replace(/\s+/g, '-'),
      label: (extras.atlas && extras.atlas.anchor) || note.anchor,
      relationship: 'primary',
    }];
    base.story_cluster_id = extras.atlas ? extras.atlas.id : base.anchors[0].id;
    base.layers.scan = {
      why_upsc: note.staticDefinition || note.whyInNews,
      remember: (note.officialFacts || []).slice(0, 3).map(function (fact) { return fact.text; }),
    };
    if (!base.layers.scan.remember.length) {
      base.layers.scan.remember = [note.use, note.whyInNews].filter(Boolean).slice(0, 3);
    }
    base.layers.brief = {
      what_happened: note.whyInNews,
      why_it_matters: [note.staticDefinition, note.use].filter(Boolean).slice(0, 3),
      remember: (note.officialFacts || []).slice(0, 5).map(function (fact) { return fact.text; }),
      upsc_link: {
        prelims: (note.officialFacts[0] && note.officialFacts[0].text) || 'No cleared Prelims fact yet.',
        mains: note.use,
        essay: '',
      },
    };
    var debate = [];
    if ((note.argumentsFor || [])[0] && (note.argumentsAgainst || [])[0]) {
      debate.push({
        left: note.argumentsFor[0],
        tension: 'vs',
        right: note.argumentsAgainst[0],
      });
    }
    base.layers.understand = {
      static_anchor: note.staticDefinition,
      how_it_works: note.background || [],
      what_changed: {
        before: (note.background && note.background[0]) || '',
        now: note.whyInNews,
        unresolved: (note.wayForward && note.wayForward[0]) || '',
      },
      dimensions: (note.indiaImplications || []).slice(0, 4).map(function (point) {
        return { label: 'India', points: [point] };
      }),
      debate: debate,
    };
    base.layers.deep_dive = {
      background: note.background || [],
      timeline: [],
      stakeholders: (note.reusableAnchors || []).map(function (row) { return row.label; }),
      arguments: note.argumentsFor || [],
      counterarguments: note.argumentsAgainst || [],
      way_forward: note.wayForward || [],
    };
    base.prelims.facts = (note.officialFacts || []).map(function (fact) { return fact.text; }).slice(0, 5);
    base.prelims.traps = (note.prelimsTraps || []).slice(0, 4);
    base.prelims.do_not_memorize = note.canMemorize
      ? []
      : ['Hard facts on this note are still held for verification.'];
    var practice = (note.mainsPractice || [])[0];
    base.mains.skeleton = practice && practice.skeleton ? practice.skeleton.slice(0, 6) : base.mains.skeleton;
    base.mains.opening_line = note.staticDefinition;
    base.mains.dimensions = (practice && practice.bodyDimensions) || [];
    base.mains.evidence = (note.reusableAnchors || []).slice(0, 4).map(function (row) { return row.label; });
    base.mains.counter_view = (note.argumentsAgainst && note.argumentsAgainst[0]) || '';
    base.mains.way_forward = note.wayForward || [];
    base.mains.closing_line = note.use;
    base.mains.questions = (note.mainsPractice || []).map(function (row) {
      return {
        paper: (note.papers && note.papers[0]) || 'GS2',
        marks: row.marks,
        directive: row.directive,
        question: row.stem,
      };
    });
    base.claims = (note.officialFacts || []).map(function (fact, index) {
      return {
        id: 'claim-' + (index + 1),
        text: fact.text,
        status: fact.verification === 'reviewed' || fact.verification === 'source-backed'
          ? 'verified' : 'provisional',
        source_ids: [note.sourceId],
      };
    });
    base.revision.eligible = note.canMemorize === true;
    base.read_minutes = 6;
    return base;
  }

  function buildPackets(sources, options) {
    var extras = options || {};
    var notes = {};
    (extras.notes || []).forEach(function (note) { notes[note.sourceId] = note; });
    return (Array.isArray(sources) ? sources : []).map(function (source) {
      var atlas = matchAtlas(source, extras.anchors);
      var pyqs = linkPyqs(atlas && atlas.id, extras.pyqIndex);
      var context = {
        atlas: atlas,
        pyqs: pyqs,
        pyqIndex: extras.pyqIndex,
        anchors: extras.anchors,
        subject: source.subject || extras.inferSubject && extras.inferSubject(source),
        source: source,
      };
      if (notes[source.id]) return packetFromExamNote(notes[source.id], context);
      return packetFromSource(Object.assign({}, source, { subject: context.subject }), context);
    }).filter(function (packet) { return packet && packet.id && packet.title; });
  }

  function comparePackets(a, b) {
    return b.priority_score - a.priority_score ||
      String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) ||
      a.id.localeCompare(b.id);
  }

  function buildTodayStack(packets, options) {
    var extras = options || {};
    var day = clean(extras.editionDate, 10);
    var rows = (Array.isArray(packets) ? packets : []).filter(function (packet) {
      if (!day) return true;
      return packet.date === day;
    }).slice().sort(comparePackets);
    var must = rows.filter(function (row) { return row.priority === 'must_know'; }).slice(0, 3);
    var useful = rows.filter(function (row) { return row.priority === 'useful'; }).slice(0, 3);
    var background = rows.filter(function (row) { return row.priority === 'background'; });
    var skip = rows.filter(function (row) { return row.priority === 'skip'; });
    var used = {};
    must.concat(useful).forEach(function (row) { used[row.id] = true; });
    var leftover = rows.filter(function (row) { return !used[row.id] && row.priority !== 'skip' && row.priority !== 'background'; });
    leftover.forEach(function (row) {
      if (must.length < 3 && row.priority_score >= 70) must.push(row);
      else if (useful.length < 3) useful.push(row);
      else background.push(row);
    });
    var essential = must.concat(useful);
    var read = essential.reduce(function (sum, row) { return sum + (row.read_minutes || 3); }, 0);
    return {
      editionDate: day || (rows[0] && rows[0].date) || '',
      must_know: must,
      useful: useful,
      background: background,
      skip: skip,
      essential_count: essential.length,
      read_minutes: read,
      recall_minutes: Math.min(8, essential.length * 2),
    };
  }

  function clusterByAnchor(packets) {
    var groups = {};
    (Array.isArray(packets) ? packets : []).forEach(function (packet) {
      var key = packet.story_cluster_id || packet.id;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          anchor: (packet.anchors[0] && packet.anchors[0].label) || packet.subjects[0] || packet.title,
          count: 0,
          packets: [],
          latest: packet,
        };
      }
      groups[key].count += 1;
      groups[key].packets.push(packet);
      if (String(packet.publishedAt || '') > String(groups[key].latest.publishedAt || '')) {
        groups[key].latest = packet;
      }
    });
    return Object.keys(groups).map(function (key) { return groups[key]; })
      .sort(function (a, b) { return b.count - a.count || comparePackets(a.latest, b.latest); });
  }

  function buildCatchUp(packets, options) {
    var extras = options || {};
    var days = Math.max(1, Math.min(30, Number(extras.days) || 7));
    var end = extras.editionDate ? Date.parse(extras.editionDate + 'T23:59:59Z') : Date.now();
    var start = end - ((days - 1) * 86400000);
    var windowed = (Array.isArray(packets) ? packets : []).filter(function (packet) {
      var time = Date.parse(packet.publishedAt || packet.date);
      return Number.isFinite(time) && time >= start && time <= end;
    });
    var clusters = clusterByAnchor(windowed).filter(function (cluster) {
      return cluster.anchor && cluster.count;
    });
    var discarded = windowed.filter(function (packet) { return packet.priority === 'skip'; });
    var kept = windowed.filter(function (packet) { return packet.priority !== 'skip'; });
    var facts = [];
    var debates = [];
    kept.forEach(function (packet) {
      (packet.prelims.facts || []).forEach(function (fact) {
        if (facts.indexOf(fact) === -1) facts.push(fact);
      });
      if (packet.layers.understand && packet.layers.understand.debate[0]) {
        debates.push(packet.layers.understand.debate[0]);
      } else if (packet.mains.questions[0]) {
        debates.push({
          left: packet.mains.questions[0].question,
          tension: packet.mains.questions[0].directive || 'examine',
          right: packet.anchors[0] ? packet.anchors[0].label : '',
        });
      }
    });
    return {
      days: days,
      editionDate: extras.editionDate || '',
      must_know: kept.filter(function (row) { return row.priority === 'must_know'; }),
      useful: kept.filter(function (row) { return row.priority === 'useful'; }),
      discarded: discarded,
      clusters: clusters.slice(0, 8),
      prelims_facts: facts.slice(0, 15),
      mains_debates: debates.slice(0, 5),
      test: {
        mcqs: Math.min(10, Math.max(3, facts.length)),
        skeletons: Math.min(2, debates.length || kept.length),
      },
      merged: clusters.filter(function (cluster) { return cluster.count > 1; }),
    };
  }

  function packetToNote(packet) {
    var row = packet || {};
    var debate = '';
    if (row.layers.understand && row.layers.understand.debate[0]) {
      debate = row.layers.understand.debate[0].left + ' / ' + row.layers.understand.debate[0].right;
    }
    return {
      title: row.title,
      anchor: (row.anchors[0] && row.anchors[0].label) || (row.subjects[0] || 'Current trigger'),
      codes: row.syllabus_codes,
      sourceId: row.sourceId || row.id,
      what: row.layers.brief && row.layers.brief.what_happened,
      why: (row.layers.brief && row.layers.brief.why_it_matters && row.layers.brief.why_it_matters[0]) || '',
      whyInNews: row.trigger && row.trigger.summary,
      debate: debate,
      use: (row.mains && row.mains.closing_line) || (row.layers.scan && row.layers.scan.why_upsc) || '',
      prelimsFact: (row.prelims.facts && row.prelims.facts[0]) || '',
      sourceUrl: row.sourceUrl,
      sourceName: row.publisherName,
      verified: row.hasExamNote && (row.status === 'source-backed' || row.status === 'reviewed'),
      score: row.priority_score,
      band: row.priority,
      origin: 'topic-packet',
      recallPayload: {
        officialFacts: (row.claims || []).map(function (claim) {
          return {
            text: claim.text,
            evidenceUrl: row.sourceUrl,
            evidenceLocator: 'officialSummary',
            verification: claim.status === 'verified' ? 'source-backed' : 'needs-review',
          };
        }),
        argumentsFor: row.layers.deep_dive ? row.layers.deep_dive.arguments : [],
        argumentsAgainst: row.layers.deep_dive ? row.layers.deep_dive.counterarguments : [],
        prelimsTraps: row.prelims.traps || [],
        mainsPractice: (row.mains.questions || []).map(function (question) {
          return {
            directive: question.directive,
            marks: question.marks,
            stem: question.question,
            skeleton: row.mains.skeleton,
          };
        }),
        use: row.mains.closing_line || '',
      },
    };
  }

  function searchPackets(packets, query) {
    var needle = clean(query, 160).toLowerCase();
    if (!needle) return Array.isArray(packets) ? packets : [];
    return (Array.isArray(packets) ? packets : []).filter(function (packet) {
      var hay = [
        packet.title, packet.trigger && packet.trigger.summary,
        (packet.subjects || []).join(' '),
        (packet.anchors || []).map(function (row) { return row.label; }).join(' '),
        (packet.syllabus_codes || []).join(' '),
        (packet.pyq_links || []).map(function (row) { return row.theme; }).join(' '),
      ].join(' ').toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
  }

  window.AnchorPacket = Object.freeze({
    BANDS: BANDS,
    BAND_LABELS: BAND_LABELS,
    CONTENT_TYPES: CONTENT_TYPES,
    WEIGHTS: WEIGHTS,
    scorePriority: scorePriority,
    bandLabel: function (band) { return BAND_LABELS[band] || 'Skip'; },
    inferContentType: inferContentType,
    matchAtlas: matchAtlas,
    linkPyqs: linkPyqs,
    packetFromSource: packetFromSource,
    packetFromExamNote: packetFromExamNote,
    buildPackets: buildPackets,
    buildTodayStack: buildTodayStack,
    buildCatchUp: buildCatchUp,
    clusterByAnchor: clusterByAnchor,
    packetToNote: packetToNote,
    searchPackets: searchPackets,
  });
})();
