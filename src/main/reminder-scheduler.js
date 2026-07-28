// 提醒计时器：可注入时钟，跨午夜安静时段，单一可见气泡（不堆叠）。
// 任务文档 §4：每个提醒事件只允许存在一个可见气泡。
// 任务文档 §9：提醒计时器使用可注入时间，测试不依赖真实等待。

const fs = require('node:fs');
const path = require('node:path');
const { isQuietNow, quietEndAt } = require('./quiet-hours');

const REMINDER_TYPES = ['drink', 'stretch', 'eyes'];

// 默认提醒文案：从本地配置文件加载，失败时回退到内置文案。
// 任务文档 §P1：提醒文案本地配置文件，用户可自行编辑。
const FALLBACK_MESSAGES = {
  drink: ['忙归忙，先喝一点水。'],
  stretch: ['坐得有点久了，起来活动一下。'],
  eyes: ['看屏幕很久了，望望远处吧。']
};

let cachedMessages = null;

function loadMessages() {
  if (cachedMessages) return cachedMessages;
  try {
    const filePath = path.join(__dirname, 'reminder-messages.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // 只保留 REMINDER_TYPES 对应的字符串数组字段，做基本校验
    cachedMessages = {};
    for (const type of REMINDER_TYPES) {
      const value = parsed[type];
      if (Array.isArray(value) && value.every((s) => typeof s === 'string' && s.length > 0)) {
        cachedMessages[type] = value;
      } else {
        cachedMessages[type] = FALLBACK_MESSAGES[type];
      }
    }
  } catch {
    cachedMessages = { ...FALLBACK_MESSAGES };
  }
  return cachedMessages;
}

/**
 * 从某类提醒的文案列表中随机选一条。
 */
function pickMessage(type) {
  const messages = loadMessages();
  const list = messages[type] || FALLBACK_MESSAGES[type] || ['该休息一下了。'];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 计算某个提醒的下次到期时间。
 * @param {object} reminder 提醒配置 { enabled, intervalMinutes, snoozeMinutes }
 * @param {Date} now 当前时间
 * @returns {Date|null} 下次到期，禁用则为 null
 */
function computeNextDue(reminder, now) {
  if (!reminder || !reminder.enabled) return null;
  const interval = Number(reminder.intervalMinutes);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  return new Date(now.getTime() + interval * 60 * 1000);
}

class ReminderScheduler {
  /**
   * @param {object} options
   * @param {() => Date} [options.now] 时间源，默认 () => new Date()
   * @param {function} [options.onDue] 提醒到期回调 (reminder) => void
   */
  constructor({ now = () => new Date(), onDue } = {}) {
    this.now = now;
    this.onDue = onDue;
    this.reminders = {};        // { drink: { enabled, intervalMinutes, snoozeMinutes }, ... }
    this.quietHours = { enabled: false, start: '23:00', end: '08:00' };
    this.dailySkip = {};        // { drink: '2026-07-27' }
    this.nextDue = {};          // { drink: Date }
    this.activeReminder = null; // 当前可见的提醒 { type, message, dueAt }
    // 今日完成次数：{ date: '2026-07-27', drink: 0, stretch: 0, eyes: 0 }
    this.dailyCount = { date: '', drink: 0, stretch: 0, eyes: 0 };
  }

  /**
   * 用关怀设置重置调度器状态。
   * 保留未处理的 activeReminder；重算每类提醒的下次到期。
   * dailyCount 日期变更时自动重置（任务文档 §9：新的一天重置）。
   */
  setConfig({ reminders = {}, quietHours = {}, dailySkip = {}, dailyCount } = {}) {
    this.reminders = reminders;
    this.quietHours = quietHours;
    this.dailySkip = dailySkip || {};

    // dailyCount 日期重置：传入的日期与今天不同则归零
    const today = this.dateKey(this.now());
    if (dailyCount && typeof dailyCount === 'object') {
      if (dailyCount.date === today) {
        this.dailyCount = { ...dailyCount };
      } else {
        // 日期变更，重置计数（任务文档 §9）
        this.dailyCount = { date: today, drink: 0, stretch: 0, eyes: 0 };
      }
    } else {
      this.dailyCount = { date: today, drink: 0, stretch: 0, eyes: 0 };
    }

    // 重算 nextDue：每次 setConfig 都重新计算，确保间隔变更立即生效
    const now = this.now();
    for (const type of REMINDER_TYPES) {
      const cfg = this.reminders[type];
      if (!cfg || !cfg.enabled) {
        delete this.nextDue[type];
        continue;
      }
      const next = computeNextDue(cfg, now);
      if (next) this.nextDue[type] = next;
      else delete this.nextDue[type];
    }
  }

  /**
   * 清理过期的 dailySkip（次日自动恢复，任务文档 §9）。
   * 同时检查 dailyCount 日期重置（新的一天归零）。
   */
  cleanExpiredSkips() {
    const today = this.dateKey(this.now());
    for (const type of Object.keys(this.dailySkip)) {
      if (this.dailySkip[type] < today) {
        delete this.dailySkip[type];
      }
    }
    // dailyCount 日期变更时重置
    if (this.dailyCount.date !== today) {
      this.dailyCount = { date: today, drink: 0, stretch: 0, eyes: 0 };
    }
  }

  /**
   * 确保 dailyCount 日期与今天一致，否则重置。
   */
  ensureDailyCountDate() {
    const today = this.dateKey(this.now());
    if (this.dailyCount.date !== today) {
      this.dailyCount = { date: today, drink: 0, stretch: 0, eyes: 0 };
    }
  }

  /**
   * 每秒调用一次。返回当前应触发的提醒（若有）。
   * 免打扰期间不触发；结束后不补发已过期提醒，而是顺延到安静时段结束。
   * 同一时刻只允许一个 activeReminder，避免堆叠。
   *
   * @returns {object|null} { type, message, dueAt } 或 null
   */
  tick() {
    // 已有可见提醒时，不触发新的
    if (this.activeReminder) return this.activeReminder;

    this.cleanExpiredSkips();
    const now = this.now();

    // 安静时段：不弹普通提醒
    if (this.quietHours.enabled) {
      const quiet = isQuietNow({
        start: this.quietHours.start,
        end: this.quietHours.end,
        now
      });
      if (quiet) {
        // 顺延所有到期提醒到安静时段结束
        const end = quietEndAt({
          start: this.quietHours.start,
          end: this.quietHours.end,
          now
        });
        for (const type of REMINDER_TYPES) {
          const due = this.nextDue[type];
          if (due && due.getTime() <= now.getTime()) {
            this.nextDue[type] = end;
          }
        }
        return null;
      }
    }

    // 收集所有到期提醒（按到期时间升序，避免堆叠，任务文档 §9）
    const dueList = [];
    for (const type of REMINDER_TYPES) {
      const due = this.nextDue[type];
      if (!due) continue;
      // 当天已跳过的不触发
      const today = this.dateKey(now);
      if (this.dailySkip[type] === today) continue;
      if (due.getTime() <= now.getTime()) {
        dueList.push({ type, dueAt: due });
      }
    }
    if (dueList.length === 0) return null;

    // 按到期时间升序，取最早的一个
    dueList.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const triggered = dueList[0];
    this.activeReminder = {
      type: triggered.type,
      message: pickMessage(triggered.type),
      dueAt: triggered.dueAt
    };
    this.onDue?.(this.activeReminder);
    return this.activeReminder;
  }

  /**
   * 处理提醒动作（任务文档 §4 三个动作）。
   * @param {string} type 提醒类型
   * @param {string} action complete | snooze | skipToday
   */
  handleAction(type, action) {
    if (!REMINDER_TYPES.includes(type)) return;
    const cfg = this.reminders[type];
    if (!cfg) return;
    const now = this.now();

    if (action === 'complete') {
      this.nextDue[type] = new Date(now.getTime() + cfg.intervalMinutes * 60 * 1000);
      // 完成后清除当天跳过记录
      delete this.dailySkip[type];
      // 递增今日完成次数（任务文档 §P1：今日提醒完成次数）
      this.ensureDailyCountDate();
      this.dailyCount[type] = (this.dailyCount[type] || 0) + 1;
    } else if (action === 'snooze') {
      const snooze = Number(cfg.snoozeMinutes) || 10;
      this.nextDue[type] = new Date(now.getTime() + snooze * 60 * 1000);
    } else if (action === 'skipToday') {
      this.dailySkip[type] = this.dateKey(now);
      // 今日不再触发：下次到期推到次日 00:01
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 1, 0, 0);
      this.nextDue[type] = tomorrow;
    }

    // 清除当前可见提醒（任务文档 §4：处理后自动收起）
    if (this.activeReminder && this.activeReminder.type === type) {
      this.activeReminder = null;
    }
  }

  /**
   * 返回调度器当前快照，供 UI 展示今日提醒记录等。
   */
  getSnapshot() {
    const now = this.now();
    return {
      activeReminder: this.activeReminder,
      nextDue: { ...this.nextDue },
      dailySkip: { ...this.dailySkip },
      dailyCount: { ...this.dailyCount },
      now: now.toISOString()
    };
  }

  dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

module.exports = {
  ReminderScheduler,
  REMINDER_TYPES,
  loadMessages,
  pickMessage,
  computeNextDue
};
