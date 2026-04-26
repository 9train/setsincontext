// /src/ws.js
// CANONICAL WS CLIENT FOR THE OFFICIAL RUNTIME.
// Used by /src/bootstrap-host.js and /src/bootstrap-viewer.js.
//
// Drop-in replacement with path probing + room support,
// while preserving original public behavior and MIDI hooks.
//
// Public API (unchanged core, plus optional callback):
//   connectWS('ws://...', onInfo, onStatus)
//   connectWS({ url, role, room='default', sessionMeta, onInfo, onStatus, onMessage, onSocket, onOpen }) -> client
//
// Returned client exposes:
//   { url, socket, isAlive(), send(obj), sendMap(arr), close() }
//
// Notes:
// - Host relay now intentionally sends {type:'controller_event', event:{...}}
//   with normalized controller fields first, while preserving legacy MIDI-like
//   fields during the transition.
// - Relay payloads are transport-safe on purpose; local-only branches such as
//   profile/controllerState/raw/debug snapshots are not serialized over WS.
// - Viewers retain map sync frames as draft/provisional metadata
//   * Back-compat: legacy {type:'map_sync', payload:[...]} (old relays)
//   * New server:  {type:'map:sync', map:[...]}
//   These maps never become official render authority.
// - Normalizes controller relay events and emits them through the runtime bridge
//   learn/monitor contract, with legacy globals preserved as aliases
// - Adds candidate path probing and reconnection backoff
// - Adds periodic ping frames and optional idle-kill safety timer
//
// Server expectations (new bridge):
// - Broadcasts host controller events as: { type:'controller_event', event:{...} }
// - Older relays may still wrap frames as: { type:'info', payload: <whatever host sent> }
// - WS protocol ping/pong is handled at protocol level; not visible to JS

import { acceptDraftMapCandidate } from './map-bootstrap.js';
import { hasUsableMappings } from './mapper.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

const DEFAULT_ROOM = 'default';
const PATH_CANDIDATES = ['', '/ws', '/socket', '/socket/websocket', '/relay']; // try in order
const PING_EVERY_MS = 25000;
const SETTLE_MS = 1200;       // time after 'open' before we consider a path "good"
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;
// IMPORTANT: with a WS server doing protocol-level ping/pong, idle-kill can cause flapping.
// Keep feature but default to off (0). Set to >0 only if you truly want it.
const IDLE_KILL_MS = 0;

function log(...a){ try{ console.debug('[WS]', ...a);}catch{} }
function debugLog(...a){ try{ console.debug('[FLX debug]', ...a);}catch{} }

function addQuery(u, params){
  const hasQ = u.includes('?');
  const qs = new URLSearchParams(hasQ ? u.split('?')[1] : '');
  Object.entries(params).forEach(([k,v])=>{ if (v!=null) qs.set(k, String(v)); });
  return (hasQ ? u.split('?')[0] : u) + '?' + qs.toString();
}

function normalizeAccessToken(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 240) : null;
}

function pickSessionMeta(input) {
  const source = input && typeof input === 'object' ? input : {};
  const sessionMeta = {};
  ['mode', 'visibility', 'sessionTitle', 'hostName'].forEach((key) => {
    if (source[key] == null || source[key] === '') return;
    sessionMeta[key] = String(source[key]);
  });
  return sessionMeta;
}

