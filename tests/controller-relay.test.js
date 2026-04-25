import test from 'node:test';
import assert from 'node:assert/strict';

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
      this._listeners.set(type, arr.filter((x) => x !== fn));
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

    _emit(type, event) {
      const arr = this._listeners.get(type) || [];
      for (const fn of arr) fn(event);
    }
  }

  return { FakeWebSocket, sockets };
}

test('host relay sends slim controller_event frames without heavy local internals', async () => {
  const statuses = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    const client = connectWS({
      url: 'ws://relay.test',
      role: 'host',
      room: 'omega',
      onStatus: (status) => statuses.push(status),
    });

    assert.equal(sockets.length, 1);
    const ws = sockets[0];
    ws.open();

    await env.advanceTimersBy(1300);

    const heavyBlob = 'x'.repeat(250000);
    const sourceInfo = {
      eventType: 'normalized_input',
      transport: 'midi',
      sourceId: 'web-midi:ddj-flx6',
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      rawTarget: 'xfader',
      valueShape: 'absolute',
      canonicalTarget: 'mixer.crossfader',
      mappingId: 'mixer.crossfader.primary',
      context: { deckLayer: 'main' },
      mapped: true,
      truthStatus: 'official',
      interaction: 'cc',
      type: 'cc',
      ch: 7,
      controller: 31,
      d1: 31,
      d2: 64,
      value: 64,
      timestamp: 1234567890,
      render: {
        targetId: 'xfader',
        truthStatus: 'official',
        source: 'profile-ui',
        dump: heavyBlob,
      },
      raw: {
        eventType: 'raw_input',
        packet: { bytes: [0xb6, 31, 64] },
        dump: heavyBlob,
      },
      controllerState: {
        updatedAt: 1234567890,
        temporary: {
          lastDebugEvent: { dump: heavyBlob },
        },
      },
      device: {
        id: 'midi-device-1',
        inputName: 'Pioneer DDJ-FLX6',
        transport: 'midi',
        dump: heavyBlob,
      },
      profile: {
        id: 'pioneer-ddj-flx6',
        dump: heavyBlob,
      },
      debug: {
        eventType: 'controller_debug_resolution',
        truthStatus: 'official',
        truthSummary: 'owner:unknown pad:unknown ch4:unknown',
        truthFocus: {
          deckOwnership: {
            after: { status: 'unknown', value: { ownerDeck: null, ownerLayer: null } },
          },
        },
        dump: heavyBlob,
      },
      semantic: {
        meaning: 'crossfader',
        dump: heavyBlob,
      },
      matchedBinding: {
        id: 'mixer.crossfader.primary',
        rawTarget: 'xfader',
        dump: heavyBlob,
      },
    };
    const sourceBytes = Buffer.byteLength(JSON.stringify(sourceInfo), 'utf8');

    const sent = client.send(sourceInfo);

    assert.equal(sent, true);
    assert.ok(statuses.includes('connected'));
    assert.ok(sourceBytes > 1500000);

    const frames = ws.sent.map((message) => JSON.parse(message));
    const relayFrame = frames.find((frame) => frame.type === 'controller_event');
    const relayBytes = Buffer.byteLength(JSON.stringify(relayFrame.event), 'utf8');

    assert.deepEqual(relayFrame, {
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        transport: 'midi',
        sourceId: 'web-midi:ddj-flx6',
        deviceName: 'Pioneer DDJ-FLX6',
        profileId: 'pioneer-ddj-flx6',
        rawTarget: 'xfader',
        valueShape: 'absolute',
        canonicalTarget: 'mixer.crossfader',
        mappingId: 'mixer.crossfader.primary',
        context: { deckLayer: 'main' },
        mapped: true,
        truthStatus: 'official',
        render: {
          targetId: 'xfader',
          truthStatus: 'official',
          source: 'profile-ui',
        },
        interaction: 'cc',
        type: 'cc',
        ch: 7,
        controller: 31,
        d1: 31,
        d2: 64,
        value: 64,
        timestamp: 1234567890,
      },
    });
    assert.ok(relayBytes < 1024);
    assert.equal('raw' in relayFrame.event, false);
    assert.equal('controllerState' in relayFrame.event, false);
    assert.equal('device' in relayFrame.event, false);
    assert.equal('profile' in relayFrame.event, false);
    assert.equal('debug' in relayFrame.event, false);
    assert.equal('semantic' in relayFrame.event, false);
    assert.equal('matchedBinding' in relayFrame.event, false);
  } finally {
    env.restore();
  }
});

