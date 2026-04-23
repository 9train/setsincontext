import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const SERVER_ENTRY = path.join(REPO_ROOT, 'server', 'server.js');

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => err ? reject(err) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitFor(check, { timeoutMs = 3000, intervalMs = 20 } = {}) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    if (check()) return;
    await delay(intervalMs);
  }
  throw new Error('timed out waiting for condition');
}

async function startServer({ maps = {} } = {}) {
  const port = await getFreePort();
  const wsPort = await getFreePort();
  const mapDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flx6-room-join-'));
  const mapFile = path.join(mapDir, 'room_maps.json');
  await fs.writeFile(mapFile, JSON.stringify(maps), 'utf8');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      WSPORT: String(wsPort),
      MAP_FILE: mapFile,
      NODE_ENV: 'development',
      HID_ENABLED: '0',
      MIDI_INPUT: '',
      MIDI_OUTPUT: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  let logs = '';
  const onData = (chunk) => {
    const text = chunk.toString();
    logs += text;
    if (text.includes('[WS] Listening')) ready = true;
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }

    await fs.rm(mapDir, { recursive: true, force: true });
  };

  try {
    await waitFor(() => ready || child.exitCode !== null || child.signalCode !== null, { timeoutMs: 5000 });
  } catch (error) {
    await cleanup();
    throw new Error(`server did not become ready within 5000ms\n${logs}`.trim(), { cause: error });
  }

  if (!ready) {
    const exitLabel = child.signalCode
      ? `signal ${child.signalCode}`
      : `code ${child.exitCode}`;
    await cleanup();
    throw new Error(`server exited before websocket startup completed (${exitLabel})\n${logs}`.trim());
  }

  return {
    port,
    wsPort,
    async stop() {
      await cleanup();
    },
    logs: () => logs,
  };
}

async function sendMalformedHttp(port, payload = 'THIS IS NOT HTTP\r\n\r\n') {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(payload);
    });

    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(data));
  });
}

function createClientURL({
  wsPort,
  role = 'viewer',
  room = 'default',
  sessionMeta = {},
  accessToken,
  hostAccessToken,
}) {
  const params = new URLSearchParams({
    role: String(role),
    room: String(room),
  });
  for (const [key, value] of Object.entries(sessionMeta || {})) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  if (accessToken) params.set('access', String(accessToken));
  if (hostAccessToken) params.set('hostAccess', String(hostAccessToken));
  return `ws://127.0.0.1:${wsPort}/?${params.toString()}`;
}

async function openClient({
  wsPort,
  role = 'viewer',
  room = 'default',
  origin = 'https://www.setsoutofcontext.com',
  sessionMeta = {},
  accessToken,
  hostAccessToken,
}) {
  const url = createClientURL({
    wsPort,
    role,
    room,
    sessionMeta,
    accessToken,
    hostAccessToken,
  });
  const ws = new WebSocket(url, { origin });
  const messages = [];

  ws.on('message', (buf) => {
    try { messages.push(JSON.parse(buf.toString())); } catch {}
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  await waitFor(() => messages.some((msg) => msg.type === 'hello'));

  return { ws, messages };
}

async function openBlockedClient({
  wsPort,
  role = 'viewer',
  room = 'default',
  origin,
  sessionMeta = {},
  accessToken,
  hostAccessToken,
}) {
  const url = createClientURL({
    wsPort,
    role,
    room,
    sessionMeta,
    accessToken,
    hostAccessToken,
  });
  const ws = new WebSocket(url, { origin });

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    ws.once('close', (code, reason) => {
      finish({ code, reason: reason.toString() });
    });
    ws.once('error', reject);
  });
}

function clearMessages(messages) {
  messages.splice(0, messages.length);
}

async function closeClient(ws) {
  if (ws.readyState >= WebSocket.CLOSING) return;
  const done = new Promise((resolve) => ws.once('close', resolve));
  ws.close();
  await done;
}

async function sendJoinAndWaitForClose(ws, payload) {
  const closed = new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  ws.send(JSON.stringify(payload));
  return await closed;
}

