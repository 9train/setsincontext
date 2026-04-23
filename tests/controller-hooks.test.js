import test from 'node:test';
import assert from 'node:assert/strict';

import { createControllerScriptRuntime } from '../src/controllers/core/hooks.js';
import { createWebMidiAdapter } from '../src/controllers/adapters/web-midi.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';
import { flx6RuntimeHooks } from '../src/controllers/profiles/ddj-flx6.script.js';

function createFakeMIDIAccess() {
  const sentBytes = [];
  const input = {
    id: 'in-1',
    name: 'Pioneer DDJ-FLX6',
    manufacturer: 'Pioneer DJ',
    onmidimessage: null,
  };
  const output = {
    id: 'out-1',
    name: 'Pioneer DDJ-FLX6',
    manufacturer: 'Pioneer DJ',
    send(bytes) {
      sentBytes.push(Array.from(bytes || []));
    },
  };

  return {
    input,
    output,
    sentBytes,
    access: {
      inputs: new Map([['in-1', input]]),
      outputs: new Map([['out-1', output]]),
      addEventListener() {},
      removeEventListener() {},
    },
  };
}

function createFeelConfig() {
  return {
    device: 'Pioneer DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    global: {
      jog: { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039, scale: 0.004 },
      enc: { step: 0.01, accel: 0.6 },
      softTakeoverWindow: 0.04,
    },
    controls: {
      xfader: { type: 'absolute', min: 0, max: 1, curve: 'linear', deadzone: 0, soft: true },
      jog: { type: 'jog', scaleOverride: 0.0045, shiftScale: 0.5 },
    },
  };
}

test('controller script runtime runs the shared FLX6 lifecycle surface', () => {
  let now = 100;
  const runtime = createControllerScriptRuntime({
    profile: flx6Profile,
    device: {
      id: 'dev-1',
      transport: 'midi',
      inputName: 'Pioneer DDJ-FLX6',
      outputName: 'Pioneer DDJ-FLX6',
      profileId: flx6Profile.id,
    },
    now: () => now++,
  });

  const initResult = runtime.init();
  assert.equal(initResult.ok, true);
  assert.equal(initResult.executed, true);
  assert.equal(runtime.getState().temporary.session.inputName, 'Pioneer DDJ-FLX6');

  const inputResult = runtime.handleInput(
    { eventType: 'raw_input', key: 'noteon:1:54' },
    [{
      canonicalTarget: 'deck.left.jog.touch',
      mappingId: 'deck.left.jog.touch.press',
      interaction: 'noteon',
      type: 'noteon',
      value: 127,
      timestamp: now++,
    }],
  );

  assert.equal(inputResult.ok, true);
  assert.equal(inputResult.handled, 1);
  assert.equal(runtime.getState().jogTouch.left, true);
  assert.equal(inputResult.events[0].semantic.family, 'jog');
  assert.equal(inputResult.events[0].semantic.meaning, 'jog_touch');
  assert.equal(inputResult.events[0].render.targetId, 'jog_L');
  assert.equal(inputResult.events[0].debug.truthStatus, 'official');

  const outputResult = runtime.handleOutput({
    requestedMessages: [{ target: { key: 'cc:7:31' }, value: 64 }],
  });
  assert.equal(outputResult.ok, true);
  assert.deepEqual(outputResult.messages, []);
  assert.equal(runtime.getState().temporary.lastOutput.requestedCount, 1);

  const shutdownResult = runtime.shutdown();
  assert.equal(shutdownResult.ok, true);
  assert.equal(shutdownResult.executed, true);
  assert.ok(runtime.getState().temporary.session.shutdownAt != null);
});

test('flx6 hook metadata points at the shared app hook surface', () => {
  assert.equal(flx6RuntimeHooks.init.exportName, 'init');
  assert.equal(flx6RuntimeHooks.input.exportName, 'handleInput');
  assert.equal(flx6RuntimeHooks.output.exportName, 'handleOutput');
  assert.equal(flx6RuntimeHooks.shutdown.exportName, 'shutdown');
});

