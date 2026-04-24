import { getRuntimeApp } from './app-bridge.js';

export function installHostProbeOnFirstConnect({
  runtimeApp = getRuntimeApp(),
  probeId = Math.random().toString(36).slice(2, 9),
} = {}) {
  if (!runtimeApp) {
    return {
      id: probeId,
      sendProbeOnce: () => false,
      dispose: () => {},
    };
  }

  let sent = false;
  const listenerKey = Symbol('host-probe');

  function sendProbeOnce() {
    if (sent) return false;
    if (!runtimeApp.getWSClient?.()?.probe?.(probeId)) return false;
    sent = true;
    try { console.log('[probe] sent', probeId); } catch {}
    return true;
  }

  const dispose = runtimeApp.addWSStatusListener(listenerKey, (status) => {
    if (status === 'connected') {
      sendProbeOnce();
    }
  });

  if (runtimeApp.getWSStatus?.() === 'connected') {
    sendProbeOnce();
  }

  return {
    id: probeId,
    sendProbeOnce,
    dispose,
  };
}
