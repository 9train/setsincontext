import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initHostDraftMapSync,
  pushDraftMapMetadata,
} from '../src/runtime/host-draft-map-sync.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludesAll(text, expected, label) {
  for (const item of expected) {
    assert.match(text, new RegExp(escapeRegExp(item)), `${label} should include ${item}`);
  }
}

function assertIncludesNone(text, forbidden, label) {
  for (const item of forbidden) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(item)), `${label} should not include ${item}`);
  }
}

function createWindowHarness() {
  const listeners = [];
  const removed = [];

  return {
    windowRef: {
      addEventListener(type, handler) {
        listeners.push({ type, handler });
      },
      removeEventListener(type, handler) {
        removed.push({ type, handler });
      },
    },
    listeners,
    removed,
  };
}

test('host draft map sync module exists and exports its public API', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-draft-map-sync.js');
  const source = readRepoFile('src/runtime/host-draft-map-sync.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.match(source, /export\s+function\s+pushDraftMapMetadata\b/);
  assert.match(source, /export\s+function\s+initHostDraftMapSync\b/);
});

test('host draft map sync module stays scoped away from host boot and controller truth systems', () => {
  const source = readRepoFile('src/runtime/host-draft-map-sync.js');

  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../controllers/',
  ], 'src/runtime/host-draft-map-sync.js');
  assert.doesNotMatch(source, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bboardConsume\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setNormalizer\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setInfoConsumer\b/);
});

test('host.html delegates draft map sync while keeping host boot imports', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/runtime/host-draft-map-sync.js',
    '/src/runtime/host-status-page.js',
    '/src/runtime/host-controller-pipeline.js',
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/midi.js',
    '/src/board.js',
    '/src/bootstrap-host.js',
    '/src/mapper.js',
    'initHostDraftMapSync',
    'loadMappings',
  ], 'host.html');
  assertIncludesNone(host, [
    'function pushMap',
    'setTimeout(pushMap, 250)',
    "window.addEventListener('flx:map-updated', pushMap)",
    'runtimeApp.getWSClient()?.sendMap(draftMapArray)',
    "type: 'map:set'",
    'type: "map:set"',
  ], 'host.html');
  assert.match(host, /bootMIDIFromQuery\b/);
  assert.match(host, /runtimeApp\.consumeNormalizedInfo\(info\)/);
  assert.match(host, /initHostControllerPipeline\(/);
  assert.match(host, /initHostStatusChrome\(/);
});

test('pushDraftMapMetadata sends via sendMap when available', () => {
  const draftMap = [{ id: 'draft-1' }];
  const sendMapCalls = [];
  const sendCalls = [];
  const runtimeApp = {
    getWSClient: () => ({
      sendMap: (map) => sendMapCalls.push(map),
      send: (msg) => sendCalls.push(msg),
    }),
  };

  const result = pushDraftMapMetadata({
    runtimeApp,
    loadMappings: () => draftMap,
  });

  assert.equal(result, draftMap);
  assert.deepEqual(sendMapCalls, [draftMap]);
  assert.deepEqual(sendCalls, []);
});

test('pushDraftMapMetadata falls back to map:set when sendMap is unavailable', () => {
  const draftMap = [{ id: 'draft-1' }];
  const sendCalls = [];
  const runtimeApp = {
    getWSClient: () => ({
      send: (msg) => sendCalls.push(msg),
    }),
  };

  const result = pushDraftMapMetadata({
    runtimeApp,
    loadMappings: () => draftMap,
    now: () => 123,
  });

  assert.equal(result, draftMap);
  assert.deepEqual(sendCalls, [{
    type: 'map:set',
    map: draftMap,
    ts: 123,
  }]);
});

test('pushDraftMapMetadata uses an empty array when loadMappings returns nullish', () => {
  const sendMapCalls = [];
  const runtimeApp = {
    getWSClient: () => ({
      sendMap: (map) => sendMapCalls.push(map),
    }),
  };

  const result = pushDraftMapMetadata({
    runtimeApp,
    loadMappings: () => null,
  });

  assert.deepEqual(result, []);
  assert.deepEqual(sendMapCalls, [[]]);
});

