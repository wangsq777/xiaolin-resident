const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  MaterialFeedStore,
  mergeItems,
  normalizeItem,
  normalizeSnapshot,
  SEED_ITEMS
} = require('../src/main/material-feed');

test('material feed starts with local prototype items and source status', () => {
  const snapshot = normalizeSnapshot(null);
  assert.equal(snapshot.items.length, SEED_ITEMS.length);
  assert.equal(snapshot.sourceStatuses.length, 3);
  assert.equal(snapshot.items.filter((item) => !item.read).length, 2);
});

test('material feed preserves read and saved state when remote items refresh', () => {
  const existing = [{ ...SEED_ITEMS[0], read: true, saved: false }];
  const remote = [{ ...SEED_ITEMS[0], title: '更新后的标题' }];
  const merged = mergeItems(remote, existing);
  assert.equal(merged[0].title, '更新后的标题');
  assert.equal(merged[0].read, true);
  assert.equal(merged[0].saved, false);
});

test('material feed store persists bookmark and read actions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-material-test-'));
  try {
    const store = new MaterialFeedStore({ userDataPath: directory, fetchImpl: null });
    const first = await store.getSnapshot();
    const saved = await store.toggleSaved(first.items[1].id);
    assert.equal(saved.items[1].saved, true);
    const read = await store.markRead(first.items[1].id);
    assert.equal(read.items[1].read, true);

    const reloaded = new MaterialFeedStore({ userDataPath: directory, fetchImpl: null });
    const snapshot = await reloaded.getSnapshot();
    assert.equal(snapshot.items[1].saved, true);
    assert.equal(snapshot.items[1].read, true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('normalizeItem rejects incomplete feed entries', () => {
  assert.equal(normalizeItem({ id: 'missing-title' }), null);
  assert.equal(normalizeItem({ title: 'missing-id' }), null);
});
