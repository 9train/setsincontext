// Host session/invite page wiring. This module wires injected host probe and
// private invite UI installers without owning server session logic, WebSocket
// boot, MIDI boot, board rendering, or controller truth.

export function initHostSessionPage({
  runtimeApp,
  installHostProbeOnFirstConnect,
  installPrivateInvitePanel,
} = {}) {
  if (typeof installHostProbeOnFirstConnect !== 'function') {
    throw new TypeError('initHostSessionPage requires installHostProbeOnFirstConnect');
  }

  if (typeof installPrivateInvitePanel !== 'function') {
    throw new TypeError('initHostSessionPage requires installPrivateInvitePanel');
  }

  const hostProbe = installHostProbeOnFirstConnect({ runtimeApp });
  const privateInvitePanel = installPrivateInvitePanel();

  return {
    hostProbe,
    privateInvitePanel,
  };
}
