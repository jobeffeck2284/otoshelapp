const path = require('path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');

const ENABLE_AUTO_LAUNCH = false;

let overlayWindow;
let listenerWindow;
let isOverlayVisible = false;
let pendingHide = false;

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: false,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createListenerWindow() {
  listenerWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 120,
    x: -10000,
    y: -10000,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  listenerWindow.loadFile(path.join(__dirname, 'renderer/index.html'), {
    query: { mode: 'listener' }
  });

  listenerWindow.on('closed', () => {
    listenerWindow = null;
  });
}

function showOverlay() {
  if (!overlayWindow || isOverlayVisible) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  overlayWindow.setBounds(primaryDisplay.bounds);
  overlayWindow.showInactive();
  overlayWindow.webContents.send('overlay:set-visible', true);
  isOverlayVisible = true;
}

function hideOverlay() {
  if (!overlayWindow || !isOverlayVisible || pendingHide) {
    return;
  }

  pendingHide = true;
  overlayWindow.webContents.send('overlay:set-visible', false);

  setTimeout(() => {
    if (overlayWindow && pendingHide) {
      overlayWindow.hide();
      isOverlayVisible = false;
      pendingHide = false;
    }
  }, 800);
}

function setupIpc() {
  ipcMain.on('voice:away', () => {
    showOverlay();
  });

  ipcMain.on('voice:back', () => {
    hideOverlay();
  });

  ipcMain.on('overlay:hide-complete', () => {
    if (overlayWindow) {
      overlayWindow.hide();
    }
    isOverlayVisible = false;
    pendingHide = false;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32' && ENABLE_AUTO_LAUNCH) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  }

  createOverlayWindow();
  createListenerWindow();
  setupIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createListenerWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
