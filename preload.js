const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  writeLog: (payload) => ipcRenderer.send('app:log', payload),
  onOverlayVisible: (callback) => ipcRenderer.on('overlay:set-visible', (_, visible) => callback(visible)),
  onTranscript: (callback) => ipcRenderer.on('transcript:update', (_, payload) => callback(payload)),
  onStatus: (callback) => ipcRenderer.on('status:update', (_, payload) => callback(payload)),
  hideComplete: () => ipcRenderer.send('overlay:hide-complete')
});
