/* Prelims readiness metrics. Pure: no DOM, no clock (today is an argument).
   Shared by the notebook page (window.UPSCNotebookMetrics) and the tests.

   Input
     logs: [{ date:'YYYY-MM-DD', hours, units:[unit ids], pyq:{attempted,correct},
              csat:{attempted,correct,score,timed}, mock:{gsScore,gsAttempted,gsCorrect,csatScore},
              revisionDone, caDone, blockers, note }]
     schedule: data/upsc/notebook/schedule.json
     today: 'YYYY-MM-DD'

   The grading is deliberately severe. Missing data scores zero, and a few
   conditions cap the overall score no matter how good the rest looks:
   nothing logged for the last three planned days, a projected GS score under
   the cutoff band, a CSAT below qualifying, or a projected total of hours that
   cannot reach the plan. */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UPSCNotebookMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;

  function parse(iso) { var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function weekday(isoDate) { return new Date(parse(isoDate)).getUTCDay(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pct(n, d) { return d > 0 ? n / d : 0; }
  function round(x, p) { var f = Math.pow(10, p || 0); return Math.round(x * f) / f; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function plannedHoursOn(schedule, isoDate) { return num(schedule.hoursByWeekday[String(weekday(isoDate))]); }

  function plannedHoursBetween(schedule, from, to) {
    var total = 0;
    for (var t = parse(from); t <= parse(to); t += DAY) total += plannedHoursOn(schedule, iso(t));
    return total;
  }

  function phaseOn(schedule, isoDate) {
    for (var i = 0; i < schedule.phases.length; i += 1) {
      var p = schedule.phases[i];
      if (isoDate >= p.from && isoDate <= p.to) return p.id;
    }
    return isoDate < schedule.studyStart ? 'BUILD' : 'LOCK';
  }

  function normaliseLogs(logs) {
    var byDate = {};
    (logs || []).forEach(function (l) {
      if (!l || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.date))) return;
      byDate[l.date] = l; /* later entries for the same date replace earlier ones */
    });
    return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
  }

  function compute(input) {
    var schedule = input.schedule;
    var today = input.today;
    var logs = normaliseLogs(input.logs);
    var start = schedule.studyStart;
    var exam = schedule.exam;
    var t = schedule.targets;

    var daysElapsed = Math.max(0, daysBetween(start, today) + 1);
    var daysToGo = Math.max(0, daysBetween(today, exam));
    var phase = phaseOn(schedule, today);

    /* ── hours ─────────────────────────────────────────────── */
    var plannedToDate = today >= start ? plannedHoursBetween(schedule, start, today) : 0;
    var logged = logs.reduce(function (s, l) { return s + num(l.hours); }, 0);
    var plannedRemaining = daysToGo > 0 ? plannedHoursBetween(schedule, iso(parse(today) + DAY), iso(parse(exam) - DAY)) : 0;
    var weeksElapsed = Math.max(1, daysElapsed / 7);
    var weeklyRate = logged / weeksElapsed;
    var projectedTotal = logged + weeklyRate * (daysToGo / 7);
    var hoursRatio = pct(logged, plannedToDate);
    var hours = {
      logged: round(logged, 1),
      plannedToDate: round(plannedToDate, 1),
      deficit: round(Math.max(0, plannedToDate - logged), 1),
      ratio: round(hoursRatio, 3),
      weeklyRate: round(weeklyRate, 1),
      plannedRemaining: round(plannedRemaining, 1),
      projectedTotal: round(projectedTotal, 0),
      requiredTotal: schedule.totalHoursPlanned,
      score: clamp(hoursRatio, 0, 1)
    };

    /* ── consistency ──────────────────────────────────────── */
    var loggedDates = {};
    logs.forEach(function (l) { loggedDates[l.date] = num(l.hours); });
    var zeroDays = 0, loggedDays = 0, longestZero = 0, run = 0, trailingZero = 0, lastSeven = 0;
    var plannedDays = 0;
    for (var d = parse(start); d <= parse(today); d += DAY) {
      var k = iso(d);
      plannedDays += 1;
      var h = loggedDates[k];
      if (h > 0) { loggedDays += 1; run = 0; } else { zeroDays += 1; run += 1; longestZero = Math.max(longestZero, run); }
      if (daysBetween(k, today) < 7) lastSeven += h || 0;
    }
    trailingZero = run;
    var currentStreak = 0;
    for (var d2 = parse(today); d2 >= parse(start); d2 -= DAY) { if (loggedDates[iso(d2)] > 0) currentStreak += 1; else break; }
    var consistencyRatio = pct(loggedDays, plannedDays);
    var consistency = {
      plannedDays: plannedDays, loggedDays: loggedDays, zeroDays: zeroDays,
      longestZeroStreak: longestZero, trailingZeroDays: trailingZero, currentStreak: currentStreak,
      lastSevenDaysHours: round(lastSeven, 1),
      score: clamp(consistencyRatio - (trailingZero >= 3 ? 0.25 : 0), 0, 1)
    };

    /* ── coverage ─────────────────────────────────────────── */
    var done = {};
    logs.forEach(function (l) { (l.units || []).forEach(function (u) { done[u] = true; }); });
    var units = schedule.units || [];
    var dueUnits = units.filter(function (u) { return u.date <= today; });
    var dueDone = dueUnits.filter(function (u) { return done[u.id]; });
    var allDone = units.filter(function (u) { return done[u.id]; });
    var overdue = dueUnits.filter(function (u) { return !done[u.id]; });
    var bySubject = {};
    units.forEach(function (u) {
      var s = bySubject[u.subject] || (bySubject[u.subject] = { subject: u.subject, total: 0, due: 0, done: 0 });
      s.total += 1; if (u.date <= today) s.due += 1; if (done[u.id]) s.done += 1;
    });
    var coverageRatio = pct(dueDone.length, dueUnits.length);
    var coverage = {
      unitsDue: dueUnits.length, unitsDone: dueDone.length, unitsOverdue: overdue.length,
      buildUnitsTotal: units.length, buildUnitsDone: allDone.length,
      buildFraction: round(pct(allDone.length, units.length), 3),
      overdueUnits: overdue.slice(0, 8).map(function (u) { return { id: u.id, label: u.label, date: u.date }; }),
      bySubject: Object.keys(bySubject).map(function (k) { return bySubject[k]; }),
      score: clamp(coverageRatio, 0, 1)
    };

    /* ── PYQ accuracy ─────────────────────────────────────── */
    var pyqRows = logs.filter(function (l) { return l.pyq && num(l.pyq.attempted) > 0; });
    var totalAtt = 0, totalCor = 0;
    pyqRows.forEach(function (l) { totalAtt += num(l.pyq.attempted); totalCor += num(l.pyq.correct); });
    function rolling(rows, n) {
      var att = 0, cor = 0;
      for (var i = rows.length - 1; i >= 0 && att < n; i -= 1) {
        var a = num(rows[i].pyq.attempted), c = num(rows[i].pyq.correct);
        var take = Math.min(a, n - att);
        att += take; cor += c * (take / a);
      }
      return att > 0 ? cor / att : null;
    }
    var last50 = rolling(pyqRows, 50);
    var prior = rolling(pyqRows.slice(0, Math.max(0, pyqRows.length - 5)), 50);
    var accuracy = totalAtt > 0 ? totalCor / totalAtt : null;
    var pyqScore = last50 === null ? 0 : clamp((last50 - 0.45) / (t.pyqAccuracyTarget - 0.45), 0, 1);
    if (totalAtt < 50) pyqScore = Math.min(pyqScore, totalAtt / 50);
    var pyq = {
      attempted: totalAtt, correct: totalCor,
      accuracy: accuracy === null ? null : round(accuracy, 3),
      rolling50: last50 === null ? null : round(last50, 3),
      trend: (last50 !== null && prior !== null) ? round(last50 - prior, 3) : null,
      minimum: t.pyqAccuracyMin, target: t.pyqAccuracyTarget,
      score: pyqScore
    };

    /* ── CSAT ─────────────────────────────────────────────── */
    var csatRows = logs.filter(function (l) { return l.csat && (num(l.csat.score) > 0 || num(l.csat.attempted) > 0); });
    function csatScoreOf(l) {
      if (num(l.csat.score) > 0) return num(l.csat.score);
      var a = num(l.csat.attempted), c = num(l.csat.correct);
      return a > 0 ? round((c * 2.5 - (a - c) * 2.5 / 3) * (80 / a), 0) : 0; /* scaled to an 80-question paper */
    }
    var csatTimed = csatRows.filter(function (l) { return l.csat.timed; });
    var csatLatest = csatTimed.length ? csatScoreOf(csatTimed[csatTimed.length - 1]) : null;
    var csatBest = csatTimed.reduce(function (b, l) { return Math.max(b, csatScoreOf(l)); }, 0);
    var csat = {
      sessions: csatRows.length, timedPapers: csatTimed.length,
      latest: csatLatest, best: csatTimed.length ? csatBest : null,
      qualify: t.csatQualify, target: t.csatTarget,
      score: csatLatest === null ? 0 : clamp((csatLatest - 40) / (t.csatTarget - 40), 0, 1)
    };

    /* ── mocks ────────────────────────────────────────────── */
    var mockRows = logs.filter(function (l) { return l.mock && num(l.mock.gsScore) !== 0; });
    var lastThree = mockRows.slice(-3);
    var mockAvg = lastThree.length ? lastThree.reduce(function (s, l) { return s + num(l.mock.gsScore); }, 0) / lastThree.length : null;
    var mocks = { count: mockRows.length, lastThreeAverage: mockAvg === null ? null : round(mockAvg, 1), target: t.gsMock };

    /* ── projection ───────────────────────────────────────── */
    var acc = last50 !== null ? last50 : 0.5;
    var buildFraction = pct(allDone.length, units.length);
    var modelAttempts = 40 + 55 * buildFraction;
    var modelScore = modelAttempts * (acc * 2 - (1 - acc) * (2 / 3));
    var projected = mockAvg !== null ? 0.7 * mockAvg + 0.3 * modelScore : modelScore;
    if (last50 === null && allDone.length === 0) projected = 0;
    var projection = {
      gsScore: round(projected, 0), basis: mockAvg !== null ? 'mocks and model' : 'model only',
      modelAttempts: round(modelAttempts, 0), modelAccuracy: round(acc, 3),
      cutoffBand: t.gsCutoffBand, target: t.gsMock,
      score: clamp((projected - 60) / (t.gsMock - 60), 0, 1)
    };

    /* ── readiness ────────────────────────────────────────── */
    var weights = { hours: 25, consistency: 15, coverage: 20, pyq: 15, csat: 10, projection: 15 };
    var raw = hours.score * weights.hours + consistency.score * weights.consistency + coverage.score * weights.coverage +
      pyq.score * weights.pyq + csat.score * weights.csat + projection.score * weights.projection;
    var caps = [];
    if (logs.length === 0) caps.push({ cap: 0, reason: 'Nothing has ever been logged. Readiness is zero until it is.' });
    if (trailingZero >= 3) caps.push({ cap: 25, reason: trailingZero + ' planned days in a row with no study logged. A plan that is not running is not preparation.' });
    if (projectedTotal < 500 && daysElapsed >= 7) caps.push({ cap: 50, reason: 'At the current rate the total will be about ' + Math.round(projectedTotal) + ' hours by exam day; a from-zero pass needs 660 at least.' });
    if (daysElapsed >= 14 && projection.gsScore < t.gsCutoffBand[0]) caps.push({ cap: 60, reason: 'Projected GS-I score ' + projection.gsScore + ' is below the cutoff band (' + t.gsCutoffBand[0] + ' to ' + t.gsCutoffBand[1] + ').' });
    if (csatLatest !== null && csatLatest < t.csatQualify) caps.push({ cap: 70, reason: 'Latest timed CSAT ' + csatLatest + ' is below the qualifying 66. GS-I does not count if CSAT fails.' });
    var capped = caps.reduce(function (m, c) { return Math.min(m, c.cap); }, 100);
    var score = Math.round(Math.min(raw, capped));
    var components = [
      { id: 'hours', label: 'Hours against plan', score: round(hours.score * 100), weight: weights.hours },
      { id: 'consistency', label: 'Days logged', score: round(consistency.score * 100), weight: weights.consistency },
      { id: 'coverage', label: 'Syllabus coverage', score: round(coverage.score * 100), weight: weights.coverage },
      { id: 'pyq', label: 'PYQ accuracy', score: round(pyq.score * 100), weight: weights.pyq },
      { id: 'csat', label: 'CSAT', score: round(csat.score * 100), weight: weights.csat },
      { id: 'projection', label: 'Projected GS-I', score: round(projection.score * 100), weight: weights.projection }
    ];
    var weakest = components.slice().sort(function (a, b) { return (a.score * a.weight) - (b.score * b.weight) || b.weight - a.weight; })[0];
    var biggestRisk = caps.length ? caps.sort(function (a, b) { return a.cap - b.cap; })[0].reason : riskLine(weakest, hours, coverage, pyq, csat, projection);
    var grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    var verdict = verdictLine(score, grade, daysToGo, phase, hours, consistency);

    return {
      today: today, phase: phase, daysElapsed: daysElapsed, daysToGo: daysToGo,
      hours: hours, consistency: consistency, coverage: coverage, pyq: pyq, csat: csat, mocks: mocks, projection: projection,
      readiness: { score: score, raw: round(raw, 1), grade: grade, caps: caps, components: components, biggestRisk: biggestRisk, verdict: verdict }
    };
  }

  function riskLine(weakest, hours, coverage, pyq, csat, projection) {
    switch (weakest.id) {
      case 'hours': return 'Hours are ' + Math.round(hours.ratio * 100) + '% of what the plan needed by today (' + hours.logged + ' of ' + hours.plannedToDate + '). The deficit is ' + hours.deficit + ' hours and it does not get repaid later.';
      case 'consistency': return 'Study is happening in bursts, not daily. The revision queue cannot work without consecutive days.';
      case 'coverage': return coverage.unitsOverdue + ' scheduled units are overdue. Each one pushes a later subject off the calendar.';
      case 'pyq': return pyq.rolling50 === null ? 'No PYQs logged. Accuracy is unknown, which means the reading is unmeasured.' : 'Rolling PYQ accuracy is ' + Math.round(pyq.rolling50 * 100) + '%; below ' + Math.round(pyq.minimum * 100) + '% the negative marking eats the score.';
      case 'csat': return csat.latest === null ? 'No timed CSAT paper logged. Nobody knows whether Paper II is a problem yet.' : 'CSAT is at ' + csat.latest + '; 90 is the safe margin.';
      default: return 'Projected GS-I is ' + projection.gsScore + ' against a target of ' + projection.target + '.';
    }
  }

  function verdictLine(score, grade, daysToGo, phase, hours, consistency) {
    if (score === 0) return 'Not started. ' + daysToGo + ' days left and nothing on the record.';
    if (grade === 'F') return 'On this record you would not clear Prelims. ' + daysToGo + ' days left, phase ' + phase + ', ' + hours.logged + ' hours logged.';
    if (grade === 'D') return 'Behind the plan with no margin. The next two weeks decide whether the plan is still real.';
    if (grade === 'C') return 'On the plan in some places, behind in others. The cutoff is reachable only if the weak component moves this month.';
    if (grade === 'B') return 'On track for the cutoff band, not yet for the margin. Keep the streak at ' + consistency.currentStreak + ' days and push accuracy.';
    return 'On track for 110 plus. Do not add sources; protect the revision cycle.';
  }

  return { compute: compute, plannedHoursBetween: plannedHoursBetween, phaseOn: phaseOn, normaliseLogs: normaliseLogs };
});
