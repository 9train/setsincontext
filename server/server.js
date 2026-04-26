// server/server.js
// Static web server + WebSocket + legacy/dev-only optional MIDI/HID bridges (ESM version)
// SOP merge: integrates rooms + map sync + presence + room-scoped MIDI relay
// while keeping original behavior (HTTP server, SINGLE_PORT, origin allow-list,
// HID/MIDI global broadcast, heartbeat, hello/join/ping).
//
// NEW (SOP): Adds probe fan-out & ack collection per room
//   - Host -> {type:'probe', id}  => server broadcasts to viewers and summarizes
//   - Viewer -> {type:'probe:ack', id} => server counts unique acks per probe
//
// NEW (SOP): Durable provisional room map metadata with immediate replay to new viewers
//   - Disk persistence to MAP_FILE (env) with debounce saves
//   - Stable key hashing for change detection (djb2 of canonical JSON)
//   - Supports {type:'map:set'},{type:'map:ensure'},{type:'map:get'}
//   - Sends {type:'map:sync', map, key} to viewers (raw, not wrapped)
//   - Room maps are draft/review metadata only, never controller truth

import path from 'path';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fsp from 'fs/promises';
import { createSessionRegistry } from './session-registry.js';
import { createSessionStore } from './session-store.js';

// ---- __filename / __dirname equivalents in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- Config (env with sensible defaults)
const PORT        = Number(process.env.PORT || 8080);
const HOST        = process.env.HOST || '0.0.0.0'; // bind to all interfaces
const WSPORT_ENV  = process.env.WSPORT;            // preserve original env override
const MIDI_INPUT  = process.env.MIDI_INPUT  || ''; // e.g., "DDJ-FLX6"
const MIDI_OUTPUT = process.env.MIDI_OUTPUT || ''; // unused here, kept for future

// Map persistence (SOP)
const MAP_FILE = process.env.MAP_FILE || './data/room_maps.json';

// Fly-friendly single port mode: attach WS to the HTTP server (no extra listener).
// Activates only when explicitly enabled; preserves original behavior otherwise.
const SINGLE_PORT =
  process.env.SINGLE_PORT === '1' ||
  process.env.FLY_IO === '1' ||
  !!process.env.FLY_MACHINE_ID;

// If SINGLE_PORT, default WS to the same port as HTTP unless explicitly overridden.
const WSPORT = Number(WSPORT_ENV ?? (SINGLE_PORT ? PORT : 8787));

// ---- Optional Origin allow-list (non-breaking by default)
// ENV support (original)
const SINGLE_ALLOWED = process.env.ALLOWED_ORIGIN?.trim();
const MULTI_ALLOWED  = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const LOCAL_DEV_ALLOWED = process.env.NODE_ENV === 'production'
  ? []
  : [
      `http://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}`,
      `http://0.0.0.0:${PORT}`,
      `http://[::1]:${PORT}`,
      // Allow the default local Vite origin used by the website doorway during development.
      'http://localhost:5173',
    ];

// HARD-CODED entries — replace with your real domains if desired.
const HARDCODED_ALLOWED = [
  'https://www.setsoutofcontext.com',
  'https://setsoutofcontext.com',
  // add any staging/subdomains you actually open from
];

// Build the final allow-list = ENV (if any) ∪ local loopback dev origins ∪ hard-coded production origins.
const HAS_ALLOWLIST = !!SINGLE_ALLOWED || MULTI_ALLOWED.length > 0 || HARDCODED_ALLOWED.length > 0;
const ALLOWED_ORIGINS = new Set([
  ...(SINGLE_ALLOWED ? [SINGLE_ALLOWED] : []),
  ...MULTI_ALLOWED,
  ...LOCAL_DEV_ALLOWED,
  ...HARDCODED_ALLOWED,
]);

// ---- Static web server
const app = express();
const ROOT_DIR = path.join(__dirname, '..');
const sessionStore = createSessionStore({
  filePath: process.env.SESSION_STORE_FILE || null,
});
const sessionRegistry = createSessionRegistry({ sessionStore });
const SESSION_META_KEYS = ['mode', 'visibility', 'sessionTitle', 'hostName'];
const PARTICIPANT_META_KEYS = ['viewerName', 'viewerEmail'];
const PUBLIC_SESSION_VISIBILITY = 'public';

function sendRootFile(name) {
  return (_req, res) => res.sendFile(path.join(ROOT_DIR, name));
}

function pickSessionMetadata(source) {
  if (!source || typeof source !== 'object') return {};
  const metadata = {};
  for (const key of SESSION_META_KEYS) {
    if (source[key] == null || source[key] === '') continue;
    metadata[key] = source[key];
  }
  if (source.title != null && source.title !== '' && metadata.sessionTitle == null) {
    metadata.sessionTitle = source.title;
  }
  return metadata;
}

function mergeSessionMetadata(...sources) {
  return Object.assign({}, ...sources.map(pickSessionMetadata));
}

