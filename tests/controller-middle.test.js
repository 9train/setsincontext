import test from 'node:test';
import assert from 'node:assert/strict';

import { createRawInputEvent, normalizeRawInputEvent } from '../src/controllers/core/normalization.js';
import { createControllerState, setBeatFxState } from '../src/controllers/core/state.js';
import { resolveFlx6InputEvent } from '../src/controllers/profiles/ddj-flx6.middle.js';
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

function resolveFromRaw(raw, state) {
  const normalized = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    controllerState: state,
  }).events[0];

  return resolveFlx6InputEvent({
    rawEvent: raw,
    inputEvent: normalized,
    controllerState: state,
    profile: flx6Profile,
  });
}

test('resolveFlx6InputEvent keeps binding deck context separate until official deck ownership arrives', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'cc',
    channel: 1,
    code: 33,
    value: 65,
    data1: 33,
    data2: 65,
    key: 'cc:1:33',
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'jog');
  assert.equal(resolved.semantic.action, 'turn');
  assert.equal(resolved.semantic.meaning, 'jog_wheel_side_turn');
  assert.equal(resolved.semantic.truthStatus, 'official');
  assert.equal(resolved.semantic.deckContext.surfaceSide, 'left');
  assert.equal(resolved.semantic.deckContext.owner.deckNumber, null);
  assert.equal(resolved.semantic.deckContext.owner.status, 'unknown');
  assert.equal(resolved.semantic.deckContext.binding.deckNumber, 1);
  assert.equal(resolved.semantic.deckContext.binding.deckLayer, 'main');
  assert.equal(resolved.render.targetId, 'jog_L');
  assert.equal(resolved.debug.rawLane.key, 'cc:1:33');
  assert.equal(resolved.debug.binding.id, 'deck.left.jog.motion.primary');
  assert.equal(resolved.debug.truthFocus.deckOwnership.after.status, 'unknown');
  assert.equal(resolved.debug.truthFocus.deckOwnership.binding.deckNumber, 1);
  assert.equal(resolved.debug.truthFocus.padMode.after.status, 'unknown');
  assert.match(resolved.debug.truthSummary, /owner:unknown/);
  assert.equal(resolved.debug.stateAfter.truth.deckOwnership.left.status, 'unknown');
  assert.equal(resolved.debug.stateAfter.truth.deckOwnership.left.value.ownerDeck, null);
});

test('resolveFlx6InputEvent separates pad meaning from board render target', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 12,
    code: 52,
    value: 127,
    data1: 52,
    data2: 127,
    key: 'noteon:12:52',
    bytes: [0x9B, 52, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'pad');
  assert.equal(resolved.semantic.meaning, 'sampler_pad_5_trigger');
  assert.equal(resolved.semantic.truthStatus, 'official');
  assert.equal(resolved.render.targetId, 'pad_L_5');
  assert.equal(resolved.debug.truthFocus.padMode.before.status, 'unknown');
  assert.equal(resolved.debug.truthFocus.padMode.before.value, null);
  assert.equal(resolved.debug.truthFocus.padMode.compatibilityValueBefore, null);
  assert.equal(resolved.debug.truthFocus.padMode.after.status, 'official');
  assert.equal(resolved.debug.truthFocus.padMode.after.value, 'sampler');
  assert.equal(state.padMode.left, 'sampler');
  assert.equal(state.truth.padMode.left.status, 'official');
});

test('resolveFlx6InputEvent gives shifted pad-mode selectors and extended pad banks official FLX6 ownership', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  const keyboardSelect = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 105,
    value: 127,
    data1: 105,
    data2: 127,
    key: 'noteon:1:105',
    bytes: [0x90, 105, 127],
  }), state);

  const sampleScratchPad = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 14,
    code: 112,
    value: 127,
    data1: 112,
    data2: 127,
    key: 'noteon:14:112',
    bytes: [0x9D, 112, 127],
  }), state);

  assert.equal(keyboardSelect.semantic.family, 'pad-mode');
  assert.equal(keyboardSelect.semantic.meaning, 'keyboard_select');
  assert.equal(keyboardSelect.semantic.truthStatus, 'official');
  assert.equal(keyboardSelect.render.targetId, 'hotcue_L');
  assert.equal(keyboardSelect.debug.binding.id, 'deck.left.pad_mode.keyboard.main.shifted.press');
  assert.equal(keyboardSelect.debug.binding.context.shifted, true);

  assert.equal(sampleScratchPad.semantic.family, 'pad');
  assert.equal(sampleScratchPad.semantic.meaning, 'sample_scratch_pad_1_trigger');
  assert.equal(sampleScratchPad.semantic.truthStatus, 'official');
  assert.equal(sampleScratchPad.render.targetId, 'pad_R_1');
  assert.equal(sampleScratchPad.debug.truthFocus.padMode.before.status, 'unknown');
  assert.equal(sampleScratchPad.debug.truthFocus.padMode.compatibilityValueBefore, null);
  assert.equal(sampleScratchPad.debug.truthFocus.padMode.after.value, 'sample_scratch');
  assert.equal(state.padMode.right, 'sample_scratch');
  assert.equal(state.truth.padMode.right.status, 'official');
});

