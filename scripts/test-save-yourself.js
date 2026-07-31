/**
 * Node-side smoke tests for Save Yourself loan math & currency parsing.
 * Run: node scripts/test-save-yourself.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function load(file) {
  var code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  var sandbox = { window: {}, console: console, Intl: Intl, Math: Math, Number: Number, Object: Object, Array: Array, String: String, Date: Date };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox;
}

var cur = load('assets/js/save-yourself/currency.js');
var math = load('assets/js/save-yourself/loan-math.js');
// loan-math expects SYCurrency on global
math.SYCurrency = cur.SYCurrency;
// reload loan-math with currency present
var sandbox = { window: {}, console: console, Intl: Intl, Math: Math, Number: Number, Object: Object, Array: Array, String: String, Date: Date };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.SYCurrency = cur.SYCurrency;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/save-yourself/currency.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/save-yourself/loan-math.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/save-yourself/advice-rules.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/save-yourself/decision.js'), 'utf8'), sandbox);

var C = sandbox.SYCurrency;
var L = sandbox.SYLoanMath;
var A = sandbox.SYAdvice;
var D = sandbox.SYDecision;

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}
function approx(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', expected ~' + b + ')');
}

// Exact reducing-balance: P=100000, 18% p.a., 24 months
// EMI = P*r*(1+r)^n/((1+r)^n-1) → 4992.41 (brief's ~4988 was illustrative)
var r = L.calculate({
  principal: 100000,
  annualRatePercent: 18,
  months: 24,
  interestType: 'reducing',
  currency: 'INR'
});
assert(r.ok, 'sample reducing calc ok');
approx(r.emi, 4992.41, 0.02, 'EMI exact to paisa');
approx(r.totalInterest, 19817.83, 1.0, 'interest from schedule');
approx(r.totalPayable, 119817.83, 1.0, 'total from schedule');
// Cross-check: rounded EMI × n is the common bank-summary presentation
approx(r.emi * 24, 119817.84, 0.05, 'EMI × n presentation');

// Zero interest
var z = L.calculate({
  principal: 12000,
  annualRatePercent: 0,
  months: 12,
  interestType: 'reducing',
  currency: 'USD'
});
assert(z.ok && z.totalInterest === 0, 'zero interest → no interest');
approx(z.emi, 1000, 0.01, 'zero interest EMI = P/n');
approx(z.totalPayable, 12000, 0.01, 'zero interest total = principal');

// Flat rate: P=100000, 10%, 12 months → interest = 10000, EMI ≈ 9166.67
var f = L.calculate({
  principal: 100000,
  annualRatePercent: 10,
  months: 12,
  interestType: 'flat',
  currency: 'INR'
});
assert(f.ok, 'flat calc ok');
approx(f.totalInterest, 10000, 0.5, 'flat interest = P*rate*years');
approx(f.totalPayable, 110000, 0.5, 'flat total');

// Edge: 1 month
var one = L.calculate({
  principal: 5000,
  annualRatePercent: 12,
  months: 1,
  interestType: 'reducing',
  currency: 'USD'
});
assert(one.ok, '1-month calc ok');
approx(one.totalInterest, 50, 0.5, '1-month interest ≈ P*r');

// Negative / zero amount blocked
var bad = L.calculate({
  principal: 0,
  annualRatePercent: 10,
  months: 12,
  interestType: 'reducing',
  currency: 'USD'
});
assert(!bad.ok && bad.error === 'amount', 'zero principal blocked');

// High rate warning
var high = L.calculate({
  principal: 10000,
  annualRatePercent: 40,
  months: 12,
  interestType: 'reducing',
  currency: 'USD'
});
assert(high.ok && high.warnings.some(function (w) { return w.code === 'predatory_rate'; }), 'predatory warning');

// Extra payment shortens tenure
var extra = L.calculate({
  principal: 100000,
  annualRatePercent: 18,
  months: 24,
  interestType: 'reducing',
  currency: 'INR',
  extraMonthly: 2000
});
assert(extra.ok && extra.withExtra && extra.withExtra.months < 24, 'extra payment reduces months');
assert(extra.withExtra.interestSaved > 0, 'extra payment saves interest');

// Currency parsing
assert(C.parseAmount('1,00,000').ok === false || C.parseAmount('100000').value === 100000, 'plain amount');
assert(C.parseAmount('100000').value === 100000, 'parse 100000');
assert(C.parseAmount('1,234.56').value === 1234.56, 'parse US format');
assert(C.parseAmount('1.234,56').value === 1234.56, 'parse EU format');
assert(!C.parseAmount('1e5').ok, 'reject scientific');
assert(!C.parseAmount('abc').ok, 'reject letters');
assert(C.fractionDigits('JPY') === 0, 'JPY 0 decimals');
assert(C.fractionDigits('KWD') === 3, 'KWD 3 decimals');
assert(C.fractionDigits('INR') === 2, 'INR 2 decimals');

// --- Fees, EIR/APR ---
var withFees = L.calculate({
  principal: 100000,
  annualRatePercent: 12,
  months: 24,
  interestType: 'reducing',
  currency: 'INR',
  fees: { processing: 2, processingIsPercent: true, other: 500 }
});
assert(withFees.ok, 'fees calc ok');
approx(withFees.fees.total, 2500, 0.5, 'processing 2% + 500 = 2500 fees');
approx(withFees.costOfBorrowing, withFees.totalInterest + 2500, 0.5, 'cost of borrowing = interest + fees');
assert(withFees.aprPercent > 12, 'APR with fees exceeds nominal 12%');

// APR without fees ≈ nominal for reducing balance
var noFee = L.calculate({ principal: 100000, annualRatePercent: 12, months: 24, interestType: 'reducing', currency: 'INR' });
approx(noFee.aprPercent, 12, 0.1, 'APR ≈ nominal when no fees (reducing)');

// Flat-rate EIR is materially higher than the flat nominal
var flatEir = L.calculate({ principal: 100000, annualRatePercent: 10, months: 12, interestType: 'flat', currency: 'INR' });
assert(flatEir.aprPercent > 16, 'flat 10% has much higher EIR (~18%)');

// --- Debt-to-income ---
var dti = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 20000, existingMonthlyRepayments: 6000
});
assert(dti.dti && dti.dti.percent > 50, 'DTI computed and high');
assert(dti.dti.band === 'high', 'DTI band high');
var dtiOk = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 60, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 100000, existingMonthlyRepayments: 0
});
assert(dtiOk.dti.band === 'moderate', 'low DTI band moderate');

// --- Comparisons ---
var comp = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  withComparisons: true
});
assert(comp.comparisons && comp.comparisons.length >= 1, 'comparisons present');
assert(comp.comparisons.some(function (c) { return c.id === 'better_rate' && c.interestSaved > 0; }), 'better rate saves interest');
assert(comp.comparisons.some(function (c) { return c.id === 'shorter_tenure' && c.interestSaved > 0; }), 'shorter tenure saves interest');

// --- Advice engine (new shape) ---
var advice = A.buildAdvice({
  reasonId: 'lifestyle',
  emergencyFund: 'no',
  lenderId: 'payday',
  loan: dti // high DTI loan
});
assert(advice.severity === 'critical', 'lifestyle + high DTI + payday → critical');
assert(advice.triggeredRules.some(function (x) { return x.id === 'dti_high'; }), 'dti_high rule fires from computed ratio');
assert(advice.topActions.length === 3, 'exactly three top actions');
assert(advice.steps.length >= 3, 'full action list present');
// No broken copy fragments
var joined = advice.steps.map(function (s) { return s.title + ' ' + s.detail; }).join(' ');
assert(joined.indexOf('of work-value of work-equivalent') === -1, 'no broken hours copy');

var emergency = A.buildAdvice({ reasonId: 'medical', loan: r });
assert(/Emergenc/i.test(emergency.headline), 'medical → emergency headline');
assert(emergency.honestQuestion.indexOf('live with that') === -1, 'medical question is not "can I live with that"');
assert(/smallest amount/i.test(emergency.honestQuestion), 'medical question is reason-specific');

// --- Life cost: money expressed as working time ---
var life = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 50000
});
assert(life.lifeCost, 'life cost computed when income is known');
// 50000/month ÷ 173.33 hours ≈ 288.46/hour; total payable ≈ 119817.83
approx(life.lifeCost.hourlyIncome, 288.46, 0.5, 'hourly income from a 40-hour week');
approx(life.lifeCost.hoursTotal, 415.4, 1.0, 'hours of work to repay the whole loan');
approx(life.lifeCost.weeksTotal, 10.4, 0.1, 'weeks of full-time work');
assert(life.lifeCost.hoursCost < life.lifeCost.hoursTotal, 'borrowing cost is a subset of total hours');
var noIncome = L.calculate({ principal: 1000, annualRatePercent: 10, months: 12, interestType: 'reducing', currency: 'USD' });
assert(noIncome.lifeCost === null, 'no life cost without income');

// --- Opportunity timeline ---
var timeline = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  opportunityRatePercent: 12
});
assert(timeline.opportunityTimeline.length === 3, 'timeline covers 12, 24, and 36 months');
assert(timeline.opportunityTimeline[0].months === 12
  && timeline.opportunityTimeline[1].months === 24
  && timeline.opportunityTimeline[2].months === 36, 'timeline horizons are 12/24/36');
approx(timeline.opportunityTimeline[0].saved, timeline.emi * 12, 0.5, '1-year set-aside = 12 payments');
assert(timeline.opportunityTimeline[0].invested > timeline.opportunityTimeline[0].saved, 'investing beats cash at 12%');
assert(timeline.opportunityTimeline[2].gain > timeline.opportunityTimeline[0].gain, 'compounding grows with time');
var zeroOpp = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  opportunityRatePercent: 0
});
approx(zeroOpp.opportunityTimeline[1].invested, zeroOpp.opportunityTimeline[1].saved, 0.5, '0% return matches cash');

// --- Affordability verdict ---
var danger = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 20000, existingMonthlyRepayments: 6000, emergencyFund: 'no'
});
assert(danger.affordability.level === 'danger', 'high DTI → danger verdict');
assert(danger.affordability.emergencyBuffer === 'fail', 'missing emergency fund fails the buffer check');
assert(danger.affordability.reasons.length > 1, 'verdict explains itself');

var safe = L.calculate({
  principal: 100000, annualRatePercent: 9, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 200000, existingMonthlyRepayments: 0, emergencyFund: 'yes'
});
assert(safe.affordability.level === 'safe', 'comfortable numbers → safe verdict');
approx(safe.affordability.margin, 200000 - safe.emi, 1.0, 'margin = income − all loan payments');

var caution = L.calculate({
  principal: 100000, annualRatePercent: 28, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 200000, emergencyFund: 'yes'
});
assert(caution.affordability.level === 'caution', 'expensive rate alone → caution');

var unknown = L.calculate({ principal: 100000, annualRatePercent: 9, months: 24, interestType: 'reducing', currency: 'INR' });
assert(unknown.affordability.level === 'unknown', 'no income and no fund answer → no verdict');

// --- Reason risk metadata ---
assert(A.REASONS.every(function (x) { return x.risk && x.guidance; }), 'every reason has a risk level and guidance');
var lifestyleAdvice = A.buildAdvice({ reasonId: 'lifestyle', loan: safe });
assert(lifestyleAdvice.severity === 'critical', 'extreme-risk reason forces highest caution');
assert(/RISK/i.test(lifestyleAdvice.riskLabel), 'risk label exposed to the UI');
var educationAdvice = A.buildAdvice({ reasonId: 'education', loan: safe });
assert(educationAdvice.severity === 'moderate', 'low-risk reason with clean numbers stays moderate');
assert(A.LENDERS.some(function (l) { return l.id === 'credit_union'; }), 'credit union is an option');
assert(A.LENDERS.some(function (l) { return l.id === 'employer'; }), 'employer lending is an option');
var employerAdvice = A.buildAdvice({ reasonId: 'medical', lenderId: 'employer', loan: safe });
assert(employerAdvice.steps.some(function (s) { return /if you leave/i.test(s.title); }), 'employer loan warns about leaving the job');

// --- Final filter (primary + optional + red flags) ---
assert(Array.isArray(D.PRIMARY_CHECKS) && D.PRIMARY_CHECKS.length === 4, 'four primary checks');
assert(Array.isArray(D.OPTIONAL_CHECKS) && D.OPTIONAL_CHECKS.length >= 4, 'optional deeper checks present');
assert(Array.isArray(D.FILTER_QUESTIONS) && D.FILTER_QUESTIONS.length === D.PRIMARY_CHECKS.length + D.OPTIONAL_CHECKS.length,
  'FILTER_QUESTIONS alias covers primary + optional');
assert(D.RED_FLAGS.every(function (f) { return f && typeof f.id === 'string' && typeof f.label === 'string'; }),
  'RED_FLAGS are {id,label} objects');

var allNo = D.evaluateFilter({
  tier1Total: 6, tier1Checked: 1, reasonBucket: 'lifestyle',
  stressRatio: 0.9, aprPercent: 40, payoffMonths: 36, hasResult: true, feesEntered: true,
  marginLabel: 'negative'
}, {});
assert(allNo.no >= 3, 'a bad loan trips at least three no answers');
assert(allNo.level === 'danger' && allNo.state === 'stop', 'failed checks → danger/stop');
assert(/do not borrow|unresolved|pause before signing/i.test(allNo.verdict),
  'stop verdict tells the borrower to wait');

var allYes = D.evaluateFilter({
  tier1Total: 6, tier1Checked: 5, reasonBucket: 'emergency',
  stressRatio: 0.2, aprPercent: 11, payoffMonths: 12, commitmentSigned: true,
  hasResult: true, feesEntered: true, marginLabel: 'comfortable', comparedAlternative: true
}, { strategy: 'yes' });
assert(allYes.no === 0 && allYes.unanswered === 0, 'a clean loan answers every question yes');
assert(allYes.level === 'safe' && allYes.state === 'ready', 'clean loan → ready');
assert(/complete|compare|written disclosure/i.test(allYes.verdict), 'ready verdict points at written disclosure');

var overridden = D.evaluateFilter({
  tier1Total: 6, tier1Checked: 5, reasonBucket: 'emergency',
  stressRatio: 0.2, aprPercent: 11, payoffMonths: 12, commitmentSigned: true,
  hasResult: true, feesEntered: true, marginLabel: 'comfortable', comparedAlternative: true
}, { rate: 'no' });
assert(overridden.rows.filter(function (r) { return r.id === 'rate'; })[0].source === 'manual',
  'a manual answer overrides the derived one');
assert(overridden.no === 1, 'override is counted');

var flagged = D.evaluateFilter(
  { hasResult: true, feesEntered: true, marginLabel: 'comfortable', comparedAlternative: true },
  {},
  { pressure: true }
);
assert(flagged.state === 'stop' && flagged.level === 'danger', 'selected red flag → stop');
assert(/red flag/i.test(flagged.verdict), 'stop verdict names red flags');
assert(flagged.redFlags.length === 1 && flagged.redFlags[0].id === 'pressure', 'red flag objects returned');

var empty = D.evaluateFilter({}, {});
assert(empty.unanswered === D.FILTER_QUESTIONS.length, 'nothing is assumed without inputs');
assert(empty.state === 'pause', 'no inputs → pause until primary checks resolve');
assert(/unresolved|complete the checks/i.test(empty.verdict), 'pause verdict asks for unresolved checks');
assert(D.ESCAPE_TIERS[0].items.length >= 5 && D.RED_FLAGS.length >= 5, 'escape routes and red flags present');
// ============================================================================
// Financial X-Ray redesign cases
// ============================================================================

// 1. Zero-rate reducing
var xrZero = L.calculate({
  principal: 24000, annualRatePercent: 0, months: 24, interestType: 'reducing', currency: 'USD'
});
assert(xrZero.ok && xrZero.totalInterestPaid === 0, 'X-Ray: zero-rate reducing');
approx(xrZero.scheduledPayment, 1000, 0.01, 'X-Ray: zero-rate EMI = P/n');
assert(xrZero.estimatedNominalAnnualCost === 0, 'X-Ray: zero-rate nominal annual cost is 0');

// 2. Standard reducing (covered above) — alias fields
assert(r.grossPrincipal === r.principal && r.financedPrincipal === r.principal, 'X-Ray: gross/financed = principal when no fees');
assert(r.scheduledPayment === r.emi && r.totalPaid === r.totalPayable, 'X-Ray: scheduledPayment/totalPaid aliases');
assert(r.borrowingCost === r.costOfBorrowing && r.totalInterestPaid === r.totalInterest, 'X-Ray: borrowingCost/interest aliases');

// 3. Flat-rate (covered above)
assert(f.interestType === 'flat', 'X-Ray: flat-rate path');

// 4. Fixed upfront fee deducted
var fixedFee = L.calculate({
  principal: 100000, annualRatePercent: 12, months: 24, interestType: 'reducing', currency: 'INR',
  fees: { processing: 1500, treatment: 'deducted' }
});
assert(fixedFee.ok, 'X-Ray: fixed fee deducted ok');
approx(fixedFee.upfrontFees, 1500, 0.01, 'X-Ray: fixed upfront fee');
approx(fixedFee.netProceeds, 98500, 0.01, 'X-Ray: deducted net = principal − fees');
assert(fixedFee.financedPrincipal === 100000, 'X-Ray: deducted financed = principal');
assert(fixedFee.fees.treatment === 'deducted', 'X-Ray: treatment deducted');

// 5. Percentage fee
var pctFee = L.calculate({
  principal: 100000, annualRatePercent: 12, months: 24, interestType: 'reducing', currency: 'INR',
  fees: { processing: 2, processingIsPercent: true }
});
approx(pctFee.fees.processing, 2000, 0.01, 'X-Ray: percentage fee = 2% of principal');
approx(pctFee.upfrontFees, 2000, 0.01, 'X-Ray: percentage fee total');

// 6. Fee deducted from payout
assert(fixedFee.netDisbursed === fixedFee.netProceeds, 'X-Ray: netDisbursed aliases netProceeds');
assert(fixedFee.aprPercent > 12, 'X-Ray: deducted fees raise APR above nominal');

// 7. Fee added to loan
var addedFee = L.calculate({
  principal: 100000, annualRatePercent: 12, months: 24, interestType: 'reducing', currency: 'INR',
  fees: { processing: 1500, treatment: 'added' }
});
assert(addedFee.financedPrincipal > addedFee.principal, 'X-Ray: added financedPrincipal > principal');
approx(addedFee.financedPrincipal, 101500, 0.01, 'X-Ray: financed = principal + fees');
approx(addedFee.netProceeds, 100000, 0.01, 'X-Ray: added netProceeds = principal');
assert(addedFee.emi > fixedFee.emi, 'X-Ray: added treatment raises EMI vs deducted');

// 8. Zero-interest with fees
var zeroFees = L.calculate({
  principal: 10000, annualRatePercent: 0, months: 10, interestType: 'reducing', currency: 'USD',
  fees: { processing: 200, treatment: 'deducted' }
});
assert(zeroFees.ok && zeroFees.totalInterest === 0, 'X-Ray: zero-interest with fees');
approx(zeroFees.netProceeds, 9800, 0.01, 'X-Ray: zero-interest net after fees');
assert(zeroFees.estimatedNominalAnnualCost > 0, 'X-Ray: zero coupon still has positive cash-flow cost from fees');
assert(zeroFees.borrowingCost === 200, 'X-Ray: borrowing cost = fees only when rate is 0');

// 9. One-month loan (covered) — aliases present
assert(one.months === 1 && one.schedule.length === 1, 'X-Ray: one-month schedule');

// 10. Final payment rounding
var roundLoan = L.calculate({
  principal: 10000, annualRatePercent: 11.5, months: 17, interestType: 'reducing', currency: 'USD'
});
assert(roundLoan.ok && roundLoan.schedule.length >= 1, 'X-Ray: rounding schedule ok');
var last = roundLoan.schedule[roundLoan.schedule.length - 1];
approx(last.balance, 0, 0.01, 'X-Ray: final balance cleared');
var schedPrincipal = roundLoan.schedule.reduce(function (s, row) { return s + row.principal; }, 0);
approx(schedPrincipal, roundLoan.financedPrincipal, 0.05, 'X-Ray: schedule principal sums to financed');

// 11. IRR annual cost + effective annual > nominal when fees present
assert(fixedFee.monthlyCashFlowRate != null, 'X-Ray: monthly cash-flow rate present');
approx(fixedFee.estimatedNominalAnnualCost, fixedFee.aprPercent, 1e-9, 'X-Ray: aprPercent = nominal annual cost');
assert(fixedFee.estimatedEffectiveAnnualCost > fixedFee.estimatedNominalAnnualCost,
  'X-Ray: effective annual > nominal when fees present');
assert(fixedFee.estimatedNominalAnnualCost > 12, 'X-Ray: nominal annual cost exceeds coupon when fees present');

// 12. Extra-payment payoff
assert(extra.withExtra.monthsSaved > 0, 'X-Ray: extra payment monthsSaved');
assert(extra.withExtra.netSaving === extra.withExtra.totalSaved, 'X-Ray: netSaving aliases totalSaved');
assert(extra.withExtra.netSaving > 0, 'X-Ray: extra payment netSaving');

// 13. Prepayment penalty path
var withPenalty = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  extraMonthly: 3000,
  fees: { prepaymentPenaltyPercent: 2 }
});
assert(withPenalty.withExtra && withPenalty.withExtra.prepaymentPenalty > 0, 'X-Ray: prepayment penalty applied');
assert(withPenalty.withExtra.totalPayable >= withPenalty.withExtra.totalInterest, 'X-Ray: penalty included in totalPayable');

// 14. Opportunity at zero return (covered above)
approx(zeroOpp.opportunityTimeline[0].invested, zeroOpp.opportunityTimeline[0].saved, 0.5, 'X-Ray: zero-return horizon 12 matches cash');
approx(zeroOpp.opportunityTimeline[2].invested, zeroOpp.opportunityTimeline[2].saved, 0.5, 'X-Ray: zero-return horizon 36 matches cash');

// 15. Malformed input
var badRate = L.calculate({ principal: 1000, annualRatePercent: -1, months: 12, interestType: 'reducing', currency: 'USD' });
assert(!badRate.ok && badRate.error === 'rate', 'X-Ray: negative rate blocked');
var badTenure = L.calculate({ principal: 1000, annualRatePercent: 10, months: 0, interestType: 'reducing', currency: 'USD' });
assert(!badTenure.ok && badTenure.error === 'tenure', 'X-Ray: zero tenure blocked');
var badExtra = L.calculate({ principal: 1000, annualRatePercent: 10, months: 12, interestType: 'reducing', currency: 'USD', extraMonthly: -5 });
assert(!badExtra.ok && badExtra.error === 'extra', 'X-Ray: negative extra blocked');

// 16. Fee treatment separate reduces net for APR
var separateFee = L.calculate({
  principal: 100000, annualRatePercent: 12, months: 24, interestType: 'reducing', currency: 'INR',
  fees: { processing: 1500, treatment: 'separate' }
});
approx(separateFee.netProceeds, 98500, 0.01, 'X-Ray: separate net for APR = principal − fees');
assert(separateFee.financedPrincipal === 100000, 'X-Ray: separate financed = principal');
approx(separateFee.aprPercent, fixedFee.aprPercent, 0.05, 'X-Ray: separate APR matches deducted for same fees');
assert(separateFee.fees.treatment === 'separate', 'X-Ray: treatment separate');

// Fees consume full payout — still ok with warning, null rates
var eaten = L.calculate({
  principal: 1000, annualRatePercent: 12, months: 12, interestType: 'reducing', currency: 'USD',
  fees: { processing: 1000, treatment: 'deducted' }
});
assert(eaten.ok, 'X-Ray: fees-consume-payout still returns ok');
assert(eaten.netProceeds <= 0, 'X-Ray: netProceeds <= 0 when fees eat payout');
assert(eaten.aprPercent == null && eaten.estimatedNominalAnnualCost == null, 'X-Ray: rates null when no net proceeds');
assert(eaten.warnings.some(function (w) { return w.code === 'fees_consume_payout'; }), 'X-Ray: fees_consume_payout warning');

// 17. costPerHundred ≈ 121.57 for P=100000, 12%, 36 months, fees 1500
var cph = L.calculate({
  principal: 100000, annualRatePercent: 12, months: 36, interestType: 'reducing', currency: 'INR',
  fees: { processing: 1500 }
});
approx(cph.costPerHundred, 121.57, 1.0, 'X-Ray: costPerHundred ≈ 121.57');
assert(cph.costPerHundred > 100, 'X-Ray: costPerHundred above 100');

// 18. costSignal bands
assert(L._buildCostSignal(5).band === 'lower', 'X-Ray: costSignal lower (0–8)');
assert(L._buildCostSignal(8).band === 'lower', 'X-Ray: costSignal lower at 8');
assert(L._buildCostSignal(8.1).band === 'elevated', 'X-Ray: costSignal elevated (>8)');
assert(L._buildCostSignal(15).band === 'elevated', 'X-Ray: costSignal elevated at 15');
assert(L._buildCostSignal(15.1).band === 'expensive', 'X-Ray: costSignal expensive (>15)');
assert(L._buildCostSignal(25).band === 'expensive', 'X-Ray: costSignal expensive at 25');
assert(L._buildCostSignal(25.1).band === 'severe', 'X-Ray: costSignal severe (>25)');
assert(cph.costSignal && cph.costSignal.band && cph.costSignal.label && cph.costSignal.guidance,
  'X-Ray: costSignal object on result');
assert(typeof cph.costSignal.guidance === 'string' && cph.costSignal.guidance.length > 0,
  'X-Ray: costSignal guidance present');

// Richer comparisons include rate −1 and fees removed
var richComp = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  fees: { processing: 2000 },
  withComparisons: true
});
assert(richComp.comparisons.some(function (c) { return c.id === 'rate_minus_1'; }), 'X-Ray: comparison rate −1 ppt');
assert(richComp.comparisons.some(function (c) { return c.id === 'fees_removed' && c.totalSaved > 0; }),
  'X-Ray: comparison fees removed');

// Cash-flow pressure when income present
assert(safe.cashFlowPressure && safe.cashFlowPressure.marginLabel === 'comfortable',
  'X-Ray: cashFlowPressure comfortable');
var tightPressure = L.calculate({
  principal: 100000, annualRatePercent: 18, months: 24, interestType: 'reducing', currency: 'INR',
  grossMonthlyIncome: 10000, existingMonthlyRepayments: 6000, emergencyFund: 'no'
});
assert(tightPressure.cashFlowPressure && tightPressure.cashFlowPressure.marginLabel === 'negative',
  'X-Ray: cashFlowPressure negative when overstretched');
assert(noIncome.cashFlowPressure === null, 'X-Ray: no cashFlowPressure without income');

// Exports
assert(typeof L.calculate === 'function' && typeof L.monthsFromTenure === 'function', 'X-Ray: public exports');
assert(typeof L._estimateMonthlyCashFlowRate === 'function' && typeof L._computeAPR === 'function',
  'X-Ray: IRR helpers exported');
assert(L.monthsFromTenure(2, 'years') === 24, 'X-Ray: monthsFromTenure years');

if (failed) {
  console.error('\n' + failed + ' failure(s)');
  process.exit(1);
}
console.log('\nAll tests passed.');