function pickParticipantMetadata(source) {
  if (!source || typeof source !== 'object') return {};
  const metadata = {};
  for (const key of PARTICIPANT_META_KEYS) {
    if (source[key] == null || source[key] === '') continue;
    metadata[key] = source[key];
  }
  return metadata;
}

function mergeParticipantMetadata(...sources) {
  return Object.assign({}, ...sources.map(pickParticipantMetadata));
}

function normalizeAccessToken(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 240) : null;
}

function getForwardedHeaderValue(req, headerName) {
  const value = req.get(headerName);
  if (value == null || value === '') return null;
  const first = String(value).split(',')[0]?.trim();
  return first || null;
}

function resolveRequestProtocol(req) {
  const forwardedProto = getForwardedHeaderValue(req, 'x-forwarded-proto');
  if (forwardedProto === 'https') return 'https';
  if (forwardedProto === 'http') return 'http';
  return req.secure ? 'https' : 'http';
}

function resolveRequestHost(req) {
  return getForwardedHeaderValue(req, 'x-forwarded-host') || req.get('host') || null;
}

function buildViewerWSURL(req) {
  const host = resolveRequestHost(req);
  if (!host) return null;

  try {
    const url = new URL(`${resolveRequestProtocol(req)}://${host}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (!SINGLE_PORT) {
      url.port = String(WSPORT);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function buildViewerJoinUrlPath(req, room, { accessToken } = {}) {
  const params = new URLSearchParams();
  if (room) {
    params.set('room', String(room));
  }

  const wsURL = buildViewerWSURL(req);
  if (wsURL) {
    params.set('ws', wsURL);
  }

  const normalizedAccessToken = normalizeAccessToken(accessToken);
  if (normalizedAccessToken) {
    params.set('access', normalizedAccessToken);
  }

  return `/viewer.html?${params.toString()}`;
}

function createResolvedSessionPayload(req, session, { accessToken } = {}) {
  return {
    ok: true,
    room: session.room,
    mode: session.mode,
    visibility: session.visibility,
    title: session.title || '',
    hostName: session.hostName || '',
    status: session.status,
    viewerCount: Number.isFinite(session.viewerCount) ? session.viewerCount : 0,
    hostCount: Number.isFinite(session.hostCount) ? session.hostCount : 0,
    adHoc: !!session.adHoc,
    joinUrlPath: buildViewerJoinUrlPath(req, session.room, { accessToken }),
  };
}

function createPrivateInvitePayload(req, session, accessToken) {
  return {
    ok: true,
    room: session.room,
    visibility: session.visibility,
    title: session.title || '',
    hostName: session.hostName || '',
    joinUrlPath: buildViewerJoinUrlPath(req, session.room, { accessToken }),
  };
}

function createSessionAccessErrorPayload({ code, key, room } = {}) {
  if (code === 'invite_required') {
    return {
      status: 403,
      payload: {
        ok: false,
        error: 'private invite required',
        code: 'invite_required',
        requiresAccess: true,
        ...(key ? { key } : {}),
        ...(room ? { room } : {}),
      },
      closeReason: 'private invite required',
    };
  }

  if (code === 'invalid_access') {
    return {
      status: 403,
      payload: {
        ok: false,
        error: 'invalid private invite',
        code: 'invalid_access',
        requiresAccess: true,
        ...(key ? { key } : {}),
        ...(room ? { room } : {}),
      },
      closeReason: 'invalid private invite',
    };
  }

  if (code === 'host_access_required') {
    return {
      status: 403,
      payload: {
        ok: false,
        error: 'host access required',
        code: 'host_access_required',
        ...(room ? { room } : {}),
      },
      closeReason: 'host access required',
    };
  }

  if (code === 'not_private') {
    return {
      status: 409,
      payload: {
        ok: false,
        error: 'session is public',
        code: 'not_private',
        ...(room ? { room } : {}),
      },
      closeReason: 'session is public',
    };
  }

  return {
    status: 404,
    payload: {
      ok: false,
      error: 'session not found',
      ...(key ? { key } : {}),
      ...(room ? { room } : {}),
    },
    closeReason: 'session not found',
  };
}

function isPubliclyListableSession(session) {
  return session?.visibility === PUBLIC_SESSION_VISIBILITY;
}

// ---- Canonical app entrypoints
// Official runtime:
//   /host.html   -> host entrypoint
//   /viewer.html -> viewer entrypoint
//   / or /index.html -> lightweight launcher/redirect
app.get('/', sendRootFile('index.html'));
app.get('/index.html', sendRootFile('index.html'));
app.get('/host.html', sendRootFile('host.html'));
app.get('/viewer.html', sendRootFile('viewer.html'));
app.get('/styles.css', sendRootFile('styles.css'));
app.get('/flx6_map.json', sendRootFile('flx6_map.json'));

// Serve the public folder for compatibility assets (for example /learned_map.json)
// and retained legacy/demo files. The canonical entrypoints are routed above, so
// public/index.html is not the official / or /index.html page.
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// Also serve a relative ./public for local/dev convenience
app.use(express.static('public', { index: false }));

// Serve optional controller config artifacts without exposing unrelated repo roots.
app.use('/maps', express.static(path.join(__dirname, '..', 'maps'), { index: false }));

// Serve /src so ES module imports like /src/board.js load
app.use('/src', express.static(path.join(__dirname, '..', 'src')));

// Serve /assets from common locations
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/assets', express.static(path.join(__dirname, '..', 'src', 'assets')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Health endpoints
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/health',  (_req, res) => res.status(200).send('ok'));

app.get('/api/sessions', (_req, res) => {
  const sessions = sessionRegistry.listSessions().filter(isPubliclyListableSession);
  res.status(200).json({ sessions });
});

app.get('/api/sessions/resolve', (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const accessToken = normalizeAccessToken(req.query.access);
  if (!key) {
    res.status(400).json({ ok: false, error: 'missing session key' });
    return;
  }

  const result = sessionRegistry.resolveSessionAccess({ key, accessToken });
  if (!result.ok) {
    const accessError = createSessionAccessErrorPayload({ code: result.code, key });
    res.status(accessError.status).json(accessError.payload);
    return;
  }

  res.status(200).json(createResolvedSessionPayload(req, result.session, { accessToken: result.accessToken }));
});

app.get('/api/sessions/:room/invite', (req, res) => {
  const room = req.params.room;
  const hostAccessToken = normalizeAccessToken(req.query.hostAccess);
  const result = sessionRegistry.getPrivateInvite({ room, hostAccessToken });

  if (!result.ok) {
    const accessError = createSessionAccessErrorPayload({ code: result.code, room });
    res.status(accessError.status).json(accessError.payload);
    return;
  }

  res.status(200).json(createPrivateInvitePayload(req, result.session, result.accessToken));
});

app.get('/api/sessions/:room', (req, res) => {
  const room = req.params.room;
  const accessToken = normalizeAccessToken(req.query.access);
  const result = sessionRegistry.resolveSessionAccess({ key: room, accessToken });

  if (!result.ok) {
    const accessError = createSessionAccessErrorPayload({ code: result.code, room });
    res.status(accessError.status).json(accessError.payload);
    return;
  }
  res.status(200).json({ session: result.session });
});

// Optional: silence favicon errors
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));

const server = http.createServer(app);

function errorSummary(error) {
  if (!error) return {};
  return {
    error: error.message || String(error),
    code: error.code || null,
  };
}

function logRuntime(level, event, details = {}) {
  try {
    console[level](`[WS runtime] ${JSON.stringify({ event, ...details })}`);
  } catch {}
}

function logSocket(level, event, ws, details = {}) {
  logRuntime(level, event, {
    id: ws?.id || null,
    role: ws?.role || null,
    room: ws?.room || null,
    joined: !!ws?.joined,
    origin: ws?.origin || null,
    ...details,
  });
}

function safeTerminate(ws, reason) {
  logSocket('warn', 'socket-terminate', ws, { reason });
  try { ws.terminate(); } catch (error) {
    logSocket('warn', 'socket-terminate-failed', ws, { reason, ...errorSummary(error) });
  }
}

function safeClose(ws, code, reason) {
  try { ws.close(code, reason); } catch (error) {
    logSocket('warn', 'socket-close-failed', ws, { code, reason, ...errorSummary(error) });
  }
}

// --- Listen using process.env.PORT and bind to 0.0.0.0
server.listen(PORT, HOST, () => {
  console.log(`[HTTP] Listening on http://${HOST}:${PORT}  (SINGLE_PORT=${SINGLE_PORT ? 'on' : 'off'})`);
});
server.on('error', (error) => {
  logRuntime('error', 'http-server-error', {
    host: HOST,
    port: PORT,
    singlePort: SINGLE_PORT,
    ...errorSummary(error),
  });
});
server.on('clientError', (error, socket) => {
  logRuntime('warn', 'http-client-error', {
    host: HOST,
    port: PORT,
    ...errorSummary(error),
  });
  try {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    else socket.destroy();
  } catch {}
});

// ---- WebSocket server
let wss;
if (SINGLE_PORT) {
  wss = new WebSocketServer({ server });
  console.log(`[WS] Attached to HTTP server on ${HOST}:${PORT} (shared port)`);
} else {
  wss = new WebSocketServer({ host: HOST, port: WSPORT }, () => {
    console.log(`[WS] Listening on ws://${HOST}:${WSPORT} (separate port)`);
  });
}
wss.on('error', (error) => {
  logRuntime('error', 'ws-server-error', {
    host: HOST,
    port: WSPORT,
    singlePort: SINGLE_PORT,
    ...errorSummary(error),
  });
});

// --- Global broadcast helper (original; used by HID/MIDI bridge)
function broadcast(obj) {
  let msg;
  try { msg = JSON.stringify(obj); } catch (error) {
    logRuntime('warn', 'broadcast-serialize-failed', {
      type: obj?.type || null,
      ...errorSummary(error),
    });
    return;
  }
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

// === Rooms with presence + provisional lastMap (+ lastKey) ==================
// roomName -> { hosts:Set<WebSocket>, viewers:Set<WebSocket>, lastMap:Array|null, lastKey:string|null }
const rooms = new Map();
const ROOM_MAP_AUTHORITY = 'draft';
const ROOM_MAP_STATE = 'provisional';
const AUTO_JOIN_TYPES = new Set([
  'map:get',
  'map:set',
  'map:ensure',
  'midi',
  'controller_event',
  'probe',
  'probe:ack',
]);

function getRoom(roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, {
      hosts:   new Set(),
      viewers: new Set(),
      lastMap: null,
      lastKey: null,
    });
  }
  return rooms.get(roomName);
}

