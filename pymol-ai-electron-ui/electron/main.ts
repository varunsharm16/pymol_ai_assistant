import { app, BrowserWindow, nativeTheme, ipcMain, dialog } from 'electron';
import { join, resolve } from 'node:path';
import { execSync, spawn, ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;

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

// ---------------------------------------------------------------------------
// Backend process management
// ---------------------------------------------------------------------------

function findPython(): string {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (version.includes('3.')) return cmd;
    } catch {
      // try next
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getBridgeDir(): string {
  // In development: project root / pymol-bridge
  // In packaged app: resources / pymol-bridge
  if (app.isPackaged) {
    return join(process.resourcesPath, 'pymol-bridge');
  }
  return resolve(__dirname, '..', '..', 'pymol-bridge');
}

function spawnBackend(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const bridgeDir = getBridgeDir();
    const mainPy = join(bridgeDir, 'main.py');

    // Try venv python first, then system python
    const isWin = process.platform === 'win32';
    const venvPython = isWin
      ? join(bridgeDir, '.venv', 'Scripts', 'python.exe')
      : join(bridgeDir, '.venv', 'bin', 'python');

    let pythonCmd: string;
    try {
      const fs = require('node:fs');
      if (fs.existsSync(venvPython)) {
        pythonCmd = venvPython;
      } else {
        pythonCmd = findPython();
      }
    } catch {
      pythonCmd = findPython();
    }

    console.log(`[NexMol] Starting backend: ${pythonCmd} ${mainPy}`);

    const proc = spawn(pythonCmd, [mainPy], {
      cwd: bridgeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    backendProcess = proc;
    let portFound = false;
    const timeout = setTimeout(() => {
      if (!portFound) {
        reject(new Error('Backend did not report port within 15 seconds'));
      }
    }, 15000);

    // Read stdout line by line looking for NEXMOL_PORT=<port>
    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line: string) => {
        console.log(`[Backend] ${line}`);
        const match = line.match(/^NEXMOL_PORT=(\d+)$/);
        if (match && !portFound) {
          portFound = true;
          clearTimeout(timeout);
          const port = parseInt(match[1], 10);
          backendPort = port;
          console.log(`[NexMol] Backend ready on port ${port}`);
          resolvePort(port);
        }
      });
    }

    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line: string) => {
        console.error(`[Backend:err] ${line}`);
      });
    }

    proc.on('error', (err) => {
      console.error('[NexMol] Backend spawn error:', err);
      clearTimeout(timeout);
      if (!portFound) reject(err);
    });

    proc.on('exit', (code, signal) => {
      console.log(`[NexMol] Backend exited: code=${code}, signal=${signal}`);
      backendProcess = null;
      clearTimeout(timeout);
      if (!portFound) {
        reject(new Error(`Backend exited with code ${code} before reporting port`));
      }
    });
  });
}

function killBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[NexMol] Shutting down backend...');
    backendProcess.kill('SIGTERM');
    // Force kill after 3 seconds
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#111111',
    titleBarStyle: isWin ? 'default' : 'hiddenInset',
    title: 'NexMol',
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

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';

  // Start backend
  try {
    await spawnBackend();
  } catch (err: any) {
    console.error('[NexMol] Failed to start backend:', err.message);
    dialog.showErrorBox(
      'NexMol Backend Error',
      `Could not start the backend server.\n\n${err.message}\n\nPlease ensure Python 3.8+ is installed and the backend dependencies are set up.`
    );
  }

  // IPC handlers
  ipcMain.handle('get-backend-port', () => backendPort);

  ipcMain.handle('show-save-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return dialog.showSaveDialog(win, opts);
    return dialog.showSaveDialog(opts);
  });

  ipcMain.handle('show-open-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return dialog.showOpenDialog(win, opts);
    return dialog.showOpenDialog(opts);
  });

  ipcMain.handle('write-file', async (_evt, opts: { path: string; dataBase64: string }) => {
    await writeFile(opts.path, Buffer.from(opts.dataBase64, 'base64'));
    return { ok: true };
  });

  ipcMain.handle('get-node-version', () => process.versions.node);

  ipcMain.handle('get-python-version', () => {
    try {
      const cmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
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

app.on('will-quit', () => {
  killBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
