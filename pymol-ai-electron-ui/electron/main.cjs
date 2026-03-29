"use strict";

// electron/main.ts
var import_electron = require("electron");
var import_node_path = require("node:path");
var import_node_child_process = require("node:child_process");
var import_promises = require("node:fs/promises");
var import_node_readline = require("node:readline");
var mainWindow = null;
var backendProcess = null;
var backendPort = null;
var backendStartupError = null;
function getLiveMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    return null;
  }
  return mainWindow;
}
var gotLock = import_electron.app.requestSingleInstanceLock();
if (!gotLock) {
  import_electron.app.quit();
  process.exit(0);
}
import_electron.app.on("second-instance", () => {
  const win = getLiveMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
function findPython() {
  const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const version = (0, import_node_child_process.execSync)(`${cmd} --version`, { encoding: "utf-8", timeout: 5e3 }).trim();
      if (version.includes("3.")) return cmd;
    } catch {
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}
function getBridgeDir() {
  return (0, import_node_path.resolve)(__dirname, "..", "..", "pymol-bridge");
}
function getPackagedBackendDir() {
  return (0, import_node_path.join)(process.resourcesPath, "backend");
}
function getPackagedBackendExecutable() {
  const executable = process.platform === "win32" ? "nexmol-backend.exe" : "nexmol-backend";
  return (0, import_node_path.join)(getPackagedBackendDir(), executable);
}
function looksLikeDependencyError(lines) {
  return lines.some(
    (line) => /ModuleNotFoundError|No module named|ImportError|cannot import name/i.test(line)
  );
}
function buildBackendRecoveryMessage(bridgeDir) {
  const requirementsPath = (0, import_node_path.join)(bridgeDir, "requirements.txt");
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  return [
    "Recovery steps:",
    `1. Install Python 3 if it is not already available.`,
    `2. Install backend dependencies with:`,
    `   ${pythonCmd} -m pip install -r "${requirementsPath}"`
  ].join("\n");
}
function buildPackagedBackendStartupErrorMessage(stderrLines, exitSummary) {
  const stderrPreview = stderrLines.slice(-8).join("\n").trim();
  return [
    "The bundled NexMol backend failed to start.",
    "",
    "Try reopening the app. If the problem persists, re-download this NexMol build.",
    stderrPreview ? `

Backend output:
${stderrPreview}` : exitSummary ? `

${exitSummary}` : ""
  ].join("");
}
function buildBackendStartupErrorMessage(bridgeDir, stderrLines, exitSummary) {
  const stderrPreview = stderrLines.slice(-8).join("\n").trim();
  if (looksLikeDependencyError(stderrLines)) {
    return [
      "Python started, but NexMol backend dependencies are missing for that Python installation.",
      "",
      buildBackendRecoveryMessage(bridgeDir),
      stderrPreview ? `

Backend output:
${stderrPreview}` : ""
    ].join("");
  }
  if (exitSummary) {
    return [
      `The NexMol backend exited before it reported a listening port.`,
      "",
      buildBackendRecoveryMessage(bridgeDir),
      stderrPreview ? `

Backend output:
${stderrPreview}` : `

${exitSummary}`
    ].join("");
  }
  return [
    "The NexMol backend did not become ready in time.",
    "",
    buildBackendRecoveryMessage(bridgeDir),
    stderrPreview ? `

Backend output:
${stderrPreview}` : ""
  ].join("");
}
function spawnBackend() {
  return new Promise((resolvePort, reject) => {
    const packaged = import_electron.app.isPackaged;
    const bridgeDir = packaged ? getPackagedBackendDir() : getBridgeDir();
    const mainPy = (0, import_node_path.join)(bridgeDir, "main.py");
    backendStartupError = null;
    const isWin = process.platform === "win32";
    const venvPython = isWin ? (0, import_node_path.join)(bridgeDir, ".venv", "Scripts", "python.exe") : (0, import_node_path.join)(bridgeDir, ".venv", "bin", "python");
    let launchCmd;
    let launchArgs;
    if (packaged) {
      launchCmd = getPackagedBackendExecutable();
      launchArgs = [];
    } else {
      let pythonCmd;
      try {
        const fs = require("node:fs");
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
    console.log(`[NexMol] Starting backend: ${launchCmd}${launchArgs.length ? ` ${launchArgs.join(" ")}` : ""}`);
    const proc = (0, import_node_child_process.spawn)(launchCmd, launchArgs, {
      cwd: bridgeDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    });
    backendProcess = proc;
    let portFound = false;
    let rejectCalled = false;
    const stderrLines = [];
    const timeout = setTimeout(() => {
      if (!portFound) {
        rejectCalled = true;
        const message = packaged ? buildPackagedBackendStartupErrorMessage(stderrLines) : buildBackendStartupErrorMessage(bridgeDir, stderrLines);
        backendStartupError = message;
        reject(new Error(message));
      }
    }, 15e3);
    if (proc.stdout) {
      const rl = (0, import_node_readline.createInterface)({ input: proc.stdout });
      rl.on("line", (line) => {
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
      const rl = (0, import_node_readline.createInterface)({ input: proc.stderr });
      rl.on("line", (line) => {
        stderrLines.push(line);
        console.error(`[Backend:err] ${line}`);
      });
    }
    proc.on("error", (err) => {
      console.error("[NexMol] Backend spawn error:", err);
      clearTimeout(timeout);
      if (!portFound) {
        rejectCalled = true;
        const isMissingPython = !packaged && err?.code === "ENOENT";
        const message = packaged ? [
          "The bundled NexMol backend executable could not be started.",
          "",
          "Try reopening the app. If the problem persists, re-download this NexMol build."
        ].join("\n") : isMissingPython ? [
          "Python 3 was not found, so NexMol could not start the backend.",
          "",
          buildBackendRecoveryMessage(bridgeDir)
        ].join("\n") : err.message;
        backendStartupError = message;
        reject(new Error(message));
      }
    });
    proc.on("exit", (code, signal) => {
      console.log(`[NexMol] Backend exited: code=${code}, signal=${signal}`);
      backendProcess = null;
      clearTimeout(timeout);
      if (!portFound && !rejectCalled) {
        const message = packaged ? buildPackagedBackendStartupErrorMessage(
          stderrLines,
          `Bundled backend exited with code ${code} before reporting port${signal ? ` (signal ${signal})` : ""}.`
        ) : buildBackendStartupErrorMessage(
          bridgeDir,
          stderrLines,
          `Backend exited with code ${code} before reporting port${signal ? ` (signal ${signal})` : ""}.`
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
    console.log("[NexMol] Shutting down backend...");
    backendProcess.kill("SIGTERM");
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill("SIGKILL");
      }
    }, 3e3);
  }
}
function createWindow() {
  const isWin = process.platform === "win32";
  mainWindow = new import_electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#111111",
    titleBarStyle: isWin ? "default" : "hiddenInset",
    title: "NexMol",
    webPreferences: {
      preload: (0, import_node_path.join)(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const isDev = !!process.env.VITE_DEV;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173/");
  } else {
    mainWindow.loadFile((0, import_node_path.join)(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    if (mainWindow?.isDestroyed()) {
      mainWindow = null;
    }
  });
}
import_electron.app.whenReady().then(async () => {
  import_electron.nativeTheme.themeSource = "dark";
  try {
    await spawnBackend();
  } catch (err) {
    console.error("[NexMol] Failed to start backend:", err.message);
    backendStartupError = err.message;
    import_electron.dialog.showErrorBox(
      "NexMol Backend Error",
      `Could not start the backend server.

${err.message}`
    );
  }
  import_electron.ipcMain.handle("get-backend-port", () => backendPort);
  import_electron.ipcMain.handle("get-backend-startup-error", () => backendStartupError);
  import_electron.ipcMain.handle("is-packaged-app", () => import_electron.app.isPackaged);
  import_electron.ipcMain.handle("get-app-version", () => import_electron.app.getVersion());
  import_electron.ipcMain.handle("show-save-dialog", async (_evt, opts) => {
    const win = import_electron.BrowserWindow.getFocusedWindow() || getLiveMainWindow();
    if (win) return import_electron.dialog.showSaveDialog(win, opts);
    return import_electron.dialog.showSaveDialog(opts);
  });
  import_electron.ipcMain.handle("show-open-dialog", async (_evt, opts) => {
    const win = import_electron.BrowserWindow.getFocusedWindow() || getLiveMainWindow();
    if (win) return import_electron.dialog.showOpenDialog(win, opts);
    return import_electron.dialog.showOpenDialog(opts);
  });
  import_electron.ipcMain.handle("write-file", async (_evt, opts) => {
    await (0, import_promises.writeFile)(opts.path, Buffer.from(opts.dataBase64, "base64"));
    return { ok: true };
  });
  import_electron.ipcMain.handle("get-node-version", () => process.versions.node);
  import_electron.ipcMain.handle("get-python-version", () => {
    if (import_electron.app.isPackaged) return "bundled";
    try {
      const cmd = process.platform === "win32" ? "python --version" : "python3 --version";
      const output = (0, import_node_child_process.execSync)(cmd, { encoding: "utf-8", timeout: 5e3 }).trim();
      return output.replace(/^Python\s*/i, "");
    } catch {
      return "not found";
    }
  });
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("will-quit", () => {
  killBackend();
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
