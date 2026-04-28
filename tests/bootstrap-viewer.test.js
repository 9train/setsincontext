import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeInfo } from '../src/board.js';
import { inspectBoardTarget } from '../src/board.js';
import { installBoardWindowBindings } from '../src/board/runtime.js';
import {
  heldBinaryTargets,
  jogAngle,
  knobAccumAngle,
  lastCCValue,
  litTimers,
  pairedAbsoluteState,
  setBoardSvgRoot,
  setFileMapCache,
  setUnifiedMap,
} from '../src/board/state.js';
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

function createClassList() {
  const tokens = new Set();
  return {
    add(...values) {
      values.forEach((value) => tokens.add(String(value)));
    },
    remove(...values) {
      values.forEach((value) => tokens.delete(String(value)));
    },
    contains(value) {
      return tokens.has(String(value));
    },
  };
}

function clearStore(store) {
  for (const key of Object.keys(store || {})) {
    delete store[key];
  }
}

function resetBoardState() {
  setBoardSvgRoot(null);
  setUnifiedMap([]);
  setFileMapCache([]);
  clearStore(lastCCValue);
  clearStore(knobAccumAngle);
  clearStore(jogAngle);
  clearStore(litTimers);
  clearStore(heldBinaryTargets);
  clearStore(pairedAbsoluteState);
}

function createBoardFixture(ids = []) {
  const elements = new Map();
  const root = {
    getElementById(id) {
      return elements.get(String(id || '')) || null;
    },
  };

  ids.forEach((id) => {
    const attrs = new Map([['id', String(id)]]);
    elements.set(String(id), {
      id: String(id),
      ownerSVGElement: root,
      children: [],
      classList: createClassList(),
      style: {
        removeProperty(name) {
          delete this[name];
        },
      },
      getAttribute(name) {
        return attrs.has(name) ? attrs.get(name) : null;
      },
      hasAttribute(name) {
        return attrs.has(name);
      },
      setAttribute(name, value) {
        attrs.set(name, String(value));
      },
      getBBox() {
        return { x: 0, y: 0, width: 100, height: 100 };
      },
    });
  });

  return { root, elements };
}

function assertOnlyLit(elements, ids, activeId, label = '') {
  ids.forEach((id) => {
    assert.equal(elements.get(id).classList.contains('lit'), id === activeId, `${label}${id}`);
  });
}

test('viewer bootstrap retains remote map sync as draft metadata without fallback bootstrap', async () => {
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
    assert.equal(env.window.__currentMapRuntimeAuthority, false);
    assert.equal(env.window.__currentMapMetadata.controllerTruth, false);
    assert.equal(env.localStorage.getItem('learned_map'), JSON.stringify(expectedRemoteMap));
    assert.equal(fetchCalls.length, 0);
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:draft-map-candidate');
    assert.deepEqual(env.dispatchedEvents[0].detail.map, expectedRemoteMap);
    assert.equal(env.dispatchedEvents[0].detail.metadata.controllerTruth, false);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap renders official controller_event frames without fallback map bootstrap', async () => {
  const seen = [];
  const fetchCalls = [];
  const { root, elements } = createBoardFixture(['play_L']);
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=official',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => [] };
    },
  });
  resetBoardState();
  setBoardSvgRoot(root);
  installBoardWindowBindings();
  env.window.consumeInfo = (info) => {
    seen.push(info);
    consumeInfo(info);
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
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        mapped: true,
        truthStatus: 'official',
        valueShape: 'binary',
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
        timestamp: 1,
      },
    });

    assert.equal(fetchCalls.length, 0);
    assert.equal(env.localStorage.getItem('learned_map'), null);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]._boardRender.targetId, 'play_L');
    assert.equal(seen[0]._boardRender.authority, 'official-render');
    assert.equal(seen[0]._boardRender.ownership, 'official');
    assert.equal(seen[0]._boardRender.outcome, 'updated');
    assert.equal(elements.get('play_L').classList.contains('lit'), true);
  } finally {
    resetBoardState();
    env.restore();
  }
});

