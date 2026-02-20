"""Application configuration for voice-triggered away screen."""

from __future__ import annotations

APP_CONFIG = {
    "screen": {
        "away_text": "Я отошел. Скоро вернусь.",
        "window_title": "Away Mode",
    },
    "phrases": {
        "away": [
            "я отойду",
            "я отошел",
            "я отошла",
            "я срать",
            "я покакать",
            "я скоро вернусь",
            "отойду ненадолго",
            "я сейчас отойду",
            "я на минутку",
        ],
        "back": [
            "я вернулся",
            "я вернулась",
            "я тут",
            "я на месте",
            "я снова здесь",
        ],
    },
    "speech": {
        "engine": "vosk",  # "vosk" or "whisper"
        "language": "ru",
        "sample_rate": 16000,
        "chunk_size": 4000,
        "energy_threshold": 350,
        "pause_threshold": 0.6,
        "phrase_time_limit": 4,
        "vosk_model_path": "models/vosk-model-small-ru-0.22",
    },
    "trigger": {
        "fuzzy_threshold": 0.72,
        "partial_threshold": 0.83,
        "debounce_seconds": 3.0,
        "cooldown_seconds": 1.5,
        "min_phrase_length": 5,
    },
    "logging": {
        "level": "INFO",
        "log_file": "app.log",
    },
}
