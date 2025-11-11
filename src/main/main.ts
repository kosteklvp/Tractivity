import { app, BrowserWindow, ipcMain, Menu, powerMonitor, type MenuItemConstructorOptions } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createTodo,
    deleteTodo,
    initializeTodoStore,
    listTodos,
    setTodoCompleted
} from './todoStore.js';

const appDir = dirname(fileURLToPath(import.meta.url));

ipcMain.handle('system:getIdleTime', () => powerMonitor.getSystemIdleTime());

ipcMain.handle('todos:list', () => listTodos());

ipcMain.handle('todos:create', (_event, payload: { title: string }) => {
  if (!payload || typeof payload.title !== 'string') {
    throw new Error('Missing todo title.');
  }

  return createTodo(payload.title);
});

ipcMain.handle('todos:setCompleted', (_event, payload: { id: number; completed: boolean }) => {
  if (!payload || typeof payload.id !== 'number' || typeof payload.completed !== 'boolean') {
    throw new Error('Invalid todo update payload.');
  }

  const updated = setTodoCompleted(payload.id, payload.completed);

  if (!updated) {
    throw new Error('Todo item not found.');
  }

  return updated;
});

ipcMain.handle('todos:delete', (_event, payload: { id: number }) => {
  if (!payload || typeof payload.id !== 'number') {
    throw new Error('Invalid todo delete payload.');
  }

  const removed = deleteTodo(payload.id);

  if (!removed) {
    throw new Error('Todo item not found.');
  }

  return { success: true };
});
//
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
  try {
    initializeTodoStore();
  } catch (error) {
    console.error('Failed to initialize todo store.', error);
  }
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