test('viewer bootstrap passes compact controllerVisualState to board projection without controllerState', async () => {
  const seen = [];
  const { root, elements } = createBoardFixture([
    'play_L',
    'hotcue_L',
    'padfx_L',
    'beatjump_L',
    'sampler_L',
    'hotcue_R',
    'padfx_R',
    'beatjump_R',
    'sampler_R',
    'deck_layer_alt_R',
    'deck_layer_main_R',
    'vinyl_R',
  ]);
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=visual-state',
    WebSocketImpl: FakeWebSocket,
  });
  resetBoardState();
  setBoardSvgRoot(root);
  installBoardWindowBindings();
  env.window.consumeInfo = (info) => {
    seen.push(info);
    consumeInfo(info);
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
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        mapped: true,
        truthStatus: 'official',
        valueShape: 'binary',
        render: {
          targetId: 'play_L',
          truthStatus: 'official',
          source: 'profile-ui',
        },
        controllerVisualState: {
          padMode: {
            left: 'hotcue',
            right: 'sampler',
          },
          jogCutter: {
            right: true,
          },
          jogVinylMode: {
            right: false,
          },
        },
        interaction: 'noteon',
        type: 'noteon',
        ch: 1,
        d1: 11,
        d2: 127,
        value: 127,
        timestamp: 3,
      },
    });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].controllerVisualState, {
      padMode: {
        left: 'hotcue',
        right: 'sampler',
      },
      jogCutter: {
        right: true,
      },
      jogVinylMode: {
        right: false,
      },
    });
    assert.equal('controllerState' in seen[0], false);
    assert.equal(seen[0]._boardRender.targetId, 'play_L');
    assert.equal(seen[0]._boardRender.authority, 'official-render');
    assert.equal(seen[0]._boardRender.outcome, 'updated');
    assert.equal(elements.get('play_L').classList.contains('lit'), true);
    assertOnlyLit(elements, ['hotcue_L', 'padfx_L', 'beatjump_L', 'sampler_L'], 'hotcue_L', 'left pad mode ');
    assertOnlyLit(elements, ['hotcue_R', 'padfx_R', 'beatjump_R', 'sampler_R'], 'sampler_R', 'right pad mode ');
    assertOnlyLit(elements, ['deck_layer_alt_R', 'deck_layer_main_R', 'vinyl_R'], 'deck_layer_alt_R', 'right deck state ');
  } finally {
    resetBoardState();
    env.restore();
  }
});

test('viewer bootstrap does not load fallback maps when no remote map arrives', async () => {
  const fallbackMap = [{ key: 'cc:1:77', target: 'jog_L' }];
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

    assert.equal(env.window.__currentMap, undefined);
    assert.equal(env.localStorage.getItem('learned_map'), null);
    assert.deepEqual(fetchCalls, []);
    assert.equal(env.dispatchedEvents.length, 0);
  } finally {
    env.restore();
  }
});

