const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveCharacter, listKnownStateImages, STATE_IMAGE_MAP } = require('../src/main/character-resolver');

test('默认状态为 leisure，素材就绪时返回对应图', () => {
  const result = resolveCharacter({
    manualState: 'leisure',
    availableAssets: ['default.png', 'working.png', 'leisure.png']
  });
  assert.equal(result.stateKey, 'leisure');
  assert.equal(result.imageSrc, './assets/character-states/leisure.png');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.statusText, '休息緊');
});

test('接受主进程扫描素材时使用的 Set 集合', () => {
  const result = resolveCharacter({
    manualState: 'leisure',
    availableAssets: new Set(['default.png', 'leisure.png'])
  });
  assert.equal(result.imageSrc, './assets/character-states/leisure.png');
  assert.equal(result.fallbackUsed, false);
});

test('working 状态映射吉他形象', () => {
  const result = resolveCharacter({
    manualState: 'working',
    availableAssets: ['default.png', 'working.png']
  });
  assert.equal(result.stateKey, 'working');
  assert.equal(result.imageSrc, './assets/character-states/working.png');
  assert.equal(result.fallbackUsed, false);
});

test('摸鱼状态使用原等待更新形象', () => {
  const result = resolveCharacter({
    manualState: 'slacking',
    availableAssets: ['default.png', 'waiting-update.png']
  });
  assert.equal(result.stateKey, 'slacking');
  assert.equal(result.imageSrc, './assets/character-states/waiting-update.png');
  assert.equal(result.statusText, '摸緊魚');
  assert.equal(result.fallbackUsed, false);
});

test('伤心状态使用拥抱安慰形象', () => {
  const result = resolveCharacter({
    manualState: 'sad',
    availableAssets: ['default.png', 'sad.png']
  });
  assert.equal(result.stateKey, 'sad');
  assert.equal(result.imageSrc, './assets/character-states/sad.png');
  assert.equal(result.statusText, '有我喺度');
  assert.equal(result.fallbackUsed, false);
});

test('素材缺失时回退到 default 且不抛错', () => {
  const result = resolveCharacter({
    manualState: 'leisure',
    availableAssets: ['default.png', 'working.png']  // 缺 leisure.png
  });
  assert.equal(result.stateKey, 'leisure');
  assert.equal(result.imageSrc, './assets/character-states/default.png');
  assert.equal(result.fallbackUsed, true);
});

test('连默认素材都缺失时仍返回路径，不抛错（渲染层兜底）', () => {
  const result = resolveCharacter({
    manualState: 'leisure',
    availableAssets: []  // 什么都没有
  });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.imageSrc, './assets/character-states/default.png');
});

test('优先级：免打扰覆盖提醒与手动状态', () => {
  const result = resolveCharacter({
    manualState: 'working',
    reminder: 'drink',
    quietActive: true,
    availableAssets: ['default.png', 'do-not-disturb.png', 'working.png', 'drinking.png']
  });
  assert.equal(result.stateKey, 'do_not_disturb');
  assert.equal(result.imageSrc, './assets/character-states/do-not-disturb.png');
  assert.equal(result.statusText, '唔好打擾');
});

test('优先级：提醒覆盖手动工作状态', () => {
  const result = resolveCharacter({
    manualState: 'working',
    reminder: 'drink',
    availableAssets: ['default.png', 'working.png', 'drinking.png']
  });
  assert.equal(result.stateKey, 'reminder_drink');
  assert.equal(result.imageSrc, './assets/character-states/drinking.png');
  assert.equal(result.statusText, '飲啖水先');
});

test('优先级：happy 覆盖手动状态但不覆盖提醒与免打扰', () => {
  // happy 优先于 working
  const r1 = resolveCharacter({
    manualState: 'working',
    happyActive: true,
    availableAssets: ['default.png', 'working.png', 'happy.png']
  });
  assert.equal(r1.stateKey, 'happy');

  // 但提醒优先于 happy
  const r2 = resolveCharacter({
    manualState: 'leisure',
    reminder: 'drink',
    happyActive: true,
    availableAssets: ['default.png', 'drinking.png', 'happy.png']
  });
  assert.equal(r2.stateKey, 'reminder_drink');

  // 免打扰优先于 happy
  const r3 = resolveCharacter({
    manualState: 'leisure',
    happyActive: true,
    quietActive: true,
    availableAssets: ['default.png', 'do-not-disturb.png', 'happy.png']
  });
  assert.equal(r3.stateKey, 'do_not_disturb');
});

test('未知 manualState 回退到 leisure', () => {
  const result = resolveCharacter({
    manualState: 'unknown_state',
    availableAssets: ['default.png']
  });
  assert.equal(result.stateKey, 'leisure');
});

