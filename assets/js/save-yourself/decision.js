/**
 * Save Yourself — the "before you sign" layer.
 *
 * Escape routes, a cost ladder of lender types, lender red flags, and a final
 * yes/no filter. Everything here is deterministic content plus small scoring
 * helpers; nothing talks to a network and nothing is personalised server-side.
 */
(function (global) {
  'use strict';

  /** Ordered cheapest-first. Tier 1 feeds the "exhausted zero-cost options" filter. */
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

  /**
   * Indicative annual cost by lender type. Ranges are educational and vary widely
   * by country, credit profile, and product — the calculator above is the source
   * of truth for any specific offer.
   */
  var LENDER_LADDER = [
    { id: 'credit_union', label: 'Credit union / cooperative', apr: '8–15%', use: 'You qualify for membership', tone: 'ok' },
    { id: 'bank', label: 'Bank personal loan', apr: '10–20%', use: 'Steady income and reasonable credit history', tone: 'ok' },
    { id: 'card_promo', label: '0% promotional credit card', apr: '0% → 25%+ after promo', use: 'Cleared in full before the promo ends', tone: 'watch' },
    { id: 'p2p', label: 'P2P lending platform', apr: '10–36%', use: 'No credit union or bank option, fees counted in', tone: 'watch' },
    { id: 'bnpl', label: 'Buy now, pay later', apr: '0–30%', use: 'Small amount, short term, no rollover', tone: 'watch' },
    { id: 'payday', label: 'Payday / title loan', apr: '200–500%+', use: 'Never. Walk away.', tone: 'avoid' }
  ];

  var RED_FLAGS = [
    'Pressures you to decide today, or says the offer disappears tonight',
    'Will not put the full terms, fees, and schedule in writing',
    'Charges any fee before the loan is approved',
    'Advertises “guaranteed approval” or “no credit check”',
    'Quotes an effective rate above 36% p.a.',
    'Requires access to your bank login or control of your salary deposit',
    'Makes you feel ashamed for asking a question'
  ];

  /**
   * The final filter. Answers can come from the calculator (`derive`) or from the
   * person; a manual answer always wins over a derived one. `note` explains either
   * the derived answer or what is still missing to derive one.
   */
  var FILTER_QUESTIONS = [
    {
      id: 'zero_cost',
      question: 'Have you exhausted the zero-cost options?',
      yes: 'Proceed',
      no: 'Work through Tier 1 first',
      derive: function (ctx) {
        if (!ctx.tier1Total || !ctx.tier1Checked) return null;
        return ctx.tier1Checked >= 3 ? 'yes' : 'no';
      },
      note: function (ctx) {
        if (!ctx.tier1Total) return null;
        if (!ctx.tier1Checked) return 'Nothing ticked yet in the Tier 1 list above.';
        return ctx.tier1Checked + ' of ' + ctx.tier1Total + ' Tier 1 options tried.';
      }
    },
    {
      id: 'productive',
      question: 'Is this for an emergency or something that earns or saves money?',
      yes: 'Consider it',
      no: 'Reconsider the purchase itself',
      derive: function (ctx) {
        if (ctx.reasonBucket === 'emergency' || ctx.reasonBucket === 'invest') return 'yes';
        if (ctx.reasonBucket === 'lifestyle') return 'no';
        return null;
      },
      note: function (ctx) {
        if (!ctx.reasonBucket) return 'Pick a borrowing reason under “Refine my assessment” to answer this automatically.';
        return ctx.reasonLabel ? 'You picked “' + ctx.reasonLabel + '”.' : null;
      }
    },
    {
      id: 'stress',
      question: 'Could you still make the payment if your income dropped 20%?',
      yes: 'Safer',
      no: 'Too risky at this size',
      derive: function (ctx) {
        if (ctx.stressRatio == null) return null;
        return ctx.stressRatio <= 0.5 ? 'yes' : 'no';
      },
      note: function (ctx) {
        if (ctx.stressRatio == null) return 'Add gross monthly income to answer this from your numbers.';
        return 'Payments would take about ' + Math.round(ctx.stressRatio * 100) + '% of a 20%-lower income.';
      }
    },
    {
      id: 'rate',
      question: 'Is the effective rate under 15% p.a.?',
      yes: 'Acceptable',
      no: 'Explore cheaper alternatives',
      derive: function (ctx) {
        if (ctx.aprPercent == null) return null;
        return ctx.aprPercent < 15 ? 'yes' : 'no';
      },
      note: function (ctx) {
        if (ctx.aprPercent == null) return null;
        return 'Effective rate including fees is about ' + ctx.aprPercent.toFixed(1) + '% p.a.';
      }
    },
    {
      id: 'payoff',
      question: 'Is there a written payoff plan under 24 months?',
      yes: 'Good',
      no: 'Shorten the term or reduce the amount',
      derive: function (ctx) {
        if (!ctx.payoffMonths) return null;
        if (ctx.payoffMonths > 24) return 'no';
        return ctx.commitmentSigned ? 'yes' : null;
      },
      note: function (ctx) {
        if (!ctx.payoffMonths) return null;
        if (ctx.payoffMonths > 24) return 'The current plan runs ' + ctx.payoffMonths + ' months.';
        return ctx.commitmentSigned
          ? 'The plan runs ' + ctx.payoffMonths + ' months and your commitment is written down.'
          : 'The plan runs ' + ctx.payoffMonths + ' months — write the commitment below to answer this.';
      }
    },
    {
      id: 'total_cost',
      question: 'Have you calculated the total cost including every fee?',
      yes: 'Informed',
      no: 'Do the math above first',
      derive: function (ctx) {
        return ctx.hasResult && ctx.feesEntered ? 'yes' : null;
      },
      note: function (ctx) {
        if (!ctx.hasResult) return null;
        return ctx.feesEntered
          ? 'Fees are included in the effective rate above.'
          : 'No fees entered — confirm with the lender that there really are none.';
      }
    },
    {
      id: 'strategy',
      question: 'Are you borrowing from a plan rather than from panic?',
      yes: 'Controlled',
      no: 'Dangerous — pause first',
      derive: function () { return null; },
      note: function () { return 'Only you can answer this one.'; }
    }
  ];

  /**
   * @param {object} ctx — derivation inputs (see FILTER_QUESTIONS)
   * @param {object} answers — manual overrides keyed by question id ('yes' | 'no')
   */
  function evaluateFilter(ctx, answers) {
    ctx = ctx || {};
    answers = answers || {};
    var rows = FILTER_QUESTIONS.map(function (q) {
      var manual = answers[q.id] === 'yes' || answers[q.id] === 'no' ? answers[q.id] : null;
      var derived = null;
      try { derived = q.derive(ctx) || null; } catch (e) { derived = null; }
      var answer = manual || derived;
      var note = null;
      if (!manual && typeof q.note === 'function') {
        try { note = q.note(ctx) || null; } catch (e) { note = null; }
      }
      return {
        id: q.id,
        question: q.question,
        yes: q.yes,
        no: q.no,
        answer: answer,
        source: manual ? 'manual' : (derived ? 'derived' : 'none'),
        note: note
      };
    });

    var no = rows.filter(function (r) { return r.answer === 'no'; }).length;
    var yes = rows.filter(function (r) { return r.answer === 'yes'; }).length;
    var unanswered = rows.length - no - yes;

    var level, verdict;
    if (no >= 3) {
      level = 'danger';
      verdict = 'Three or more answers are “no”. Do not borrow today — sleep on it and work the Tier 1 list first.';
    } else if (no > 0) {
      level = 'caution';
      verdict = no === 1
        ? 'One answer is “no”. Fix that one thing before you sign.'
        : no + ' answers are “no”. Close those gaps before you sign.';
    } else if (unanswered) {
      level = 'unknown';
      verdict = unanswered + ' question' + (unanswered === 1 ? '' : 's') + ' still unanswered. Answer them all before you decide.';
    } else {
      level = 'safe';
      verdict = 'Every check passed. Borrow the smallest amount that solves the problem, and keep the payoff date.';
    }

    return { rows: rows, yes: yes, no: no, unanswered: unanswered, level: level, verdict: verdict };
  }

  global.SYDecision = {
    ESCAPE_TIERS: ESCAPE_TIERS,
    LENDER_LADDER: LENDER_LADDER,
    RED_FLAGS: RED_FLAGS,
    FILTER_QUESTIONS: FILTER_QUESTIONS,
    evaluateFilter: evaluateFilter
  };
})(typeof window !== 'undefined' ? window : globalThis);