test('host relay preserves a slim authoritative jog visual snapshot for viewers', async () => {
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    const client = connectWS({
      url: 'ws://relay.test',
      role: 'host',
      room: 'sigma',
    });

    assert.equal(sockets.length, 1);
    const ws = sockets[0];
    ws.open();

    await env.advanceTimersBy(1300);

    const sent = client.send({
      eventType: 'normalized_input',
      transport: 'midi',
      sourceId: 'web-midi:ddj-flx6',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.tertiary',
      mapped: true,
      truthStatus: 'official',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 35,
      d1: 35,
      d2: 65,
      value: 65,
      timestamp: 1000,
      render: {
        targetId: 'jog_L',
        truthStatus: 'official',
        source: 'profile-ui',
        jogVisual: {
          side: 'L',
          angle: 0.7036,
          vel: 0.0444,
          damping: 0.78,
          lane: 'platter_vinyl_off',
          motionMode: 'spin',
          touchActive: false,
          touchLane: null,
          authoredAt: 1064,
          frameMs: 16,
          dump: 'x'.repeat(50000),
        },
      },
    });

    assert.equal(sent, true);

    const frames = ws.sent.map((message) => JSON.parse(message));
    const relayFrame = frames.find((frame) => frame.type === 'controller_event');
    const relayBytes = Buffer.byteLength(JSON.stringify(relayFrame.event), 'utf8');

    assert.deepEqual(relayFrame.event.render, {
      targetId: 'jog_L',
      truthStatus: 'official',
      source: 'profile-ui',
      jogVisual: {
        side: 'L',
        angle: 0.7036,
        vel: 0.0444,
        damping: 0.78,
        lane: 'platter_vinyl_off',
        motionMode: 'spin',
        touchActive: false,
        authoredAt: 1064,
        frameMs: 16,
      },
    });
    assert.ok(relayBytes < 768);
  } finally {
    env.restore();
  }
});

test('probe winner completes the same handshake setup as reconnect without duplicate hello', async () => {
  const statuses = [];
  const intervalCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (cb, delay = 0) => {
    intervalCalls.push(delay);
    return originalSetInterval(cb, delay);
  };

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    connectWS({
      url: 'ws://relay.test',
      role: 'viewer',
      room: 'omega',
      onStatus: (status) => statuses.push(status),
    });

    assert.equal(sockets.length, 1);
    const firstSocket = sockets[0];
    firstSocket.open();

    await env.advanceTimersBy(1300);

    const firstFrames = firstSocket.sent.map((message) => JSON.parse(message));
    assert.deepEqual(firstFrames, [
      { type: 'hello', role: 'viewer' },
      { type: 'join', role: 'viewer', room: 'omega' },
      { type: 'map:get' },
    ]);
    assert.equal(intervalCalls.length, 1);
    assert.equal(intervalCalls[0], 25000);
    assert.ok(statuses.includes('connected'));

    firstSocket.close();
    await env.advanceTimersBy(1000);

    assert.equal(sockets.length, 2);
    const reconnectSocket = sockets[1];
    reconnectSocket.open();

    const reconnectFrames = reconnectSocket.sent.map((message) => JSON.parse(message));
    assert.deepEqual(reconnectFrames, [
      { type: 'hello', role: 'viewer' },
      { type: 'join', role: 'viewer', room: 'omega' },
      { type: 'map:get' },
    ]);
    assert.equal(intervalCalls.length, 2);
    assert.equal(intervalCalls[1], 25000);
  } finally {
    globalThis.setInterval = originalSetInterval;
    env.restore();
  }
});

