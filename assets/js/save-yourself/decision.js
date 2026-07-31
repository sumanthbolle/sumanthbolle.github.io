/**
 * Save Yourself — the "before you sign" layer.
 *
 * Compact decision board, optional deeper checks, escape routes, lender ladder,
 * and selectable red flags. Deterministic content only — no network.
 */
(function (global) {
  'use strict';

  /** Ordered cheapest-first. Tier 1 feeds optional deeper checks. */
  var ESCAPE_TIERS = [
    {
      id: 'tier1',
      title: 'Tier 1 · Costs nothing but time',
      note: 'Work through these before any loan. Each one removes borrowing rather than repricing it.',
      items: [
        { id: 'negotiate', label: 'Ask the creditor or biller for a payment plan' },
        { id: 'assistance', label: 'Apply for hospital, utility, or council financial assistance' },
        { id: 'sell', label: 'Sell something you already own but do not use' },
        { id: 'gig', label: 'Add short-term income — shifts, delivery, freelance work' },
        { id: 'employer', label: 'Ask your employer about a salary advance or hardship fund' },
        { id: 'services', label: 'Call local social services (211 in the US, Citizens Advice in the UK, equivalent elsewhere)' }
      ]
    },
    {
      id: 'tier2',
      title: 'Tier 2 · Low-cost bridges',
      note: 'Cheap only when the payoff plan is concrete and dated.',
      items: [
        { id: 'zero_apr', label: '0% promotional card — only with a payoff date inside the promo window' },
        { id: 'credit_union', label: 'Credit union or cooperative bank personal loan' },
        { id: 'employer_loan', label: 'Employer loan or retirement-plan loan, if the job is stable' }
      ]
    }
  ];

  var LENDER_LADDER = [
    { id: 'credit_union', label: 'Credit union / cooperative', apr: '8–15%', use: 'You qualify for membership', tone: 'ok' },
    { id: 'bank', label: 'Bank personal loan', apr: '10–20%', use: 'Steady income and reasonable credit history', tone: 'ok' },
    { id: 'card_promo', label: '0% promotional credit card', apr: '0% → 25%+ after promo', use: 'Cleared in full before the promo ends', tone: 'watch' },
    { id: 'p2p', label: 'P2P lending platform', apr: '10–36%', use: 'No credit union or bank option, fees counted in', tone: 'watch' },
    { id: 'bnpl', label: 'Buy now, pay later', apr: '0–30%', use: 'Small amount, short term, no rollover', tone: 'watch' },
    { id: 'payday', label: 'Payday / title loan', apr: '200–500%+', use: 'Never. Walk away.', tone: 'avoid' }
  ];

  /** Selectable red-flag rows (handover §16.2). */
  var RED_FLAGS = [
    { id: 'no_writing', label: 'Refuses to provide total repayment in writing.' },
    { id: 'fee_before', label: 'Requests payment before disbursal.' },
    { id: 'pressure', label: 'Pressures immediate signing.' },
    { id: 'verbal_change', label: 'Changes terms verbally.' },
    { id: 'hides_fees', label: 'Hides fees or penalties.' },
    { id: 'device_access', label: 'Requests access to contacts, photos or unrelated device data.' },
    { id: 'threats', label: 'Uses threats or harassment.' }
  ];

  /** Four primary checks — compact decision board. */
  var PRIMARY_CHECKS = [
    {
      id: 'know_total',
      label: 'I know the total amount I will repay.',
      derive: function (ctx) {
        return ctx.hasResult ? 'yes' : null;
      }
    },
    {
      id: 'fees_written',
      label: 'Every mandatory fee is written down.',
      derive: function (ctx) {
        if (!ctx.hasResult) return null;
        return ctx.feesEntered ? 'yes' : null;
      }
    },
    {
      id: 'payment_fits',
      label: 'The payment fits after current obligations.',
      derive: function (ctx) {
        if (ctx.marginLabel === 'negative' || ctx.marginLabel === 'tight') return 'no';
        if (ctx.marginLabel === 'comfortable' || ctx.marginLabel === 'watch') return 'yes';
        return null;
      }
    },
    {
      id: 'compared_alt',
      label: 'I compared at least one cheaper alternative.',
      derive: function (ctx) {
        if (ctx.comparedAlternative) return 'yes';
        return null;
      }
    }
  ];

  /** Optional deeper checks (progressive disclosure). */
  var OPTIONAL_CHECKS = [
    {
      id: 'zero_cost',
      label: 'I tried at least three zero-cost options first.',
      derive: function (ctx) {
        if (!ctx.tier1Total || ctx.tier1Checked == null) return null;
        return ctx.tier1Checked >= 3 ? 'yes' : 'no';
      }
    },
    {
      id: 'productive',
      label: 'This covers an emergency or something that earns or saves money.',
      derive: function (ctx) {
        if (ctx.reasonBucket === 'emergency' || ctx.reasonBucket === 'invest') return 'yes';
        if (ctx.reasonBucket === 'lifestyle') return 'no';
        return null;
      }
    },
    {
      id: 'stress',
      label: 'I could still pay if income dropped 20%.',
      derive: function (ctx) {
        if (ctx.stressRatio == null) return null;
        return ctx.stressRatio <= 0.5 ? 'yes' : 'no';
      }
    },
    {
      id: 'rate',
      label: 'Estimated annual cost is under 15%.',
      derive: function (ctx) {
        if (ctx.aprPercent == null) return null;
        return ctx.aprPercent < 15 ? 'yes' : 'no';
      }
    },
    {
      id: 'payoff',
      label: 'There is a written payoff plan under 24 months.',
      derive: function (ctx) {
        if (!ctx.payoffMonths) return null;
        if (ctx.payoffMonths > 24) return 'no';
        return ctx.commitmentSigned ? 'yes' : null;
      }
    },
    {
      id: 'strategy',
      label: 'I am borrowing from a plan, not from panic.',
      derive: function () { return null; }
    }
  ];

  // Backward-compat alias used by older tests / callers
  var FILTER_QUESTIONS = PRIMARY_CHECKS.concat(OPTIONAL_CHECKS).map(function (c) {
    return {
      id: c.id,
      question: c.label,
      yes: 'Yes',
      no: 'No',
      derive: c.derive,
      note: function () { return null; }
    };
  });

  /**
   * @param {object} ctx
   * @param {object} answers — manual overrides keyed by check id ('yes' | 'no')
   * @param {object} [redFlags] — selected red flag ids → true
   */
  function evaluateFilter(ctx, answers, redFlags) {
    ctx = ctx || {};
    answers = answers || {};
    redFlags = redFlags || {};

    function rowFrom(check) {
      var manual = answers[check.id] === 'yes' || answers[check.id] === 'no' ? answers[check.id] : null;
      var derived = null;
      try { derived = check.derive(ctx) || null; } catch (e) { derived = null; }
      var answer = manual || derived;
      return {
        id: check.id,
        label: check.label,
        question: check.label,
        yes: 'Yes',
        no: 'No',
        answer: answer,
        source: manual ? 'manual' : (derived ? 'derived' : 'none')
      };
    }

    var primary = PRIMARY_CHECKS.map(rowFrom);
    var optional = OPTIONAL_CHECKS.map(rowFrom);
    var rows = primary.concat(optional);

    var selectedFlags = RED_FLAGS.filter(function (f) { return !!redFlags[f.id]; });
    var flagCount = selectedFlags.length;

    var primaryNo = primary.filter(function (r) { return r.answer === 'no'; }).length;
    var primaryYes = primary.filter(function (r) { return r.answer === 'yes'; }).length;
    var primaryOpen = primary.length - primaryNo - primaryYes;

    var no = rows.filter(function (r) { return r.answer === 'no'; }).length;
    var yes = rows.filter(function (r) { return r.answer === 'yes'; }).length;
    var unanswered = rows.length - no - yes;

    var level;
    var verdict;
    var state;

    if (flagCount > 0) {
      level = 'danger';
      state = 'stop';
      verdict = flagCount === 1
        ? 'A critical lender red flag is present.'
        : flagCount + ' critical lender red flags are present.';
    } else if (primaryNo >= 2 || no >= 3) {
      level = 'danger';
      state = 'stop';
      verdict = primaryNo >= 2
        ? 'Two important checks are unresolved — pause before signing.'
        : 'Several checks failed. Do not borrow today.';
    } else if (primaryNo > 0 || primaryOpen > 0) {
      level = 'caution';
      state = 'pause';
      var unresolved = primaryNo + primaryOpen;
      verdict = unresolved === 1
        ? 'One important check is still unresolved.'
        : unresolved + ' important checks are still unresolved.';
    } else if (primaryYes === primary.length) {
      level = 'safe';
      state = 'ready';
      verdict = 'Your numbers are complete. Compare the final offer with the lender’s written disclosure.';
    } else {
      level = 'unknown';
      state = 'pause';
      verdict = 'Complete the checks before you decide.';
    }

    return {
      rows: rows,
      primary: primary,
      optional: optional,
      yes: yes,
      no: no,
      unanswered: unanswered,
      level: level,
      state: state,
      verdict: verdict,
      redFlags: selectedFlags
    };
  }

  global.SYDecision = {
    ESCAPE_TIERS: ESCAPE_TIERS,
    LENDER_LADDER: LENDER_LADDER,
    RED_FLAGS: RED_FLAGS,
    PRIMARY_CHECKS: PRIMARY_CHECKS,
    OPTIONAL_CHECKS: OPTIONAL_CHECKS,
    FILTER_QUESTIONS: FILTER_QUESTIONS,
    evaluateFilter: evaluateFilter
  };
})(typeof window !== 'undefined' ? window : globalThis);
