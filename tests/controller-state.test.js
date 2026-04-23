import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyControllerStateEvent,
  createControllerState,
  getEventJogLane,
  rememberPairedValue,
  setBeatFxState,
  setTemporaryState,
} from '../src/controllers/core/state.js';
import {
  applyFlx6InputState,
  createFlx6RuntimeState,
  flx6RuntimeHooks,
} from '../src/controllers/profiles/ddj-flx6.script.js';

test('createControllerState keeps compatibility buckets while exposing explicit truth descriptors', () => {
  const state = createControllerState({
    profileId: 'demo-profile',
    defaultDeckLayer: 'main',
    defaultPadMode: 'hotcue',
  });

  assert.equal(state.profileId, 'demo-profile');
  assert.deepEqual(state.shift, { global: false, left: false, right: false });
  assert.deepEqual(state.deckLayer, { left: 'main', right: 'main' });
  assert.deepEqual(state.padMode, { left: 'hotcue', right: 'hotcue' });
  assert.deepEqual(state.jogLane, { left: null, right: null });
  assert.deepEqual(state.jogTouch, { left: false, right: false });
  assert.deepEqual(state.jogCutter, { left: null, right: null });
  assert.deepEqual(state.jogVinylMode, { left: null, right: null });
  assert.equal(state.channel4Input, null);
  assert.equal(state.truth.deckOwnership.left.status, 'unknown');
  assert.equal(state.truth.deckOwnership.right.status, 'unknown');
  assert.equal(state.truth.padMode.left.status, 'unknown');
  assert.equal(state.truth.padMode.left.value, null);
  assert.equal(state.truth.channel4Input.status, 'unknown');
  assert.equal(state.beatFx.unit1.selectedSlot, null);
  assert.equal(state.beatFx.unit1.levelDepth, null);
  assert.equal(state.truth.beatFx.unit1.selectedSlot.status, 'unknown');
  assert.equal(state.truth.beatFx.unit1.levelDepth.status, 'unknown');
});

test('createFlx6RuntimeState keeps FLX6 pad startup unknown until hardware truth arrives', () => {
  const state = createFlx6RuntimeState();

  assert.deepEqual(state.padMode, { left: null, right: null });
  assert.equal(state.truth.padMode.left.status, 'unknown');
  assert.equal(state.truth.padMode.left.value, null);
  assert.equal(state.truth.padMode.right.status, 'unknown');
  assert.equal(state.truth.padMode.right.value, null);
});

test('getEventJogLane reuses the official FLX6 jog codes before normalization finishes', () => {
  assert.equal(getEventJogLane({ type: 'noteon', d1: 54, value: 127 }), 'touch');
  assert.equal(getEventJogLane({ type: 'cc', controller: 33, value: 65 }), 'wheel_side');
  assert.equal(getEventJogLane({ type: 'cc', controller: 34, value: 65 }), 'platter_vinyl_on');
  assert.equal(getEventJogLane({ type: 'cc', controller: 35, value: 65 }), 'platter_vinyl_off');
});

