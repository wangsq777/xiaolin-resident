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
  const bgmControls = document.getElementById('bgmControls');
  const character = document.querySelector('.pet-character img');
  const characterBox = document.getElementById('petCharacter');
  const reminderBubble = document.getElementById('reminderBubble');
  const reminderMessage = document.getElementById('reminderMessage');
  const reminderComplete = document.getElementById('reminderComplete');
  const reminderSnooze = document.getElementById('reminderSnooze');
  const reminderSkip = document.getElementById('reminderSkip');

  let currentReminder = null;

  // BGM 控制按钮（BGM 启用时才可用）
  previousButton.addEventListener('click', () => desktop.sendCommand('previous'));
  playPauseButton.addEventListener('click', () => desktop.sendCommand('toggle'));
  nextButton.addEventListener('click', () => desktop.sendCommand('next'));
  songCopy.addEventListener('dblclick', () => desktop.openMain());

  // 提醒动作
  reminderComplete.addEventListener('click', () => handleReminderAction('complete'));
  reminderSnooze.addEventListener('click', () => handleReminderAction('snooze'));
  reminderSkip.addEventListener('click', () => handleReminderAction('skipToday'));

  async function handleReminderAction(action) {
    if (!currentReminder) return;
    await desktop.reminderAction({ type: currentReminder.type, action });
    // 处理后立即收起气泡（main 会广播新状态，但先本地收起避免闪烁）
    hideReminder();
  }

  desktop.onState(renderState);

  function renderState(state) {
    // 角色形象：切换 img src（onerror 兜底回 default）
    const imageSrc = state?.character?.imageSrc || './assets/character-states/default.png';
    if (character.getAttribute('src') !== imageSrc) {
      character.setAttribute('src', imageSrc);
    }
    // 角色动画：working 用 pet-sing，sleeping 用慢呼吸
    const stateKey = state?.character?.stateKey || 'default';
    shell.classList.toggle('working', stateKey === 'working' || stateKey === 'reminder_drink');
    shell.classList.toggle('sleeping', stateKey === 'sleeping');

    // 状态文字
    status.textContent = state?.statusText || '在这里陪你';

    // BGM 控件显隐：bgmEnabled=false 时完全隐藏
    const bgmEnabled = Boolean(state?.bgmEnabled);
    bgmControls.hidden = !bgmEnabled;

    if (bgmEnabled) {
      const hasTracks = Boolean(state.hasTracks);
      const hasTrack = Boolean(state.hasNowPlayingItem);
      const isPlaying = Boolean(state.isPlaying);
      shell.classList.toggle('playing', isPlaying);
      shell.classList.toggle('paused', hasTrack && !isPlaying);
      shell.classList.toggle('idle', !hasTrack);

      title.textContent = state.title || '还没有播放歌曲';
      artist.textContent = state.artist || '本地 BGM';
      previousButton.disabled = !hasTracks;
      playPauseButton.disabled = !hasTracks;
      nextButton.disabled = !hasTracks;
      playPauseButton.textContent = isPlaying ? 'Ⅱ' : '▶';
    } else {
      // BGM 关闭：标题区显示角色状态文字与状态名
      shell.classList.remove('playing', 'paused');
      shell.classList.toggle('idle', true);
      title.textContent = '小林驻留中';
      artist.textContent = stateKey === 'do_not_disturb' ? '安静时段' : '右键打开关怀中心';
    }

    // 提醒气泡
    if (state?.reminder) {
      showReminder(state.reminder);
    } else {
      hideReminder();
    }
  }

  function showReminder(reminder) {
    currentReminder = reminder;
    reminderMessage.textContent = reminder.message || '该休息一下了';
    reminderBubble.hidden = false;
    // 提醒出现时收起 BGM 控件区，腾出空间（处理后再恢复）
    bgmControls.hidden = true;
  }

  function hideReminder() {
    currentReminder = null;
    reminderBubble.hidden = true;
  }

  // 角色图加载失败兜底：回退到 default.png，绝不留空白
  character.addEventListener('error', () => {
    const fallback = './assets/character-states/default.png';
    if (character.getAttribute('src') !== fallback) {
      character.setAttribute('src', fallback);
    }
  });
})();