test('resolveFlx6InputEvent exposes jog cutter button truth separately from enabled-mode truth', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 28,
    value: 127,
    data1: 28,
    data2: 127,
    key: 'noteon:1:28',
    bytes: [0x90, 28, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'jog');
  assert.equal(resolved.debug.truthFocus.jogCutter.button.after.status, 'official');
  assert.equal(resolved.debug.truthFocus.jogCutter.button.after.value, true);
  assert.equal(resolved.debug.truthFocus.jogCutter.enabled.after.status, 'unknown');
  assert.equal(resolved.debug.truthFocus.jogCutter.enabled.after.value, null);
  assert.match(resolved.debug.truthSummary, /cutter:mode=unknown\/button=official/);
});

test('resolveFlx6InputEvent lets plain official FLX6 controls resolve from mapping plus render target only', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 84,
    value: 127,
    data1: 84,
    data2: 127,
    key: 'noteon:1:84',
    bytes: [0x90, 84, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'mixer');
  assert.equal(resolved.semantic.meaning, 'mixer_channel_1_cue');
  assert.equal(resolved.semantic.truthStatus, 'official');
  assert.equal(resolved.render.targetId, 'headphone_cue_1');
  assert.equal(resolved.debug.binding.id, 'mixer.channel.1.cue.press');
  assert.equal(resolved.debug.binding.rawTarget, 'headphone_cue_1');
});

test('resolveFlx6InputEvent keeps CH4 control meaning unknown until the selector authors it, then resolves sampler semantics', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  const unresolvedFader = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 4,
    code: 19,
    value: 80,
    data1: 19,
    data2: 80,
    key: 'cc:4:19',
    bytes: [0xB3, 19, 80],
  }), state);

  assert.equal(unresolvedFader.semantic.family, 'channel4-strip');
  assert.equal(unresolvedFader.semantic.truthStatus, 'unknown');
  assert.equal(unresolvedFader.render.targetId, 'slider_ch4');

  const selector = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 4,
    code: 13,
    value: 127,
    data1: 13,
    data2: 127,
    key: 'noteon:4:13',
    bytes: [0x93, 13, 127],
  }), state);

  const samplerFader = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 4,
    code: 19,
    value: 81,
    data1: 19,
    data2: 81,
    key: 'cc:4:19',
    bytes: [0xB3, 19, 81],
  }), state);

  assert.equal(state.channel4Input, 'sampler');
  assert.equal(selector.semantic.family, 'channel4-selector');
  assert.equal(selector.render.targetId, 'channel_4');
  assert.equal(selector.debug.truthFocus.channel4Selector.after.status, 'official');
  assert.equal(selector.debug.truthFocus.channel4Selector.after.value, 'sampler');
  assert.equal(selector.debug.truthFocus.channel4Selector.targetId, 'channel_4');
  assert.match(selector.debug.truthSummary, /ch4:official/);
  assert.equal(selector.debug.stateAfter.truth.channel4Input.value, 'sampler');
  assert.equal(samplerFader.semantic.family, 'sampler');
  assert.equal(samplerFader.semantic.meaning, 'sampler_master_fader');
  assert.equal(samplerFader.semantic.truthStatus, 'official');
  assert.equal(samplerFader.render.targetId, 'slider_ch4');
});

test('resolveFlx6InputEvent turns deck-control status rows into authoritative deck ownership truth', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 3,
    code: 60,
    value: 127,
    data1: 60,
    data2: 127,
    key: 'noteon:3:60',
    bytes: [0x92, 60, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'deck-ownership');
  assert.equal(resolved.semantic.meaning, 'deck_control_on');
  assert.equal(resolved.render.targetId, 'decks_L');
  assert.equal(state.truth.deckControl[3].value, true);
  assert.equal(state.truth.deckOwnership.left.value.ownerDeck, 3);
  assert.equal(resolved.debug.stateAfter.truth.deckOwnership.left.status, 'official');
});

