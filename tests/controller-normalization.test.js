import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRawInputEvent,
  findProfileInputBindings,
  normalizeRawInputEvent,
} from '../src/controllers/core/normalization.js';
import { createControllerState } from '../src/controllers/core/state.js';
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
    compatValue: 64,
    semanticValue: 64,
    data1: 19,
    data2: 64,
    key: 'cc:1:19',
    timestamp: 123,
    raw,
    feel: null,
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
  assert.deepEqual(motion.context, { deckLayer: 'main' });

  assert.equal(touch.canonicalTarget, 'deck.left.jog.touch');
  assert.equal(touch.mappingId, 'deck.left.jog.touch.press');
  assert.equal(touch.valueShape, 'binary');
  assert.equal(touch.rawTarget, 'jog_L');
  assert.deepEqual(touch.context, { deckLayer: 'main' });
});

test('normalizeRawInputEvent keeps FLX6 jog wheel-side and platter lanes explicit even when touch state disagrees', () => {
  const untouched = createControllerState({
    profileId: flx6Profile.id,
  });
  const touched = createControllerState({
    profileId: flx6Profile.id,
    jogTouch: { left: true },
  });

  const wheelTouched = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 33,
      value: 65,
      data1: 33,
      data2: 65,
      key: 'cc:1:33',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id, controllerState: touched }
  );
  const platterUntouched = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 34,
      value: 65,
      data1: 34,
      data2: 65,
      key: 'cc:1:34',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id, controllerState: untouched }
  );
  const vinylOffUntouched = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 35,
      value: 63,
      data1: 35,
      data2: 63,
      key: 'cc:1:35',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id, controllerState: untouched }
  );

  assert.equal(wheelTouched.events.length, 1);
  assert.equal(wheelTouched.events[0].mappingId, 'deck.left.jog.motion.primary');
  assert.deepEqual(wheelTouched.warnings, []);

  assert.equal(platterUntouched.events.length, 1);
  assert.equal(platterUntouched.events[0].mappingId, 'deck.left.jog.motion.secondary');
  assert.deepEqual(platterUntouched.warnings, []);

  assert.equal(vinylOffUntouched.events.length, 1);
  assert.equal(vinylOffUntouched.events[0].mappingId, 'deck.left.jog.motion.tertiary');
  assert.deepEqual(vinylOffUntouched.warnings, []);
});

