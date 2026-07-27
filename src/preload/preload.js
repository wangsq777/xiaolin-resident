const { contextBridge, ipcRenderer } = require('electron');

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
    publishState: (state) => ipcRenderer.send('pet:state', state),
    onCommand: (listener) => {
      const handler = (_event, command) => listener(command);
      ipcRenderer.on('pet:command', handler);
      return () => ipcRenderer.removeListener('pet:command', handler);
    }
  }
});
