// 安静时段判定：纯函数，时间可注入，支持跨午夜时段（如 23:00-08:00）。
// 不依赖任何运行时状态，便于单元测试。

const MINUTES_PER_DAY = 24 * 60;

/**
 * 将 "HH:MM" 解析为当日从 00:00 起的分钟数。
 * @param {string} value 形如 "23:00" / "08:00"
 * @returns {number} 0..1439
 */
function parseHHMM(value) {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) {
    throw new Error(`安静时段格式无效：${value}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`安静时段格式无效：${value}`);
  }
  return hours * 60 + minutes;
}

/**
 * 判定给定时刻是否落在安静时段内。
 * 跨午夜时段（start > end）表示从 start 到次日 end。
 *
 * @param {object} input
 * @param {string} input.start "HH:MM"
 * @param {string} input.end "HH:MM"
 * @param {Date} [input.now] 当前时间，默认 new Date()
 * @returns {boolean}
 */
function isQuietNow({ start, end, now = new Date() }) {
  const startMinutes = parseHHMM(start);
  const endMinutes = parseHHMM(end);

  // 同日时段：start == end 视为全天安静，避免边界歧义。
  if (startMinutes === endMinutes) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    // 同日，例如 09:00-18:00
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // 跨午夜，例如 23:00-08:00：当前 >= start 或 < end
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * 计算安静时段的结束时刻（用于提醒顺延）。
 * 跨午夜时段的结束落在次日。
 *
 * @param {object} input
 * @param {string} input.start "HH:MM"
 * @param {string} input.end "HH:MM"
 * @param {Date} [input.now] 当前时间
 * @returns {Date} 安静时段结束的 Date
 */
function quietEndAt({ start, end, now = new Date() }) {
  const endMinutes = parseHHMM(end);
  const result = new Date(now);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(endMinutes);

  const startMinutes = parseHHMM(start);
  // 跨午夜时段：若当前已过当日 end，结束时刻在次日
  if (startMinutes > endMinutes) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < endMinutes) {
      // 当前在午夜后、end 之前，结束就是今日 end
    } else {
      // 当前在 start 之后或 end 之前但已过 end，结束在次日
      result.setDate(result.getDate() + 1);
    }
  }
  return result;
}

module.exports = {
  MINUTES_PER_DAY,
  parseHHMM,
  isQuietNow,
  quietEndAt
};
