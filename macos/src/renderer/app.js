(function startApplication() {
  const PATROL_STORAGE_KEY = 'xiaolin-social-patrol-v1';
  const PLATFORM_COPY = {
    instagram: {
      label: 'Instagram',
      message: '陪你去 Instagram 巡邏吓。'
    },
    threads: {
      label: 'Threads',
      message: '去 Threads 睇吓我今日講咗啲咩。'
    }
  };

  const desktop = window.xiaolinDesktop;
  const elements = collectElements();
  let careConfig = null;
  let unifiedState = null;
  let patrolHistory = loadPatrolHistory();

  bindEvents();
  initialize();

  async function initialize() {
    if (!desktop) {
      showToast('請喺 Electron 桌寵入面開啟呢個頁面。', 'error');
      return;
    }

    try {
      careConfig = await desktop.care.get();
      unifiedState = await desktop.state.get();
      renderCareSettings();
      renderCharacterStage();
      renderDailyCount();
      renderPatrolHistory();
      desktop.state.onUpdate(handleStateUpdate);
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    document.querySelectorAll('[data-platform]').forEach((button) => {
      button.addEventListener('click', () => openSocialProfile(button.dataset.platform, button));
    });

    elements.stateSwitcher?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-state]');
      if (button) patchCare({ currentState: button.dataset.state });
    });

    elements.chibi?.addEventListener('click', () => requestComfort(elements.chibi));

    bindReminder('drink');
    bindReminder('stretch');
    bindReminder('eyes');

    elements.quietEnabled?.addEventListener('change', (event) => patchCare({ quietHours: { enabled: event.target.checked } }));
    elements.quietStart?.addEventListener('change', (event) => patchCare({ quietHours: { start: event.target.value } }));
    elements.quietEnd?.addEventListener('change', (event) => patchCare({ quietHours: { end: event.target.value } }));
    elements.clickThroughEnabled?.addEventListener('change', async (event) => {
      try {
        careConfig = await desktop.care.setClickThrough(event.target.checked);
      } catch (error) {
        showToast(normalizeError(error), 'error');
      }
    });
  }

  async function openSocialProfile(platform, button) {
    const copy = PLATFORM_COPY[platform];
    if (!copy || !desktop) return;

    button.disabled = true;
    const previousSpeech = elements.characterSpeech?.textContent;
    if (elements.characterSpeech) elements.characterSpeech.textContent = copy.message;

    try {
      const opened = await desktop.social.open(platform);
      if (!opened) throw new Error(`暫時開唔到 ${copy.label} 主頁。`);
      recordPatrol(platform);
      renderPatrolHistory();
      showToast(`已幫你打開林家謙 ${copy.label}。`, 'success');
    } catch (error) {
      if (elements.characterSpeech && previousSpeech) elements.characterSpeech.textContent = previousSpeech;
      showToast(normalizeError(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  function recordPatrol(platform) {
    const now = new Date();
    const today = getLocalDateKey(now);
    patrolHistory = {
      ...patrolHistory,
      [platform]: now.toISOString(),
      countDate: today,
      todayCount: patrolHistory.countDate === today ? patrolHistory.todayCount + 1 : 1
    };
    savePatrolHistory();
  }

  function renderPatrolHistory() {
    const today = getLocalDateKey(new Date());
    if (elements.instagramLastPatrol) elements.instagramLastPatrol.textContent = formatPatrolTime(patrolHistory.instagram);
    if (elements.threadsLastPatrol) elements.threadsLastPatrol.textContent = formatPatrolTime(patrolHistory.threads);
    if (elements.todayPatrolCount) {
      elements.todayPatrolCount.textContent = patrolHistory.countDate === today ? patrolHistory.todayCount : 0;
    }
  }

  function loadPatrolHistory() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(PATROL_STORAGE_KEY));
      return {
        instagram: typeof stored?.instagram === 'string' ? stored.instagram : null,
        threads: typeof stored?.threads === 'string' ? stored.threads : null,
        countDate: typeof stored?.countDate === 'string' ? stored.countDate : null,
        todayCount: Number.isInteger(stored?.todayCount) && stored.todayCount >= 0 ? stored.todayCount : 0
      };
    } catch {
      return { instagram: null, threads: null, countDate: null, todayCount: 0 };
    }
  }

  function savePatrolHistory() {
    try {
      window.localStorage.setItem(PATROL_STORAGE_KEY, JSON.stringify(patrolHistory));
    } catch {
      // 巡逻记录不是关键数据，存储不可用时仍允许打开主页。
    }
  }

  function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatPatrolTime(value) {
    if (!value) return '未巡邏';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未巡邏';

    const sameDay = getLocalDateKey(date) === getLocalDateKey(new Date());
    return new Intl.DateTimeFormat('zh-HK', sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'numeric', day: 'numeric' }).format(date);
  }

  function bindReminder(type) {
    elements[`${type}Enabled`]?.addEventListener('change', (event) => {
      patchCare({ reminders: { [type]: { enabled: event.target.checked } } });
    });
    elements[`${type}Interval`]?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (value > 0) patchCare({ reminders: { [type]: { intervalMinutes: value } } });
    });
    elements[`${type}Snooze`]?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (value > 0) patchCare({ reminders: { [type]: { snoozeMinutes: value } } });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((button) => {
      const active = button.dataset.tab === tabId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });
  }

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
    elements.stateSwitcher?.querySelectorAll('[data-state]').forEach((button) => {
      button.classList.toggle('active', button.dataset.state === careConfig.currentState);
    });

    for (const type of ['drink', 'stretch', 'eyes']) {
      const config = careConfig.reminders[type];
      if (elements[`${type}Enabled`]) elements[`${type}Enabled`].checked = config.enabled;
      if (elements[`${type}Interval`]) elements[`${type}Interval`].value = config.intervalMinutes;
      if (elements[`${type}Snooze`]) elements[`${type}Snooze`].value = config.snoozeMinutes;
    }

    if (elements.quietEnabled) elements.quietEnabled.checked = careConfig.quietHours.enabled;
    if (elements.quietStart) elements.quietStart.value = careConfig.quietHours.start;
    if (elements.quietEnd) elements.quietEnd.value = careConfig.quietHours.end;
    if (elements.clickThroughEnabled) elements.clickThroughEnabled.checked = Boolean(careConfig.clickThrough);
  }

  function handleStateUpdate(state) {
    unifiedState = state;
    renderCharacterStage();
    renderDailyCount();
  }

  function renderDailyCount() {
    const count = unifiedState?.dailyCount;
    if (!count) return;
    if (elements.drinkCount) elements.drinkCount.textContent = count.drink || 0;
    if (elements.stretchCount) elements.stretchCount.textContent = count.stretch || 0;
    if (elements.eyesCount) elements.eyesCount.textContent = count.eyes || 0;
  }

  function renderCharacterStage() {
    if (!unifiedState) return;
    const image = elements.chibi?.querySelector('img');
    if (image && unifiedState.character?.imageSrc && image.getAttribute('src') !== unifiedState.character.imageSrc) {
      image.setAttribute('src', unifiedState.character.imageSrc);
    }
    const stateKey = unifiedState.character?.stateKey || 'default';
    if (elements.chibi) {
      elements.chibi.dataset.state = stateKey;
      if (stateKey === 'sad') {
        elements.chibi.title = '撳一下，我陪你多陣';
        elements.chibi.setAttribute('aria-label', '小林抱住你；撳一下聽另一句安慰');
      } else {
        elements.chibi.removeAttribute('title');
        elements.chibi.setAttribute('aria-label', '像素風小林');
      }
    }
    elements.chibi?.classList.toggle('playing', stateKey === 'working' || stateKey === 'reminder_drink');
    elements.chibi?.classList.toggle('idle', !unifiedState.reminder && stateKey !== 'working');
    if (elements.characterSpeech) {
      elements.characterSpeech.textContent = unifiedState.reminder?.message || unifiedState.statusText || '我喺度陪你';
    }
  }

  async function requestComfort(target) {
    if (unifiedState?.character?.stateKey !== 'sad' || !desktop?.care?.comfortNext) return;
    target.classList.remove('comfort-pulse');
    void target.offsetWidth;
    target.classList.add('comfort-pulse');
    window.setTimeout(() => target.classList.remove('comfort-pulse'), 950);
    try {
      await desktop.care.comfortNext();
    } catch {
      // 安慰互动失败时不打断用户。
    }
  }

  function showToast(message, type = 'info') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { elements.toast.className = 'toast hidden'; }, 5000);
  }

  function normalizeError(error) {
    return error?.message?.replace(/^Error invoking remote method '[^']+': Error: /, '')
      || '發生咗一個唔係幾有禮貌嘅錯誤。';
  }

  function collectElements() {
    const ids = [
      'careCenter', 'chibi', 'characterSpeech', 'instagramLastPatrol', 'threadsLastPatrol', 'todayPatrolCount',
      'openInstagramButton', 'openThreadsButton', 'toast', 'stateSwitcher', 'drinkReminderCard', 'drinkEnabled', 'drinkInterval',
      'drinkSnooze', 'stretchEnabled', 'stretchInterval', 'stretchSnooze', 'eyesEnabled', 'eyesInterval', 'eyesSnooze',
      'quietEnabled', 'quietStart', 'quietEnd', 'clickThroughEnabled', 'drinkCount', 'stretchCount', 'eyesCount'
    ];
    return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  }
})();
