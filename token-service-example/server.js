const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { createDeveloperToken } = require('../src/main/token-provider');

const host = process.env.TOKEN_HOST || '127.0.0.1';
const port = Number(process.env.TOKEN_PORT || 8787);
const serviceSecret = process.env.TOKEN_SERVICE_SECRET || '';

function loadPrivateKey() {
  if (process.env.APPLE_MUSIC_PRIVATE_KEY) {
    return process.env.APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (process.env.APPLE_MUSIC_PRIVATE_KEY_PATH) {
    return fs.readFileSync(path.resolve(process.env.APPLE_MUSIC_PRIVATE_KEY_PATH), 'utf8');
  }

  throw new Error('请配置 APPLE_MUSIC_PRIVATE_KEY 或 APPLE_MUSIC_PRIVATE_KEY_PATH。');
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/token') {
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  if (serviceSecret && request.headers.authorization !== `Bearer ${serviceSecret}`) {
    response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  try {
    const result = createDeveloperToken({
      teamId: process.env.APPLE_MUSIC_TEAM_ID,
      keyId: process.env.APPLE_MUSIC_KEY_ID,
      privateKey: loadPrivateKey(),
      expiresInDays: Number(process.env.APPLE_MUSIC_TOKEN_DAYS || 30)
    });

    response.writeHead(200, {
      'Cache-Control': 'private, max-age=300',
      'Content-Type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify({ developerToken: result.token }));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'token_generation_failed', message: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`Apple Music token service listening on http://${host}:${port}/token`);
});