function createRoomMapSyncFrame(roomName, roomState) {
  return {
    type: 'map:sync',
    room: roomName,
    map: roomState.lastMap,
    key: roomState.lastKey,
    mapAuthority: ROOM_MAP_AUTHORITY,
    mapState: ROOM_MAP_STATE,
    controllerTruth: false,
    diagnosticOnly: true,
    mapLabel: 'provisional draft room map',
  };
}

function syncSessionForRoom(roomName) {
  if (!roomName) return null;
  const r = getRoom(roomName);
  return sessionRegistry.syncRoomState({
    room: roomName,
    hosts: r.hosts.size,
    viewers: r.viewers.size,
  });
}

function getSocketParticipantId(ws, roomName, role) {
  if (!ws) return null;
  if (!ws.participantIds) ws.participantIds = new Map();

  const participantKey = `${roomName || 'default'}\n${role || 'viewer'}`;
  if (!ws.participantIds.has(participantKey)) {
    ws.participantSeq = (ws.participantSeq || 0) + 1;
    ws.participantIds.set(participantKey, `participant_${ws.id}_${ws.participantSeq}`);
  }
  return ws.participantIds.get(participantKey);
}

function recordSocketParticipantJoin(ws, { room, role, metadata } = {}) {
  const participantId = getSocketParticipantId(ws, room, role);
  if (!participantId) return null;

  const participant = sessionRegistry.recordParticipantJoin({
    room,
    role,
    participantId,
    anonymousId: ws.id,
    metadata,
  });
  if (participant?.participantId) {
    ws.participantId = participant.participantId;
  }
  return participant;
}

