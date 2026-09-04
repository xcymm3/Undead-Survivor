const { contextBridge, ipcRenderer } = require('electron');
// 仅暴露指定联机动作；页面不获得通用 IPC、Steam API 或 Node 权限。
contextBridge.exposeInMainWorld('steamCoop', {
  status: () => ipcRenderer.invoke('coop:status'),
  create: name => ipcRenderer.invoke('coop:create', name),
  search: () => ipcRenderer.invoke('coop:search'),
  join: id => ipcRenderer.invoke('coop:join', id),
  leave: () => ipcRenderer.invoke('coop:leave'),
  start: () => ipcRenderer.invoke('coop:start'),
  send: data => ipcRenderer.send('coop:send', data),
  onEvent: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('coop:event', listener); return () => ipcRenderer.removeListener('coop:event', listener); },
});
