const assert = require('node:assert/strict');

const { isQuotaUnavailable } = require('./fetch-upsc-triggers.js');

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
