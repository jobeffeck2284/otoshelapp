from __future__ import annotations

import difflib
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

from config import TriggerConfig

logger = logging.getLogger(__name__)


@dataclass
class TriggerResult:
    event: Optional[str]
    score: float
    matched_phrase: Optional[str] = None


class TriggerEngine:
    def __init__(self, cfg: TriggerConfig) -> None:
        self.cfg = cfg
        self._last_event_ts = 0.0
        self._last_phrase_ts = 0.0

    @staticmethod
    def _normalize(text: str) -> str:
        text = unicodedata.normalize("NFKD", text).lower().strip()
        text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
        text = re.sub(r"\s+", " ", text)
        return text

    def _best_match(self, text: str, candidates: Iterable[str]) -> tuple[float, Optional[str]]:
        best_score = 0.0
        best_phrase = None
        for phrase in candidates:
            normalized_phrase = self._normalize(phrase)
            score = difflib.SequenceMatcher(None, text, normalized_phrase).ratio()
            if normalized_phrase in text:
                score = max(score, 0.99)
            if score > best_score:
                best_score = score
                best_phrase = phrase
        return best_score, best_phrase

    def evaluate(self, phrase: str, state: str) -> TriggerResult:
        now = time.monotonic()
        normalized = self._normalize(phrase)
        if not normalized:
            return TriggerResult(event=None, score=0.0)

        if now - self._last_phrase_ts < self.cfg.cooldown_seconds:
            return TriggerResult(event=None, score=0.0)

        self._last_phrase_ts = now

        if now - self._last_event_ts < self.cfg.debounce_seconds:
            logger.debug("Trigger debounce active, ignoring phrase: %s", phrase)
            return TriggerResult(event=None, score=0.0)

        away_score, away_phrase = self._best_match(normalized, self.cfg.away_phrases)
        back_score, back_phrase = self._best_match(normalized, self.cfg.back_phrases)

        if state == "IDLE" and away_score >= self.cfg.fuzzy_threshold and away_score >= back_score:
            self._last_event_ts = now
            return TriggerResult(event="AWAY", score=away_score, matched_phrase=away_phrase)

        if state == "AWAY" and back_score >= self.cfg.fuzzy_threshold and back_score >= away_score:
            self._last_event_ts = now
            return TriggerResult(event="BACK", score=back_score, matched_phrase=back_phrase)

        return TriggerResult(event=None, score=max(away_score, back_score))
