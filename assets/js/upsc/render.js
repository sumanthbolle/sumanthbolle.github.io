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
              '<p class="an-treatment">' + esc(item.treatment) +
                (item.verified ? '' : ' Confirm the claim in the source before this enters permanent notes.') +
              '</p>' +
            '</details>'
          : '') +
        '<div class="an-entry__actions">' +
          '<button type="button" class="btn btn-sm" data-act="save" data-id="' + attr(item.id) + '">Save to notes</button>' +
          sourceLink(item.sourceUrl, item.sourceName) +
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
        '<p class="an-block__intro">Anchors an examiner rewards. Verify each one in the source before you write it down — an invented committee name loses marks silently.</p>' +
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
        '<p class="an-block__intro">Practice prioritisation, not prediction. Write these; do not read them.</p>' +
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
    briefEntry: briefEntry,
    noteEntry: noteEntry,
    clusters: clusters,
    discards: discards,
    lookupNote: lookupNote,
    reviseCard: reviseCard,
  };
})();
