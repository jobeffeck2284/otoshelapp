const APP_CONFIG = {
  overlayText: 'Я отошел. Скоро вернусь.',
  debounceMs: 8000,
  recognitionLang: 'ru-RU',
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

if (overlayTextElement) {
  overlayTextElement.textContent = APP_CONFIG.overlayText;
}

if (mode === 'listener') {
  document.body.style.background = 'transparent';
  document.querySelector('.ambient')?.remove();
  overlayElement?.remove();
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
  if (mode === 'listener' || !overlayElement) {
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

function startRecognition() {
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
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript ?? '')
      .join(' ')
      .trim();

    if (!transcript) {
      return;
    }

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
startRecognition();
