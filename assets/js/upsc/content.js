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

  window.AnchorContent = Object.freeze({
    normalizeSourceIndex: normalizeSourceIndex,
    filterSources: filterSources,
    groupPublishers: groupPublishers,
  });
})();