test('resolveFlx6InputEvent gives shifted browser and view lanes official semantics and resolves to official render targets', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  const shiftedBrowseTurn = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 7,
    code: 100,
    value: 65,
    data1: 100,
    data2: 65,
    key: 'cc:7:100',
    bytes: [0xB6, 100, 65],
  }), state);

  const viewLongPress = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 7,
    code: 103,
    value: 127,
    data1: 103,
    data2: 127,
    key: 'noteon:7:103',
    bytes: [0x96, 103, 127],
  }), state);

  const shiftedView = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 7,
    code: 104,
    value: 127,
    data1: 104,
    data2: 127,
    key: 'noteon:7:104',
    bytes: [0x96, 104, 127],
  }), state);

  assert.equal(shiftedBrowseTurn.semantic.family, 'browser');
  assert.equal(shiftedBrowseTurn.semantic.action, 'turn');
  assert.equal(shiftedBrowseTurn.semantic.meaning, 'browser_scroll_shifted');
  assert.equal(shiftedBrowseTurn.semantic.truthStatus, 'official');
  assert.equal(shiftedBrowseTurn.render.targetId, 'browser_scroll');
  assert.equal(shiftedBrowseTurn.render.truthStatus, 'official');

  assert.equal(viewLongPress.semantic.family, 'browser');
  assert.equal(viewLongPress.semantic.action, 'long_press');
  assert.equal(viewLongPress.semantic.meaning, 'browser_view_long_press');
  assert.equal(viewLongPress.render.truthStatus, 'official');

  assert.equal(shiftedView.semantic.family, 'browser');
  assert.equal(shiftedView.semantic.action, 'press');
  assert.equal(shiftedView.semantic.meaning, 'browser_view_shifted');
  assert.equal(shiftedView.render.truthStatus, 'official');
});

test('resolveFlx6InputEvent keeps shifted load lanes on the official FLX6 path with deck-specific meaning and render targets', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 7,
    code: 97,
    value: 127,
    data1: 97,
    data2: 127,
    key: 'noteon:7:97',
    bytes: [0x96, 97, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'deck');
  assert.equal(resolved.semantic.action, 'load');
  assert.equal(resolved.semantic.meaning, 'load_to_deck_4_shifted');
  assert.equal(resolved.semantic.truthStatus, 'official');
  assert.equal(resolved.render.targetId, 'load_4');
  assert.equal(resolved.debug.binding.id, 'deck.right.transport.load.alternate.shifted.press');
  assert.equal(resolved.debug.binding.context.deckLayer, 'alternate');
  assert.equal(resolved.debug.binding.context.shifted, true);
});

test('resolveFlx6InputEvent gives shifted transport and master lanes explicit official semantics and board targets', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  const shiftedPlay = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 71,
    value: 127,
    data1: 71,
    data2: 127,
    key: 'noteon:1:71',
    bytes: [0x90, 71, 127],
  }), state);

  const shiftedCue = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 4,
    code: 72,
    value: 127,
    data1: 72,
    data2: 127,
    key: 'noteon:4:72',
    bytes: [0x93, 72, 127],
  }), state);

  const shiftedSync = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 3,
    code: 93,
    value: 127,
    data1: 93,
    data2: 127,
    key: 'noteon:3:93',
    bytes: [0x92, 93, 127],
  }), state);

  const shiftedMaster = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 2,
    code: 96,
    value: 127,
    data1: 96,
    data2: 127,
    key: 'noteon:2:96',
    bytes: [0x91, 96, 127],
  }), state);

  assert.equal(shiftedPlay.semantic.family, 'transport');
  assert.equal(shiftedPlay.semantic.action, 'press');
  assert.equal(shiftedPlay.semantic.meaning, 'transport_play_shifted');
  assert.equal(shiftedPlay.semantic.truthStatus, 'official');
  assert.equal(shiftedPlay.render.targetId, 'play_L');
  assert.equal(shiftedPlay.debug.binding.id, 'deck.left.transport.play.main.shifted.press');
  assert.equal(shiftedPlay.debug.binding.context.shifted, true);

  assert.equal(shiftedCue.semantic.family, 'transport');
  assert.equal(shiftedCue.semantic.meaning, 'transport_cue_shifted');
  assert.equal(shiftedCue.render.targetId, 'cue_R');
  assert.equal(shiftedCue.debug.binding.id, 'deck.right.transport.cue.alternate.shifted.press');

  assert.equal(shiftedSync.semantic.family, 'transport');
  assert.equal(shiftedSync.semantic.meaning, 'transport_sync_shifted');
  assert.equal(shiftedSync.render.targetId, 'beatsync_L');
  assert.equal(shiftedSync.debug.binding.id, 'deck.left.transport.sync.alternate.shifted.press');

  assert.equal(shiftedMaster.semantic.family, 'transport');
  assert.equal(shiftedMaster.semantic.meaning, 'transport_master_shifted');
  assert.equal(shiftedMaster.render.targetId, 'master_R');
  assert.equal(shiftedMaster.debug.binding.id, 'deck.right.transport.master.main.shifted.press');
  assert.equal(shiftedMaster.debug.binding.context.shifted, true);
});

