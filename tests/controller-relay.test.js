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

test('host relay sends normalized controller events as explicit controller_event frames', async () => {
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

    const sent = client.send({
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'mixer.crossfader',
      mappingId: 'mixer.crossfader.primary',
      context: { deckLayer: 'main' },
      mapped: true,
      interaction: 'cc',
      type: 'cc',
      ch: 7,
      controller: 31,
      d1: 31,
      d2: 64,
      value: 64,
      timestamp: 1234567890,
    });

    assert.equal(sent, true);
    assert.ok(statuses.includes('connected'));

    const frames = ws.sent.map((message) => JSON.parse(message));
    const relayFrame = frames.find((frame) => frame.type === 'controller_event');

    assert.deepEqual(relayFrame, {
      type: 'controller_event',
      event: {
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'mixer.crossfader',
        mappingId: 'mixer.crossfader.primary',
        context: { deckLayer: 'main' },
        mapped: true,
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
  } finally {
    env.restore();
  }
});