test('normalizeRawInputEvent maps alternate-deck jog lanes from the FLX6 MIDI sheet', () => {
  const alternateMotion = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 3,
      code: 35,
      value: 63,
      data1: 35,
      data2: 63,
      key: 'cc:3:35',
      bytes: [0xB2, 35, 63],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const alternateTouch = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 4,
      code: 54,
      value: 127,
      data1: 54,
      data2: 127,
      key: 'noteon:4:54',
      bytes: [0x93, 54, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(alternateMotion.canonicalTarget, 'deck.left.jog.motion');
  assert.equal(alternateMotion.mappingId, 'deck.left.jog.motion.alternate.tertiary');
  assert.equal(alternateMotion.rawTarget, 'jog_L');
  assert.equal(alternateMotion.valueShape, 'delta');
  assert.deepEqual(alternateMotion.context, { deckLayer: 'alternate' });

  assert.equal(alternateTouch.canonicalTarget, 'deck.right.jog.touch');
  assert.equal(alternateTouch.mappingId, 'deck.right.jog.touch.alternate.press');
  assert.equal(alternateTouch.rawTarget, 'jog_R');
  assert.equal(alternateTouch.valueShape, 'binary');
  assert.deepEqual(alternateTouch.context, { deckLayer: 'alternate' });
});

test('normalizeRawInputEvent preserves shifted FLX6 jog and touch alternates as distinct lanes', () => {
  const shiftedMotion = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 38,
      value: 66,
      data1: 38,
      data2: 66,
      key: 'cc:1:38',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedTouch = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 103,
      value: 127,
      data1: 103,
      data2: 127,
      key: 'noteon:1:103',
      bytes: [0x90, 103, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(shiftedMotion.canonicalTarget, 'deck.left.jog.motion');
  assert.equal(shiftedMotion.mappingId, 'deck.left.jog.motion.shifted.primary');
  assert.equal(shiftedMotion.rawTarget, 'jog_L');
  assert.equal(shiftedMotion.valueShape, 'delta');
  assert.deepEqual(shiftedMotion.context, { deckLayer: 'main', shifted: true });

  assert.equal(shiftedTouch.canonicalTarget, 'deck.left.jog.touch');
  assert.equal(shiftedTouch.mappingId, 'deck.left.jog.touch.shifted.press');
  assert.equal(shiftedTouch.rawTarget, 'jog_L');
  assert.equal(shiftedTouch.valueShape, 'binary');
  assert.deepEqual(shiftedTouch.context, { deckLayer: 'main', shifted: true });
});

test('official FLX6 jog mappings stay on their sheet-authored MIDI addresses', () => {
  const bindings = [
    'deck.left.jog.motion.primary',
    'deck.left.jog.motion.secondary',
    'deck.left.jog.motion.tertiary',
    'deck.left.jog.motion.shifted.primary',
    'deck.left.jog.motion.shifted.secondary',
    'deck.right.jog.motion.primary',
    'deck.right.jog.motion.secondary',
    'deck.right.jog.motion.tertiary',
    'deck.right.jog.motion.shifted.primary',
    'deck.right.jog.motion.shifted.secondary',
    'deck.left.jog.touch.press',
    'deck.left.jog.touch.shifted.press',
    'deck.right.jog.touch.press',
    'deck.right.jog.touch.shifted.press',
    'deck.left.jog.cutter.main.press',
    'deck.right.jog.cutter.main.press',
    'deck.left.jog.vinyl_mode.main.shifted.press',
    'deck.right.jog.vinyl_mode.main.shifted.press',
  ].map((id) => flx6Profile.inputs.mappings.find((binding) => binding.id === id));

  assert.deepEqual(
    bindings.map((binding) => ({
      id: binding && binding.id,
      key: binding && binding.raw && binding.raw.key,
      canonical: binding && binding.canonical,
    })),
    [
      { id: 'deck.left.jog.motion.primary', key: 'cc:1:33', canonical: 'deck.left.jog.motion' },
      { id: 'deck.left.jog.motion.secondary', key: 'cc:1:34', canonical: 'deck.left.jog.motion' },
      { id: 'deck.left.jog.motion.tertiary', key: 'cc:1:35', canonical: 'deck.left.jog.motion' },
      { id: 'deck.left.jog.motion.shifted.primary', key: 'cc:1:38', canonical: 'deck.left.jog.motion' },
      { id: 'deck.left.jog.motion.shifted.secondary', key: 'cc:1:41', canonical: 'deck.left.jog.motion' },
      { id: 'deck.right.jog.motion.primary', key: 'cc:2:33', canonical: 'deck.right.jog.motion' },
      { id: 'deck.right.jog.motion.secondary', key: 'cc:2:34', canonical: 'deck.right.jog.motion' },
      { id: 'deck.right.jog.motion.tertiary', key: 'cc:2:35', canonical: 'deck.right.jog.motion' },
      { id: 'deck.right.jog.motion.shifted.primary', key: 'cc:2:38', canonical: 'deck.right.jog.motion' },
      { id: 'deck.right.jog.motion.shifted.secondary', key: 'cc:2:41', canonical: 'deck.right.jog.motion' },
      { id: 'deck.left.jog.touch.press', key: 'noteon:1:54', canonical: 'deck.left.jog.touch' },
      { id: 'deck.left.jog.touch.shifted.press', key: 'noteon:1:103', canonical: 'deck.left.jog.touch' },
      { id: 'deck.right.jog.touch.press', key: 'noteon:2:54', canonical: 'deck.right.jog.touch' },
      { id: 'deck.right.jog.touch.shifted.press', key: 'noteon:2:103', canonical: 'deck.right.jog.touch' },
      { id: 'deck.left.jog.cutter.main.press', key: 'noteon:1:28', canonical: 'deck.left.jog.cutter' },
      { id: 'deck.right.jog.cutter.main.press', key: 'noteon:2:28', canonical: 'deck.right.jog.cutter' },
      { id: 'deck.left.jog.vinyl_mode.main.shifted.press', key: 'noteon:1:23', canonical: 'deck.left.jog.vinyl_mode' },
      { id: 'deck.right.jog.vinyl_mode.main.shifted.press', key: 'noteon:2:23', canonical: 'deck.right.jog.vinyl_mode' },
    ],
  );
});

test('normalizeRawInputEvent maps shifted Jog Cutter hardware lanes to FLX6 vinyl-mode control truth', () => {
  const vinylMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 23,
      value: 127,
      data1: 23,
      data2: 127,
      key: 'noteon:1:23',
      bytes: [0x90, 23, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(vinylMode.canonicalTarget, 'deck.left.jog.vinyl_mode');
  assert.equal(vinylMode.mappingId, 'deck.left.jog.vinyl_mode.main.shifted.press');
  assert.equal(vinylMode.rawTarget, 'jogcut_x5F_L');
  assert.equal(vinylMode.valueShape, 'binary');
  assert.deepEqual(vinylMode.context, { deckLayer: 'main', shifted: true });
});

test('normalizeRawInputEvent maps FLX6 mixer knobs into canonical gain and EQ controls', () => {
  const gain = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 1,
      code: 4,
      value: 90,
      data1: 4,
      data2: 90,
      key: 'cc:1:4',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const high = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 3,
      code: 7,
      value: 12,
      data1: 7,
      data2: 12,
      key: 'cc:3:7',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(gain.canonicalTarget, 'mixer.channel.1.gain');
  assert.equal(gain.mappingId, 'mixer.channel.1.gain.primary');
  assert.equal(gain.rawTarget, 'trim_1');
  assert.equal(gain.valueShape, 'absolute');

  assert.equal(high.canonicalTarget, 'mixer.channel.3.eq.high');
  assert.equal(high.mappingId, 'mixer.channel.3.eq.high.primary');
  assert.equal(high.rawTarget, 'hi_3');
  assert.equal(high.valueShape, 'absolute');
});

test('normalizeRawInputEvent maps FLX6 filter knobs from the shared mixer channel lane', () => {
  const filter = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 7,
      code: 24,
      value: 100,
      data1: 24,
      data2: 100,
      key: 'cc:7:24',
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(filter.canonicalTarget, 'mixer.channel.2.filter');
  assert.equal(filter.mappingId, 'mixer.channel.2.filter.primary');
  assert.equal(filter.rawTarget, 'filter_2');
  assert.equal(filter.valueShape, 'absolute');
});

test('normalizeRawInputEvent maps load and loop buttons into the canonical deck controls', () => {
  const loadAlternate = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 72,
      value: 127,
      data1: 72,
      data2: 127,
      key: 'noteon:7:72',
      bytes: [0x96, 72, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const loopIn = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 2,
      code: 16,
      value: 127,
      data1: 16,
      data2: 127,
      key: 'noteon:2:16',
      bytes: [0x91, 16, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(loadAlternate.canonicalTarget, 'deck.left.transport.load');
  assert.equal(loadAlternate.mappingId, 'deck.left.transport.load.alternate.press');
  assert.deepEqual(loadAlternate.context, { deckLayer: 'alternate' });
  assert.equal(loadAlternate.rawTarget, 'load_3');

  assert.equal(loopIn.canonicalTarget, 'deck.right.loop.in');
  assert.equal(loopIn.mappingId, 'deck.right.loop.in.main.press');
  assert.deepEqual(loopIn.context, { deckLayer: 'main' });
  assert.equal(loopIn.rawTarget, 'loop_in_R');
});

test('normalizeRawInputEvent maps the FLX6 browse stack into canonical browser controls', () => {
  const browseTurn = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 7,
      code: 64,
      value: 65,
      data1: 64,
      data2: 65,
      key: 'cc:7:64',
      bytes: [0xB6, 64, 65],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const browsePress = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 65,
      value: 127,
      data1: 65,
      data2: 127,
      key: 'noteon:7:65',
      bytes: [0x96, 65, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const back = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 101,
      value: 127,
      data1: 101,
      data2: 127,
      key: 'noteon:7:101',
      bytes: [0x96, 101, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const view = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 122,
      value: 127,
      data1: 122,
      data2: 127,
      key: 'noteon:7:122',
      bytes: [0x96, 122, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(browseTurn.canonicalTarget, 'browser.scroll');
  assert.equal(browseTurn.mappingId, 'browser.scroll');
  assert.equal(browseTurn.rawTarget, 'browse_encoder');
  assert.equal(browseTurn.valueShape, 'delta');

  assert.equal(browsePress.canonicalTarget, 'browser.push');
  assert.equal(browsePress.mappingId, 'browser.push.press');
  assert.equal(browsePress.rawTarget, 'browse_encoder_press');

  assert.equal(back.canonicalTarget, 'browser.back');
  assert.equal(back.mappingId, 'browser.back.press');
  assert.equal(back.rawTarget, 'back');

  assert.equal(view.canonicalTarget, 'browser.view');
  assert.equal(view.mappingId, 'browser.view.press');
  assert.equal(view.rawTarget, 'view');
});

test('normalizeRawInputEvent maps shifted browse, back, view, and load lanes from the FLX6 CSV', () => {
  const shiftedBrowseTurn = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 7,
      code: 100,
      value: 65,
      data1: 100,
      data2: 65,
      key: 'cc:7:100',
      bytes: [0xB6, 100, 65],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedBrowsePress = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 66,
      value: 127,
      data1: 66,
      data2: 127,
      key: 'noteon:7:66',
      bytes: [0x96, 66, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedBack = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 102,
      value: 127,
      data1: 102,
      data2: 127,
      key: 'noteon:7:102',
      bytes: [0x96, 102, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const viewLongPress = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 103,
      value: 127,
      data1: 103,
      data2: 127,
      key: 'noteon:7:103',
      bytes: [0x96, 103, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedView = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: 104,
      value: 127,
      data1: 104,
      data2: 127,
      key: 'noteon:7:104',
      bytes: [0x96, 104, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedLoads = [
    { code: 88, key: 'noteon:7:88', bytes: [0x96, 88, 127], mappingId: 'deck.left.transport.load.main.shifted.press', context: { deckLayer: 'main', shifted: true }, rawTarget: 'load_1' },
    { code: 89, key: 'noteon:7:89', bytes: [0x96, 89, 127], mappingId: 'deck.right.transport.load.main.shifted.press', context: { deckLayer: 'main', shifted: true }, rawTarget: 'load_2' },
    { code: 96, key: 'noteon:7:96', bytes: [0x96, 96, 127], mappingId: 'deck.left.transport.load.alternate.shifted.press', context: { deckLayer: 'alternate', shifted: true }, rawTarget: 'load_3' },
    { code: 97, key: 'noteon:7:97', bytes: [0x96, 97, 127], mappingId: 'deck.right.transport.load.alternate.shifted.press', context: { deckLayer: 'alternate', shifted: true }, rawTarget: 'load_4' },
  ].map((entry) => normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 7,
      code: entry.code,
      value: 127,
      data1: entry.code,
      data2: 127,
      key: entry.key,
      bytes: entry.bytes,
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0]);

  assert.equal(shiftedBrowseTurn.canonicalTarget, 'browser.scroll');
  assert.equal(shiftedBrowseTurn.mappingId, 'browser.scroll.shifted');
  assert.deepEqual(shiftedBrowseTurn.context, { shifted: true });

  assert.equal(shiftedBrowsePress.canonicalTarget, 'browser.push');
  assert.equal(shiftedBrowsePress.mappingId, 'browser.push.shifted.press');
  assert.deepEqual(shiftedBrowsePress.context, { shifted: true });

  assert.equal(shiftedBack.canonicalTarget, 'browser.back');
  assert.equal(shiftedBack.mappingId, 'browser.back.shifted.press');
  assert.deepEqual(shiftedBack.context, { shifted: true });

  assert.equal(viewLongPress.canonicalTarget, 'browser.view');
  assert.equal(viewLongPress.mappingId, 'browser.view.long_press.press');
  assert.deepEqual(viewLongPress.context, { longPress: true });

  assert.equal(shiftedView.canonicalTarget, 'browser.view');
  assert.equal(shiftedView.mappingId, 'browser.view.shifted.press');
  assert.deepEqual(shiftedView.context, { shifted: true });

  shiftedLoads.forEach((event, index) => {
    const expected = [
      { mappingId: 'deck.left.transport.load.main.shifted.press', context: { deckLayer: 'main', shifted: true }, rawTarget: 'load_1' },
      { mappingId: 'deck.right.transport.load.main.shifted.press', context: { deckLayer: 'main', shifted: true }, rawTarget: 'load_2' },
      { mappingId: 'deck.left.transport.load.alternate.shifted.press', context: { deckLayer: 'alternate', shifted: true }, rawTarget: 'load_3' },
      { mappingId: 'deck.right.transport.load.alternate.shifted.press', context: { deckLayer: 'alternate', shifted: true }, rawTarget: 'load_4' },
    ][index];

    assert.equal(event.canonicalTarget, index % 2 === 0 ? 'deck.left.transport.load' : 'deck.right.transport.load');
    assert.equal(event.mappingId, expected.mappingId);
    assert.deepEqual(event.context, expected.context);
    assert.equal(event.rawTarget, expected.rawTarget);
  });
});

test('normalizeRawInputEvent maps newly covered FLX6 sync, layer, loop-memory, and Merge FX controls', () => {
  const sync = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 4,
      code: 88,
      value: 127,
      data1: 88,
      data2: 127,
      key: 'noteon:4:88',
      bytes: [0x93, 88, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const layer = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 3,
      code: 114,
      value: 127,
      data1: 114,
      data2: 127,
      key: 'noteon:3:114',
      bytes: [0x92, 114, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const loopCall = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 2,
      code: 83,
      value: 127,
      data1: 83,
      data2: 127,
      key: 'noteon:2:83',
      bytes: [0x91, 83, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const loopMemory = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 61,
      value: 127,
      data1: 61,
      data2: 127,
      key: 'noteon:1:61',
      bytes: [0x90, 61, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const mergeSelect = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 5,
      code: 47,
      value: 127,
      data1: 47,
      data2: 127,
      key: 'noteon:5:47',
      bytes: [0x94, 47, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const mergeQuick = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'cc',
      channel: 6,
      code: 8,
      value: 65,
      data1: 8,
      data2: 65,
      key: 'cc:6:8',
      bytes: [0xB5, 8, 65],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(sync.canonicalTarget, 'deck.right.transport.sync');
  assert.equal(sync.mappingId, 'deck.right.transport.sync.alternate.press');
  assert.equal(sync.rawTarget, 'beatsync_R');
  assert.deepEqual(sync.context, { deckLayer: 'alternate' });

  assert.equal(layer.canonicalTarget, 'deck.left.transport.layer');
  assert.equal(layer.mappingId, 'deck.left.transport.layer.press');
  assert.equal(layer.rawTarget, 'decks_L');
  assert.equal(layer.valueShape, 'binary');

  assert.equal(loopCall.canonicalTarget, 'deck.right.loop.call.forward');
  assert.equal(loopCall.mappingId, 'deck.right.loop.call.forward.main.press');
  assert.equal(loopCall.rawTarget, 'select_loop_call_RR');
  assert.deepEqual(loopCall.context, { deckLayer: 'main' });

  assert.equal(loopMemory.canonicalTarget, 'deck.left.loop.memory');
  assert.equal(loopMemory.mappingId, 'deck.left.loop.memory.main.press');
  assert.equal(loopMemory.rawTarget, 'loop_memory_L');
  assert.deepEqual(loopMemory.context, { deckLayer: 'main' });

  assert.equal(mergeSelect.canonicalTarget, 'deck.left.fx.quick_select');
  assert.equal(mergeSelect.mappingId, 'deck.left.fx.quick_select.press');
  assert.equal(mergeSelect.rawTarget, 'merge_button_L');

  assert.equal(mergeQuick.canonicalTarget, 'deck.right.fx.quick');
  assert.equal(mergeQuick.mappingId, 'deck.right.fx.quick');
  assert.equal(mergeQuick.rawTarget, 'knob_MERGEFX_R');
  assert.equal(mergeQuick.valueShape, 'delta');
});

test('normalizeRawInputEvent maps deck-control status rows and the CH4 selector into official bindings', () => {
  const deckStatus = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 3,
      code: 60,
      value: 127,
      data1: 60,
      data2: 127,
      key: 'noteon:3:60',
      bytes: [0x92, 60, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const ch4Selector = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 4,
      code: 13,
      value: 127,
      data1: 13,
      data2: 127,
      key: 'noteon:4:13',
      bytes: [0x93, 13, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(deckStatus.canonicalTarget, 'deck.left.transport.layer.status.alternate');
  assert.equal(deckStatus.mappingId, 'deck.left.transport.layer.status.alternate.on');
  assert.equal(deckStatus.rawTarget, 'decks_L');
  assert.deepEqual(deckStatus.context, {
    deckLayer: 'alternate',
    ownerDeck: 3,
    assignment: 'deck_control_status',
    surfaceSide: 'left',
  });

  assert.equal(ch4Selector.canonicalTarget, 'mixer.channel.4.input_select');
  assert.equal(ch4Selector.mappingId, 'mixer.channel.4.input_select.sampler');
  assert.equal(ch4Selector.rawTarget, 'input_select_ch4');
  assert.equal(ch4Selector.valueShape, 'binary');
});

test('normalizeRawInputEvent maps shifted transport lanes and deck master lanes into official FLX6 bindings', () => {
  const shiftedPlay = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 71,
      value: 127,
      data1: 71,
      data2: 127,
      key: 'noteon:1:71',
      bytes: [0x90, 71, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedCue = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 4,
      code: 72,
      value: 127,
      data1: 72,
      data2: 127,
      key: 'noteon:4:72',
      bytes: [0x93, 72, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedSync = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 3,
      code: 93,
      value: 127,
      data1: 93,
      data2: 127,
      key: 'noteon:3:93',
      bytes: [0x92, 93, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const shiftedMaster = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 2,
      code: 96,
      value: 127,
      data1: 96,
      data2: 127,
      key: 'noteon:2:96',
      bytes: [0x91, 96, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(shiftedPlay.canonicalTarget, 'deck.left.transport.play');
  assert.equal(shiftedPlay.mappingId, 'deck.left.transport.play.main.shifted.press');
  assert.equal(shiftedPlay.rawTarget, 'play_L');
  assert.deepEqual(shiftedPlay.context, { deckLayer: 'main', shifted: true });

  assert.equal(shiftedCue.canonicalTarget, 'deck.right.transport.cue');
  assert.equal(shiftedCue.mappingId, 'deck.right.transport.cue.alternate.shifted.press');
  assert.equal(shiftedCue.rawTarget, 'cue_R');
  assert.deepEqual(shiftedCue.context, { deckLayer: 'alternate', shifted: true });

  assert.equal(shiftedSync.canonicalTarget, 'deck.left.transport.sync');
  assert.equal(shiftedSync.mappingId, 'deck.left.transport.sync.alternate.shifted.press');
  assert.equal(shiftedSync.rawTarget, 'beatsync_L');
  assert.deepEqual(shiftedSync.context, { deckLayer: 'alternate', shifted: true });

  assert.equal(shiftedMaster.canonicalTarget, 'deck.right.transport.master');
  assert.equal(shiftedMaster.mappingId, 'deck.right.transport.master.main.shifted.press');
  assert.equal(shiftedMaster.rawTarget, 'master_R');
  assert.deepEqual(shiftedMaster.context, { deckLayer: 'main', shifted: true });
});

test('normalizeRawInputEvent maps FLX6 pad mode buttons and performance pad banks into canonical pad controls', () => {
  const samplerMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 3,
      code: 34,
      value: 127,
      data1: 34,
      data2: 127,
      key: 'noteon:3:34',
      bytes: [0x92, 34, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const samplerPad = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 12,
      code: 52,
      value: 127,
      data1: 52,
      data2: 127,
      key: 'noteon:12:52',
      bytes: [0x9B, 52, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(samplerMode.canonicalTarget, 'deck.left.pad_mode.sampler');
  assert.equal(samplerMode.mappingId, 'deck.left.pad_mode.sampler.alternate.press');
  assert.equal(samplerMode.rawTarget, 'sampler_L');
  assert.equal(samplerMode.valueShape, 'binary');
  assert.deepEqual(samplerMode.context, { deckLayer: 'alternate' });

  assert.equal(samplerPad.canonicalTarget, 'deck.left.pad.5');
  assert.equal(samplerPad.mappingId, 'deck.left.pad.5.alternate.sampler.press');
  assert.equal(samplerPad.rawTarget, 'pad_L_5');
  assert.equal(samplerPad.valueShape, 'binary');
  assert.deepEqual(samplerPad.context, {
    deckLayer: 'alternate',
    mode: 'sampler',
  });
});

test('normalizeRawInputEvent maps shifted FLX6 pad families into official mode selectors and pad banks', () => {
  const keyboardMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 1,
      code: 105,
      value: 127,
      data1: 105,
      data2: 127,
      key: 'noteon:1:105',
      bytes: [0x90, 105, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const keyShiftMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 2,
      code: 111,
      value: 127,
      data1: 111,
      data2: 127,
      key: 'noteon:2:111',
      bytes: [0x91, 111, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const beatLoopMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 3,
      code: 109,
      value: 127,
      data1: 109,
      data2: 127,
      key: 'noteon:3:109',
      bytes: [0x92, 109, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const sampleScratchMode = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 4,
      code: 107,
      value: 127,
      data1: 107,
      data2: 127,
      key: 'noteon:4:107',
      bytes: [0x93, 107, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const keyboardPad = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 8,
      code: 64,
      value: 127,
      data1: 64,
      data2: 127,
      key: 'noteon:8:64',
      bytes: [0x97, 64, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const keyShiftPad = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 10,
      code: 81,
      value: 127,
      data1: 81,
      data2: 127,
      key: 'noteon:10:81',
      bytes: [0x99, 81, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const beatLoopPad = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 12,
      code: 98,
      value: 127,
      data1: 98,
      data2: 127,
      key: 'noteon:12:98',
      bytes: [0x9B, 98, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  const sampleScratchPad = normalizeRawInputEvent(
    createFlx6RawInput({
      interaction: 'noteon',
      channel: 14,
      code: 115,
      value: 127,
      data1: 115,
      data2: 127,
      key: 'noteon:14:115',
      bytes: [0x9D, 115, 127],
    }),
    { profile: flx6Profile, profileId: flx6Profile.id }
  ).events[0];

  assert.equal(keyboardMode.canonicalTarget, 'deck.left.pad_mode.keyboard');
  assert.equal(keyboardMode.mappingId, 'deck.left.pad_mode.keyboard.main.shifted.press');
  assert.equal(keyboardMode.rawTarget, 'hotcue_L');
  assert.deepEqual(keyboardMode.context, { deckLayer: 'main', shifted: true });

  assert.equal(keyShiftMode.canonicalTarget, 'deck.right.pad_mode.key_shift');
  assert.equal(keyShiftMode.mappingId, 'deck.right.pad_mode.key_shift.main.shifted.press');
  assert.equal(keyShiftMode.rawTarget, 'padfx_R');
  assert.deepEqual(keyShiftMode.context, { deckLayer: 'main', shifted: true });

  assert.equal(beatLoopMode.canonicalTarget, 'deck.left.pad_mode.beat_loop');
  assert.equal(beatLoopMode.mappingId, 'deck.left.pad_mode.beat_loop.alternate.shifted.press');
  assert.equal(beatLoopMode.rawTarget, 'beatjump_L');
  assert.deepEqual(beatLoopMode.context, { deckLayer: 'alternate', shifted: true });

  assert.equal(sampleScratchMode.canonicalTarget, 'deck.right.pad_mode.sample_scratch');
  assert.equal(sampleScratchMode.mappingId, 'deck.right.pad_mode.sample_scratch.alternate.shifted.press');
  assert.equal(sampleScratchMode.rawTarget, 'sampler_R');
  assert.deepEqual(sampleScratchMode.context, { deckLayer: 'alternate', shifted: true });

  assert.equal(keyboardPad.mappingId, 'deck.left.pad.1.main.keyboard.press');
  assert.deepEqual(keyboardPad.context, { deckLayer: 'main', mode: 'keyboard' });

  assert.equal(keyShiftPad.mappingId, 'deck.right.pad.2.main.key_shift.press');
  assert.deepEqual(keyShiftPad.context, { deckLayer: 'main', mode: 'key_shift' });

  assert.equal(beatLoopPad.mappingId, 'deck.left.pad.3.alternate.beat_loop.press');
  assert.deepEqual(beatLoopPad.context, { deckLayer: 'alternate', mode: 'beat_loop' });

  assert.equal(sampleScratchPad.mappingId, 'deck.right.pad.4.alternate.sample_scratch.press');
  assert.deepEqual(sampleScratchPad.context, { deckLayer: 'alternate', mode: 'sample_scratch' });
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
    compatValue: 12,
    semanticValue: 12,
    data1: 99,
    data2: 12,
    key: 'cc:9:99',
    timestamp: 123,
    raw,
    feel: null,
    type: 'cc',
    ch: 9,
    d1: 99,
    d2: 12,
    controller: 99,
  }]);
});

test('normalizeRawInputEvent attaches FEEL semantic metadata when the controller layer owns a binding', () => {
  const raw = createFlx6RawInput({
    channel: 7,
    code: 31,
    value: 64,
    data1: 31,
    data2: 64,
    key: 'cc:7:31',
  });
  const feelRuntime = {
    processBinding(input, binding) {
      assert.equal(input, raw);
      assert.equal(binding.id, 'mixer.crossfader.primary');
      return {
        applied: true,
        accepted: true,
        blocked: false,
        mode: 'absolute',
        instanceId: 'mixer.crossfader',
        configKey: 'xfader',
        value: 64 / 127,
      };
    },
  };

  const result = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    sourceId: raw.sourceId,
    feelRuntime,
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].value, 64);
  assert.equal(result.events[0].compatValue, 64);
  assert.equal(result.events[0].semanticValue, 64 / 127);
  assert.deepEqual(result.events[0].feel, {
    applied: true,
    accepted: true,
    blocked: false,
    mode: 'absolute',
    instanceId: 'mixer.crossfader',
    configKey: 'xfader',
    value: 64 / 127,
    motion: null,
  });
});
