# OtoShelApp

Мини-приложение на Electron, которое слушает голосовые команды и показывает полноэкранный экран "Я отошел".

## Запуск

```bash
npm install
npm start
```

## Что есть в приложении

- Полностью **локальное распознавание речи (offline)** через `vosk` + `mic`.
- Фоновое прослушивание микрофона без зависимости от Web Speech API и сети.
- Полноэкранный frameless overlay по голосовой команде.
- Тестовое окно справа сверху: распознанная фраза, статус и подсказка.

## Настройка

Основные параметры в `main.js` в объекте `VOICE_CONFIG`:

- `modelDirCandidates` — список путей, где приложение ищет локальную модель Vosk.
- `triggerPhrases.away` — фразы для включения экрана.
- `triggerPhrases.back` — фразы для закрытия экрана.
- `debounceMs` — защита от многократных срабатываний.

## Установка локальной модели Vosk

1. Скачайте русскую модель Vosk (например `vosk-model-small-ru-0.22`).
2. Распакуйте её в папку проекта:

```text
models/vosk-model-small-ru-0.22
# или
model/vosk-model-small-ru-0.22
```

3. Убедитесь, что путь входит в `VOICE_CONFIG.modelDirCandidates` в `main.js`.



### Важно для Windows/Electron (vosk native)

Если в логе есть `Error in native callback` или `ошибка native-модуля vosk`, это обычно означает несовместимость нативного бинарника с текущей версией Electron ABI.

Выполните:

```bash
npm run rebuild-native
```

После этого перезапустите приложение (`npm start`).

## Диагностика

Если не распознаёт голос:
- Проверьте, что в `app.log` нет статуса `модель Vosk не найдена`.
- Проверьте устройство записи в Windows (микрофон по умолчанию).
- Проверьте, что `npm install` установил `vosk` и `mic` без ошибок.

## Логи приложения

Приложение пишет лог-файл со всеми ключевыми действиями и ошибками: запуск, статусы распознавания, распознанные фразы, срабатывания триггеров и ошибки.

Путь к логу:
- Windows: `%APPDATA%/otoshelapp/logs/app.log`
- Фактически используется `app.getPath("userData")/logs/app.log`

## Файлы

- `main.js` — окна Electron + локальный offline voice engine (Vosk).
- `preload.js` — bridge IPC для UI-событий.
- `renderer/index.html` — интерфейс для overlay и monitor.
- `renderer/styles.css` — визуальные эффекты/анимации.
- `renderer/voiceListener.js` — UI-подписки на статусы/транскрипты.


### Частые ошибки из лога

- `Cannot find module 'vosk'`
  - Выполните в папке проекта: `npm install`
  - Если не помогло: `npm i vosk mic`
- `Error in native callback` / `ошибка native-модуля vosk`
  - Выполните: `npm run rebuild-native`
  - Убедитесь, что версия Electron и ABI совпадают после rebuild
- `модель Vosk не найдена`
  - Проверьте, что модель лежит в одной из папок: `models/vosk-model-small-ru-0.22` или `model/vosk-model-small-ru-0.22`.
- Нечитаемые русские символы в PowerShell
  - Выполните: `chcp 65001` и перезапустите терминал.
