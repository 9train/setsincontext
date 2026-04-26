import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as waitForTurn } from 'node:timers/promises';

import { resolveInfoRenderPlan } from '../src/board.js';
import { installMockBrowser } from './browser-test-helpers.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

function createFakeWebSocketHarness() {
  const sockets = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      this._listeners = new Map();
      sockets.push(this);
    }

    addEventListener(type, fn) {
      const arr = this._listeners.get(type) || [];
      arr.push(fn);
      this._listeners.set(type, arr);
    }

    removeEventListener(type, fn) {
      const arr = this._listeners.get(type) || [];
      this._listeners.set(type, arr.filter((entry) => entry !== fn));
    }

    send(message) {
      this.sent.push(message);
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this._emit('close', {});
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this._emit('open', {});
    }

    emitMessage(payload) {
      this._emit('message', {
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    }

    _emit(type, event) {
      const arr = this._listeners.get(type) || [];
      for (const fn of arr) fn(event);
    }
  }

  return { FakeWebSocket, sockets };
}

test('host bootstrap does not seed room truth from static fallback maps', async () => {
  const fallbackMap = [{ key: 'cc:1:77', target: 'jog_L' }];
  const fetchCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://host.test&room=alpha',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => fallbackMap };
    },
  });

  env.localStorage.setItem('flx.learned.map.v1', JSON.stringify([]));
  env.localStorage.setItem('learned_map', JSON.stringify([]));

  try {
    await importFresh('../src/bootstrap-host.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(2200);
    await waitForTurn();

    const frames = ws.sent.map((message) => JSON.parse(message));
    assert.deepEqual(frames.slice(0, 3), [
      { type: 'hello', role: 'host' },
      { type: 'join', role: 'host', room: 'alpha' },
      { type: 'map:get' },
    ]);
    assert.equal(frames.some((frame) => frame.type === 'map:set'), false);
    assert.equal(frames.some((frame) => frame.type === 'map:ensure'), false);
    assert.deepEqual(fetchCalls, []);
  } finally {
    env.restore();
  }
});

test('host bootstrap does not send empty learned maps or erase official rendering', async () => {
  const fetchCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://host.test&room=empty',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => [] };
    },
  });

  env.localStorage.setItem('flx.learned.map.v1', JSON.stringify([]));
  env.localStorage.setItem('learned_map', JSON.stringify([]));

  try {
    await importFresh('../src/bootstrap-host.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(2200);
    await waitForTurn();

    const frames = ws.sent.map((message) => JSON.parse(message));
    assert.deepEqual(frames.slice(0, 3), [
      { type: 'hello', role: 'host' },
      { type: 'join', role: 'host', room: 'empty' },
      { type: 'map:get' },
    ]);
    assert.deepEqual(fetchCalls, []);
    assert.equal(frames.some((frame) => frame.type === 'map:ensure'), false);
    assert.equal(frames.some((frame) => frame.type === 'map:set'), false);

    assert.equal(env.window.wsClient.sendMap([]), false);
    assert.equal(env.window.wsClient.sendMap({}), false);
    assert.equal(ws.sent.map((message) => JSON.parse(message)).some((frame) => frame.type === 'map:set'), false);

    const renderPlan = resolveInfoRenderPlan({
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.transport.play',
      mappingId: 'deck.left.transport.play.main.press',
      mapped: true,
      truthStatus: 'official',
      type: 'noteon',
      ch: 1,
      d1: 11,
      d2: 127,
      value: 127,
      render: {
        targetId: 'play_L',
        truthStatus: 'official',
        source: 'profile-ui',
      },
    }, []);
    assert.equal(renderPlan.targetId, 'play_L');
    assert.equal(renderPlan.authority, 'official-render');
    assert.equal(renderPlan.ownership, 'official');
  } finally {
    env.restore();
  }
});

test('host bootstrap forwards safe session metadata into the websocket handshake', async () => {
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://host.test&room=alpha&mode=remote&visibility=public&sessionTitle=Warehouse%20Warmup&hostName=Rafa&viewerName=Ada&viewerEmail=ada%40example.com',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });

  try {
    await importFresh('../src/bootstrap-host.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    const url = new URL(ws.url);
    assert.equal(url.searchParams.get('role'), 'host');
    assert.equal(url.searchParams.get('room'), 'alpha');
    assert.equal(url.searchParams.get('mode'), 'remote');
    assert.equal(url.searchParams.get('visibility'), 'public');
    assert.equal(url.searchParams.get('sessionTitle'), 'Warehouse Warmup');
    assert.equal(url.searchParams.get('hostName'), 'Rafa');
    assert.equal(url.searchParams.get('viewerName'), null);
    assert.equal(url.searchParams.get('viewerEmail'), null);

    ws.open();
    await env.advanceTimersBy(1300);
    await waitForTurn();

    const frames = ws.sent.map((message) => JSON.parse(message));
    assert.deepEqual(frames[1], {
      type: 'join',
      role: 'host',
      room: 'alpha',
      mode: 'remote',
      visibility: 'public',
      sessionTitle: 'Warehouse Warmup',
      hostName: 'Rafa',
    });
  } finally {
    env.restore();
  }
});
