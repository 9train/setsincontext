import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDebugEventPlan,
  findDebugMapping,
  isLocalDebugRuntime,
  pulseMappedControl,
} from '../src/host-debug.js';
import { installMockBrowser } from './browser-test-helpers.js';

function quietLogger() {
  return { info() {}, warn() {} };
}

test('findDebugMapping prefers a visible coarse linear control over less useful entries', () => {
  const entry = findDebugMapping([
    { key: 'noteon:1:11', target: 'play_L', type: 'noteon', ch: 1, code: 11 },
    { key: 'cc:1:32', target: 'slider_TEMPO_L', type: 'cc', ch: 1, code: 32 },
    { key: 'cc:1:0', target: 'slider_TEMPO_L', type: 'cc', ch: 1, code: 0 },
  ]);

  assert.equal(entry.target, 'slider_TEMPO_L');
  assert.equal(entry.code, 0);
});

test('pulseMappedControl dispatches a visible linear-control sequence through the provided consumer', async () => {
  const seen = [];
  const entry = { key: 'cc:1:16', target: 'xfader', type: 'cc', ch: 1, code: 16 };
  let synced = null;

  const result = await pulseMappedControl({
    mapEntries: [entry],
    consumeInfo: (info) => { seen.push(info); },
    getWSClient: () => ({
      sendMap(map) { synced = map; return true; },
      isAlive() { return true; },
    }),
    stepDelayMs: 0,
    mapSyncDelayMs: 0,
    logger: quietLogger(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.hydrated, false);
   assert.equal(result.syncedMap, true);
  assert.equal(result.entry.target, 'xfader');
  assert.deepEqual(synced, [entry]);
  assert.deepEqual(seen, [
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'xfader',
      __flxDebugKey: 'cc:1:16',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'mixer.crossfader',
      mappingId: null,
      context: null,
      mapped: true,
      rawTarget: 'xfader',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 16,
      value: 0,
      d1: 16,
      d2: 0,
      timestamp: 0,
    },
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'xfader',
      __flxDebugKey: 'cc:1:16',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'mixer.crossfader',
      mappingId: null,
      context: null,
      mapped: true,
      rawTarget: 'xfader',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 16,
      value: 64,
      d1: 16,
      d2: 64,
      timestamp: 0,
    },
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'xfader',
      __flxDebugKey: 'cc:1:16',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'mixer.crossfader',
      mappingId: null,
      context: null,
      mapped: true,
      rawTarget: 'xfader',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 16,
      value: 127,
      d1: 16,
      d2: 127,
      timestamp: 0,
    },
  ]);
});

test('pulseMappedControl can hydrate from fallback map and sync it to the room before dispatch', async () => {
  const fallbackMap = [{ key: 'cc:1:0', target: 'slider_TEMPO_L', type: 'cc', ch: 1, code: 0 }];
  const seen = [];
  let applied = null;
  let synced = null;

  const result = await pulseMappedControl({
    mapEntries: [],
    consumeInfo: (info) => { seen.push(info); },
    getWSClient: () => ({
      sendMap(map) { synced = map; return true; },
      isAlive() { return true; },
    }),
    loadFallback: async () => fallbackMap,
    applyMap: (map) => {
      applied = map;
      return true;
    },
    stepDelayMs: 0,
    mapSyncDelayMs: 0,
    logger: quietLogger(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.hydrated, true);
  assert.equal(result.syncedMap, true);
  assert.deepEqual(applied, fallbackMap);
  assert.deepEqual(synced, fallbackMap);
  assert.deepEqual(seen, [
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'slider_TEMPO_L',
      __flxDebugKey: 'cc:1:0',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.tempo.fader',
      mappingId: 'deck.left.tempo.fader.main.primary',
      context: { deckLayer: 'main' },
      mapped: true,
      rawTarget: 'slider_TEMPO_L',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 0,
      value: 0,
      d1: 0,
      d2: 0,
      timestamp: 0,
    },
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'slider_TEMPO_L',
      __flxDebugKey: 'cc:1:0',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.tempo.fader',
      mappingId: 'deck.left.tempo.fader.main.primary',
      context: { deckLayer: 'main' },
      mapped: true,
      rawTarget: 'slider_TEMPO_L',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 0,
      value: 64,
      d1: 0,
      d2: 64,
      timestamp: 0,
    },
    {
      __flxDebug: true,
      __flxDebugSource: 'host-debug',
      __flxDebugTarget: 'slider_TEMPO_L',
      __flxDebugKey: 'cc:1:0',
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.tempo.fader',
      mappingId: 'deck.left.tempo.fader.main.primary',
      context: { deckLayer: 'main' },
      mapped: true,
      rawTarget: 'slider_TEMPO_L',
      interaction: 'cc',
      type: 'cc',
      ch: 1,
      controller: 0,
      value: 127,
      d1: 0,
      d2: 127,
      timestamp: 0,
    },
  ]);
});

test('isLocalDebugRuntime gates the helper to loopback-style local hosts', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost:8080/host.html' });

  try {
    assert.equal(isLocalDebugRuntime(env.window.location), true);
    assert.equal(isLocalDebugRuntime(new URL('https://www.setsoutofcontext.com/host.html')), false);
  } finally {
    env.restore();
  }
});

test('buildDebugEventPlan turns note mappings into a visible pulse', () => {
  const plan = buildDebugEventPlan({
    key: 'noteon:1:11',
    target: 'play_L',
    type: 'noteon',
    ch: 1,
    code: 11,
  }, { stepDelayMs: 25 });

  assert.deepEqual(plan, [
    {
      delayMs: 0,
      info: {
        __flxDebug: true,
        __flxDebugSource: 'host-debug',
        __flxDebugTarget: 'play_L',
        __flxDebugKey: 'noteon:1:11',
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.press',
        context: { deckLayer: 'main' },
        mapped: true,
        rawTarget: 'play_L',
        interaction: 'noteon',
        type: 'noteon',
        ch: 1,
        d1: 11,
        d2: 127,
        value: 127,
        timestamp: 0,
      },
    },
    {
      delayMs: 25,
      info: {
        __flxDebug: true,
        __flxDebugSource: 'host-debug',
        __flxDebugTarget: 'play_L',
        __flxDebugKey: 'noteon:1:11',
        eventType: 'normalized_input',
        profileId: 'pioneer-ddj-flx6',
        canonicalTarget: 'deck.left.transport.play',
        mappingId: 'deck.left.transport.play.main.release',
        context: { deckLayer: 'main' },
        mapped: true,
        rawTarget: 'play_L',
        interaction: 'noteoff',
        type: 'noteoff',
        ch: 1,
        d1: 11,
        d2: 0,
        value: 0,
        timestamp: 0,
      },
    },
  ]);
});
