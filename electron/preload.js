const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  backupDir: ipcRenderer.sendSync('backup-dir'),
  saveBackup: (text) => ipcRenderer.invoke('backup-save', text),
  latestBackup: () => ipcRenderer.invoke('backup-latest'),
  openBackups: () => ipcRenderer.invoke('backup-open'),
  saveFile: (name, data, kind) => ipcRenderer.invoke('save-file', { name, data, kind }),
  savePdf: (name, html) => ipcRenderer.invoke('save-pdf', { name, html }),
});
