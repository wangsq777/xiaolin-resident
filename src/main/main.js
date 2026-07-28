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
  nativeImage,
  protocol,
  screen,
  shell,
  Tray
} = require('electron');

const {
  ensureBgmDirectory,
  listBgmTracks,
  resolveBgmTrack
} = require('./bgm-library');
const { CareStore } = require('./care-store');
const { ReminderScheduler } = require('./reminder-scheduler');
const { isQuietNow } = require('./quiet-hours');
const { resolveCharacter, listKnownStateImages } = require('./character-resolver');

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
let tray = null;

// 关怀模块实例（app.whenReady 后初始化）
let careStore;
let scheduler;
let schedulerTimer;

// 当前关怀状态快照（合并角色、提醒、BGM），由 broadcastState 统一发布
let careConfig = null;
let availableAssets = new Set();
let activeReminder = null;     // { type, message, dueAt } | null
let happyUntil = null;          // happy 短暂态的结束时间戳，null 表示非 happy
let lastBgmState = {
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

  // 恢复窗口位置记忆
  const mem = careConfig?.windowMemory || {};
  if (typeof mem.x === 'number' && typeof mem.y === 'number') {
    const displays = screen.getAllDisplays();
    const onScreen = displays.some((d) => {
      return (
        mem.x >= d.workArea.x &&
        mem.x < d.workArea.x + d.workArea.width &&
        mem.y >= d.workArea.y &&
        mem.y < d.workArea.y + d.workArea.height
      );
    });
    if (onScreen) {
      petWindow.setPosition(mem.x, mem.y);
    }
    // 恢复透明度
    if (typeof mem.opacity === 'number') {
      petWindow.setOpacity(mem.opacity);
    }
  }

  // 保存窗口位置
  let moveResizeTimer;
  const saveWindowPosition = () => {
    clearTimeout(moveResizeTimer);
    moveResizeTimer = setTimeout(async () => {
      if (!petWindow || petWindow.isDestroyed()) return;
      const [x, y] = petWindow.getPosition();
      const [width, height] = petWindow.getSize();
      const opacity = petWindow.getOpacity();
      await careStore.patch({
        windowMemory: { x, y, width, height, opacity }
      }).catch(() => {});
    }, 300);
  };
  petWindow.on('move', saveWindowPosition);
  petWindow.on('resize', saveWindowPosition);

  // 恢复鼠标穿透模式
  if (careConfig?.clickThrough) {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pet.html'));
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.webContents.once('did-finish-load', () => broadcastState());

  petWindow.webContents.on('context-menu', () => {
    const template = [
      { label: '打开关怀中心', click: showMainWindow }
    ];
    // BGM 启用时才提供文件夹入口
    if (careConfig?.bgm?.enabled) {
      template.push({ label: '打开 BGM 文件夹', click: openBgmDirectory });
    }
    template.push({ type: 'separator' });
    template.push({ label: '退出小林驻留中', click: () => app.quit() });
    Menu.buildFromTemplate(template).popup({ window: petWindow });
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createTray() {
  // 生成一个 22x22 的托盘图标（使用 nativeImage 从 default.png 缩放）
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'character-states', 'default.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('小林驻留中');

  const updateTrayMenu = () => {
    const clickThroughLabel = careConfig?.clickThrough ? '✓ 鼠标穿透' : '  鼠标穿透';
    const contextMenu = Menu.buildFromTemplate([
      { label: '打开关怀中心', click: showMainWindow },
      { label: '显示桌宠', click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.showInactive();
          petWindow.focus();
        }
      }},
      { type: 'separator' },
      { label: clickThroughLabel, type: 'checkbox', checked: Boolean(careConfig?.clickThrough), click: async (menuItem) => {
        if (petWindow && !petWindow.isDestroyed()) {
          const value = !menuItem.checked;
          petWindow.setIgnoreMouseEvents(value, { forward: true });
          careConfig = await careStore.patch({ clickThrough: value }).catch(() => careConfig);
          menuItem.checked = value;
        }
      }},
      { type: 'separator' },
      { label: '退出小林驻留中', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
  };

  // 点击托盘图标显示/隐藏主窗口
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    }
  });

  // 配置变更时同步更新菜单
  careStore.onChange(() => updateTrayMenu());
  updateTrayMenu();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow({ showOnReady: true });
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function sanitizeBgmState(input = {}) {
  return {
    hasTracks: Boolean(input.hasTracks),
    isPlaying: Boolean(input.isPlaying),
    hasNowPlayingItem: Boolean(input.hasNowPlayingItem),
    title: String(input.title || '还没有播放 BGM').slice(0, 160),
    artist: String(input.artist || '本地 BGM').slice(0, 160)
  };
}

/**
 * 计算当前角色形象 + 提醒 + 状态文字，合并成统一状态契约。
 * BGM 部分由主窗 app.js 通过 pet:state 上报，缓存在 lastBgmState。
 */
function buildUnifiedState() {
  const bgmEnabled = Boolean(careConfig?.bgm?.enabled);
  const bgm = bgmEnabled ? lastBgmState : {
    hasTracks: false,
    isPlaying: false,
    hasNowPlayingItem: false,
    title: '',
    artist: ''
  };

  const quietActive = careConfig?.quietHours?.enabled
    ? isQuietNow({
        start: careConfig.quietHours.start,
        end: careConfig.quietHours.end,
        now: new Date()
      })
    : false;

  // happy 短暂态：超过 happyUntil 则清除
  let happyActive = false;
  if (happyUntil && Date.now() < happyUntil) {
    happyActive = true;
  } else if (happyUntil) {
    happyUntil = null;
  }

  const character = resolveCharacter({
    manualState: careConfig?.currentState || 'leisure',
    reminder: activeReminder?.type || null,
    quietActive,
    happyActive,
    availableAssets
  });

  // 状态文字：有提醒时用提醒文案，否则用角色状态文字
  let statusText = character.statusText;
  if (activeReminder) {
    statusText = activeReminder.message;
  }

  return {
    // BGM 部分（bgmEnabled=false 时全为零值）
    hasTracks: bgm.hasTracks,
    isPlaying: bgm.isPlaying,
    hasNowPlayingItem: bgm.hasNowPlayingItem,
    title: bgm.title,
    artist: bgm.artist,
    bgmEnabled,
    // 关怀部分
    character: {
      stateKey: character.stateKey,
      imageSrc: character.imageSrc,
      fallbackUsed: character.fallbackUsed
    },
    statusText,
    reminder: activeReminder ? {
      type: activeReminder.type,
      message: activeReminder.message,
      actions: ['complete', 'snooze', 'skipToday']
    } : null
  };
}

/**
 * 统一广播状态给主窗和 pet 窗。
 * 主窗（state:update）用于同步角色形象与提醒；pet 窗（pet:state）用于渲染。
 */
function broadcastState() {
  const state = buildUnifiedState();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:state', state);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:update', state);
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

  // 主窗上报 BGM 播放状态（仅 BGM 部分），合并后统一广播
  ipcMain.on('pet:state', (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    lastBgmState = sanitizeBgmState(input);
    broadcastState();
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

  // 关怀设置：读写
  ipcMain.handle('care:get', async () => {
    return careConfig || (await careStore.getAll());
  });
  ipcMain.handle('care:patch', async (_event, partial) => {
    careConfig = await careStore.patch(partial);
    applyCareConfig();
    broadcastState();
    return careConfig;
  });
  ipcMain.handle('care:reset', async () => {
    careConfig = await careStore.reset();
    applyCareConfig();
    broadcastState();
    return careConfig;
  });

  // pet 窗上报提醒动作（complete / snooze / skipToday）
  ipcMain.handle('care:reminder-action', async (_event, { type, action } = {}) => {
    if (!type || !action) return null;
    scheduler.handleAction(type, action);
    // 处理后重新读取调度器状态，并持久化今日跳过／完成记录。
    const snapshot = scheduler.getSnapshot();
    activeReminder = snapshot.activeReminder;
    careConfig = await careStore.patch({
      dailySkip: snapshot.dailySkip,
      dailyCount: snapshot.dailyCount
    });

    // complete 动作触发 happy 短暂态（任务文档 §3 happy：完成提醒后的回应）
    if (action === 'complete') {
      happyUntil = Date.now() + 8000; // 8 秒 happy 态
      setTimeout(() => {
        happyUntil = null;
        broadcastState();
      }, 8000);
    }
    broadcastState();
    return scheduler.getSnapshot();
  });

  // 两窗请求当前状态快照
  ipcMain.handle('state:request', async () => buildUnifiedState());

  // 素材就绪状态（主窗展示用）
  ipcMain.handle('care:asset-status', async () => {
    const known = listKnownStateImages();
    return known.map((file) => ({
      file,
      available: availableAssets.has(file)
    }));
  });

  // 鼠标穿透模式切换
  ipcMain.handle('care:click-through', async (_event, enabled) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const value = Boolean(enabled);
    petWindow.setIgnoreMouseEvents(value, { forward: true });
    careConfig = await careStore.patch({ clickThrough: value });
    return careConfig;
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
        visibleTrackRows: document.querySelectorAll('.local-track-row').length,
        hasCareCenter: Boolean(document.getElementById('careCenter')),
        hasStateSwitcher: Boolean(document.getElementById('stateSwitcher')),
        hasDrinkReminderCard: Boolean(document.getElementById('drinkReminderCard')),
        hasStretchReminderCard: Boolean(document.getElementById('stretchReminderCard')),
        hasEyesReminderCard: Boolean(document.getElementById('eyesReminderCard')),
        hasDailyCount: Boolean(document.getElementById('drinkCount')) && Boolean(document.getElementById('stretchCount')) && Boolean(document.getElementById('eyesCount')),
        hasClickThroughToggle: Boolean(document.getElementById('clickThroughEnabled'))
      };
    })()`);
    const mainImage = await mainWindow.webContents.capturePage();
    await fsPromises.writeFile(capturePath, mainImage.toPNG());

    if (!petWindow || petWindow.isDestroyed()) throw new Error('桌宠 BGM 窗口没有创建。');
    if (petWindow.webContents.isLoading()) {
      await new Promise((resolve) => petWindow.webContents.once('did-finish-load', resolve));
    }

    const manualStateImages = {};
    for (const [stateKey, expectedFile] of [
      ['leisure', 'leisure.png'],
      ['working', 'working.png'],
      ['do_not_disturb', 'do-not-disturb.png']
    ]) {
      careConfig = await careStore.patch({ currentState: stateKey });
      broadcastState();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const actualSrc = await petWindow.webContents.executeJavaScript(
        `document.querySelector('.pet-character img')?.getAttribute('src')`
      );
      manualStateImages[stateKey] = actualSrc;
      if (!actualSrc?.endsWith(expectedFile)) {
        throw new Error(`${stateKey} 状态没有加载 ${expectedFile}，实际为 ${actualSrc}`);
      }
    }

    // 截图保持默认休闲状态。
    careConfig = await careStore.patch({ currentState: 'leisure' });
    // 注入假 BGM 播放态并启用 BGM，用于截图
    careConfig = await careStore.patch({ bgm: { enabled: true } });
    lastBgmState = sanitizeBgmState({
      hasTracks: true,
      isPlaying: true,
      hasNowPlayingItem: true,
      title: '一人之境',
      artist: '林家谦 · 本地 BGM'
    });
    broadcastState();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const petState = await petWindow.webContents.executeJavaScript(`(() => {
      const character = document.querySelector('.pet-character img');
      const controls = [...document.querySelectorAll('.pet-controls button')];
      const reminderBubble = document.getElementById('reminderBubble');
      return {
        petTitle: document.title,
        petCharacterLoaded: Boolean(character?.complete && character.naturalWidth > 0),
        petCharacterSrc: character?.getAttribute('src'),
        petControlsCount: controls.length,
        petControlsEnabled: controls.every((button) => !button.disabled),
        petStatus: document.getElementById('petStatus')?.textContent,
        petAnimation: getComputedStyle(document.getElementById('petCharacter')).animationName,
        reminderBubbleExists: Boolean(reminderBubble),
        bgmControlsVisible: Boolean(document.getElementById('bgmControls') && !document.getElementById('bgmControls').hidden)
      };
    })()`);
    const extension = path.extname(capturePath) || '.png';
    const petCapturePath = path.join(
      path.dirname(capturePath),
      `${path.basename(capturePath, path.extname(capturePath))}-pet${extension}`
    );
    const petImage = await petWindow.webContents.capturePage();
    await fsPromises.writeFile(petCapturePath, petImage.toPNG());

    console.log(`XIAOLIN_SMOKE_RESULT=${JSON.stringify({ ...mainState, ...petState, manualStateImages })}`);
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

  // 初始化关怀模块
  careStore = new CareStore({ userDataPath: app.getPath('userData') });
  careConfig = await careStore.getAll();
  availableAssets = await scanCharacterAssets();

  scheduler = new ReminderScheduler({
    now: () => new Date(),
    onDue: (reminder) => {
      activeReminder = reminder;
      broadcastState();
    }
  });
  applyCareConfig();
  startSchedulerLoop();

  // 设置变更时同步调度器
  careStore.onChange((config) => {
    careConfig = config;
    applyCareConfig();
    broadcastState();
  });

  const tracks = await listBgmTracks(bgmDirectory);
  lastBgmState = sanitizeBgmState({
    hasTracks: tracks.length > 0,
    title: tracks.length > 0 ? '准备播放本地 BGM' : 'BGM 文件夹还是空的',
    artist: tracks.length > 0 ? `${tracks.length} 首歌已就绪` : '右键打开关怀中心'
  });

  createPetWindow();
  createTray();
  // 启动时主窗显隐：BGM 启用且有歌时只显示桌宠小窗（延续 v0.3 体验）；
  // BGM 关闭（默认）或无歌时显示关怀中心，便于用户配置关怀功能。
  const showMainOnReady = careConfig.bgm.enabled
    ? tracks.length === 0
    : true;
  createMainWindow({
    showOnReady: showMainOnReady || Boolean(process.env.XIAOLIN_SMOKE_CAPTURE)
  });
  watchBgmDirectory();

  app.on('activate', () => {
    if (!petWindow || petWindow.isDestroyed()) createPetWindow();
    showMainWindow();
  });
});

/**
 * 扫描角色状态素材目录，返回已就绪的素材文件名集合。
 * 素材缺失不应导致启动失败，所以异常时返回空集合（由 resolver 回退 default）。
 */
async function scanCharacterAssets() {
  const assetsDir = path.join(__dirname, '..', 'renderer', 'assets', 'character-states');
  const found = new Set(['default.png']); // default.png 永远视为可用（即使文件不在，渲染层 onerror 兜底）
  try {
    const entries = await fsPromises.readdir(assetsDir);
    for (const name of entries) {
      if (name.endsWith('.png')) found.add(name);
    }
  } catch {
    // 目录不存在或读取失败：仅保留 default，渲染层 onerror 会兜底
  }
  return found;
}

/**
 * 将当前 careConfig 应用到调度器。
 */
function applyCareConfig() {
  if (!scheduler || !careConfig) return;
  scheduler.setConfig({
    reminders: careConfig.reminders,
    quietHours: careConfig.quietHours,
    dailySkip: careConfig.dailySkip,
    dailyCount: careConfig.dailyCount
  });
}

/**
 * 启动调度循环：每秒 tick 一次。
 */
function startSchedulerLoop() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    const due = scheduler.tick();
    if (due && (!activeReminder || activeReminder.type !== due.type)) {
      activeReminder = due;
      broadcastState();
    }
  }, 1000);
}

app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(bgmChangeTimer);
  clearInterval(schedulerTimer);
  bgmWatcher?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
