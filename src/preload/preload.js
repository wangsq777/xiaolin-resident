const { contextBridge, ipcRenderer } = require('electron');

// 主窗（关怀中心）可用 API：BGM 控制 + 关怀设置 + 状态同步
contextBridge.exposeInMainWorld('xiaolinDesktop', {
  bgm: {
    list: () => ipcRenderer.invoke('bgm:list'),
    rescan: () => ipcRenderer.invoke('bgm:rescan'),
    openFolder: () => ipcRenderer.invoke('bgm:open-folder'),
    onChanged: (listener) => {
      const handler = () => listener();
      ipcRenderer.on('bgm:changed', handler);
      return () => ipcRenderer.removeListener('bgm:changed', handler);
    }
  },
  pet: {
    // 主窗上报 BGM 播放状态（仅 BGM 部分，关怀部分由 main 统一广播）
    publishState: (state) => ipcRenderer.send('pet:state', state),
    onCommand: (listener) => {
      const handler = (_event, command) => listener(command);
      ipcRenderer.on('pet:command', handler);
      return () => ipcRenderer.removeListener('pet:command', handler);
    }
  },
  care: {
    get: () => ipcRenderer.invoke('care:get'),
    patch: (partial) => ipcRenderer.invoke('care:patch', partial),
    reset: () => ipcRenderer.invoke('care:reset'),
    getAssetStatus: () => ipcRenderer.invoke('care:asset-status'),
    setClickThrough: (enabled) => ipcRenderer.invoke('care:click-through', enabled)
  },
  state: {
    get: () => ipcRenderer.invoke('state:request'),
    onUpdate: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('state:update', handler);
      return () => ipcRenderer.removeListener('state:update', handler);
    }
  }
});
