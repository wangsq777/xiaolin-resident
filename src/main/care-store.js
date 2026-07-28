// 本地关怀设置存储：独立于 config-store（Apple Music 专用）。
// 不含密钥、不加密，仅做版本化 JSON 原子写，权限 0o600。
// 模板来源：config-store.js（原子写 *.tmp+rename、chmod 0o600、version 字段、DI）。

const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_VERSION = 1;

const DEFAULTS = {
  version: CONFIG_VERSION,
  currentState: 'leisure',
  quietHours: {
    enabled: false,
    start: '23:00',
    end: '08:00'
  },
  reminders: {
    drink: {
      enabled: true,
      intervalMinutes: 60,
      snoozeMinutes: 10
    },
    stretch: {
      enabled: false,
      intervalMinutes: 90,
      snoozeMinutes: 10
    },
    eyes: {
      enabled: false,
      intervalMinutes: 45,
      snoozeMinutes: 10
    }
  },
  bgm: {
    enabled: false
  },
  dailySkip: {},
  // 今日提醒完成次数：{ date: '2026-07-27', drink: 0, stretch: 0, eyes: 0 }
  // 日期变更时由 scheduler/store 重置为 0（任务文档 §9：新的一天重置）
  dailyCount: {
    date: '',
    drink: 0,
    stretch: 0,
    eyes: 0
  },
  // 桌宠窗口记忆：位置、大小、透明度
  windowMemory: {
    x: null,
    y: null,
    width: 500,
    height: 210,
    opacity: 1
  },
  // 鼠标穿透模式
  clickThrough: false
};

// 白名单字段，patch 时只接受这些键，忽略未知键
const ALLOWED_TOP_KEYS = new Set([
  'currentState',
  'quietHours',
  'reminders',
  'bgm',
  'dailySkip',
  'dailyCount',
  'windowMemory',
  'clickThrough'
]);

const ALLOWED_QUIET_HOURS = new Set(['enabled', 'start', 'end']);
const ALLOWED_REMINDER_FIELDS = new Set(['enabled', 'intervalMinutes', 'snoozeMinutes']);
const ALLOWED_REMINDER_TYPES = new Set(['drink', 'stretch', 'eyes']);
const ALLOWED_STATES = new Set(['working', 'leisure', 'do_not_disturb']);

class CareStore {
  /**
   * @param {object} options
   * @param {string} options.userDataPath Electron app.getPath('userData')
   */
  constructor({ userDataPath }) {
    this.configPath = path.join(userDataPath, 'care-settings.json');
    this._cache = null;
    this._listeners = new Set();
  }

  /**
   * 读取全部设置，与默认值深合并。失败时返回默认值的副本（绝不抛错）。
   */
  async getAll() {
    const raw = await this.readRaw();
    if (!raw) {
      this._cache = structuredClone(DEFAULTS);
      return this._cache;
    }
    this._cache = this.mergeWithDefaults(raw);
    return this._cache;
  }

  /**
   * 深合并 patch：只接受白名单字段，忽略未知键。
   * 写入后触发 onChange 监听器。
   * @param {object} partial
   * @returns {Promise<object>} 写入后的完整设置
   */
  async patch(partial = {}) {
    const current = await this.getAll();
    const next = this.applyPatch(current, partial);
    await this.writeRaw(next);
    this._cache = next;
    this._notify(next);
    return next;
  }

  /**
   * 重置为默认值。
   */
  async reset() {
    const next = structuredClone(DEFAULTS);
    await this.writeRaw(next);
    this._cache = next;
    this._notify(next);
    return next;
  }

  /**
   * 注册设置变更监听器。
   * @returns {() => void} 取消监听
   */
  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(config) {
    for (const listener of this._listeners) {
      try {
        listener(config);
      } catch {
        // 监听器出错不影响存储
      }
    }
  }

