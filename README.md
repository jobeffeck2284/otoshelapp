# OtoshelApp

Десктопное приложение на Python (PyQt6), которое в фоне слушает микрофон и по голосовым триггерам показывает полноэкранный HTML/CSS/JS экран «Я отошел. Скоро вернусь.».

## Возможности

- Backend: Python + PyQt6
- UI: HTML/CSS/JavaScript в `QWebEngineView`
- Bridge между Python и JS: `QtWebChannel`
- Постоянное прослушивание микрофона в отдельном потоке
- Распознавание речи:
  - `vosk` (приоритетно, офлайн)
  - fallback на `SpeechRecognition` + Whisper
- Fuzzy matching триггер-фраз
- Защита от ложных срабатываний: cooldown + debounce
- Логирование распознанных фраз
- Корректное завершение приложения (graceful shutdown)

## Структура проекта

```text
project/
├── main.py
├── voice_listener.py
├── trigger_engine.py
├── config.py
├── README.md
├── requirements.txt
├── ui/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── animations.js
└── assets/
    ├── fonts/
    └── effects/
```

## Требования

- Python 3.10+
- Рабочий микрофон
- ОС с графической сессией (для запуска Qt/WebEngine)

## Быстрый старт

### 1) Создать виртуальное окружение

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2) Обновить pip и установить зависимости

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> Если установка `pyaudio` не проходит, сначала установите системные аудио-библиотеки/заголовки (например, PortAudio), затем повторите установку.

### 3) Запустить приложение

```bash
python main.py
```

## Настройка

Основные параметры находятся в `config.py`:

- `TriggerConfig`:
  - `away_phrases` — фразы ухода
  - `back_phrases` — фразы возвращения
  - `fuzzy_threshold` — порог нечеткого совпадения
  - `debounce_seconds` и `cooldown_seconds` — защита от дребезга/ложных срабатываний
- `SpeechConfig`:
  - `engine_priority` — приоритет движков (`vosk`, `whisper`)
  - параметры аудиопотока и буферов
- `UIConfig`:
  - `away_text` — текст на экране
  - имена состояний `IDLE`/`AWAY`

## Логика состояний

- `IDLE`: приложение в фоне слушает микрофон
- `AWAY`: показывается полноэкранный overlay (frameless + always on top)
- Возврат: по фразе «я вернулся / я тут / я на месте» overlay скрывается и снова активен режим `IDLE`

## Примечания

- Для `vosk` может потребоваться наличие языковой модели (в зависимости от окружения).
- Whisper-распознавание через `SpeechRecognition` используется как fallback.
- В headless/серверных средах без GUI приложение не запустится, так как требует Qt WebEngine.
