/**
 * Pure loan math — reducing-balance EMI and flat-rate.
 * No external finance libraries. Integer minor-units where possible.
 *
 * Adds: one-time fees (deducted / separate / added), cash-flow annual cost via IRR,
 * debt-to-income helper, comparison scenarios, opportunity timeline, affordability.
 */
(function (global) {
  'use strict';

  var C = global.SYCurrency;

  /**
   * @param {object} input
   * @param {number} input.principal — major units
   * @param {number} input.annualRatePercent — e.g. 18 for 18%
   * @param {number} input.months — tenure in months (>= 1)
   * @param {'reducing'|'flat'} input.interestType
   * @param {string} [input.currency]
   * @param {number} [input.extraMonthly] — optional extra payment toward principal
   * @param {number} [input.opportunityRatePercent] — default 10
   * @param {object} [input.fees]
   * @param {number} [input.fees.processing] — processing fee value
   * @param {boolean} [input.fees.processingIsPercent] — treat processing as % of principal
   * @param {number} [input.fees.other] — insurance/legal/other one-time charges
   * @param {number} [input.fees.prepaymentPenaltyPercent] — % on principal prepaid early
   * @param {'deducted'|'separate'|'added'} [input.fees.treatment] — default deducted
   * @param {number} [input.grossMonthlyIncome] — for debt-to-income
   * @param {number} [input.existingMonthlyRepayments] — for debt-to-income
   * @param {'yes'|'partial'|'no'|'unknown'} [input.emergencyFund] — for the affordability verdict
   * @param {boolean} [input.withComparisons] — build better-rate / shorter-tenure scenarios
   */
  function calculateLoan(input) {
    var principal = Number(input.principal);
    var annualRate = Number(input.annualRatePercent);
    var months = Math.round(Number(input.months));
    var type = input.interestType === 'flat' ? 'flat' : 'reducing';
    var currency = input.currency || 'USD';
    var extra = Number(input.extraMonthly) || 0;
    var oppRate = Number.isFinite(Number(input.opportunityRatePercent))
      ? Number(input.opportunityRatePercent)
      : 10;

    var fees = normalizeFees(input.fees, principal, currency);

    if (!Number.isFinite(principal) || principal <= 0) {
      return { ok: false, error: 'amount', message: 'Enter an amount greater than zero.' };
    }
    if (!Number.isFinite(annualRate) || annualRate < 0) {
      return { ok: false, error: 'rate', message: 'Interest rate cannot be negative.' };
    }
    if (!Number.isFinite(months) || months < 1 || months > 600) {
      return { ok: false, error: 'tenure', message: 'Tenure must be between 1 month and 50 years.' };
    }
    if (extra < 0) {
      return { ok: false, error: 'extra', message: 'Extra payment cannot be negative.' };
    }

    var grossPrincipal = C.roundMoney(principal, currency);
    var upfrontFees = fees.total;
    var treatment = fees.treatment;
    var financedPrincipal;
    var netProceeds;

    if (treatment === 'added') {
      financedPrincipal = C.roundMoney(principal + upfrontFees, currency);
      netProceeds = C.roundMoney(principal, currency);
    } else {
      // deducted | separate — repayments on principal; APR uses principal − fees
      financedPrincipal = C.roundMoney(principal, currency);
      netProceeds = C.roundMoney(principal - upfrontFees, currency);
    }

    var base;
    try {
      if (type === 'flat') {
        base = calcFlat(financedPrincipal, annualRate, months, currency);
      } else {
        base = calcReducing(financedPrincipal, annualRate, months, currency);
      }
    } catch (e) {
      return { ok: false, error: 'calc', message: e.message || 'Could not calculate this loan.' };
    }

    var scheduleTotal = base.totalPayable;
    var totalInterest = base.totalInterest;
    // deducted/separate: fees are cash at t=0 (or reduced payout); added: fees sit inside EMIs
    var totalPaid = treatment === 'added'
      ? scheduleTotal
      : C.roundMoney(scheduleTotal + upfrontFees, currency);
    var costOfBorrowing = C.roundMoney(totalInterest + upfrontFees, currency);
    var netDisbursed = netProceeds;
    var totalPrincipalPaid = financedPrincipal;

    var monthlyCashFlowRate = null;
    var estimatedNominalAnnualCost = null;
    var estimatedEffectiveAnnualCost = null;
    if (netProceeds > 0 && base.schedule && base.schedule.length) {
      monthlyCashFlowRate = estimateMonthlyCashFlowRate(netProceeds, base.schedule);
      if (monthlyCashFlowRate != null) {
        estimatedNominalAnnualCost = monthlyCashFlowRate * 12 * 100;
        estimatedEffectiveAnnualCost = (Math.pow(1 + monthlyCashFlowRate, 12) - 1) * 100;
      }
    }
    // Backward-compatible APR field = nominal annualisation of monthly IRR
    var apr = estimatedNominalAnnualCost;

    var withExtra = null;
    if (extra > 0 && type === 'reducing') {
      withExtra = simulateExtraPayments(
        financedPrincipal, annualRate, months, extra, currency, base.emi, base.schedule, fees.prepaymentPenaltyPercent
      );
    } else if (extra > 0 && type === 'flat') {
      withExtra = simulateFlatExtra(base, extra, currency);
    }

    var opportunity = opportunityCost(costOfBorrowing, months, oppRate, currency);

    var warnings = [];
    if (netProceeds <= 0 && upfrontFees > 0) {
      warnings.push({
        code: 'fees_consume_payout',
        message: 'Upfront fees use up the full loan amount, so there is nothing left to disburse. Confirm the fee schedule before proceeding.'
      });
    }
    if (annualRate >= 36) {
      warnings.push({
        code: 'predatory_rate',
        message: 'Rates at or above 36% p.a. are widely treated as high-cost. Confirm every fee and compare cheaper alternatives before proceeding.'
      });
    } else if (annualRate >= 24) {
      warnings.push({
        code: 'high_rate',
        message: 'This rate is high. Credit cards, payday lenders, and some NBFCs price in this range — it is worth shopping around or negotiating.'
      });
    }
    if (months >= 360) {
      warnings.push({
        code: 'long_tenure',
        message: 'Over a 30+ year term, borrowing cost can exceed the amount borrowed. A shorter term lowers total cost if cash flow allows.'
      });
    }
    if (annualRate === 0 && upfrontFees === 0) {
      warnings.push({
        code: 'zero_rate',
        message: 'Zero interest and zero fees assumed. Confirm there are no processing or hidden charges.'
      });
    }
    if (type === 'flat' && apr != null && apr > annualRate + 1) {
      warnings.push({
        code: 'flat_eir_gap',
        message: 'Flat-rate loans cost more than the headline number suggests. The effective rate (EIR) here is about '
          + apr.toFixed(1) + '% p.a. versus the ' + annualRate + '% flat rate quoted.'
      });
    }

    var comparisons = input.withComparisons
      ? buildComparisons(principal, annualRate, months, type, currency, {
          emi: base.emi,
          totalInterest: totalInterest,
          totalPayable: totalPaid
        }, upfrontFees, treatment)
      : null;

    var dti = debtRatio(input.grossMonthlyIncome, input.existingMonthlyRepayments, base.emi, currency);
    var lifeCostFigures = lifeCost(totalPaid, costOfBorrowing, input.grossMonthlyIncome);
    var affordabilityVerdict = affordability({
      dti: dti,
      emergencyFund: input.emergencyFund,
      aprPercent: apr,
      annualRatePercent: annualRate,
      currency: currency
    });
    var pressure = cashFlowPressure(
      input.grossMonthlyIncome,
      input.existingMonthlyRepayments,
      base.emi,
      currency,
      input.emergencyFund
    );
    var costPerHundred = grossPrincipal > 0
      ? (totalPaid / grossPrincipal) * 100
      : null;
    var signal = buildCostSignal(estimatedNominalAnnualCost);

    return {
      ok: true,
      interestType: type,
      currency: currency,
      principal: grossPrincipal,
      grossPrincipal: grossPrincipal,
      financedPrincipal: financedPrincipal,
      annualRatePercent: annualRate,
      months: months,
      emi: base.emi,
      scheduledPayment: base.emi,
      totalPayable: totalPaid,
      totalPaid: totalPaid,
      totalInterest: totalInterest,
      totalInterestPaid: totalInterest,
      totalPrincipalPaid: totalPrincipalPaid,
      totalFeesPaid: upfrontFees,
      fees: {
        processing: fees.processing,
        other: fees.other,
        total: upfrontFees,
        treatment: treatment,
        processingIsPercent: !!fees.processingIsPercent,
        prepaymentPenaltyPercent: fees.prepaymentPenaltyPercent
      },
      upfrontFees: upfrontFees,
      costOfBorrowing: costOfBorrowing,
      borrowingCost: costOfBorrowing,
      netDisbursed: netDisbursed,
      netProceeds: netProceeds,
      aprPercent: apr,
      monthlyCashFlowRate: monthlyCashFlowRate,
      estimatedNominalAnnualCost: estimatedNominalAnnualCost,
      estimatedEffectiveAnnualCost: estimatedEffectiveAnnualCost,
      costPerHundred: costPerHundred,
      costSignal: signal,
      effectiveMonthly: base.emi,
      costPerDay: C.roundMoney(totalPaid / (months * 30.4375), currency),
      opportunity: opportunity,
      opportunityTimeline: opportunityTimeline(base.emi, oppRate, currency),
      lifeCost: lifeCostFigures,
      affordability: affordabilityVerdict,
      cashFlowPressure: pressure,
      schedule: base.schedule || null,
      amortization: base.schedule || null,
      withExtra: withExtra,
      comparisons: comparisons,
      dti: dti,
      warnings: warnings,
      formulaNote: type === 'reducing'
        ? 'Reducing-balance EMI: P × r(1+r)^n / ((1+r)^n − 1), where r is the monthly rate. EIR/APR includes one-time fees.'
        : 'Flat rate: interest = P × annual rate × years; EMI = (P + interest) / n. EIR/APR shows the true effective cost.'
    };
  }

  function normalizeFees(fees, principal, currency) {
    fees = fees || {};
    var processingRaw = Number(fees.processing) || 0;
    var processingIsPercent = !!fees.processingIsPercent;
    var processing = processingIsPercent
      ? C.roundMoney(principal * processingRaw / 100, currency)
      : C.roundMoney(processingRaw, currency);
    var other = C.roundMoney(Number(fees.other) || 0, currency);
    if (processing < 0) processing = 0;
    if (other < 0) other = 0;
    var penalty = Number(fees.prepaymentPenaltyPercent) || 0;
    if (penalty < 0) penalty = 0;
    var treatment = fees.treatment;
    if (treatment !== 'separate' && treatment !== 'added') treatment = 'deducted';
    return {
      processing: processing,
      other: other,
      total: C.roundMoney(processing + other, currency),
      processingIsPercent: processingIsPercent,
      prepaymentPenaltyPercent: penalty,
      treatment: treatment
    };
  }

  function calcReducing(principal, annualRatePercent, months, currency) {
    if (annualRatePercent === 0 || Math.abs(annualRatePercent) < 1e-12) {
      var emi0 = C.roundMoney(principal / months, currency);
      var schedule0 = buildZeroInterestSchedule(principal, months, currency);
      var total0 = schedule0.reduce(function (s, row) { return s + row.payment; }, 0);
      return {
        emi: emi0,
        totalPayable: C.roundMoney(total0, currency),
        totalInterest: 0,
        schedule: schedule0
      };
    }

    var r = annualRatePercent / 12 / 100;
    var factor = Math.pow(1 + r, months);
    var emiRaw = principal * r * factor / (factor - 1);
    var emi = C.roundMoney(emiRaw, currency);
    var schedule = buildReducingSchedule(principal, r, months, emi, currency);
    var totalPayable = schedule.reduce(function (s, row) { return s + row.payment; }, 0);
    var totalInterest = C.roundMoney(totalPayable - principal, currency);
    return {
      emi: emi,
      totalPayable: C.roundMoney(totalPayable, currency),
      totalInterest: totalInterest,
      schedule: schedule
    };
  }

  function calcFlat(principal, annualRatePercent, months, currency) {
    var years = months / 12;
    var interest = C.roundMoney(principal * (annualRatePercent / 100) * years, currency);
    var totalPayable = C.roundMoney(principal + interest, currency);
    var emi = C.roundMoney(totalPayable / months, currency);
    var schedule = [];
    var paid = 0;
    var principalLeft = principal;
    var interestLeft = interest;
    for (var i = 1; i <= months; i++) {
      var payment = i === months
        ? C.roundMoney(totalPayable - paid, currency)
        : emi;
      var interestPart = C.roundMoney(interest / months, currency);
      var principalPart = C.roundMoney(payment - interestPart, currency);
      if (i === months) {
        principalPart = C.roundMoney(principalLeft, currency);
        interestPart = C.roundMoney(payment - principalPart, currency);
      }
      principalLeft = C.roundMoney(principalLeft - principalPart, currency);
      interestLeft = C.roundMoney(interestLeft - interestPart, currency);
      paid = C.roundMoney(paid + payment, currency);
      schedule.push({
        month: i,
        payment: payment,
        principal: principalPart,
        interest: interestPart,
        balance: Math.max(0, principalLeft)
      });
    }
    return { emi: emi, totalPayable: totalPayable, totalInterest: interest, schedule: schedule };
  }

  function buildZeroInterestSchedule(principal, months, currency) {
    var emi = C.roundMoney(principal / months, currency);
    var balance = principal;
    var rows = [];
    var paid = 0;
    for (var i = 1; i <= months; i++) {
      var payment = i === months
        ? C.roundMoney(principal - paid, currency)
        : emi;
      paid = C.roundMoney(paid + payment, currency);
      balance = C.roundMoney(balance - payment, currency);
      rows.push({
        month: i,
        payment: payment,
        principal: payment,
        interest: 0,
        balance: Math.max(0, balance)
      });
    }
    return rows;
  }

  function buildReducingSchedule(principal, monthlyRate, months, emi, currency) {
    var balance = principal;
    var rows = [];
    for (var i = 1; i <= months; i++) {
      var interest = C.roundMoney(balance * monthlyRate, currency);
      var payment;
      var principalPart;
      if (i === months || balance + interest <= emi) {
        payment = C.roundMoney(balance + interest, currency);
        principalPart = C.roundMoney(balance, currency);
        balance = 0;
      } else {
        payment = emi;
        principalPart = C.roundMoney(payment - interest, currency);
        if (principalPart > balance) {
          principalPart = C.roundMoney(balance, currency);
          payment = C.roundMoney(principalPart + interest, currency);
          balance = 0;
        } else {
          balance = C.roundMoney(balance - principalPart, currency);
        }
      }
      rows.push({
        month: i,
        payment: payment,
        principal: principalPart,
        interest: interest,
        balance: Math.max(0, balance)
      });
      if (balance <= 0) break;
    }
    return rows;
  }

  /**
   * Monthly IRR on loan cashflows: t=0 receive netAmount; each month pay schedule[t].payment.
   * Returns monthly rate or null when undefined.
   */
  function estimateMonthlyCashFlowRate(netAmount, schedule) {
    if (!(netAmount > 0) || !schedule || !schedule.length) return null;
    var pays = schedule.map(function (r) { return r.payment; });

    function npv(i) {
      var s = 0;
      for (var t = 0; t < pays.length; t++) {
        s += pays[t] / Math.pow(1 + i, t + 1);
      }
      return s - netAmount;
    }

    if (npv(0) <= 1e-9) return 0;
    var lo = 0;
    var hi = 1;
    var guard = 0;
    while (npv(hi) > 0 && hi < 1000 && guard < 80) { hi *= 2; guard++; }
    for (var k = 0; k < 200; k++) {
      var mid = (lo + hi) / 2;
      var v = npv(mid);
      if (Math.abs(v) < 1e-8) { lo = mid; hi = mid; break; }
      if (v > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * APR / EIR via IRR — annualise monthly rate as i × 12 × 100 (nominal).
   */
  function computeAPR(netAmount, schedule) {
    var monthly = estimateMonthlyCashFlowRate(netAmount, schedule);
    if (monthly == null) return null;
    return monthly * 12 * 100;
  }

  function buildCostSignal(nominalAnnual) {
    if (nominalAnnual == null || !Number.isFinite(nominalAnnual)) return null;
    var band;
    var label;
    var guidance;
    if (nominalAnnual <= 8) {
      band = 'lower';
      label = 'Lower cost';
      guidance = 'This sits in a lower-cost range for consumer credit. Still compare a couple of offers before you commit.';
    } else if (nominalAnnual <= 15) {
      band = 'elevated';
      label = 'Elevated';
      guidance = 'The annual cost is higher than many everyday personal loans. A lower rate or lighter fees can change the total.';
    } else if (nominalAnnual <= 25) {
      band = 'expensive';
      label = 'Expensive';
      guidance = 'This is expensive credit on an annual-cost basis. Check whether a smaller amount or another lender reduces the burden.';
    } else {
      band = 'severe';
      label = 'Severe';
      guidance = 'The annual cost is very high. Pause and compare alternatives, including not borrowing, before you sign.';
    }
    return { band: band, label: label, guidance: guidance };
  }

  function debtRatio(grossMonthlyIncome, existingMonthlyRepayments, emi, currency) {
    var income = Number(grossMonthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return null;
    var existing = Number(existingMonthlyRepayments) || 0;
    if (existing < 0) existing = 0;
    var totalPayments = C.roundMoney(existing + (emi || 0), currency);
    var ratio = totalPayments / income;
    var band;
    if (ratio >= 0.5) band = 'high';
    else if (ratio >= 0.36) band = 'elevated';
    else band = 'moderate';
    return {
      income: C.roundMoney(income, currency),
      existing: C.roundMoney(existing, currency),
      emi: emi || 0,
      totalPayments: totalPayments,
      ratio: ratio,
      percent: ratio * 100,
      band: band
    };
  }

  function cashFlowPressure(grossMonthlyIncome, existingMonthlyRepayments, emi, currency, emergencyFund) {
    var income = Number(grossMonthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return null;
    var existing = Number(existingMonthlyRepayments) || 0;
    if (existing < 0) existing = 0;
    emi = emi || 0;
    var remaining = C.roundMoney(income - existing - emi, currency);
    var marginRatio = remaining / income;
    var marginLabel;
    if (marginRatio >= 0.4) marginLabel = 'comfortable';
    else if (marginRatio >= 0.25) marginLabel = 'watch';
    else if (marginRatio > 0) marginLabel = 'tight';
    else marginLabel = 'negative';

    var fund = emergencyFund || 'unknown';
    var emergencyBuffer = fund === 'yes' ? 'pass'
      : fund === 'partial' ? 'partial'
        : fund === 'no' ? 'fail' : 'unknown';

    return {
      income: C.roundMoney(income, currency),
      existing: C.roundMoney(existing, currency),
      emi: emi,
      remaining: remaining,
      newEmiShare: emi / income,
      allLoansShare: (existing + emi) / income,
      marginLabel: marginLabel,
      emergencyBuffer: emergencyBuffer
    };
  }

  /**
   * Translate money into working time. Uses a 40-hour week (173.33 hours/month),
   * which is the conventional full-time month used for hourly conversions.
   */
  var HOURS_PER_MONTH = 40 * 52 / 12;

  function lifeCost(totalPayable, costOfBorrowing, grossMonthlyIncome) {
    var income = Number(grossMonthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return null;
    var hourly = income / HOURS_PER_MONTH;
    if (!(hourly > 0)) return null;
    var hoursTotal = totalPayable / hourly;
    var hoursCost = costOfBorrowing / hourly;
    return {
      hourlyIncome: hourly,
      hoursPerWeek: 40,
      hoursTotal: hoursTotal,
      hoursCost: hoursCost,
      weeksTotal: hoursTotal / 40,
      weeksCost: hoursCost / 40,
      monthsOfIncome: totalPayable / income
    };
  }

  /** "If you saved the EMI instead" — 12 / 24 / 36 month horizons, cash vs invested. */
  function opportunityTimeline(monthlyAmount, opportunityRatePercent, currency) {
    var pmt = Number(monthlyAmount);
    if (!Number.isFinite(pmt) || pmt <= 0) return null;
    var rate = Number(opportunityRatePercent);
    if (!Number.isFinite(rate) || rate < 0) rate = 0;
    var r = rate / 12 / 100;
    return [12, 24, 36].map(function (n) {
      var saved = pmt * n;
      var invested = Math.abs(r) < 1e-15 ? saved : pmt * (Math.pow(1 + r, n) - 1) / r;
      return {
        months: n,
        years: n / 12,
        label: (n / 12) + (n === 12 ? ' year' : ' years'),
        saved: C.roundMoney(saved, currency),
        invested: C.roundMoney(invested, currency),
        gain: C.roundMoney(invested - saved, currency)
      };
    });
  }

  /**
   * Affordability verdict from computed signals only — never from a self-rating.
   * Returns green / amber / red plus the reasons behind it, so the call is auditable.
   */
  function affordability(input) {
    var dti = input.dti;
    var currency = input.currency;
    var fund = input.emergencyFund || 'unknown';
    var apr = Number.isFinite(Number(input.aprPercent)) ? Number(input.aprPercent) : null;
    var nominal = Number(input.annualRatePercent);
    var effective = apr != null ? apr : nominal;

    var margin = dti ? C.roundMoney(dti.income - dti.totalPayments, currency) : null;
    var marginRatio = dti && dti.income > 0 ? (dti.income - dti.totalPayments) / dti.income : null;

    // Stress test: could the payments still be met on 20% less income?
    var stressed = dti && dti.income > 0 ? dti.totalPayments / (dti.income * 0.8) : null;

    var bufferStatus = fund === 'yes' ? 'pass'
      : fund === 'partial' ? 'partial'
        : fund === 'no' ? 'fail' : 'unknown';

    var reasons = [];
    var level = 'safe';
    function escalate(next) {
      var order = { safe: 0, caution: 1, danger: 2 };
      if (order[next] > order[level]) level = next;
    }

    if (dti) {
      if (dti.band === 'high') {
        escalate('danger');
        reasons.push('Debt payments reach about ' + Math.round(dti.percent) + '% of gross income.');
      } else if (dti.band === 'elevated') {
        escalate('caution');
        reasons.push('Debt payments sit near ' + Math.round(dti.percent) + '% of gross income.');
      }
      if (margin != null && margin <= 0) {
        escalate('danger');
        reasons.push('Nothing is left each month after income minus all loan payments.');
      } else if (marginRatio != null && marginRatio < 0.25) {
        escalate('caution');
        reasons.push('Less than a quarter of income remains after all loan payments.');
      }
      if (stressed != null && stressed > 1) {
        escalate('danger');
        reasons.push('A 20% drop in income would leave the payments unaffordable.');
      } else if (stressed != null && stressed > 0.5) {
        escalate('caution');
        reasons.push('A 20% drop in income would push payments past half of what you earn.');
      }
    }

    if (bufferStatus === 'fail') {
      escalate('caution');
      reasons.push('No three-month emergency fund, so a single surprise could break the schedule.');
    } else if (bufferStatus === 'partial') {
      reasons.push('The emergency fund is partial — a short setback is covered, a long one is not.');
    }

    if (effective != null && effective >= 36) {
      escalate('danger');
      reasons.push('An effective rate at or above 36% p.a. is treated as high-cost credit almost everywhere.');
    } else if (effective != null && effective >= 24) {
      escalate('caution');
      reasons.push('An effective rate above 24% p.a. is expensive money worth shopping around.');
    }

    if (!dti && bufferStatus === 'unknown' && !reasons.length) {
      return {
        level: 'unknown',
        label: 'Add income to see a verdict',
        margin: null,
        marginRatio: null,
        stressRatio: null,
        emergencyBuffer: bufferStatus,
        reasons: ['Add gross monthly income under “Refine my assessment” for an affordability verdict.']
      };
    }

    if (!reasons.length) reasons.push('Payments, buffer, and rate all land inside commonly comfortable ranges.');

    return {
      level: level,
      label: level === 'danger' ? 'Danger' : level === 'caution' ? 'Caution' : 'Safe',
      margin: margin,
      marginRatio: marginRatio,
      stressRatio: stressed,
      emergencyBuffer: bufferStatus,
      reasons: reasons
    };
  }

  function runScenario(principal, annualRate, months, type, currency, feeTotal, treatment) {
    var financed = treatment === 'added'
      ? C.roundMoney(principal + feeTotal, currency)
      : principal;
    var calc = type === 'flat' ? calcFlat : calcReducing;
    var br = calc(financed, annualRate, months, currency);
    var totalPayable = treatment === 'added'
      ? br.totalPayable
      : C.roundMoney(br.totalPayable + feeTotal, currency);
    return {
      emi: br.emi,
      totalInterest: br.totalInterest,
      totalPayable: totalPayable,
      months: months,
      annualRatePercent: annualRate
    };
  }

  function buildComparisons(principal, annualRate, months, type, currency, base, feeTotal, treatment) {
    var out = [];
    feeTotal = feeTotal || 0;
    treatment = treatment || 'deducted';

    function pushScenario(id, label, alt) {
      var interestSaved = C.roundMoney(base.totalInterest - alt.totalInterest, currency);
      var totalSaved = C.roundMoney(base.totalPayable - alt.totalPayable, currency);
      var emiDelta = C.roundMoney(alt.emi - base.emi, currency);
      // Prefer scenarios with positive savings (interest or total cost).
      if (!(interestSaved > 0 || totalSaved > 0)) return;
      out.push({
        id: id,
        label: label,
        annualRatePercent: alt.annualRatePercent,
        months: alt.months,
        emi: alt.emi,
        totalInterest: alt.totalInterest,
        totalPayable: alt.totalPayable,
        interestSaved: interestSaved,
        totalSaved: totalSaved,
        emiDelta: emiDelta
      });
    }

    var rateMinus1 = Math.max(0, annualRate - 1);
    var rateMinus3 = Math.max(0, annualRate - 3);
    // When −1 and −3 collapse to the same floor, keep only better_rate for backward compat.
    if (rateMinus1 < annualRate && rateMinus1 !== rateMinus3) {
      pushScenario(
        'rate_minus_1',
        'Rate ' + rateMinus1 + '% (−1 ppt)',
        runScenario(principal, rateMinus1, months, type, currency, feeTotal, treatment)
      );
    }
    if (rateMinus3 < annualRate) {
      pushScenario(
        'better_rate',
        'Rate ' + rateMinus3 + '% (−3 pts)',
        runScenario(principal, rateMinus3, months, type, currency, feeTotal, treatment)
      );
    }

    if (feeTotal > 0) {
      pushScenario(
        'fees_removed',
        'Fees removed',
        runScenario(principal, annualRate, months, type, currency, 0, treatment)
      );
    }

    var shorter = Math.max(1, Math.round(months * 0.75));
    if (shorter < months) {
      pushScenario(
        'shorter_tenure',
        shorter + ' months (−' + (months - shorter) + ')',
        runScenario(principal, annualRate, shorter, type, currency, feeTotal, treatment)
      );
    }

    return out.length ? out : null;
  }

  function simulateExtraPayments(principal, annualRatePercent, maxMonths, extra, currency, baseEmi, baseSchedule, prepaymentPenaltyPercent) {
    var r = annualRatePercent / 12 / 100;
    var payment = C.roundMoney(baseEmi + extra, currency);
    var balance = principal;
    var totalPaid = 0;
    var totalInterest = 0;
    var month = 0;
    var schedule = [];

    while (balance > 0 && month < maxMonths + 120) {
      month += 1;
      var interest = annualRatePercent === 0
        ? 0
        : C.roundMoney(balance * r, currency);
      var due = C.roundMoney(balance + interest, currency);
      var pay = Math.min(payment, due);
      var principalPart = C.roundMoney(pay - interest, currency);
      if (principalPart > balance) {
        principalPart = C.roundMoney(balance, currency);
        pay = C.roundMoney(principalPart + interest, currency);
      }
      balance = C.roundMoney(balance - principalPart, currency);
      totalPaid = C.roundMoney(totalPaid + pay, currency);
      totalInterest = C.roundMoney(totalInterest + interest, currency);
      schedule.push({
        month: month,
        payment: pay,
        principal: principalPart,
        interest: interest,
        balance: Math.max(0, balance)
      });
      if (balance <= 0) break;
    }

    // Prepayment penalty applies to principal repaid ahead of the original schedule.
    var penalty = 0;
    if (prepaymentPenaltyPercent > 0 && baseSchedule && baseSchedule.length) {
      var idx = Math.min(month, baseSchedule.length) - 1;
      var cumPrincipal = 0;
      for (var i = 0; i <= idx; i++) cumPrincipal += baseSchedule[i].principal;
      var prepaid = Math.max(0, principal - cumPrincipal);
      penalty = C.roundMoney(prepaid * prepaymentPenaltyPercent / 100, currency);
    }

    return {
      months: month,
      monthsSaved: Math.max(0, maxMonths - month),
      emi: payment,
      totalPayable: C.roundMoney(totalPaid + penalty, currency),
      totalInterest: totalInterest,
      prepaymentPenalty: penalty,
      interestSaved: null,
      netSaving: null,
      totalSaved: null,
      schedule: schedule
    };
  }

  function simulateFlatExtra(base, extra, currency) {
    var payment = C.roundMoney(base.emi + extra, currency);
    var remaining = base.totalPayable;
    var month = 0;
    var schedule = [];
    while (remaining > 0 && month < base.schedule.length + 120) {
      month += 1;
      var pay = remaining <= payment ? C.roundMoney(remaining, currency) : payment;
      remaining = C.roundMoney(remaining - pay, currency);
      schedule.push({
        month: month,
        payment: pay,
        principal: pay,
        interest: 0,
        balance: Math.max(0, remaining)
      });
    }
    var totalPaid = schedule.reduce(function (s, row) { return s + row.payment; }, 0);
    return {
      months: month,
      monthsSaved: Math.max(0, base.schedule.length - month),
      emi: payment,
      totalPayable: C.roundMoney(totalPaid, currency),
      totalInterest: C.roundMoney(Math.max(0, totalPaid - (base.totalPayable - base.totalInterest)), currency),
      prepaymentPenalty: 0,
      interestSaved: null,
      netSaving: null,
      totalSaved: null,
      schedule: schedule
    };
  }

  /** Future value if the borrowing cost were invested monthly at opportunityRate. */
  function opportunityCost(totalCost, months, opportunityRatePercent, currency) {
    if (!Number.isFinite(totalCost) || totalCost <= 0 || months < 1) {
      return {
        ratePercent: opportunityRatePercent,
        monthlyContribution: 0,
        futureValue: 0,
        note: 'No borrowing cost to compound.'
      };
    }
    var pmt = totalCost / months;
    var r = opportunityRatePercent / 12 / 100;
    var fv;
    if (Math.abs(r) < 1e-15) {
      fv = totalCost;
    } else {
      fv = pmt * (Math.pow(1 + r, months) - 1) / r;
    }
    return {
      ratePercent: opportunityRatePercent,
      monthlyContribution: C.roundMoney(pmt, currency),
      futureValue: C.roundMoney(fv, currency),
      note: 'If the same borrowing cost were invested monthly at '
        + opportunityRatePercent + '% p.a. over the tenure.'
    };
  }

  function monthsFromTenure(value, unit) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (unit === 'years') return Math.round(n * 12);
    return Math.round(n);
  }

  function enrichWithExtraSavings(result) {
    if (!result || !result.ok || !result.withExtra) return result;
    var interestSaved = C.roundMoney(
      Math.max(0, result.totalInterest - result.withExtra.totalInterest - (result.withExtra.prepaymentPenalty || 0)),
      result.currency
    );
    // Upfront fees (deducted/separate) are paid either way — exclude from early-payoff savings.
    // Added fees sit inside financed principal and are already in both repayment totals.
    var feeAdjust = 0;
    if (result.fees && result.fees.treatment !== 'added') {
      feeAdjust = result.upfrontFees || 0;
    }
    var totalSaved = C.roundMoney(
      Math.max(0, result.totalPayable - feeAdjust - result.withExtra.totalPayable),
      result.currency
    );
    result.withExtra.interestSaved = interestSaved;
    result.withExtra.totalSaved = totalSaved;
    result.withExtra.netSaving = totalSaved;
    return result;
  }

  function calculate(input) {
    return enrichWithExtraSavings(calculateLoan(input));
  }

  global.SYLoanMath = {
    calculate: calculate,
    monthsFromTenure: monthsFromTenure,
    _calcReducing: calcReducing,
    _calcFlat: calcFlat,
    _computeAPR: computeAPR,
    _estimateMonthlyCashFlowRate: estimateMonthlyCashFlowRate,
    _debtRatio: debtRatio,
    _cashFlowPressure: cashFlowPressure,
    _opportunityCost: opportunityCost,
    _lifeCost: lifeCost,
    _opportunityTimeline: opportunityTimeline,
    _affordability: affordability,
    _buildCostSignal: buildCostSignal
  };
})(typeof window !== 'undefined' ? window : globalThis);
