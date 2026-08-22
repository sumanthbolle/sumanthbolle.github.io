/* Anchor — HTML builders. Kept apart from the wiring so the markup for an
 * entry is written once and reused by the brief, the notes list and the
 * lookup result. */
;(function () {
  'use strict';

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

  function safeHttpUrl(value) {
    try {
      var url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.toString();
    } catch (e) {
      return '';
    }
  }

  function anchorHtml(anchor) {
    return '<span class="an-anchor"><span class="an-label">Anchor</span> ' + esc(anchor) + '</span>';
  }

  function codesHtml(codes) {
    return (codes || []).map(function (code) {
      return '<span class="an-code">' + esc(code) + '</span>';
    }).join('');
  }

  function verifyHtml(verified, label) {
    return '<span class="an-verify" data-verified="' + (verified ? 'true' : 'false') + '">' +
      esc(label || (verified ? 'Primary source' : 'Unverified')) + '</span>';
  }

  function line(label, value) {
    if (!value) return '';
    return '<div class="an-line"><span class="an-label">' + esc(label) + '</span><p>' + esc(value) + '</p></div>';
  }

  function useHtml(use) {
    if (!use) return '';
    return '<p class="an-use"><span class="an-label">Use in an answer</span>' + esc(use) + '</p>';
  }

  function sourceLink(url, name) {
    var safeUrl = safeHttpUrl(url);
    if (!safeUrl) return '';
    return '<a href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">Open source' +
      (name ? ' · ' + esc(name) : '') + '</a>';
  }

  function editorialLabel(state) {
    return {
      'source-only': 'Source only',
      draft: 'Needs review',
      'source-backed': 'Exam note ready',
      reviewed: 'Reviewed note',
    }[state] || 'Source only';
  }

  function sourceEntry(record) {
    var safeUrl = safeHttpUrl(record.sourceUrl);
    var date = String(record.publishedAt || '').slice(0, 10);
    var scope = record.jurisdiction === 'IN' ? 'India' : 'International';
    return '<article class="an-source" data-source-id="' + attr(record.id) + '">' +
      '<div class="an-source__stamp">' +
        '<strong>' + esc(record.publisherName || record.publisherId) + '</strong>' +
        '<span class="an-num">' + esc(date) + '</span>' +
        '<span>' + esc(record.sourceType) + ' · ' + esc(scope) + '</span>' +
      '</div>' +
      '<div class="an-source__body">' +
        '<h3>' + esc(record.title) + '</h3>' +
        (record.officialSummary ? '<p class="an-source__summary">' + esc(record.officialSummary) + '</p>' : '') +
        '<p class="an-entry__tags">' +
          verifyHtml(record.sourceVerified, record.sourceVerified ? 'Reviewed official host' : 'Unverified host') +
          '<span>' + esc(editorialLabel(record.editorialState)) + '</span>' +
          (record.priority ? '<span class="an-num">Priority ' + esc(record.priority) + '</span>' : '') +
          codesHtml(record.codes) +
        '</p>' +
        (safeUrl ? '<a class="an-source__link" href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">Open official record</a>' : '') +
      '</div>' +
    '</article>';
  }

  function coverageStatus(coverage) {
    var sources = coverage && coverage.sources && typeof coverage.sources === 'object'
      ? coverage.sources : {};
    var ids = Object.keys(sources);
    if (!ids.length) return '<p>Coverage report unavailable. The last valid source archive remains readable.</p>';
    var healthy = ids.filter(function (id) { return sources[id].status === 'ok'; }).length;
    var failures = ids.filter(function (id) { return sources[id].status !== 'ok'; });
    return '<p><strong>' + esc(healthy) + ' of ' + esc(ids.length) + '</strong> official adapters healthy' +
      (coverage.generatedAt ? ' · checked ' + esc(String(coverage.generatedAt).slice(0, 16).replace('T', ' ')) + ' UTC' : '') +
      '.</p>' +
      (failures.length ? '<p class="an-coverage__warn">Unavailable now: ' + failures.map(esc).join(', ') +
        '. Their last valid archive is preserved.</p>' : '');
  }

  function compactText(value, max) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  function simpleList(rows, className) {
    var values = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!values.length) return '';
    return '<ul' + (className ? ' class="' + attr(className) + '"' : '') + '>' +
      values.map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') + '</ul>';
  }

  function subjectHref(subjectId) {
    var id = encodeURIComponent(String(subjectId || ''));
    return '?view=brief&amp;subject=' + id + '#daily-' + id;
  }

  function topicOfDay(topic) {
    if (!topic) return '';
    var subject = topic.subject || {};
    var safeUrl = safeHttpUrl(topic.sourceUrl);
    var sourceSummary = compactText(topic.officialSummary || '', 1500);
    var sourceHasAbstract = sourceSummary && sourceSummary.toLowerCase() !== String(topic.title || '').toLowerCase() &&
      sourceSummary.length >= 24;
    var title = safeUrl
      ? '<a href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(topic.title) + '</a>'
      : esc(topic.title);
    return '<article class="an-today-topic" data-source-id="' + attr(topic.id) + '">' +
      '<aside class="an-study-margin"><span>Lead</span><a href="' + subjectHref(subject.id) + '" data-subject-jump="' +
        attr(subject.id) + '">' +
        esc(subject.label || 'Current affairs') + '</a><strong>' + esc(subject.paper || 'GS') + '</strong></aside>' +
      '<div class="an-topic__body"><p class="an-topic__eyebrow"><time datetime="' + attr(topic.publishedAt) + '">' +
        esc(String(topic.publishedAt || '').slice(0, 10)) + '</time></p><h2>' + title + '</h2>' +
        (sourceHasAbstract ? '<p class="an-topic__dek">' + esc(sourceSummary) + '</p>' : '') +
        '<footer><span>' + esc(topic.publisherName || '') + '</span>' +
          (safeUrl ? '<a href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">Read article <span aria-hidden="true">↗</span></a>' : '') +
        '</footer></div></article>';
  }

  function dailyEdition(edition) {
    var groups = edition && Array.isArray(edition.groups) ? edition.groups : [];
    if (!groups.length) return '';
    return groups.map(function (group) {
      var subject = group.subject || {};
      return '<section class="an-daily-group" id="daily-' + attr(subject.id) + '">' +
        '<header><p class="an-label">' + esc(subject.paper) + '</p><h3><a href="' + subjectHref(subject.id) + '" data-subject-jump="' +
          attr(subject.id) + '">' +
          esc(subject.label) + '</a></h3></header>' +
        '<div class="an-daily-list">' + group.items.map(function (item) {
          var safeUrl = safeHttpUrl(item.sourceUrl);
          var titleText = compactText(item.title, 520).toLowerCase();
          var summaryText = compactText(item.officialSummary || '', 520);
          var feedHasAbstract = summaryText && summaryText.toLowerCase() !== titleText && summaryText.length >= 24;
          return '<article class="an-daily-item" data-source-id="' + attr(item.id) + '">' +
            '<p class="an-daily-item__meta"><span>' + esc(item.publisherName) + '</span><time datetime="' +
              attr(item.publishedAt) + '">' + esc(String(item.publishedAt || '').slice(0, 10)) + '</time></p>' +
            '<h4>' + (safeUrl ? '<a href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">' +
              esc(item.title) + '</a>' : esc(item.title)) + '</h4>' +
            (feedHasAbstract ? '<p class="an-daily-item__summary">' + esc(summaryText) + '</p>' : '') +
          '</article>';
        }).join('') + '</div></section>';
    }).join('');
  }

  function subjectShelves(subjects) {
    return (Array.isArray(subjects) ? subjects : []).map(function (subject) {
      return '<article class="an-subject" data-subject="' + attr(subject.id) + '">' +
        '<p class="an-subject__paper">' + esc(subject.paper) + '</p><h3>' + esc(subject.label) + '</h3>' +
        '<p class="an-subject__count">' + esc(subject.currentCount) + ' current updates</p>' +
        '<ul class="an-subject__topics">' + (subject.coreTopics || []).map(function (topic) {
          return '<li><a href="' + subjectHref(subject.id) + '" data-subject-jump="' +
            attr(subject.id) + '">' + esc(topic) + '</a></li>';
        }).join('') + '</ul>' +
        '<a class="an-subject__open" href="' + subjectHref(subject.id) + '" data-subject-jump="' +
          attr(subject.id) + '">Current articles</a>' +
      '</article>';
    }).join('');
  }

  /* A brief item. The margin carries the triage score; the highlighted Use
   * line carries the only sentence that has to survive to the exam hall. */
  function briefEntry(item) {
    var expandable = item.what || item.why || item.debate || item.prelimsFact;
    return '<li class="an-entry" data-id="' + attr(item.id) + '" data-band="' + attr(item.band) + '">' +
      '<div class="an-entry__margin">' +
        '<span class="an-entry__score" title="Revision priority, not a prediction">' + esc(item.score) + '</span>' +
        '<span class="an-entry__band">' + esc(item.bandLabel) + '</span>' +
      '</div>' +
      '<div class="an-entry__body">' +
        '<h3 class="an-entry__title">' + esc(item.title) + '</h3>' +
        '<p class="an-entry__tags">' +
          anchorHtml(item.anchor) +
          codesHtml(item.codes) +
          (item.date ? '<span class="an-num">' + esc(item.date) + '</span>' : '') +
          verifyHtml(item.verified, item.verified ? 'Primary source' : 'Secondary coverage') +
        '</p>' +
        useHtml(item.use) +
        (expandable
          ? '<details class="an-entry__expand"><summary>Full note</summary>' +
              '<div class="an-lines">' +
                line('What', item.what) +
                line('Why', item.why) +
                line('Debate', item.debate) +
                line('Prelims', item.prelimsFact) +
              '</div>' +
              '<p class="an-treatment">' + esc(item.treatment) + '</p>' +
            '</details>'
          : '') +
        '<div class="an-entry__actions">' +
          '<button type="button" class="btn btn-sm" data-act="save" data-id="' + attr(item.id) + '">Save to notes</button>' +
          sourceLink(item.sourceUrl, item.sourceName) +
          /* When the anchor resolves to the standing compilation, offer the
           * twenty-year pattern behind it — the static half of the question. */
          (item.anchorId
            ? '<a href="upsc-patterns.html?anchor=' + attr(item.anchorId) + '">20-year pattern</a>'
            : '') +
        '</div>' +
      '</div>' +
    '</li>';
  }

  function noteEntry(note, dueText, dueNow) {
    var expandable = note.what || note.why || note.debate || note.prelimsFact;
    return '<li class="an-entry" data-id="' + attr(note.id) + '" data-band="' + attr(note.band || 'strong') + '">' +
      '<div class="an-entry__margin">' +
        (note.score === null || note.score === undefined
          ? '<span class="an-entry__band">Own</span>'
          : '<span class="an-entry__score">' + esc(note.score) + '</span>') +
        '<span class="an-entry__band">D' + esc(AnchorStore.intervals[note.stage || 0]) + '</span>' +
      '</div>' +
      '<div class="an-entry__body">' +
        '<h3 class="an-entry__title">' + esc(note.title) + '</h3>' +
        '<p class="an-entry__tags">' +
          anchorHtml(note.anchor) +
          codesHtml(note.codes) +
          '<span class="an-note__due" data-due="' + (dueNow ? 'now' : 'later') + '">' + esc(dueText) + '</span>' +
          verifyHtml(note.verified, note.verified ? 'Primary source' : 'Unverified') +
        '</p>' +
        useHtml(note.use) +
        (expandable
          ? '<details class="an-entry__expand"><summary>Full note</summary><div class="an-lines">' +
              line('What', note.what) +
              line('Why', note.why) +
              line('Debate', note.debate) +
              line('Prelims', note.prelimsFact) +
            '</div></details>'
          : '') +
        '<div class="an-entry__actions">' +
          sourceLink(note.sourceUrl, note.sourceName) +
          '<button type="button" class="btn btn-sm btn-quiet" data-act="delete" data-id="' + attr(note.id) + '">Delete</button>' +
        '</div>' +
      '</div>' +
    '</li>';
  }

  function clusters(list) {
    return list.map(function (cluster) {
      return '<li class="an-cluster">' +
        '<h4>' + esc(cluster.anchor) + '</h4>' +
        '<p>' + esc(cluster.synthesis) + '</p>' +
        (cluster.codes && cluster.codes.length
          ? '<p class="an-entry__tags">' + codesHtml(cluster.codes) + '</p>'
          : '') +
      '</li>';
    }).join('');
  }

  function discards(list) {
    return list.map(function (row) {
      return '<li><span>' + esc(row.headline) + '</span><span>' + esc(row.failedTest) + '</span></li>';
    }).join('');
  }

  var VALUE_ADD_LABELS = {
    constitutional: 'Constitutional',
    judicial: 'Judicial',
    committee: 'Committee',
    data: 'Data',
    scheme: 'Scheme',
    international: 'International',
    thinker: 'Thinker',
  };

  function lookupNote(note) {
    var parts = [];
    var safeSources = (note.sources || []).map(function (row) {
      var url = safeHttpUrl(row && row.url);
      if (!url) return null;
      return {
        title: row.title,
        url: url,
        source: row.source,
        primary: row.primary,
      };
    }).filter(Boolean);

    parts.push('<div class="an-lookup__head">' +
      '<p class="an-entry__tags">' +
        anchorHtml(note.anchor) +
        codesHtml(note.codes) +
        verifyHtml(note.verified, note.verified ? 'Primary source cited' : 'No primary source cited') +
      '</p>' +
      '<h3>' + esc(note.topic) + '</h3>' +
      (note.oneLiner ? '<p class="an-lookup__oneliner">' + esc(note.oneLiner) + '</p>' : '') +
    '</div>');

    parts.push('<div class="an-block"><h3>Points</h3>' +
      '<ol class="an-points">' + note.points.map(function (point) {
        return '<li>' + esc(point) + '</li>';
      }).join('') + '</ol></div>');

    if (note.valueAdds.length) {
      parts.push('<div class="an-block"><h3>Value-adds</h3>' +
        '<ul class="an-valueadds">' + note.valueAdds.map(function (row) {
          return '<li>' +
            '<span class="an-label">' + esc(VALUE_ADD_LABELS[row.type] || row.type) + '</span>' +
            '<div><strong>' + esc(row.item) + '</strong><p>' + esc(row.note) + '</p></div>' +
          '</li>';
        }).join('') + '</ul></div>');
    }

    if (note.debateFor.length || note.debateAgainst.length) {
      parts.push('<div class="an-block"><h3>The debate</h3><div class="an-two">' +
        '<div><span class="an-label">For</span><ul class="an-list">' +
          note.debateFor.map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') +
        '</ul></div>' +
        '<div><span class="an-label">Against</span><ul class="an-list">' +
          note.debateAgainst.map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') +
        '</ul></div>' +
      '</div></div>');
    }

    if (note.prelimsFacts.length) {
      parts.push('<div class="an-block"><h3>Prelims facts</h3><ul class="an-list">' +
        note.prelimsFacts.map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') +
      '</ul></div>');
    }

    if (note.questionStems.length) {
      parts.push('<div class="an-block"><h3>Probable stems</h3>' +
        '<ul class="an-stems">' + note.questionStems.map(function (stem) {
          return '<li class="an-stem"><p>' + esc(stem.stem) + '</p>' +
            '<p class="an-stem__meta">' +
              '<span class="an-stem__verb">' + esc(stem.verb) + '</span>' +
              '<span>' + esc(stem.paper) + '</span>' +
              '<span class="an-num">' + esc(stem.marks) + ' marks</span>' +
            '</p></li>';
        }).join('') + '</ul></div>');
    }

    if (note.trap) {
      parts.push('<div class="an-trap"><span class="an-label">Where marks are lost</span><p>' + esc(note.trap) + '</p></div>');
    }

    if (safeSources.length) {
      parts.push('<div class="an-block"><h3>Sources</h3><ul class="an-sources">' +
        safeSources.map(function (row) {
          return '<li><a href="' + attr(row.url) + '" target="_blank" rel="noopener noreferrer">' + esc(row.title) + '</a> ' +
            '<span>' + esc(row.source) + (row.primary ? ' · primary' : '') + '</span></li>';
        }).join('') + '</ul></div>');
    }

    parts.push('<div class="an-entry__actions" style="margin-top:24px">' +
      '<button type="button" class="btn btn-primary" data-act="save-lookup">Save this as a note</button>' +
      '</div>' +
      '<p class="an-treatment">' + esc(note.scoring.note) + '</p>');

    return parts.join('');
  }

  function listSection(title, rows, className) {
    if (!rows || !rows.length) return '';
    return '<section class="an-note-section ' + attr(className || '') + '">' +
      '<h4>' + esc(title) + '</h4><ul class="an-list">' + rows.map(function (row) {
        return '<li>' + esc(row) + '</li>';
      }).join('') + '</ul></section>';
  }

  function answerOutline(practice) {
    var row = practice || {};
    var skeleton = row.skeleton && row.skeleton.length
      ? row.skeleton
      : (row.introChoices || []).concat(row.bodyDimensions || [],
        row.counterPosition || '', row.conclusionPrompt || '').filter(Boolean);
    return '<article class="an-answer-outline">' +
      '<h4>' + esc(row.stem) + '</h4>' +
      '<p class="an-answer-outline__meta"><strong>' + esc(row.directive) + '</strong>' +
        '<span class="an-num">' + esc(row.marks) + ' marks</span>' +
        '<span class="an-num">' + esc(row.wordBudget) + ' words</span>' +
        '<span class="an-num">' + esc(row.timeMinutes) + ' minutes</span></p>' +
      (skeleton.length ? '<ol class="an-answer-outline__steps">' + skeleton.map(function (item) {
        return '<li>' + esc(item) + '</li>';
      }).join('') + '</ol>' : '') +
      (row.diagramSuggestion ? '<p><span class="an-label">Diagram</span> ' + esc(row.diagramSuggestion) + '</p>' : '') +
    '</article>';
  }

  function examSummary(note, options) {
    var value = note || {};
    var loading = options && options.loading === true;
    return '<article class="an-exam-summary" data-source-id="' + attr(value.sourceId) + '">' +
      '<div class="an-exam-summary__score"><strong class="an-num">' + esc(value.priority) +
        '</strong><span>priority</span></div>' +
      '<div><p class="an-entry__tags">' + anchorHtml(value.anchor) + codesHtml(value.codes) +
        '<span>' + esc(editorialLabel(value.editorialStatus)) + '</span></p>' +
        '<h3>' + esc(value.title) + '</h3>' +
        (value.whyInNews ? '<p>' + esc(value.whyInNews) + '</p>' : '') +
        useHtml(value.use) +
        '<p class="an-exam-summary__meta">' + esc(value.publisherName) + ' · ' +
          esc(String(value.publishedAt || '').slice(0, 10)) + ' · Priority ' + esc(value.priority) + '</p>' +
        '<button type="button" class="btn btn-sm" data-act="open-exam" data-id="' +
          attr(value.sourceId) + '"' + (loading ? ' disabled' : '') + '>' +
          (loading ? 'Loading note…' : 'Read topper note') + '</button>' +
      '</div></article>';
  }

  function examNote(note, options) {
    var value = note || {};
    var opts = options || {};
    var safeUrl = safeHttpUrl(value.sourceUrl);
    var revealed = opts.revealed === true;
    var recallId = 'recall-' + String(value.sourceId || '').replace(/[^a-z0-9_-]/gi, '');
    var ready = value.canMemorize === true;
    var status = editorialLabel(value.editorialStatus);
    var background = listSection('Background', value.background, 'an-note-section--analysis');
    var implications = listSection('India implications', value.indiaImplications, 'an-note-section--analysis');
    var wayForward = listSection('Way forward', value.wayForward, 'an-note-section--analysis');
    var reusable = value.reusableAnchors && value.reusableAnchors.length
      ? '<section class="an-note-section an-note-section--analysis"><h4>Reusable anchors</h4><ul class="an-valueadds">' +
          value.reusableAnchors.map(function (row) {
            return '<li><span class="an-label">' + esc(row.kind) + '</span><strong>' + esc(row.label) + '</strong></li>';
          }).join('') + '</ul></section>'
      : '';
    var facts = value.officialFacts && value.officialFacts.length
      ? '<section class="an-note-section an-note-section--facts"><h4>Official facts</h4><ul class="an-facts">' +
          value.officialFacts.map(function (fact) {
            var evidence = safeHttpUrl(fact.evidenceUrl);
            var backed = fact.verification === 'source-backed' || fact.verification === 'reviewed';
            return '<li><span class="an-label">Official fact</span><p>' + esc(fact.text) + '</p>' +
              '<p class="an-entry__tags">' + verifyHtml(backed, backed ? 'Source-backed' : 'Needs review') +
              (evidence ? '<a href="' + attr(evidence) + '" target="_blank" rel="noopener noreferrer">Evidence · ' +
                esc(fact.evidenceLocator) + '</a>' : '') + '</p></li>';
          }).join('') + '</ul></section>'
      : '<section class="an-note-section an-note-section--facts"><h4>Official facts</h4><p>No hard fact cleared the evidence gate.</p></section>';
    var argumentsBlock = '<section class="an-note-section an-note-section--analysis"><h4>Arguments</h4>' +
      '<span class="an-label">Analysis</span><div class="an-two">' +
      '<div><strong>For</strong><ul class="an-list">' + (value.argumentsFor || []).map(function (row) {
        return '<li>' + esc(row) + '</li>';
      }).join('') + '</ul></div>' +
      '<div><strong>Against</strong><ul class="an-list">' + (value.argumentsAgainst || []).map(function (row) {
        return '<li>' + esc(row) + '</li>';
      }).join('') + '</ul></div></div></section>';
    var traps = '<section class="an-note-section"><h4>Prelims traps</h4>' +
      ((value.prelimsTraps || []).length ? '<ul class="an-traps">' + value.prelimsTraps.map(function (trap) {
        return '<li><strong>' + esc(trap.correct ? 'Correct' : 'Incorrect') + ':</strong> ' +
          esc(trap.statement) + '<p>' + esc(trap.explanation) + '</p></li>';
      }).join('') + '</ul>' : '<p>No source-safe trap was published.</p>') + '</section>';
    var practice = '<section class="an-note-section"><h4>Mains practice</h4>' +
      (value.mainsPractice || []).map(answerOutline).join('') + '</section>';

    return '<article class="an-dossier" data-source-id="' + attr(value.sourceId) + '">' +
      '<aside class="an-dossier__source"><span class="an-label">Source stamp</span>' +
        '<strong>' + esc(value.publisherName || 'Official source') + '</strong>' +
        '<span class="an-num">' + esc(String(value.publishedAt || '').slice(0, 10)) + '</span>' +
        '<span>' + esc(status) + '</span>' +
        '<span class="an-num">Priority ' + esc(value.priority) + '</span>' +
        (safeUrl ? '<a href="' + attr(safeUrl) + '" target="_blank" rel="noopener noreferrer">Open official record</a>' : '') +
      '</aside>' +
      '<div class="an-dossier__issue"><h3>' + esc(value.title) + '</h3>' +
        '<p class="an-entry__tags">' + anchorHtml(value.anchor) + codesHtml(value.codes) + '</p>' +
        '<section class="an-note-section an-note-section--analysis"><h4>Why in news</h4><span class="an-label">Analysis</span><p>' + esc(value.whyInNews) + '</p></section>' +
        '<section class="an-note-section an-note-section--analysis"><h4>Static anchor</h4><span class="an-label">Analysis</span><p>' + esc(value.staticDefinition) + '</p></section>' +
        background + reusable + facts + argumentsBlock + implications + wayForward + traps + practice +
        '<section class="an-note-section an-note-section--use"><h4>Use in an answer</h4><p>' + esc(value.use) + '</p></section>' +
        '<section class="an-note-section"><h4>Recall card</h4><p>' + esc(value.recallCard) + '</p></section>' +
      '</div>' +
      '<aside class="an-dossier__recall"><span class="an-label">Recall margin</span>' +
        '<ol><li>What is the static anchor?</li><li>Why does this matter structurally?</li>' +
          '<li>What are the two positions?</li><li>What exact line would you use?</li></ol>' +
        '<button type="button" class="btn btn-sm" data-act="reveal-exam" aria-expanded="' +
          (revealed ? 'true' : 'false') + '" aria-controls="' + attr(recallId) + '">' +
          (revealed ? 'Hide recall' : 'Reveal recall') + '</button>' +
        '<div id="' + attr(recallId) + '"' + (revealed ? '' : ' hidden') + '>' +
          '<p><strong>' + esc(value.anchor) + '</strong></p><p>' + esc(value.whyInNews) + '</p>' +
          '<p>' + esc((value.argumentsFor || [])[0]) + ' / ' + esc((value.argumentsAgainst || [])[0]) + '</p>' +
          '<p>' + esc(value.use) + '</p></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="save-exam" data-id="' +
          attr(value.sourceId) + '"' + (ready ? '' : ' disabled') + '>Save for recall</button>' +
      '</aside>' +
    '</article>';
  }

  function syllabusAnchor(group) {
    var row = group || {};
    return '<article class="an-syllabus-anchor">' +
      '<p class="an-entry__tags"><span class="an-code">' + esc(row.code) + '</span>' +
        '<span class="an-num">' + esc((row.noteIds || []).length) + ' triggers</span></p>' +
      '<h3>' + esc(row.anchor) + '</h3>' +
      (row.staticDefinition ? '<p>' + esc(row.staticDefinition) + '</p>' : '') +
      ((row.reusableAnchors || []).length ? '<ul class="an-valueadds">' +
        row.reusableAnchors.map(function (item) {
          return '<li><span class="an-label">' + esc(item.kind) + '</span><strong>' + esc(item.label) + '</strong></li>';
        }).join('') + '</ul>' : '') +
      ((row.monthlySyntheses || []).length ? '<p class="an-treatment">Monthly synthesis available for ' +
        esc(row.monthlySyntheses[0].month) + '.</p>' : '') +
    '</article>';
  }

  function memoryDrill(drill, note, index, total) {
    var value = drill || {};
    var parent = note || {};
    var answerId = 'drill-answer-' + String(parent.id || '').replace(/[^a-z0-9_-]/gi, '');
    var kind = {
      cloze: 'Source-backed cloze',
      'prelims-trap': 'Prelims statement trap',
      skeleton: '10-second answer skeleton',
      recall: 'Cover · blurt · check',
    }[value.type] || 'Recall drill';
    var answer = '';
    if (value.type === 'cloze') {
      var evidence = safeHttpUrl(value.evidenceUrl);
      answer = '<p><strong>' + esc(value.answer) + '</strong></p>' +
        (value.fact ? '<p>' + esc(value.fact) + '</p>' : '') +
        (evidence ? '<a href="' + attr(evidence) + '" target="_blank" rel="noopener noreferrer">Open evidence · ' +
          esc(value.evidenceLocator) + '</a>' : '');
    } else if (value.type === 'prelims-trap') {
      answer = '<p><strong>' + esc(value.answer ? 'Correct' : 'Incorrect') + '</strong></p><p>' +
        esc(value.explanation) + '</p>';
    } else if (value.type === 'skeleton') {
      answer = '<p class="an-entry__tags"><strong>' + esc(value.directive) + '</strong><span class="an-num">' +
        esc(value.marks) + ' marks</span></p><ol>' + (value.answer || []).map(function (row) {
          return '<li>' + esc(row) + '</li>';
        }).join('') + '</ol>';
    } else {
      var recall = value.answer || {};
      answer = '<p><strong>' + esc(recall.anchor) + '</strong></p><p>' + esc(recall.whyInNews) + '</p>' +
        '<p>' + esc((recall.argumentsFor || [])[0]) + ' / ' + esc((recall.argumentsAgainst || [])[0]) +
        '</p><p>' + esc(recall.use) + '</p>';
    }
    var prompt = value.type === 'recall'
      ? '<ol>' + (value.questions || []).map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') + '</ol>'
      : '<p class="an-memory-drill__prompt">' + esc(value.prompt) + '</p>';
    return '<article class="an-card an-memory-drill" data-id="' + attr(parent.id) + '">' +
      '<p class="an-revise__progress">' + esc(index + 1) + ' of ' + esc(total) + ' · ' + esc(kind) + '</p>' +
      '<h3>' + esc(parent.title) + '</h3>' + prompt +
      '<button type="button" class="btn" data-act="drill-reveal" aria-expanded="false" aria-controls="' +
        attr(answerId) + '">Reveal answer</button>' +
      '<div class="an-memory-drill__answer" data-drill-answer id="' + attr(answerId) + '" hidden>' + answer + '</div>' +
      '<div class="an-revise__actions">' +
        '<button type="button" class="btn btn-primary" data-act="drill-pass" hidden>Reconstructed it</button>' +
        '<button type="button" class="btn" data-act="drill-fail" hidden>Missed it</button>' +
      '</div></article>';
  }

  function priorityBadge(band) {
    var label = {
      must_know: 'Must Know',
      useful: 'Useful',
      background: 'Background',
      skip: 'Skip',
    }[band] || 'Skip';
    return '<span class="pk-badge" data-priority="' + attr(band || 'skip') + '">' + esc(label) + '</span>';
  }

  function paperBadges(papers) {
    return (papers || []).map(function (paper) {
      return '<span class="pk-paper">' + esc(paper) + '</span>';
    }).join('');
  }

  function listBlock(title, rows) {
    var values = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!values.length) return '';
    return '<section class="pk-block"><h3>' + esc(title) + '</h3><ul>' +
      values.map(function (row) { return '<li>' + esc(row) + '</li>'; }).join('') +
      '</ul></section>';
  }

  function topicCard(packet) {
    var row = packet || {};
    var why = (row.layers && row.layers.scan && row.layers.scan.why_upsc) || '';
    var changed = (row.trigger && row.trigger.summary) || '';
    var prelims = (row.prelims && row.prelims.facts) ? row.prelims.facts.length : 0;
    var mains = (row.mains && row.mains.questions) ? row.mains.questions.length : 0;
    var pyq = (row.pyq_links || []).length;
    var anchor = row.anchors && row.anchors[0] ? row.anchors[0] : null;
    return '<article class="pk-card" data-packet-id="' + attr(row.id) + '" data-priority="' + attr(row.priority) + '">' +
      '<p class="pk-card__meta">' + priorityBadge(row.priority) + paperBadges(row.papers) +
        (row.subjects && row.subjects[0] ? '<span class="pk-subject">' + esc(row.subjects[0]) + '</span>' : '') +
        '<span class="pk-read">' + esc(row.read_minutes || 3) + ' min</span></p>' +
      '<h3>' + esc(row.title) + '</h3>' +
      (changed ? '<p class="pk-card__changed">' + esc(compactText(changed, 180)) + '</p>' : '') +
      (why ? '<p class="pk-card__why"><span>Why UPSC cares</span> ' + esc(why) + '</p>' : '') +
      (anchor ? '<p class="pk-card__anchor">Static anchor: <a href="upsc-patterns.html?anchor=' +
        attr(anchor.id) + '">' + esc(anchor.label) + '</a></p>' : '') +
      '<p class="pk-card__counts">Prelims: ' + esc(prelims) + ' facts · Mains: ' + esc(mains) +
        ' questions · PYQ: ' + esc(pyq) + ' related</p>' +
      '<div class="pk-card__actions">' +
        '<button type="button" class="btn btn-sm" data-act="open-packet" data-id="' + attr(row.id) + '" data-layer="brief">60 sec</button>' +
        '<button type="button" class="btn btn-sm" data-act="open-packet" data-id="' + attr(row.id) + '" data-layer="understand">Understand in 5 min</button>' +
        '<button type="button" class="btn btn-sm btn-quiet" data-act="open-packet" data-id="' + attr(row.id) + '" data-layer="master">Master the topic</button>' +
        '<button type="button" class="btn btn-sm btn-quiet" data-act="save-packet" data-id="' + attr(row.id) + '">Add to revision</button>' +
      '</div></article>';
  }

  function todayHero(stack, options) {
    var value = stack || {};
    var extras = options || {};
    var date = extras.dateLabel || value.editionDate || 'Today';
    return '<section class="pk-hero" aria-labelledby="todayHeroTitle">' +
      '<p class="an-label">Worth your time today</p>' +
      '<h2 id="todayHeroTitle">UPSC Today — ' + esc(date) + '</h2>' +
      '<p class="pk-hero__budget"><strong>' + esc(value.essential_count || 0) + '</strong> essential topics · ' +
        '<strong>' + esc(value.read_minutes || 0) + '</strong> min reading · ' +
        '<strong>' + esc(value.recall_minutes || 0) + '</strong> min recall</p>' +
      '<p class="pk-hero__note">Study priority, not a prediction of the paper.</p>' +
      '<div class="pk-hero__actions">' +
        '<button type="button" class="btn btn-primary" data-act="start-session">Start 15-minute session</button>' +
        '<button type="button" class="btn" data-act="session-mode" data-mode="prelims">Prelims mode</button>' +
        '<button type="button" class="btn" data-act="session-mode" data-mode="mains">Mains mode</button>' +
        '<a class="btn" href="?view=catchup" data-view="catchup">7-day catch-up</a>' +
      '</div></section>';
  }

  function dueStrip(stats) {
    var value = stats || {};
    if (!value.due) return '';
    return '<section class="pk-due" aria-label="Due revision">' +
      '<p><strong>' + esc(value.due) + '</strong> items due for retrieval.</p>' +
      '<a href="?view=memory">Revisit today</a></section>';
  }

  function repeatedThemes(clusters) {
    var rows = (Array.isArray(clusters) ? clusters : []).filter(function (row) { return row.count > 1; }).slice(0, 6);
    if (!rows.length) return '';
    return '<section class="pk-themes" aria-labelledby="weekThemesTitle">' +
      '<h3 id="weekThemesTitle">Themes gaining weight this week</h3><ul>' +
      rows.map(function (row) {
        var href = row.latest && row.latest.atlas
          ? 'upsc-patterns.html?anchor=' + attr(row.latest.atlas.id)
          : '?view=catchup';
        return '<li><a href="' + href + '">' + esc(row.anchor) + '</a> · ' +
          esc(row.count) + ' triggers</li>';
      }).join('') + '</ul></section>';
  }

  function stackSection(title, packets, empty) {
    var rows = Array.isArray(packets) ? packets : [];
    if (!rows.length) return empty ? '<section class="pk-stack"><h3>' + esc(title) + '</h3><p class="pk-empty">' + esc(empty) + '</p></section>' : '';
    return '<section class="pk-stack" data-stack="' + attr(title) + '"><h3>' + esc(title) + '</h3>' +
      rows.map(topicCard).join('') + '</section>';
  }

  function layerSwitcher(active) {
    var current = active || 'brief';
    var layers = [
      { id: 'brief', label: '60 sec' },
      { id: 'understand', label: 'Understand in 5 min' },
      { id: 'master', label: 'Master the topic' },
    ];
    return '<div class="pk-layers" role="tablist" aria-label="Reading depth">' +
      layers.map(function (layer) {
        var selected = layer.id === current;
        return '<button type="button" role="tab" aria-selected="' + (selected ? 'true' : 'false') +
          '" data-act="packet-layer" data-layer="' + attr(layer.id) + '">' + esc(layer.label) + '</button>';
      }).join('') + '</div>';
  }

  function debateMatrix(rows) {
    var values = Array.isArray(rows) ? rows : [];
    if (!values.length) return '';
    return '<section class="pk-block"><h3>Debate</h3><div class="pk-matrix">' +
      values.map(function (row) {
        return '<div class="pk-matrix__row"><span>' + esc(row.left) + '</span><span>' +
          esc(row.tension || 'vs') + '</span><span>' + esc(row.right) + '</span></div>';
      }).join('') + '</div></section>';
  }

  function sourceStrip(packet) {
    var sources = (packet && packet.sources) || [];
    var claims = (packet && packet.claims) || [];
    var verified = claims.filter(function (row) { return row.status === 'verified'; }).length;
    var opinion = claims.filter(function (row) { return row.status === 'opinion'; }).length;
    var open = claims.filter(function (row) { return row.status === 'provisional' || row.status === 'contested'; }).length;
    return '<section class="pk-sources"><h3>Sources</h3><ul>' +
      sources.map(function (row) {
        var url = safeHttpUrl(row.url);
        var mark = row.tier <= 2 ? '✓' : '○';
        var role = row.tier <= 2 ? 'primary' : 'context';
        return '<li><span aria-hidden="true">' + mark + '</span> ' +
          (url ? '<a href="' + attr(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(row.publisher) + '</a>' : esc(row.publisher)) +
          ' — ' + esc(role) + '</li>';
      }).join('') + '</ul>' +
      '<p class="pk-sources__meta">Verified facts: ' + esc(verified) +
        ' · Opinion statements: ' + esc(opinion) +
        ' · Open/contested: ' + esc(open) +
        (packet && packet.date ? ' · Last checked: ' + esc(packet.date) : '') +
        '</p><p class="pk-sources__note">' + esc((packet && packet.priority_note) || '') + '</p></section>';
  }

  function prelimsVault(packet) {
    var vault = (packet && packet.prelims) || {};
    var traps = vault.traps || [];
    return '<section class="pk-vault" id="packet-vault"><h3>Prelims Vault</h3>' +
      listBlock('Must remember', (vault.facts || []).slice(0, 5)).replace('pk-block', 'pk-block pk-vault__facts') +
      ((vault.confusing_pairs || []).length ? listBlock('Confusing pairs', vault.confusing_pairs) : '') +
      (traps.length ? '<section class="pk-block"><h3>Statement traps</h3><ul class="pk-traps">' +
        traps.map(function (trap) {
          return '<li><strong>' + esc(trap.correct ? 'Correct' : 'Incorrect') + ':</strong> ' +
            esc(trap.statement) + (trap.explanation ? '<p>' + esc(trap.explanation) + '</p>' : '') + '</li>';
        }).join('') + '</ul></section>' : '') +
      ((vault.do_not_memorize || []).length ? listBlock('Do not memorize', vault.do_not_memorize) : '') +
      (traps.length ? '<button type="button" class="btn btn-sm" data-act="test-packet" data-id="' +
        attr(packet.id) + '">Test recall</button>' : '') +
      '</section>';
  }

  function mainsKit(packet) {
    var kit = (packet && packet.mains) || {};
    return '<section class="pk-kit" id="packet-kit"><h3>Mains Kit</h3>' +
      (kit.opening_line ? '<p class="pk-kit__open"><span>Opening line</span> ' + esc(kit.opening_line) + '</p>' : '') +
      ((kit.skeleton || []).length ? '<ol class="pk-skeleton">' + kit.skeleton.map(function (row) {
        return '<li>' + esc(row) + '</li>';
      }).join('') + '</ol>' : '') +
      listBlock('Evidence bank', kit.evidence) +
      (kit.counter_view ? '<p><span class="an-label">Counter-view</span> ' + esc(kit.counter_view) + '</p>' : '') +
      listBlock('Way forward', kit.way_forward) +
      (kit.closing_line ? '<p class="pk-kit__close">' + esc(kit.closing_line) + '</p>' : '') +
      ((kit.questions || []).length ? '<ul class="pk-questions">' + kit.questions.map(function (row) {
        return '<li><span class="an-num">' + esc(row.marks) + ' marks</span> <strong>' +
          esc(row.directive) + '</strong> ' + esc(row.question) + '</li>';
      }).join('') + '</ul>' : '') +
      '</section>';
  }

  function pyqBridge(packet) {
    var rows = (packet && packet.pyq_links) || [];
    if (!rows.length) {
      return '<section class="pk-pyq"><h3>PYQ bridge</h3><p>No official PYQ theme is linked yet. That is better than a fake association.</p></section>';
    }
    return '<section class="pk-pyq"><h3>Related UPSC patterns</h3><ul>' +
      rows.map(function (row) {
        return '<li><span class="an-num">' + esc(row.year) + '</span> ' +
          esc(row.paper) + ' · ' + esc(row.type) + ' · ' + esc(row.theme) +
          (row.paraphrase ? '<p>' + esc(compactText(row.paraphrase, 180)) + '</p>' : '') +
          (row.why_linked ? '<p class="pk-pyq__why">' + esc(row.why_linked) + '</p>' : '') +
          '</li>';
      }).join('') + '</ul></section>';
  }

  function topicPacket(packet, options) {
    var row = packet || {};
    var extras = options || {};
    var layer = extras.layer || 'brief';
    var brief = row.layers && row.layers.brief ? row.layers.brief : {};
    var understand = row.layers && row.layers.understand ? row.layers.understand : {};
    var deep = row.layers && row.layers.deep_dive ? row.layers.deep_dive : {};
    var anchor = row.anchors && row.anchors[0] ? row.anchors[0] : null;
    var status = editorialLabel(row.status);
    var body = '';
    if (layer === 'understand' || layer === 'master') {
      body += '<section class="pk-bridge"><h3>Static ↔ current</h3><p>' +
        esc(brief.what_happened || '') + ' → ' +
        (anchor ? '<a href="upsc-patterns.html?anchor=' + attr(anchor.id) + '">' + esc(anchor.label) + '</a>' : 'unmapped') +
        ' → PYQ themes</p></section>';
      body += understand.static_anchor ? '<section class="pk-block"><h3>Static anchor</h3><p>' + esc(understand.static_anchor) + '</p></section>' : '';
      body += listBlock('How it works', understand.how_it_works);
      if (understand.what_changed) {
        body += '<section class="pk-changed"><h3>What changed</h3><dl>' +
          '<div><dt>Before</dt><dd>' + esc(understand.what_changed.before || '—') + '</dd></div>' +
          '<div><dt>Now</dt><dd>' + esc(understand.what_changed.now || '—') + '</dd></div>' +
          '<div><dt>Still unresolved</dt><dd>' + esc(understand.what_changed.unresolved || '—') + '</dd></div>' +
          '</dl></section>';
      }
      body += debateMatrix(understand.debate);
    }
    if (layer === 'master') {
      body += listBlock('Background', deep.background);
      body += listBlock('Arguments', deep.arguments);
      body += listBlock('Counterarguments', deep.counterarguments);
      body += listBlock('Way forward', deep.way_forward);
      body += listBlock('Stakeholders', deep.stakeholders);
    }
    return '<article class="pk-packet" data-packet-id="' + attr(row.id) + '" data-layer="' + attr(layer) + '">' +
      '<header class="pk-packet__head">' +
        '<p class="pk-card__meta">' + paperBadges(row.papers) +
          (row.subjects && row.subjects[0] ? '<span class="pk-subject">' + esc(row.subjects[0]) + '</span>' : '') +
          (row.syllabus_codes || []).map(function (code) {
            return '<span class="an-code">' + esc(code) + '</span>';
          }).join('') +
          '<span class="pk-read">' + esc(row.read_minutes || 5) + ' min</span>' +
          priorityBadge(row.priority) + '</p>' +
        '<h2>' + esc(row.title) + '</h2>' +
        (anchor ? '<p class="pk-card__anchor">Static anchor: <a href="upsc-patterns.html?anchor=' +
          attr(anchor.id) + '">' + esc(anchor.label) + '</a></p>' : '') +
        '<p class="pk-packet__status">' + esc(status) +
          (row.hasExamNote ? ' · Exam note ready' : ' · Official record') +
          (row.date ? ' · updated ' + esc(row.date) : '') + '</p>' +
      '</header>' +
      layerSwitcher(layer) +
      '<section class="pk-block"><h3>What happened</h3><p>' + esc(brief.what_happened || '') + '</p></section>' +
      listBlock('Why UPSC cares', brief.why_it_matters) +
      listBlock('Remember these', brief.remember) +
      (brief.upsc_link ? '<p class="pk-upsc-link"><span>Prelims</span> ' + esc(brief.upsc_link.prelims) +
        '<br><span>Mains</span> ' + esc(brief.upsc_link.mains) + '</p>' : '') +
      body +
      (layer !== 'brief' ? prelimsVault(row) + mainsKit(row) + pyqBridge(row) : pyqBridge(row)) +
      sourceStrip(row) +
      '<div class="pk-sticky" role="group" aria-label="Topic actions">' +
        '<button type="button" class="btn btn-primary" data-act="save-packet" data-id="' + attr(row.id) + '">Add to revision</button>' +
        '<button type="button" class="btn" data-act="test-packet" data-id="' + attr(row.id) + '">Test recall</button>' +
        '<button type="button" class="btn btn-quiet" data-act="understood-packet" data-id="' + attr(row.id) + '">Understood</button>' +
      '</div></article>';
  }

  function catchUpDesk(catchup) {
    var row = catchup || {};
    return '<section class="pk-catchup">' +
      '<header><p class="an-label">Recovery</p><h2>This week in 25 minutes</h2>' +
        '<p><strong>' + esc((row.must_know || []).length) + '</strong> Must Know · ' +
        '<strong>' + esc((row.useful || []).length) + '</strong> Useful · ' +
        '<strong>' + esc((row.discarded || []).length) + '</strong> discarded</p></header>' +
      ((row.clusters || []).length ? '<section class="pk-block"><h3>Most repeated anchors</h3><ol>' +
        row.clusters.slice(0, 5).map(function (cluster) {
          return '<li>' + esc(cluster.anchor) + ' · ' + esc(cluster.count) + ' triggers</li>';
        }).join('') + '</ol></section>' : '') +
      listBlock('Prelims fact pack', row.prelims_facts) +
      ((row.mains_debates || []).length ? '<section class="pk-block"><h3>Mains pack</h3><ul>' +
        row.mains_debates.map(function (debate) {
          return '<li>' + esc(debate.left || '') +
            (debate.right ? ' — ' + esc(debate.right) : '') + '</li>';
        }).join('') + '</ul></section>' : '') +
      (row.test ? '<p class="pk-catchup__test">Test: ' + esc(row.test.mcqs) + ' MCQs · ' +
        esc(row.test.skeletons) + ' skeletons</p>' : '') +
      stackSection('Must Know', row.must_know) +
      stackSection('Useful', row.useful) +
      '</section>';
  }

  function sessionCard(session) {
    var row = session || {};
    if (row.done) {
      return '<section class="pk-session" aria-live="polite"><h3>Today complete</h3>' +
        '<p>' + esc(row.understood || 0) + ' topics understood · ' +
        esc(row.correct || 0) + '/' + esc(row.asked || 0) + ' MCQs correct · ' +
        esc(row.weak || 0) + ' weak anchors added to revision.</p>' +
        '<p>Next recall: tomorrow.</p></section>';
    }
    return '<section class="pk-session" aria-live="polite"><p class="an-label">15-minute session</p>' +
      '<h3>' + esc(row.phase || 'Scan the top three') + '</h3>' +
      '<p>' + esc(row.line || 'Read the 60-second layer first. Expand only if the static anchor is unclear.') + '</p></section>';
  }

  function reviseCard(note, index, total) {
    return '<div class="an-card" data-id="' + attr(note.id) + '">' +
      '<p class="an-revise__progress">' + esc(index + 1) + ' of ' + esc(total) +
        ' · day ' + esc(AnchorStore.intervals[note.stage || 0]) +
        (note.graduated ? ' · monthly' : '') + '</p>' +
      '<h3 class="an-revise__title">' + esc(note.title) + '</h3>' +
      '<p class="an-revise__prompt">Reconstruct the anchor, the debate and the line you would use — out loud, from the title alone. Then reveal.</p>' +
      '<div class="an-revise__reveal" id="reveal" hidden>' +
        '<p class="an-entry__tags">' + anchorHtml(note.anchor) + codesHtml(note.codes) + '</p>' +
        useHtml(note.use) +
        '<div class="an-lines">' +
          line('Why', note.why) +
          line('Debate', note.debate) +
        '</div>' +
      '</div>' +
      '<div class="an-revise__actions">' +
        '<button type="button" class="btn" data-act="reveal">Reveal</button>' +
        '<button type="button" class="btn btn-primary" data-act="pass" hidden>Reconstructed it</button>' +
        '<button type="button" class="btn" data-act="fail" hidden>Missed it</button>' +
      '</div>' +
    '</div>';
  }

  window.AnchorRender = {
    esc: esc,
    sourceEntry: sourceEntry,
    coverageStatus: coverageStatus,
    topicOfDay: topicOfDay,
    dailyEdition: dailyEdition,
    subjectShelves: subjectShelves,
    briefEntry: briefEntry,
    noteEntry: noteEntry,
    clusters: clusters,
    discards: discards,
    lookupNote: lookupNote,
    examNote: examNote,
    examSummary: examSummary,
    syllabusAnchor: syllabusAnchor,
    answerOutline: answerOutline,
    memoryDrill: memoryDrill,
    reviseCard: reviseCard,
    priorityBadge: priorityBadge,
    topicCard: topicCard,
    todayHero: todayHero,
    dueStrip: dueStrip,
    repeatedThemes: repeatedThemes,
    stackSection: stackSection,
    topicPacket: topicPacket,
    sourceStrip: sourceStrip,
    prelimsVault: prelimsVault,
    mainsKit: mainsKit,
    pyqBridge: pyqBridge,
    catchUpDesk: catchUpDesk,
    sessionCard: sessionCard,
  };
})();
