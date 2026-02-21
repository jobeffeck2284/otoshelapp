from __future__ import annotations

import logging
import signal
import sys
import threading
from pathlib import Path

from PyQt6.QtCore import QObject, QUrl, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QGuiApplication
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout
from PyQt6.QtCore import Qt

from config import CONFIG
from trigger_engine import TriggerEngine
from voice_listener import VoiceListener

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("away-app")


class WebBridge(QObject):
    stateChanged = pyqtSignal(str)
    textChanged = pyqtSignal(str)

    @pyqtSlot(result=str)
    def getInitialState(self) -> str:  # noqa: N802
        return CONFIG.ui.state_idle

    @pyqtSlot(result=str)
    def getAwayText(self) -> str:  # noqa: N802
        return CONFIG.ui.away_text


class AwayOverlay(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Away Overlay")
        self.setWindowFlag(Qt.WindowType.FramelessWindowHint, True)
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)
        self.setWindowFlag(Qt.WindowType.Tool, False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setCursor(Qt.CursorShape.BlankCursor)

        self.view = QWebEngineView(self)
        self.channel = QWebChannel(self.view.page())
        self.bridge = WebBridge()
        self.channel.registerObject("bridge", self.bridge)
        self.view.page().setWebChannel(self.channel)

        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.view)
        self.setLayout(layout)

        html_path = Path(__file__).parent / "ui" / "index.html"
        self.view.setUrl(QUrl.fromLocalFile(str(html_path.resolve())))

    def show_fullscreen(self) -> None:
        screen = QGuiApplication.primaryScreen()
        if screen:
            self.setGeometry(screen.geometry())
        self.showFullScreen()
        self.activateWindow()
        self.raise_()


class AppController(QObject):
    uiStateSignal = pyqtSignal(str)
    phraseSignal = pyqtSignal(str)

    def __init__(self, overlay: AwayOverlay) -> None:
        super().__init__()
        self.overlay = overlay
        self.state = CONFIG.ui.state_idle
        self.trigger_engine = TriggerEngine(CONFIG.trigger)
        self.stop_event = threading.Event()
        self.voice_listener = VoiceListener(
            cfg=CONFIG.speech,
            phrase_callback=self._on_phrase_from_thread,
            stop_event=self.stop_event,
        )
        self.uiStateSignal.connect(self.overlay.bridge.stateChanged.emit)
        self.phraseSignal.connect(self.on_phrase)
        self.overlay.bridge.textChanged.emit(CONFIG.ui.away_text)

    def start(self) -> None:
        self.voice_listener.start()
        logger.info("Controller started in state=%s", self.state)


    def _on_phrase_from_thread(self, phrase: str) -> None:
        self.phraseSignal.emit(phrase)

    @pyqtSlot(str)
    def on_phrase(self, phrase: str) -> None:
        logger.info("Phrase received: %s", phrase)
        result = self.trigger_engine.evaluate(phrase, self.state)
        if not result.event:
            return

        logger.info(
            "Trigger event=%s, matched=%s, score=%.3f",
            result.event,
            result.matched_phrase,
            result.score,
        )
        if result.event == "AWAY":
            self.enter_away()
        elif result.event == "BACK":
            self.exit_away()

    def enter_away(self) -> None:
        if self.state == CONFIG.ui.state_away:
            return
        self.state = CONFIG.ui.state_away
        self.overlay.show_fullscreen()
        self.uiStateSignal.emit(self.state)

    def exit_away(self) -> None:
        if self.state == CONFIG.ui.state_idle:
            return
        self.state = CONFIG.ui.state_idle
        self.overlay.hide()
        self.uiStateSignal.emit(self.state)

    def shutdown(self) -> None:
        logger.info("Shutting down")
        self.stop_event.set()
        if self.voice_listener.is_alive():
            self.voice_listener.join(timeout=3.0)


def main() -> int:
    app = QApplication(sys.argv)
    overlay = AwayOverlay()
    controller = AppController(overlay)

    def handle_shutdown(*_args):
        controller.shutdown()
        app.quit()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    app.aboutToQuit.connect(controller.shutdown)

    controller.start()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
