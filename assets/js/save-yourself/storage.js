/**
 * Save Yourself — localStorage persistence (v2).
 *
 * Persists only validated calculator inputs, UI prefs, checklist, and commitment.
 * Never stores derived calculations (EMI, schedule, APR, advice, etc.).
 *
 * Default input shape for consumers:
 * {
 *   currency: 'INR',
 *   principal: 100000,
 *   nominalAnnualRate: 12,
 *   tenureValue: 3,
 *   tenureUnit: 'years',
 *   interestType: 'reducing',
 *   processingFee: { mode: 'fixed', value: 1000, treatment: 'deducted' },
 *   otherCharges: 500,
 *   extraMonthlyPayment: 0,
 *   prepaymentPenaltyRate: 0,
 *   grossMonthlyIncome: null,
 *   existingMonthlyDebt: null,
 *   emergencyFundMonths: null, // or 'yes'|'partial'|'no'|'unknown'
 *   opportunityAnnualRate: 8,
 *   borrowingReason: null,
 *   lenderType: null
 * }
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'save-yourself:v2';
  var LEGACY_PREFS = 'sy_prefs_v1';
  var LEGACY_PLAN = 'sy_plan_v1';

  var DEFAULT_EXAMPLE = {
    currency: 'INR',
    principal: 100000,
    nominalAnnualRate: 12,
    tenureValue: 3,
    tenureUnit: 'years',
    interestType: 'reducing',
    processingFee: { mode: 'fixed', value: 1000, treatment: 'deducted' },
    otherCharges: 500,
    extraMonthlyPayment: 0,
    prepaymentPenaltyRate: 0,
    grossMonthlyIncome: null,
    existingMonthlyDebt: null,
    emergencyFundMonths: null,
    opportunityAnnualRate: 8,
    borrowingReason: null,
    lenderType: null
  };

  function storageAvailable() {
    try {
      var k = '__sy_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readRaw(key) {
    if (!storageAvailable()) return null;
    try {
      var raw = localStorage.getItem(key);
      if (raw == null || raw === '') return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeRaw(key, value) {
    if (!storageAvailable()) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeKey(key) {
    if (!storageAvailable()) return;
    try { localStorage.removeItem(key); } catch (e) { /* no-op */ }
  }

  function pickNumber(v, allowNull) {
    if (v == null) return allowNull ? null : undefined;
    var n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return allowNull ? null : undefined;
    return n;
  }

  function sanitizeProcessingFee(fee) {
    if (!fee || typeof fee !== 'object') return undefined;
    var mode = fee.mode === 'percent' ? 'percent' : 'fixed';
    var value = pickNumber(fee.value, false);
    if (value === undefined) return undefined;
    var treatment = fee.treatment === 'added' ? 'added' : 'deducted';
    return { mode: mode, value: value, treatment: treatment };
  }

  function sanitizeInput(input) {
    if (!input || typeof input !== 'object') return {};
    var out = {};
    if (typeof input.currency === 'string' && input.currency) out.currency = input.currency;
    var principal = pickNumber(input.principal, true);
    if (principal !== undefined) out.principal = principal;
    var rate = pickNumber(input.nominalAnnualRate, true);
    if (rate !== undefined) out.nominalAnnualRate = rate;
    var tenure = pickNumber(input.tenureValue, true);
    if (tenure !== undefined) out.tenureValue = tenure;
    if (input.tenureUnit === 'months' || input.tenureUnit === 'years') {
      out.tenureUnit = input.tenureUnit;
    }
    if (input.interestType === 'flat' || input.interestType === 'reducing') {
      out.interestType = input.interestType;
    }
    var fee = sanitizeProcessingFee(input.processingFee);
    if (fee) out.processingFee = fee;
    var other = pickNumber(input.otherCharges, true);
    if (other !== undefined) out.otherCharges = other;
    var extra = pickNumber(input.extraMonthlyPayment, true);
    if (extra !== undefined) out.extraMonthlyPayment = extra;
    var penalty = pickNumber(input.prepaymentPenaltyRate, true);
    if (penalty !== undefined) out.prepaymentPenaltyRate = penalty;
    var income = pickNumber(input.grossMonthlyIncome, true);
    if (income !== undefined) out.grossMonthlyIncome = income;
    var debt = pickNumber(input.existingMonthlyDebt, true);
    if (debt !== undefined) out.existingMonthlyDebt = debt;
    if (
      input.emergencyFundMonths == null ||
      typeof input.emergencyFundMonths === 'number' ||
      input.emergencyFundMonths === 'yes' ||
      input.emergencyFundMonths === 'partial' ||
      input.emergencyFundMonths === 'no' ||
      input.emergencyFundMonths === 'unknown'
    ) {
      if ('emergencyFundMonths' in input) out.emergencyFundMonths = input.emergencyFundMonths;
    }
    var opp = pickNumber(input.opportunityAnnualRate, true);
    if (opp !== undefined) out.opportunityAnnualRate = opp;
    if (input.borrowingReason == null || typeof input.borrowingReason === 'string') {
      if ('borrowingReason' in input) out.borrowingReason = input.borrowingReason;
    }
    if (input.lenderType == null || typeof input.lenderType === 'string') {
      if ('lenderType' in input) out.lenderType = input.lenderType;
    }
    return out;
  }

  function sanitizeUi(ui) {
    if (!ui || typeof ui !== 'object') return {};
    var out = {};
    if (typeof ui.locale === 'string') out.locale = ui.locale;
    if (typeof ui.theme === 'string') out.theme = ui.theme;
    if (typeof ui.compact === 'boolean') out.compact = ui.compact;
    if (typeof ui.grouping === 'string') out.grouping = ui.grouping;
    if (typeof ui.selectedMonth === 'number' && Number.isFinite(ui.selectedMonth)) {
      out.selectedMonth = ui.selectedMonth;
    }
    // Pass through plain string/boolean/number prefs only (no nested calc dumps).
    Object.keys(ui).forEach(function (k) {
      if (k in out) return;
      var v = ui[k];
      var t = typeof v;
      if (t === 'string' || t === 'boolean' || (t === 'number' && Number.isFinite(v)) || v === null) {
        out[k] = v;
      }
    });
    return out;
  }

  function sanitizePlainObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var t = typeof v;
      if (t === 'string' || t === 'boolean' || (t === 'number' && Number.isFinite(v)) || v === null) {
        out[k] = v;
      } else if (t === 'object' && !Array.isArray(v)) {
        // One level of nesting for checklist / commitment groups.
        var nested = {};
        Object.keys(v).forEach(function (nk) {
          var nv = v[nk];
          var nt = typeof nv;
          if (nt === 'string' || nt === 'boolean' || (nt === 'number' && Number.isFinite(nv)) || nv === null) {
            nested[nk] = nv;
          }
        });
        out[k] = nested;
      }
    });
    return out;
  }

  function normalizeState(state) {
    if (!state || typeof state !== 'object') return null;
    return {
      input: sanitizeInput(state.input),
      ui: sanitizeUi(state.ui),
      checklist: sanitizePlainObject(state.checklist),
      commitment: sanitizePlainObject(state.commitment)
    };
  }

  function clearLegacy() {
    removeKey(LEGACY_PREFS);
    removeKey(LEGACY_PLAN);
  }

  /**
   * If v2 is missing, map what we can from sy_prefs_v1 / sy_plan_v1,
   * write v2, then remove legacy keys.
   */
  function migrate() {
    if (!storageAvailable()) return null;
    var existing = readRaw(STORAGE_KEY);
    if (existing) return normalizeState(existing);

    var prefs = readRaw(LEGACY_PREFS);
    var plan = readRaw(LEGACY_PLAN);
    if (!prefs && !plan) return null;

    var migrated = {
      input: {},
      ui: {},
      checklist: {},
      commitment: {}
    };

    if (prefs) {
      if (typeof prefs.currency === 'string') migrated.input.currency = prefs.currency;
      if (typeof prefs.locale === 'string') migrated.ui.locale = prefs.locale;
    }

    if (plan) {
      if (plan.escape && typeof plan.escape === 'object') {
        migrated.checklist.escape = sanitizePlainObject(plan.escape);
      }
      if (plan.filter && typeof plan.filter === 'object') {
        migrated.checklist.filter = sanitizePlainObject(plan.filter);
      }
      if (plan.commit && typeof plan.commit === 'object') {
        migrated.commitment = sanitizePlainObject(plan.commit);
      }
    }

    var normalized = normalizeState(migrated);
    if (writeRaw(STORAGE_KEY, normalized)) {
      clearLegacy();
    }
    return normalized;
  }

  function load() {
    if (!storageAvailable()) return null;
    var data = readRaw(STORAGE_KEY);
    if (data) return normalizeState(data);
    return migrate();
  }

  function save(state) {
    if (!storageAvailable()) return;
    var normalized = normalizeState(state);
    if (!normalized) return;
    writeRaw(STORAGE_KEY, normalized);
  }

  function clear() {
    removeKey(STORAGE_KEY);
    clearLegacy();
  }

  global.SYStorage = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_EXAMPLE: DEFAULT_EXAMPLE,
    load: load,
    save: save,
    clear: clear,
    migrate: migrate
  };
})(typeof window !== 'undefined' ? window : globalThis);