test('pushDraftMapMetadata does not throw without a websocket client', () => {
  const runtimeApp = {
    getWSClient: () => null,
  };

  assert.doesNotThrow(() => pushDraftMapMetadata({
    runtimeApp,
    loadMappings: () => [{ id: 'draft-1' }],
  }));
});

test('pushDraftMapMetadata catches loadMappings errors', () => {
  const warnCalls = [];
  const consoleRef = {
    warn: (...args) => warnCalls.push(args),
  };

  const result = pushDraftMapMetadata({
    runtimeApp: { getWSClient: () => ({ sendMap: () => assert.fail('sendMap should not run') }) },
    loadMappings: () => {
      throw new Error('storage failed');
    },
    consoleRef,
  });

  assert.deepEqual(result, []);
  assert.equal(warnCalls.length, 1);
  assert.match(String(warnCalls[0][0]), /draft map sync|pushMap/i);
  assert.match(String(warnCalls[0][1]?.message), /storage failed/);
});

test('initHostDraftMapSync schedules the initial delayed sync', () => {
  const draftMap = [{ id: 'draft-1' }];
  const sendMapCalls = [];
  const scheduled = [];
  const { windowRef } = createWindowHarness();

  initHostDraftMapSync({
    runtimeApp: { getWSClient: () => ({ sendMap: (map) => sendMapCalls.push(map) }) },
    loadMappings: () => draftMap,
    windowRef,
    setTimeoutRef: (callback, delay) => scheduled.push({ callback, delay }),
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 250);
  scheduled[0].callback();
  assert.deepEqual(sendMapCalls, [draftMap]);
});

test('initHostDraftMapSync registers a flx:map-updated listener', () => {
  const draftMap = [{ id: 'draft-1' }];
  const sendMapCalls = [];
  const { windowRef, listeners } = createWindowHarness();

  initHostDraftMapSync({
    runtimeApp: { getWSClient: () => ({ sendMap: (map) => sendMapCalls.push(map) }) },
    loadMappings: () => draftMap,
    windowRef,
    setTimeoutRef: () => {},
  });

  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'flx:map-updated');
  listeners[0].handler();
  assert.deepEqual(sendMapCalls, [draftMap]);
});

test('initHostDraftMapSync accepts a custom delayMs', () => {
  const scheduled = [];
  const { windowRef } = createWindowHarness();

  initHostDraftMapSync({
    runtimeApp: { getWSClient: () => null },
    loadMappings: () => [],
    windowRef,
    setTimeoutRef: (callback, delay) => scheduled.push({ callback, delay }),
    delayMs: 10,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 10);
});

test('initHostDraftMapSync returns pushNow and dispose controls', () => {
  const { windowRef } = createWindowHarness();
  const controller = initHostDraftMapSync({
    runtimeApp: { getWSClient: () => null },
    loadMappings: () => [],
    windowRef,
    setTimeoutRef: () => {},
  });

  assert.equal(typeof controller.pushNow, 'function');
  assert.equal(typeof controller.dispose, 'function');
});

test('dispose removes the flx:map-updated listener when supported', () => {
  const { windowRef, listeners, removed } = createWindowHarness();
  const controller = initHostDraftMapSync({
    runtimeApp: { getWSClient: () => null },
    loadMappings: () => [],
    windowRef,
    setTimeoutRef: () => {},
  });

  controller.dispose();

  assert.equal(removed.length, 1);
  assert.equal(removed[0].type, 'flx:map-updated');
  assert.equal(removed[0].handler, listeners[0].handler);
});

test('host draft map sync never labels maps as official runtime truth', () => {
  const source = readRepoFile('src/runtime/host-draft-map-sync.js');

  assert.doesNotMatch(source, /controllerTruth\s*:\s*true/);
  assert.doesNotMatch(source, /mapAuthority\s*:\s*['"]official['"]/);
  assert.doesNotMatch(source, /owner\s*:\s*['"]official['"]/);
});
