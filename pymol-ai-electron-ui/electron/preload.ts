import { contextBridge, ipcRenderer } from 'electron';

const api = Object.freeze({
  // Dialogs
  showSaveDialog: (opts: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }) => ipcRenderer.invoke('show-save-dialog', opts),

  showOpenDialog: (opts: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }) => ipcRenderer.invoke('show-open-dialog', opts),

  writeFile: (opts: { path: string; dataBase64: string }) =>
    ipcRenderer.invoke('write-file', opts) as Promise<{ ok: boolean }>,

  // Backend discovery
  getBackendPort: () => ipcRenderer.invoke('get-backend-port') as Promise<number | null>,
  getBackendStartupError: () => ipcRenderer.invoke('get-backend-startup-error') as Promise<string | null>,
  isPackagedApp: () => ipcRenderer.invoke('is-packaged-app') as Promise<boolean>,
  getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,

  // Version checks for health panel
  getNodeVersion: () => ipcRenderer.invoke('get-node-version') as Promise<string>,
  getPythonVersion: () =>
    ipcRenderer.invoke('get-python-version') as Promise<string>,
});

contextBridge.exposeInMainWorld('api', api);