function markSocketParticipantDisconnected(ws) {
  if (!ws?.participantId) return null;
  const participant = sessionRegistry.markParticipantDisconnected({
    participantId: ws.participantId,
  });
  ws.participantId = null;
  return participant;
}

// Presence broadcast
function broadcastPresence(roomName) {
  const r = getRoom(roomName);
  const msg = JSON.stringify({
    type: 'presence',
    room: roomName,
    hosts: r.hosts.size,
    viewers: r.viewers.size
  });
  for (const s of [...r.hosts, ...r.viewers]) {
    try { if (s.readyState === WebSocket.OPEN) s.send(msg); } catch {}
  }
}

function denySocketJoin(ws, room, code) {
  const accessError = createSessionAccessErrorPayload({ code, room });
  send(ws, {
    type: 'access:denied',
    room,
    code: accessError.payload.code || 'session_not_found',
    error: accessError.payload.error,
  });
  logSocket('warn', 'socket-access-denied', ws, {
    room,
    accessCode: code,
  });
  safeClose(ws, 1008, accessError.closeReason);
}

function joinSocket(ws, { role, room, metadata } = {}) {
  const nextRole = String(role || ws.role || 'viewer').toLowerCase();
  const nextRoom = room || ws.room || 'default';
  const nextMetadata = mergeSessionMetadata(ws.sessionMeta, metadata);
  const nextParticipantMetadata = mergeParticipantMetadata(ws.participantMeta, metadata);
  const nextAccessToken = normalizeAccessToken(metadata?.access ?? ws.accessToken);
  const nextHostAccessToken = normalizeAccessToken(metadata?.hostAccess ?? ws.hostAccessToken);
  const prevRoom = ws.joined ? ws.room : null;
  const prevRole = ws.role;
  const sameMembership = ws.joined && prevRoom === nextRoom && prevRole === nextRole;
  const authorization = sessionRegistry.authorizeSessionJoin({
    room: nextRoom,
    role: nextRole,
    accessToken: nextAccessToken,
    hostAccessToken: nextHostAccessToken,
  });

  if (!authorization.ok) {
    ws.accessToken = nextAccessToken;
    ws.hostAccessToken = nextHostAccessToken;
    denySocketJoin(ws, nextRoom, authorization.code);
    return null;
  }

  if (!sameMembership && ws.joined) {
    const prev = getRoom(prevRoom);
    prev.hosts.delete(ws);
    prev.viewers.delete(ws);
    markSocketParticipantDisconnected(ws);
    syncSessionForRoom(prevRoom);
  }

  ws.role = nextRole;
  ws.room = nextRoom;
  ws.sessionMeta = nextMetadata;
  ws.participantMeta = nextParticipantMetadata;
  ws.accessToken = nextAccessToken;
  ws.hostAccessToken = nextHostAccessToken;

  const r = getRoom(nextRoom);

  if (!sameMembership) {
    if (ws.role === 'host') r.hosts.add(ws); else r.viewers.add(ws);
    ws.joined = true;

    send(ws, { type: 'presence', room: ws.room, hosts: r.hosts.size, viewers: r.viewers.size });
    if (prevRoom && prevRoom !== nextRoom) broadcastPresence(prevRoom);
    broadcastPresence(ws.room);

    if (ws.role === 'viewer' && r.lastMap && Array.isArray(r.lastMap) && r.lastMap.length) {
      send(ws, createRoomMapSyncFrame(ws.room, r));
    }
  }

  sessionRegistry.recordJoin({
    room: nextRoom,
    role: nextRole,
    hosts: r.hosts.size,
    viewers: r.viewers.size,
    metadata: nextMetadata,
    hostAccessToken: nextHostAccessToken,
  });
  recordSocketParticipantJoin(ws, {
    room: nextRoom,
    role: nextRole,
    metadata: nextParticipantMetadata,
  });

  logSocket('log', 'socket-join', ws, {
    prevRoom,
    prevRole,
    sameMembership,
  });

  return getRoom(ws.room);
}

