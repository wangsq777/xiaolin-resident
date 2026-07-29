(function startApplication() {
  const desktop = window.xiaolinDesktop;
  const elements = collectElements();
  let careConfig = null;
  let unifiedState = null;
  let materialSnapshot = { items: [], lastCheckedAt: null, sourceStatuses: [] };
  let activeFilter = 'all';

  bindEvents();
  initialize();

  async function initialize() {
    if (!desktop) {
      showToast('請喺 Electron 桌寵入面開啟呢個頁面。', 'error');
      return;
    }

    try {
      careConfig = await desktop.care.get();
      renderCareSettings();
      desktop.state.onUpdate(handleStateUpdate);
      materialSnapshot = await desktop.materials.get();
      renderMaterials();
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
  }

  function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    elements.quickRefreshMaterials?.addEventListener('click', () => refreshMaterials());
    elements.refreshMaterialsButton?.addEventListener('click', () => refreshMaterials());
    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((chip) => chip.classList.toggle('active', chip === button));
        renderMaterialList();
      });
    });
    elements.materialList?.addEventListener('click', handleMaterialAction);

    elements.stateSwitcher?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-state]');
      if (button) patchCare({ currentState: button.dataset.state });
    });

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

  async function refreshMaterials() {
    setRefreshing(true);
    try {
      materialSnapshot = await desktop.materials.refresh();
      renderMaterials();
      showToast('檢查完成，物料雷達已更新。', 'success');
    } catch (error) {
      showToast(normalizeError(error), 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleMaterialAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const item = materialSnapshot.items.find((entry) => entry.id === button.closest('[data-item-id]')?.dataset.itemId);
    if (!item) return;

    try {
      if (button.dataset.action === 'save') {
        materialSnapshot = await desktop.materials.toggleSaved(item.id);
        renderMaterials();
        return;
      }
      if (button.dataset.action === 'read') {
        materialSnapshot = await desktop.materials.markRead(item.id);
        renderMaterials();
        return;
      }
      if (button.dataset.action === 'open') {
        await desktop.materials.open(item.url);
        if (!item.read) {
          materialSnapshot = await desktop.materials.markRead(item.id);
          renderMaterials();
        }
      }
    } catch (error) {
      showToast(normalizeError(error), 'error');
    }
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
    elements.chibi?.classList.toggle('playing', stateKey === 'working' || stateKey === 'reminder_drink');
    elements.chibi?.classList.toggle('idle', !unifiedState.reminder && stateKey !== 'working');
    if (elements.characterSpeech) {
      elements.characterSpeech.textContent = unifiedState.reminder?.message || unifiedState.statusText || '我喺度陪你';
    }
    renderAssetStatus();
  }

  async function renderAssetStatus() {
    if (!elements.assetStatus) return;
    try {
      const assets = await desktop.care.getAssetStatus();
      const labels = {
        'default.png': '預設', 'do-not-disturb.png': '唔好打擾', 'working.png': '工作',
        'leisure.png': '休閒', 'drinking.png': '飲水', 'stretching.png': '郁身',
        'eyes-rest.png': '護眼', 'sleeping.png': '瞓覺', 'happy.png': '開心'
      };
      elements.assetStatus.innerHTML = assets.map((asset) => {
        const label = labels[asset.file] || asset.file;
        return `<span class="asset-chip ${asset.available ? 'asset-ready' : 'asset-missing'}" title="${asset.file}">${label}${asset.available ? '' : '·缺'}</span>`;
      }).join('');
    } catch {
      // 素材状态不是主流程，读取失败时保持安静。
    }
  }

  function renderMaterials() {
    const items = materialSnapshot.items || [];
    const unread = items.filter((item) => !item.read).length;
    const saved = items.filter((item) => item.saved).length;
    elements.unreadCount.textContent = unread;
    elements.savedCount.textContent = saved;
    elements.lastChecked.textContent = formatCheckTime(materialSnapshot.lastCheckedAt);
    elements.materialBadge.className = `status-badge ${unread > 0 ? 'ready' : 'pending'}`;
    elements.materialBadgeText.textContent = unread > 0 ? `${unread} 件未讀物料` : '今日已睇晒';
    elements.feedMeta.textContent = `${items.length} 件公開資料 · ${unread} 件未讀`;
    renderSourceStatuses();
    renderMaterialList();
  }

  function renderSourceStatuses() {
    elements.sourceStatusList.replaceChildren();
    const fragment = document.createDocumentFragment();
    (materialSnapshot.sourceStatuses || []).forEach((source) => {
      const row = document.createElement('div');
      row.className = 'source-status-row';
      const dot = document.createElement('span');
      dot.className = `source-dot ${source.status}`;
      const label = document.createElement('strong');
      label.textContent = source.label;
      const detail = document.createElement('small');
      detail.textContent = source.detail;
      const status = document.createElement('span');
      status.className = `source-status-label ${source.status}`;
      status.textContent = source.status === 'ready' ? '已連線' : source.status === 'error' ? '需留意' : '待接入';
      row.append(dot, label, detail, status);
      fragment.append(row);
    });
    elements.sourceStatusList.append(fragment);
  }

  function renderMaterialList() {
    const visibleItems = (materialSnapshot.items || []).filter(matchesFilter);
    elements.materialList.replaceChildren();
    elements.emptyMaterials.hidden = visibleItems.length > 0;
    const fragment = document.createDocumentFragment();
    visibleItems.forEach((item) => fragment.append(createMaterialCard(item)));
    elements.materialList.append(fragment);
  }

  function matchesFilter(item) {
    if (activeFilter === 'unread') return !item.read;
    if (activeFilter === 'saved') return item.saved;
    if (['合作', '活動', '物料'].includes(activeFilter)) return item.type === activeFilter;
    return true;
  }

  function createMaterialCard(item) {
    const article = document.createElement('article');
    article.className = `material-item ${item.read ? 'read' : 'unread'} accent-${item.accent || 'lilac'}`;
    article.dataset.itemId = item.id;

    const visual = document.createElement('div');
    visual.className = 'material-visual';
    visual.innerHTML = `<span>${getTypeMark(item.type)}</span><small>${item.type}</small>`;

    const content = document.createElement('div');
    content.className = 'material-item-content';
    const top = document.createElement('div');
    top.className = 'material-item-top';
    const meta = document.createElement('span');
    meta.className = 'material-type';
    meta.textContent = item.type;
    const official = document.createElement('span');
    official.className = 'official-badge';
    official.textContent = item.official ? '官方來源' : '待確認';
    top.append(meta, official);

    const title = document.createElement('h3');
    title.textContent = item.title;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    const footer = document.createElement('div');
    footer.className = 'material-item-footer';
    const source = document.createElement('span');
    source.textContent = `${item.source} · ${formatPublishedAt(item.publishedAt)}`;
    const actions = document.createElement('div');
    actions.className = 'material-item-actions';

    const readButton = document.createElement('button');
    readButton.type = 'button';
    readButton.className = 'material-read-action';
    readButton.dataset.action = 'read';
    readButton.textContent = item.read ? '已讀' : '標記已讀';
    readButton.disabled = item.read;

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = `material-save-button ${item.saved ? 'saved' : ''}`;
    saveButton.dataset.action = 'save';
    saveButton.setAttribute('aria-label', item.saved ? '取消收藏' : '收藏物料');
    saveButton.textContent = item.saved ? '★' : '☆';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'material-open-button';
    openButton.dataset.action = 'open';
    openButton.textContent = '查看來源 ↗';
    actions.append(readButton, saveButton, openButton);
    footer.append(source, actions);
    content.append(top, title, summary, footer);
    article.append(visual, content);
    return article;
  }

  function getTypeMark(type) {
    return ({ 合作: '✦', 活動: '◌', 物料: '▧', 資訊: 'i' })[type] || '✦';
  }

  function setRefreshing(refreshing) {
    elements.refreshMaterialsButton.disabled = refreshing;
    elements.quickRefreshMaterials.disabled = refreshing;
    elements.refreshMaterialsButton.textContent = refreshing ? '檢查緊…' : '立即檢查';
  }

  function formatCheckTime(value) {
    if (!value) return '未檢查';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未檢查';
    return new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatPublishedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '剛剛';
    return new Intl.DateTimeFormat('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
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
      'careCenter', 'materialBadge', 'materialBadgeText', 'quickRefreshMaterials', 'chibi', 'characterSpeech', 'assetStatus',
      'unreadCount', 'savedCount', 'lastChecked', 'sourceStatusList', 'feedMeta', 'refreshMaterialsButton', 'materialList', 'emptyMaterials', 'toast',
      'stateSwitcher', 'drinkReminderCard', 'drinkEnabled', 'drinkInterval', 'drinkSnooze', 'stretchEnabled', 'stretchInterval', 'stretchSnooze',
      'eyesEnabled', 'eyesInterval', 'eyesSnooze', 'quietEnabled', 'quietStart', 'quietEnd', 'clickThroughEnabled',
      'drinkCount', 'stretchCount', 'eyesCount'
    ];
    return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  }
})();
