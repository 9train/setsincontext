// /src/bootstrap-host.js
// SOP REVISION: adds map bootstrap + ensure-on-connect/reconnect while preserving OG behavior.
// - Keeps original host WS init (role/url/room, onInfo, onStatus)
// - Reuses shared map bootstrap helpers for cached/static map load + runtime map state
// - Listens for map:sync to persist current room map and notify local listeners
// - After connect: request map, wait ~700ms for server replay; if none, push local via map:ensure
// - On first reconnect after open: repeat the ensure logic

import { connectWS } from './ws.js';
import {
  getBootAccessTokens,
  getBootRoom,
  getBootSessionMetadata,
  resolveBootWSURL,
} from './bootstrap-shared.js';
import { loadFallbackMap, rememberRuntimeMap } from './map-bootstrap.js';
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
  let openedOnce = false;
  let reconnectEnsureTried = false;

  function noteSync(msg){
    if (msg?.type === 'map:sync' && Array.isArray(msg.map)) {
      // record we have a server map
      lastSyncKey = msg.key || keyOf(msg.map);
      rememberRuntimeMap(msg.map);
      // notify listeners
      try { window.dispatchEvent(new CustomEvent('flx:map-updated')); } catch {}
    }
  }

  async function ensureRoomMapForOpen(ws, { label = 'initial' } = {}) {
    if (!ws) return;
    try { ws.send(JSON.stringify({ type:'map:get' })); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (lastSyncKey) return;
    const local = await loadFallbackMap();
    if (!local) return;
    const key = keyOf(local);
    try {
      ws.send(JSON.stringify({ type:'map:ensure', map: local, key }));
      console.log(`[host] map:ensure${label === 'reconnect' ? ' (reconnect)' : ''} sent`, key, 'entries=', local.length);
    } catch (e) {
      console.warn(`[host] ${label} ensure failed`, e);
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
    onOpen: ({ socket }) => {
      if (!openedOnce) {
        openedOnce = true;
        void ensureRoomMapForOpen(socket, { label: 'initial' });
        return;
      }
      if (!reconnectEnsureTried && !lastSyncKey) {
        reconnectEnsureTried = true;
        void ensureRoomMapForOpen(socket, { label: 'reconnect' });
      }
    },
  });
  runtimeApp?.setWSClient(wsClient);
})();