test('host handshake sends hello join map:get on first connect and reconnect while arming ping', async () => {
  const statuses = [];
  const intervalCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (cb, delay = 0) => {
    intervalCalls.push(delay);
    return originalSetInterval(cb, delay);
  };

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    connectWS({
      url: 'ws://relay.test',
      role: 'host',
      room: 'omega',
      onStatus: (status) => statuses.push(status),
    });

    assert.equal(sockets.length, 1);
    const firstSocket = sockets[0];
    firstSocket.open();

    await env.advanceTimersBy(1300);

    const firstFrames = firstSocket.sent.map((message) => JSON.parse(message));
    assert.deepEqual(firstFrames, [
      { type: 'hello', role: 'host' },
      { type: 'join', role: 'host', room: 'omega' },
      { type: 'map:get' },
    ]);
    assert.equal(intervalCalls.length, 1);
    assert.equal(intervalCalls[0], 25000);
    assert.ok(statuses.includes('connected'));

    firstSocket.close();
    await env.advanceTimersBy(1000);

    assert.equal(sockets.length, 2);
    const reconnectSocket = sockets[1];
    reconnectSocket.open();

    const reconnectFrames = reconnectSocket.sent.map((message) => JSON.parse(message));
    assert.deepEqual(reconnectFrames, [
      { type: 'hello', role: 'host' },
      { type: 'join', role: 'host', room: 'omega' },
      { type: 'map:get' },
    ]);
    assert.equal(intervalCalls.length, 2);
    assert.equal(intervalCalls[1], 25000);
  } finally {
    globalThis.setInterval = originalSetInterval;
    env.restore();
  }
});

test('host probe sends a raw probe frame only when open and viewers cannot send it', async () => {
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    const hostClient = connectWS({
      url: 'ws://relay.test',
      role: 'host',
      room: 'omega',
    });

    assert.equal(sockets.length, 1);
    const hostSocket = sockets[0];

    assert.equal(hostClient.probe('alpha'), false);
    assert.deepEqual(hostSocket.sent.map((message) => JSON.parse(message)), []);

    hostSocket.open();
    await env.advanceTimersBy(1300);

    assert.equal(hostClient.probe('alpha'), true);
    const hostFrames = hostSocket.sent.map((message) => JSON.parse(message));
    assert.deepEqual(hostFrames.at(-1), { type: 'probe', id: 'alpha' });
    assert.equal(hostFrames.filter((frame) => frame.type === 'probe').length, 1);
    assert.equal(hostFrames.filter((frame) => frame.type === 'controller_event').length, 0);

    const viewerClient = connectWS({
      url: 'ws://relay.test',
      role: 'viewer',
      room: 'omega',
    });
    assert.equal(sockets.length, 2);
    const viewerSocket = sockets[1];
    viewerSocket.open();
    await env.advanceTimersBy(1300);

    assert.equal(viewerClient.probe('beta'), false);
    const viewerFrames = viewerSocket.sent.map((message) => JSON.parse(message));
    assert.equal(viewerFrames.some((frame) => frame.type === 'probe'), false);
  } finally {
    env.restore();
  }
});

test('host sendMap ignores empty learned maps but still syncs non-empty maps', async () => {
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    const { connectWS } = await importFresh('../src/ws.js');
    const client = connectWS({
      url: 'ws://relay.test',
      role: 'host',
      room: 'omega',
    });

    assert.equal(sockets.length, 1);
    const ws = sockets[0];

    assert.equal(client.sendMap(null), false);
    assert.equal(client.sendMap([]), false);
    assert.equal(client.sendMap({}), false);

    ws.open();
    await env.advanceTimersBy(1300);

    assert.equal(client.sendMap([]), false);
    assert.equal(client.sendMap({}), false);
    assert.equal(client.sendMap([{}, null]), false);

    assert.equal(client.send({
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
      timestamp: 456,
    }), true);

    const learnedMap = [{ key: 'cc:1:31', target: 'xfader', type: 'cc', ch: 1, code: 31 }];
    assert.equal(client.sendMap(learnedMap), true);

    const frames = ws.sent.map((message) => JSON.parse(message));
    assert.deepEqual(frames.slice(0, 3), [
      { type: 'hello', role: 'host' },
      { type: 'join', role: 'host', room: 'omega' },
      { type: 'map:get' },
    ]);
    assert.deepEqual(
      frames.filter((frame) => frame.type === 'map:set'),
      [{ type: 'map:set', map: learnedMap }],
    );
    const relayFrame = frames.find((frame) => frame.type === 'controller_event');
    assert.equal(relayFrame.event.render.targetId, 'play_L');
    assert.equal(relayFrame.event.render.truthStatus, 'official');
    assert.equal(relayFrame.event.truthStatus, 'official');
  } finally {
    env.restore();
  }
});
