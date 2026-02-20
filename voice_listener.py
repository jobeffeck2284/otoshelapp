from __future__ import annotations

import json
import logging
import queue
import threading
import time
from typing import Callable, Optional

from config import SpeechConfig

logger = logging.getLogger(__name__)


class VoiceListener(threading.Thread):
    def __init__(
        self,
        cfg: SpeechConfig,
        phrase_callback: Callable[[str], None],
        stop_event: threading.Event,
    ) -> None:
        super().__init__(daemon=True, name="VoiceListener")
        self.cfg = cfg
        self._phrase_callback = phrase_callback
        self._stop_event = stop_event
        self._audio_queue: queue.Queue[bytes] = queue.Queue(maxsize=cfg.max_queue_size)
        self._engine_name = "none"
        self._transcriber = None
        self._recognizer = None
        self._stream = None
        self._pa = None

    def run(self) -> None:
        try:
            self._setup_engine()
        except Exception as exc:
            logger.exception("Failed to setup speech engine: %s", exc)
            return

        logger.info("Voice listener started with engine: %s", self._engine_name)

        while not self._stop_event.is_set():
            try:
                chunk = self._audio_queue.get(timeout=self.cfg.idle_sleep_seconds)
            except queue.Empty:
                continue

            phrase = self._decode_chunk(chunk)
            if phrase:
                if self.cfg.log_every_phrase:
                    logger.info("Recognized phrase: %s", phrase)
                self._phrase_callback(phrase)

        self._teardown()

    def _setup_engine(self) -> None:
        self._setup_audio_stream()
        errors = []
        for engine_name in self.cfg.engine_priority:
            try:
                if engine_name == "vosk":
                    self._setup_vosk()
                    self._engine_name = "vosk"
                    return
                if engine_name == "whisper":
                    self._setup_whisper()
                    self._engine_name = "whisper"
                    return
            except Exception as exc:  # noqa: PERF203
                errors.append(f"{engine_name}: {exc}")
                logger.warning("Speech engine %s unavailable: %s", engine_name, exc)

        raise RuntimeError("No speech engine available. Details: " + "; ".join(errors))

    def _setup_audio_stream(self) -> None:
        try:
            import pyaudio
        except ImportError as exc:
            raise RuntimeError("PyAudio is required for microphone capture") from exc

        self._pa = pyaudio.PyAudio()

        input_device = self._pa.get_default_input_device_info()
        if not input_device:
            raise RuntimeError("No microphone device found")

        def callback(in_data, frame_count, time_info, status):
            if status:
                logger.debug("Audio callback status: %s", status)
            try:
                self._audio_queue.put_nowait(in_data)
            except queue.Full:
                logger.debug("Audio queue overflow, dropping frame")
            return (None, pyaudio.paContinue)

        self._stream = self._pa.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.cfg.sample_rate,
            input=True,
            frames_per_buffer=self.cfg.chunk_size,
            stream_callback=callback,
        )
        self._stream.start_stream()

    def _setup_vosk(self) -> None:
        from vosk import KaldiRecognizer, Model

        model = Model(lang="ru")
        self._recognizer = KaldiRecognizer(model, self.cfg.sample_rate)

    def _setup_whisper(self) -> None:
        import speech_recognition as sr

        self._recognizer = sr.Recognizer()
        self._transcriber = sr.AudioData

    def _decode_chunk(self, chunk: bytes) -> Optional[str]:
        if self._engine_name == "vosk":
            if self._recognizer.AcceptWaveform(chunk):
                result = json.loads(self._recognizer.Result())
                return result.get("text", "").strip()
            result = json.loads(self._recognizer.PartialResult())
            return result.get("partial", "").strip()

        if self._engine_name == "whisper":
            import speech_recognition as sr

            recognizer: sr.Recognizer = self._recognizer
            audio = self._transcriber(chunk, self.cfg.sample_rate, 2)
            try:
                return recognizer.recognize_whisper(audio, language="ru").strip()
            except sr.UnknownValueError:
                return None
            except Exception as exc:
                logger.warning("Whisper decode error: %s", exc)
                time.sleep(self.cfg.idle_sleep_seconds)
                return None

        return None

    def _teardown(self) -> None:
        if self._stream is not None:
            self._stream.stop_stream()
            self._stream.close()
        if self._pa is not None:
            self._pa.terminate()
        logger.info("Voice listener stopped")
