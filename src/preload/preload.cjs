const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tractivityApi', {
  appVersion: () => '0.1.0',
  getSystemIdleTime: () => ipcRenderer.invoke('system:getIdleTime'),
  onOpenSettings: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on('ui:open-settings', listener);

    return () => {
      ipcRenderer.removeListener('ui:open-settings', listener);
    };
  },
  todos: {
    list: () => ipcRenderer.invoke('todos:list'),
    create: (title) => ipcRenderer.invoke('todos:create', { title }),
    setCompleted: (id, completed) => ipcRenderer.invoke('todos:setCompleted', { id, completed }),
    delete: (id) => ipcRenderer.invoke('todos:delete', { id })
  }
});
