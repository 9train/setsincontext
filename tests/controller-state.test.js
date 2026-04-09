import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyControllerStateEvent,
  createControllerState,
  rememberPairedValue,
  setTemporaryState,
} from '../src/controllers/core/state.js';
import {
  applyFlx6InputState,
  createFlx6RuntimeState,
  flx6RuntimeHooks,
} from '../src/controllers/profiles/ddj-flx6.script.js';

test('createControllerState builds simple per-controller state buckets', () => {
  const state = createControllerState({
    profileId: 'demo-profile',
    defaultDeckLayer: 'main',
    defaultPadMode: 'hotcue',
  });

  assert.deepEqual(state, {
    profileId: 'demo-profile',
    updatedAt: null,
    shift: { global: false, left: false, right: false },
    deckLayer: { left: 'main', right: 'main' },
    padMode: { left: 'hotcue', right: 'hotcue' },
    jogTouch: { left: false, right: false },
    pairedValues: {},
    temporary: {},
  });
});

test('applyControllerStateEvent tracks shift, deck layer, pad mode, and jog touch', () => {
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

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.left.pad_mode.sampler',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 13,
  });
  assert.equal(state.padMode.left, 'sampler');

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.jog.touch',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 14,
  });
  assert.equal(state.jogTouch.right, true);

  applyControllerStateEvent(state, {
    canonicalTarget: 'deck.right.jog.touch',
    interaction: 'noteoff',
    type: 'noteoff',
    value: 0,
    timestamp: 15,
  });
  assert.equal(state.jogTouch.right, false);
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

test('applyFlx6InputState updates shared FLX6 state without needing a runtime rewrite', () => {
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

  applyFlx6InputState(state, {
    canonicalTarget: 'deck.right.jog.touch',
    mappingId: 'deck.right.jog.touch.press',
    interaction: 'noteon',
    type: 'noteon',
    value: 127,
    timestamp: 32,
  });
  assert.equal(state.jogTouch.right, true);

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
  assert.deepEqual(state.temporary.lastInput, {
    canonicalTarget: 'deck.left.tempo.fader',
    mappingId: 'deck.left.tempo.fader.main.secondary',
    interaction: 'cc',
    side: 'left',
    deckLayer: 'main',
    timestamp: 34,
  });
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
