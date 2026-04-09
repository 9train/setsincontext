// /src/ws.js
// CANONICAL WS CLIENT FOR THE OFFICIAL RUNTIME.
// Used by /src/bootstrap-host.js and /src/bootstrap-viewer.js.
//
// Drop-in replacement with path probing + room support,
// while preserving original public behavior and MIDI hooks.
//
// Public API (unchanged core, plus optional callback):
//   connectWS('ws://...', onInfo, onStatus)
//   connectWS({ url, role, room='default', onInfo, onStatus, onMessage }) -> client
//
// Returned client exposes:
//   { url, socket, isAlive(), send(obj), sendMap(arr), close() }
//
// Notes:
// - Host relay now intentionally sends {type:'controller_event', event:{...}}
//   with normalized controller fields first, while preserving legacy MIDI-like
//   fields during the transition.
// - Viewers dispatch 'flx:remote-map' on map updates
//   * Back-compat: legacy {type:'map_sync', payload:[...]} (old relays)
//   * New server:  {type:'map:sync', map:[...]}
// - Normalizes controller relay events and calls FLX_LEARN_HOOK / FLX_MONITOR_HOOK
// - Adds candidate path probing and reconnection backoff
// - Adds periodic ping frames and optional idle-kill safety timer
//
// Server expectations (new bridge):
// - Broadcasts host controller events as: { type:'controller_event', event:{...} }
// - Older relays may still wrap frames as: { type:'info', payload: <whatever host sent> }
// - WS protocol ping/pong is handled at protocol level; not visible to JS

import { applyRemoteMap } from './map-bootstrap.js';

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
  const onMessage = opts?.onMessage; // generic message surface

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

    // Host-only: send a full mapping array
    // Uses {type:'map:set', map:[...]} for new server.
    sendMap: (arr)=>{
      if (role !== 'host') return false;
      const mapArr = Array.isArray(arr) ? arr : [];
      try {
        if (client.socket?.readyState === WebSocket.OPEN) {
          client.socket.send(JSON.stringify({ type:'map:set', map: mapArr }));
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

  function wireSocket(ws, url){
    client.socket = ws;
    client.url    = url;

    ws.addEventListener('open', ()=>{
      setStatus('connected');

      // Send hello/join immediately — server expects this shape
      try { ws.send(JSON.stringify({ type:'hello', role })); } catch {}
      try { ws.send(JSON.stringify({ type:'join',  role, room })); } catch {}

      // === IMPORTANT: Ask for map immediately (viewer) ===
      // Covers races with host push and ensures initial replay.
      try { ws.send(JSON.stringify({ type:'map:get' })); } catch {}

      startPing(ws);
      bumpIdleKill(ws);
      reconnectAttempts = 0; // success => reset backoff

    });

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
        try { window.FLX_LEARN_HOOK?.(norm); } catch {}
        try { window.FLX_MONITOR_HOOK?.(norm); } catch {}
      }

      // --- Map handling (viewer) — accept BOTH shapes, then applyRemoteMap() ---
      if (role === 'viewer') {
        // New server shape: { type:'map:sync', map:[...] }
        if (parsed?.type === 'map:sync' && Array.isArray(parsed.map)) {
          if (applyRemoteMap(parsed.map)) {
            try { console.log('[map] applied', parsed.map.length, 'entries'); } catch {}
          }
        }
        // Legacy relay shape: { type:'map_sync', payload:[...] }
        else if (parsed?.type === 'map_sync' && Array.isArray(parsed.payload)) {
          if (applyRemoteMap(parsed.payload)) {
            try { console.log('[map] applied', parsed.payload.length, 'entries'); } catch {}
          }
        }
      }

      // Surface everything to optional generic handler (fires after onInfo pipeline)
      try { onMessage && onMessage(parsed); } catch {}
    });

    ws.addEventListener('close', ()=>{
      clearPing();
      clearIdle();
      client.socket = undefined;
      client.url    = undefined;
      if (closedByUs) return; // don’t reconnect if caller closed explicitly
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
    const url = addQuery(urlWithPath, { role, room });

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
        const ws = new WebSocket(addQuery(chosen.url, { role, room }));
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
      wireSocket(winner.ws, winner.url);
      setStatus('connected');
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

function buildRelayEvent(info) {
  const raw = normalizeInfo(info);
  if (!raw || typeof raw !== 'object') return null;

  const interaction = String(raw.interaction || raw.type || '').toLowerCase() || null;
  const timestamp = raw.timestamp != null ? Number(raw.timestamp) : Date.now();
  const mapped = raw.mapped != null ? !!raw.mapped : !!raw.canonicalTarget;

  return {
    ...raw,
    eventType: typeof raw.eventType === 'string' ? raw.eventType : 'normalized_input',
    profileId: raw.profileId ?? null,
    canonicalTarget: raw.canonicalTarget ?? null,
    mappingId: raw.mappingId ?? null,
    context: raw.context ?? null,
    mapped,
    interaction,
    timestamp,
  };
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
