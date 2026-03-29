"use strict";

// electron/preload.ts
var import_electron = require("electron");
var api = Object.freeze({
  // Dialogs
  showSaveDialog: (opts) => import_electron.ipcRenderer.invoke("show-save-dialog", opts),
  showOpenDialog: (opts) => import_electron.ipcRenderer.invoke("show-open-dialog", opts),
  writeFile: (opts) => import_electron.ipcRenderer.invoke("write-file", opts),
  // Backend discovery
  getBackendPort: () => import_electron.ipcRenderer.invoke("get-backend-port"),
  getBackendStartupError: () => import_electron.ipcRenderer.invoke("get-backend-startup-error"),
  isPackagedApp: () => import_electron.ipcRenderer.invoke("is-packaged-app"),
  getAppVersion: () => import_electron.ipcRenderer.invoke("get-app-version"),
  // Version checks for health panel
  getNodeVersion: () => import_electron.ipcRenderer.invoke("get-node-version"),
  getPythonVersion: () => import_electron.ipcRenderer.invoke("get-python-version")
});
import_electron.contextBridge.exposeInMainWorld("api", api);
