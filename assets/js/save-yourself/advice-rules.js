/**
 * Deterministic advice engine for Save Yourself.
 * Rule-based; returns transparent triggeredRules + actionable steps.
 */
(function (global) {
  'use strict';

  var REASONS = [
    { id: 'medical', label: 'Medical / Family emergency', bucket: 'emergency' },
    { id: 'job_gap', label: 'Job loss or income gap', bucket: 'emergency' },
    { id: 'education', label: 'Education / Skill upgrade', bucket: 'invest' },
    { id: 'business', label: 'Business or side hustle', bucket: 'invest' },
    { id: 'consolidation', label: 'Debt consolidation', bucket: 'debt' },
    { id: 'wedding', label: 'Wedding / Family function', bucket: 'lifestyle' },
    { id: 'lifestyle', label: 'Lifestyle / Gadget / Travel', bucket: 'lifestyle' },
    { id: 'home', label: 'Home / Rent related', bucket: 'mixed' },
    { id: 'other', label: 'Other', bucket: 'mixed' }
  ];

  var LENDERS = [
    { id: 'bank', label: 'Bank' },
    { id: 'nbfc', label: 'NBFC' },
    { id: 'credit_card', label: 'Credit Card' },
    { id: 'friend', label: 'Friend' },
    { id: 'family', label: 'Family' },
    { id: 'payday', label: 'Payday' },
    { id: 'other', label: 'Other' }
  ];

  function reasonById(id) {
    for (var i = 0; i < REASONS.length; i++) {
      if (REASONS[i].id === id) return REASONS[i];
    }
    return null;
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.reasonId
   * @param {string} [ctx.problemSentence]
   * @param {string} [ctx.lenderId]
   * @param {number} [ctx.existingEmis] — count or approximate monthly debt
   * @param {'yes'|'no'|'partial'|'unknown'} [ctx.emergencyFund]
   * @param {'yes'|'no'|'unsure'} [ctx.debtRatioHigh]
   * @param {'one_time'|'recurring'|'unknown'} [ctx.shortfallType]
   * @param {object} [ctx.loan] — result from SYLoanMath.calculate
   */
  function buildAdvice(ctx) {
    var reason = reasonById(ctx.reasonId) || reasonById('other');
    var triggered = [];
    var headline = '';
    var steps = [];
    var severity = 'moderate'; // low | moderate | high | critical
    var honestQuestion =
      'If I never took this loan, what is the worst that would realistically happen in the next 6–12 months — and can I live with that?';

    // --- Burden rules ---
    if (ctx.debtRatioHigh === 'yes') {
      triggered.push({
        id: 'high_debt_ratio',
        label: 'Debt payments may exceed 40% of income'
      });
      severity = 'critical';
      steps.push({
        title: 'Pause and map every payment',
        detail: 'List all EMIs and minimums. If this loan would push total debt payments above ~40–50% of income, taking more debt usually deepens the hole.'
      });
      steps.push({
        title: 'Prioritize cost of money, not EMI size',
        detail: 'Attack the highest interest balance first (often credit cards or payday). Avoid stacking a new EMI on top unless it truly replaces a more expensive one.'
      });
    }

    if (ctx.emergencyFund === 'no') {
      triggered.push({ id: 'no_emergency_fund', label: 'No 3+ month emergency fund' });
      if (severity === 'moderate') severity = 'high';
      steps.push({
        title: 'Start a “never again” fund immediately',
        detail: 'Even a small automatic transfer (any affordable amount) after essentials builds the habit that reduces the next emergency loan.'
      });
    } else if (ctx.emergencyFund === 'partial') {
      triggered.push({ id: 'partial_emergency_fund', label: 'Partial emergency fund' });
    }

    if (ctx.shortfallType === 'recurring') {
      triggered.push({ id: 'recurring_shortfall', label: 'Recurring income shortfall' });
      severity = severity === 'critical' ? 'critical' : 'high';
      steps.push({
        title: 'Fix the leak before adding a loan',
        detail: 'A loan does not solve a monthly gap — it adds a new fixed payment. Cut low-value spend and/or raise income until the month balances without borrowing.'
      });
    }

    var loan = ctx.loan && ctx.loan.ok ? ctx.loan : null;
    if (loan && loan.annualRatePercent >= 36) {
      triggered.push({ id: 'predatory_rate', label: 'Rate ≥ 36% p.a.' });
      severity = 'critical';
    } else if (loan && loan.annualRatePercent >= 24) {
      triggered.push({ id: 'high_rate', label: 'Rate ≥ 24% p.a.' });
      if (severity === 'low' || severity === 'moderate') severity = 'high';
    }

    if (ctx.lenderId === 'payday' || ctx.lenderId === 'credit_card') {
      triggered.push({
        id: 'expensive_lender',
        label: ctx.lenderId === 'payday' ? 'Payday lender' : 'Credit card borrowing'
      });
      if (severity !== 'critical') severity = 'high';
      steps.push({
        title: 'Treat this as expensive money',
        detail: 'Payday and revolving credit card debt usually have the worst lifetime cost. Borrow the smallest critical amount and repay as soon as income arrives.'
      });
    }

    if (ctx.lenderId === 'friend' || ctx.lenderId === 'family') {
      triggered.push({ id: 'informal_lender', label: 'Friend or family lender' });
      steps.push({
        title: 'Write a clear repayment plan',
        detail: 'Agree amount, rate (even 0%), dates, and what happens if a payment is missed. Share a written schedule — it protects the relationship.'
      });
    }

    // --- Reason buckets ---
    triggered.push({
      id: 'reason_' + reason.id,
      label: 'Reason: ' + reason.label
    });

    if (reason.bucket === 'lifestyle') {
      headline = 'This looks non-essential — delay and fund it yourself if you still want it.';
      if (severity === 'moderate') severity = 'high';
      steps = steps.concat([
        {
          title: 'Delay 90 days',
          detail: 'Put the purchase on a 90-day list. Most lifestyle desires fade; if it remains, you decide with a cooler head.'
        },
        {
          title: 'Price it in hours of your life',
          detail: loan
            ? 'At your planned EMI, this loan costs roughly ' + formatHoursHint(loan) + ' of work-equivalent burden each month — is the item worth that?'
            : 'Divide the total interest by your hourly take-home. That is the pure loss in hours of your life.'
        },
        {
          title: 'Cheaper or second-hand first',
          detail: 'Find a lower-cost version, wait for a sale, or buy used before financing new.'
        },
        {
          title: '30–60 day side-income sprint',
          detail: 'Fund it with a focused income push instead of locking in months of repayments.'
        }
      ]);
    } else if (reason.bucket === 'emergency') {
      headline = 'Emergency borrowing: minimize the amount, bridge temporarily, then rebuild.';
      steps = steps.concat([
        {
          title: 'Borrow only what is critical',
          detail: 'Separate must-pay medical/survival costs from nice-to-have add-ons. Smaller principal = less pure interest loss.'
        },
        {
          title: 'Check bridges before a loan',
          detail: 'Hospital payment plans, employer advances, government schemes, community funds, or family at 0% often beat commercial rates.'
        },
        {
          title: 'Repay high-interest the moment income returns',
          detail: 'When cash flow recovers, prioritize clearing this balance before new spending habits return.'
        },
        {
          title: 'Set a rebuild target',
          detail: 'After survival mode, automate even a small emergency-fund transfer so the next shock does not require a lender.'
        }
      ]);
    } else if (reason.bucket === 'invest') {
      headline = 'Only borrow if the return clearly beats the loan cost within 12–18 months.';
      steps = steps.concat([
        {
          title: 'Validate ROI before you sign',
          detail: 'Will this education or business create more income than the total interest within 12–18 months? If not, shrink the plan or wait.'
        },
        {
          title: 'Hunt cheaper capital',
          detail: 'Grants, scholarships, employer sponsorship, revenue-based financing, or a smaller pilot often beat a full personal loan.'
        },
        {
          title: 'Keep money streams separate',
          detail: 'Do not mix household cash with business risk. A written budget for loan proceeds prevents lifestyle bleed.'
        }
      ]);
    } else if (reason.bucket === 'debt') {
      headline = 'Consolidation only helps if the new loan is cheaper and closes the old ones.';
      steps = steps.concat([
        {
          title: 'Compare total interest, not just EMI',
          detail: 'A longer tenure can lower EMI while increasing lifetime cost. Run the numbers both ways before consolidating.'
        },
        {
          title: 'Close the old accounts',
          detail: 'If you consolidate and keep revolving credit open, balances often creep back. Cut up or freeze cards you cannot manage.'
        },
        {
          title: 'Hard rule after payoff',
          detail: 'Once clear, commit to no new consumer debt for 12–24 months while you rebuild cash buffers.'
        }
      ]);
    } else {
      headline = 'Treat this as optional until the numbers and alternatives are clear.';
      steps = steps.concat([
        {
          title: 'Name the real problem',
          detail: ctx.problemSentence
            ? 'You wrote: “' + truncate(ctx.problemSentence, 160) + '”. Ask whether a loan is the only tool that solves that problem.'
            : 'In one sentence, what problem does this money solve? If the sentence is vague, pause.'
        },
        {
          title: 'Size the downside of waiting',
          detail: 'Write the realistic worst case of not borrowing for 6–12 months. If you can live with it, you may not need the loan.'
        }
      ]);
    }

    // Universal moves (always appended, de-duplicated by title)
    var universal = [
      {
        title: 'Refinance or negotiate the rate',
        detail: 'Banks, NBFCs, and especially friends/family often accept a clearer plan at a lower rate. Ask — silence is expensive.'
      },
      {
        title: 'Raise income temporarily instead of debt',
        detail: 'A short sprint of overtime, freelancing, or selling unused items can shrink or eliminate the principal.'
      },
      {
        title: 'Cut the lowest-value 10–15% of expenses',
        detail: 'For the duration of the loan, trim subscriptions and discretionary spend that you would not defend out loud.'
      },
      {
        title: 'Share a written repayment plan',
        detail: 'Accountability to one trusted person dramatically improves follow-through.'
      }
    ];

    universal.forEach(function (u) {
      if (!steps.some(function (s) { return s.title === u.title; })) steps.push(u);
    });

    // Next actions timeline
    var plan30 = buildTimeline(reason, ctx, loan);

    return {
      reason: reason,
      severity: severity,
      headline: headline,
      honestQuestion: honestQuestion,
      triggeredRules: triggered,
      steps: steps,
      plan: plan30,
      alternatives: buildAlternatives(reason, ctx)
    };
  }

  function buildTimeline(reason, ctx, loan) {
    var day30 = [];
    var day60 = [];
    var day90 = [];

    if (reason.bucket === 'lifestyle') {
      day30.push('Add the purchase to a 90-day waitlist; delete saved carts and stop browsing it daily.');
      day30.push('Calculate total interest as “hours of work” and write it on a sticky note.');
      day60.push('Run a side-income sprint equal to at least 25–50% of the principal.');
      day60.push('Price second-hand / cheaper alternatives and keep screenshots.');
      day90.push('Re-decide with the full cost summary in front of you. Default answer: do not borrow.');
    } else if (reason.bucket === 'emergency') {
      day30.push('Confirm the minimum critical amount; decline non-essential add-ons.');
      day30.push('Ask hospital/employer/community for payment plans before signing a high-rate loan.');
      day60.push('As income returns, route surplus to the highest-rate balance first.');
      day90.push('Automate an emergency-fund transfer; set a 3-month expense target.');
    } else if (reason.bucket === 'invest') {
      day30.push('Write a one-page ROI: expected income uplift vs total loan interest.');
      day30.push('Apply to at least two cheaper capital sources (grant, scholarship, sponsor).');
      day60.push('Pilot a smaller version of the plan that needs less principal.');
      day90.push('Proceed only if projected return still beats loan cost with a margin of safety.');
    } else {
      day30.push('Fill the cost summary and say the honest question out loud.');
      day30.push('List three alternatives that do not require this loan.');
      day60.push('Negotiate rate/tenure or reduce principal by funding part yourself.');
      day90.push('If you still borrow, lock a repayment date and a no-new-debt rule afterward.');
    }

    if (ctx.debtRatioHigh === 'yes') {
      day30.unshift('Do not sign until you can show total debt payments stay under ~40% of income — or have a written exception plan.');
    }
    if (loan && loan.withExtra && loan.withExtra.monthsSaved > 0) {
      day60.push(
        'If you must borrow, try the extra-payment plan: it can finish ~'
        + loan.withExtra.monthsSaved
        + ' month(s) sooner and save interest.'
      );
    }

    return { days30: day30, days60: day60, days90: day90 };
  }

  function buildAlternatives(reason, ctx) {
    var list = [];
    if (reason.bucket === 'lifestyle') {
      list.push('Wait 90 days and reassess');
      list.push('Buy used / lower tier');
      list.push('Fund with a short income sprint');
    } else if (reason.bucket === 'emergency') {
      list.push('Payment plan with provider');
      list.push('Employer advance or leave encashment');
      list.push('Community / government assistance');
      list.push('0% family bridge with written terms');
    } else if (reason.bucket === 'invest') {
      list.push('Scholarship, grant, or employer sponsorship');
      list.push('Smaller pilot before full capital');
      list.push('Revenue-based or milestone funding');
    } else if (reason.bucket === 'debt') {
      list.push('Direct negotiation with current lenders');
      list.push('Balance transfer with a real payoff date');
      list.push('Credit counseling (fee-only)');
    } else {
      list.push('Delay and reduce the amount');
      list.push('Partial self-funding');
      list.push('Negotiate a lower rate with a clear plan');
    }
    if (ctx.lenderId === 'payday') {
      list.unshift('Any non-payday bridge — payday is usually the worst lifetime cost');
    }
    return list;
  }

  function formatHoursHint(loan) {
    // Soft hint without assuming wage — speak in EMI terms
    return 'one full EMI of work-value';
  }

  function truncate(s, n) {
    s = String(s || '');
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
  }

  global.SYAdvice = {
    REASONS: REASONS,
    LENDERS: LENDERS,
    reasonById: reasonById,
    buildAdvice: buildAdvice
  };
})(typeof window !== 'undefined' ? window : globalThis);
