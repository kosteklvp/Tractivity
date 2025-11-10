import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('tractivityApi', {
  appVersion: () => '0.1.0'
});