test('viewer bootstrap keeps received fallback candidates diagnostic-only for unknown raw MIDI', async () => {
  const seen = [];
  const fallbackMap = [{
    key: 'noteon:1:77',
    target: 'play_L',
    type: 'noteon',
    ch: 1,
    code: 77,
  }];
  const { root, elements } = createBoardFixture(['play_L']);
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=fallback-raw',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async () => ({ ok: true, json: async () => fallbackMap }),
  });
  resetBoardState();
  setBoardSvgRoot(root);
  installBoardWindowBindings();
  env.window.consumeInfo = (info) => {
    seen.push(info);
    consumeInfo(info);
    return info;
  };

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);
    ws.emitMessage({
      type: 'map:sync',
      room: 'fallback-raw',
      map: fallbackMap.map((entry) => ({ ...entry, ownership: 'fallback' })),
      key: 'fallback-raw-1',
      mapAuthority: 'draft',
      mapState: 'provisional',
      controllerTruth: false,
    });

    assert.deepEqual(env.window.__currentMap, [{
      key: 'noteon:1:77',
      target: 'play_L',
      type: 'noteon',
      ch: 1,
      code: 77,
      ownership: 'fallback',
    }]);
    assert.equal(env.window.__currentMapRuntimeAuthority, false);

    ws.emitMessage({
      type: 'midi_like',
      payload: {
        type: 'noteon',
        ch: 1,
        d1: 77,
        d2: 127,
        value: 127,
        __flxDebug: true,
        __flxDebugSource: 'fallback-map-review',
      },
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].__flxDebug, true);
    assert.equal(seen[0]._boardRender.targetId, null);
    assert.equal(seen[0]._boardRender.authority, 'unmapped');
    assert.equal(seen[0]._boardRender.ownership, 'unknown');
    assert.equal(seen[0]._boardRender.outcome, 'absent');
    assert.equal(elements.get('play_L').classList.contains('lit'), false);
  } finally {
    resetBoardState();
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

test('viewer bootstrap ignores stale boardCompat targets received over WS', async () => {
  const seen = [];
  const { root, elements } = createBoardFixture(['play_L']);
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=compat-stale',
    WebSocketImpl: FakeWebSocket,
  });
  resetBoardState();
  setBoardSvgRoot(root);
  installBoardWindowBindings();
  env.window.consumeInfo = (info) => {
    seen.push(info);
    consumeInfo(info);
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
        type: 'noteon',
        ch: 1,
        d1: 11,
        d2: 127,
        value: 127,
        boardCompat: {
          targetId: 'play_L',
          source: 'legacy-compatibility',
          reason: 'stale-board-target',
        },
      },
    });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].boardCompat, {
      targetId: 'play_L',
      source: 'legacy-compatibility',
      reason: 'stale-board-target',
    });
    assert.equal(seen[0]._boardRender.targetId, null);
    assert.equal(seen[0]._boardRender.authority, 'unmapped');
    assert.equal(seen[0]._boardRender.outcome, 'absent');
    assert.equal(elements.get('play_L').classList.contains('lit'), false);
  } finally {
    resetBoardState();
    env.restore();
  }
});

test('viewer bootstrap retains conflicting remote maps as draft while official relay render wins', async () => {
  const seen = [];
  const remoteMap = [{
    key: 'noteon:1:11',
    target: 'cue_R',
    ownership: 'official',
    canonicalTarget: 'deck.left.transport.play',
  }];
  const { root, elements } = createBoardFixture(['play_L', 'cue_R']);
  const { FakeWebSocket, sockets } = createFakeWebSocketHarness();
  const env = installMockBrowser({
    locationSearch: '?ws=ws://viewer.test&room=remote-conflict',
    WebSocketImpl: FakeWebSocket,
  });
  resetBoardState();
  setBoardSvgRoot(root);
  installBoardWindowBindings();
  env.window.consumeInfo = (info) => {
    seen.push(info);
    consumeInfo(info);
    return info;
  };

  try {
    await importFresh('../src/bootstrap-viewer.js');
    assert.equal(sockets.length, 1);

    const ws = sockets[0];
    ws.open();
    await env.advanceTimersBy(1200);
    ws.emitMessage({ type: 'map:sync', room: 'remote-conflict', map: remoteMap, key: 'remote-conflict-1' });

    assert.deepEqual(env.window.__currentMap, [{
      key: 'noteon:1:11',
      target: 'cue_R',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
    }]);

    ws.emitMessage({
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        mapped: true,
        truthStatus: 'official',
        valueShape: 'binary',
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
        timestamp: 2,
      },
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]._boardRender.targetId, 'play_L');
    assert.equal(seen[0]._boardRender.authority, 'official-render');
    assert.equal(seen[0]._boardRender.ownership, 'official');
    assert.equal(elements.get('play_L').classList.contains('lit'), true);
    assert.equal(elements.get('cue_R').classList.contains('lit'), false);

    const inspection = inspectBoardTarget('cue_R', env.window.__currentMap);
    assert.equal(inspection.officialSource.status, 'official');
    assert.equal(inspection.compatibilityMappings.length, 1);
    assert.equal(inspection.compatibilityMappings[0].ownership, 'draft');
    assert.equal(inspection.compatibilityMappings[0].reviewState, 'blocked');
  } finally {
    resetBoardState();
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
