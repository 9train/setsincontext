import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockBrowser } from './browser-test-helpers.js';
import { createControllerFeelRuntime, decodeFeelDelta } from '../src/controllers/core/feel.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

function createMIDIAccess(inputs) {
  const map = new Map(inputs.map((input, idx) => [String(idx), input]));
  return {
    inputs: map,
    addEventListener() {},
    removeEventListener() {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withConsoleWarnCapture(run) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args.map((x) => String(x)).join(' '));
  };
  return Promise.resolve()
    .then(() => run(warnings))
    .finally(() => {
      console.warn = originalWarn;
    });
}

test('buildFeelRuntime tolerates partial FEEL config objects', async () => {
  const { buildFeelRuntime } = await importFresh('../src/midi-feel.js');
  const runtime = buildFeelRuntime({ device: 'Pioneer DDJ-FLX6' });

  assert.equal(typeof runtime.processAbsolute, 'function');
  assert.equal(typeof runtime.processRelative, 'function');
  assert.equal(typeof runtime.processJog, 'function');
});

test('decodeFeelDelta matches the FLX6 relative 7-bit jog scheme', () => {
  assert.equal(decodeFeelDelta(65, 'relative7'), 1);
  assert.equal(decodeFeelDelta(66, 'relative7'), 2);
  assert.equal(decodeFeelDelta(63, 'relative7'), -1);
  assert.equal(decodeFeelDelta(1, 'relative7'), -63);
  assert.equal(decodeFeelDelta(0, 'relative7'), 0);
  assert.equal(decodeFeelDelta(64, 'relative7'), 0);
});

test('bootMIDIFromQuery loads FEEL config, builds the runtime, and exposes window.__MIDI_FEEL__', async () => {
  const feelConfig = {
    device: 'Pioneer DDJ-FLX6',
    global: {
      jog: { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039, scale: 0.004 },
      enc: { step: 0.01, accel: 0.6 },
      softTakeoverWindow: 0.04,
    },
    controls: {
      xfader: { type: 'absolute', min: 0, max: 1, curve: 'linear', deadzone: 0, soft: true },
      jog: { type: 'jog', scaleOverride: 0.0045 },
    },
  };
  const fetchCalls = [];
  const statuses = [];
  const input = { name: 'Pioneer DDJ-FLX6', onmidimessage: null };
  const env = installMockBrowser({
    locationSearch: '?midi=Pioneer%20DDJ-FLX6',
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => clone(feelConfig) };
    },
    navigatorImpl: {
      requestMIDIAccess: async () => createMIDIAccess([input]),
    },
  });
  env.window.setMIDIStatus = (status) => {
    statuses.push(status);
  };

  try {
    const { bootMIDIFromQuery } = await importFresh('../src/midi.js');
    const handle = await bootMIDIFromQuery();

    assert.deepEqual(fetchCalls, ['/maps/flx6-feel.json']);
    assert.equal(handle.input, 'Pioneer DDJ-FLX6');
    assert.deepEqual(statuses, ['requesting', 'ready', 'listening:Pioneer DDJ-FLX6']);

    assert.ok(env.window.__MIDI_FEEL__);
    assert.equal(env.window.__MIDI_FEEL__.FEEL_CFG.device, 'Pioneer DDJ-FLX6');
    assert.equal(env.window.__MIDI_FEEL__.enabled, true);
    assert.equal(typeof env.window.__MIDI_FEEL__.FEEL.processAbsolute, 'function');
    assert.equal(typeof env.window.__MIDI_FEEL__.FEEL.processRelative, 'function');
    assert.equal(typeof env.window.__MIDI_FEEL__.FEEL.processJog, 'function');
  } finally {
    env.restore();
  }
});