// Back-compat exported function: supports (url, onInfo, onStatus) and ({...})
export function connectWS(urlOrOpts = 'ws://localhost:8787', onInfoPos = () => {}, onStatusPos = () => {}) {
  // Normalize options
  const opts = (typeof urlOrOpts === 'string')
    ? { url: urlOrOpts, onInfo: onInfoPos, onStatus: onStatusPos }
    : (urlOrOpts || {});

  const onInfo    = opts?.onInfo   || (()=>{});
  const onStatus  = opts?.onStatus || (()=>{});
  const role      = (opts?.role || 'viewer').toLowerCase();
  const room      = opts?.room || DEFAULT_ROOM;
  const sessionMeta = pickSessionMeta(opts?.sessionMeta);
  const accessToken = normalizeAccessToken(opts?.accessToken);
  const hostAccessToken = normalizeAccessToken(opts?.hostAccessToken);
  const accessQuery = role === 'host'
    ? (hostAccessToken ? { hostAccess: hostAccessToken } : {})
    : (accessToken ? { access: accessToken } : {});
  const joinPayload = { type:'join', role, room, ...sessionMeta, ...accessQuery };
  const wsQuery = { role, room, ...sessionMeta, ...accessQuery };
  const onMessage = opts?.onMessage; // generic message surface
  const onSocket  = opts?.onSocket;
  const onOpen    = opts?.onOpen;
  const runtimeApp = getRuntimeApp();

  // Resolve base URL (respect window.WS_URL like original guidance)
  let base = (opts?.url || (typeof window!=='undefined' && window.WS_URL) || '').trim();
  if (!base) {
    const host = (typeof location!=='undefined' && location.hostname) || 'localhost';
    base = (typeof location!=='undefined' && location.protocol==='https:' ? 'wss://' : 'ws://') + host + ':8787';
  }
  // strip trailing slash (we’ll add candidates)
  base = base.replace(/\/+$/,'');

  // Internal state
  let chosen = null;         // { ws, url }
  let reconnectAttempts = 0;
  let closedByUs = false;

  // Timers
  let pingTimer = null;
  let idleTimer = null;      // optional idle/heartbeat killer

  // Exposed client facade (mutated as we settle/reconnect)
  const client = {
    url: undefined,
    socket: undefined,
    isAlive: ()=> !!client.socket && client.socket.readyState === WebSocket.OPEN,

    // Host-only: send normalized controller relay events to the bridge.
    send: (info)=>{
      if (role !== 'host') return false;
      try {
        if (client.socket?.readyState === WebSocket.OPEN) {
          const relayEvent = buildRelayEvent(info);
          if (!relayEvent) return false;
          if (relayEvent.__flxDebug) {
            debugLog('host relayed event', relayEvent.__flxDebugKey || '', relayEvent.__flxDebugTarget || '');
          }
          client.socket.send(JSON.stringify({ type: 'controller_event', event: relayEvent }));
          return true;
        }
      } catch(e){}
      return false;
    },

    // Host-only: send a full draft/review mapping array.
    // Uses {type:'map:set', map:[...]} for new server compatibility; the
    // metadata marks the payload as provisional and not controller truth.
    sendMap: (arr)=>{
      if (role !== 'host') return false;
      const mapArr = Array.isArray(arr) ? arr : [];
      if (!hasUsableMappings(mapArr)) return false;
      try {
        if (client.socket?.readyState === WebSocket.OPEN) {
          client.socket.send(JSON.stringify({
            type:'map:set',
            map: mapArr,
            mapAuthority: 'draft',
            mapState: 'provisional',
            controllerTruth: false,
          }));
          return true;
        }
      } catch(e){}
      return false;
    },

    probe: (id)=>{
      if (role !== 'host') return false;
      try {
        if (client.socket?.readyState === WebSocket.OPEN) {
          client.socket.send(JSON.stringify({ type:'probe', id }));
          return true;
        }
      } catch(e){}
      return false;
    },

    close: ()=>{
      closedByUs = true;
      clearPing();
      clearIdle();
      try { client.socket?.close(1000, 'client closing'); } catch {}
    }
  };

  function setStatus(s){ try { onStatus(s); } catch {} }

  function clearPing(){ if (pingTimer) { clearInterval(pingTimer); pingTimer=null; } }
  function clearIdle(){ if (idleTimer) { clearTimeout(idleTimer); idleTimer=null; } }

  function startPing(ws){
    clearPing();
    pingTimer = setInterval(()=>{
      if (ws.readyState === WebSocket.OPEN) {
        // JSON ping for older bridges; harmless no-op for the new server
        try { ws.send(JSON.stringify({type:'ping', t:Date.now()})); } catch {}
      }
    }, PING_EVERY_MS);
  }

  function bumpIdleKill(ws){
    if (!IDLE_KILL_MS || IDLE_KILL_MS <= 0) return; // disabled by default to avoid flapping
    clearIdle();
    idleTimer = setTimeout(()=> {
      try { if (ws.readyState !== WebSocket.CLOSED) ws.close(); } catch {}
    }, IDLE_KILL_MS);
  }

  function wireSocket(ws, url, { helloSent = false } = {}){
    client.socket = ws;
    client.url    = url;
    try { onSocket && onSocket(ws, client); } catch {}

    let setupComplete = false;
    function finishOpenSetup(){
      if (setupComplete) return;
      setupComplete = true;

      setStatus('connected');

      // Path probing may have already sent hello on the winning socket.
      if (!helloSent) {
        try { ws.send(JSON.stringify({ type:'hello', role })); } catch {}
      }
      try { ws.send(JSON.stringify(joinPayload)); } catch {}

      // === IMPORTANT: Ask for map immediately (viewer) ===
      // Covers races with host push and ensures initial replay.
      try { ws.send(JSON.stringify({ type:'map:get' })); } catch {}

      startPing(ws);
      bumpIdleKill(ws);
      reconnectAttempts = 0; // success => reset backoff
      try { onOpen && onOpen({ socket: ws, client, role, room }); } catch {}

    }

    ws.addEventListener('open', finishOpenSetup);
    if (ws.readyState === WebSocket.OPEN) finishOpenSetup();

    ws.addEventListener('message', (ev)=>{
      bumpIdleKill(ws);

      // Try JSON; if server wraps {payload:...}, unwrap; else pass through
      let parsed = null;
      try { parsed = JSON.parse(ev.data); } catch { /* ignore non-JSON frames */ }
      if (!parsed) return;

      // The new relay broadcasts host frames as { type:'controller_event', event:{...} }
      // We also support older envelopes { type:'info', payload:{...} },
      // legacy { type:'midi_like', payload:{...} }, and bare controller-like objects.
      let info = null;

      // 1) Explicit normalized controller-event envelope
      if (parsed && parsed.type === 'controller_event' && parsed.event && typeof parsed.event === 'object') {
        info = parsed.event;
      }
      // 2) Older info-wrapped envelope
      else if (parsed && parsed.type === 'info' && 'payload' in parsed) {
        info = extractRelayEvent(parsed.payload);
      }
      // 3) Legacy midi_like envelope
      else if (parsed && parsed.type === 'midi_like' && parsed.payload) {
        info = extractRelayEvent(parsed.payload);
      }
      // 4) Bare controller-like objects
      else if (looksLikeMidi(parsed)) {
        info = parsed;
      }
      // 5) Generic unwrap as safety net
      else if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
        info = extractRelayEvent(parsed.payload);
      }

      // Existing viewer handling stays, but now prefers normalized controller fields.
      if (info) {
        const norm = normalizeInfo(info);
        if (norm && norm.__flxDebug) {
          debugLog(role === 'viewer' ? 'viewer received event' : 'host received event', norm.__flxDebugKey || '', norm.__flxDebugTarget || '');
        }
        try { onInfo(norm); } catch {}
        try { runtimeApp?.emitLearnInput(norm); } catch {}
        try { runtimeApp?.emitMonitorInput(norm); } catch {}
      }

      handleDraftMapSync(parsed);

      // Surface everything to optional generic handler (fires after onInfo pipeline)
      try { onMessage && onMessage(parsed); } catch {}
    });

    function handleDraftMapSync(parsed) {
      if (role === 'viewer') {
        // New server shape: { type:'map:sync', map:[...] }
        if (parsed?.type === 'map:sync' && Array.isArray(parsed.map)) {
          if (acceptDraftMapCandidate(parsed.map, {
            source: 'server-room-draft-map',
            state: parsed.mapState || 'provisional',
            key: parsed.key || null,
            room: parsed.room || room,
          })) {
            try { console.log('[map] retained draft candidate', parsed.map.length, 'entries'); } catch {}
          }
        }
        // Legacy relay shape: { type:'map_sync', payload:[...] }
        else if (parsed?.type === 'map_sync' && Array.isArray(parsed.payload)) {
          if (acceptDraftMapCandidate(parsed.payload, {
            source: 'legacy-map-sync-draft',
            state: 'provisional',
            key: parsed.key || null,
            room: parsed.room || room,
          })) {
            try { console.log('[map] retained legacy draft candidate', parsed.payload.length, 'entries'); } catch {}
          }
        }
      }
    }

    ws.addEventListener('close', (event)=>{
      clearPing();
      clearIdle();
      client.socket = undefined;
      client.url    = undefined;
      if (closedByUs) return; // don’t reconnect if caller closed explicitly
      if (event.code === 1008) {
        setStatus(event.reason || 'access denied');
        return;
      }
      setStatus('closed');

      // reconnect with capped exponential backoff
      const wait = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts++), RECONNECT_MAX_MS);
      setStatus(`retrying in ${Math.round(wait/1000)}s`);
      setTimeout(()=> dial(), wait);
    });

    ws.addEventListener('error', ()=>{ /* suppress noise; close handler will manage retry */ });
  }

  // Candidate-path probing with settle window; remember the winner for fast reconnects
  function tryOne(index, onDone){
    if (index >= PATH_CANDIDATES.length) { onDone(null); return; }

    const path = PATH_CANDIDATES[index];
    const urlWithPath = base + path;
    const url = addQuery(urlWithPath, wsQuery);

    let settled = false;
    let settleTimer = null;

    setStatus('connecting');
    let ws;
    try { ws = new WebSocket(url); } catch { /* try next */ tryOne(index+1, onDone); return; }

    ws.addEventListener('open', ()=>{
      // some relays want the first frame right away
      try { ws.send(JSON.stringify({ type:'hello', role })); } catch {}
      // consider it viable if it stays open for SETTLE_MS
      settleTimer = setTimeout(()=>{
        if (settled) return;
        settled = true;
        onDone({ ws, url: urlWithPath });
      }, SETTLE_MS);
    });

    ws.addEventListener('close', ()=>{
      clearTimeout(settleTimer);
      if (!settled) {
        // try next candidate
        tryOne(index+1, onDone);
      }
    });

    ws.addEventListener('error', ()=>{
      // let close handler advance to next
    });
  }

  function dial(){
    // If we already have a chosen path, reuse it first
    if (chosen && chosen.url) {
      try {
        const ws = new WebSocket(addQuery(chosen.url, wsQuery));
        wireSocket(ws, chosen.url);
        return;
      } catch {}
    }

    // Otherwise, probe candidates until one stays open briefly
    tryOne(0, (winner)=>{
      if (!winner) {
        setStatus('closed'); // none stayed open — keep trying later
        const wait = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts++), RECONNECT_MAX_MS);
        setStatus(`retrying in ${Math.round(wait/1000)}s`);
        setTimeout(()=> dial(), wait);
        return;
      }
      chosen = winner;
      wireSocket(winner.ws, winner.url, { helloSent: true });
    });
  }

  // initial dial
  setStatus('connecting');
  dial();

  return client;
}

