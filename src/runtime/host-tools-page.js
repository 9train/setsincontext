// Host-only tooling page glue for jog calibration/debug helpers. This module wires existing tools into host.html without owning controller truth, board rendering, MIDI boot, or WebSocket boot.

function getDefaultDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function getDefaultWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function assertInstallJogRuntime(installJogRuntime) {
  if (typeof installJogRuntime !== 'function') {
    throw new TypeError('initHostToolsPage requires installJogRuntime');
  }
}

export function initHostToolsPage({
  runtimeApp,
  documentRef = getDefaultDocument(),
  windowRef = getDefaultWindow(),
  boardHost = null,
  getUnifiedMap,
  installJogRuntime,
  attachJogCalibrationModal,
  installHostDebug,
  hostStatus = null,
} = {}) {
  assertInstallJogRuntime(installJogRuntime);

  const readUnifiedMap = () => getUnifiedMap?.() || [];

  const jogRuntime = installJogRuntime({
    getUnifiedMap: readUnifiedMap,
    exposeGlobalControls: true,
  });

  const jogCalibration = typeof attachJogCalibrationModal === 'function'
    ? attachJogCalibrationModal({
        jogRuntime,
        trigger: documentRef?.getElementById?.('openJogCalibration') || null,
      })
    : null;

  const hostDebug = typeof installHostDebug === 'function'
    ? installHostDebug({
        getUnifiedMap: readUnifiedMap,
        consumeInfo: (info) => runtimeApp.consumeInfo(info),
        getWSClient: () => runtimeApp.getWSClient(),
      })
    : null;

  return {
    jogRuntime,
    jogCalibration,
    hostDebug,
  };
}