test('sleepActive 在 leisure 时进入 sleeping', () => {
  const result = resolveCharacter({
    manualState: 'leisure',
    sleepActive: true,
    availableAssets: ['default.png', 'sleeping.png']
  });
  assert.equal(result.stateKey, 'sleeping');
  assert.equal(result.imageSrc, './assets/character-states/sleeping.png');
  assert.equal(result.statusText, '瞓緊覺');
  assert.equal(result.fallbackUsed, false);
});

test('sleepActive 只覆盖休息，不覆盖其他手动状态', () => {
  const r1 = resolveCharacter({
    manualState: 'working',
    sleepActive: true,
    availableAssets: ['default.png', 'working.png', 'sleeping.png']
  });
  assert.equal(r1.stateKey, 'working');

  const r2 = resolveCharacter({
    manualState: 'do_not_disturb',
    sleepActive: true,
    availableAssets: ['default.png', 'do-not-disturb.png', 'sleeping.png']
  });
  assert.equal(r2.stateKey, 'do_not_disturb');

  const r3 = resolveCharacter({
    manualState: 'sad',
    sleepActive: true,
    availableAssets: ['default.png', 'sad.png', 'sleeping.png']
  });
  assert.equal(r3.stateKey, 'sad');

  const r4 = resolveCharacter({
    manualState: 'slacking',
    sleepActive: true,
    availableAssets: ['default.png', 'waiting-update.png', 'sleeping.png']
  });
  assert.equal(r4.stateKey, 'slacking');
});

test('sleepActive 被提醒和免打扰覆盖', () => {
  const r1 = resolveCharacter({
    manualState: 'leisure',
    sleepActive: true,
    reminder: 'drink',
    availableAssets: ['default.png', 'drinking.png', 'sleeping.png']
  });
  assert.equal(r1.stateKey, 'reminder_drink');

  const r2 = resolveCharacter({
    manualState: 'leisure',
    sleepActive: true,
    quietActive: true,
    availableAssets: ['default.png', 'do-not-disturb.png', 'sleeping.png']
  });
  assert.equal(r2.stateKey, 'do_not_disturb');
});

test('reminder 类型映射到对应素材', () => {
  const stretch = resolveCharacter({
    manualState: 'working',
    reminder: 'stretch',
    availableAssets: ['default.png', 'stretching.png']
  });
  assert.equal(stretch.stateKey, 'reminder_stretch');
  assert.equal(stretch.imageSrc, './assets/character-states/stretching.png');

  const eyes = resolveCharacter({
    manualState: 'leisure',
    reminder: 'eyes',
    availableAssets: ['default.png', 'eyes-rest.png']
  });
  assert.equal(eyes.stateKey, 'reminder_eyes');
  assert.equal(eyes.imageSrc, './assets/character-states/eyes-rest.png');
});

test('动态巡逻状态映射到新素材', () => {
  const patrolling = resolveCharacter({
    manualState: 'leisure',
    socialState: 'patrolling',
    availableAssets: ['default.png', 'patrolling.png']
  });
  assert.equal(patrolling.stateKey, 'patrolling');
  assert.equal(patrolling.imageSrc, './assets/character-states/patrolling.png');
  assert.equal(patrolling.statusText, '巡邏緊');

  const collecting = resolveCharacter({
    manualState: 'working',
    socialState: 'collecting',
    availableAssets: ['default.png', 'working.png', 'collecting.png']
  });
  assert.equal(collecting.stateKey, 'collecting');
  assert.equal(collecting.imageSrc, './assets/character-states/collecting.png');
});

test('动态巡逻状态不覆盖免打扰或关怀提醒', () => {
  const quiet = resolveCharacter({
    manualState: 'do_not_disturb',
    socialState: 'patrolling',
    availableAssets: ['default.png', 'do-not-disturb.png', 'patrolling.png']
  });
  assert.equal(quiet.stateKey, 'do_not_disturb');

  const reminder = resolveCharacter({
    manualState: 'leisure',
    reminder: 'drink',
    socialState: 'patrolling',
    availableAssets: ['default.png', 'drinking.png', 'patrolling.png']
  });
  assert.equal(reminder.stateKey, 'reminder_drink');
});

test('listKnownStateImages 返回去重后的全部素材文件名', () => {
  const images = listKnownStateImages();
  assert.ok(images.includes('default.png'));
  assert.ok(images.includes('working.png'));
  assert.ok(images.includes('leisure.png'));
  assert.ok(images.includes('drinking.png'));
  assert.ok(images.includes('do-not-disturb.png'));
  assert.ok(images.includes('patrolling.png'));
  assert.ok(images.includes('waiting-update.png'));
  assert.ok(images.includes('sad.png'));
  assert.ok(images.includes('collecting.png'));
  // 所有状态共用的默认回退图只应列出一次
  const defaultCount = images.filter((f) => f === 'default.png').length;
  assert.equal(defaultCount, 1);
});
