"""Trigger matching with fuzzy search, debounce and false-positive protection."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import Enum
from typing import Iterable


class TriggerType(str, Enum):
    AWAY = "away"
    BACK = "back"
    NONE = "none"


@dataclass
class TriggerEngine:
    away_phrases: list[str]
    back_phrases: list[str]
    fuzzy_threshold: float = 0.72
    partial_threshold: float = 0.83
    debounce_seconds: float = 3.0
    cooldown_seconds: float = 1.5
    min_phrase_length: int = 5
    _last_trigger_at: dict[TriggerType, float] = field(default_factory=dict)
    _last_processed_at: float = 0.0

    def detect_trigger(self, raw_text: str, current_state: str) -> TriggerType:
        text = self._normalize(raw_text)
        if len(text) < self.min_phrase_length:
            return TriggerType.NONE

        now = time.monotonic()
        if now - self._last_processed_at < self.cooldown_seconds:
            return TriggerType.NONE

        wanted = TriggerType.AWAY if current_state == "STATE_IDLE" else TriggerType.BACK
        candidates = self.away_phrases if wanted is TriggerType.AWAY else self.back_phrases
        if self._is_match(text, candidates):
            if self._debounced(wanted, now):
                return TriggerType.NONE
            self._last_trigger_at[wanted] = now
            self._last_processed_at = now
            return wanted

        return TriggerType.NONE

    def _debounced(self, trigger: TriggerType, now: float) -> bool:
        last = self._last_trigger_at.get(trigger)
        return bool(last and (now - last) < self.debounce_seconds)

    def _is_match(self, text: str, phrases: Iterable[str]) -> bool:
        for phrase in phrases:
            candidate = self._normalize(phrase)
            if text == candidate:
                return True
            ratio = SequenceMatcher(None, text, candidate).ratio()
            if ratio >= self.fuzzy_threshold:
                return True
            if self._partial_ratio(text, candidate) >= self.partial_threshold:
                return True
        return False

    @staticmethod
    def _normalize(text: str) -> str:
        text = text.lower().replace("ё", "е")
        text = re.sub(r"[^\w\s]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    @staticmethod
    def _partial_ratio(a: str, b: str) -> float:
        short, long_ = (a, b) if len(a) <= len(b) else (b, a)
        if not short:
            return 0.0

        max_score = 0.0
        window = len(short)
        for i in range(max(1, len(long_) - window + 1)):
            segment = long_[i : i + window]
            max_score = max(max_score, SequenceMatcher(None, short, segment).ratio())
            if max_score >= 1:
                break
        return max_score
