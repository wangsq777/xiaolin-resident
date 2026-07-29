const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_VERSION = 1;

// 这些是产品原型用的示例资料，不代表真实活动。接入远端 feed 后会被替换。
const SEED_ITEMS = [
  {
    id: 'demo-brand-collab',
    type: '合作',
    title: '林家谦 × 本地品牌｜联名预告',
    source: '示例 · 官方社交平台',
    publishedAt: '2026-07-29T09:20:00+08:00',
    summary: '留意官方账号的新合作预告，相关视觉物料和登记入口会在这里集中收好。',
    url: 'https://example.com/',
    official: true,
    read: false,
    saved: true,
    accent: 'lilac'
  },
  {
    id: 'demo-event-registration',
    type: '活动',
    title: '城市限定现场｜活动登记提醒',
    source: '示例 · 品牌官网',
    publishedAt: '2026-07-28T18:05:00+08:00',
    summary: '如果出现需要报名或抽选的官方活动，桌宠会把时间、入口和注意事项放在同一张卡片。',
    url: 'https://example.com/',
    official: true,
    read: false,
    saved: false,
    accent: 'peach'
  },
  {
    id: 'demo-visual-kit',
    type: '物料',
    title: '新一轮品牌视觉物料已上线',
    source: '示例 · 官方资讯',
    publishedAt: '2026-07-27T12:40:00+08:00',
    summary: '整理已公开的海报、短片和联名页面，方便之后想找图或回顾时快速定位。',
    url: 'https://example.com/',
    official: true,
    read: true,
    saved: false,
    accent: 'blue'
  }
];

const DEFAULT_SOURCE_STATUSES = [
  { id: 'official', label: '官方账号 / 官网', status: 'demo', detail: '等待接入授权 feed' },
  { id: 'x', label: 'X（官方账号）', status: 'demo', detail: '建议使用官方 API 或聚合 feed' },
  { id: 'hk-entertainment', label: '香港娱乐资讯', status: 'demo', detail: '等待配置来源' }
];

class MaterialFeedStore {
  constructor({ userDataPath, fetchImpl = globalThis.fetch }) {
    this.filePath = path.join(userDataPath, 'material-feed.json');
    this.fetchImpl = fetchImpl;
    this._queue = Promise.resolve();
    this._cache = null;
  }

  async getSnapshot() {
    if (this._cache) return structuredClone(this._cache);
    const raw = await this.readRaw();
    this._cache = normalizeSnapshot(raw);
    return structuredClone(this._cache);
  }

  async refresh() {
    return this.enqueue(async () => {
      const current = await this.getSnapshot();
      const remote = await this.fetchRemoteItems();
      const next = {
        ...current,
        items: remote ? mergeItems(remote, current.items) : current.items,
        lastCheckedAt: new Date().toISOString(),
        sourceStatuses: remote
          ? current.sourceStatuses.map((source) => ({
              ...source,
              status: 'ready',
              detail: '已从 feed 更新'
            }))
          : current.sourceStatuses
      };
      await this.writeRaw(next);
      this._cache = next;
      return structuredClone(next);
    });
  }

  async markRead(id) {
    return this.patchItems((items) => items.map((item) => (
      item.id === id ? { ...item, read: true } : item
    )));
  }

  async toggleSaved(id) {
    return this.patchItems((items) => items.map((item) => (
      item.id === id ? { ...item, saved: !item.saved } : item
    )));
  }

  async patchItems(transform) {
    return this.enqueue(async () => {
      const current = await this.getSnapshot();
      const next = { ...current, items: transform(current.items) };
      await this.writeRaw(next);
      this._cache = next;
      return structuredClone(next);
    });
  }

  enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(() => {});
    return result;
  }

  async fetchRemoteItems() {
    const endpoint = process.env.XIAOLIN_MATERIAL_FEED_URL;
    if (!endpoint || typeof this.fetchImpl !== 'function') return null;

    try {
      const response = await this.fetchImpl(endpoint, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (!Array.isArray(payload?.items)) return null;
      return payload.items.map(normalizeItem).filter(Boolean).slice(0, 80);
    } catch {
      return null;
    }
  }

  async readRaw() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      return null;
    }
  }

  async writeRaw(snapshot) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(temporaryPath, this.filePath);
    await fs.chmod(this.filePath, 0o600).catch(() => {});
  }
}

function normalizeSnapshot(raw) {
  const storedItems = Array.isArray(raw?.items) ? raw.items.map(normalizeItem).filter(Boolean) : [];
  const storedById = new Map(storedItems.map((item) => [item.id, item]));
  const items = SEED_ITEMS.map((seed) => ({ ...seed, ...(storedById.get(seed.id) || {}) }));
  const seedIds = new Set(SEED_ITEMS.map((item) => item.id));
  storedItems.filter((item) => !seedIds.has(item.id)).forEach((item) => items.push(item));

  return {
    version: CONFIG_VERSION,
    items,
    lastCheckedAt: typeof raw?.lastCheckedAt === 'string' ? raw.lastCheckedAt : null,
    sourceStatuses: Array.isArray(raw?.sourceStatuses) && raw.sourceStatuses.length
      ? raw.sourceStatuses.map(normalizeSource)
      : DEFAULT_SOURCE_STATUSES.map((source) => ({ ...source }))
  };
}

function normalizeSource(source = {}) {
  return {
    id: String(source.id || 'source').slice(0, 80),
    label: String(source.label || '未命名来源').slice(0, 100),
    status: ['ready', 'demo', 'error'].includes(source.status) ? source.status : 'demo',
    detail: String(source.detail || '').slice(0, 180)
  };
}

function normalizeItem(item = {}) {
  if (!item.id || !item.title) return null;
  return {
    id: String(item.id).slice(0, 120),
    type: ['合作', '活动', '物料', '资讯'].includes(item.type) ? item.type : '资讯',
    title: String(item.title).slice(0, 180),
    source: String(item.source || '未知来源').slice(0, 100),
    publishedAt: String(item.publishedAt || new Date().toISOString()),
    summary: String(item.summary || '').slice(0, 500),
    url: String(item.url || '').slice(0, 1000),
    official: item.official !== false,
    read: Boolean(item.read),
    saved: Boolean(item.saved),
    accent: ['lilac', 'peach', 'blue', 'mint'].includes(item.accent) ? item.accent : 'lilac'
  };
}

function mergeItems(remoteItems, existingItems) {
  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  const merged = remoteItems.map((item) => ({
    ...item,
    read: existingById.get(item.id)?.read || false,
    saved: existingById.get(item.id)?.saved || false
  }));
  return merged.sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
}

module.exports = {
  DEFAULT_SOURCE_STATUSES,
  MaterialFeedStore,
  SEED_ITEMS,
  mergeItems,
  normalizeItem,
  normalizeSnapshot
};
