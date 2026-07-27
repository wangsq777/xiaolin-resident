const assert = require('node:assert/strict');
const test = require('node:test');

const { ReminderScheduler, REMINDER_TYPES } = require('../src/main/reminder-scheduler');

// 可注入的固定时钟
function makeClock(initial) {
  let t = initial;
  return {
    now: () => new Date(t),
    advance: (minutes) => { t += minutes * 60 * 1000; }
  };
}

const BASE_TIME = new Date(2026, 6, 27, 10, 0, 0, 0).getTime();

function makeConfig(overrides = {}) {
  return {
    reminders: {
      drink: { enabled: true, intervalMinutes: 60, snoozeMinutes: 10 },
      stretch: { enabled: false, intervalMinutes: 90, snoozeMinutes: 10 },
      eyes: { enabled: false, intervalMinutes: 45, snoozeMinutes: 10 },
      ...overrides.reminders
    },
    quietHours: { enabled: false, start: '23:00', end: '08:00', ...overrides.quietHours },
    dailySkip: overrides.dailySkip || {}
  };
}

test('配置后计算下次到期时间', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig());
  const snap = scheduler.getSnapshot();
  // drink 间隔 60 分钟，10:00 -> 11:00
  assert.equal(snap.nextDue.drink.getTime(), BASE_TIME + 60 * 60 * 1000);
  // stretch/eyes 禁用，无 nextDue
  assert.equal(snap.nextDue.stretch, undefined);
  assert.equal(snap.nextDue.eyes, undefined);
});

test('到期触发提醒', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig());
  // 还没到期
  assert.equal(scheduler.tick(), null);

  // 推进到 11:00，到期
  clock.advance(60);
  const due = scheduler.tick();
  assert.equal(due.type, 'drink');
  assert.equal(due.message, '忙归忙，先喝一点水。');
});

test('complete 动作重置下次到期时间', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig());
  clock.advance(60);
  scheduler.tick();
  assert.ok(scheduler.getSnapshot().activeReminder);

  // 处理完成
  scheduler.handleAction('drink', 'complete');
  // activeReminder 已清除
  assert.equal(scheduler.getSnapshot().activeReminder, null);
  // 下次到期 = now(11:00) + 60min = 12:00
  const next = scheduler.getSnapshot().nextDue.drink.getTime();
  assert.equal(next, BASE_TIME + 120 * 60 * 1000);
});

test('snooze 动作用 snoozeMinutes', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig());
  clock.advance(60);
  scheduler.tick();

  scheduler.handleAction('drink', 'snooze');
  // 下次到期 = 11:00 + 10min = 11:10
  const next = scheduler.getSnapshot().nextDue.drink.getTime();
  assert.equal(next, BASE_TIME + 70 * 60 * 1000);
  assert.equal(scheduler.getSnapshot().activeReminder, null);
});

test('skipToday 当天不再触发，次日恢复', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig());
  clock.advance(60);
  scheduler.tick();

  scheduler.handleAction('drink', 'skipToday');
  assert.equal(scheduler.getSnapshot().activeReminder, null);
  // nextDue 推到次日 00:01
  const next = scheduler.getSnapshot().nextDue.drink;
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 1);
  assert.equal(next.getDate(), 28);

  // 同一天再推进也不会触发（dailySkip 记录今天）
  clock.advance(60);
  assert.equal(scheduler.tick(), null);

  // 次日：cleanExpiredSkips 清除 dailySkip，到点可触发
  clock.advance(24 * 60);
  // 此时是 28 日 12:10，nextDue 是 28 日 00:01，应触发
  const due = scheduler.tick();
  assert.equal(due.type, 'drink');
});

test('安静时段内不触发提醒且顺延到安静结束', () => {
  // 起始时间设在安静时段内：03:00
  const quietBase = new Date(2026, 6, 27, 3, 0, 0, 0).getTime();
  const clock = makeClock(quietBase);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig({ quietHours: { enabled: true, start: '23:00', end: '08:00' } }));

  // drink nextDue = 03:00 + 60min = 04:00，在安静时段内
  clock.advance(60);
  // 安静时段内，tick 应返回 null
  assert.equal(scheduler.tick(), null);
  // 且 nextDue 被顺延到安静结束 08:00
  const next = scheduler.getSnapshot().nextDue.drink;
  assert.equal(next.getHours(), 8);
  assert.equal(next.getMinutes(), 0);

  // 推进到 08:00 后应触发
  clock.advance(4 * 60); // 08:00
  const due = scheduler.tick();
  assert.equal(due.type, 'drink');
});

test('多个提醒同时到期只返回一个，避免堆叠', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  // 让 drink 和 stretch 都启用，间隔相同
  scheduler.setConfig(makeConfig({
    reminders: {
      drink: { enabled: true, intervalMinutes: 60, snoozeMinutes: 10 },
      stretch: { enabled: true, intervalMinutes: 60, snoozeMinutes: 10 },
      eyes: { enabled: false, intervalMinutes: 45, snoozeMinutes: 10 }
    }
  }));
  clock.advance(60);

  // 第一次 tick 返回一个提醒
  const first = scheduler.tick();
  assert.ok(first);
  assert.ok(REMINDER_TYPES.includes(first.type));

  // 第二次 tick 不应返回新的（activeReminder 仍在）
  const second = scheduler.tick();
  assert.equal(second, first); // 返回的是同一个 activeReminder

  // 处理掉当前提醒后，下一次 tick 才会返回另一个到期的
  scheduler.handleAction(first.type, 'complete');
  const third = scheduler.tick();
  assert.ok(third);
  assert.notEqual(third.type, first.type);
});

test('禁用的提醒不会触发', () => {
  const clock = makeClock(BASE_TIME);
  const scheduler = new ReminderScheduler({ now: clock.now });
  scheduler.setConfig(makeConfig({
    reminders: {
      drink: { enabled: false, intervalMinutes: 60, snoozeMinutes: 10 }
    }
  }));
  clock.advance(120);
  assert.equal(scheduler.tick(), null);
  assert.equal(scheduler.getSnapshot().nextDue.drink, undefined);
});
