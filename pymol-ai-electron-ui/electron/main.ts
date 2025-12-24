import { app, BrowserWindow, nativeTheme, ipcMain, dialog } from 'electron';
import { join } from 'node:path';

let mainWindow: BrowserWindow | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    backgroundColor: '#111111',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = !!process.env.VITE_DEV;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../index.html'));
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  ipcMain.handle('show-save-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return dialog.showSaveDialog(win, opts);
    return dialog.showSaveDialog(opts);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
