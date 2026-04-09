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
  const adapter = createWebMidiAdapter({
    preferredInput: 'Pioneer DDJ-FLX6',
    preferredOutput: 'Pioneer DDJ-FLX6',
    now: () => now++,
    requestMIDIAccess: async () => midi.access,
  });

  const envelopes = [];
  const unsubscribe = adapter.onInput((envelope) => {
    envelopes.push(envelope);
  });

  await adapter.connect();

  const stateAfterConnect = adapter.getControllerState();
  assert.equal(stateAfterConnect.temporary.session.inputName, 'Pioneer DDJ-FLX6');

  midi.input.onmidimessage({ data: [0x91, 54, 127] });

  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].normalized[0].canonicalTarget, 'deck.right.jog.touch');
  assert.equal(envelopes[0].controllerState.jogTouch.right, true);

  const sent = adapter.send([{ target: { key: 'cc:7:31' }, value: 64 }]);
  assert.equal(sent, true);
  assert.deepEqual(midi.sentBytes[0], [182, 31, 64]);

  const stateAfterSend = adapter.getControllerState();
  assert.equal(stateAfterSend.temporary.lastOutput.requestedCount, 1);

  unsubscribe();
  adapter.disconnect('stopped');
});
