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
    value: 96,
    outputKind: 'light',
    bindingId: 'deck.left.transport.cue.alternate.led',
    timestamp: 60,
    profileId: flx6Profile.id,
  }]);
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
