// /src/bootstrap-host.js
// SOP REVISION: host WS bootstrap for the official controller runtime.
// - Keeps original host WS init (role/url/room, onInfo, onStatus)
// - Listens for map:sync only as provisional draft room metadata
// - Does not seed room truth from cached/static learned maps on startup

import { connectWS } from './ws.js';
import {
  getBootAccessTokens,
  getBootRoom,
  getBootSessionMetadata,
  resolveBootWSURL,
} from './bootstrap-shared.js';
import { acceptDraftMapCandidate } from './map-bootstrap.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

(function hostBootstrap(){
  const WS_ROLE = 'host';
  const wsURL = resolveBootWSURL();
  const room = getBootRoom();
  const sessionMeta = getBootSessionMetadata();
  const { hostAccessToken } = getBootAccessTokens();
  const runtimeApp = getRuntimeApp();
  runtimeApp?.setRelayRuntime?.({ role: WS_ROLE, room, url: wsURL });

  // simple stable hash for versions
  function keyOf(mapArr){
    const s = JSON.stringify(mapArr || []);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return String(h >>> 0);
  }

  let lastSyncKey = null;

  function noteSync(msg){
    if (msg?.type === 'map:sync' && Array.isArray(msg.map)) {
      lastSyncKey = msg.key || keyOf(msg.map);
      acceptDraftMapCandidate(msg.map, {
        source: 'server-room-draft-map',
        state: msg.mapState || 'provisional',
        key: lastSyncKey,
        room: msg.room || room,
      });
    }
  }

  const wsClient = connectWS({
    url: wsURL,
    role: WS_ROLE,
    room,
    sessionMeta,
    hostAccessToken,
    onInfo:   (info) => { try { runtimeApp?.consumeInfo(info); } catch {} },
    onStatus: (s)   => { try { runtimeApp?.setWSStatus(s); } catch {} },
    onMessage: (msg)=> noteSync(msg),
  });
  runtimeApp?.setWSClient(wsClient);
})();
