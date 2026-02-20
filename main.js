const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');

const ENABLE_AUTO_LAUNCH = false;

const VOICE_CONFIG = {
  modelPath: path.join(__dirname, 'models', 'vosk-model-small-ru-0.22'),
  sampleRate: 16000,
  restartDelayMs: 1500,
  debounceMs: 8000,
  triggerPhrases: {
    away: [
      'я отойду',
      'я отошел',
      'я срать',
      'я покакать',
      'я скоро вернусь',
      'я ненадолго',
      'отойду на минуту',
      'я щас вернусь'
    ],
    back: ['я вернулся', 'я тут', 'я на месте', 'вернулся', 'я уже тут']
  },
  semanticKeywords: {
    away: [
      ['отойду', 'отошел', 'отошла', 'ушел', 'ушла'],
      ['вернусь', 'скоро'],
      ['туалет', 'срать', 'покакать', 'уборную']
    ],
    back: [['вернулся', 'вернулась', 'тут', 'на месте', 'дома', 'здесь']]
  }
};

let overlayWindow;
let monitorWindow;
let isOverlayVisible = false;
let pendingHide = false;
let logFilePath = '';
let voiceEngine = null;

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

function sendStatus(status, hint = '') {
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.webContents.send('status:update', {
      status,
      hint,
      ts: Date.now()
    });
  }
  logEvent('INFO', `status changed: ${status}`, hint ? { hint } : undefined);
}

function sendTranscript(text, isFinal = true) {
  if (!text?.trim()) {
    return;
  }

  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.webContents.send('transcript:update', {
      transcript: text,
      confidence: null,
      isFinal
    });
  }

  logEvent('INFO', 'voice transcript', { transcript: text, isFinal });
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text, phrase) {
  return text.includes(normalize(phrase));
}

function semanticMatch(text, groups, minGroups = 1) {
  let matches = 0;
  for (const synonyms of groups) {
    if (synonyms.some((word) => text.includes(word))) {
      matches += 1;
    }
  }
  return matches >= minGroups;
}

function classifyTranscript(raw) {
  const text = normalize(raw);
  if (!text) {
    return 'none';
  }

  const awayExact = VOICE_CONFIG.triggerPhrases.away.some((phrase) => includesPhrase(text, phrase));
  const backExact = VOICE_CONFIG.triggerPhrases.back.some((phrase) => includesPhrase(text, phrase));

  if (awayExact || semanticMatch(text, VOICE_CONFIG.semanticKeywords.away, 1)) {
    return 'away';
  }

  if (backExact || semanticMatch(text, VOICE_CONFIG.semanticKeywords.back, 1)) {
    return 'back';
  }

  return 'none';
}

class LocalVoiceEngine {
  constructor() {
    this.vosk = null;
    this.micFactory = null;
    this.model = null;
    this.recognizer = null;
    this.micInstance = null;
    this.micInputStream = null;
    this.lastTriggerTs = 0;
    this.stopped = false;
  }

  async start() {
    sendStatus('инициализация offline-распознавания', 'используется локальная модель Vosk (без сети)');

    try {
      this.vosk = require('vosk');
      this.micFactory = require('mic');
    } catch (error) {
      sendStatus('ошибка инициализации', 'установите зависимости npm install (vosk, mic)');
      logEvent('ERROR', 'failed to load offline dependencies', { message: error.message });
      return;
    }

    if (!fs.existsSync(VOICE_CONFIG.modelPath)) {
      sendStatus('модель Vosk не найдена', `поместите модель в ${VOICE_CONFIG.modelPath}`);
      logEvent('ERROR', 'vosk model missing', { modelPath: VOICE_CONFIG.modelPath });
      return;
    }

    this.vosk.setLogLevel(0);
    this.model = new this.vosk.Model(VOICE_CONFIG.modelPath);
    this.recognizer = new this.vosk.Recognizer({ model: this.model, sampleRate: VOICE_CONFIG.sampleRate });

    this.startMic();
  }

  startMic() {
    if (this.stopped) {
      return;
    }

    sendStatus('слушаю (offline)', 'локальное распознавание Vosk активно');

    this.micInstance = this.micFactory({
      rate: String(VOICE_CONFIG.sampleRate),
      channels: '1',
      debug: false,
      exitOnSilence: 0,
      fileType: 'raw'
    });

    this.micInputStream = this.micInstance.getAudioStream();

    this.micInputStream.on('data', (data) => {
      if (!this.recognizer) {
        return;
      }

      const accepted = this.recognizer.acceptWaveform(data);
      if (accepted) {
        const result = JSON.parse(this.recognizer.result() || '{}');
        this.handleText(result.text, true);
      } else {
        const partial = JSON.parse(this.recognizer.partialResult() || '{}');
        this.handleText(partial.partial, false);
      }
    });

    this.micInputStream.on('error', (error) => {
      sendStatus('ошибка микрофона', 'проверьте устройство записи в Windows');
      logEvent('ERROR', 'mic input stream error', { message: error.message });
      this.restartMic();
    });

    this.micInputStream.on('startComplete', () => {
      logEvent('INFO', 'mic stream started');
    });

    this.micInputStream.on('stopComplete', () => {
      logEvent('INFO', 'mic stream stopped');
    });

    try {
      this.micInstance.start();
    } catch (error) {
      sendStatus('ошибка запуска микрофона', 'проверьте доступность микрофона и драйвер');
      logEvent('ERROR', 'failed to start mic', { message: error.message });
      this.restartMic();
    }
  }

  handleText(text, isFinal) {
    const transcript = (text || '').trim();
    if (!transcript) {
      return;
    }

    sendTranscript(transcript, isFinal);

    if (!isFinal) {
      return;
    }

    const command = classifyTranscript(transcript);
    if (command !== 'none') {
      logEvent('INFO', 'voice command matched', { command, transcript });
      this.handleCommand(command);
    }
  }

  handleCommand(command) {
    const now = Date.now();
    if (now - this.lastTriggerTs < VOICE_CONFIG.debounceMs) {
      return;
    }
    this.lastTriggerTs = now;

    if (command === 'away' && !isOverlayVisible) {
      showOverlay();
      return;
    }

    if (command === 'back' && isOverlayVisible) {
      hideOverlay();
    }
  }

  restartMic() {
    if (this.stopped) {
      return;
    }

    sendStatus('перезапуск микрофона', `повтор через ${VOICE_CONFIG.restartDelayMs} мс`);

    setTimeout(() => {
      if (this.stopped) {
        return;
      }
      this.stopMicOnly();
      this.startMic();
    }, VOICE_CONFIG.restartDelayMs);
  }

  stopMicOnly() {
    try {
      if (this.micInstance) {
        this.micInstance.stop();
      }
    } catch (error) {
      logEvent('WARN', 'failed to stop mic', { message: error.message });
    }
  }

  stop() {
    this.stopped = true;
    this.stopMicOnly();

    try {
      this.recognizer?.free();
    } catch (error) {
      logEvent('WARN', 'failed to free recognizer', { message: error.message });
    }

    try {
      this.model?.free();
    } catch (error) {
      logEvent('WARN', 'failed to free model', { message: error.message });
    }
  }
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

  if (process.platform === 'win32' && ENABLE_AUTO_LAUNCH) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  }

  createOverlayWindow();
  createMonitorWindow();
  setupIpc();

  voiceEngine = new LocalVoiceEngine();
  voiceEngine.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
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

app.on('before-quit', () => {
  voiceEngine?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logEvent('INFO', 'app quit');
    app.quit();
  }
});
