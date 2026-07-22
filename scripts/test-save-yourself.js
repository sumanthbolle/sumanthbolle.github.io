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

var C = sandbox.SYCurrency;
var L = sandbox.SYLoanMath;
var A = sandbox.SYAdvice;

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

// Advice engine deterministic
var advice = A.buildAdvice({
  reasonId: 'lifestyle',
  debtRatioHigh: 'yes',
  emergencyFund: 'no',
  lenderId: 'payday',
  loan: r
});
assert(advice.severity === 'critical', 'lifestyle + high burden → critical');
assert(advice.triggeredRules.some(function (x) { return x.id === 'high_debt_ratio'; }), 'debt ratio rule');
assert(advice.steps.length >= 4, 'actionable steps present');

var emergency = A.buildAdvice({ reasonId: 'medical', loan: r });
assert(/Emergency/i.test(emergency.headline), 'medical → emergency headline');

if (failed) {
  console.error('\n' + failed + ' failure(s)');
  process.exit(1);
}
console.log('\nAll tests passed.');
