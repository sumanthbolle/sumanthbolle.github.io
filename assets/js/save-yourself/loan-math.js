/**
 * Pure loan math — reducing-balance EMI and flat-rate.
 * No external finance libraries. Integer minor-units where possible.
 *
 * Adds: one-time fees, effective interest rate (EIR/APR) via IRR,
 * debt-to-income helper, and comparison scenarios (better rate / shorter tenure).
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
   * @param {number} [input.grossMonthlyIncome] — for debt-to-income
   * @param {number} [input.existingMonthlyRepayments] — for debt-to-income
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

    var base;
    try {
      if (type === 'flat') {
        base = calcFlat(principal, annualRate, months, currency);
      } else {
        base = calcReducing(principal, annualRate, months, currency);
      }
    } catch (e) {
      return { ok: false, error: 'calc', message: e.message || 'Could not calculate this loan.' };
    }

    var upfrontFees = fees.total;
    var costOfBorrowing = C.roundMoney(base.totalInterest + upfrontFees, currency);
    var netDisbursed = C.roundMoney(principal - upfrontFees, currency);

    // Effective interest rate (APR) via IRR on actual cashflows, net of upfront fees.
    var apr = computeAPR(netDisbursed, base.schedule);

    var withExtra = null;
    if (extra > 0 && type === 'reducing') {
      withExtra = simulateExtraPayments(
        principal, annualRate, months, extra, currency, base.emi, base.schedule, fees.prepaymentPenaltyPercent
      );
    } else if (extra > 0 && type === 'flat') {
      withExtra = simulateFlatExtra(base, extra, currency);
    }

    var opportunity = opportunityCost(base.totalInterest + upfrontFees, months, oppRate, currency);

    var warnings = [];
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
      ? buildComparisons(principal, annualRate, months, type, currency, base)
      : null;

    var dti = debtRatio(input.grossMonthlyIncome, input.existingMonthlyRepayments, base.emi, currency);

    return {
      ok: true,
      interestType: type,
      currency: currency,
      principal: C.roundMoney(principal, currency),
      annualRatePercent: annualRate,
      months: months,
      emi: base.emi,
      totalPayable: C.roundMoney(base.totalPayable + upfrontFees, currency),
      totalInterest: base.totalInterest,
      fees: {
        processing: fees.processing,
        other: fees.other,
        total: upfrontFees,
        prepaymentPenaltyPercent: fees.prepaymentPenaltyPercent
      },
      costOfBorrowing: costOfBorrowing,
      netDisbursed: netDisbursed,
      aprPercent: apr,
      effectiveMonthly: base.emi,
      costPerDay: C.roundMoney((base.totalPayable + upfrontFees) / (months * 30.4375), currency),
      opportunity: opportunity,
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
    var processing = fees.processingIsPercent
      ? C.roundMoney(principal * processingRaw / 100, currency)
      : C.roundMoney(processingRaw, currency);
    var other = C.roundMoney(Number(fees.other) || 0, currency);
    if (processing < 0) processing = 0;
    if (other < 0) other = 0;
    var penalty = Number(fees.prepaymentPenaltyPercent) || 0;
    if (penalty < 0) penalty = 0;
    return {
      processing: processing,
      other: other,
      total: C.roundMoney(processing + other, currency),
      prepaymentPenaltyPercent: penalty
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
   * APR / EIR via IRR on the loan's actual monthly cashflows.
   * At t=0 the borrower receives netAmount; each month they pay schedule[t].payment.
   * Solve for monthly i where PV(payments) = netAmount, annualize (i × 12).
   */
  function computeAPR(netAmount, schedule) {
    if (!(netAmount > 0) || !schedule || !schedule.length) return null;
    var pays = schedule.map(function (r) { return r.payment; });

    function npv(i) {
      var s = 0;
      for (var t = 0; t < pays.length; t++) {
        s += pays[t] / Math.pow(1 + i, t + 1);
      }
      return s - netAmount;
    }

    // npv is decreasing in i. npv(0) = sum(payments) - net >= 0 when there is any cost.
    if (npv(0) <= 1e-9) return 0;
    var lo = 0;
    var hi = 1; // 100%/month upper seed
    var guard = 0;
    while (npv(hi) > 0 && hi < 1000 && guard < 80) { hi *= 2; guard++; }
    for (var k = 0; k < 200; k++) {
      var mid = (lo + hi) / 2;
      var v = npv(mid);
      if (Math.abs(v) < 1e-8) { lo = mid; hi = mid; break; }
      if (v > 0) lo = mid; else hi = mid;
    }
    var monthly = (lo + hi) / 2;
    return monthly * 12 * 100;
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

  function buildComparisons(principal, annualRate, months, type, currency, base) {
    var out = [];
    var calc = type === 'flat' ? calcFlat : calcReducing;

    // Better rate: 3 percentage points lower (floored at 0), only if it changes anything.
    var betterRate = Math.max(0, annualRate - 3);
    if (betterRate < annualRate) {
      var br = calc(principal, betterRate, months, currency);
      out.push({
        id: 'better_rate',
        label: 'Rate ' + betterRate + '% (−3 pts)',
        annualRatePercent: betterRate,
        months: months,
        emi: br.emi,
        totalInterest: br.totalInterest,
        totalPayable: br.totalPayable,
        interestSaved: C.roundMoney(base.totalInterest - br.totalInterest, currency)
      });
    }

    // Shorter tenure: ~75% of the current term (min 1, and strictly shorter).
    var shorter = Math.max(1, Math.round(months * 0.75));
    if (shorter < months) {
      var st = calc(principal, annualRate, shorter, currency);
      out.push({
        id: 'shorter_tenure',
        label: shorter + ' months (−' + (months - shorter) + ')',
        annualRatePercent: annualRate,
        months: shorter,
        emi: st.emi,
        totalInterest: st.totalInterest,
        totalPayable: st.totalPayable,
        interestSaved: C.roundMoney(base.totalInterest - st.totalInterest, currency),
        emiDelta: C.roundMoney(st.emi - base.emi, currency)
      });
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
    result.withExtra.interestSaved = interestSaved;
    result.withExtra.totalSaved = C.roundMoney(
      Math.max(0, result.totalPayable - result.withExtra.totalPayable),
      result.currency
    );
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
    _debtRatio: debtRatio,
    _opportunityCost: opportunityCost
  };
})(typeof window !== 'undefined' ? window : globalThis);
