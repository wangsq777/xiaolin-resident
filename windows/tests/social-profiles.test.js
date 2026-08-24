const test = require('node:test');
const assert = require('node:assert/strict');

const { SOCIAL_PROFILES, resolveSocialProfile } = require('../src/main/social-profiles');

test('只开放林家谦的 Instagram 与 Threads 官方主页', () => {
  assert.deepEqual(Object.keys(SOCIAL_PROFILES), ['instagram', 'threads']);
  assert.equal(resolveSocialProfile('instagram'), 'https://www.instagram.com/terencelam0903/');
  assert.equal(resolveSocialProfile('threads'), 'https://www.threads.com/@terencelam0903');
});

test('拒绝未知平台或任意外链', () => {
  assert.equal(resolveSocialProfile('x'), null);
  assert.equal(resolveSocialProfile('https://example.com'), null);
  assert.equal(resolveSocialProfile(null), null);
});
