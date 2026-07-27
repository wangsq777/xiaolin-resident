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
      const snapshot = await desktop.bgm.list();
      await applyLibrarySnapshot(snapshot, { autoPlayIfIdle: true });
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function bindEvents() {
    elements.openBgmFolderButton.addEventListener('click', openBgmFolder);
    elements.rescanBgmButton.addEventListener('click', rescanBgmFolder);
    elements.previousButton.addEventListener('click', () => runPlayerAction(() => player.previous()));
    elements.playPauseButton.addEventListener('click', () => runPlayerAction(() => player.togglePlayback()));
    elements.nextButton.addEventListener('click', () => runPlayerAction(() => player.next()));
    desktop?.pet?.onCommand(handlePetCommand);
    desktop?.bgm?.onChanged(() => refreshAfterFolderChange());
  }

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

    if (autoPlayIfIdle && snapshot.tracks.length > 0 && !player.currentTrack()) {
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
    renderCharacterState();
    renderTrackSelection();
    publishPetState();
  }

  function handleNowPlaying(track) {
    currentTrack = track;
    elements.trackTitle.textContent = track?.title || '还没有播放歌曲';
    elements.trackArtist.textContent = track?.artist || '将音频放进项目的 BGM 文件夹';
    renderTrackSelection();
    renderCharacterState();
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
    renderCharacterState();
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

  function renderCharacterState() {
    elements.chibi.classList.toggle('playing', playerState.isPlaying);
    elements.chibi.classList.toggle('paused', playerState.hasNowPlayingItem && !playerState.isPlaying);
    elements.chibi.classList.toggle('idle', !playerState.hasNowPlayingItem);
    elements.musicNotes.classList.toggle('visible', playerState.isPlaying);

    if (playerState.isPlaying) {
      elements.characterSpeech.textContent = `${currentTrack?.title || '这一首'}，这一段我来唱。`;
    } else if (playerState.hasNowPlayingItem) {
      elements.characterSpeech.textContent = '先停在这里。想继续时按一下播放。';
    } else if (library.tracks.length > 0) {
      elements.characterSpeech.textContent = '歌都在了。选一首，或者让我从第一首开始。';
    } else {
      elements.characterSpeech.textContent = '把歌放进 BGM 文件夹，我就有东西唱了。';
    }
  }

  function publishPetState() {
    desktop?.pet?.publishState({
      hasTracks: library.tracks.length > 0,
      hasNowPlayingItem: playerState.hasNowPlayingItem,
      isPlaying: playerState.isPlaying,
      title: currentTrack?.title || (library.tracks.length > 0 ? '本地 BGM 已准备好' : 'BGM 文件夹还是空的'),
      artist: currentTrack?.artist || (library.tracks.length > 0 ? `${library.tracks.length} 首歌已就绪` : '右键打开 BGM 文件夹')
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
      'libraryBadge', 'libraryBadgeText', 'musicNotes', 'chibi', 'characterSpeech',
      'playerStatus', 'trackTitle', 'trackArtist', 'previousButton', 'playPauseButton',
      'nextButton', 'libraryTitle', 'bgmFolderPath', 'openBgmFolderButton',
      'rescanBgmButton', 'emptyLibrary', 'bgmLibrary', 'toast'
    ];
    return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  }
})();
