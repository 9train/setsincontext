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

test('buildFlx6OutputMessages resolves sync and master transport LEDs for the active deck layer', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: { left: 'main', right: 'alternate' },
  });

  const messages = buildFlx6OutputMessages([
    { canonicalTarget: 'deck.left.transport.sync', value: true },
    { canonicalTarget: 'deck.right.transport.master', value: true },
  ], {
    profileId: flx6Profile.id,
    timestamp: 80,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [
    {
      target: { kind: 'light', channel: 1, code: 88, key: 'noteon:1:88' },
      canonicalTarget: 'deck.left.transport.sync',
      context: { deckLayer: 'main' },
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.left.transport.sync.main.led',
      timestamp: 80,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 4, code: 92, key: 'noteon:4:92' },
      canonicalTarget: 'deck.right.transport.master',
      context: { deckLayer: 'alternate' },
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.right.transport.master.alternate.led',
      timestamp: 80,
      profileId: flx6Profile.id,
    },
  ]);
});

test('buildFlx6OutputMessages resolves loop button LEDs for the active deck layer', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: { left: 'alternate', right: 'main' },
  });

  const messages = buildFlx6OutputMessages([
    { canonicalTarget: 'deck.left.loop.in', value: true },
    { canonicalTarget: 'deck.right.loop.out', value: false },
    { canonicalTarget: 'deck.left.loop.reloop_exit', value: true },
  ], {
    profileId: flx6Profile.id,
    timestamp: 81,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [
    {
      target: { kind: 'light', channel: 3, code: 16, key: 'noteon:3:16' },
      canonicalTarget: 'deck.left.loop.in',
      context: { deckLayer: 'alternate' },
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.left.loop.in.alternate.led',
      timestamp: 81,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 2, code: 17, key: 'noteon:2:17' },
      canonicalTarget: 'deck.right.loop.out',
      context: { deckLayer: 'main' },
      value: 0,
      outputKind: 'light',
      bindingId: 'deck.right.loop.out.main.led',
      timestamp: 81,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 3, code: 77, key: 'noteon:3:77' },
      canonicalTarget: 'deck.left.loop.reloop_exit',
      context: { deckLayer: 'alternate' },
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.left.loop.reloop_exit.alternate.led',
      timestamp: 81,
      profileId: flx6Profile.id,
    },
  ]);
});

test('buildFlx6OutputMessages resolves deck layer button LEDs for left and right sides', () => {
  const messages = buildFlx6OutputMessages([
    { canonicalTarget: 'deck.left.transport.layer', value: true },
    { canonicalTarget: 'deck.right.transport.layer', value: false },
  ], {
    profileId: flx6Profile.id,
    timestamp: 90,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [
    {
      target: { kind: 'light', channel: 3, code: 114, key: 'noteon:3:114' },
      canonicalTarget: 'deck.left.transport.layer',
      context: {},
      value: 127,
      outputKind: 'light',
      bindingId: 'deck.left.transport.layer.led',
      timestamp: 90,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 4, code: 114, key: 'noteon:4:114' },
      canonicalTarget: 'deck.right.transport.layer',
      context: {},
      value: 0,
      outputKind: 'light',
      bindingId: 'deck.right.transport.layer.led',
      timestamp: 90,
      profileId: flx6Profile.id,
    },
  ]);
});

