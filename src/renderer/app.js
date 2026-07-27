(function startApplication() {
  const desktop = window.xiaolinDesktop;
  const elements = collectElements();
  let library = { directory: '', tracks: [] };
  let currentTrack = null;
  let playerState = {
    hasTracks: false,
    hasNowPlayingItem: false,
    isPlaying: false
  };
  let careConfig = null;
  let unifiedState = null;

  const player = new window.LocalBgmController({
    onStateChange: handlePlayerState,
    onNowPlayingChange: handleNowPlaying,
    onError: (error) => showToast(normalizeError(error), 'error')
  });

  bindEvents();
  initialize();

  async function initialize() {
    if (!desktop) {
      showToast('请从 Electron 桌宠中打开本页面。', 'error');
      return;
    }

    try {
      // 先加载关怀设置，决定 BGM 是否启用
      careConfig = await desktop.care.get();
      renderCareSettings();

      // 监听 main 广播的统一状态（角色形象 + 提醒）
      desktop.state.onUpdate(handleStateUpdate);

      // BGM 启用时才加载曲目列表
      if (careConfig.bgm.enabled) {
        const snapshot = await desktop.bgm.list();
        await applyLibrarySnapshot(snapshot, { autoPlayIfIdle: true });
      } else {
        // BGM 关闭：不加载列表，直接发布空状态
        publishPetState();
      }
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function bindEvents() {
    // BGM 控件
    elements.openBgmFolderButton?.addEventListener('click', openBgmFolder);
    elements.rescanBgmButton?.addEventListener('click', rescanBgmFolder);
    elements.previousButton?.addEventListener('click', () => runPlayerAction(() => player.previous()));
    elements.playPauseButton?.addEventListener('click', () => runPlayerAction(() => player.togglePlayback()));
    elements.nextButton?.addEventListener('click', () => runPlayerAction(() => player.next()));
    desktop?.pet?.onCommand(handlePetCommand);
    desktop?.bgm?.onChanged(() => refreshAfterFolderChange());

    // 关怀中心：状态切换
    elements.stateSwitcher?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-state]');
      if (!button) return;
      patchCare({ currentState: button.dataset.state });
    });

    // 喝水提醒设置
    elements.drinkEnabled?.addEventListener('change', (event) => {
      patchCare({ reminders: { drink: { enabled: event.target.checked } } });
    });
    elements.drinkInterval?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (value > 0) patchCare({ reminders: { drink: { intervalMinutes: value } } });
    });
    elements.drinkSnooze?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (value > 0) patchCare({ reminders: { drink: { snoozeMinutes: value } } });
    });

    // 安静时段
    elements.quietEnabled?.addEventListener('change', (event) => {
      patchCare({ quietHours: { enabled: event.target.checked } });
    });
    elements.quietStart?.addEventListener('change', (event) => {
      patchCare({ quietHours: { start: event.target.value } });
    });
    elements.quietEnd?.addEventListener('change', (event) => {
      patchCare({ quietHours: { end: event.target.value } });
    });

    // BGM 开关
    elements.bgmEnabled?.addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      await patchCare({ bgm: { enabled } });
      if (enabled) {
        // 刚启用：加载曲目
        try {
          const snapshot = await desktop.bgm.list();
          await applyLibrarySnapshot(snapshot, { autoPlayIfIdle: true });
        } catch (error) {
          showToast(normalizeError(error), 'error');
        }
      } else {
        // 关闭：停止播放
        player.setPlaylist([]);
        renderLibrary();
        publishPetState();
      }
      renderBgmSection();
    });
  }

  // ============ 关怀设置 ============

  async function patchCare(partial) {
    try {
      careConfig = await desktop.care.patch(partial);
      renderCareSettings();
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function renderCareSettings() {
    if (!careConfig) return;

    // 状态切换高亮
    if (elements.stateSwitcher) {
      elements.stateSwitcher.querySelectorAll('[data-state]').forEach((button) => {
        button.classList.toggle('active', button.dataset.state === careConfig.currentState);
      });
    }

    // 喝水提醒
    if (elements.drinkEnabled) elements.drinkEnabled.checked = careConfig.reminders.drink.enabled;
    if (elements.drinkInterval) elements.drinkInterval.value = careConfig.reminders.drink.intervalMinutes;
    if (elements.drinkSnooze) elements.drinkSnooze.value = careConfig.reminders.drink.snoozeMinutes;

    // 安静时段
    if (elements.quietEnabled) elements.quietEnabled.checked = careConfig.quietHours.enabled;
    if (elements.quietStart) elements.quietStart.value = careConfig.quietHours.start;
    if (elements.quietEnd) elements.quietEnd.value = careConfig.quietHours.end;

    // BGM 开关
    if (elements.bgmEnabled) elements.bgmEnabled.checked = careConfig.bgm.enabled;
    renderBgmSection();
  }

  function renderBgmSection() {
    const enabled = careConfig?.bgm?.enabled;
    const bgmSection = elements.bgmSection;
    if (bgmSection) bgmSection.hidden = !enabled;
  }

  // main 广播的统一状态：更新角色舞台形象
  function handleStateUpdate(state) {
    unifiedState = state;
    renderCharacterStage();
  }

  function renderCharacterStage() {
    if (!unifiedState) return;
    const img = elements.chibi?.querySelector('img');
    if (img && unifiedState.character?.imageSrc) {
      if (img.getAttribute('src') !== unifiedState.character.imageSrc) {
        img.setAttribute('src', unifiedState.character.imageSrc);
      }
    }
    // 角色动画状态
    if (elements.chibi) {
      const stateKey = unifiedState.character?.stateKey || 'default';
      elements.chibi.classList.toggle('playing', stateKey === 'working' || stateKey === 'reminder_drink');
      elements.chibi.classList.toggle('idle', !unifiedState.reminder && stateKey !== 'working');
    }
    // 角色台词
    if (elements.characterSpeech) {
      if (unifiedState.reminder) {
        elements.characterSpeech.textContent = unifiedState.reminder.message;
      } else {
        elements.characterSpeech.textContent = unifiedState.statusText || '在这里陪你';
      }
    }
    // 角色形象就绪状态展示
    renderAssetStatus();
  }

  async function renderAssetStatus() {
    if (!elements.assetStatus) return;
    try {
      const assets = await desktop.care.getAssetStatus();
      const labels = {
        'default.png': '默认',
        'working.png': '工作',
        'leisure.png': '休闲',
        'drinking.png': '喝水',
        'stretching.png': '活动',
        'eyes-rest.png': '护眼',
        'sleeping.png': '睡眠',
        'happy.png': '开心'
      };
      elements.assetStatus.innerHTML = assets.map((a) => {
        const label = labels[a.file] || a.file;
        const cls = a.available ? 'asset-ready' : 'asset-missing';
        return `<span class="asset-chip ${cls}" title="${a.file}">${label}${a.available ? '' : '·缺'}</span>`;
      }).join('');
    } catch {
      // 静默失败
    }
  }

  // ============ BGM 播放（保留原逻辑） ============

  async function openBgmFolder() {
    try {
      await desktop.bgm.openFolder();
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  async function rescanBgmFolder() {
    setScanning(true);
    try {
      const snapshot = await desktop.bgm.rescan();
      await applyLibrarySnapshot(snapshot, { autoPlayIfIdle: true });
      showToast(`扫描完成：找到 ${snapshot.tracks.length} 首 BGM。`, 'success');
    } catch (error) {
      showToast(normalizeError(error), 'error');
    } finally {
      setScanning(false);
    }
  }

  async function refreshAfterFolderChange() {
    try {
      const snapshot = await desktop.bgm.list();
      await applyLibrarySnapshot(snapshot, { autoPlayIfIdle: true });
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  async function applyLibrarySnapshot(snapshot, { autoPlayIfIdle }) {
    library = snapshot;
    player.setPlaylist(snapshot.tracks);
    renderLibrary();

    // 仅在 BGM 启用时自动播放
    if (careConfig?.bgm?.enabled && autoPlayIfIdle && snapshot.tracks.length > 0 && !player.currentTrack()) {
      await runPlayerAction(() => player.playIndex(0));
    }
    publishPetState();
  }

  function handlePetCommand(command) {
    if (command === 'previous') runPlayerAction(() => player.previous());
    if (command === 'toggle') runPlayerAction(() => player.togglePlayback());
    if (command === 'next') runPlayerAction(() => player.next());
  }

  async function runPlayerAction(action) {
    try {
      await action();
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function handlePlayerState(nextState) {
    playerState = { ...playerState, ...nextState };
    const controlsEnabled = playerState.hasTracks;
    elements.previousButton.disabled = !controlsEnabled;
    elements.playPauseButton.disabled = !controlsEnabled;
    elements.nextButton.disabled = !controlsEnabled;
    elements.playPauseButton.textContent = playerState.isPlaying ? 'Ⅱ' : '▶';
    elements.playerStatus.textContent = playerState.isPlaying
      ? 'BGM 播放中'
      : playerState.hasNowPlayingItem
        ? '暂停中'
        : playerState.hasTracks
          ? '准备播放'
          : '等待 BGM';
    renderTrackSelection();
    publishPetState();
  }

  function handleNowPlaying(track) {
    currentTrack = track;
    elements.trackTitle.textContent = track?.title || '还没有播放歌曲';
    elements.trackArtist.textContent = track?.artist || '将音频放进项目的 BGM 文件夹';
    renderTrackSelection();
    publishPetState();
  }

  function renderLibrary() {
    const trackCount = library.tracks.length;
    elements.libraryTitle.textContent = trackCount > 0
      ? `已找到 ${trackCount} 首 BGM`
      : '还没有找到 BGM';
    elements.bgmFolderPath.textContent = library.directory;
    elements.libraryBadge.className = `status-badge ${trackCount > 0 ? 'ready' : 'pending'}`;
    elements.libraryBadgeText.textContent = trackCount > 0 ? `${trackCount} 首 BGM` : '等待放歌';
    elements.emptyLibrary.classList.toggle('hidden', trackCount > 0);
    elements.bgmLibrary.replaceChildren();

    const fragment = document.createDocumentFragment();
    library.tracks.forEach((track, index) => {
      fragment.append(createTrackRow(track, index));
    });
    elements.bgmLibrary.append(fragment);
    renderTrackSelection();
  }

  function createTrackRow(track, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'local-track-row';
    button.dataset.trackId = track.id;

    const number = document.createElement('span');
    number.className = 'local-track-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'local-track-copy';
    const title = document.createElement('strong');
    title.textContent = track.title;
    const artist = document.createElement('small');
    artist.textContent = track.artist;
    copy.append(title, artist);

    const icon = document.createElement('span');
    icon.className = 'local-track-play';
    icon.textContent = '▶';
    button.append(number, copy, icon);
    button.addEventListener('click', () => runPlayerAction(() => player.playIndex(index)));
    return button;
  }

  function renderTrackSelection() {
    document.querySelectorAll('.local-track-row').forEach((row) => {
      const selected = row.dataset.trackId === currentTrack?.id;
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-current', selected ? 'true' : 'false');
      const icon = row.querySelector('.local-track-play');
      if (icon) icon.textContent = selected && playerState.isPlaying ? 'Ⅱ' : '▶';
    });
  }

  // 主窗只上报 BGM 部分，关怀部分由 main 统一广播
  function publishPetState() {
    desktop?.pet?.publishState({
      hasTracks: library.tracks.length > 0,
      hasNowPlayingItem: playerState.hasNowPlayingItem,
      isPlaying: playerState.isPlaying,
      title: currentTrack?.title || (library.tracks.length > 0 ? '本地 BGM 已准备好' : 'BGM 文件夹还是空的'),
      artist: currentTrack?.artist || (library.tracks.length > 0 ? `${library.tracks.length} 首歌已就绪` : '右键打开关怀中心')
    });
  }

  function setScanning(scanning) {
    elements.rescanBgmButton.disabled = scanning;
    elements.rescanBgmButton.textContent = scanning ? '扫描中…' : '重新扫描';
  }

  function showToast(message, type = 'info') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    window.setTimeout(() => {
      elements.toast.className = 'toast hidden';
    }, 5000);
  }

  function normalizeError(error) {
    return error?.message?.replace(/^Error invoking remote method '[^']+': Error: /, '')
      || '发生了一个没有礼貌的错误。';
  }

  function collectElements() {
    const ids = [
      // BGM 原有
      'libraryBadge', 'libraryBadgeText', 'musicNotes', 'chibi', 'characterSpeech',
      'playerStatus', 'trackTitle', 'trackArtist', 'previousButton', 'playPauseButton',
      'nextButton', 'libraryTitle', 'bgmFolderPath', 'openBgmFolderButton',
      'rescanBgmButton', 'emptyLibrary', 'bgmLibrary', 'toast',
      // 关怀中心新增
      'careCenter', 'stateSwitcher', 'drinkReminderCard',
      'drinkEnabled', 'drinkInterval', 'drinkSnooze',
      'quietEnabled', 'quietStart', 'quietEnd',
      'bgmEnabled', 'bgmSection', 'assetStatus'
    ];
    return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  }
})();
