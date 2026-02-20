const APP_CONFIG = {
  overlayText: 'Я отошел. Скоро вернусь.',
  debounceMs: 8000,
  recognitionLang: 'ru-RU',
  monitorEmptyText: 'Тишина…',
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

const mode = new URLSearchParams(window.location.search).get('mode') || 'overlay';
const overlayElement = document.getElementById('overlay');
const overlayTextElement = document.getElementById('overlayText');
const monitorElement = document.getElementById('monitor');
const monitorTextElement = document.getElementById('monitorText');
const monitorMetaElement = document.getElementById('monitorMeta');

if (overlayTextElement) {
  overlayTextElement.textContent = APP_CONFIG.overlayText;
}

if (mode === 'listener') {
  document.body.style.background = 'transparent';
  document.querySelector('.ambient')?.remove();
  overlayElement?.remove();
  monitorElement?.remove();
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

let lastTriggerTs = 0;
let overlayVisible = false;

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

  const awayExact = APP_CONFIG.triggerPhrases.away.some((phrase) => includesPhrase(text, phrase));
  const backExact = APP_CONFIG.triggerPhrases.back.some((phrase) => includesPhrase(text, phrase));

  if (awayExact || semanticMatch(text, APP_CONFIG.semanticKeywords.away, 1)) {
    return 'away';
  }

  if (backExact || semanticMatch(text, APP_CONFIG.semanticKeywords.back, 1)) {
    return 'back';
  }

  return 'none';
}

function canTrigger() {
  const now = Date.now();
  if (now - lastTriggerTs < APP_CONFIG.debounceMs) {
    return false;
  }
  lastTriggerTs = now;
  return true;
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

function onVoiceCommand(kind) {
  if (kind === 'away' && !overlayVisible && canTrigger()) {
    window.electronAPI.notifyAway();
    overlayVisible = true;
  }

  if (kind === 'back' && overlayVisible && canTrigger()) {
    window.electronAPI.notifyBack();
    overlayVisible = false;
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
}

function startRecognition() {
  if (mode !== 'listener') {
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('[voice] Web Speech API не поддерживается в текущей среде Electron.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = APP_CONFIG.recognitionLang;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const alternative = result?.[0];
    const transcript = (alternative?.transcript || '').trim();

    if (!transcript) {
      return;
    }

    window.electronAPI.notifyTranscript({
      transcript,
      confidence: alternative?.confidence ?? null,
      isFinal: Boolean(result?.isFinal)
    });

    console.log(`[voice] ${transcript}`);
    const command = classifyTranscript(transcript);
    if (command !== 'none') {
      console.log(`[voice] matched: ${command}`);
      onVoiceCommand(command);
    }
  };

  recognition.onerror = (event) => {
    console.warn(`[voice] recognition error: ${event.error}`);
  };

  recognition.onend = () => {
    setTimeout(() => recognition.start(), 350);
  };

  recognition.start();
  console.log('[voice] listening started');
}

setupOverlayAnimations();
setupMonitorSubscriptions();
startRecognition();