test('pre-join sockets stay out of room membership and do not flap presence on close', async () => {
  const server = await startServer();

  try {
    const host = await openClient({ wsPort: server.wsPort, role: 'host', room: 'alpha' });
    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'alpha' }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    clearMessages(host.messages);

    const probeLike = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    assert.deepEqual(probeLike.messages.map((msg) => msg.type), ['hello']);

    await delay(80);
    assert.equal(host.messages.length, 0);

    await closeClient(probeLike.ws);
    await delay(80);
    assert.equal(host.messages.length, 0);
    assert.equal(server.logs().includes('"event":"socket-close"'), true);
    assert.equal(server.logs().includes('"joinedBeforeClose":false'), true);

    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('development allow-list keeps runtime loopback origins, adds Vite localhost, and rejects unknown origins', async () => {
  const server = await startServer();

  try {
    const runtimeLocalhost = await openClient({
      wsPort: server.wsPort,
      origin: `http://localhost:${server.port}`,
    });
    assert.deepEqual(runtimeLocalhost.messages.map((msg) => msg.type), ['hello']);
    await closeClient(runtimeLocalhost.ws);

    const runtime127 = await openClient({
      wsPort: server.wsPort,
      origin: `http://127.0.0.1:${server.port}`,
    });
    assert.deepEqual(runtime127.messages.map((msg) => msg.type), ['hello']);
    await closeClient(runtime127.ws);

    const viteLocalhost = await openClient({
      wsPort: server.wsPort,
      origin: 'http://localhost:5173',
    });
    assert.deepEqual(viteLocalhost.messages.map((msg) => msg.type), ['hello']);
    await closeClient(viteLocalhost.ws);

    const blocked = await openBlockedClient({
      wsPort: server.wsPort,
      origin: 'https://evil.example.com',
    });
    assert.equal(blocked.code, 1008);
    assert.equal(blocked.reason, 'origin not allowed');
    await waitFor(() => server.logs().includes('"event":"socket-blocked-origin"'));
    assert.equal(server.logs().includes('https://evil.example.com'), true);
  } finally {
    await server.stop();
  }
});

test('explicit join creates membership, presence, and viewer map replay', async () => {
  const server = await startServer({
    maps: {
      alpha: [{ key: 'cc:1:10', target: 'deck.left.jog' }],
    },
  });

  try {
    const host = await openClient({ wsPort: server.wsPort, role: 'host', room: 'alpha' });
    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'alpha' }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    clearMessages(host.messages);

    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    assert.deepEqual(viewer.messages.map((msg) => msg.type), ['hello']);

    viewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'alpha' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'map:sync' && msg.room === 'alpha'));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha' && msg.viewers === 1));

    assert.equal(viewer.messages.some((msg) => msg.type === 'map:sync' && Array.isArray(msg.map)), true);

    await closeClient(viewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('legacy map:get auto-joins safely while hello and ping do not', async () => {
  const server = await startServer({
    maps: {
      alpha: [{ key: 'cc:1:77', target: 'deck.right.jog' }],
    },
  });

  try {
    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    assert.deepEqual(viewer.messages.map((msg) => msg.type), ['hello']);

    viewer.ws.send(JSON.stringify({ type: 'hello', role: 'viewer', room: 'alpha' }));
    viewer.ws.send(JSON.stringify({ type: 'ping' }));
    await delay(80);
    assert.deepEqual(viewer.messages.map((msg) => msg.type), ['hello']);

    viewer.ws.send(JSON.stringify({ type: 'map:get' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'map:sync' && msg.room === 'alpha'));

    await closeClient(viewer.ws);
  } finally {
    await server.stop();
  }
});

test('malformed HTTP clients are contained and the server keeps accepting websocket traffic', async () => {
  const server = await startServer();

  try {
    const response = await sendMalformedHttp(server.port);
    assert.equal(response.includes('400 Bad Request'), true);
    await waitFor(() => server.logs().includes('"event":"http-client-error"'));

    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    viewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'alpha' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    assert.equal(server.logs().includes('"event":"socket-open"'), true);

    await closeClient(viewer.ws);
  } finally {
    await server.stop();
  }
});

test('bad websocket frames are logged and contained without breaking later join flow', async () => {
  const server = await startServer();

  try {
    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    viewer.ws.send('not-json');
    await waitFor(() => server.logs().includes('"event":"bad-frame"'));

    viewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'alpha' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));
    await waitFor(() => server.logs().includes('"event":"socket-join"'));

    viewer.ws.send(JSON.stringify({ type: 'map:get' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'map:empty' && msg.room === 'alpha'));

    await closeClient(viewer.ws);
    await waitFor(() => server.logs().includes('"joinedBeforeClose":true'));
  } finally {
    await server.stop();
  }
});

test('host joins create session records and viewer joins attach without exposing viewer details', async () => {
  const server = await startServer();

  try {
    const hostMeta = {
      mode: 'remote',
      visibility: 'public',
      sessionTitle: 'Warehouse Warmup',
      hostName: 'Rafa',
    };
    const host = await openClient({
      wsPort: server.wsPort,
      role: 'host',
      room: 'alpha',
      sessionMeta: hostMeta,
    });

    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'alpha', ...hostMeta }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));

    let response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/alpha`);
    assert.equal(response.status, 200);

    let payload = await response.json();
    assert.equal(payload.session.room, 'alpha');
    assert.equal(payload.session.mode, 'remote');
    assert.equal(payload.session.visibility, 'public');
    assert.equal(payload.session.title, 'Warehouse Warmup');
    assert.equal(payload.session.hostName, 'Rafa');
    assert.equal(payload.session.hostCount, 1);
    assert.equal(payload.session.viewerCount, 0);
    assert.equal(payload.session.status, 'waiting');
    assert.equal(payload.session.adHoc, false);
    assert.equal(payload.session.metadataSource, 'host');

    const viewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'alpha',
      sessionMeta: {
        mode: 'local',
        visibility: 'private',
        sessionTitle: 'Viewer Override Attempt',
        hostName: 'Guest',
        viewerName: 'Ada',
        viewerEmail: 'ada@example.com',
      },
    });

    viewer.ws.send(JSON.stringify({
      type: 'join',
      role: 'viewer',
      room: 'alpha',
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Viewer Override Attempt',
      hostName: 'Guest',
      viewerName: 'Ada',
      viewerEmail: 'ada@example.com',
    }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha' && msg.viewers === 1));

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/alpha`);
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.session.mode, 'remote');
    assert.equal(payload.session.visibility, 'public');
    assert.equal(payload.session.title, 'Warehouse Warmup');
    assert.equal(payload.session.hostName, 'Rafa');
    assert.equal(payload.session.viewerCount, 1);
    assert.equal(payload.session.status, 'live');
    assert.equal('viewerName' in payload.session, false);
    assert.equal('viewerEmail' in payload.session, false);

    const listResponse = await fetch(`http://127.0.0.1:${server.port}/api/sessions`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(Array.isArray(listPayload.sessions), true);
    assert.equal(listPayload.sessions.some((session) => session.room === 'alpha' && session.viewerCount === 1), true);

    await closeClient(viewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('session resolve endpoint returns safe join metadata for known keys and rejects unknown keys', async () => {
  const server = await startServer();

  try {
    const hostMeta = {
      mode: 'remote',
      visibility: 'public',
      sessionTitle: 'Warehouse Warmup',
      hostName: 'Rafa',
    };
    const host = await openClient({
      wsPort: server.wsPort,
      role: 'host',
      room: 'alpha',
      sessionMeta: hostMeta,
    });

    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'alpha', ...hostMeta }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));

    const viewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'beta',
      sessionMeta: {
        mode: 'local',
        visibility: 'private',
        sessionTitle: 'Backstage',
        viewerName: 'Pat',
        viewerEmail: 'pat@example.com',
      },
    });

    viewer.ws.send(JSON.stringify({
      type: 'join',
      role: 'viewer',
      room: 'beta',
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Backstage',
      viewerName: 'Pat',
      viewerEmail: 'pat@example.com',
    }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'beta'));

    let response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=alpha`);
    assert.equal(response.status, 200);

    let payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.room, 'alpha');
    assert.equal(payload.mode, 'remote');
    assert.equal(payload.visibility, 'public');
    assert.equal(payload.title, 'Warehouse Warmup');
    assert.equal(payload.hostName, 'Rafa');
    assert.equal(payload.status, 'waiting');
    assert.equal(payload.hostCount, 1);
    assert.equal(payload.viewerCount, 0);
    assert.equal(payload.adHoc, false);
    assert.equal('viewerName' in payload, false);
    assert.equal('viewerEmail' in payload, false);

    const alphaJoinURL = new URL(payload.joinUrlPath, 'http://runtime.test');
    assert.equal(alphaJoinURL.pathname, '/viewer.html');
    assert.equal(alphaJoinURL.searchParams.get('room'), 'alpha');
    assert.equal(alphaJoinURL.searchParams.get('ws'), `ws://127.0.0.1:${server.wsPort}/`);

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=beta`);
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.room, 'beta');
    assert.equal(payload.mode, 'local');
    assert.equal(payload.visibility, 'private');
    assert.equal(payload.title, 'Backstage');
    assert.equal(payload.hostName, '');
    assert.equal(payload.status, 'waiting');
    assert.equal(payload.hostCount, 0);
    assert.equal(payload.viewerCount, 1);
    assert.equal(payload.adHoc, true);
    assert.equal('viewerName' in payload, false);
    assert.equal('viewerEmail' in payload, false);

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=missing-room`);
    assert.equal(response.status, 404);

    payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'session not found',
      key: 'missing-room',
    });

    await closeClient(viewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('private sessions require a valid invite for resolve and websocket viewer joins', async () => {
  const server = await startServer();

  try {
    const hostMeta = {
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Backstage Only',
      hostName: 'Rafa',
    };
    const hostAccessToken = 'host-secret-gamma';
    const host = await openClient({
      wsPort: server.wsPort,
      role: 'host',
      room: 'gamma',
      sessionMeta: hostMeta,
      hostAccessToken,
    });

    host.ws.send(JSON.stringify({
      type: 'join',
      role: 'host',
      room: 'gamma',
      hostAccess: hostAccessToken,
      ...hostMeta,
    }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'gamma'));

    let response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=gamma`);
    assert.equal(response.status, 403);

    let payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'private invite required',
      code: 'invite_required',
      requiresAccess: true,
      key: 'gamma',
    });

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/gamma`);
    assert.equal(response.status, 403);

    payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'private invite required',
      code: 'invite_required',
      requiresAccess: true,
      room: 'gamma',
    });

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/gamma/invite`);
    assert.equal(response.status, 403);

    payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'host access required',
      code: 'host_access_required',
      room: 'gamma',
    });

    response = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/gamma/invite?hostAccess=${encodeURIComponent(hostAccessToken)}`,
    );
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.room, 'gamma');
    assert.equal(payload.visibility, 'private');
    const inviteUrl = new URL(payload.joinUrlPath, `http://127.0.0.1:${server.port}`);
    const viewerAccessToken = inviteUrl.searchParams.get('access');
    assert.equal(inviteUrl.pathname, '/viewer.html');
    assert.equal(inviteUrl.searchParams.get('room'), 'gamma');
    assert.equal(inviteUrl.searchParams.get('ws'), `ws://127.0.0.1:${server.wsPort}/`);
    assert.equal(Boolean(viewerAccessToken), true);

    response = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/resolve?key=gamma&access=wrong-token`,
    );
    assert.equal(response.status, 403);

    payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'invalid private invite',
      code: 'invalid_access',
      requiresAccess: true,
      key: 'gamma',
    });

    response = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/resolve?key=gamma&access=${encodeURIComponent(viewerAccessToken || '')}`,
    );
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.visibility, 'private');
    const resolvedInviteUrl = new URL(payload.joinUrlPath, `http://127.0.0.1:${server.port}`);
    assert.equal(resolvedInviteUrl.searchParams.get('access'), viewerAccessToken);

    const deniedViewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'gamma',
    });
    const deniedClose = await sendJoinAndWaitForClose(deniedViewer.ws, {
      type: 'join',
      role: 'viewer',
      room: 'gamma',
    });
    assert.equal(deniedClose.code, 1008);
    assert.equal(deniedClose.reason, 'private invite required');
    assert.equal(
      deniedViewer.messages.some((msg) => msg.type === 'access:denied' && msg.code === 'invite_required'),
      true,
    );

    const invalidViewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'gamma',
      accessToken: 'wrong-token',
    });
    const invalidClose = await sendJoinAndWaitForClose(invalidViewer.ws, {
      type: 'join',
      role: 'viewer',
      room: 'gamma',
      access: 'wrong-token',
    });
    assert.equal(invalidClose.code, 1008);
    assert.equal(invalidClose.reason, 'invalid private invite');
    assert.equal(
      invalidViewer.messages.some((msg) => msg.type === 'access:denied' && msg.code === 'invalid_access'),
      true,
    );

    const invitedViewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'gamma',
      accessToken: viewerAccessToken,
    });
    invitedViewer.ws.send(JSON.stringify({
      type: 'join',
      role: 'viewer',
      room: 'gamma',
      access: viewerAccessToken,
    }));
    await waitFor(() => invitedViewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'gamma'));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'gamma' && msg.viewers === 1));

    await closeClient(invitedViewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('viewer-only joins still work and create ad hoc fallback sessions for backward compatibility', async () => {
  const server = await startServer();

  try {
    const viewer = await openClient({
      wsPort: server.wsPort,
      role: 'viewer',
      room: 'beta',
      sessionMeta: {
        mode: 'local',
        visibility: 'private',
        sessionTitle: 'Backstage',
        viewerName: 'Pat',
        viewerEmail: 'pat@example.com',
      },
    });

    viewer.ws.send(JSON.stringify({
      type: 'join',
      role: 'viewer',
      room: 'beta',
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Backstage',
      viewerName: 'Pat',
      viewerEmail: 'pat@example.com',
    }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'beta'));

    const response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/beta`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.session.room, 'beta');
    assert.equal(payload.session.mode, 'local');
    assert.equal(payload.session.visibility, 'private');
    assert.equal(payload.session.title, 'Backstage');
    assert.equal(payload.session.hostName, null);
    assert.equal(payload.session.hostCount, 0);
    assert.equal(payload.session.viewerCount, 1);
    assert.equal(payload.session.status, 'waiting');
    assert.equal(payload.session.adHoc, true);
    assert.equal(payload.session.metadataSource, 'viewer');

    await closeClient(viewer.ws);
  } finally {
    await server.stop();
  }
});

test('server serves optional controller feel config from /maps when the file exists', async () => {
  const server = await startServer();

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/maps/flx6-feel.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);

    const payload = await response.json();
    assert.equal(payload.device, 'Pioneer DDJ-FLX6');
    assert.equal(payload.global?.jog?.scale, 0.004);
  } finally {
    await server.stop();
  }
});
