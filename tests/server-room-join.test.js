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
  const sessionStoreFile = path.join(mapDir, 'sessions.json');
  await fs.writeFile(mapFile, JSON.stringify(maps), 'utf8');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      WSPORT: String(wsPort),
      MAP_FILE: mapFile,
      SESSION_STORE_FILE: sessionStoreFile,
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
    sessionStoreFile,
    async stop() {
      await cleanup();
    },
    logs: () => logs,
  };
}

async function readSessionStore(server) {
  try {
    const text = await fs.readFile(server.sessionStoreFile, 'utf8');
    return JSON.parse(text || '{}');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { sessions: [], participants: [], invites: [] };
    }
    throw error;
  }
}

async function waitForSessionStore(server, predicate, { timeoutMs = 3000, intervalMs = 20 } = {}) {
  const started = Date.now();
  let latest = null;
  while ((Date.now() - started) < timeoutMs) {
    latest = await readSessionStore(server);
    if (predicate(latest)) return latest;
    await delay(intervalMs);
  }
  throw new Error(`timed out waiting for session store condition\n${JSON.stringify(latest, null, 2)}`);
}

function assertPublicPayloadHasNoPrivateFields(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('viewerName'), false);
  assert.equal(text.includes('viewerEmail'), false);
  assert.equal(text.includes('tokenHash'), false);
  assert.equal(text.includes('hostAccess'), false);
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

function findVisualHydration(messages, room) {
  return messages.find((msg) => (
    msg?.type === 'controller_event' &&
    msg.room === room &&
    msg.event?.eventType === 'controller_visual_state_snapshot'
  ));
}

function assertNoHeavyControllerSnapshots(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('"controllerState"'), false);
  assert.equal(text.includes('"profileSnapshot"'), false);
  assert.equal(text.includes('"profile"'), false);
  assert.equal(text.includes('"raw"'), false);
  assert.equal(text.includes('"debug"'), false);
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