test('web midi adapter invokes FLX6 hooks and exposes controller state snapshots', async () => {
  let now = 200;
  const midi = createFakeMIDIAccess();
  const feelChanges = [];
  const adapter = createWebMidiAdapter({
    preferredInput: 'Pioneer DDJ-FLX6',
    preferredOutput: 'Pioneer DDJ-FLX6',
    now: () => now++,
    requestMIDIAccess: async () => midi.access,
    loadFeelConfig: async () => createFeelConfig(),
  });

  const envelopes = [];
  const unsubscribe = adapter.onInput((envelope) => {
    envelopes.push(envelope);
  });
  const unsubscribeFeel = adapter.onFeelStateChange((state) => {
    feelChanges.push(state);
  });

  await adapter.connect();

  const stateAfterConnect = adapter.getControllerState();
  assert.equal(stateAfterConnect.temporary.session.inputName, 'Pioneer DDJ-FLX6');
  assert.equal(adapter.getFeelState().enabled, true);
  assert.ok(feelChanges.some((state) => state.enabled === true));

  midi.input.onmidimessage({ data: [0x91, 54, 127] });
  midi.input.onmidimessage({ data: [0xB6, 31, 64] });
  midi.input.onmidimessage({ data: [0xB0, 33, 65] });
  midi.input.onmidimessage({ data: [0xB0, 34, 65] });
  midi.input.onmidimessage({ data: [0x90, 23, 127] });

  assert.equal(envelopes.length, 5);
  assert.equal(envelopes[0].normalized[0].canonicalTarget, 'deck.right.jog.touch');
  assert.equal(envelopes[0].controllerState.jogTouch.right, true);
  assert.equal(envelopes[0].controllerState.jogLane.right, 'touch');
  assert.equal(envelopes[1].normalized[0].canonicalTarget, 'mixer.crossfader');
  assert.equal(envelopes[1].normalized[0].value, 64);
  assert.equal(envelopes[1].normalized[0].semanticValue, 64 / 127);
  assert.equal(envelopes[1].normalized[0].feel.instanceId, 'mixer.crossfader');
  assert.equal(envelopes[2].normalized[0].canonicalTarget, 'deck.left.jog.motion');
  assert.equal(envelopes[2].controllerState.jogLane.left, 'wheel_side');
  assert.equal(typeof envelopes[2].normalized[0].semanticValue, 'number');
  assert.equal(envelopes[2].normalized[0].feel.mode, 'jog');
  assert.equal(envelopes[2].normalized[0].feel.delta, 1);
  assert.equal(envelopes[3].normalized[0].mappingId, 'deck.left.jog.motion.secondary');
  assert.equal(envelopes[3].controllerState.jogLane.left, 'platter_vinyl_on');
  assert.equal(envelopes[3].controllerState.jogVinylMode.left, true);
  assert.equal(envelopes[4].normalized[0].canonicalTarget, 'deck.left.jog.vinyl_mode');
  assert.equal(envelopes[4].normalized[0].semantic.meaning, 'vinyl_mode_toggle');
  assert.equal(envelopes[4].normalized[0].render.targetId, 'jogcut_L');
  assert.equal(envelopes[4].normalized[0].debug.stateAfter.truth.jog.left.vinylMode.status, 'inferred');
  assert.equal(envelopes[4].normalized[0].debug.stateAfter.truth.jog.left.vinylModeButton.status, 'official');
  assert.equal(envelopes[4].normalized[0].debug.stateAfter.truth.jog.left.vinylModeButton.value, true);
  assert.equal(envelopes[4].normalized[0].debug.truthFocus.vinylMode.mode.after.status, 'inferred');
  assert.equal(envelopes[4].normalized[0].debug.truthFocus.vinylMode.button.after.status, 'official');
  assert.match(envelopes[4].normalized[0].debug.truthSummary, /vinyl:mode=inferred\/button=official/);
  assert.equal(envelopes[4].controllerState.jogCutter.left, null);
  assert.equal(envelopes[4].controllerState.jogVinylMode.left, false);

  const sent = adapter.send([{
    canonicalTarget: 'deck.left.transport.play',
    value: true,
  }]);
  assert.equal(sent, true);
  assert.deepEqual(midi.sentBytes[0], [144, 11, 127]);

  const sentJogIllumination = adapter.send([{
    canonicalTarget: 'deck.left.jog.motion',
    value: 127,
    context: { deckLayer: 'alternate' },
  }]);
  assert.equal(sentJogIllumination, true);
  assert.deepEqual(midi.sentBytes[1], [187, 2, 72]);

  const stateAfterSend = adapter.getControllerState();
  assert.equal(stateAfterSend.temporary.lastDebugEvent.truthFocus.vinylMode.mode.after.status, 'inferred');
  assert.equal(stateAfterSend.temporary.lastDebugEvent.truthFocus.vinylMode.button.after.status, 'official');
  assert.match(stateAfterSend.temporary.lastDebugEvent.truthSummary, /owner:unknown/);
  assert.equal(stateAfterSend.temporary.lastOutput.requestedCount, 1);
  assert.equal(stateAfterSend.temporary.lastOutput.generatedCount, 1);

  unsubscribe();
  unsubscribeFeel();
  adapter.disconnect('stopped');
});
