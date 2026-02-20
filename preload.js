const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notifyAway: () => ipcRenderer.send('voice:away'),
  notifyBack: () => ipcRenderer.send('voice:back'),
  onOverlayVisible: (callback) => ipcRenderer.on('overlay:set-visible', (_, visible) => callback(visible)),
  hideComplete: () => ipcRenderer.send('overlay:hide-complete')
});
