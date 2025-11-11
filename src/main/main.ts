import { app, BrowserWindow, ipcMain, Menu, powerMonitor, type MenuItemConstructorOptions } from 'electron';
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
    fullscreenable: true,//
    title: 'Tractivity',
    icon: join(appDir, '../assets/icon.ico'),
    webPreferences: {
      preload: join(appDir, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'Ctrl+,',
          click: () => {
            window.webContents.send('ui:open-settings');
          }
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