function ensureJoinedForMessage(ws, msg) {
  if (ws.joined || !AUTO_JOIN_TYPES.has(msg?.type)) return false;

  let nextRole = ws.role || 'viewer';
  if (msg.type === 'map:set' || msg.type === 'map:ensure' || msg.type === 'controller_event' || msg.type === 'probe') {
    nextRole = 'host';
  } else if (msg.type === 'probe:ack') {
    nextRole = 'viewer';
  }

  const joinedRoom = joinSocket(ws, {
    role: nextRole,
    room: msg.room || ws.room || 'default',
    metadata: msg,
  });
  if (!joinedRoom) return false;
  logSocket('log', 'socket-auto-join', ws, { trigger: msg.type });
  return true;
}

// Keep viewer-scoped helper used by host → viewers info relay for legacy payloads.
function broadcastToViewers_wrapped(room, payload, exceptWs) {
  // This preserves the original "wrap as {type:'info', payload}" behavior.
  const msg = JSON.stringify({ type: 'info', payload, room });
  for (const client of wss.clients) {
    if (
      client !== exceptWs &&
      client.readyState === WebSocket.OPEN &&
      client.joined &&
      client.room === room &&
      client.role === 'viewer'
    ) {
      try { client.send(msg); } catch {}
    }
  }
}

// NEW (SOP): raw viewer broadcast (no wrapping) for map:sync, etc.
function broadcastToViewers_raw(room, obj, exceptWs) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (
      client !== exceptWs &&
      client.readyState === WebSocket.OPEN &&
      client.joined &&
      client.room === room &&
      client.role === 'viewer'
    ) {
      try { client.send(msg); } catch {}
    }
  }
}

// Convenience send
function send(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  } catch (error) {
    logSocket('warn', 'socket-send-failed', ws, {
      type: obj?.type || null,
      ...errorSummary(error),
    });
  }
}

function cleanupProbeCollectorsForSocket(ws, reason) {
  let removed = 0;
  for (const [key, col] of probeCollectors) {
    if (col?.host === ws) {
      probeCollectors.delete(key);
      removed += 1;
    }
  }
  if (removed > 0) {
    logSocket('log', 'probe-collector-cleanup', ws, { reason, removed });
  }
}

// === NEW (SOP): Map persistence helpers =====================================
function keyOf(mapArr){
  // stable hash (djb2) of the canonical JSON
  const s = JSON.stringify(mapArr);
  let h=5381; for (let i=0;i<s.length;i++) h = ((h<<5)+h) ^ s.charCodeAt(i);
  return String(h>>>0);
}

function normalizeRoomMapOwnership(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'fallback' ? 'fallback' : ROOM_MAP_AUTHORITY;
}

function hasUsableRoomMapEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const target = String(entry.target || '').trim();
  const key = String(entry.key || '').trim();
  const type = String(entry.type || '').trim().toLowerCase();
  const channel = Number(entry.ch);
  const code = Number(entry.code);

  if (target && key) return true;
  if (!target || !type) return false;
  return Number.isFinite(channel) && Number.isFinite(code);
}

