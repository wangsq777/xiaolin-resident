const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectDirectory = path.resolve(__dirname, '..');
const captureDirectory = path.join(projectDirectory, 'artifacts');
const capturePath = path.join(captureDirectory, 'electron-ui-smoke.png');
const electronPath = require('electron');
const smokeBgmDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaolin-bgm-smoke-'));
const smokeTrackPath = path.join(smokeBgmDirectory, '林家谦 - 本地 BGM 测试.wav');

fs.mkdirSync(captureDirectory, { recursive: true });
fs.writeFileSync(smokeTrackPath, createSilentWave());

const child = spawn(electronPath, ['.'], {
  cwd: projectDirectory,
  env: {
    ...process.env,
    XIAOLIN_SMOKE_CAPTURE: capturePath,
    XIAOLIN_BGM_DIR: smokeBgmDirectory
  },
  stdio: 'inherit'
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  fs.rmSync(smokeBgmDirectory, { recursive: true, force: true });
  if (signal) {
    console.error(`Electron smoke test stopped by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code || 0;
});

function createSilentWave() {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = 1600;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
