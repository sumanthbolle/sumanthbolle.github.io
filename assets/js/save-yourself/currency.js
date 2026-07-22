/**
 * Currency helpers — ISO 4217 via Intl.NumberFormat.
 * No hardcoded symbols or separators.
 */
(function (global) {
  'use strict';

  var POPULAR = [
    'INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'CHF',
    'HKD', 'NZD', 'CNY', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'ZAR', 'BRL',
    'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'ILS', 'SAR', 'QAR', 'KWD',
    'BHD', 'OMR', 'PKR', 'BDT', 'LKR', 'NPR', 'VND', 'TWD', 'CZK', 'HUF'
  ];

  var FALLBACK = POPULAR.concat([
    'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AWG', 'AZN', 'BAM', 'BBD',
    'BGN', 'BIF', 'BMD', 'BND', 'BOB', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
    'CDF', 'CLP', 'COP', 'CRC', 'CUP', 'CVE', 'DJF', 'DOP', 'DZD', 'EGP',
    'ERN', 'ETB', 'FJD', 'FKP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ',
    'GYD', 'HNL', 'HRK', 'HTG', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'KES',
    'KGS', 'KHR', 'KMF', 'KYD', 'KZT', 'LAK', 'LBP', 'LRD', 'LSL', 'LYD',
    'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR',
    'MWK', 'MZN', 'NAD', 'NGN', 'NIO', 'PAB', 'PEN', 'PGK', 'PYG', 'RON',
    'RSD', 'RUB', 'RWF', 'SBD', 'SCR', 'SDG', 'SHP', 'SLE', 'SOS', 'SRD',
    'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'TJS', 'TMT', 'TND', 'TOP', 'TTD',
    'TZS', 'UAH', 'UGX', 'UYU', 'UZS', 'VES', 'VUV', 'WST', 'XAF', 'XCD',
    'XOF', 'XPF', 'YER', 'ZMW', 'ZWL'
  ]);

  var fractionCache = Object.create(null);
  var displayCache = Object.create(null);
  var nameCache = Object.create(null);

  function detectLocale() {
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language;
      }
    } catch (e) { /* ignore */ }
    return 'en';
  }

  function detectDefaultCurrency(locale) {
    try {
      var region = String(locale || '').split('-')[1] || '';
      var map = {
        IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', AU: 'AUD', CA: 'CAD',
        SG: 'SGD', JP: 'JPY', CH: 'CHF', HK: 'HKD', NZ: 'NZD', CN: 'CNY',
        KR: 'KRW', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP', ZA: 'ZAR',
        BR: 'BRL', MX: 'MXN', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
        TR: 'TRY', IL: 'ILS', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD',
        OM: 'OMR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', VN: 'VND',
        TW: 'TWD', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
        IE: 'EUR', AT: 'EUR', BE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR'
      };
      if (map[region]) return map[region];
      var parts = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
        .formatToParts(1);
      // Prefer popular for region; fallback INR for unknown South Asia-ish, else USD
      return 'USD';
    } catch (e) {
      return 'USD';
    }
  }

  function listCurrencies() {
    var codes;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
        codes = Intl.supportedValuesOf('currency').slice();
      }
    } catch (e) {
      codes = null;
    }
    if (!codes || !codes.length) codes = FALLBACK.slice();

    var popularSet = Object.create(null);
    POPULAR.forEach(function (c) { popularSet[c] = true; });

    var popular = [];
    var rest = [];
    codes.forEach(function (code) {
      if (!/^[A-Z]{3}$/.test(code)) return;
      if (popularSet[code]) popular.push(code);
      else rest.push(code);
    });
    popular.sort(function (a, b) { return POPULAR.indexOf(a) - POPULAR.indexOf(b); });
    rest.sort();
    return popular.concat(rest.filter(function (c) { return popular.indexOf(c) === -1; }));
  }

  function fractionDigits(currency) {
    var code = String(currency || 'USD').toUpperCase();
    if (fractionCache[code] != null) return fractionCache[code];
    try {
      var opts = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code
      }).resolvedOptions();
      fractionCache[code] = typeof opts.maximumFractionDigits === 'number'
        ? opts.maximumFractionDigits
        : 2;
    } catch (e) {
      fractionCache[code] = 2;
    }
    return fractionCache[code];
  }

  function currencyName(currency, locale) {
    var code = String(currency || '').toUpperCase();
    var loc = locale || detectLocale();
    var key = loc + '|' + code;
    if (nameCache[key]) return nameCache[key];
    try {
      if (typeof Intl.DisplayNames === 'function') {
        var dn = new Intl.DisplayNames([loc], { type: 'currency' });
        nameCache[key] = dn.of(code) || code;
        return nameCache[key];
      }
    } catch (e) { /* fall through */ }
    nameCache[key] = code;
    return code;
  }

  function currencySymbol(currency, locale) {
    var code = String(currency || 'USD').toUpperCase();
    var loc = locale || detectLocale();
    var key = loc + '|' + code;
    if (displayCache[key]) return displayCache[key];
    try {
      var parts = new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol'
      }).formatToParts(0);
      var sym = '';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'currency') {
          sym = parts[i].value;
          break;
        }
      }
      displayCache[key] = sym || code;
    } catch (e) {
      displayCache[key] = code;
    }
    return displayCache[key];
  }

  function labelFor(currency, locale) {
    var code = String(currency || '').toUpperCase();
    var sym = currencySymbol(code, locale);
    var name = currencyName(code, locale);
    if (sym && sym !== code) return code + ' ' + sym + ' — ' + name;
    return code + ' — ' + name;
  }

  function formatMoney(amount, currency, locale, opts) {
    var code = String(currency || 'USD').toUpperCase();
    var loc = locale || detectLocale();
    var digits = fractionDigits(code);
    var options = {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    };
    if (opts && opts.compact) {
      options.notation = 'compact';
      options.maximumFractionDigits = Math.min(digits, 1);
    }
    try {
      return new Intl.NumberFormat(loc, options).format(Number(amount) || 0);
    } catch (e) {
      return code + ' ' + formatNumber(amount, digits, loc);
    }
  }

  function formatNumber(amount, digits, locale) {
    var loc = locale || detectLocale();
    var d = typeof digits === 'number' ? digits : 2;
    return new Intl.NumberFormat(loc, {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(Number(amount) || 0);
  }

  /**
   * Parse a user-typed amount. Accepts "," or "." as decimal separator
   * based on whether the last separator looks like a decimal.
   * Rejects scientific notation and letters.
   */
  function parseAmount(raw) {
    if (raw == null) return { ok: false, reason: 'empty', value: NaN };
    var s = String(raw).trim();
    if (!s) return { ok: false, reason: 'empty', value: NaN };
    if (/[eE]/.test(s)) return { ok: false, reason: 'scientific', value: NaN };
    if (/[^0-9.,\s\-]/.test(s)) return { ok: false, reason: 'letters', value: NaN };

    s = s.replace(/\s/g, '');
    var neg = false;
    if (s.charAt(0) === '-') {
      neg = true;
      s = s.slice(1);
    }
    if (!s) return { ok: false, reason: 'empty', value: NaN };

    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    var decimalSep = null;
    if (lastComma >= 0 && lastDot >= 0) {
      decimalSep = lastComma > lastDot ? ',' : '.';
    } else if (lastComma >= 0) {
      var afterComma = s.length - lastComma - 1;
      decimalSep = afterComma > 0 && afterComma <= 3 ? ',' : null;
      // If more than one comma, treat commas as thousands
      if ((s.match(/,/g) || []).length > 1) decimalSep = null;
    } else if (lastDot >= 0) {
      var afterDot = s.length - lastDot - 1;
      decimalSep = afterDot > 0 && afterDot <= 3 ? '.' : null;
      if ((s.match(/\./g) || []).length > 1) decimalSep = null;
    }

    var normalized;
    if (decimalSep === ',') {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else if (decimalSep === '.') {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(/[.,]/g, '');
    }

    if (!/^\d+(\.\d+)?$/.test(normalized)) {
      return { ok: false, reason: 'format', value: NaN };
    }
    var value = Number(normalized);
    if (!Number.isFinite(value)) return { ok: false, reason: 'format', value: NaN };
    if (neg) value = -value;
    return { ok: true, reason: null, value: value };
  }

  /** Convert major units → integer minor units (cents), then back for precision. */
  function toMinor(amount, currency) {
    var d = fractionDigits(currency);
    var factor = Math.pow(10, d);
    return Math.round(Number(amount) * factor);
  }

  function fromMinor(minor, currency) {
    var d = fractionDigits(currency);
    var factor = Math.pow(10, d);
    return minor / factor;
  }

  function roundMoney(amount, currency) {
    return fromMinor(toMinor(amount, currency), currency);
  }

  global.SYCurrency = {
    POPULAR: POPULAR,
    detectLocale: detectLocale,
    detectDefaultCurrency: detectDefaultCurrency,
    listCurrencies: listCurrencies,
    fractionDigits: fractionDigits,
    currencyName: currencyName,
    currencySymbol: currencySymbol,
    labelFor: labelFor,
    formatMoney: formatMoney,
    formatNumber: formatNumber,
    parseAmount: parseAmount,
    toMinor: toMinor,
    fromMinor: fromMinor,
    roundMoney: roundMoney
  };
})(typeof window !== 'undefined' ? window : globalThis);
