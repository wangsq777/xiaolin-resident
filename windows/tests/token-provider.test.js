const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  createDeveloperToken,
  fetchDeveloperToken,
  parseDeveloperToken,
  validateTokenServiceUrl
} = require('../src/main/token-provider');

function makePrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

test('creates an ES256 Apple Music developer token', () => {
  const { token, summary } = createDeveloperToken({
    teamId: 'ABCDEFGHIJ',
    keyId: '12345ABCDE',
    privateKey: makePrivateKey(),
    expiresInDays: 30
  });

  assert.equal(token.split('.').length, 3);
  assert.equal(summary.algorithm, 'ES256');
  assert.equal(summary.issuer, 'ABCDEFGHIJ');
  assert.equal(summary.keyId, '12345ABCDE');
  assert.ok(summary.daysRemaining >= 29 && summary.daysRemaining <= 30);
});

test('rejects invalid identifiers and expiry', () => {
  const privateKey = makePrivateKey();

  assert.throws(() => createDeveloperToken({
    teamId: 'SHORT',
    keyId: '12345ABCDE',
    privateKey,
    expiresInDays: 30
  }), /Team ID/);

  assert.throws(() => createDeveloperToken({
    teamId: 'ABCDEFGHIJ',
    keyId: '12345ABCDE',
    privateKey,
    expiresInDays: 181
  }), /1—180/);
});

test('accepts HTTPS and localhost development endpoints only', () => {
  assert.equal(
    validateTokenServiceUrl('https://token.example.com/music'),
    'https://token.example.com/music'
  );
  assert.equal(
    validateTokenServiceUrl('http://localhost:8787/token'),
    'http://localhost:8787/token'
  );
  assert.throws(
    () => validateTokenServiceUrl('http://example.com/token'),
    /HTTPS/
  );
});

test('reads developerToken from a token service response', async () => {
  const generated = createDeveloperToken({
    teamId: 'ABCDEFGHIJ',
    keyId: '12345ABCDE',
    privateKey: makePrivateKey(),
    expiresInDays: 7
  });

  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return {
      ok: true,
      json: async () => ({ developerToken: generated.token })
    };
  };

  const result = await fetchDeveloperToken({
    endpoint: 'https://token.example.com/music',
    authSecret: 'test-secret',
    fetchImpl
  });

  assert.equal(result.summary.keyId, '12345ABCDE');
  assert.equal(parseDeveloperToken(result.token).issuer, 'ABCDEFGHIJ');
});
