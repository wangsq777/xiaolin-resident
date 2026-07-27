(function startPetPlayer() {
  const desktop = window.xiaolinPet;
  const shell = document.getElementById('petShell');
  const status = document.getElementById('petStatus');
  const title = document.getElementById('petTrackTitle');
  const artist = document.getElementById('petTrackArtist');
  const previousButton = document.getElementById('petPreviousButton');
  const playPauseButton = document.getElementById('petPlayPauseButton');
  const nextButton = document.getElementById('petNextButton');
  const songCopy = document.getElementById('songCopy');

  previousButton.addEventListener('click', () => desktop.sendCommand('previous'));
  playPauseButton.addEventListener('click', () => desktop.sendCommand('toggle'));
  nextButton.addEventListener('click', () => desktop.sendCommand('next'));
  songCopy.addEventListener('dblclick', () => desktop.openMain());
  desktop.onState(renderState);

  function renderState(state) {
    const hasTracks = Boolean(state.hasTracks);
    const hasTrack = Boolean(state.hasNowPlayingItem);
    const isPlaying = Boolean(state.isPlaying);
    shell.classList.toggle('playing', isPlaying);
    shell.classList.toggle('paused', hasTrack && !isPlaying);
    shell.classList.toggle('idle', !hasTrack);

    title.textContent = state.title || '还没有播放歌曲';
    artist.textContent = state.artist || '本地 BGM';
    status.textContent = !hasTracks
      ? '等待 BGM'
      : isPlaying
        ? 'BGM 播放中'
        : hasTrack
          ? '暂停中'
          : '准备播放';

    previousButton.disabled = !hasTracks;
    playPauseButton.disabled = !hasTracks;
    nextButton.disabled = !hasTracks;
    playPauseButton.textContent = isPlaying ? 'Ⅱ' : '▶';
  }
})();
