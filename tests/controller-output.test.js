import test from 'node:test';
import assert from 'node:assert/strict';

import { createFlx6RuntimeState, handleOutput as handleFlx6Output } from '../src/controllers/profiles/ddj-flx6.script.js';
import { buildFlx6OutputMessages } from '../src/controllers/profiles/ddj-flx6.outputs.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';

test('buildFlx6OutputMessages resolves main-layer transport LEDs from canonical requests', () => {
  const messages = buildFlx6OutputMessages([
    {
      canonicalTarget: 'deck.left.transport.play',
      value: true,
    },
    {
      canonicalTarget: 'deck.right.transport.cue',
      value: false,
      context: { deckLayer: 'main' },
    },
  ], {
    profileId: flx6Profile.id,
    timestamp: 50,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [
    {
      target: { kind: 'light', channel: 1, code: 11, key: 'noteon:1:11' },
      canonicalTarget: 'deck.left.transport.play',
      context: { deckLayer: 'main' },
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.left.transport.play.main.led',
      timestamp: 50,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 2, code: 12, key: 'noteon:2:12' },
      canonicalTarget: 'deck.right.transport.cue',
      context: { deckLayer: 'main' },
      value: 0,
      outputKind: 'light',
      bindingId: 'deck.right.transport.cue.main.led',
      timestamp: 50,
      profileId: flx6Profile.id,
    },
  ]);
});

test('buildFlx6OutputMessages can follow the controller state deck layer', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: {
      left: 'alternate',
      right: 'main',
    },
  });

  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.left.transport.cue',
    value: 96,
  }], {
    profileId: flx6Profile.id,
    timestamp: 60,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 3, code: 12, key: 'noteon:3:12' },
    canonicalTarget: 'deck.left.transport.cue',
    context: { deckLayer: 'alternate' },
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.left.transport.cue.alternate.led',
    timestamp: 60,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages clamps jog illumination to the FLX6 CSV output range', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: {
      left: 'alternate',
      right: 'main',
    },
  });

  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.left.jog.motion',
    value: 127,
  }], {
    profileId: flx6Profile.id,
    timestamp: 65,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 12, code: 2, key: 'cc:12:2' },
    canonicalTarget: 'deck.left.jog.motion',
    context: { deckLayer: 'alternate' },
    value: 0x48,
    outputKind: 'value',
    bindingId: 'deck.left.jog.illumination.alternate',
    timestamp: 65,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Merge FX illumination and keeps it binary', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.right.fx.quick',
    value: 12,
  }], {
    profileId: flx6Profile.id,
    timestamp: 66,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 6, code: 16, key: 'cc:6:16' },
    canonicalTarget: 'deck.right.fx.quick',
    context: {},
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.right.fx.quick.illumination',
    timestamp: 66,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves pad-mode LEDs from the active deck layer', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: {
      left: 'alternate',
      right: 'main',
    },
  });

  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.left.pad_mode.sampler',
    value: true,
  }], {
    profileId: flx6Profile.id,
    timestamp: 67,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 3, code: 34, key: 'noteon:3:34' },
    canonicalTarget: 'deck.left.pad_mode.sampler',
    context: { deckLayer: 'alternate' },
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.left.pad_mode.sampler.alternate.led',
    timestamp: 67,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves shifted pad-mode LEDs for the expanded FLX6 families', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: {
      left: 'main',
      right: 'alternate',
    },
  });

  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.right.pad_mode.key_shift',
    value: true,
  }], {
    profileId: flx6Profile.id,
    timestamp: 68,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 4, code: 111, key: 'noteon:4:111' },
    canonicalTarget: 'deck.right.pad_mode.key_shift',
    context: { deckLayer: 'alternate' },
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.right.pad_mode.key_shift.alternate.led',
    timestamp: 68,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves pad LEDs from the active FLX6 pad mode truth', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: {
      left: 'main',
      right: 'alternate',
    },
    padMode: {
      left: null,
      right: 'sample_scratch',
    },
  });

  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.right.pad.4',
    value: true,
  }], {
    profileId: flx6Profile.id,
    timestamp: 69,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 15, code: 115, key: 'noteon:15:115' },
    canonicalTarget: 'deck.right.pad.4',
    context: { deckLayer: 'alternate', mode: 'sample_scratch' },
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.right.pad.4.alternate.sample_scratch.led',
    timestamp: 69,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages keeps pad LEDs dark when the active pad mode is still unknown', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'deck.left.pad.1',
    value: true,
    context: { deckLayer: 'main' },
  }], {
    profileId: flx6Profile.id,
    timestamp: 70,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, []);
});

test('flx6 handleOutput turns canonical requests into real LED messages', () => {
  const state = createFlx6RuntimeState();

  const result = handleFlx6Output({
    requestedMessages: [{
      canonicalTarget: 'deck.right.transport.play',
      value: true,
      context: { deckLayer: 'alternate' },
    }],
  }, state, {
    profileId: flx6Profile.id,
    profile: flx6Profile,
    now: () => 70,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executed, true);
  assert.deepEqual(result.messages, [{
    target: { kind: 'light', channel: 4, code: 11, key: 'noteon:4:11' },
    canonicalTarget: 'deck.right.transport.play',
    context: { deckLayer: 'alternate' },
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.right.transport.play.alternate.led',
    timestamp: 70,
    profileId: flx6Profile.id,
  }]);
  assert.equal(state.temporary.lastOutput.generatedCount, 1);
});
