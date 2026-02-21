from dataclasses import dataclass, field
from typing import Tuple


@dataclass(frozen=True)
class TriggerConfig:
    away_phrases: Tuple[str, ...] = (
        "я отойду",
        "я отошел",
        "я отошла",
        "я срать",
        "я покакать",
        "я скоро вернусь",
        "отойду ненадолго",
        "скоро вернусь",
    )
    back_phrases: Tuple[str, ...] = (
        "я вернулся",
        "я вернулась",
        "я тут",
        "я на месте",
        "я снова здесь",
    )
    fuzzy_threshold: float = 0.74
    debounce_seconds: float = 3.0
    cooldown_seconds: float = 1.2


@dataclass(frozen=True)
class SpeechConfig:
    engine_priority: Tuple[str, ...] = ("vosk", "whisper")
    sample_rate: int = 16000
    chunk_size: int = 4096
    idle_sleep_seconds: float = 0.08
    max_queue_size: int = 8
    log_every_phrase: bool = True


@dataclass(frozen=True)
class UIConfig:
    away_text: str = "Я отошел. Скоро вернусь."
    state_idle: str = "IDLE"
    state_away: str = "AWAY"


@dataclass(frozen=True)
class AppConfig:
    trigger: TriggerConfig = field(default_factory=TriggerConfig)
    speech: SpeechConfig = field(default_factory=SpeechConfig)
    ui: UIConfig = field(default_factory=UIConfig)


CONFIG = AppConfig()