function normalizeRoomDraftMap(mapArr) {
  if (!Array.isArray(mapArr) || mapArr.length === 0) return [];
  return mapArr
    .filter(hasUsableRoomMapEntry)
    .map((entry) => ({
      ...entry,
      ownership: normalizeRoomMapOwnership(entry.ownership),
    }));
}

async function loadMapsFromDisk(){
  try {
    const txt = await fsp.readFile(MAP_FILE, 'utf8');
    const j = JSON.parse(txt || '{}');
    const loadedRooms = Object.keys(j);
    for (const roomName of loadedRooms) {
      const arr = normalizeRoomDraftMap(j[roomName]);
      if (Array.isArray(arr) && arr.length) {
        const r = getRoom(roomName);
        r.lastMap = arr;
        r.lastKey = keyOf(arr);
      }
    }
    console.log('[MAP] loaded rooms from disk:', loadedRooms);
  } catch (e) {
    // ok if missing; log only if file exists but is corrupt
    if (fs.existsSync(path.dirname(MAP_FILE))) {
      console.warn('[MAP] load skipped or failed:', e?.message || e);
    }
  }
}

let saveTimer = null;
function scheduleSave(){
  if (saveTimer) return;
  saveTimer = setTimeout(async ()=> {
    saveTimer = null;
    const dump = {};
    for (const [roomName, r] of rooms) {
      if (Array.isArray(r.lastMap) && r.lastMap.length) dump[roomName] = r.lastMap;
    }
    try {
      await fsp.mkdir(path.dirname(MAP_FILE), { recursive:true });
      await fsp.writeFile(MAP_FILE, JSON.stringify(dump), 'utf8');
      // eslint-disable-next-line no-console
      console.log('[MAP] saved', Object.keys(dump));
    } catch(e){ console.warn('[MAP] save failed', e?.message || e); }
  }, 200);
}

// === NEW (SOP): Probe collection state ======================================
// Map key: `${room}:${probeId}` -> { acks:Set<string>, host:WebSocket }
const probeCollectors = new Map();

// --- Load persisted maps before accepting traffic ---------------------------
await loadMapsFromDisk();

