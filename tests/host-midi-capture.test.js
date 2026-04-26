import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startHostMidiCapture } from '../src/runtime/host-midi-capture.js';

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

function createConsoleRef() {
  const calls = {
    log: [],
    warn: [],
  };
  return {
    calls,
    log: (...args) => calls.log.push(args),
    warn: (...args) => calls.warn.push(args),
  };
}

test('host midi capture module exists and exports startHostMidiCapture', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-midi-capture.js');
  const source = readRepoFile('src/runtime/host-midi-capture.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof startHostMidiCapture, 'function');
  assert.match(source, /export\s+async\s+function\s+startHostMidiCapture\b/);
});

test('host midi capture module stays scoped to capture callback wiring', () => {
  const source = readRepoFile('src/runtime/host-midi-capture.js');

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
    '../controllers/',
  ], 'src/runtime/host-midi-capture.js');
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\bboardConsume\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setNormalizer\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setInfoConsumer\b/);
  assert.doesNotMatch(source, /\bloadMappings\b/);
  assert.doesNotMatch(source, /\bsendMap\b/);
});

test('host-page.js delegates WebMIDI capture while host.html stays thin', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const host = readRepoFile('host.html');

  assertIncludesAll(hostPage, [
    './host-midi-capture.js',
    '../midi.js',
    './host-status-page.js',
    './host-controller-pipeline.js',
    './host-draft-map-sync.js',
    '../bootstrap-shared.js',
    './app-bridge.js',
    '../board.js',
    'startHostMidiCapture',
    'bootMIDIFromQuery',
  ], 'src/runtime/host-page.js');
  assert.match(hostPage, /deps\.startHostMidiCapture\(\{[\s\S]*runtimeApp,[\s\S]*hostStatus,[\s\S]*bootMIDIFromQuery:\s*deps\.bootMIDIFromQuery,[\s\S]*\}\)/);
  assertIncludesNone(hostPage, [
    "console.log('[MIDI] starting init via bootMIDIFromQuery')",
    'const handle = await bootMIDIFromQuery({',
    'runtimeApp.consumeNormalizedInfo(info)',
    'runtimeApp.setMIDIStatus(s)',
    "console.log('[MIDI] init OK')",
    "console.warn('[MIDI] init failed', e)",
    "runtimeApp.setMIDIStatus('host: off')",
  ], 'src/runtime/host-page.js');
  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
});

test('startHostMidiCapture calls bootMIDIFromQuery with onInfo and onStatus', async () => {
  let capturedOptions = null;
  const handle = { input: 'DDJ-FLX6' };

  await startHostMidiCapture({
    runtimeApp: {},
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return handle;
    },
    consoleRef: createConsoleRef(),
  });

  assert.equal(typeof capturedOptions.onInfo, 'function');
  assert.equal(typeof capturedOptions.onStatus, 'function');
});

test('startHostMidiCapture onInfo forwards to runtimeApp.consumeNormalizedInfo', async () => {
  let capturedOptions = null;
  const seen = [];
  const info = { type: 'cc' };

  await startHostMidiCapture({
    runtimeApp: {
      consumeNormalizedInfo: (entry) => seen.push(entry),
    },
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return { input: 'DDJ-FLX6' };
    },
    consoleRef: createConsoleRef(),
  });

  capturedOptions.onInfo(info);
  assert.deepEqual(seen, [info]);
});

test('startHostMidiCapture onInfo swallows consumeNormalizedInfo errors', async () => {
  let capturedOptions = null;

  await startHostMidiCapture({
    runtimeApp: {
      consumeNormalizedInfo: () => {
        throw new Error('consumer failed');
      },
    },
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return { input: 'DDJ-FLX6' };
    },
    consoleRef: createConsoleRef(),
  });

  assert.doesNotThrow(() => capturedOptions.onInfo({ type: 'cc' }));
});

test('startHostMidiCapture onStatus forwards to runtimeApp.setMIDIStatus', async () => {
  let capturedOptions = null;
  const statuses = [];

  await startHostMidiCapture({
    runtimeApp: {
      setMIDIStatus: (status) => statuses.push(status),
    },
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return { input: 'DDJ-FLX6' };
    },
    consoleRef: createConsoleRef(),
  });

  capturedOptions.onStatus('connected');
  assert.deepEqual(statuses, ['connected']);
});

