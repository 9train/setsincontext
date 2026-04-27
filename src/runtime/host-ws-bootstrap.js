import { connectWS as defaultConnectWS } from '../ws.js';
import {
  getBootAccessTokens as defaultGetBootAccessTokens,
  getBootRoom as defaultGetBootRoom,
  getBootSessionMetadata as defaultGetBootSessionMetadata,
  resolveBootWSURL as defaultResolveBootWSURL,
} from '../bootstrap-shared.js';
import { acceptDraftMapCandidate as defaultAcceptDraftMapCandidate } from '../map-bootstrap.js';
import { getRuntimeApp as defaultGetRuntimeApp } from './app-bridge.js';

const WS_ROLE = 'host';

function keyOf(mapArr) {
  const s = JSON.stringify(mapArr || []);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return String(h >>> 0);
}

export function initHostWSBootstrap(options = {}) {
  const dependencies =
    options && typeof options.dependencies === 'object' && options.dependencies
      ? options.dependencies
      : {};
  const connectWS = dependencies.connectWS || defaultConnectWS;
  const getBootAccessTokens = dependencies.getBootAccessTokens || defaultGetBootAccessTokens;
  const getBootRoom = dependencies.getBootRoom || defaultGetBootRoom;
  const getBootSessionMetadata =
    dependencies.getBootSessionMetadata || defaultGetBootSessionMetadata;
  const resolveBootWSURL = dependencies.resolveBootWSURL || defaultResolveBootWSURL;
  const acceptDraftMapCandidate =
    dependencies.acceptDraftMapCandidate || defaultAcceptDraftMapCandidate;
  const getRuntimeApp = dependencies.getRuntimeApp || defaultGetRuntimeApp;

  const wsURL = resolveBootWSURL();
  const room = getBootRoom();
  const sessionMeta = getBootSessionMetadata();
  const { hostAccessToken } = getBootAccessTokens();
  const runtimeApp = getRuntimeApp();
  runtimeApp?.setRelayRuntime?.({ role: WS_ROLE, room, url: wsURL });

  let lastSyncKey = null;

  function noteSync(msg) {
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
    onInfo: (info) => {
      try { runtimeApp?.consumeInfo(info); } catch {}
    },
    onStatus: (status) => {
      try { runtimeApp?.setWSStatus(status); } catch {}
    },
    onMessage: (msg) => noteSync(msg),
  });
  runtimeApp?.setWSClient(wsClient);

  return { wsClient, runtimeApp, room, wsURL };
}
