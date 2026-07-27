const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { CareStore, DEFAULTS } = require('../src/main/care-store');

async function makeStore(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-care-'));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return new CareStore({ userDataPath: dir });
}

test('getAll 首次返回默认值', async (context) => {
  const store = await makeStore(context);
  const config = await store.getAll();
  assert.equal(config.version, 1);
  assert.equal(config.currentState, 'leisure');
  assert.equal(config.bgm.enabled, false);
  assert.equal(config.reminders.drink.enabled, true);
  assert.equal(config.quietHours.enabled, false);
});

test('patch 深合并并持久化', async (context) => {
  const store = await makeStore(context);
  await store.patch({
    currentState: 'working',
    quietHours: { enabled: true, start: '22:00' },
    reminders: { drink: { intervalMinutes: 90 } }
  });

  // 重新读取验证
  const config = await store.getAll();
  assert.equal(config.currentState, 'working');
  assert.equal(config.quietHours.enabled, true);
  assert.equal(config.quietHours.start, '22:00');
  // 未改的字段保留默认
  assert.equal(config.quietHours.end, '08:00');
  assert.equal(config.reminders.drink.intervalMinutes, 90);
  assert.equal(config.reminders.drink.enabled, true); // 未改
  assert.equal(config.reminders.drink.snoozeMinutes, 10); // 未改
});

test('patch 忽略白名单外的未知键', async (context) => {
  const store = await makeStore(context);
  await store.patch({
    evilField: 'should not persist',
    currentState: 'leisure',
    quietHours: { evilSub: 'x' },
    reminders: { drink: { evilInterval: 999 } }
  });
  const config = await store.getAll();
  assert.equal(JSON.stringify(config).includes('evil'), false);
});

test('patch 拒绝非法 currentState', async (context) => {
  const store = await makeStore(context);
  await store.patch({ currentState: 'invalid_state' });
  const config = await store.getAll();
  assert.equal(config.currentState, 'leisure'); // 仍是默认
});

test('重启后设置恢复（新实例读取同一文件）', async (context) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-care-'));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));

  const store1 = new CareStore({ userDataPath: dir });
  await store1.patch({
    currentState: 'do_not_disturb',
    reminders: { stretch: { enabled: true, intervalMinutes: 30 } }
  });

  // 模拟重启：新实例
  const store2 = new CareStore({ userDataPath: dir });
  const config = await store2.getAll();
  assert.equal(config.currentState, 'do_not_disturb');
  assert.equal(config.reminders.stretch.enabled, true);
  assert.equal(config.reminders.stretch.intervalMinutes, 30);
});

test('onChange 在 patch 后触发', async (context) => {
  const store = await makeStore(context);
  let notified = null;
  store.onChange((config) => { notified = config; });
  await store.patch({ currentState: 'working' });
  assert.equal(notified.currentState, 'working');
});

test('reset 恢复默认值', async (context) => {
  const store = await makeStore(context);
  await store.patch({ currentState: 'working', bgm: { enabled: true } });
  const config = await store.reset();
  assert.deepEqual(config, DEFAULTS);
  // 持久化也恢复
  const reread = await store.getAll();
  assert.deepEqual(reread, DEFAULTS);
});

test('损坏的配置文件回退到默认值而不抛错', async (context) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-care-'));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  // 写入损坏内容
  await fs.writeFile(path.join(dir, 'care-settings.json'), '{ broken json', 'utf8');
  const store = new CareStore({ userDataPath: dir });
  const config = await store.getAll();
  assert.deepEqual(config, DEFAULTS);
});
