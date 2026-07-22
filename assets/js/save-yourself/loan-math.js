/**
 * Pure loan math — reducing-balance EMI and flat-rate.
 * No external finance libraries. Integer minor-units where possible.
 */
(function (global) {
  'use strict';

  var C = global.SYCurrency;

  function assertFinitePositive(n, label) {
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(label + ' must be a positive finite number');
    }
  }

  /**
   * @param {object} input
   * @param {number} input.principal — major units
   * @param {number} input.annualRatePercent — e.g. 18 for 18%
   * @param {number} input.months — tenure in months (>= 1)
   * @param {'reducing'|'flat'} input.interestType
   * @param {string} [input.currency]
   * @param {number} [input.extraMonthly] — optional extra payment toward principal
   * @param {number} [input.opportunityRatePercent] — default 10
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

    var withExtra = null;
    if (extra > 0 && type === 'reducing') {
      withExtra = simulateExtraPayments(principal, annualRate, months, extra, currency, base.emi);
    } else if (extra > 0 && type === 'flat') {
      // Flat rate: extra simply shortens payoff of the fixed total
      withExtra = simulateFlatExtra(base, extra, currency);
    }

    var opportunity = opportunityCost(base.totalInterest, months, oppRate, currency);

    var warnings = [];
    if (annualRate >= 36) {
      warnings.push({
        code: 'predatory_rate',
        message: 'Rates at or above 36% p.a. are often considered predatory. Confirm every fee and look for cheaper alternatives before proceeding.'
      });
    } else if (annualRate >= 24) {
      warnings.push({
        code: 'high_rate',
        message: 'This rate is high. Credit cards, payday lenders, and some NBFCs price in this range — shop around or negotiate.'
      });
    }
    if (months >= 360) {
      warnings.push({
        code: 'long_tenure',
        message: 'A tenure of 30+ years means interest will likely dominate the total cost. Consider a shorter term if cash flow allows.'
      });
    }
    if (annualRate === 0) {
      warnings.push({
        code: 'zero_rate',
        message: 'Zero interest assumed. Confirm there are no processing fees or hidden charges.'
      });
    }

    return {
      ok: true,
      interestType: type,
      currency: currency,
      principal: C.roundMoney(principal, currency),
      annualRatePercent: annualRate,
      months: months,
      emi: base.emi,
      totalPayable: base.totalPayable,
      totalInterest: base.totalInterest,
      effectiveMonthly: base.emi,
      costPerDay: C.roundMoney(base.totalPayable / (months * 30.4375), currency),
      opportunity: opportunity,
      amortization: base.schedule || null,
      withExtra: withExtra,
      warnings: warnings,
      formulaNote: type === 'reducing'
        ? 'Reducing-balance EMI: P × r(1+r)^n / ((1+r)^n − 1), where r is the monthly rate.'
        : 'Flat rate: interest = P × annual rate × years; EMI = (P + interest) / n.'
    };
  }

  function calcReducing(principal, annualRatePercent, months, currency) {
    if (annualRatePercent === 0 || Math.abs(annualRatePercent) < 1e-12) {
      var emi0 = C.roundMoney(principal / months, currency);
      // Adjust last payment drift via schedule
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
    // Rebuild schedule with equal EMIs; last payment absorbs rounding
    var schedule = [];
    var paid = 0;
    var principalLeft = principal;
    var interestLeft = interest;
    for (var i = 1; i <= months; i++) {
      var payment = i === months
        ? C.roundMoney(totalPayable - paid, currency)
        : emi;
      var interestPart = i === months
        ? C.roundMoney(interestLeft, currency)
        : C.roundMoney(interest / months, currency);
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

  function simulateExtraPayments(principal, annualRatePercent, maxMonths, extra, currency, baseEmi) {
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

    return {
      months: month,
      monthsSaved: Math.max(0, maxMonths - month),
      emi: payment,
      totalPayable: totalPaid,
      totalInterest: totalInterest,
      interestSaved: null, // filled by caller context
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
    // Interest saved proportional to time saved is approximate for flat; report total paid difference
    return {
      months: month,
      monthsSaved: Math.max(0, base.schedule.length - month),
      emi: payment,
      totalPayable: C.roundMoney(totalPaid, currency),
      totalInterest: C.roundMoney(Math.max(0, totalPaid - (base.totalPayable - base.totalInterest)), currency),
      schedule: schedule
    };
  }

  /** Future value if the interest paid were invested monthly at opportunityRate. */
  function opportunityCost(totalInterest, months, opportunityRatePercent, currency) {
    if (!Number.isFinite(totalInterest) || totalInterest <= 0 || months < 1) {
      return {
        ratePercent: opportunityRatePercent,
        monthlyContribution: 0,
        futureValue: 0,
        note: 'No interest cost to compound.'
      };
    }
    var pmt = totalInterest / months;
    var r = opportunityRatePercent / 12 / 100;
    var fv;
    if (Math.abs(r) < 1e-15) {
      fv = totalInterest;
    } else {
      fv = pmt * (Math.pow(1 + r, months) - 1) / r;
    }
    return {
      ratePercent: opportunityRatePercent,
      monthlyContribution: C.roundMoney(pmt, currency),
      futureValue: C.roundMoney(fv, currency),
      note: 'If the interest you pay were instead invested monthly at '
        + opportunityRatePercent + '% p.a. over the same tenure.'
    };
  }

  /** Tenure helpers */
  function monthsFromTenure(value, unit) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (unit === 'years') return Math.round(n * 12);
    return Math.round(n);
  }

  function enrichWithExtraSavings(result) {
    if (!result || !result.ok || !result.withExtra) return result;
    result.withExtra.interestSaved = C.roundMoney(
      Math.max(0, result.totalInterest - result.withExtra.totalInterest),
      result.currency
    );
    result.withExtra.totalSaved = C.roundMoney(
      Math.max(0, result.totalPayable - result.withExtra.totalPayable),
      result.currency
    );
    return result;
  }

  // Wrap calculate to always enrich extra savings
  function calculate(input) {
    return enrichWithExtraSavings(calculateLoan(input));
  }

  global.SYLoanMath = {
    calculate: calculate,
    monthsFromTenure: monthsFromTenure,
    // exposed for tests
    _calcReducing: calcReducing,
    _calcFlat: calcFlat,
    _opportunityCost: opportunityCost
  };
})(typeof window !== 'undefined' ? window : globalThis);
