const APP_CONFIG = {
  overlayText: 'Я отошел. Скоро вернусь.',
  monitorEmptyText: 'Тишина…'
};

const mode = new URLSearchParams(window.location.search).get('mode') || 'overlay';
const overlayElement = document.getElementById('overlay');
const overlayTextElement = document.getElementById('overlayText');
const monitorElement = document.getElementById('monitor');
const monitorTextElement = document.getElementById('monitorText');
const monitorMetaElement = document.getElementById('monitorMeta');
const monitorStatusElement = document.getElementById('monitorStatus');
const monitorHintElement = document.getElementById('monitorHint');

if (overlayTextElement) {
  overlayTextElement.textContent = APP_CONFIG.overlayText;
}

if (mode === 'overlay') {
  monitorElement?.remove();
}

if (mode === 'monitor') {
  document.querySelector('.ambient')?.remove();
  overlayElement?.remove();
  document.body.style.background = 'transparent';
  monitorElement?.classList.remove('hidden');
}

function updateMonitor(payload) {
  if (mode !== 'monitor' || !monitorTextElement || !monitorMetaElement) {
    return;
  }

  const phrase = payload?.transcript?.trim() || APP_CONFIG.monitorEmptyText;
  const confidence = typeof payload?.confidence === 'number' ? `${Math.round(payload.confidence * 100)}%` : '—';
  const now = new Date();
  const timestamp = now.toLocaleTimeString('ru-RU');

  monitorTextElement.textContent = phrase;
  monitorMetaElement.textContent = `уверенность: ${confidence} • ${timestamp}`;
}

function updateMonitorStatus(payload) {
  if (mode !== 'monitor' || !monitorStatusElement) {
    return;
  }

  const status = payload?.status || 'неизвестно';
  const hint = payload?.hint || '—';
  monitorStatusElement.textContent = `статус: ${status}`;
  if (monitorHintElement) {
    monitorHintElement.textContent = `подсказка: ${hint}`;
  }
}

function setupOverlayAnimations() {
  if (mode !== 'overlay' || !overlayElement) {
    return;
  }

  window.electronAPI.onOverlayVisible((visible) => {
    if (visible) {
      overlayElement.classList.remove('hidden');
      return;
    }

    overlayElement.classList.add('hidden');
    setTimeout(() => {
      window.electronAPI.hideComplete();
    }, 720);
  });
}

function setupMonitorSubscriptions() {
  if (mode !== 'monitor') {
    return;
  }

  window.electronAPI.onTranscript((payload) => {
    updateMonitor(payload);
  });

  window.electronAPI.onStatus((payload) => {
    updateMonitorStatus(payload);
  });
}

setupOverlayAnimations();
setupMonitorSubscriptions();
