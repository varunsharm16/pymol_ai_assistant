"use strict";

// electron/main.ts
var import_electron = require("electron");
var import_node_path = require("node:path");
var mainWindow = null;
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1100,
    // default open size (keep roomy)
    height: 760,
    minWidth: 560,
    // ↓ allow “half screen” and smaller
    minHeight: 520,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: (0, import_node_path.join)(__dirname, "preload.cjs")
    }
  });
  const isDev = !!process.env.VITE_DEV;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173/");
  } else {
    mainWindow.loadFile((0, import_node_path.join)(__dirname, "../index.html"));
  }
}
import_electron.app.whenReady().then(() => {
  import_electron.nativeTheme.themeSource = "dark";
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