// === WS connection handling ==================================================
wss.on('connection', (ws, req) => {
  ws.origin = req?.headers?.origin || null;

  // Allow-list guard — merged with allow-list and 1008 close
  if (HAS_ALLOWLIST) {
    const origin = req?.headers?.origin || '';
    if (!ALLOWED_ORIGINS.has(origin)) {
      logSocket('warn', 'socket-blocked-origin', ws, { origin });
      safeClose(ws, 1008, 'origin not allowed');
      return;
    }
  } else if (process.env.NODE_ENV === 'production' && process.env.ALLOWED_ORIGIN) {
    const origin = req?.headers?.origin;
    if (origin !== process.env.ALLOWED_ORIGIN) {
      logSocket('warn', 'socket-blocked-origin', ws, { origin, legacyCheck: true });
      safeClose(ws, 1008, 'origin not allowed');
      return;
    }
  }

  // Parse role/room from URL query (?role=host&room=default)
  try {
    const parsed = new URL(req.url, 'http://localhost');
    ws.role = (parsed.searchParams.get('role') || 'viewer').toLowerCase();
    ws.room = parsed.searchParams.get('room') || 'default';
    const queryMetadata = Object.fromEntries(parsed.searchParams.entries());
    ws.sessionMeta = pickSessionMetadata(queryMetadata);
    ws.participantMeta = pickParticipantMetadata(queryMetadata);
    ws.accessToken = normalizeAccessToken(parsed.searchParams.get('access'));
    ws.hostAccessToken = normalizeAccessToken(parsed.searchParams.get('hostAccess'));
  } catch {
    ws.role = 'viewer';
    ws.room = 'default';
    ws.sessionMeta = {};
    ws.participantMeta = {};
    ws.accessToken = null;
    ws.hostAccessToken = null;
  }

  // NEW: per-connection id (used for probe ack dedupe)
  ws.id = `c_${Math.random().toString(36).slice(2, 10)}`;
  ws.participantIds = new Map();
  ws.participantSeq = 0;
  ws.joined = false;
  logSocket('log', 'socket-open', ws, {
    url: req?.url || null,
  });

  // Heartbeat: mark alive and refresh on pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (error) => {
    logSocket('warn', 'socket-error', ws, errorSummary(error));
  });

  // Initial hello back (handshake)
  send(ws, { type: 'hello', ts: Date.now() });

  ws.on('message', (buf) => {
    let msg = null;
    try {
      msg = JSON.parse(buf.toString());
    } catch (error) {
      logSocket('warn', 'bad-frame', ws, {
        size: buf?.length ?? null,
        ...errorSummary(error),
      });
      return;
    }
    if (!msg) return;

    try {
      // Lightweight handshake support (kept)
      if (msg.type === 'hello') {
        if (msg.role) ws.role = String(msg.role).toLowerCase();
        if (msg.room) ws.room = msg.room;
        ws.sessionMeta = mergeSessionMetadata(ws.sessionMeta, msg);
        ws.participantMeta = mergeParticipantMetadata(ws.participantMeta, msg);
        if ('access' in msg) ws.accessToken = normalizeAccessToken(msg.access);
        if ('hostAccess' in msg) ws.hostAccessToken = normalizeAccessToken(msg.hostAccess);
        return;
      }

      // Room join / role update
      if (msg.type === 'join') {
        joinSocket(ws, {
          role: msg.role ? String(msg.role).toLowerCase() : ws.role,
          room: msg.room || ws.room || 'default',
          metadata: msg,
        });
        return;
      }

      // App-level ping (protocol ping/pong preferred, kept for compatibility)
      if (msg.type === 'ping') { return; }

      ensureJoinedForMessage(ws, msg);

      // === Map set/ensure/get/sync ============================================
      // Host sets/ensures a provisional draft room map for review/diagnostics.
      // It is replayed to viewers as metadata and never marks controller truth.
      // {type:'map:set', map:[...], key?:string}
      // {type:'map:ensure', map:[...], key:string}
      if (ws.role === 'host' && (msg.type === 'map:set' || msg.type === 'map:ensure') && Array.isArray(msg.map)) {
        const r = getRoom(ws.room);
        const draftMap = normalizeRoomDraftMap(msg.map);
        if (!draftMap.length) {
          send(ws, {
            type:'map:ack',
            room: ws.room,
            key: r.lastKey,
            viewers: r.viewers.size,
            accepted: false,
            reason: 'empty-draft-map',
            mapAuthority: ROOM_MAP_AUTHORITY,
            mapState: ROOM_MAP_STATE,
            controllerTruth: false,
          });
          return;
        }

        const inKey = msg.key || keyOf(draftMap);
        // Only update/broadcast if different
        if (r.lastKey !== inKey) {
          r.lastMap = draftMap;
          r.lastKey = inKey;
          // broadcast to viewers only (RAW, not wrapped)
          broadcastToViewers_raw(ws.room, createRoomMapSyncFrame(ws.room, r), ws);
          scheduleSave(); // optional: persist to disk
          console.log(`[MAP] ${msg.type} room="${ws.room}" entries=${draftMap.length} provisional`);
        }
        // ack back to host so you know the server saw it
        send(ws, {
          type:'map:ack',
          room: ws.room,
          key: r.lastKey,
          viewers: r.viewers.size,
          accepted: true,
          mapAuthority: ROOM_MAP_AUTHORITY,
          mapState: ROOM_MAP_STATE,
          controllerTruth: false,
        });
        return;
      }

      // Anyone can ask server for current map
      // {type:'map:get'}
      if (msg.type === 'map:get' && ws.room) {
        const r = getRoom(ws.room);
        if (r.lastMap && Array.isArray(r.lastMap) && r.lastMap.length) {
          send(ws, createRoomMapSyncFrame(ws.room, r));
        } else {
          send(ws, { type:'map:empty', room: ws.room });
        }
        return;
      }

      // === NEW (SOP): Probe fan-out and summary ================================
      // host -> server: {type:'probe', id}
      if (ws.role === 'host' && msg.type === 'probe' && msg.id) {
        const r = getRoom(ws.room);
        const key = `${ws.room}:${msg.id}`;
        const col = { acks: new Set(), host: ws };
        probeCollectors.set(key, col);

        // Fan out to viewers in the room
        for (const v of r.viewers) {
          send(v, { type:'probe', id: msg.id, room: ws.room });
        }

        // After 800ms, summarize back to the host and clear
        setTimeout(() => {
          const done = probeCollectors.get(key);
          if (!done) return;
          if (done.host !== ws) {
            probeCollectors.delete(key);
            return;
          }
          send(ws, {
            type: 'probe:summary',
            id: msg.id,
            room: ws.room,
            count: done.acks.size,
            totalViewers: r.viewers.size
          });
          probeCollectors.delete(key);
        }, 800);
        return;
      }

      // viewer -> server: {type:'probe:ack', id, viewerId?}
      if (ws.role === 'viewer' && msg.type === 'probe:ack' && msg.id) {
        const key = `${ws.room}:${msg.id}`;
        const col = probeCollectors.get(key);
        if (col) {
          // Use ws.id if available; otherwise generate a short token
          const vid = ws.id || `v${Math.random().toString(36).slice(2,7)}`;
          col.acks.add(vid);
        }
        return;
      }

      // === Room-scoped MIDI relay (unchanged feature)
      // Expect: { type:'midi', mtype:'noteon'|'noteoff'|'cc', ch, ... }
      // Relay to all clients in the same room EXCEPT the sender.
      if (msg.type === 'midi' && ws.room) {
        const r = getRoom(ws.room);
        const packet = JSON.stringify({ ...msg, room: ws.room });
        for (const s of [...r.hosts, ...r.viewers]) {
          if (s !== ws && s.readyState === WebSocket.OPEN) { try { s.send(packet); } catch {} }
        }
        return;
      }

      // === Normalized host→viewer relay
      // New controller events pass through in their explicit relay shape so viewers
      // can consume canonical fields directly.
      if (ws.role === 'host' && msg.type === 'controller_event' && msg.event && typeof msg.event === 'object') {
        broadcastToViewers_raw(ws.room, { type: 'controller_event', room: ws.room, event: msg.event }, ws);
        return;
      }

      // === Legacy host→viewer relay preserved (info wrapper)
      if (ws.role === 'host') {
        // Relay the original message as {type:'info', payload:<msg>, room}
        broadcastToViewers_wrapped(ws.room, msg, ws);
      }
    } catch (error) {
      logSocket('warn', 'message-handler-error', ws, {
        type: msg?.type || null,
        ...errorSummary(error),
      });
    }
  });

  ws.on('close', (code, reasonBuffer) => {
    const joinedBeforeClose = !!ws.joined;
    const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString() : String(reasonBuffer || '');
    cleanupProbeCollectorsForSocket(ws, 'close');
    logSocket('log', 'socket-close', ws, {
      code,
      reason,
      joinedBeforeClose,
    });
    if (!joinedBeforeClose) return;
    const roomName = ws.room;
    const r = getRoom(roomName);
    r.hosts.delete(ws);
    r.viewers.delete(ws);
    ws.joined = false;
    markSocketParticipantDisconnected(ws);
    syncSessionForRoom(roomName);
    // Broadcast updated presence when someone leaves
    broadcastPresence(roomName);
  });
});

