const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_VERSION = 1;

class ConnectionConfigStore {
  constructor({ userDataPath, safeStorage }) {
    this.safeStorage = safeStorage;
    this.configPath = path.join(userDataPath, 'apple-music-connection.json');
  }

  async getPublicStatus() {
    const config = await this.readRaw();
    if (!config) {
      return {
        configured: false,
        mode: null,
        encryptionAvailable: this.safeStorage.isEncryptionAvailable(),
        serviceEndpoint: '',
        hasServiceSecret: false,
        teamId: '',
        keyId: '',
        expiresInDays: 30,
        hasPrivateKey: false
      };
    }

    return {
      configured: true,
      mode: config.mode,
      encryptionAvailable: this.safeStorage.isEncryptionAvailable(),
      serviceEndpoint: config.serviceEndpoint || '',
      hasServiceSecret: Boolean(config.encryptedServiceSecret),
      teamId: config.teamId || '',
      keyId: config.keyId || '',
      expiresInDays: config.expiresInDays || 30,
      hasPrivateKey: Boolean(config.encryptedPrivateKey)
    };
  }

  async saveService({ endpoint, authSecret = '', preserveExistingSecret = false }) {
    const existing = await this.readRaw();
    const encryptedServiceSecret = authSecret
      ? this.encrypt(authSecret)
      : preserveExistingSecret && existing?.mode === 'service'
        ? existing.encryptedServiceSecret || null
        : null;

    const config = {
      version: CONFIG_VERSION,
      mode: 'service',
      serviceEndpoint: endpoint,
      encryptedServiceSecret,
      updatedAt: new Date().toISOString()
    };
    await this.writeRaw(config);
  }

  async saveLocal({ teamId, keyId, privateKey, expiresInDays }) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法提供安全存储，不能保存 .p8 私钥。');
    }

    const config = {
      version: CONFIG_VERSION,
      mode: 'local',
      teamId,
      keyId,
      expiresInDays,
      encryptedPrivateKey: this.encrypt(privateKey),
      updatedAt: new Date().toISOString()
    };
    await this.writeRaw(config);
  }

  async getPrivateConfig() {
    const config = await this.readRaw();
    if (!config) throw new Error('尚未配置 Apple Music 连接。');

    if (config.mode === 'service') {
      return {
        mode: 'service',
        endpoint: config.serviceEndpoint,
        authSecret: config.encryptedServiceSecret
          ? this.decrypt(config.encryptedServiceSecret)
          : ''
      };
    }

    if (config.mode === 'local') {
      return {
        mode: 'local',
        teamId: config.teamId,
        keyId: config.keyId,
        expiresInDays: config.expiresInDays,
        privateKey: this.decrypt(config.encryptedPrivateKey)
      };
    }

    throw new Error('配置模式无法识别。');
  }

  async clear() {
    await fs.rm(this.configPath, { force: true });
  }

  encrypt(value) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储当前不可用。');
    }
    return this.safeStorage.encryptString(value).toString('base64');
  }

  decrypt(value) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储当前不可用，无法读取已有密钥。');
    }
    return this.safeStorage.decryptString(Buffer.from(value, 'base64'));
  }

  async readRaw() {
    try {
      const text = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(text);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('无法读取 Apple Music 配置。');
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

module.exports = { ConnectionConfigStore };
