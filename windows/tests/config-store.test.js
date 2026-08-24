const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ConnectionConfigStore } = require('../src/main/config-store');

function makeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => buffer.toString('utf8').replace(/^encrypted:/, '')
  };
}

test('never exposes private values through public status', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-config-'));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const store = new ConnectionConfigStore({
    userDataPath: temporaryDirectory,
    safeStorage: makeSafeStorage()
  });

  await store.saveService({
    endpoint: 'https://token.example.com/music',
    authSecret: 'do-not-expose'
  });

  const status = await store.getPublicStatus();
  assert.equal(status.hasServiceSecret, true);
  assert.equal(JSON.stringify(status).includes('do-not-expose'), false);

  const privateConfig = await store.getPrivateConfig();
  assert.equal(privateConfig.authSecret, 'do-not-expose');
});

test('stores the local private key encrypted on disk', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-key-'));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const store = new ConnectionConfigStore({
    userDataPath: temporaryDirectory,
    safeStorage: makeSafeStorage()
  });

  await store.saveLocal({
    teamId: 'ABCDEFGHIJ',
    keyId: '12345ABCDE',
    privateKey: 'PRIVATE-CONTENT',
    expiresInDays: 30
  });

  const rawFile = await fs.readFile(
    path.join(temporaryDirectory, 'apple-music-connection.json'),
    'utf8'
  );
  assert.equal(rawFile.includes('PRIVATE-CONTENT'), false);

  const restored = await store.getPrivateConfig();
  assert.equal(restored.privateKey, 'PRIVATE-CONTENT');
});
