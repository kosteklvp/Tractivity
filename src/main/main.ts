import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));

const createMainWindow = (): void => {
  const window = new BrowserWindow({
    width: 360,
    height: 220,
    resizable: false,
    title: 'Tractivity',
    webPreferences: {
      preload: join(appDir, '../preload/preload.js'),
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
