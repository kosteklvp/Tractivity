import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));

ipcMain.handle('system:getIdleTime', () => powerMonitor.getSystemIdleTime());

const createMainWindow = (): void => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    fullscreenable: true,
    title: 'Tractivity',
    icon: join(appDir, '../assets/icon.ico'),
    webPreferences: {
      preload: join(appDir, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setMenu(null);
  window.loadFile(join(appDir, '../renderer/index.html'));
};

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
