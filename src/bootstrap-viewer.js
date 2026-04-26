// /src/bootstrap-viewer.js
// Viewer WebSocket bootstrap (SOP-compliant full file)
// - Preserves OG behavior: role/room handling, URL resolution via getWSURL, normalizeInfo piping,
//   probe-ack installation with retry timer, and wsClient exposure.
// - Owns WebSocket boot and relay metadata only; viewer.html owns page UI and board setup.
// - Does not hydrate cached/static learned maps on startup. Any room map sync is
//   handled as draft/provisional metadata by the WS client, not render truth.

import { connectWS } from './ws.js';
import {
  getBootAccessTokens,
  getBootRoom,
  getBootSessionMetadata,
  resolveBootWSURL,
} from './bootstrap-shared.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

(() => {
  const WS_ROLE = 'viewer'; // OG: viewer role preserved
  const wsURL = resolveBootWSURL(); // OG: respects window.WS_URL override, else roles.js
  const room = getBootRoom(); // OG: room param preserved
  const sessionMeta = getBootSessionMetadata();
  const { accessToken } = getBootAccessTokens();
  const runtimeApp = getRuntimeApp();
  runtimeApp?.setRelayRuntime?.({ role: WS_ROLE, room, url: wsURL });

  // Connect WS with role + room (OG behavior)
  const wsClient = connectWS({
    url: wsURL,
    role: WS_ROLE,
    room,
    sessionMeta,
    accessToken,
    onInfo: (info) => {
      try { runtimeApp?.consumeNormalizedInfo(info); } catch {}
    },
    onStatus: (s) => {
      try { runtimeApp?.setWSStatus(s); } catch {}
    },
    onSocket: (ws) => {
      installProbeAck(ws);
    },
  });

  runtimeApp?.setWSClient(wsClient);

  // Optional: respond to probes (OG behavior maintained)
  function installProbeAck(ws) {
    if (!ws || ws.__probeAckInstalled) return;
    ws.__probeAckInstalled = true;
    ws.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch {}
      if (m?.type === 'probe' && m.id) {
        try { ws.send(JSON.stringify({ type: 'probe:ack', id: m.id })); } catch {}
      }
    });
  }
})();
