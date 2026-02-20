"""Background microphone listener with pluggable speech recognition engines."""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class SpeechConfig:
    engine: str
    language: str
    sample_rate: int
    chunk_size: int
    energy_threshold: int
    pause_threshold: float
    phrase_time_limit: int
    vosk_model_path: str


class VoiceListener:
    def __init__(self, config: SpeechConfig, on_text: Callable[[str], None]):
        self.config = config
        self.on_text = on_text
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._audio_queue: queue.Queue[bytes] = queue.Queue(maxsize=8)
        self._logger = logging.getLogger(self.__class__.__name__)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="VoiceListener", daemon=True)
        self._thread.start()
        self._logger.info("Voice listener started")

    def stop(self, timeout: float = 2.0) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        self._logger.info("Voice listener stopped")

    def _run(self) -> None:
        engine = self.config.engine.lower().strip()
        try:
            if engine == "vosk":
                self._run_vosk()
            else:
                self._run_whisper()
        except Exception as exc:  # noqa: BLE001
            self._logger.exception("Speech engine error: %s", exc)

    def _run_vosk(self) -> None:
        try:
            import sounddevice as sd
            from vosk import KaldiRecognizer, Model
        except ImportError as exc:
            self._logger.error("Missing vosk dependencies: %s", exc)
            return

        try:
            model = Model(self.config.vosk_model_path)
        except Exception as exc:  # noqa: BLE001
            self._logger.error("Cannot load Vosk model at %s: %s", self.config.vosk_model_path, exc)
            return

        recognizer = KaldiRecognizer(model, self.config.sample_rate)
        recognizer.SetWords(False)

        def callback(indata, frames, time_info, status):  # noqa: ANN001
            if status:
                self._logger.warning("Microphone status: %s", status)
            if self._stop_event.is_set():
                return
            try:
                self._audio_queue.put_nowait(bytes(indata))
            except queue.Full:
                pass

        try:
            with sd.RawInputStream(
                samplerate=self.config.sample_rate,
                blocksize=self.config.chunk_size,
                dtype="int16",
                channels=1,
                callback=callback,
            ):
                self._logger.info("Microphone stream opened (vosk)")
                while not self._stop_event.is_set():
                    try:
                        data = self._audio_queue.get(timeout=0.3)
                    except queue.Empty:
                        continue

                    if recognizer.AcceptWaveform(data):
                        result = json.loads(recognizer.Result())
                        self._emit_text(result.get("text", ""))
                    else:
                        partial = json.loads(recognizer.PartialResult()).get("partial", "")
                        if partial:
                            self._emit_text(partial, partial=True)
        except Exception as exc:  # noqa: BLE001
            self._logger.error("Cannot open microphone input: %s", exc)

    def _run_whisper(self) -> None:
        try:
            import speech_recognition as sr
        except ImportError as exc:
            self._logger.error("Missing SpeechRecognition dependency: %s", exc)
            return

        recognizer = sr.Recognizer()
        recognizer.energy_threshold = self.config.energy_threshold
        recognizer.pause_threshold = self.config.pause_threshold

        try:
            mic = sr.Microphone(sample_rate=self.config.sample_rate)
        except Exception as exc:  # noqa: BLE001
            self._logger.error("Microphone unavailable: %s", exc)
            return

        with mic as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.5)

        self._logger.info("Microphone stream opened (whisper)")
        while not self._stop_event.is_set():
            try:
                with mic as source:
                    audio = recognizer.listen(
                        source,
                        timeout=1,
                        phrase_time_limit=self.config.phrase_time_limit,
                    )
                text = recognizer.recognize_whisper(audio, language=self.config.language)
                self._emit_text(text)
            except sr.WaitTimeoutError:
                continue
            except Exception as exc:  # noqa: BLE001
                self._logger.debug("Whisper recognition error: %s", exc)
                time.sleep(0.1)

    def _emit_text(self, text: str, partial: bool = False) -> None:
        text = text.strip()
        if not text:
            return
        if partial:
            self._logger.debug("Partial: %s", text)
            return
        self._logger.info("Recognized: %s", text)
        self.on_text(text)
