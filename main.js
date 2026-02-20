const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, screen, session } = require('electron');

const ENABLE_AUTO_LAUNCH = false;

let overlayWindow;
let listenerWindow;
let monitorWindow;
let isOverlayVisible = false;
let pendingHide = false;
let logFilePath = '';

function initLogger() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, 'app.log');
  fs.appendFileSync(logFilePath, `\n=== app start ${new Date().toISOString()} ===\n`);
}

function logEvent(level, message, meta) {
  const ts = new Date().toISOString();
  const metaText = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] [${level}] ${message}${metaText}\n`;

  if (level === 'ERROR') {
    console.error(line.trim());
  } else if (level === 'WARN') {
    console.warn(line.trim());
  } else {
    console.log(line.trim());
  }

  if (logFilePath) {
    fs.appendFile(logFilePath, line, () => {});
  }
}

function allowMicrophonePermissions() {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionCheckHandler((_, permission) => {
    if (permission === 'media' || permission === 'audioCapture' || permission === 'microphone') {
      return true;
    }
    return false;
  });

  defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture' || permission === 'microphone') {
      logEvent('INFO', 'microphone permission granted', { permission });
      callback(true);
      return;
    }
    callback(false);
  });
}

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
  logEvent('INFO', 'overlay window created');

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
  logEvent('INFO', 'listener window created');

  listenerWindow.on('closed', () => {
    listenerWindow = null;
  });
}

function createMonitorWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 430;
  const height = 220;
  const padding = 20;

  monitorWindow = new BrowserWindow({
    show: true,
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - padding,
    y: display.workArea.y + padding,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  monitorWindow.setAlwaysOnTop(true, 'floating');
  monitorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  monitorWindow.loadFile(path.join(__dirname, 'renderer/index.html'), {
    query: { mode: 'monitor' }
  });
  logEvent('INFO', 'monitor window created');

  monitorWindow.on('closed', () => {
    monitorWindow = null;
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
  logEvent('INFO', 'overlay shown');
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
      logEvent('INFO', 'overlay hidden');
    }
  }, 800);
}

function setupIpc() {
  ipcMain.on('voice:away', () => {
    logEvent('INFO', 'voice command away');
    showOverlay();
  });

  ipcMain.on('voice:back', () => {
    logEvent('INFO', 'voice command back');
    hideOverlay();
  });

  ipcMain.on('voice:transcript', (_, payload) => {
    if (monitorWindow) {
      monitorWindow.webContents.send('transcript:update', payload);
    }
  });

  ipcMain.on('voice:status', (_, payload) => {
    if (monitorWindow) {
      monitorWindow.webContents.send('status:update', payload);
    }
  });

  ipcMain.on('app:log', (_, payload) => {
    const level = payload?.level || 'INFO';
    const message = payload?.message || 'renderer log';
    const meta = payload?.meta;
    logEvent(level.toUpperCase(), message, meta);
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
  initLogger();
  logEvent('INFO', 'app ready', { userData: app.getPath('userData'), logFilePath });
  allowMicrophonePermissions();

  if (process.platform === 'win32' && ENABLE_AUTO_LAUNCH) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  }

  createOverlayWindow();
  createListenerWindow();
  createMonitorWindow();
  setupIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createListenerWindow();
      createMonitorWindow();
    }
  });
});

process.on('uncaughtException', (error) => {
  logEvent('ERROR', 'uncaughtException', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logEvent('ERROR', 'unhandledRejection', { reason: String(reason) });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logEvent('INFO', 'app quit');
    app.quit();
  }
});
