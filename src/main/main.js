const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  shell
} = require('electron');

const {
  ensureBgmDirectory,
  listBgmTracks,
  resolveBgmTrack
} = require('./bgm-library');

protocol.registerSchemesAsPrivileged([{
  scheme: 'xiaolin-bgm',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true
  }
}]);

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let petWindow;
let bgmDirectory;
let bgmWatcher;
let bgmChangeTimer;
let isQuitting = false;
let lastPetState = {
  hasTracks: false,
  isPlaying: false,
  hasNowPlayingItem: false,
  title: 'BGM 文件夹还是空的',
  artist: '右键打开主页面查看说明'
};

function createMainWindow({ showOnReady = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 940,
    height: 760,
    minWidth: 820,
    minHeight: 680,
    title: '小林驻留中 · BGM 管理',
    backgroundColor: '#11131d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (showOnReady) mainWindow.show();
  });
  mainWindow.webContents.once('did-finish-load', runSmokeCaptureIfRequested);

  mainWindow.on('close', (event) => {
    if (isQuitting || !petWindow || petWindow.isDestroyed()) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 500,
    height: 210,
    minWidth: 500,
    minHeight: 210,
    maxWidth: 500,
    maxHeight: 210,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: '小林驻留中 · 桌宠 BGM',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pet.html'));
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.webContents.once('did-finish-load', () => sendPetState(lastPetState));

  petWindow.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: '打开 BGM 管理页', click: showMainWindow },
      { label: '打开 BGM 文件夹', click: openBgmDirectory },
      { type: 'separator' },
      { label: '退出小林驻留中', click: () => app.quit() }
    ]).popup({ window: petWindow });
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow({ showOnReady: true });
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function sanitizePetState(input = {}) {
  return {
    hasTracks: Boolean(input.hasTracks),
    isPlaying: Boolean(input.isPlaying),
    hasNowPlayingItem: Boolean(input.hasNowPlayingItem),
    title: String(input.title || '还没有播放 BGM').slice(0, 160),
    artist: String(input.artist || '本地 BGM').slice(0, 160)
  };
}

function sendPetState(input) {
  lastPetState = sanitizePetState(input);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:state', lastPetState);
  }
}

function resolveBgmDirectory() {
  if (process.env.XIAOLIN_BGM_DIR) return path.resolve(process.env.XIAOLIN_BGM_DIR);
  if (app.isPackaged) return path.join(app.getPath('music'), '小林驻留中 BGM');
  return path.join(app.getAppPath(), 'BGM');
}

async function getLibrarySnapshot() {
  const tracks = await listBgmTracks(bgmDirectory);
  return {
    directory: bgmDirectory,
    tracks
  };
}

async function openBgmDirectory() {
  await ensureBgmDirectory(bgmDirectory);
  const error = await shell.openPath(bgmDirectory);
  if (error) throw new Error(`无法打开 BGM 文件夹：${error}`);
}

function registerBgmProtocol() {
  protocol.handle('xiaolin-bgm', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'track') return new Response('Not found', { status: 404 });
      const filePath = resolveBgmTrack(bgmDirectory, url.pathname.slice(1));
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('BGM not found', { status: 404 });
    }
  });
}

function registerIpcHandlers() {
  ipcMain.handle('bgm:list', () => getLibrarySnapshot());
  ipcMain.handle('bgm:rescan', async () => {
    return getLibrarySnapshot();
  });
  ipcMain.handle('bgm:open-folder', () => openBgmDirectory());

  ipcMain.on('pet:state', (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    sendPetState(input);
  });

  ipcMain.on('pet:command', (event, command) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    if (!['previous', 'toggle', 'next'].includes(command)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pet:command', command);
    }
  });

  ipcMain.on('pet:open-main', (event) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    showMainWindow();
  });
}

function watchBgmDirectory() {
  try {
    bgmWatcher = fs.watch(bgmDirectory, { persistent: false }, () => {
      clearTimeout(bgmChangeTimer);
      bgmChangeTimer = setTimeout(notifyBgmChanged, 350);
    });
  } catch {
    bgmWatcher = null;
  }
}

function notifyBgmChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bgm:changed');
  }
}

async function runSmokeCaptureIfRequested() {
  const capturePath = process.env.XIAOLIN_SMOKE_CAPTURE;
  if (!capturePath) return;

  try {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await fsPromises.mkdir(path.dirname(capturePath), { recursive: true });

    const mainState = await mainWindow.webContents.executeJavaScript(`(() => {
      const character = document.querySelector('.pixel-chibi img');
      return {
        title: document.title,
        isLocalBgmPage: Boolean(document.getElementById('bgmLibrary')),
        hasOpenFolderButton: Boolean(document.getElementById('openBgmFolderButton')),
        hasRescanButton: Boolean(document.getElementById('rescanBgmButton')),
        pixelChibiLoaded: Boolean(character?.complete && character.naturalWidth > 0),
        visibleTrackRows: document.querySelectorAll('.local-track-row').length
      };
    })()`);
    const mainImage = await mainWindow.webContents.capturePage();
    await fsPromises.writeFile(capturePath, mainImage.toPNG());

    if (!petWindow || petWindow.isDestroyed()) throw new Error('桌宠 BGM 窗口没有创建。');
    if (petWindow.webContents.isLoading()) {
      await new Promise((resolve) => petWindow.webContents.once('did-finish-load', resolve));
    }
    sendPetState({
      hasTracks: true,
      isPlaying: true,
      hasNowPlayingItem: true,
      title: '一人之境',
      artist: '林家谦 · 本地 BGM'
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const petState = await petWindow.webContents.executeJavaScript(`(() => {
      const character = document.querySelector('.pet-character img');
      const controls = [...document.querySelectorAll('.pet-controls button')];
      return {
        petTitle: document.title,
        petCharacterLoaded: Boolean(character?.complete && character.naturalWidth > 0),
        petControlsCount: controls.length,
        petControlsEnabled: controls.every((button) => !button.disabled),
        petStatus: document.getElementById('petStatus')?.textContent,
        petAnimation: getComputedStyle(document.getElementById('petCharacter')).animationName
      };
    })()`);
    const extension = path.extname(capturePath) || '.png';
    const petCapturePath = path.join(
      path.dirname(capturePath),
      `${path.basename(capturePath, path.extname(capturePath))}-pet${extension}`
    );
    const petImage = await petWindow.webContents.capturePage();
    await fsPromises.writeFile(petCapturePath, petImage.toPNG());

    console.log(`XIAOLIN_SMOKE_RESULT=${JSON.stringify({ ...mainState, ...petState })}`);
    console.log(`XIAOLIN_SMOKE_MAIN_CAPTURE=${capturePath}`);
    console.log(`XIAOLIN_SMOKE_PET_CAPTURE=${petCapturePath}`);
  } catch (error) {
    console.error(`XIAOLIN_SMOKE_ERROR=${error.message}`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}

app.whenReady().then(async () => {
  bgmDirectory = resolveBgmDirectory();
  await ensureBgmDirectory(bgmDirectory);
  registerBgmProtocol();
  registerIpcHandlers();

  const tracks = await listBgmTracks(bgmDirectory);
  lastPetState = sanitizePetState({
    hasTracks: tracks.length > 0,
    title: tracks.length > 0 ? '准备播放本地 BGM' : 'BGM 文件夹还是空的',
    artist: tracks.length > 0 ? `${tracks.length} 首歌已就绪` : '右键打开 BGM 文件夹'
  });

  createPetWindow();
  createMainWindow({
    showOnReady: tracks.length === 0 || Boolean(process.env.XIAOLIN_SMOKE_CAPTURE)
  });
  watchBgmDirectory();

  app.on('activate', () => {
    if (!petWindow || petWindow.isDestroyed()) createPetWindow();
    showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(bgmChangeTimer);
  bgmWatcher?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
