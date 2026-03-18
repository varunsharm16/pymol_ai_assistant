"use strict";

// electron/main.ts
var import_electron = require("electron");
var import_node_path = require("node:path");
var import_node_child_process = require("node:child_process");
var import_promises = require("node:fs/promises");
var mainWindow = null;
var gotLock = import_electron.app.requestSingleInstanceLock();
if (!gotLock) {
  import_electron.app.quit();
  process.exit(0);
}
import_electron.app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
function createWindow() {
  const isWin = process.platform === "win32";
  mainWindow = new import_electron.BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    backgroundColor: "#111111",
    titleBarStyle: isWin ? "default" : "hiddenInset",
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
}
import_electron.app.whenReady().then(() => {
  import_electron.nativeTheme.themeSource = "dark";
  import_electron.ipcMain.handle("show-save-dialog", async (_evt, opts) => {
    const win = import_electron.BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return import_electron.dialog.showSaveDialog(win, opts);
    return import_electron.dialog.showSaveDialog(opts);
  });
  import_electron.ipcMain.handle("show-open-dialog", async (_evt, opts) => {
    const win = import_electron.BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) return import_electron.dialog.showOpenDialog(win, opts);
    return import_electron.dialog.showOpenDialog(opts);
  });
  import_electron.ipcMain.handle("write-file", async (_evt, opts) => {
    await (0, import_promises.writeFile)(opts.path, Buffer.from(opts.dataBase64, "base64"));
    return { ok: true };
  });
  import_electron.ipcMain.handle("get-node-version", () => {
    return process.versions.node;
  });
  import_electron.ipcMain.handle("get-python-version", () => {
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
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
