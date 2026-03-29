import { app, BrowserWindow, nativeTheme, ipcMain, dialog } from 'electron';
import { join, resolve } from 'node:path';
import { execSync, spawn, ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;
let backendStartupError: string | null = null;

function getLiveMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    return null;
  }
  return mainWindow;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  const win = getLiveMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
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
  return resolve(__dirname, '..', '..', 'pymol-bridge');
}

function getPackagedBackendDir(): string {
  return join(process.resourcesPath, 'backend');
}

function getPackagedBackendExecutable(): string {
  const executable = process.platform === 'win32' ? 'nexmol-backend.exe' : 'nexmol-backend';
  return join(getPackagedBackendDir(), executable);
}

function looksLikeDependencyError(lines: string[]): boolean {
  return lines.some((line) =>
    /ModuleNotFoundError|No module named|ImportError|cannot import name/i.test(line)
  );
}

function buildBackendRecoveryMessage(bridgeDir: string): string {
  const requirementsPath = join(bridgeDir, 'requirements.txt');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  return [
    'Recovery steps:',
    `1. Install Python 3 if it is not already available.`,
    `2. Install backend dependencies with:`,
    `   ${pythonCmd} -m pip install -r "${requirementsPath}"`,
  ].join('\n');
}

function buildPackagedBackendStartupErrorMessage(stderrLines: string[], exitSummary?: string): string {
  const stderrPreview = stderrLines.slice(-8).join('\n').trim();
  return [
    'The bundled NexMol backend failed to start.',
    '',
    'Try reopening the app. If the problem persists, re-download this NexMol build.',
    stderrPreview ? `\n\nBackend output:\n${stderrPreview}` : exitSummary ? `\n\n${exitSummary}` : '',
  ].join('');
}

function buildBackendStartupErrorMessage(bridgeDir: string, stderrLines: string[], exitSummary?: string): string {
  const stderrPreview = stderrLines.slice(-8).join('\n').trim();

  if (looksLikeDependencyError(stderrLines)) {
    return [
      'Python started, but NexMol backend dependencies are missing for that Python installation.',
      '',
      buildBackendRecoveryMessage(bridgeDir),
      stderrPreview ? `\n\nBackend output:\n${stderrPreview}` : '',
    ].join('');
  }

  if (exitSummary) {
    return [
      `The NexMol backend exited before it reported a listening port.`,
      '',
      buildBackendRecoveryMessage(bridgeDir),
      stderrPreview ? `\n\nBackend output:\n${stderrPreview}` : `\n\n${exitSummary}`,
    ].join('');
  }

  return [
    'The NexMol backend did not become ready in time.',
    '',
    buildBackendRecoveryMessage(bridgeDir),
    stderrPreview ? `\n\nBackend output:\n${stderrPreview}` : '',
  ].join('');
}

function spawnBackend(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const packaged = app.isPackaged;
    const bridgeDir = packaged ? getPackagedBackendDir() : getBridgeDir();
    const mainPy = join(bridgeDir, 'main.py');
    backendStartupError = null;

    // Try venv python first, then system python
    const isWin = process.platform === 'win32';
    const venvPython = isWin
      ? join(bridgeDir, '.venv', 'Scripts', 'python.exe')
      : join(bridgeDir, '.venv', 'bin', 'python');

    let launchCmd: string;
    let launchArgs: string[];

    if (packaged) {
      launchCmd = getPackagedBackendExecutable();
      launchArgs = [];
    } else {
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
      launchCmd = pythonCmd;
      launchArgs = [mainPy];
    }

    console.log(`[NexMol] Starting backend: ${launchCmd}${launchArgs.length ? ` ${launchArgs.join(' ')}` : ''}`);

    const proc = spawn(launchCmd, launchArgs, {
      cwd: bridgeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    backendProcess = proc;
    let portFound = false;
    let rejectCalled = false;
    const stderrLines: string[] = [];
    const timeout = setTimeout(() => {
      if (!portFound) {
        rejectCalled = true;
        const message = packaged
          ? buildPackagedBackendStartupErrorMessage(stderrLines)
          : buildBackendStartupErrorMessage(bridgeDir, stderrLines);
        backendStartupError = message;
        reject(new Error(message));
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
          backendStartupError = null;
          console.log(`[NexMol] Backend ready on port ${port}`);
          resolvePort(port);
        }
      });
    }

    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line: string) => {
        stderrLines.push(line);
        console.error(`[Backend:err] ${line}`);
      });
    }

    proc.on('error', (err) => {
      console.error('[NexMol] Backend spawn error:', err);
      clearTimeout(timeout);
      if (!portFound) {
        rejectCalled = true;
        const isMissingPython = !packaged && (err as NodeJS.ErrnoException)?.code === 'ENOENT';
        const message = packaged
          ? [
              'The bundled NexMol backend executable could not be started.',
              '',
              'Try reopening the app. If the problem persists, re-download this NexMol build.',
            ].join('\n')
          : isMissingPython
            ? [
                'Python 3 was not found, so NexMol could not start the backend.',
                '',
                buildBackendRecoveryMessage(bridgeDir),
              ].join('\n')
            : err.message;
        backendStartupError = message;
        reject(new Error(message));
      }
    });

    proc.on('exit', (code, signal) => {
      console.log(`[NexMol] Backend exited: code=${code}, signal=${signal}`);
      backendProcess = null;
      clearTimeout(timeout);
      if (!portFound && !rejectCalled) {
        const message = packaged
          ? buildPackagedBackendStartupErrorMessage(
              stderrLines,
              `Bundled backend exited with code ${code} before reporting port${signal ? ` (signal ${signal})` : ''}.`
            )
          : buildBackendStartupErrorMessage(
              bridgeDir,
              stderrLines,
              `Backend exited with code ${code} before reporting port${signal ? ` (signal ${signal})` : ''}.`
            );
        backendStartupError = message;
        reject(
          new Error(message)
        );
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

  mainWindow.on('closed', () => {
    if (mainWindow?.isDestroyed()) {
      mainWindow = null;
    }
  });
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
    backendStartupError = err.message;
    dialog.showErrorBox(
      'NexMol Backend Error',
      `Could not start the backend server.\n\n${err.message}`
    );
  }

  // IPC handlers
  ipcMain.handle('get-backend-port', () => backendPort);
  ipcMain.handle('get-backend-startup-error', () => backendStartupError);
  ipcMain.handle('is-packaged-app', () => app.isPackaged);
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('show-save-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || getLiveMainWindow();
    if (win) return dialog.showSaveDialog(win, opts);
    return dialog.showSaveDialog(opts);
  });

  ipcMain.handle('show-open-dialog', async (_evt, opts) => {
    const win = BrowserWindow.getFocusedWindow() || getLiveMainWindow();
    if (win) return dialog.showOpenDialog(win, opts);
    return dialog.showOpenDialog(opts);
  });

  ipcMain.handle('write-file', async (_evt, opts: { path: string; dataBase64: string }) => {
    await writeFile(opts.path, Buffer.from(opts.dataBase64, 'base64'));
    return { ok: true };
  });

  ipcMain.handle('get-node-version', () => process.versions.node);

  ipcMain.handle('get-python-version', () => {
    if (app.isPackaged) return 'bundled';
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
