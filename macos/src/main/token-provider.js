const crypto = require('node:crypto');

const MAX_EXPIRY_DAYS = 180;

function toBase64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64url');
}

function parseDeveloperToken(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Developer Token 不是有效的 JWT。');
  }

  const [encodedHeader, encodedPayload] = token.split('.');
  let header;
  let payload;

  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('无法读取 Developer Token 的内容。');
  }

  if (header.alg !== 'ES256') {
    throw new Error('Developer Token 必须使用 ES256 算法。');
  }

  if (!header.kid || !payload.iss || !payload.iat || !payload.exp) {
    throw new Error('Developer Token 缺少 kid、iss、iat 或 exp。');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('Developer Token 已过期。');
  }

  return {
    algorithm: header.alg,
    keyId: header.kid,
    issuer: payload.iss,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    daysRemaining: Math.max(0, Math.ceil((payload.exp - now) / 86400)),
    origins: Array.isArray(payload.origin) ? payload.origin : []
  };
}

function createDeveloperToken({ teamId, keyId, privateKey, expiresInDays = 30 }) {
  const normalizedTeamId = String(teamId || '').trim().toUpperCase();
  const normalizedKeyId = String(keyId || '').trim().toUpperCase();
  const days = Number(expiresInDays);

  if (!/^[A-Z0-9]{10}$/.test(normalizedTeamId)) {
    throw new Error('Team ID 应为 10 位大写字母或数字。');
  }

  if (!/^[A-Z0-9]{10}$/.test(normalizedKeyId)) {
    throw new Error('Key ID 应为 10 位大写字母或数字。');
  }

  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
    throw new Error(`Token 有效期必须在 1—${MAX_EXPIRY_DAYS} 天之间。`);
  }

  if (!isValidPrivateKey(privateKey)) {
    throw new Error('所选文件不是有效的 MusicKit .p8 私钥。');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: normalizedKeyId };
  const payload = {
    iss: normalizedTeamId,
    iat: now - 30,
    exp: now + days * 86400
  };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;

  let signature;
  try {
    signature = crypto.sign('sha256', Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    });
  } catch {
    throw new Error('私钥无法签署 ES256 Token，请确认它来自 Apple Developer。');
  }

  const token = `${signingInput}.${toBase64Url(signature)}`;
  return { token, summary: parseDeveloperToken(token) };
}

function isValidPrivateKey(value) {
  if (typeof value !== 'string') return false;
  if (!value.includes('-----BEGIN PRIVATE KEY-----')) return false;
  if (!value.includes('-----END PRIVATE KEY-----')) return false;

  try {
    const key = crypto.createPrivateKey(value);
    return key.asymmetricKeyType === 'ec';
  } catch {
    return false;
  }
}

function validateTokenServiceUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('请输入完整的令牌服务 URL。');
  }

  if (url.username || url.password) {
    throw new Error('请不要把账号或密码直接写在 URL 中。');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(isLocalhost && url.protocol === 'http:')) {
    throw new Error('令牌服务必须使用 HTTPS；本地调试仅允许 localhost 的 HTTP。');
  }

  return url.toString();
}

async function fetchDeveloperToken({ endpoint, authSecret, fetchImpl = fetch }) {
  const safeEndpoint = validateTokenServiceUrl(endpoint);
  const headers = { Accept: 'application/json' };
  if (authSecret) headers.Authorization = `Bearer ${authSecret}`;

  const response = await fetchImpl(safeEndpoint, {
    method: 'GET',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`令牌服务返回 HTTP ${response.status}。`);
  }

  const body = await response.json();
  const token = body.developerToken || body.token;
  const summary = parseDeveloperToken(token);
  return { token, summary };
}

module.exports = {
  MAX_EXPIRY_DAYS,
  createDeveloperToken,
  fetchDeveloperToken,
  isValidPrivateKey,
  parseDeveloperToken,
  validateTokenServiceUrl
};