  /**
   * 将 patch 应用到当前配置，做白名单校验。
   */
  applyPatch(current, partial) {
    const next = structuredClone(current);

    for (const [key, value] of Object.entries(partial)) {
      if (!ALLOWED_TOP_KEYS.has(key)) continue;

      if (key === 'currentState') {
        if (typeof value === 'string' && ALLOWED_STATES.has(value)) {
          next.currentState = value;
        }
        continue;
      }

      if (key === 'quietHours') {
        if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) {
            if (ALLOWED_QUIET_HOURS.has(k)) {
              next.quietHours[k] = v;
            }
          }
        }
        continue;
      }

      if (key === 'reminders') {
        if (value && typeof value === 'object') {
          for (const [type, fields] of Object.entries(value)) {
            if (!ALLOWED_REMINDER_TYPES.has(type)) continue;
            if (!fields || typeof fields !== 'object') continue;
            for (const [k, v] of Object.entries(fields)) {
              if (ALLOWED_REMINDER_FIELDS.has(k)) {
                next.reminders[type][k] = v;
              }
            }
          }
        }
        continue;
      }

      if (key === 'bgm') {
        if (value && typeof value === 'object') {
          if (typeof value.enabled === 'boolean') {
            next.bgm.enabled = value.enabled;
          }
        }
        continue;
      }

      if (key === 'dailySkip') {
        if (value && typeof value === 'object') {
          next.dailySkip = { ...value };
        }
        continue;
      }

      if (key === 'dailyCount') {
        if (value && typeof value === 'object') {
          if (typeof value.date === 'string') next.dailyCount.date = value.date;
          for (const type of ALLOWED_REMINDER_TYPES) {
            if (typeof value[type] === 'number' && value[type] >= 0) {
              next.dailyCount[type] = value[type];
            }
          }
        }
        continue;
      }

      if (key === 'windowMemory') {
        if (value && typeof value === 'object') {
          for (const k of ['x', 'y', 'width', 'height', 'opacity']) {
            if (value[k] === null || typeof value[k] === 'number') {
              next.windowMemory[k] = value[k];
            }
          }
        }
        continue;
      }

      if (key === 'clickThrough') {
        if (typeof value === 'boolean') {
          next.clickThrough = value;
        }
        continue;
      }
    }

    return next;
  }

  mergeWithDefaults(raw) {
    // 简单深合并：以默认值为底，逐字段覆盖
    const merged = structuredClone(DEFAULTS);
    if (raw.currentState && ALLOWED_STATES.has(raw.currentState)) {
      merged.currentState = raw.currentState;
    }
    if (raw.quietHours && typeof raw.quietHours === 'object') {
      Object.assign(merged.quietHours, raw.quietHours);
    }
    if (raw.reminders && typeof raw.reminders === 'object') {
      for (const type of ALLOWED_REMINDER_TYPES) {
        if (raw.reminders[type] && typeof raw.reminders[type] === 'object') {
          Object.assign(merged.reminders[type], raw.reminders[type]);
        }
      }
    }
    if (raw.bgm && typeof raw.bgm === 'object') {
      if (typeof raw.bgm.enabled === 'boolean') {
        merged.bgm.enabled = raw.bgm.enabled;
      }
    }
    if (raw.dailySkip && typeof raw.dailySkip === 'object') {
      merged.dailySkip = { ...raw.dailySkip };
    }
    if (raw.dailyCount && typeof raw.dailyCount === 'object') {
      Object.assign(merged.dailyCount, raw.dailyCount);
    }
    if (raw.windowMemory && typeof raw.windowMemory === 'object') {
      Object.assign(merged.windowMemory, raw.windowMemory);
    }
    if (typeof raw.clickThrough === 'boolean') {
      merged.clickThrough = raw.clickThrough;
    }
    return merged;
  }

  async readRaw() {
    try {
      const text = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(text);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      // 损坏的配置文件：返回 null 以重建默认值，不抛错
      return null;
    }
  }

  async writeRaw(config) {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(temporaryPath, this.configPath);
    await fs.chmod(this.configPath, 0o600).catch(() => {});
  }
}

module.exports = { CareStore, DEFAULTS, CONFIG_VERSION };
