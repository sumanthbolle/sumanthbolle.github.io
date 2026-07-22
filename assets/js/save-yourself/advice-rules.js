/**
 * Deterministic advice engine for Save Yourself.
 * Rule-based; returns transparent triggeredRules + prioritized actions.
 * Tone is non-judgmental: it never implies the borrower failed by needing money.
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

  // Reason-specific reflective question. Never uses "can you live with that",
  // which is inappropriate for medical or emergency borrowing.
  var HONEST_QUESTION = {
    emergency: 'What is the smallest amount that covers the essential need right now, and which non-loan bridge can cover the rest?',
    invest: 'Will this reliably earn or save more than its total cost within about 12–18 months?',
    debt: 'Does this new loan actually lower my total cost and close the old debts for good?',
    lifestyle: 'If I wait 90 days and it still matters, can I fund it without borrowing?',
    mixed: 'Is a loan the clearest way to solve this, and is the amount as small as it can be?'
  };

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
   * @param {'yes'|'no'|'partial'|'unknown'} [ctx.emergencyFund]
   * @param {'one_time'|'recurring'|'unknown'} [ctx.shortfallType]
   * @param {object} [ctx.loan] — result from SYLoanMath.calculate (may include .dti)
   */
  function buildAdvice(ctx) {
    var reason = reasonById(ctx.reasonId) || reasonById('other');
    var loan = ctx.loan && ctx.loan.ok ? ctx.loan : null;
    var dti = loan && loan.dti ? loan.dti : null;

    var triggered = [];
    var priorityActions = []; // burden-driven, most urgent
    var reasonActions = [];   // reason-specific
    var severity = 'moderate';

    // --- Debt-to-income (computed, not self-reported) ---
    if (dti) {
      if (dti.band === 'high') {
        triggered.push({ id: 'dti_high', label: 'Debt payments ≈ ' + Math.round(dti.percent) + '% of income (high)' });
        severity = 'critical';
        priorityActions.push({
          title: 'Check affordability before signing',
          detail: 'With this EMI, your monthly debt payments reach about ' + Math.round(dti.percent)
            + '% of gross income. Comfort thresholds vary by lender, product, and country — many flag anything above roughly a third — so treat this as a signal to reduce the amount or extend nothing further without a plan.'
        });
      } else if (dti.band === 'elevated') {
        triggered.push({ id: 'dti_elevated', label: 'Debt payments ≈ ' + Math.round(dti.percent) + '% of income' });
        if (severity === 'moderate') severity = 'high';
        priorityActions.push({
          title: 'Keep an eye on total commitments',
          detail: 'Debt payments would sit near ' + Math.round(dti.percent)
            + '% of gross income. Some products and jurisdictions allow more (for example, housing limits can be higher), but a smaller amount or shorter tenure leaves more breathing room.'
        });
      }
    }

    if (ctx.emergencyFund === 'no') {
      triggered.push({ id: 'no_emergency_fund', label: 'No 3+ month emergency fund' });
      if (severity === 'moderate') severity = 'high';
      priorityActions.push({
        title: 'Start a small buffer alongside repayment',
        detail: 'Even a modest automatic transfer after essentials builds the cushion that reduces the need for the next loan.'
      });
    } else if (ctx.emergencyFund === 'partial') {
      triggered.push({ id: 'partial_emergency_fund', label: 'Partial emergency fund' });
    }

    if (ctx.shortfallType === 'recurring') {
      triggered.push({ id: 'recurring_shortfall', label: 'Recurring monthly shortfall' });
      severity = severity === 'critical' ? 'critical' : 'high';
      priorityActions.push({
        title: 'Address the monthly gap first',
        detail: 'A loan adds a fixed payment rather than closing a recurring gap. Raising income or trimming lower-value spend fixes the root cause; a loan alone usually does not.'
      });
    }

    if (loan && loan.aprPercent != null && loan.aprPercent >= 36) {
      triggered.push({ id: 'predatory_rate', label: 'Effective rate ≥ 36% p.a.' });
      severity = 'critical';
    } else if (loan && loan.annualRatePercent >= 24) {
      triggered.push({ id: 'high_rate', label: 'Rate ≥ 24% p.a.' });
      if (severity === 'moderate') severity = 'high';
    }

    if (ctx.lenderId === 'payday' || ctx.lenderId === 'credit_card') {
      triggered.push({
        id: 'expensive_lender',
        label: ctx.lenderId === 'payday' ? 'Payday lender' : 'Credit card borrowing'
      });
      if (severity !== 'critical') severity = 'high';
      priorityActions.push({
        title: 'This is usually the most expensive money',
        detail: 'Payday and revolving credit-card balances tend to carry the highest lifetime cost. Borrow only the critical amount and clear it as soon as income allows.'
      });
    }

    if (ctx.lenderId === 'friend' || ctx.lenderId === 'family') {
      triggered.push({ id: 'informal_lender', label: 'Friend or family lender' });
      reasonActions.push({
        title: 'Put the terms in writing',
        detail: 'Agree amount, rate (even 0%), dates, and what happens if a payment slips. A short written schedule protects the relationship.'
      });
    }

    triggered.push({ id: 'reason_' + reason.id, label: 'Reason: ' + reason.label });

    var headline = '';
    if (reason.bucket === 'lifestyle') {
      headline = 'This looks flexible in timing — delaying or partly self-funding could remove the loan entirely.';
      if (severity === 'moderate') severity = 'high';
      reasonActions = reasonActions.concat([
        {
          title: 'Delay 90 days',
          detail: 'Put the purchase on a 90-day list. If it still matters afterward, you decide with a clearer head.'
        },
        {
          title: 'Price it in hours of your life',
          detail: 'Divide the total cost of borrowing by your hourly take-home pay. That number is how many extra work-hours the financing adds.'
        },
        {
          title: 'Cheaper, used, or a short income sprint',
          detail: 'A lower-cost version, a sale, or a focused 30–60 day earning push can fund it without months of repayments.'
        }
      ]);
    } else if (reason.bucket === 'emergency') {
      headline = 'Emergencies are valid reasons to borrow — the goal is the smallest amount and the cheapest bridge.';
      reasonActions = reasonActions.concat([
        {
          title: 'Borrow only what is critical now',
          detail: 'Separate must-pay costs from anything that can wait. A smaller principal means less cost of borrowing.'
        },
        {
          title: 'Check lower-cost bridges first',
          detail: 'Hospital payment plans, employer advances, government schemes, community funds, or family at 0% often beat commercial rates.'
        },
        {
          title: 'Rebuild gently once stable',
          detail: 'When income recovers, clear the highest-cost balance first, then automate a small buffer for next time.'
        }
      ]);
    } else if (reason.bucket === 'invest') {
      headline = 'Borrowing to invest in yourself can pay off — if the return clearly beats the total cost.';
      reasonActions = reasonActions.concat([
        {
          title: 'Write a one-page return check',
          detail: 'Estimate the income or savings this creates within 12–18 months and compare it to the cost of borrowing. If it is close, shrink the plan.'
        },
        {
          title: 'Hunt cheaper capital',
          detail: 'Grants, scholarships, employer sponsorship, revenue-based financing, or a smaller pilot often cost less than a personal loan.'
        },
        {
          title: 'Keep money streams separate',
          detail: 'A dedicated budget for the loan proceeds prevents everyday spending from eating into the plan.'
        }
      ]);
    } else if (reason.bucket === 'debt') {
      headline = 'Consolidation helps only when the new loan is genuinely cheaper and closes the old balances.';
      reasonActions = reasonActions.concat([
        {
          title: 'Compare total cost, not just EMI',
          detail: 'A longer tenure can lower the monthly payment while raising lifetime cost. Check both before consolidating.'
        },
        {
          title: 'Close what you consolidate',
          detail: 'If old revolving credit stays open, balances often rebuild. Freeze or close accounts you cannot manage.'
        },
        {
          title: 'Set a payoff-forward rule',
          detail: 'Once clear, give yourself a defined window with no new consumer debt while buffers rebuild.'
        }
      ]);
    } else {
      headline = 'Worth a careful look — clarify the numbers and alternatives before committing.';
      reasonActions = reasonActions.concat([
        {
          title: 'Name the real problem',
          detail: ctx.problemSentence
            ? 'You wrote: “' + truncate(ctx.problemSentence, 160) + '”. Check whether a loan is the clearest tool for that.'
            : 'In one sentence, what does this money solve? If the sentence is vague, it is worth pausing.'
        },
        {
          title: 'Size the alternatives',
          detail: 'List two or three ways to solve this with less borrowing, then compare them to the cost shown.'
        }
      ]);
    }

    // Universal moves — kept short and only added if room remains.
    var universal = [
      {
        title: 'Negotiate the rate or fees',
        detail: 'Lenders, and especially friends or family, often accept a clearer plan at a lower rate. Fees are frequently negotiable too.'
      },
      {
        title: 'Reduce the principal a little',
        detail: 'Even funding 10–20% yourself measurably cuts the cost of borrowing shown above.'
      },
      {
        title: 'Share a written repayment plan',
        detail: 'Telling one trusted person your payoff date meaningfully improves follow-through.'
      }
    ];

    // Prioritized, de-duplicated action list. Burden actions first, then reason, then universal.
    var ordered = dedupeByTitle(priorityActions.concat(reasonActions).concat(universal));
    var topActions = ordered.slice(0, 3);
    var moreActions = ordered.slice(3);

    var plan = buildTimeline(reason, ctx, loan, dti);

    return {
      reason: reason,
      severity: severity,
      headline: headline,
      honestQuestion: HONEST_QUESTION[reason.bucket] || HONEST_QUESTION.mixed,
      triggeredRules: triggered,
      topActions: topActions,
      moreActions: moreActions,
      steps: ordered,
      plan: plan,
      alternatives: buildAlternatives(reason, ctx)
    };
  }

  function dedupeByTitle(list) {
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (item) {
      if (seen[item.title]) return;
      seen[item.title] = true;
      out.push(item);
    });
    return out;
  }

  function buildTimeline(reason, ctx, loan, dti) {
    var day30 = [];
    var day60 = [];
    var day90 = [];

    if (reason.bucket === 'lifestyle') {
      day30.push('Add the purchase to a 90-day waitlist and stop browsing it daily.');
      day60.push('Run a short income sprint or find a cheaper/used option.');
      day90.push('Re-decide with the full cost summary in front of you.');
    } else if (reason.bucket === 'emergency') {
      day30.push('Confirm the minimum critical amount; ask providers/employer for payment plans.');
      day60.push('As income returns, route surplus to the highest-cost balance first.');
      day90.push('Automate a small buffer toward a 3-month expense target.');
    } else if (reason.bucket === 'invest') {
      day30.push('Write the return check and apply to one or two cheaper capital sources.');
      day60.push('Pilot a smaller version that needs less principal.');
      day90.push('Proceed only if the projected return still beats the cost with margin.');
    } else if (reason.bucket === 'debt') {
      day30.push('List every balance with its rate; compare consolidation total cost both ways.');
      day60.push('If consolidating, close or freeze the old revolving credit.');
      day90.push('Lock a payoff date and a no-new-debt window afterward.');
    } else {
      day30.push('Fill the cost summary and list three lower-borrowing alternatives.');
      day60.push('Negotiate rate/tenure or fund part of it yourself.');
      day90.push('If you still borrow, lock a repayment date.');
    }

    if (dti && dti.band === 'high') {
      day30.unshift('Reduce the amount until monthly debt payments are comfortable for your income.');
    }
    if (loan && loan.withExtra && loan.withExtra.monthsSaved > 0) {
      day60.push('If you borrow, the extra-payment plan finishes about '
        + loan.withExtra.monthsSaved + ' month(s) sooner.');
    }

    return { days30: day30, days60: day60, days90: day90 };
  }

  function buildAlternatives(reason, ctx) {
    var list = [];
    if (reason.bucket === 'lifestyle') {
      list = ['Wait 90 days and reassess', 'Buy used or a lower tier', 'Fund with a short income sprint'];
    } else if (reason.bucket === 'emergency') {
      list = ['Payment plan with the provider', 'Employer advance', 'Community / government assistance', '0% family bridge with written terms'];
    } else if (reason.bucket === 'invest') {
      list = ['Scholarship, grant, or sponsorship', 'Smaller pilot first', 'Revenue-based or milestone funding'];
    } else if (reason.bucket === 'debt') {
      list = ['Negotiate directly with current lenders', 'Balance transfer with a real payoff date', 'Fee-only credit counseling'];
    } else {
      list = ['Delay and reduce the amount', 'Partial self-funding', 'Negotiate a lower rate'];
    }
    if (ctx.lenderId === 'payday') {
      list.unshift('Almost any non-payday bridge');
    }
    return list;
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