// === Helpers preserved & harmonized ===

// Heuristic for bare controller-like object
function looksLikeMidi(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.eventType === 'normalized_input' || o.eventType === 'raw_input') return true;
  if (o.canonicalTarget != null || o.mappingId != null || o.mapped != null) return true;
  const t = typeof o.type === 'string' ? o.type.toLowerCase() : '';
  if (t === 'cc' || t === 'noteon' || t === 'noteoff' || t === 'pitch' || t === 'midi' || t === 'midi_like' || t === 'info' || t === 'controller_event') return true;
  // also accept objects that clearly look like MIDI (channel + code/value fields)
  if ((o.ch != null || o.channel != null || o.chan != null || o.port != null) &&
      (o.controller != null || o.note != null || o.d1 != null)) return true;
  return false;
}

function unwrapMidiEnvelope(p){
  let cur = p;
  let depth = 0;
  while (cur && typeof cur === 'object' && depth < 4) {
    const type = String(cur.type || '').toLowerCase();
    if ((type === 'info' || type === 'midi_like') && cur.payload && typeof cur.payload === 'object') {
      cur = cur.payload;
      depth += 1;
      continue;
    }
    if (type === 'controller_event' && cur.event && typeof cur.event === 'object') {
      cur = cur.event;
      depth += 1;
      continue;
    }
    if (cur.event && typeof cur.event === 'object' && depth === 0) {
      cur = cur.event;
      depth += 1;
      continue;
    }
    break;
  }
  return cur;
}

