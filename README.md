# OtoShelApp

Мини-приложение на Electron, которое слушает голосовые команды и показывает полноэкранный экран "Я отошел".

## Запуск

```bash
npm install
npm start
```

## Настройка

Все настраиваемые параметры находятся в `renderer/voiceListener.js` в объекте `APP_CONFIG`:

- `overlayText` — текст на экране.
- `triggerPhrases.away` — фразы для включения экрана.
- `triggerPhrases.back` — фразы для закрытия экрана.
- `debounceMs` — защита от многократных срабатываний.

## Файлы

- `main.js` — управление окнами Electron.
- `preload.js` — безопасный bridge IPC.
- `renderer/index.html` — интерфейс.
- `renderer/styles.css` — визуальные эффекты/анимации.
- `renderer/voiceListener.js` — логика распознавания голоса и матчинг команд.
