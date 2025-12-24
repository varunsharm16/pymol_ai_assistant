import { contextBridge, ipcRenderer } from 'electron';

// Keep the type local so the renderer doesn't need Electron types
type SaveDialogOpts = {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
};

const api = Object.freeze({
  // simple availability flag for the UI
  hasSaveDialog: true,

  showSaveDialog: (opts: SaveDialogOpts) => ipcRenderer.invoke('show-save-dialog', opts),
});
contextBridge.exposeInMainWorld('api', api);  