test('room map sync is provisional state and stays separate from official controller events', async () => {
  const server = await startServer({
    maps: {
      alpha: [{
        key: 'noteon:1:11',
        target: 'cue_R',
        ownership: 'official',
        canonicalTarget: 'deck.left.transport.play',
      }],
    },
  });

  try {
    const host = await openClient({ wsPort: server.wsPort, role: 'host', room: 'alpha' });
    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'alpha' }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'alpha'));

    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'alpha' });
    viewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'alpha' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'map:sync' && msg.room === 'alpha'));

    const mapFrame = viewer.messages.find((msg) => msg.type === 'map:sync' && msg.room === 'alpha');
    assert.equal(mapFrame.mapAuthority, 'draft');
    assert.equal(mapFrame.mapState, 'provisional');
    assert.equal(mapFrame.controllerTruth, false);
    assert.equal(mapFrame.diagnosticOnly, true);
    assert.equal(mapFrame.mapLabel, 'provisional draft room map');
    assert.equal(mapFrame.map[0].ownership, 'draft');
    assert.equal(mapFrame.truthStatus, undefined);

    clearMessages(viewer.messages);
    host.ws.send(JSON.stringify({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        mapped: true,
        truthStatus: 'official',
        render: {
          targetId: 'play_L',
          truthStatus: 'official',
          source: 'profile-ui',
        },
        interaction: 'noteon',
        type: 'noteon',
        ch: 1,
        d1: 11,
        d2: 127,
        value: 127,
      },
    }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'controller_event' && msg.room === 'alpha'));

    const eventFrame = viewer.messages.find((msg) => msg.type === 'controller_event' && msg.room === 'alpha');
    assert.equal(eventFrame.event.truthStatus, 'official');
    assert.equal(eventFrame.event.render.targetId, 'play_L');
    assert.equal(eventFrame.event.render.truthStatus, 'official');

    await closeClient(viewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('server hydrates late and reconnecting viewers with latest compact controllerVisualState only', async () => {
  const server = await startServer();

  try {
    const host = await openClient({ wsPort: server.wsPort, role: 'host', room: 'visual-alpha' });
    host.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'visual-alpha' }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'visual-alpha'));

    host.ws.send(JSON.stringify({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        mapped: true,
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.pad.mode.sampler',
        controllerVisualState: {
          padMode: {
            left: 'sampler',
            right: 'hotcue',
            hidden: 'beatjump',
          },
          jogCutter: {
            left: false,
            right: true,
            hidden: true,
          },
          jogVinylMode: {
            left: true,
            right: false,
            hidden: false,
          },
          raw: { bytes: [1, 2, 3] },
        },
        controllerState: {
          padMode: { left: 'fx' },
          dump: 'full state must not hydrate',
        },
        profileSnapshot: { dump: 'profile snapshot must not hydrate' },
        profile: { dump: 'profile must not hydrate' },
        raw: { dump: 'raw must not hydrate' },
        debug: { dump: 'debug must not hydrate' },
      },
    }));
    await delay(50);

    const lateViewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'visual-alpha' });
    lateViewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'visual-alpha' }));
    await waitFor(() => findVisualHydration(lateViewer.messages, 'visual-alpha'));

    const firstHydration = findVisualHydration(lateViewer.messages, 'visual-alpha');
    assert.equal(firstHydration.event.source, 'server-room-hydration');
    assert.equal(firstHydration.event.mapped, false);
    assert.equal(Number.isFinite(firstHydration.event.timestamp), true);
    assert.deepEqual(firstHydration.event.controllerVisualState, {
      padMode: {
        left: 'sampler',
        right: 'hotcue',
      },
      jogCutter: {
        left: false,
        right: true,
      },
      jogVinylMode: {
        left: true,
        right: false,
      },
    });
    assertNoHeavyControllerSnapshots(firstHydration);
    assert.equal('canonicalTarget' in firstHydration.event, false);
    assert.equal('mappingId' in firstHydration.event, false);

    clearMessages(lateViewer.messages);
    host.ws.send(JSON.stringify({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        mapped: true,
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.pad.mode.fx',
        controllerVisualState: {
          padMode: {
            left: 'fx',
          },
        },
        controllerState: { dump: 'full state must not relay' },
        profileSnapshot: { dump: 'profile snapshot must not relay' },
        profile: { dump: 'profile must not relay' },
        raw: { dump: 'raw must not relay' },
        debug: { dump: 'debug must not relay' },
      },
    }));
    await waitFor(() => lateViewer.messages.some((msg) => (
      msg.type === 'controller_event' &&
      msg.event?.eventType === 'normalized_input'
    )));

    const liveRelay = lateViewer.messages.find((msg) => (
      msg.type === 'controller_event' &&
      msg.event?.eventType === 'normalized_input'
    ));
    assert.deepEqual(liveRelay.event.controllerVisualState, {
      padMode: {
        left: 'fx',
      },
    });
    assert.equal(liveRelay.event.canonicalTarget, 'deck.left.pad.mode.fx');
    assertNoHeavyControllerSnapshots(liveRelay);

    await closeClient(lateViewer.ws);

    host.ws.send(JSON.stringify({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        mapped: true,
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.right.pad.mode.beatjump',
        controllerVisualState: {
          padMode: {
            right: 'beatjump',
          },
          jogCutter: {
            right: false,
          },
          jogVinylMode: {
            right: true,
          },
          controllerState: { should: 'not hydrate' },
          profileSnapshot: { should: 'not hydrate' },
          raw: { should: 'not hydrate' },
          debug: { should: 'not hydrate' },
        },
        controllerState: {
          padMode: { left: 'sampler', right: 'sampler' },
          jogCutter: { right: true },
          jogVinylMode: { right: false },
        },
      },
    }));
    await delay(50);

    const reconnectedViewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'visual-alpha' });
    reconnectedViewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'visual-alpha' }));
    await waitFor(() => findVisualHydration(reconnectedViewer.messages, 'visual-alpha'));

    const reconnectHydration = findVisualHydration(reconnectedViewer.messages, 'visual-alpha');
    assert.deepEqual(reconnectHydration.event.controllerVisualState, {
      padMode: {
        right: 'beatjump',
      },
      jogCutter: {
        right: false,
      },
      jogVinylMode: {
        right: true,
      },
    });
    assertNoHeavyControllerSnapshots(reconnectHydration);
    assert.equal('left' in reconnectHydration.event.controllerVisualState.padMode, false);

    await closeClient(reconnectedViewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('server skips visual-state hydration for rooms without a compact host snapshot', async () => {
  const server = await startServer();

  try {
    const viewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'empty-visual' });
    viewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'empty-visual' }));
    await waitFor(() => viewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'empty-visual'));
    await delay(80);

    assert.equal(findVisualHydration(viewer.messages, 'empty-visual'), undefined);

    await closeClient(viewer.ws);
  } finally {
    await server.stop();
  }
});

