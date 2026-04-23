#!/usr/bin/env node
// legacy/ws-bridge.js
// LEGACY SIMPLE RELAY:
// This standalone bridge is not part of the official host/viewer runtime.
// The canonical runtime uses server/server.js plus the browser client in /src/ws.js.

import { WebSocketServer, WebSocket } from 'ws';

const argPort = Number(process.argv[2] || NaN);
const envPort = Number(process.env.WSPORT || process.env.PORT || NaN);
const port = Number.isFinite(argPort) ? argPort : (Number.isFinite(envPort) ? envPort : 8787);

const wss = new WebSocketServer({ port });

wss.on('connection', (ws) => {
  try {
    ws.send(JSON.stringify({ type: 'hello', from: 'ws-bridge', port, ts: Date.now() }));
  } catch {}

  ws.on('message', (data) => {
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[ws-bridge] client error:', err?.message || err);
  });
});

wss.on('listening', () => {
  const addr = wss.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  console.log(`ws-bridge listening on ${p}`);
});

wss.on('error', (err) => {
  console.error('[ws-bridge] server error:', err?.message || err);
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  console.log('\n[ws-bridge] shutting down...');
  try {
    wss.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
});