test('applyControllerStateEvent tracks deck ownership, jog semantics, selector truth, and inferred vs official state', () => {
  const state = createControllerState();

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.transport.shift',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 10,
  });
  assert.equal(state.shift.left, true);
  assert.equal(state.shift.global, true);

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.transport.shift',
    interaction: 'noteoff',
    type: 'noteoff',
    value: 0,
    timestamp: 11,
  });
  assert.equal(state.shift.left, false);
  assert.equal(state.shift.global, false);

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.transport.play',
    context: { deckLayer: 'alternate' },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 12,
  });
  assert.equal(state.deckLayer.right, 'alternate');
  assert.equal(state.truth.deckOwnership.right.status, 'unknown');
  assert.equal(state.truth.deckOwnership.right.value.ownerDeck, null);

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.pad_mode.sampler',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 13,
  });
  assert.equal(state.padMode.left, 'sampler');
  assert.equal(state.truth.padMode.left.status, 'official');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.jog.touch',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 14,
  });
  assert.equal(state.jogTouch.right, true);
  assert.equal(state.jogLane.right, 'touch');
  assert.equal(state.truth.jog.right.touchVariant.value, 'touch');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.jog.touch',
    mappingId: 'deck.right.jog.touch.shifted.press',
    context: { deckLayer: 'main', shifted: true },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 15,
  });
  assert.equal(state.jogLane.right, 'touch_shifted');
  assert.equal(state.truth.jog.right.touchVariant.value, 'touch_shifted');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.jog.cutter',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 16,
  });
  assert.equal(state.jogCutter.left, null);
  assert.equal(state.truth.jog.left.jogCutterButton.value, true);
  assert.equal(state.truth.jog.left.jogCutterEnabled.status, 'unknown');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.jog.motion',
    interaction: 'cc',
    type: 'cc',
    controller: 34,
    value: 65,
    timestamp: 17,
  });
  assert.equal(state.jogLane.left, 'platter_vinyl_on');
  assert.equal(state.jogVinylMode.left, true);
  assert.equal(state.truth.jog.left.vinylMode.status, 'official');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.jog.vinyl_mode',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 18,
  });
  assert.equal(state.jogVinylMode.left, false);
  assert.equal(state.truth.jog.left.vinylMode.status, 'inferred');
  assert.equal(state.truth.jog.left.vinylModeButton.status, 'official');
  assert.equal(state.truth.jog.left.vinylModeButton.value, true);

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.transport.layer.status.alternate',
    mappingId: 'deck.right.transport.layer.status.alternate.on',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    context: { deckLayer: 'alternate', ownerDeck: 4 },
    timestamp: 19,
  });
  assert.equal(state.truth.deckControl[4].value, true);
  assert.equal(state.truth.deckControl[2].value, false);
  assert.equal(state.truth.deckOwnership.right.value.ownerDeck, 4);

  applyControllerStateEvent(state, {
    canonicalTarget: 'mixer.channel.4.input_select',
    mappingId: 'mixer.channel.4.input_select.sampler',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 20,
  });
  assert.equal(state.channel4Input, 'sampler');
  assert.equal(state.truth.channel4Input.status, 'official');
  assert.equal(state.truth.channel4Input.value, 'sampler');
});

test('applyControllerStateEvent gives Beat FX first-class slot, channel, level/depth, and on/off truth ownership', () => {
  const state = createControllerState();

  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.select',
    mappingId: 'beatfx.select.unit1.slot2.press',
    context: { unit: 1, slot: 2 },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 21,
  });
  assert.equal(state.beatFx.unit1.selectedSlot, 2);
  assert.equal(state.truth.beatFx.unit1.selectedSlot.status, 'official');

  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.channel_select',
    mappingId: 'beatfx.channel_select.unit1.ch4.press',
    context: { unit: 1, selectedChannel: 'ch4' },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 22,
  });
  assert.equal(state.beatFx.unit1.selectedChannel, 'ch4');
  assert.equal(state.truth.beatFx.unit1.selectedChannel.status, 'official');

  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.level_depth',
    mappingId: 'beatfx.level_depth.unit1.slot2.primary',
    context: { unit: 1, slot: 2 },
    interaction: 'cc',
    type: 'cc',
    controller: 4,
    value: 10,
    timestamp: 23,
  });
  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.level_depth',
    mappingId: 'beatfx.level_depth.unit1.slot2.secondary',
    context: { unit: 1, slot: 2 },
    interaction: 'cc',
    type: 'cc',
    controller: 36,
    value: 64,
    timestamp: 24,
  });
  assert.equal(state.beatFx.unit1.levelDepth, 10.5);
  assert.equal(state.truth.beatFx.unit1.levelDepth.status, 'official');

  setBeatFxState(state, {
    unit: 1,
    selectedSlot: 2,
    enabled: false,
    status: 'official',
    timestamp: 25,
  });
  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.on_off',
    mappingId: 'beatfx.on_off.unit1.slot2.press',
    context: { unit: 1, slot: 2 },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 26,
  });
  assert.equal(state.beatFx.unit1.enabled, true);
  assert.equal(state.truth.beatFx.unit1.enabled.status, 'inferred');

  applyControllerStateEvent(state, {
    canonicalTarget: 'beatfx.select',
    mappingId: 'beatfx.select.unit1.slot3.press',
    context: { unit: 1, slot: 3 },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 27,
  });
  assert.equal(state.beatFx.unit1.selectedSlot, 3);
  assert.equal(state.beatFx.unit1.enabled, null);
  assert.equal(state.truth.beatFx.unit1.enabled.status, 'unknown');
});