test('bootMIDIFromQuery routes live normalized input through the controller-layer FEEL path', async () => {
  const events = [];
  const input = { name: 'Pioneer DDJ-FLX6', onmidimessage: null };
  const env = installMockBrowser({
    locationSearch: '?midi=Pioneer%20DDJ-FLX6',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        device: 'Pioneer DDJ-FLX6',
        global: {
          jog: { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039, scale: 0.004 },
          enc: { step: 0.01, accel: 0.6 },
          softTakeoverWindow: 0.04,
        },
        controls: {
          xfader: { type: 'absolute', min: 0, max: 1, curve: 'linear', deadzone: 0, soft: true },
          jog: { type: 'jog', scaleOverride: 0.0045 },
        },
      }),
    }),
    navigatorImpl: {
      requestMIDIAccess: async () => createMIDIAccess([input]),
    },
  });

  try {
    const { bootMIDIFromQuery } = await importFresh('../src/midi.js');
    await bootMIDIFromQuery({
      onInfo(info) {
        events.push(info);
      },
    });

    input.onmidimessage({ data: [0xB6, 31, 64] });
    input.onmidimessage({ data: [0xB0, 33, 65] });

    assert.equal(events.length, 2);
    assert.equal(events[0].canonicalTarget, 'mixer.crossfader');
    assert.equal(events[0].value, 64);
    assert.equal(events[0].compatValue, 64);
    assert.equal(events[0].semanticValue, 64 / 127);
    assert.equal(events[0].feel.instanceId, 'mixer.crossfader');

    assert.equal(events[1].canonicalTarget, 'deck.left.jog.motion');
    assert.equal(events[1].value, 65);
    assert.equal(events[1].compatValue, 65);
    assert.equal(events[1].feel.mode, 'jog');
    assert.equal(events[1].feel.delta, 1);
    assert.equal(typeof events[1].semanticValue, 'number');
  } finally {
    env.restore();
  }
});

test('bootMIDIFromQuery preserves explicit FLX6 jog motion lanes alongside touch events', async () => {
  const events = [];
  const input = { name: 'Pioneer DDJ-FLX6', onmidimessage: null };
  const env = installMockBrowser({
    locationSearch: '?midi=Pioneer%20DDJ-FLX6',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        device: 'Pioneer DDJ-FLX6',
        global: {
          jog: { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039, scale: 0.004 },
          enc: { step: 0.01, accel: 0.6 },
          softTakeoverWindow: 0.04,
        },
        controls: {
          xfader: { type: 'absolute', min: 0, max: 1, curve: 'linear', deadzone: 0, soft: true },
          jog: { type: 'jog', scaleOverride: 0.0045 },
        },
      }),
    }),
    navigatorImpl: {
      requestMIDIAccess: async () => createMIDIAccess([input]),
    },
  });

  try {
    const { bootMIDIFromQuery } = await importFresh('../src/midi.js');
    await bootMIDIFromQuery({
      onInfo(info) {
        events.push(info);
      },
    });

    input.onmidimessage({ data: [0x90, 54, 127] });
    input.onmidimessage({ data: [0xB0, 33, 65] });
    input.onmidimessage({ data: [0xB0, 34, 65] });

    assert.equal(events.length, 3);
    assert.equal(events[0].canonicalTarget, 'deck.left.jog.touch');
    assert.equal(events[0].raw.key, 'noteon:1:54');
    assert.equal(events[0].controllerState.jogLane.left, 'touch');
    assert.equal(events[1].canonicalTarget, 'deck.left.jog.motion');
    assert.equal(events[1].mappingId, 'deck.left.jog.motion.primary');
    assert.equal(events[1].raw.key, 'cc:1:33');
    assert.equal(events[1].controllerState.jogLane.left, 'wheel_side');
    assert.equal(events[2].canonicalTarget, 'deck.left.jog.motion');
    assert.equal(events[2].mappingId, 'deck.left.jog.motion.secondary');
    assert.equal(events[2].raw.key, 'cc:1:34');
    assert.equal(events[2].controllerState.jogLane.left, 'platter_vinyl_on');
    assert.equal(events[2].controllerState.jogVinylMode.left, true);
  } finally {
    env.restore();
  }
});

test('bootMIDIFromQuery disables FEEL cleanly when the FEEL config is missing', async () => {
  const fetchCalls = [];
  const statuses = [];
  const input = { name: 'Pioneer DDJ-FLX6', onmidimessage: null };
  const env = installMockBrowser({
    locationSearch: '?midi=Pioneer%20DDJ-FLX6',
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return { ok: false, status: 404, json: async () => ({}) };
    },
    navigatorImpl: {
      requestMIDIAccess: async () => createMIDIAccess([input]),
    },
  });
  env.window.setMIDIStatus = (status) => {
    statuses.push(status);
  };

  try {
    await withConsoleWarnCapture(async (warnings) => {
      const { bootMIDIFromQuery } = await importFresh('../src/midi.js');
      const handle = await bootMIDIFromQuery();

      assert.deepEqual(fetchCalls, ['/maps/flx6-feel.json']);
      assert.equal(handle.input, 'Pioneer DDJ-FLX6');
      assert.deepEqual(statuses, ['requesting', 'ready', 'listening:Pioneer DDJ-FLX6']);
      assert.equal(env.window.__MIDI_FEEL__.FEEL, null);
      assert.equal(env.window.__MIDI_FEEL__.enabled, false);
      assert.equal(env.window.__MIDI_FEEL__.reason, 'config-load-failed');
      assert.equal(env.window.__MIDI_FEEL__.FEEL_CFG.deviceName, 'Pioneer DDJ-FLX6');
      assert.ok(warnings.some((w) => w.includes('FEEL disabled; config load failed')));
    });
  } finally {
    env.restore();
  }
});

