import { app, BrowserWindow, nativeTheme, ipcMain, dialog } from 'electron';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

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
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    backgroundColor: '#111111',
    titleBarStyle: isWin ? 'default' : 'hiddenInset',
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
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  // Save dialog (snapshots, projects)
  ipcMain.handle('show-save-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return dialog.showSaveDialog(win, opts);
    return dialog.showSaveDialog(opts);
  });

  // Open dialog (file import, project load)
  ipcMain.handle('show-open-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return dialog.showOpenDialog(win, opts);
    return dialog.showOpenDialog(opts);
  });

  ipcMain.handle('write-file', async (_evt, opts: { path: string; dataBase64: string }) => {
    await writeFile(opts.path, Buffer.from(opts.dataBase64, 'base64'));
    return { ok: true };
  });

  // Version checks for health panel
  ipcMain.handle('get-node-version', () => {
    return process.versions.node;
  });

  ipcMain.handle('get-python-version', () => {
    try {
      const cmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
      // "Python 3.11.5" → "3.11.5"
      return output.replace(/^Python\s*/i, '');
    } catch {
      return 'not found';
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