test('buildFlx6OutputMessages deck layer LED resolves regardless of active deck layer state', () => {
  const controllerState = createFlx6RuntimeState({
    deckLayer: { left: 'alternate', right: 'alternate' },
  });

  const messages = buildFlx6OutputMessages([
    { canonicalTarget: 'deck.left.transport.layer', value: true },
  ], {
    profileId: flx6Profile.id,
    timestamp: 91,
    controllerState,
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 3, code: 114, key: 'noteon:3:114' },
    canonicalTarget: 'deck.left.transport.layer',
    context: {},
    value: 127,
    outputKind: 'light',
    bindingId: 'deck.left.transport.layer.led',
    timestamp: 91,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves all four mixer channel cue LEDs', () => {
  const messages = buildFlx6OutputMessages([
    { canonicalTarget: 'mixer.channel.1.cue', value: true },
    { canonicalTarget: 'mixer.channel.2.cue', value: false },
    { canonicalTarget: 'mixer.channel.3.cue', value: true },
    { canonicalTarget: 'mixer.channel.4.cue', value: false },
  ], {
    profileId: flx6Profile.id,
    timestamp: 92,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [
    {
      target: { kind: 'light', channel: 1, code: 84, key: 'noteon:1:84' },
      canonicalTarget: 'mixer.channel.1.cue',
      context: {},
      value: 127,
      outputKind: 'light',
      bindingId: 'mixer.channel.1.cue.led',
      timestamp: 92,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 2, code: 84, key: 'noteon:2:84' },
      canonicalTarget: 'mixer.channel.2.cue',
      context: {},
      value: 0,
      outputKind: 'light',
      bindingId: 'mixer.channel.2.cue.led',
      timestamp: 92,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 3, code: 84, key: 'noteon:3:84' },
      canonicalTarget: 'mixer.channel.3.cue',
      context: {},
      value: 127,
      outputKind: 'light',
      bindingId: 'mixer.channel.3.cue.led',
      timestamp: 92,
      profileId: flx6Profile.id,
    },
    {
      target: { kind: 'light', channel: 4, code: 84, key: 'noteon:4:84' },
      canonicalTarget: 'mixer.channel.4.cue',
      context: {},
      value: 0,
      outputKind: 'light',
      bindingId: 'mixer.channel.4.cue.led',
      timestamp: 92,
      profileId: flx6Profile.id,
    },
  ]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 1 slot 1 on/off LED (FX1-1)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 1, slot: 1 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 100,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 5, code: 71, key: 'noteon:5:71' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 1, slot: 1 },
    value: 127,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit1.slot1.led',
    timestamp: 100,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 1 slot 2 on/off LED (FX1-2)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 1, slot: 2 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 101,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 5, code: 72, key: 'noteon:5:72' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 1, slot: 2 },
    value: 127,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit1.slot2.led',
    timestamp: 101,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 1 slot 3 on/off LED (FX1-3)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: false,
    context: { unit: 1, slot: 3 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 102,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 5, code: 73, key: 'noteon:5:73' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 1, slot: 3 },
    value: 0,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit1.slot3.led',
    timestamp: 102,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 2 slot 1 on/off LED (FX2-1)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 2, slot: 1 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 103,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 6, code: 71, key: 'noteon:6:71' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 2, slot: 1 },
    value: 127,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit2.slot1.led',
    timestamp: 103,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 2 slot 2 on/off LED (FX2-2)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 2, slot: 2 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 104,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 6, code: 72, key: 'noteon:6:72' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 2, slot: 2 },
    value: 127,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit2.slot2.led',
    timestamp: 104,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages resolves Beat FX unit 2 slot 3 on/off LED (FX2-3)', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: false,
    context: { unit: 2, slot: 3 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 105,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, [{
    target: { kind: 'light', channel: 6, code: 73, key: 'noteon:6:73' },
    canonicalTarget: 'beatfx.on_off',
    context: { unit: 2, slot: 3 },
    value: 0,
    outputKind: 'light',
    bindingId: 'beatfx.on_off.unit2.slot3.led',
    timestamp: 105,
    profileId: flx6Profile.id,
  }]);
});

test('buildFlx6OutputMessages does not resolve Beat FX on/off LED for wrong unit', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 99, slot: 1 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 106,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, []);
});

test('buildFlx6OutputMessages does not resolve Beat FX on/off LED for wrong slot', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 1, slot: 99 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 107,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, []);
});

test('buildFlx6OutputMessages does not silently pick first Beat FX candidate when context is missing', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
  }], {
    profileId: flx6Profile.id,
    timestamp: 108,
    controllerState: createFlx6RuntimeState(),
    bindings: flx6Profile.outputs.bindings,
  });

  assert.deepEqual(messages, []);
});

test('buildFlx6OutputMessages does not resolve Beat FX on/off LED when only unit is provided', () => {
  const messages = buildFlx6OutputMessages([{
    canonicalTarget: 'beatfx.on_off',
    value: true,
    context: { unit: 1 },
  }], {
    profileId: flx6Profile.id,
    timestamp: 109,
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