test('bootMIDIFromQuery still boots cleanly when FEEL config objects behave badly at runtime boundaries', async () => {
  const statuses = [];
  const input = { name: 'Pioneer DDJ-FLX6', onmidimessage: null };
  const lazyFeelConfig = {
    device: 'Pioneer DDJ-FLX6',
    global: {
      jog: { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039 },
      softTakeoverWindow: 0.04,
    },
    controls: {
      xfader: {
        type: 'absolute',
        min: 0,
        max: 1,
        get soft() {
          throw new Error('broken soft getter');
        },
      },
    },
  };
  const env = installMockBrowser({
    locationSearch: '?midi=Pioneer%20DDJ-FLX6',
    fetchImpl: async () => ({
      ok: true,
      json: async () => brokenFeelConfig,
    }),
    navigatorImpl: {
      requestMIDIAccess: async () => createMIDIAccess([input]),
    },
  });
  env.window.setMIDIStatus = (status) => {
    statuses.push(status);
  };

  try {
    await withConsoleWarnCapture(async (warnings) => {
      const { bootMIDIFromQuery } = await importFresh('../src/midi.js');
      const handle = await bootMIDIFromQuery();

      assert.equal(handle.input, 'Pioneer DDJ-FLX6');
      assert.deepEqual(statuses, ['requesting', 'ready', 'listening:Pioneer DDJ-FLX6']);
      assert.equal(env.window.__MIDI_FEEL__.enabled, false);
      assert.ok(typeof env.window.__MIDI_FEEL__.reason === 'string' && env.window.__MIDI_FEEL__.reason.length > 0);
      assert.ok(warnings.length >= 1);
    });
  } finally {
    env.restore();
  }
});

test('wizard FEEL editor gate is off by default and only enables for an explicit boolean flag', async () => {
  const env = installMockBrowser();

  try {
    const {
      FEEL_EDITOR_FLAG,
      isExperimentalFeelEditorEnabled,
    } = await importFresh('../src/wizard.js');

    assert.equal(FEEL_EDITOR_FLAG, '__FLX_ENABLE_EXPERIMENTAL_FEEL_EDITOR__');
    assert.equal(isExperimentalFeelEditorEnabled(), false);

    env.window[FEEL_EDITOR_FLAG] = 'true';
    assert.equal(isExperimentalFeelEditorEnabled(), false);

    env.window[FEEL_EDITOR_FLAG] = true;
    assert.equal(isExperimentalFeelEditorEnabled(), true);
  } finally {
    env.restore();
  }
});

test('controller-layer FEEL dispatcher resets registered jog instances on deck-layer transitions', async () => {
  const actions = [];
  const runtime = createControllerFeelRuntime({
    loadFeelConfig: async () => ({
      device: 'Pioneer DDJ-FLX6',
      deviceName: 'Pioneer DDJ-FLX6',
      global: {},
      controls: {
        jog: { type: 'jog', scaleOverride: 0.0045 },
      },
    }),
    buildFeelRuntime: () => ({
      resetJog(instanceId) {
        actions.push(['resetJog', instanceId]);
      },
    }),
  });

  await runtime.syncProfile(flx6Profile, 'Pioneer DDJ-FLX6');

  const dispatched = runtime.dispatchControllerState({
    previousState: {
      deckLayer: { left: 'main', right: 'main' },
      shift: { left: false, right: false },
    },
    nextState: {
      deckLayer: { left: 'alternate', right: 'main' },
      shift: { left: false, right: false },
    },
  });

  assert.deepEqual(actions, [['resetJog', 'deck.left.jog.motion']]);
  assert.deepEqual(dispatched, [{
    type: 'reset-jog-motion',
    reason: 'deck-layer-changed',
    side: 'left',
    instanceId: 'deck.left.jog.motion',
  }]);
});
