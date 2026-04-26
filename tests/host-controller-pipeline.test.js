import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractHostControllerDetails,
  initHostControllerPipeline,
  normalizeHostInfo,
} from '../src/runtime/host-controller-pipeline.js';

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

function createRuntimeApp(wsClient = null) {
  const calls = {
    normalizer: null,
    consumer: null,
  };
  return {
    calls,
    setNormalizer(fn) {
      calls.normalizer = fn;
      return fn;
    },
    setInfoConsumer(fn) {
      calls.consumer = fn;
      return fn;
    },
    getWSClient() {
      return wsClient;
    },
  };
}

test('host controller pipeline module exists and exports its public API', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-controller-pipeline.js');
  const source = readRepoFile('src/runtime/host-controller-pipeline.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.match(source, /export\s+function\s+normalizeHostInfo\b/);
  assert.match(source, /export\s+function\s+initHostControllerPipeline\b/);
});

test('host controller pipeline stays scoped away from host boot systems', () => {
  const source = readRepoFile('src/runtime/host-controller-pipeline.js');

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
    '../mapper.js',
  ], 'src/runtime/host-controller-pipeline.js');
  assert.doesNotMatch(source, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bloadMappings\b/);
});

test('host.html delegates pipeline glue while keeping host boot imports', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/runtime/host-controller-pipeline.js',
    '/src/runtime/host-status-page.js',
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/midi.js',
    '/src/board.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
  assertIncludesNone(host, [
    'function normalizeInfo',
    'runtimeApp.setNormalizer(normalizeInfo)',
    'runtimeApp.setInfoConsumer((info) => {',
    'runtimeApp.getWSClient()?.isAlive?.()',
    'runtimeApp.getWSClient().send(info)',
  ], 'host.html');
  assertIncludesAll(host, [
    'runtimeApp.consumeNormalizedInfo(info)',
    'runtimeApp.consumeInfo(info)',
    'boardConsume',
    'bootMIDIFromQuery',
    'initHostDraftMapSync',
    'loadMappings',
  ], 'host.html');
});

test('normalizeHostInfo returns primitives unchanged', () => {
  assert.equal(normalizeHostInfo(null), null);
  assert.equal(normalizeHostInfo(undefined), undefined);
  assert.equal(normalizeHostInfo('cc'), 'cc');
  assert.equal(normalizeHostInfo(12), 12);
});

test('normalizeHostInfo unwraps wrapper objects', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'midi_like', payload: { type: 'cc', controller: 10, value: 64 } }),
    { type: 'cc', controller: 10, value: 64, d1: 10, d2: 64 },
  );
});

test('normalizeHostInfo normalizes direct CC d1/d2 fields', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'cc', d1: 7, d2: 99 }),
    { type: 'cc', d1: 7, d2: 99, controller: 7, value: 99 },
  );
});

test('normalizeHostInfo normalizes direct CC controller/value fields', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'cc', controller: 12, value: 33 }),
    { type: 'cc', controller: 12, value: 33, d1: 12, d2: 33 },
  );
});

test('normalizeHostInfo normalizes noteon and noteoff fields', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'noteon', code: 54, value: 127 }),
    { type: 'noteon', code: 54, value: 127, d1: 54, d2: 127 },
  );
  assert.deepEqual(
    normalizeHostInfo({ type: 'noteoff', code: 54, value: 0 }),
    { type: 'noteoff', code: 54, value: 0, d1: 54, d2: 0 },
  );
});

test('normalizeHostInfo normalizes generic MIDI CC envelopes', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'midi', mtype: 'cc', code: 21, value: 65 }),
    { type: 'cc', mtype: 'cc', code: 21, value: 65, controller: 21, d1: 21, d2: 65 },
  );
});

test('normalizeHostInfo normalizes generic MIDI note envelopes', () => {
  assert.deepEqual(
    normalizeHostInfo({ type: 'midi', mtype: 'noteon', code: 11, value: 127 }),
    { type: 'noteon', mtype: 'noteon', code: 11, value: 127, d1: 11, d2: 127 },
  );
});

