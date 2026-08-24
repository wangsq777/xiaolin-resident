const assert = require('node:assert/strict');
const test = require('node:test');

const { parseHHMM, isQuietNow, quietEndAt } = require('../src/main/quiet-hours');

function atTime(hour, minute) {
  const d = new Date(2026, 6, 27, hour, minute, 0, 0);
  return d;
}

test('parseHHMM 解析合法时段', () => {
  assert.equal(parseHHMM('23:00'), 23 * 60);
  assert.equal(parseHHMM('08:00'), 8 * 60);
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('23:59'), 23 * 60 + 59);
});

test('parseHHMM 拒绝非法格式', () => {
  assert.throws(() => parseHHMM('24:00'), /无效/);
  assert.throws(() => parseHHMM('23:60'), /无效/);
  assert.throws(() => parseHHMM('abc'), /无效/);
  assert.throws(() => parseHHMM(''), /无效/);
});

test('同日时段：09:00-18:00', () => {
  const range = { start: '09:00', end: '18:00' };
  assert.equal(isQuietNow({ ...range, now: atTime(9, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(12, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(17, 59) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(18, 0) }), false);
  assert.equal(isQuietNow({ ...range, now: atTime(8, 59) }), false);
  assert.equal(isQuietNow({ ...range, now: atTime(23, 0) }), false);
});

test('跨午夜时段：23:00-08:00', () => {
  const range = { start: '23:00', end: '08:00' };
  // 23:00 当晚进入安静
  assert.equal(isQuietNow({ ...range, now: atTime(23, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(23, 30) }), true);
  // 午夜后到 08:00 仍安静
  assert.equal(isQuietNow({ ...range, now: atTime(0, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(3, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(7, 59) }), true);
  // 08:00 退出安静
  assert.equal(isQuietNow({ ...range, now: atTime(8, 0) }), false);
  assert.equal(isQuietNow({ ...range, now: atTime(12, 0) }), false);
  assert.equal(isQuietNow({ ...range, now: atTime(22, 59) }), false);
});

test('start == end 视为全天安静', () => {
  const range = { start: '12:00', end: '12:00' };
  assert.equal(isQuietNow({ ...range, now: atTime(12, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(0, 0) }), true);
  assert.equal(isQuietNow({ ...range, now: atTime(23, 59) }), true);
});

test('quietEndAt 跨午夜：当前在安静期内，结束在次日 08:00', () => {
  const range = { start: '23:00', end: '08:00' };
  // 当晚 23:30 -> 结束在次日 08:00
  const end = quietEndAt({ ...range, now: atTime(23, 30) });
  assert.equal(end.getHours(), 8);
  assert.equal(end.getDate(), 28); // 次日
});

test('quietEndAt 跨午夜：午夜后仍安静，结束在当日 08:00', () => {
  const range = { start: '23:00', end: '08:00' };
  // 凌晨 03:00（已是 27 日）-> 结束在当日 08:00
  const end = quietEndAt({ ...range, now: atTime(3, 0) });
  assert.equal(end.getHours(), 8);
  assert.equal(end.getDate(), 27); // 当日
});
