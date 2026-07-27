const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xiaolinPet', {
  sendCommand: (command) => ipcRenderer.send('pet:command', command),
  openMain: () => ipcRenderer.send('pet:open-main'),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('pet:state', handler);
    return () => ipcRenderer.removeListener('pet:state', handler);
  }
});
