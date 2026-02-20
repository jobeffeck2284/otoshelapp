(() => {
  const stateLabel = document.getElementById('state-label');
  const body = document.body;

  const applyState = (nextState) => {
    body.dataset.state = nextState;
    stateLabel.textContent = nextState;
  };

  if (window.qt && window.QWebChannel) {
    new window.QWebChannel(qt.webChannelTransport, (channel) => {
      const bridge = channel.objects.bridge;
      bridge.stateChanged.connect((state) => {
        applyState(state);
      });
      bridge.phraseLogged.connect((phrase) => {
        bridge.log_from_js(`phrase: ${phrase}`);
      });
      bridge.log_from_js('webchannel connected');
    });
  } else {
    console.warn('Qt WebChannel is unavailable; running in standalone mode.');
  }

  applyState('IDLE');
})();
