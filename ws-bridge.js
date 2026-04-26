#!/usr/bin/env node
// ws-bridge.js
// DEPRECATED DEV-ONLY RELAY SHIM:
// The official runtime uses server/server.js with the browser client in /src/ws.js.
// No package script points here; run directly only when investigating old relay behavior.

console.warn('[legacy] ws-bridge.js is deprecated simple relay tooling. Official runtime uses server/server.js + src/ws.js.');
await import('./legacy/ws-bridge.js');