test('startHostMidiCapture onStatus swallows setMIDIStatus errors', async () => {
  let capturedOptions = null;

  await startHostMidiCapture({
    runtimeApp: {
      setMIDIStatus: () => {
        throw new Error('status failed');
      },
    },
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return { input: 'DDJ-FLX6' };
    },
    consoleRef: createConsoleRef(),
  });

  assert.doesNotThrow(() => capturedOptions.onStatus('connected'));
});

test('startHostMidiCapture updates host controller details after successful boot', async () => {
  const details = [];
  const handle = {
    input: 'DDJ-FLX6',
    getDeviceInfo: () => ({ inputName: 'DDJ-FLX6 MIDI', profileId: 'ddj-flx6' }),
  };

  await startHostMidiCapture({
    runtimeApp: {},
    hostStatus: {
      noteControllerDetails: (entry) => details.push(entry),
    },
    bootMIDIFromQuery: async () => handle,
    consoleRef: createConsoleRef(),
  });

  assert.deepEqual(details, [{
    inputName: 'DDJ-FLX6 MIDI',
    profileId: 'ddj-flx6',
    deviceName: 'DDJ-FLX6 MIDI',
    ready: true,
  }]);
});

test('startHostMidiCapture uses handle.input when device info has no name', async () => {
  const details = [];
  const handle = {
    input: 'Fallback Input',
    getDeviceInfo: () => ({}),
  };

  await startHostMidiCapture({
    runtimeApp: {},
    hostStatus: {
      noteControllerDetails: (entry) => details.push(entry),
    },
    bootMIDIFromQuery: async () => handle,
    consoleRef: createConsoleRef(),
  });

  assert.deepEqual(details, [{
    deviceName: 'Fallback Input',
    ready: true,
  }]);
});

test('startHostMidiCapture warns, sets host off, and returns null after failed boot', async () => {
  const consoleRef = createConsoleRef();
  const statuses = [];
  const error = new Error('midi denied');

  const result = await startHostMidiCapture({
    runtimeApp: {
      setMIDIStatus: (status) => statuses.push(status),
    },
    bootMIDIFromQuery: async () => {
      throw error;
    },
    consoleRef,
  });

  assert.equal(result, null);
  assert.equal(consoleRef.calls.warn.length, 1);
  assert.match(String(consoleRef.calls.warn[0][0]), /MIDI.*init failed/);
  assert.equal(consoleRef.calls.warn[0][1], error);
  assert.deepEqual(statuses, ['host: off']);
});

test('startHostMidiCapture returns the MIDI handle after successful boot', async () => {
  const handle = { input: 'DDJ-FLX6' };

  const result = await startHostMidiCapture({
    runtimeApp: {},
    bootMIDIFromQuery: async () => handle,
    consoleRef: createConsoleRef(),
  });

  assert.equal(result, handle);
});

test('startHostMidiCapture does not crash without optional hostStatus', async () => {
  const handle = { input: 'DDJ-FLX6' };

  const result = await startHostMidiCapture({
    runtimeApp: {},
    bootMIDIFromQuery: async () => handle,
    consoleRef: createConsoleRef(),
  });

  assert.equal(result, handle);
});

test('startHostMidiCapture requires bootMIDIFromQuery and no-ops missing runtimeApp methods safely', async () => {
  await assert.rejects(
    () => startHostMidiCapture({ runtimeApp: {}, consoleRef: createConsoleRef() }),
    {
      name: 'TypeError',
      message: 'startHostMidiCapture requires bootMIDIFromQuery',
    },
  );

  let capturedOptions = null;
  const handle = { input: 'DDJ-FLX6' };
  const result = await startHostMidiCapture({
    bootMIDIFromQuery: async (options) => {
      capturedOptions = options;
      return handle;
    },
    consoleRef: createConsoleRef(),
  });

  assert.equal(result, handle);
  assert.doesNotThrow(() => capturedOptions.onInfo({ type: 'cc' }));
  assert.doesNotThrow(() => capturedOptions.onStatus('connected'));
});
