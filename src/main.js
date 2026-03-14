const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { log, setupGlobalErrorHandlers } = require('./main/logger');
const { initDatabase, closeDatabase } = require('./main/database');
const { setupIpcHandlers } = require('./main/ipcHandlers');
const { setMainWindow } = require('./main/sessionManager');

setupGlobalErrorHandlers();
log.info('Happy Feet starting...');

if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Happy Feet - Gestión de Podología',
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  setMainWindow(mainWindow);
  mainWindow.on('closed', () => setMainWindow(null));

  createMenu();

  log.info('Main window created');
};

function createMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  try {
    initDatabase();
    setupIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    log.error('Error during app initialization:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