test('resolveFlx6InputEvent exposes Beat FX channel select as official unit truth on the board path', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const raw = createFlx6RawInput({
    interaction: 'noteon',
    channel: 5,
    code: 29,
    value: 127,
    data1: 29,
    data2: 127,
    key: 'noteon:5:29',
    bytes: [0x94, 29, 127],
  });

  const resolved = resolveFromRaw(raw, state);

  assert.equal(resolved.semantic.family, 'beat-fx');
  assert.equal(resolved.semantic.meaning, 'beat_fx_channel_select_ch2');
  assert.equal(resolved.semantic.truthStatus, 'official');
  assert.equal(resolved.render.targetId, 'beatfx_x5F_channel_x5F_select');
  assert.equal(state.beatFx.unit1.selectedChannel, 'ch2');
  assert.equal(resolved.debug.truthFocus.beatFx.unit, 1);
  assert.equal(resolved.debug.truthFocus.beatFx.selectedChannel.after.status, 'official');
  assert.equal(resolved.debug.truthFocus.beatFx.selectedChannel.after.value, 'ch2');
  assert.match(resolved.debug.truthSummary, /beatfx:u1 slot=unknown ch=official/);
});

test('resolveFlx6InputEvent carries Beat FX level depth and on/off truth through semantic and debug payloads', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  setBeatFxState(state, {
    unit: 1,
    selectedSlot: 2,
    enabled: false,
    status: 'official',
    timestamp: 200,
  });

  resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 5,
    code: 4,
    value: 10,
    data1: 4,
    data2: 10,
    key: 'cc:5:4',
    bytes: [0xB4, 4, 10],
    timestamp: 201,
  }), state);

  const levelDepth = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 5,
    code: 36,
    value: 64,
    data1: 36,
    data2: 64,
    key: 'cc:5:36',
    bytes: [0xB4, 36, 64],
    timestamp: 202,
  }), state);

  assert.equal(levelDepth.semantic.family, 'beat-fx');
  assert.equal(levelDepth.semantic.meaning, 'beat_fx_level_depth_slot_2');
  assert.equal(levelDepth.semantic.truthStatus, 'official');
  assert.equal(levelDepth.render.targetId, 'beatfx_x5F_levels_x5F_knob');
  assert.equal(state.beatFx.unit1.levelDepth, 10.5);
  assert.equal(levelDepth.debug.truthFocus.beatFx.levelDepth.after.status, 'official');
  assert.equal(levelDepth.debug.truthFocus.beatFx.levelDepth.after.value, 10.5);

  const onOff = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 5,
    code: 72,
    value: 127,
    data1: 72,
    data2: 127,
    key: 'noteon:5:72',
    bytes: [0x94, 72, 127],
    timestamp: 203,
  }), state);

  assert.equal(onOff.semantic.family, 'beat-fx');
  assert.equal(onOff.semantic.meaning, 'beat_fx_on_off_slot_2');
  assert.equal(onOff.semantic.truthStatus, 'inferred');
  assert.equal(onOff.render.targetId, 'effects_x5F_on_x5F_off_x5F_button');
  assert.equal(onOff.debug.truthFocus.beatFx.enabled.after.status, 'inferred');
  assert.equal(onOff.debug.truthFocus.beatFx.enabled.after.value, true);
  assert.match(onOff.debug.truthSummary, /beatfx:u1 .*on=inferred/);
});
