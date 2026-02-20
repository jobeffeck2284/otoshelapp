(() => {
  const body = document.body;
  const awayTextNode = document.getElementById('awayText');
  const stateLabel = document.getElementById('stateLabel');

  const state = {
    mode: 'IDLE',
  };

  const setState = (nextState) => {
    state.mode = nextState;
    body.dataset.state = nextState;
    stateLabel.textContent = nextState;
  };

  const bindBridge = () => {
    if (!window.qt || !window.QWebChannel) {
      setTimeout(bindBridge, 250);
      return;
    }

    new QWebChannel(qt.webChannelTransport, (channel) => {
      const bridge = channel.objects.bridge;
      bridge.getInitialState((initialState) => setState(initialState || 'IDLE'));
      bridge.getAwayText((text) => {
        if (text) {
          awayTextNode.textContent = text;
        }
      });

      bridge.stateChanged.connect((next) => {
        setState(next || 'IDLE');
      });

      bridge.textChanged.connect((nextText) => {
        awayTextNode.textContent = nextText || 'Я отошел. Скоро вернусь.';
      });
    });
  };

  bindBridge();
})();