test('server keeps compact controllerVisualState hydration isolated by room', async () => {
  const server = await startServer();

  try {
    const alphaHost = await openClient({ wsPort: server.wsPort, role: 'host', room: 'visual-alpha' });
    alphaHost.ws.send(JSON.stringify({ type: 'join', role: 'host', room: 'visual-alpha' }));
    await waitFor(() => alphaHost.messages.some((msg) => msg.type === 'presence' && msg.room === 'visual-alpha'));

    alphaHost.ws.send(JSON.stringify({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        mapped: true,
        controllerVisualState: {
          padMode: { left: 'sampler' },
          jogCutter: { right: true },
        },
      },
    }));
    await delay(50);

    const betaViewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'visual-beta' });
    betaViewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'visual-beta' }));
    await waitFor(() => betaViewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'visual-beta'));
    await delay(80);
    assert.equal(findVisualHydration(betaViewer.messages, 'visual-beta'), undefined);
    assert.equal(betaViewer.messages.some((msg) => msg.room === 'visual-alpha'), false);

    const alphaViewer = await openClient({ wsPort: server.wsPort, role: 'viewer', room: 'visual-alpha' });
    alphaViewer.ws.send(JSON.stringify({ type: 'join', role: 'viewer', room: 'visual-alpha' }));
    await waitFor(() => findVisualHydration(alphaViewer.messages, 'visual-alpha'));

    assert.deepEqual(findVisualHydration(alphaViewer.messages, 'visual-alpha').event.controllerVisualState, {
      padMode: { left: 'sampler' },
      jogCutter: { right: true },
    });

    await closeClient(alphaViewer.ws);
    await closeClient(betaViewer.ws);
    await closeClient(alphaHost.ws);
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

    let storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'alpha' && session.hostCount === 1) &&
      state.participants?.some((participant) => participant.room === 'alpha' && participant.role === 'host')
    ));
    let durableSession = storeState.sessions.find((session) => session.room === 'alpha');
    let hostParticipant = storeState.participants.find((participant) => (
      participant.sessionId === durableSession.sessionId &&
      participant.room === 'alpha' &&
      participant.role === 'host'
    ));
    assert.equal(durableSession.visibility, 'public');
    assert.equal(durableSession.ownerUserId, null);
    assert.equal(hostParticipant.userId, null);
    assert.equal(Boolean(hostParticipant.anonymousId), true);
    assert.equal(Boolean(hostParticipant.joinedAt), true);
    assert.equal(Boolean(hostParticipant.lastSeenAt), true);
    assert.equal(hostParticipant.disconnectedAt, null);

    let resolveResponse = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=alpha`);
    assert.equal(resolveResponse.status, 200);
    assertPublicPayloadHasNoPrivateFields(await resolveResponse.json());

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
    assertPublicPayloadHasNoPrivateFields(host.messages);
    assertPublicPayloadHasNoPrivateFields(viewer.messages);

    storeState = await waitForSessionStore(server, (state) => (
      state.participants?.some((participant) => (
        participant.room === 'alpha' &&
        participant.role === 'viewer' &&
        participant.displayName === 'Ada' &&
        participant.email === 'ada@example.com' &&
        participant.disconnectedAt === null
      ))
    ));
    durableSession = storeState.sessions.find((session) => session.room === 'alpha');
    const viewerParticipant = storeState.participants.find((participant) => (
      participant.sessionId === durableSession.sessionId &&
      participant.room === 'alpha' &&
      participant.role === 'viewer'
    ));
    assert.equal(viewerParticipant.userId, null);

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
    assertPublicPayloadHasNoPrivateFields(listPayload);

    await closeClient(viewer.ws);
    await closeClient(host.ws);
    storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'alpha' && session.status === 'ended' && session.endedAt) &&
      state.participants?.filter((participant) => participant.room === 'alpha')
        .every((participant) => participant.disconnectedAt)
    ));
    durableSession = storeState.sessions.find((session) => session.room === 'alpha');
    assert.equal(durableSession.status, 'ended');
    assert.equal(Boolean(durableSession.endedAt), true);

    resolveResponse = await fetch(`http://127.0.0.1:${server.port}/api/sessions/resolve?key=alpha`);
    assert.equal(resolveResponse.status, 200);
    const endedResolvePayload = await resolveResponse.json();
    assert.equal(endedResolvePayload.status, 'ended');
    assertPublicPayloadHasNoPrivateFields(endedResolvePayload);
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

    let storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'gamma' && session.visibility === 'private') &&
      state.participants?.some((participant) => participant.room === 'gamma' && participant.role === 'host')
    ));
    let durableSession = storeState.sessions.find((session) => session.room === 'gamma');
    assert.equal(durableSession.adHoc, false);
    assert.equal(durableSession.ownerUserId, null);

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
    assertPublicPayloadHasNoPrivateFields(payload);

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
    assertPublicPayloadHasNoPrivateFields(payload);

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/gamma/invite`);
    assert.equal(response.status, 403);

    payload = await response.json();
    assert.deepEqual(payload, {
      ok: false,
      error: 'host access required',
      code: 'host_access_required',
      room: 'gamma',
    });
    assertPublicPayloadHasNoPrivateFields(payload);

    response = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/gamma/invite?hostAccess=${encodeURIComponent(hostAccessToken)}`,
    );
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.room, 'gamma');
    assert.equal(payload.visibility, 'private');
    assertPublicPayloadHasNoPrivateFields(payload);
    const inviteUrl = new URL(payload.joinUrlPath, `http://127.0.0.1:${server.port}`);
    const viewerAccessToken = inviteUrl.searchParams.get('access');
    assert.equal(inviteUrl.pathname, '/viewer.html');
    assert.equal(inviteUrl.searchParams.get('room'), 'gamma');
    assert.equal(inviteUrl.searchParams.get('ws'), `ws://127.0.0.1:${server.wsPort}/`);
    assert.equal(Boolean(viewerAccessToken), true);

    storeState = await waitForSessionStore(server, (state) => (
      state.invites?.some((invite) => invite.room === 'gamma' && invite.type === 'host_access') &&
      state.invites?.some((invite) => invite.room === 'gamma' && invite.type === 'viewer_invite')
    ));
    let viewerInvite = storeState.invites.find((invite) => (
      invite.room === 'gamma' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    ));
    const hostAccessInvite = storeState.invites.find((invite) => (
      invite.room === 'gamma' &&
      invite.type === 'host_access' &&
      !invite.revokedAt
    ));
    assert.equal(Boolean(viewerInvite.tokenHash), true);
    assert.equal(Boolean(hostAccessInvite.tokenHash), true);
    assert.equal('rawToken' in viewerInvite, false);
    assert.equal('rawToken' in hostAccessInvite, false);
    assert.equal(viewerInvite.lastUsedAt, null);

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
    assertPublicPayloadHasNoPrivateFields(payload);

    storeState = await readSessionStore(server);
    viewerInvite = storeState.invites.find((invite) => (
      invite.room === 'gamma' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    ));
    assert.equal(viewerInvite.lastUsedAt, null);

    response = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/resolve?key=gamma&access=${encodeURIComponent(viewerAccessToken || '')}`,
    );
    assert.equal(response.status, 200);

    payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.visibility, 'private');
    assertPublicPayloadHasNoPrivateFields(payload);
    const resolvedInviteUrl = new URL(payload.joinUrlPath, `http://127.0.0.1:${server.port}`);
    assert.equal(resolvedInviteUrl.searchParams.get('access'), viewerAccessToken);

    storeState = await waitForSessionStore(server, (state) => (
      state.invites?.some((invite) => (
        invite.room === 'gamma' &&
        invite.type === 'viewer_invite' &&
        !invite.revokedAt &&
        Boolean(invite.lastUsedAt)
      ))
    ));
    viewerInvite = storeState.invites.find((invite) => (
      invite.room === 'gamma' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    ));
    const firstViewerInviteUse = viewerInvite.lastUsedAt;

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
      sessionMeta: {
        viewerName: 'Ada',
        viewerEmail: 'ada@example.com',
      },
    });
    invitedViewer.ws.send(JSON.stringify({
      type: 'join',
      role: 'viewer',
      room: 'gamma',
      access: viewerAccessToken,
      viewerName: 'Ada',
      viewerEmail: 'ada@example.com',
    }));
    await waitFor(() => invitedViewer.messages.some((msg) => msg.type === 'presence' && msg.room === 'gamma'));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'gamma' && msg.viewers === 1));
    assertPublicPayloadHasNoPrivateFields(host.messages);
    assertPublicPayloadHasNoPrivateFields(invitedViewer.messages);

    storeState = await waitForSessionStore(server, (state) => (
      state.participants?.some((participant) => (
        participant.room === 'gamma' &&
        participant.role === 'viewer' &&
        participant.displayName === 'Ada' &&
        participant.email === 'ada@example.com' &&
        participant.userId === null &&
        participant.disconnectedAt === null
      ))
    ));
    durableSession = storeState.sessions.find((session) => session.room === 'gamma');
    const viewerParticipant = storeState.participants.find((participant) => (
      participant.sessionId === durableSession.sessionId &&
      participant.room === 'gamma' &&
      participant.role === 'viewer'
    ));
    assert.equal(viewerParticipant.displayName, 'Ada');
    assert.equal(viewerParticipant.email, 'ada@example.com');
    viewerInvite = storeState.invites.find((invite) => (
      invite.room === 'gamma' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    ));
    assert.equal(String(viewerInvite.lastUsedAt) >= String(firstViewerInviteUse), true);

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions/gamma?access=${encodeURIComponent(viewerAccessToken || '')}`);
    assert.equal(response.status, 200);
    payload = await response.json();
    assertPublicPayloadHasNoPrivateFields(payload);

    response = await fetch(`http://127.0.0.1:${server.port}/api/sessions`);
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.sessions.some((session) => session.room === 'gamma'), false);
    assertPublicPayloadHasNoPrivateFields(payload);

    const persisted = await fs.readFile(server.sessionStoreFile, 'utf8');
    assert.equal(persisted.includes(viewerAccessToken || ''), false);
    assert.equal(persisted.includes(hostAccessToken), false);

    await closeClient(invitedViewer.ws);
    await closeClient(host.ws);
  } finally {
    await server.stop();
  }
});