function extractRelayEvent(p) {
  const raw = unwrapMidiEnvelope(p);
  if (!raw || typeof raw !== 'object') return raw;
  return raw;
}

function asFiniteNumber(value) {
  if (value == null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asRelayString(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) target[key] = value;
}

function sanitizeRelayContext(context) {
  if (!context || typeof context !== 'object') return undefined;
  const out = {};
  Object.entries(context).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  });
  return Object.keys(out).length ? out : undefined;
}

function sanitizeRelayRender(render, raw) {
  const source = render && typeof render === 'object' ? render : null;
  const out = {};
  assignIfDefined(out, 'targetId', asRelayString(source && source.targetId || raw && raw.resolvedRenderTarget));
  assignIfDefined(out, 'truthStatus', asRelayString(source && source.truthStatus || raw && raw.truthStatus));
  assignIfDefined(out, 'source', asRelayString(source && source.source));
  const jogVisual = sanitizeRelayJogVisual(source && source.jogVisual);
  assignIfDefined(out, 'jogVisual', jogVisual);
  return Object.keys(out).length ? out : undefined;
}

function sanitizeRelayJogVisual(jogVisual) {
  if (!jogVisual || typeof jogVisual !== 'object') return undefined;
  const out = {};
  const side = asRelayString(jogVisual.side);
  if (side === 'L' || side === 'R') out.side = side;
  assignIfDefined(out, 'angle', asFiniteNumber(jogVisual.angle));
  assignIfDefined(out, 'vel', asFiniteNumber(jogVisual.vel));
  assignIfDefined(out, 'damping', asFiniteNumber(jogVisual.damping));
  assignIfDefined(out, 'lane', asRelayString(jogVisual.lane));
  assignIfDefined(out, 'motionMode', asRelayString(jogVisual.motionMode));
  if (typeof jogVisual.touchActive === 'boolean') out.touchActive = jogVisual.touchActive;
  assignIfDefined(out, 'touchLane', asRelayString(jogVisual.touchLane));
  assignIfDefined(out, 'authoredAt', asFiniteNumber(jogVisual.authoredAt));
  assignIfDefined(out, 'frameMs', asFiniteNumber(jogVisual.frameMs));
  return Object.keys(out).length ? out : undefined;
}

