const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notifyAway: () => ipcRenderer.send('voice:away'),
  notifyBack: () => ipcRenderer.send('voice:back'),
  notifyTranscript: (payload) => ipcRenderer.send('voice:transcript', payload),
  notifyStatus: (payload) => ipcRenderer.send('voice:status', payload),
  onOverlayVisible: (callback) => ipcRenderer.on('overlay:set-visible', (_, visible) => callback(visible)),
  onTranscript: (callback) => ipcRenderer.on('transcript:update', (_, payload) => callback(payload)),
  onStatus: (callback) => ipcRenderer.on('status:update', (_, payload) => callback(payload)),
  hideComplete: () => ipcRenderer.send('overlay:hide-complete')
});
