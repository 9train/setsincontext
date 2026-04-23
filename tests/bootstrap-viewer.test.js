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

test('viewer bootstrap lets a remote map win before fallback can apply', async () => {
  const fallbackMap = [{ key: 'cc:1:10', target: 'jog_L' }];
  const remoteMap = [{ key: 'cc:1:11', target: 'jog_R' }];
  const fetchCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=alpha',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => fallbackMap };
    },
  });

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();

    await env.advanceTimersBy(1200);
    ws.emitMessage({ type: 'map:sync', room: 'alpha', map: remoteMap, key: 'remote-1' });
    await env.advanceTimersBy(300);

    const expectedRemoteMap = [{ key: 'cc:1:11', target: 'jog_R', ownership: 'draft' }];
    assert.deepEqual(env.window.__currentMap, expectedRemoteMap);
    assert.equal(env.localStorage.getItem('learned_map'), JSON.stringify(expectedRemoteMap));
    assert.equal(fetchCalls.length, 0);
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:remote-map');
    assert.deepEqual(env.dispatchedEvents[0].detail, expectedRemoteMap);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap applies fallback map when no remote map arrives', async () => {
  const fallbackMap = [{ key: 'cc:1:77', target: 'jog_L' }];
  const expectedFallbackMap = [{ key: 'cc:1:77', target: 'jog_L', ownership: 'fallback' }];
  const fetchCalls = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=beta',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => fallbackMap };
    },
  });

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    sockets[0].open();
    await env.advanceTimersBy(1500);

    assert.deepEqual(env.window.__currentMap, expectedFallbackMap);
    assert.equal(env.localStorage.getItem('learned_map'), JSON.stringify(expectedFallbackMap));
    assert.deepEqual(fetchCalls, ['/learned_map.json']);
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:remote-map');
    assert.deepEqual(env.dispatchedEvents[0].detail, expectedFallbackMap);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap forwards linear control WS info to the shared consumer', async () => {
  const seen = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=gamma',
    WebSocketImpl: FakeWebSocket,
  });
  env.window.consumeInfo = (info) => {
    seen.push(info);
    return info;
  };

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);

    ws.emitMessage({
      type: 'info',
      payload: {
        type: 'midi_like',
        payload: {
          type: 'cc',
          ch: 1,
          controller: 16,
          value: 0,
          __flxDebug: true,
          __flxDebugSource: 'host-debug',
        },
      },
    });
    ws.emitMessage({
      type: 'info',
      payload: {
        type: 'midi_like',
        payload: {
          type: 'cc',
          ch: 1,
          controller: 0,
          value: 64,
          __flxDebug: true,
          __flxDebugTarget: 'slider_TEMPO_L',
        },
      },
    });

    assert.deepEqual(seen, [
      {
        type: 'cc',
        ch: 1,
        controller: 16,
        value: 0,
        eventType: undefined,
        profileId: null,
        canonicalTarget: null,
        mappingId: null,
        context: null,
        mapped: false,
        interaction: 'cc',
        timestamp: undefined,
        d1: 16,
        d2: 0,
        __flxDebug: true,
        __flxDebugSource: 'host-debug',
      },
      {
        type: 'cc',
        ch: 1,
        controller: 0,
        value: 64,
        eventType: undefined,
        profileId: null,
        canonicalTarget: null,
        mappingId: null,
        context: null,
        mapped: false,
        interaction: 'cc',
        timestamp: undefined,
        d1: 0,
        d2: 64,
        __flxDebug: true,
        __flxDebugTarget: 'slider_TEMPO_L',
      },
    ]);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap acks incoming probe frames with probe:ack', async () => {
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=probe',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1700);

    const sentBeforeProbe = ws.sent.length;
    ws.emitMessage({ type: 'probe', id: 'probe-123' });

    const sentAfterProbe = ws.sent.map((message) => JSON.parse(message));
    assert.equal(sentAfterProbe.length, sentBeforeProbe + 1);
    assert.deepEqual(sentAfterProbe.at(-1), { type: 'probe:ack', id: 'probe-123' });
    assert.equal(sentAfterProbe.filter((frame) => frame.type === 'probe:ack').length, 1);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap preserves slim canonical relay fields from controller_event frames', async () => {
  const seen = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=delta',
    WebSocketImpl: FakeWebSocket,
  });
  env.window.consumeInfo = (info) => {
    seen.push(info);
    return info;
  };

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);

    ws.emitMessage({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        transport: 'midi',
        sourceId: 'web-midi:ddj-flx6',
        deviceName: 'Pioneer DDJ-FLX6',
        profileId: 'pioneer-ddj-flx6',
        rawTarget: 'slider_ch1',
        valueShape: 'absolute',
        canonicalTarget: 'mixer.channel.1.fader',
        mappingId: 'mixer.channel.1.fader.primary',
        context: { deckLayer: 'main' },
        mapped: true,
        truthStatus: 'official',
        render: {
          targetId: 'slider_ch1',
          truthStatus: 'official',
          source: 'profile-ui',
        },
        interaction: 'cc',
        type: 'cc',
        ch: 1,
        controller: 19,
        d1: 19,
        d2: 64,
        value: 64,
        timestamp: 1234567890,
      },
    });

    assert.deepEqual(seen, [
      {
        eventType: 'normalized_input',
        transport: 'midi',
        sourceId: 'web-midi:ddj-flx6',
        deviceName: 'Pioneer DDJ-FLX6',
        profileId: 'pioneer-ddj-flx6',
        rawTarget: 'slider_ch1',
        valueShape: 'absolute',
        canonicalTarget: 'mixer.channel.1.fader',
        mappingId: 'mixer.channel.1.fader.primary',
        context: { deckLayer: 'main' },
        mapped: true,
        truthStatus: 'official',
        render: {
          targetId: 'slider_ch1',
          truthStatus: 'official',
          source: 'profile-ui',
        },
        interaction: 'cc',
        type: 'cc',
        ch: 1,
        controller: 19,
        d1: 19,
        d2: 64,
        value: 64,
        timestamp: 1234567890,
      },
    ]);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap preserves authoritative jog visuals from controller_event frames', async () => {
  const seen = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=jog',
    WebSocketImpl: FakeWebSocket,
  });
  env.window.consumeInfo = (info) => {
    seen.push(info);
    return info;
  };

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);

    ws.emitMessage({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.jog.motion',
        mappingId: 'deck.left.jog.motion.tertiary',
        mapped: true,
        truthStatus: 'official',
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
            authoredAt: 1064,
            frameMs: 16,
          },
        },
        interaction: 'cc',
        type: 'cc',
        ch: 1,
        controller: 35,
        d1: 35,
        d2: 65,
        value: 65,
        timestamp: 1000,
      },
    });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].render, {
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
  } finally {
    env.restore();
  }
});

test('viewer bootstrap emits learn and monitor observations through the runtime bridge once per relay event', async () => {
  const learnSeen = [];
  const monitorSeen = [];
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=epsilon',
    WebSocketImpl: FakeWebSocket,
  });

  try {
    const { getRuntimeApp } = await importFresh('../src/runtime/app-bridge.js');
    const runtimeApp = getRuntimeApp();
    runtimeApp.addLearnListener('test-learn', (info) => {
      learnSeen.push(info);
    });
    runtimeApp.addMonitorListener('test-monitor', (info) => {
      monitorSeen.push(info);
    });

    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);

    ws.emitMessage({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        mapped: true,
        interaction: 'noteon',
        type: 'noteon',
        ch: 1,
        d1: 11,
        d2: 127,
        value: 127,
        timestamp: 321,
      },
    });

    assert.equal(learnSeen.length, 1);
    assert.equal(monitorSeen.length, 1);
    assert.deepEqual(learnSeen[0], monitorSeen[0]);
    assert.equal(learnSeen[0].canonicalTarget, 'deck.left.transport.play');
    assert.equal(learnSeen[0].mappingId, 'deck.left.transport.play.main.press');
    assert.equal(learnSeen[0].timestamp, 321);
  } finally {
    env.restore();
  }
});