function sanitizeRelayBoardCompat(boardCompat) {
  if (!boardCompat || typeof boardCompat !== 'object') return undefined;
  const out = {};
  assignIfDefined(out, 'targetId', asRelayString(boardCompat.targetId));
  assignIfDefined(out, 'canonicalTarget', asRelayString(boardCompat.canonicalTarget));
  assignIfDefined(out, 'mappingId', asRelayString(boardCompat.mappingId));
  assignIfDefined(out, 'context', sanitizeRelayContext(boardCompat.context));
  assignIfDefined(out, 'profileId', asRelayString(boardCompat.profileId));
  assignIfDefined(out, 'source', asRelayString(boardCompat.source));
  assignIfDefined(out, 'reason', asRelayString(boardCompat.reason));
  return Object.keys(out).length ? out : undefined;
}

function buildRelayEvent(info) {
  const raw = normalizeInfo(info);
  if (!raw || typeof raw !== 'object') return null;

  const interaction = asRelayString(raw.interaction || raw.type || raw.mtype);
  const normalizedInteraction = interaction ? interaction.toLowerCase() : undefined;
  const type = normalizedInteraction || asRelayString(raw.type);
  const channel = asFiniteNumber(raw.ch ?? raw.channel ?? raw.chan ?? raw.port);
  const d1 = asFiniteNumber(raw.d1 ?? raw.controller ?? raw.note ?? raw.code);
  const d2 = asFiniteNumber(raw.d2 ?? raw.value ?? raw.velocity ?? raw.data2);
  const value = asFiniteNumber(raw.value ?? raw.d2);
  const mapped = raw.mapped != null ? !!raw.mapped : !!(raw.canonicalTarget || raw.mappingId);
  const timestamp = asFiniteNumber(raw.timestamp) ?? Date.now();
  const relay = {
    eventType: typeof raw.eventType === 'string' ? raw.eventType : 'normalized_input',
    mapped,
    timestamp,
  };

  assignIfDefined(relay, 'transport', asRelayString(raw.transport || raw.device && raw.device.transport));
  assignIfDefined(relay, 'sourceId', asRelayString(raw.sourceId || raw.device && raw.device.id));
  assignIfDefined(relay, 'deviceName', asRelayString(raw.deviceName || raw.device && (raw.device.inputName || raw.device.name)));
  assignIfDefined(relay, 'profileId', asRelayString(raw.profileId || raw.device && raw.device.profileId || raw.profile && raw.profile.id));
  assignIfDefined(relay, 'rawTarget', asRelayString(raw.rawTarget));
  assignIfDefined(relay, 'valueShape', asRelayString(raw.valueShape));
  assignIfDefined(relay, 'canonicalTarget', asRelayString(raw.canonicalTarget));
  assignIfDefined(relay, 'mappingId', asRelayString(raw.mappingId));
  assignIfDefined(relay, 'context', sanitizeRelayContext(raw.context));
  assignIfDefined(relay, 'truthStatus', asRelayString(raw.truthStatus || raw.render && raw.render.truthStatus));
  assignIfDefined(relay, 'render', sanitizeRelayRender(raw.render, raw));
  assignIfDefined(relay, 'boardCompat', sanitizeRelayBoardCompat(raw.boardCompat));
  assignIfDefined(relay, 'interaction', normalizedInteraction);
  assignIfDefined(relay, 'type', type ? type.toLowerCase() : undefined);
  assignIfDefined(relay, 'ch', channel);
  assignIfDefined(relay, 'd1', d1);
  assignIfDefined(relay, 'd2', d2);
  assignIfDefined(relay, 'value', value);
  assignIfDefined(relay, 'compatValue', asFiniteNumber(raw.compatValue));
  assignIfDefined(relay, 'semanticValue', asFiniteNumber(raw.semanticValue));

  if ((relay.type || relay.interaction) === 'cc') {
    assignIfDefined(relay, 'controller', asFiniteNumber(raw.controller ?? relay.d1));
  }

  if (raw.__flxDebug === true) {
    relay.__flxDebug = true;
    assignIfDefined(relay, '__flxDebugSource', asRelayString(raw.__flxDebugSource));
    assignIfDefined(relay, '__flxDebugTarget', asRelayString(raw.__flxDebugTarget));
    assignIfDefined(relay, '__flxDebugKey', asRelayString(raw.__flxDebugKey));
  }

  return relay;
}

