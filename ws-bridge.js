#!/usr/bin/env node
// ws-bridge.js
// LEGACY COMPAT SHIM:
// The official runtime uses server/server.js with the browser client in /src/ws.js.
// This entrypoint remains only to preserve `npm run ws-bridge`.

console.warn('[legacy] ws-bridge.js is deprecated simple relay tooling. Official runtime uses server/server.js + src/ws.js.');
await import('./legacy/ws-bridge.js');