test('host reconnect reuses durable private session and marks empty rooms ended', async () => {
  const server = await startServer();

  try {
    const hostMeta = {
      mode: 'remote',
      visibility: 'private',
      sessionTitle: 'Reconnect Room',
      hostName: 'Rafa',
    };
    const hostAccessToken = 'host-secret-reconnect';
    const host = await openClient({
      wsPort: server.wsPort,
      role: 'host',
      room: 'reconnect',
      sessionMeta: hostMeta,
      hostAccessToken,
    });

    host.ws.send(JSON.stringify({
      type: 'join',
      role: 'host',
      room: 'reconnect',
      hostAccess: hostAccessToken,
      ...hostMeta,
    }));
    await waitFor(() => host.messages.some((msg) => msg.type === 'presence' && msg.room === 'reconnect'));

    const inviteResponse = await fetch(
      `http://127.0.0.1:${server.port}/api/sessions/reconnect/invite?hostAccess=${encodeURIComponent(hostAccessToken)}`,
    );
    assert.equal(inviteResponse.status, 200);
    const invitePayload = await inviteResponse.json();
    assertPublicPayloadHasNoPrivateFields(invitePayload);

    let storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'reconnect') &&
      state.invites?.some((invite) => invite.room === 'reconnect' && invite.type === 'viewer_invite') &&
      state.invites?.some((invite) => invite.room === 'reconnect' && invite.type === 'host_access')
    ));
    const sessionBefore = storeState.sessions.find((session) => session.room === 'reconnect');
    const viewerInviteHashBefore = storeState.invites.find((invite) => (
      invite.room === 'reconnect' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    )).tokenHash;
    const hostAccessHashBefore = storeState.invites.find((invite) => (
      invite.room === 'reconnect' &&
      invite.type === 'host_access' &&
      !invite.revokedAt
    )).tokenHash;

    await closeClient(host.ws);
    storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'reconnect' && session.status === 'ended' && session.endedAt) &&
      state.participants?.some((participant) => participant.room === 'reconnect' && participant.disconnectedAt)
    ));
    const endedSession = storeState.sessions.find((session) => session.room === 'reconnect');
    assert.equal(endedSession.sessionId, sessionBefore.sessionId);
    assert.equal(endedSession.status, 'ended');
    assert.equal(Boolean(endedSession.endedAt), true);

    const reconnectedHost = await openClient({
      wsPort: server.wsPort,
      role: 'host',
      room: 'reconnect',
      sessionMeta: hostMeta,
      hostAccessToken,
    });
    reconnectedHost.ws.send(JSON.stringify({
      type: 'join',
      role: 'host',
      room: 'reconnect',
      hostAccess: hostAccessToken,
      ...hostMeta,
    }));
    await waitFor(() => reconnectedHost.messages.some((msg) => (
      msg.type === 'presence' &&
      msg.room === 'reconnect' &&
      msg.hosts === 1
    )));

    storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'reconnect' && session.status === 'waiting' && session.hostCount === 1)
    ));
    const sessionsForRoom = storeState.sessions.filter((session) => session.room === 'reconnect');
    assert.equal(sessionsForRoom.length, 1);
    const sessionAfter = sessionsForRoom[0];
    assert.equal(sessionAfter.sessionId, sessionBefore.sessionId);
    assert.equal(sessionAfter.adHoc, false);
    assert.equal(sessionAfter.metadataSource, 'host');
    assert.equal(sessionAfter.title, 'Reconnect Room');
    assert.equal(sessionAfter.hostName, 'Rafa');
    assert.equal(sessionAfter.visibility, 'private');
    assert.equal(sessionAfter.ownerUserId, null);

    const activeViewerInvites = storeState.invites.filter((invite) => (
      invite.room === 'reconnect' &&
      invite.type === 'viewer_invite' &&
      !invite.revokedAt
    ));
    const activeHostAccessInvites = storeState.invites.filter((invite) => (
      invite.room === 'reconnect' &&
      invite.type === 'host_access' &&
      !invite.revokedAt
    ));
    assert.equal(activeViewerInvites.length, 1);
    assert.equal(activeHostAccessInvites.length, 1);
    assert.equal(activeViewerInvites[0].tokenHash, viewerInviteHashBefore);
    assert.equal(activeHostAccessInvites[0].tokenHash, hostAccessHashBefore);

    await closeClient(reconnectedHost.ws);
    storeState = await waitForSessionStore(server, (state) => (
      state.sessions?.some((session) => session.room === 'reconnect' && session.status === 'ended' && session.endedAt)
    ));
    assert.equal(storeState.sessions.find((session) => session.room === 'reconnect').status, 'ended');
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
