(function startPetPlayer() {
  const desktop = window.xiaolinPet;
  const shell = document.getElementById('petShell');
  const status = document.getElementById('petStatus');
  const characterBox = document.getElementById('petCharacter');
  const character = characterBox.querySelector('img');
  const reminderBubble = document.getElementById('reminderBubble');
  const reminderMessage = document.getElementById('reminderMessage');
  const reminderComplete = document.getElementById('reminderComplete');
  const reminderSnooze = document.getElementById('reminderSnooze');
  const reminderSkip = document.getElementById('reminderSkip');

  let currentReminder = null;
  characterBox.addEventListener('dblclick', () => desktop.openMain());

  reminderComplete.addEventListener('click', () => handleReminderAction('complete'));
  reminderSnooze.addEventListener('click', () => handleReminderAction('snooze'));
  reminderSkip.addEventListener('click', () => handleReminderAction('skipToday'));

  async function handleReminderAction(action) {
    if (!currentReminder) return;
    const reminder = currentReminder;
    currentReminder = null;
    reminderBubble.hidden = true;
    await desktop.reminderAction({ type: reminder.type, action });
  }

  desktop.onState(renderState);

  function renderState(state) {
    const imageSrc = state?.character?.imageSrc || './assets/character-states/default.png';
    const stateKey = state?.character?.stateKey || 'leisure';
    const layout = state?.petLayout || 'daily';
    const reminder = state?.reminder || null;

    if (character.getAttribute('src') !== imageSrc) {
      character.setAttribute('src', imageSrc);
    }

    shell.dataset.layout = layout;
    shell.dataset.state = stateKey;
    shell.classList.toggle('working', stateKey === 'working' || stateKey === 'reminder_drink');
    shell.classList.toggle('sleeping', stateKey === 'sleeping');
    shell.classList.toggle('playing', Boolean(state?.isPlaying));
    shell.classList.toggle('paused', Boolean(state?.hasNowPlayingItem && !state?.isPlaying));
    status.textContent = state?.statusText || '我喺度陪你';

    if (reminder) {
      showReminder(reminder);
    } else {
      hideReminder();
    }
  }

  function showReminder(reminder) {
    currentReminder = reminder;
    reminderMessage.textContent = reminder.message || '係時候抖一抖喇';
    reminderComplete.textContent = getCompleteLabel(reminder.type);
    reminderBubble.hidden = false;
  }

  function getCompleteLabel(type) {
    if (type === 'stretch') return '我起身喇！';
    if (type === 'eyes') return '望過遠處喇';
    return '飲過喇';
  }

  function hideReminder() {
    currentReminder = null;
    reminderBubble.hidden = true;
  }

  character.addEventListener('error', () => {
    const fallback = './assets/character-states/default.png';
    if (character.getAttribute('src') !== fallback) {
      character.setAttribute('src', fallback);
    }
  });
})();