// --- Server-side heartbeat: protocol pings every 30s (original)
const HEARTBEAT_MS = 30000;
const hbInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { safeTerminate(ws, 'heartbeat-timeout'); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_MS);

// Optional extra room-scoped heartbeat (env-gated)
const ENABLE_ROOM_HEARTBEAT = process.env.ROOM_HEARTBEAT === '1';
if (ENABLE_ROOM_HEARTBEAT) {
  setInterval(() => {
    for (const [_name, r] of rooms) {
      for (const ws of [...r.hosts, ...r.viewers]) {
        if (!ws.isAlive) { safeTerminate(ws, 'room-heartbeat-timeout'); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }
  }, HEARTBEAT_MS);
}

// Clean up interval on shutdown
process.on('SIGTERM', () => { clearInterval(hbInterval); server.close(()=>process.exit(0)); });
process.on('SIGINT',  () => { clearInterval(hbInterval); server.close(()=>process.exit(0)); });

// ---- Legacy/dev-only HID diagnostic bridge. Not part of canonical browser WebMIDI runtime.
if (process.env.HID_ENABLED === '1') {
  const { create: createHID } = await import('./hid.js');
  const hid = createHID({ enabled: true });
  // Keep original "broadcast to ALL clients" behavior for HID stream
  hid.on('info',  (info) => broadcast(info));
  hid.on('log',   (m)    => console.log('[HID]', m));
  hid.on('error', (e)    => console.warn('[HID] error:', e?.message || e));
}

// ---- Legacy/dev-only Node MIDI bridge. Canonical runtime uses browser WebMIDI from host.html.
let midiInput = null;
if (MIDI_INPUT) {
  try {
    const mod = await import('easymidi');         // dynamic ESM import of a CommonJS module
    const easymidi = mod.default ?? mod;          // interop: CJS may appear under .default

    const inputs = easymidi.getInputs();
    const outputs = easymidi.getOutputs();
    console.log('[MIDI] Inputs:', inputs);
    console.log('[MIDI] Outputs:', outputs);

    if (!inputs.includes(MIDI_INPUT)) {
      console.warn(`[MIDI] Input "${MIDI_INPUT}" not found. Set MIDI_INPUT to one of:`, inputs);
    } else {
      midiInput = new easymidi.Input(MIDI_INPUT);
      console.log(`[MIDI] Listening on: ${MIDI_INPUT}`);

      const send = (type, d) => {
        // easymidi channels are 0–15; UI code uses 1–16
        const ch = typeof d.channel === 'number' ? d.channel + 1 : (d.ch ?? 1);
        const info =
          type === 'cc'
            ? { type: 'cc', ch, controller: d.controller, value: d.value }
            : (type === 'noteon' || type === 'noteoff')
              ? { type, ch, d1: d.note, d2: d.velocity, value: d.velocity }
              : { type, ch, ...d };
        // Preserve original behavior: HID/MIDI bridge goes to ALL clients globally
        broadcast(info);
      };

      midiInput.on('noteon',  d => send('noteon', d));
      midiInput.on('noteoff', d => send('noteoff', d));
      midiInput.on('cc',      d => send('cc', d));
    }
  } catch {
    console.warn('[MIDI] easymidi not available. Skipping Node MIDI bridge. (WebMIDI in the browser will still work.)');
  }
}

// (export default is optional, handy for tests/tooling)
export default app;