// Brings different incoming MIDI shapes to a single {type,ch,d1,d2,...}
function normalizeInfo(p){
  const raw = extractRelayEvent(p);
  if (!raw || typeof raw !== 'object') return raw;
  const interaction = String(raw.interaction || raw.type || raw.mtype || '').toLowerCase();
  const type = interaction;
  const ch   = Number(raw.ch || raw.channel || raw.chan || raw.port || 1);
  const base = {
    ...raw,
    eventType: typeof raw.eventType === 'string' ? raw.eventType : undefined,
    profileId: raw.profileId ?? null,
    canonicalTarget: raw.canonicalTarget ?? null,
    mappingId: raw.mappingId ?? null,
    context: raw.context ?? null,
    mapped: raw.mapped != null ? !!raw.mapped : !!raw.canonicalTarget,
    interaction: interaction || raw.interaction || null,
    timestamp: raw.timestamp != null ? Number(raw.timestamp) : raw.timestamp,
    type,
    ch,
  };

  // common aliases
  const note       = raw.note ?? raw.d1 ?? raw.key ?? 0;
  const controller = raw.controller ?? raw.d1 ?? raw.cc ?? 0;
  const value      = raw.value ?? raw.velocity ?? raw.d2 ?? 0;

  if (type === 'cc') {
    const d1 = Number(controller), d2 = Number(value);
    return { ...base, controller: d1, value: d2, d1, d2 };
  }
  if (type === 'noteon' || type === 'noteoff') {
    const d1 = Number(note), d2 = Number(value);
    return { ...base, d1, d2, value: d2 };
  }
  if (type === 'pitch') {
    return { ...base, value: Number(value) };
  }
  // fallback pass-through (but lowercased type and numeric ch)
  return base;
}
