const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  backupDir: ipcRenderer.sendSync('backup-dir'),
  saveBackup: (text) => ipcRenderer.invoke('backup-save', text),
  latestBackup: () => ipcRenderer.invoke('backup-latest'),
  openBackups: () => ipcRenderer.invoke('backup-open'),
});
