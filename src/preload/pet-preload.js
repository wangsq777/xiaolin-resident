const { contextBridge, ipcRenderer } = require('electron');

// pet 窗可用 API：接收状态 + 上报命令/提醒动作 + 打开关怀中心
contextBridge.exposeInMainWorld('xiaolinPet', {
  sendCommand: (command) => ipcRenderer.send('pet:command', command),
  openMain: () => ipcRenderer.send('pet:open-main'),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('pet:state', handler);
    return () => ipcRenderer.removeListener('pet:state', handler);
  },
  // 处理提醒：complete / snooze / skipToday
  reminderAction: ({ type, action }) => ipcRenderer.invoke('care:reminder-action', { type, action }),
  setBgmExpanded: (expanded) => ipcRenderer.send('pet:bgm-expanded', Boolean(expanded))
});
