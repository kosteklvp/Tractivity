const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tractivityApi', {
  appVersion: () => '0.1.0',
  getSystemIdleTime: () => ipcRenderer.invoke('system:getIdleTime')
});
