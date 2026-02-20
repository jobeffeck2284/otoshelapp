"""PyQt6 desktop app with HTML/CSS/JS UI and voice-triggered away mode."""

from __future__ import annotations

import logging
import signal
import sys
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, QUrl, Qt, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QGuiApplication
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout

from config import APP_CONFIG
from trigger_engine import TriggerEngine, TriggerType
from voice_listener import SpeechConfig, VoiceListener


class WebBridge(QObject):
    stateChanged = pyqtSignal(str)
    phraseLogged = pyqtSignal(str)

    @pyqtSlot(str)
    def log_from_js(self, message: str) -> None:
        logging.getLogger("WebBridge").debug("JS: %s", message)


class RecognizedDispatcher(QObject):
    recognized = pyqtSignal(str)


class AwayWindow(QWidget):
    def __init__(self, html_path: Path, bridge: WebBridge):
        super().__init__()
        self.bridge = bridge

        self.setWindowTitle(APP_CONFIG["screen"]["window_title"])
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setWindowModality(Qt.WindowModality.ApplicationModal)

        self.webview = QWebEngineView(self)
        self.channel = QWebChannel(self.webview.page())
        self.channel.registerObject("bridge", self.bridge)
        self.webview.page().setWebChannel(self.channel)
        self.webview.setUrl(QUrl.fromLocalFile(str(html_path.resolve())))

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.webview)

        self.hide()

    def show_away(self) -> None:
        screen = QGuiApplication.primaryScreen()
        if screen:
            self.setGeometry(screen.geometry())
        self.showFullScreen()
        self.raise_()
        self.activateWindow()


class AppController(QObject):
    def __init__(self, app: QApplication):
        super().__init__()
        self.app = app
        self.state = "STATE_IDLE"
        self.bridge = WebBridge()
        self.dispatcher = RecognizedDispatcher()
        self.dispatcher.recognized.connect(self._handle_recognized)

        trigger_cfg = APP_CONFIG["trigger"]
        self.trigger_engine = TriggerEngine(
            away_phrases=APP_CONFIG["phrases"]["away"],
            back_phrases=APP_CONFIG["phrases"]["back"],
            fuzzy_threshold=trigger_cfg["fuzzy_threshold"],
            partial_threshold=trigger_cfg["partial_threshold"],
            debounce_seconds=trigger_cfg["debounce_seconds"],
            cooldown_seconds=trigger_cfg["cooldown_seconds"],
            min_phrase_length=trigger_cfg["min_phrase_length"],
        )

        speech_cfg = SpeechConfig(**APP_CONFIG["speech"])
        self.voice_listener = VoiceListener(speech_cfg, self.dispatcher.recognized.emit)

        html_path = Path(__file__).parent / "ui" / "index.html"
        self.away_window = AwayWindow(html_path, self.bridge)

    def start(self) -> None:
        self.voice_listener.start()
        self.bridge.stateChanged.emit("IDLE")

    def shutdown(self) -> None:
        self.voice_listener.stop()
        self.away_window.close()

    @pyqtSlot(str)
    def _handle_recognized(self, text: str) -> None:
        logging.info("Recognized phrase: %s", text)
        self.bridge.phraseLogged.emit(text)

        trigger = self.trigger_engine.detect_trigger(text, self.state)
        if trigger is TriggerType.AWAY and self.state == "STATE_IDLE":
            self.state = "STATE_AWAY"
            self.away_window.show_away()
            self.bridge.stateChanged.emit("AWAY")
            logging.info("Switched to AWAY")
        elif trigger is TriggerType.BACK and self.state == "STATE_AWAY":
            self.state = "STATE_IDLE"
            self.away_window.hide()
            self.bridge.stateChanged.emit("IDLE")
            logging.info("Switched to IDLE")


def setup_logging() -> None:
    cfg = APP_CONFIG["logging"]
    logging.basicConfig(
        level=getattr(logging, cfg["level"], logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(cfg["log_file"], encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def main() -> int:
    setup_logging()
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    controller = AppController(app)
    controller.start()

    def on_signal(*_args):
        controller.shutdown()
        app.quit()

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    timer = QTimer()
    timer.start(400)
    timer.timeout.connect(lambda: None)

    app.aboutToQuit.connect(controller.shutdown)
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