test('normalizeHostInfo returns unknown objects as shallow copies', () => {
  const input = { type: 'custom', value: 1 };
  const normalized = normalizeHostInfo(input);

  assert.deepEqual(normalized, { type: 'custom', value: 1 });
  assert.notEqual(normalized, input);
});

test('extractHostControllerDetails reads host controller identity fields', () => {
  assert.deepEqual(extractHostControllerDetails({
    device: {
      inputName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      transport: 'midi',
    },
    profile: {
      id: 'fallback-profile',
      displayName: 'DDJ-FLX6',
    },
    timestamp: 123,
  }), {
    deviceName: 'Pioneer DDJ-FLX6',
    profileId: 'pioneer-ddj-flx6',
    profileLabel: 'DDJ-FLX6',
    transport: 'midi',
    ready: true,
    timestamp: 123,
  });
});

test('initHostControllerPipeline registers normalizer and live consumer behavior', () => {
  const sent = [];
  const details = [];
  const boardSeen = [];
  let refreshCount = 0;
  const wsClient = {
    isAlive: () => true,
    send: (info) => sent.push(info),
  };
  const runtimeApp = createRuntimeApp(wsClient);
  const hostStatus = {
    noteControllerDetails: (entry) => details.push(entry),
    refresh: () => {
      refreshCount += 1;
    },
  };
  const boardConsume = (info) => {
    boardSeen.push(info);
    return { rendered: true };
  };

  const pipeline = initHostControllerPipeline({ runtimeApp, boardConsume, hostStatus });
  const info = {
    device: {
      inputName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      transport: 'midi',
    },
    profile: {
      displayName: 'DDJ-FLX6',
    },
    timestamp: 456,
  };

  assert.equal(runtimeApp.calls.normalizer, normalizeHostInfo);
  assert.equal(runtimeApp.calls.consumer, pipeline.consumeHostInfo);
  assert.equal(typeof runtimeApp.calls.consumer, 'function');

  const result = runtimeApp.calls.consumer(info);

  assert.deepEqual(details, [{
    deviceName: 'Pioneer DDJ-FLX6',
    profileId: 'pioneer-ddj-flx6',
    profileLabel: 'DDJ-FLX6',
    transport: 'midi',
    ready: true,
    timestamp: 456,
  }]);
  assert.deepEqual(sent, [info]);
  assert.deepEqual(boardSeen, [info]);
  assert.deepEqual(result, { rendered: true });
  assert.deepEqual(pipeline.getLastBoardResult(), { rendered: true });
  assert.equal(refreshCount, 1);
});

test('initHostControllerPipeline still consumes board info without a live websocket', () => {
  const boardSeen = [];
  let refreshCount = 0;
  const runtimeApp = createRuntimeApp(null);

  initHostControllerPipeline({
    runtimeApp,
    boardConsume: (info) => {
      boardSeen.push(info);
      return 'board-result';
    },
    hostStatus: {
      refresh: () => {
        refreshCount += 1;
      },
    },
  });

  const info = { type: 'cc', controller: 1, value: 2 };
  assert.equal(runtimeApp.calls.consumer(info), 'board-result');
  assert.deepEqual(boardSeen, [info]);
  assert.equal(refreshCount, 1);
});

test('initHostControllerPipeline does not send when websocket exists but is not alive', () => {
  const sent = [];
  const boardSeen = [];
  const runtimeApp = createRuntimeApp({
    isAlive: () => false,
    send: (info) => sent.push(info),
  });

  initHostControllerPipeline({
    runtimeApp,
    boardConsume: (info) => {
      boardSeen.push(info);
      return true;
    },
    hostStatus: {},
  });

  const info = { type: 'noteon', d1: 11, d2: 127 };
  assert.equal(runtimeApp.calls.consumer(info), true);
  assert.deepEqual(sent, []);
  assert.deepEqual(boardSeen, [info]);
});

test('initHostControllerPipeline fails clearly without required runtimeApp APIs', () => {
  assert.throws(
    () => initHostControllerPipeline({ runtimeApp: null }),
    /runtimeApp/,
  );
  assert.throws(
    () => initHostControllerPipeline({ runtimeApp: { setNormalizer() {} } }),
    /setInfoConsumer/,
  );
});
