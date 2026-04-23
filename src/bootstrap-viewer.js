// /src/bootstrap-viewer.js
// Viewer WebSocket bootstrap (SOP-compliant full file)
// - Preserves OG behavior: role/room handling, URL resolution via getWSURL, normalizeInfo piping,
//   probe-ack installation with retry timer, and wsClient exposure.
// - Installs the canonical fallback map bootstrap so viewers still hydrate from
//   cached/static map state before or without a successful WS sync.

import { connectWS } from './ws.js';
import {
  getBootAccessTokens,
  getBootRoom,
  getBootSessionMetadata,
  resolveBootWSURL,
} from './bootstrap-shared.js';
import { FALLBACK_BOOT_DELAY_MS, installFallbackMapBootstrap } from './map-bootstrap.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

const VIEWER_REMOTE_SYNC_GRACE_MS = 250;

(() => {
  const WS_ROLE = 'viewer'; // OG: viewer role preserved
  const wsURL = resolveBootWSURL(); // OG: respects window.WS_URL override, else roles.js
  const room = getBootRoom(); // OG: room param preserved
  const sessionMeta = getBootSessionMetadata();
  const { accessToken } = getBootAccessTokens();
  const runtimeApp = getRuntimeApp();
  runtimeApp?.setRelayRuntime?.({ role: WS_ROLE, room, url: wsURL });

  // Give room sync a brief chance to land before fallback applies cached/static map state.
  installFallbackMapBootstrap({ delayMs: FALLBACK_BOOT_DELAY_MS + VIEWER_REMOTE_SYNC_GRACE_MS });

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
