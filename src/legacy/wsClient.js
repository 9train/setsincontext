// /src/legacy/wsClient.js
// LEGACY CLIENT:
// This client is not used by the official host/viewer runtime.
// The canonical WebSocket client for the app is /src/ws.js.
//
// Remote maps handled here are provisional compatibility metadata, not
// official controller truth. This module remains only for older/demo paths.

import { applyRemoteMap } from '/src/map-bootstrap.js';
import { getRuntimeApp } from '/src/runtime/app-bridge.js';

const RETRY_MS = 1500;

export function connectWS({ url, role, onInfo, onStatus }) {
  let ws;
  let closed = false;
  const runtimeApp = getRuntimeApp();

  function status(s) {
    try { onStatus?.(s); } catch {}
  }

  function open() {
    status('connecting');
    ws = new WebSocket(url);

    ws.addEventListener('open', () => status('open'));

    ws.addEventListener('close', () => {
      if (!closed) {
        status('closed');
        setTimeout(() => { if (!closed) open(); }, RETRY_MS);
      }
    });

    ws.addEventListener('error', () => {
      status('error');
    });

    ws.addEventListener('message', (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'midi_like' && msg.payload) {
        try { onInfo?.(msg.payload); } catch {}
        try { runtimeApp?.emitLearnInput(msg.payload); } catch {}
        try { runtimeApp?.emitMonitorInput(msg.payload); } catch {}
        return;
      }

      if (msg.type === 'info' && msg.payload) {
        try { onInfo?.(msg.payload); } catch {}
        return;
      }

      if (msg.type === 'map_sync' && role === 'viewer') {
        try { applyRemoteMap(Array.isArray(msg.payload) ? msg.payload : []); } catch {}
        return;
      }

      if (msg.type === 'map:set' && role === 'viewer') {
        try { applyRemoteMap(Array.isArray(msg.map) ? msg.map : (Array.isArray(msg.payload) ? msg.payload : [])); } catch {}
        return;
      }
    });
  }

  open();

  return {
    close: () => { closed = true; try { ws?.close(); } catch {} },
    send: (obj) => {
      try { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)); } catch {}
    },
    sendMap: (mapArray) => {
      try {
        if (ws?.readyState !== 1) return false;
        ws.send(JSON.stringify({ type: 'map:set', map: mapArray || [] }));
        return true;
      } catch { return false; }
    }
  };
}
