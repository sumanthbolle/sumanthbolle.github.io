const assert = require('node:assert/strict');

const {
  buildSonarError,
  isQuotaUnavailable,
} = require('./fetch-upsc-triggers.js');

const quotaError = buildSonarError(401, JSON.stringify({
  error: {
    message: 'You exceeded your current quota',
    type: 'insufficient_quota',
    code: 401,
  },
}));

assert.equal(isQuotaUnavailable(quotaError), true);

assert.equal(
  isQuotaUnavailable({ statusCode: 401, providerCode: 'insufficient_quota' }),
  true,
);
assert.equal(
  isQuotaUnavailable({ statusCode: 401, providerCode: 'invalid_api_key' }),
  false,
);
assert.equal(
  isQuotaUnavailable({ statusCode: 500, providerCode: 'insufficient_quota' }),
  false,
);

console.log('UPSC trigger tests passed');
