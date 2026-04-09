import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRawInputEvent,
  findProfileInputBindings,
  normalizeRawInputEvent,
} from '../src/controllers/core/normalization.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';

function createFlx6RawInput(overrides = {}) {
  const interaction = overrides.interaction || 'cc';
  const channel = overrides.channel != null ? overrides.channel : 1;
  const code = overrides.code != null ? overrides.code : 19;
  const value = overrides.value != null ? overrides.value : 64;
  const data1 = overrides.data1 != null ? overrides.data1 : code;
  const data2 = overrides.data2 != null ? overrides.data2 : value;

  return createRawInputEvent({
    transport: 'midi',
    profileId: flx6Profile.id,
    sourceId: 'Pioneer DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    interaction,
    channel,
    code,
    value,
    data1,
    data2,
    key: `${interaction}:${channel}:${code}`,
    timestamp: overrides.timestamp != null ? overrides.timestamp : 123,
    bytes: overrides.bytes || [0xB0, data1, data2],
  });
}

test('createRawInputEvent preserves an explicit zero timestamp for deterministic controller tests', () => {
  const raw = createRawInputEvent({
    transport: 'midi',
    interaction: 'cc',
    channel: 7,
    code: 31,
    value: 64,
    data1: 31,
    data2: 64,
    key: 'cc:7:31',
    timestamp: 0,
    bytes: [0xB6, 31, 64],
  });

  assert.equal(raw.timestamp, 0);
  assert.equal(raw.packet.receivedAt, 0);
});

test('normalizeRawInputEvent maps FLX6 channel-fader MIDI into the canonical controller vocabulary', () => {
  const raw = createFlx6RawInput({
    interaction: 'cc',
    channel: 1,
    code: 19,
    value: 64,
  });

  const result = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    sourceId: raw.sourceId,
    timestamp: raw.timestamp,
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    eventType: 'normalized_input',
    transport: 'midi',
    profileId: flx6Profile.id,
    sourceId: 'Pioneer DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    mapped: true,
    canonicalTarget: 'mixer.channel.1.fader',
    mappingId: 'mixer.channel.1.fader.primary',
    rawTarget: 'slider_ch1',
    context: null,
    valueShape: 'absolute',
    interaction: 'cc',
    channel: 1,
    code: 19,
    value: 64,
    data1: 19,
    data2: 64,
    key: 'cc:1:19',
    timestamp: 123,
    raw,
    type: 'cc',
    ch: 1,
    d1: 19,
    d2: 64,
    controller: 19,
  });
});

test('findProfileInputBindings exposes both tempo-fader lanes as one paired canonical control', () => {
  const primary = createFlx6RawInput({
    channel: 1,
    code: 0,
    value: 10,
    data1: 0,
    data2: 10,
    key: 'cc:1:0',
  });
  const secondary = createFlx6RawInput({
    channel: 1,
    code: 32,
    value: 64,
    data1: 32,
    data2: 64,
    key: 'cc:1:32',
  });

  const primaryBindings = findProfileInputBindings(primary, flx6Profile);
  const secondaryBindings = findProfileInputBindings(secondary, flx6Profile);

  assert.deepEqual(primaryBindings.map((binding) => binding.id), [
    'deck.left.tempo.fader.main.primary',
  ]);
  assert.deepEqual(secondaryBindings.map((binding) => binding.id), [
    'deck.left.tempo.fader.main.secondary',
  ]);
  assert.equal(primaryBindings[0].canonical, 'deck.left.tempo.fader');
  assert.equal(secondaryBindings[0].canonical, 'deck.left.tempo.fader');
  assert.deepEqual(primaryBindings[0].context, { deckLayer: 'main' });
  assert.deepEqual(secondaryBindings[0].context, { deckLayer: 'main' });
});

test('normalizeRawInputEvent keeps jog motion and jog touch separate in the canonical layer', () => {
  const motion = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 33,
      value: 65,
      data1: 33,
      data2: 65,
      key: 'cc:1:33',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const touch = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 54,
      value: 127,
      data1: 54,
      data2: 127,
      key: 'noteon:1:54',
      bytes: [0x90, 54, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(motion.canonicalTarget, 'deck.left.jog.motion');
  assert.equal(motion.mappingId, 'deck.left.jog.motion.primary');
  assert.equal(motion.valueShape, 'delta');
  assert.equal(motion.rawTarget, 'jog_L');

  assert.equal(touch.canonicalTarget, 'deck.left.jog.touch');
  assert.equal(touch.mappingId, 'deck.left.jog.touch.press');
  assert.equal(touch.valueShape, 'binary');
  assert.equal(touch.rawTarget, 'jog_L');
});

test('normalizeRawInputEvent falls back cleanly for unmapped raw events while preserving compatibility fields', () => {
  const raw = createFlx6RawInput({
    channel: 9,
    code: 99,
    value: 12,
    data1: 99,
    data2: 12,
    key: 'cc:9:99',
  });

  const result = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    sourceId: raw.sourceId,
  });

  assert.deepEqual(result.warnings, ['unmapped:cc:9:99']);
  assert.deepEqual(result.events, [{
    eventType: 'normalized_input',
    transport: 'midi',
    profileId: flx6Profile.id,
    sourceId: 'Pioneer DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    mapped: false,
    canonicalTarget: null,
    mappingId: null,
    rawTarget: null,
    context: null,
    valueShape: undefined,
    interaction: 'cc',
    channel: 9,
    code: 99,
    value: 12,
    data1: 99,
    data2: 12,
    key: 'cc:9:99',
    timestamp: 123,
    raw,
    type: 'cc',
    ch: 9,
    d1: 99,
    d2: 12,
    controller: 99,
  }]);
});
