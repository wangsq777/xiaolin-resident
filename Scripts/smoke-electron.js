const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectDirectory = path.resolve(__dirname, '..');
const captureDirectory = path.join(projectDirectory, 'artifacts');
const capturePath = path.join(captureDirectory, 'electron-ui-smoke.png');
const electronPath = require('electron');
const smokeUserDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaolin-user-data-smoke-'));

fs.mkdirSync(captureDirectory, { recursive: true });

const child = spawn(electronPath, ['.', `--user-data-dir=${smokeUserDataDirectory}`], {
  cwd: projectDirectory,
  env: {
    ...process.env,
    XIAOLIN_SMOKE_CAPTURE: capturePath
  },
  stdio: 'inherit'
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  fs.rmSync(smokeUserDataDirectory, { recursive: true, force: true });
  if (signal) {
    console.error(`Electron smoke test stopped by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code || 0;
});