test('applyControllerStateEvent accepts expanded FLX6 pad families as official pad-mode truth', () => {
  const state = createControllerState();

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.pad_mode.key_shift',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 40,
  });
  assert.equal(state.padMode.right, 'key_shift');
  assert.equal(state.truth.padMode.right.status, 'official');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.pad.1',
    context: { mode: 'sample_scratch' },
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 41,
  });
  assert.equal(state.padMode.left, 'sample_scratch');
  assert.equal(state.truth.padMode.left.status, 'official');
  assert.equal(state.truth.padMode.left.value, 'sample_scratch');
});

test('rememberPairedValue stores coarse and fine lanes in one shared slot', () => {
  const state = createControllerState();

  const fineOnly = rememberPairedValue(state, {
    slotKey: 'deck.left.tempo.fader:main',
    fine: 96,
    timestamp: 20,
  });
  assert.equal(fineOnly.value, null);

  const coarseThenFine = rememberPairedValue(state, {
    slotKey: 'deck.left.tempo.fader:main',
    coarse: 10,
    timestamp: 21,
  });
  assert.equal(coarseThenFine.value, 10.75);

  setTemporaryState(state, 'lastInput', { canonicalTarget: 'deck.left.tempo.fader' }, 22);
  assert.deepEqual(state.temporary.lastInput, { canonicalTarget: 'deck.left.tempo.fader' });
});

test('applyFlx6InputState updates runtime state and keeps debug-friendly compatibility payloads', () => {
  const state = createFlx6RuntimeState();

  applyFlx6InputState(state, {
    canonicalTarget: 'deck.left.transport.shift',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 30,
  });
  assert.equal(state.shift.left, true);
  assert.equal(state.shift.global, true);

  applyFlx6InputState(state, {
    canonicalTarget: 'deck.right.pad_mode.fx',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 31,
  });
  assert.equal(state.padMode.right, 'fx');
  assert.equal(state.truth.padMode.right.status, 'official');

  applyFlx6InputState(state, {
    canonicalTarget: 'deck.right.jog.touch',
    mappingId: 'deck.right.jog.touch.press',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 32,
  });
  assert.equal(state.jogTouch.right, true);
  assert.equal(state.jogLane.right, 'touch');

  applyFlx6InputState(state, {
    canonicalTarget: 'deck.left.tempo.fader',
    mappingId: 'deck.left.tempo.fader.main.primary',
    context: { deckLayer: 'main' },
    interaction: 'cc',
    type: 'cc',
    controller: 0,
    value: 10,
    timestamp: 33,
  });
  applyFlx6InputState(state, {
    canonicalTarget: 'deck.left.tempo.fader',
    mappingId: 'deck.left.tempo.fader.main.secondary',
    context: { deckLayer: 'main' },
    interaction: 'cc',
    type: 'cc',
    controller: 32,
    value: 64,
    timestamp: 34,
  });

  assert.equal(state.deckLayer.left, 'main');
  assert.equal(state.pairedValues['deck.left.tempo.fader:main'].value, 10.5);
  assert.equal(state.temporary.lastInput.canonicalTarget, 'deck.left.tempo.fader');
  assert.equal(state.temporary.lastInput.mappingId, 'deck.left.tempo.fader.main.secondary');
  assert.equal(state.temporary.lastInput.side, 'left');
  assert.equal(state.temporary.lastInput.deckLayer, 'main');
  assert.equal(state.temporary.lastInput.ownerDeck, null);
  assert.equal(state.temporary.lastInput.semanticMeaning, null);
  assert.equal(state.temporary.lastInput.timestamp, 34);
  assert.deepEqual(state.temporary.lastPairedValue, {
    slotKey: 'deck.left.tempo.fader:main',
    value: 10.5,
    coarse: 10,
    fine: 64,
    deckLayer: 'main',
    side: 'left',
    timestamp: 34,
  });
});

test('flx6 profile input hook now points at shared state updates', () => {
  assert.equal(flx6RuntimeHooks.input.exportName, 'handleInput');
});
