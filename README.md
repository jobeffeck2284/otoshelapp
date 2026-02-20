# OtoShelApp

Мини-приложение на Electron, которое слушает голосовые команды и показывает полноэкранный экран "Я отошел".

## Запуск

```bash
npm install
npm start
```

## Что есть в приложении

- Фоновый listener-режим: постоянно слушает микрофон.
- Полноэкранный frameless overlay по голосовой команде.
- Тестовое окно распознавания справа сверху, где видно текущую распознанную фразу.

## Настройка

Все настраиваемые параметры находятся в `renderer/voiceListener.js` в объекте `APP_CONFIG`:

- `overlayText` — текст на экране.
- `triggerPhrases.away` — фразы для включения экрана.
- `triggerPhrases.back` — фразы для закрытия экрана.
- `debounceMs` — защита от многократных срабатываний.

## Файлы

- `main.js` — управление окнами Electron (overlay + listener + monitor).
- `preload.js` — безопасный bridge IPC.
- `renderer/index.html` — интерфейс для всех режимов.
- `renderer/styles.css` — визуальные эффекты/анимации.
- `renderer/voiceListener.js` — логика распознавания голоса, матчинг и обновление monitor-окна.
