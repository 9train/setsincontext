import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getProfileRenderKind,
  resolveProfileEditorTarget,
  resolveProfileRenderTarget,
} from '../src/controllers/core/ui.js';
import flx6InputMappings from '../src/controllers/profiles/ddj-flx6.mappings.js';

test('profile-owned render targets resolve canonical board surfaces', () => {
  assert.equal(resolveProfileRenderTarget('mixer.crossfader'), 'xfader_slider');
  assert.equal(resolveProfileRenderTarget('deck.right.jog.touch'), 'jog_R');
  assert.equal(resolveProfileRenderTarget('deck.left.jog.cutter'), 'jogcut_L');
  assert.equal(resolveProfileRenderTarget('deck.right.jog.cutter'), 'jogcut_R');
  assert.equal(resolveProfileRenderTarget('deck.left.jog.vinyl_mode'), 'jogcut_L');
  assert.equal(resolveProfileRenderTarget('deck.right.jog.vinyl_mode'), 'jogcut_R');
  assert.equal(resolveProfileRenderTarget('deck.left.state.normal'), 'deck_layer_main_L');
  assert.equal(resolveProfileRenderTarget('deck.left.state.jog_cutter'), 'deck_layer_alt_L');
  assert.equal(resolveProfileRenderTarget('deck.left.state.vinyl'), 'vinyl_L');
  assert.equal(resolveProfileRenderTarget('deck.right.state.normal'), 'deck_layer_main_R');
  assert.equal(resolveProfileRenderTarget('deck.right.state.jog_cutter'), 'deck_layer_alt_R');
  assert.equal(resolveProfileRenderTarget('deck.right.state.vinyl'), 'vinyl_R');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.transport.play.main.press'), 'play_L');
  assert.equal(resolveProfileRenderTarget('mixer.channel.1.gain'), 'trim_1');
  assert.equal(resolveProfileRenderTarget('mixer.channel.1.cue'), 'headphone_cue_1');
  assert.equal(resolveProfileRenderTarget('mixer.channel.4.input_select'), 'channel_4');
  assert.equal(resolveProfileRenderTarget('beatfx.select'), 'beatfx_x5F_select');
  assert.equal(resolveProfileRenderTarget('beatfx.channel_select'), 'beatfx_x5F_channel_x5F_select');
  assert.equal(resolveProfileRenderTarget('beatfx.beat.left'), 'beatfx_x5F_down');
  assert.equal(resolveProfileRenderTarget('beatfx.level_depth'), 'beatfx_x5F_levels_x5F_knob');
  assert.equal(resolveProfileRenderTarget('beatfx.on_off'), 'effects_x5F_on_x5F_off_x5F_button');
  assert.equal(resolveProfileRenderTarget('deck.left.loop.in'), 'loop_in_L');
  assert.equal(resolveProfileRenderTarget('deck.right.loop.in'), 'loop_in_R');
  assert.equal(resolveProfileRenderTarget('deck.left.transport.sync'), 'beatsync_L');
  assert.equal(resolveProfileRenderTarget('deck.right.transport.master'), 'master_R');
  assert.equal(resolveProfileRenderTarget('deck.left.pad_mode.keyboard'), 'hotcue_L');
  assert.equal(resolveProfileRenderTarget('deck.right.pad_mode.sample_scratch'), 'sampler_R');
  assert.equal(resolveProfileRenderTarget('deck.right.transport.layer'), 'decks_R');
  assert.equal(resolveProfileRenderTarget('deck.left.fx.quick_select'), 'merge_button_L');
  assert.equal(resolveProfileRenderTarget('deck.left.loop.call.backward'), 'select_loop_call_LL');
  assert.equal(resolveProfileRenderTarget('deck.right.loop.memory'), 'loop_memory_R');
  assert.equal(resolveProfileRenderTarget('deck.left.pad_mode.hotcue'), 'hotcue_L');
  assert.equal(resolveProfileRenderTarget('deck.right.pad.8'), 'pad_R_8');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.transport.load.alternate.press'), 'load_3');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.transport.load.main.shifted.press'), 'load_1');
  assert.equal(resolveProfileRenderTarget('', 'deck.right.transport.load.alternate.shifted.release'), 'load_4');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.transport.sync.main.shifted.press'), 'beatsync_L');
  assert.equal(resolveProfileRenderTarget('', 'deck.right.transport.master.alternate.shifted.release'), 'master_R');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.pad_mode.keyboard.main.shifted.press'), 'hotcue_L');
  assert.equal(resolveProfileRenderTarget('', 'deck.left.pad.1.alternate.sampler.press'), 'pad_L_1');
});

test('profile-owned editor targets isolate FLX6 surface aliases', () => {
  const crossfader = resolveProfileEditorTarget('crossfader');
  assert.equal(crossfader.targetId, 'xfader_slider');
  assert.equal(crossfader.canonicalTarget, 'mixer.crossfader');
  assert.equal(crossfader.renderKind, 'xfader');

  const hotcueMode = resolveProfileEditorTarget('mode_HOTCUE_L');
  assert.equal(hotcueMode.targetId, 'hotcue_L');
  assert.equal(hotcueMode.canonicalTarget, 'deck.left.pad_mode.hotcue');
  assert.equal(hotcueMode.renderKind, 'pad-mode');

  const keyboardMode = resolveProfileEditorTarget('deck.left.pad_mode.keyboard');
  assert.equal(keyboardMode.targetId, 'hotcue_L');
  assert.equal(keyboardMode.canonicalTarget, 'deck.left.pad_mode.keyboard');
  assert.equal(keyboardMode.renderKind, 'pad-mode');

  const channel4Selector = resolveProfileEditorTarget('input_select_ch4');
  assert.equal(channel4Selector.targetId, 'channel_4');
  assert.equal(channel4Selector.canonicalTarget, 'mixer.channel.4.input_select');
  assert.equal(channel4Selector.renderKind, 'button');

  const masterButton = resolveProfileEditorTarget('master_L');
  assert.equal(masterButton.targetId, 'master_L');
  assert.equal(masterButton.canonicalTarget, 'deck.left.transport.master');
  assert.equal(masterButton.renderKind, 'button');

  const beatFxSelect = resolveProfileEditorTarget('beatfx_select');
  assert.equal(beatFxSelect.targetId, 'beatfx_x5F_select');
  assert.equal(beatFxSelect.canonicalTarget, 'beatfx.select');
  assert.equal(beatFxSelect.renderKind, 'button');

  const beatFxOnOff = resolveProfileEditorTarget('effects_on_off_button');
  assert.equal(beatFxOnOff.targetId, 'effects_x5F_on_x5F_off_x5F_button');
  assert.equal(beatFxOnOff.canonicalTarget, 'beatfx.on_off');
  assert.equal(beatFxOnOff.renderKind, 'button');

  const escapedPad = resolveProfileEditorTarget('pad_x5F_L_x5F_1');
  assert.equal(escapedPad.targetId, 'pad_L_1');
  assert.equal(escapedPad.canonicalTarget, 'deck.left.pad.1');
  assert.equal(escapedPad.renderKind, 'pad');
});

test('profile-owned editor targets expose persistent FLX6 deck-state indicators', () => {
  const expectedTargets = [
    ['deck_layer_main_L', 'deck.left.state.normal', 'Left Normal State'],
    ['deck_layer_alt_L', 'deck.left.state.jog_cutter', 'Left Jog Cutter State'],
    ['vinyl_L', 'deck.left.state.vinyl', 'Left Vinyl State'],
    ['deck_layer_main_R', 'deck.right.state.normal', 'Right Normal State'],
    ['deck_layer_alt_R', 'deck.right.state.jog_cutter', 'Right Jog Cutter State'],
    ['vinyl_R', 'deck.right.state.vinyl', 'Right Vinyl State'],
  ];

  for (const [targetId, canonicalTarget, label] of expectedTargets) {
    const editorTarget = resolveProfileEditorTarget(targetId);
    assert.equal(editorTarget.owner, 'profile');
    assert.equal(editorTarget.targetId, targetId);
    assert.equal(editorTarget.canonicalTarget, canonicalTarget);
    assert.equal(editorTarget.label, label);
    assert.equal(editorTarget.renderKind, 'deck-state');

    const canonicalEditorTarget = resolveProfileEditorTarget(canonicalTarget);
    assert.equal(canonicalEditorTarget.owner, 'profile');
    assert.equal(canonicalEditorTarget.targetId, targetId);
    assert.equal(canonicalEditorTarget.canonicalTarget, canonicalTarget);
  }
});

test('persistent FLX6 deck-state targets stay distinct from physical layer and jog cutter buttons', () => {
  assert.equal(resolveProfileRenderTarget('deck.left.transport.layer'), 'decks_L');
  assert.equal(resolveProfileRenderTarget('deck.right.transport.layer'), 'decks_R');
  assert.equal(resolveProfileRenderTarget('deck.left.jog.cutter'), 'jogcut_L');
  assert.equal(resolveProfileRenderTarget('deck.right.jog.cutter'), 'jogcut_R');

  assert.equal(resolveProfileEditorTarget('decks_L').canonicalTarget, 'deck.left.transport.layer');
  assert.equal(resolveProfileEditorTarget('decks_R').canonicalTarget, 'deck.right.transport.layer');
  assert.equal(resolveProfileEditorTarget('jogcut_L').canonicalTarget, 'deck.left.jog.cutter');
  assert.equal(resolveProfileEditorTarget('jogcut_R').canonicalTarget, 'deck.right.jog.cutter');

  assert.equal(resolveProfileRenderTarget('deck.left.state.normal'), 'deck_layer_main_L');
  assert.equal(resolveProfileRenderTarget('deck.right.state.normal'), 'deck_layer_main_R');
  assert.equal(resolveProfileRenderTarget('deck.left.state.jog_cutter'), 'deck_layer_alt_L');
  assert.equal(resolveProfileRenderTarget('deck.right.state.jog_cutter'), 'deck_layer_alt_R');
  assert.equal(resolveProfileRenderTarget('deck.left.state.vinyl'), 'vinyl_L');
  assert.equal(resolveProfileRenderTarget('deck.right.state.vinyl'), 'vinyl_R');
});

test('persistent FLX6 vinyl-state targets do not hide shifted jogcut vinyl-mode controls', () => {
  assert.equal(resolveProfileRenderTarget('deck.left.state.vinyl'), 'vinyl_L');
  assert.equal(resolveProfileRenderTarget('deck.right.state.vinyl'), 'vinyl_R');

  assert.equal(resolveProfileRenderTarget('deck.left.jog.vinyl_mode'), 'jogcut_L');
  assert.equal(resolveProfileRenderTarget('deck.right.jog.vinyl_mode'), 'jogcut_R');
  assert.notEqual(resolveProfileRenderTarget('deck.left.state.vinyl'), resolveProfileRenderTarget('deck.left.jog.vinyl_mode'));
  assert.notEqual(resolveProfileRenderTarget('deck.right.state.vinyl'), resolveProfileRenderTarget('deck.right.jog.vinyl_mode'));
});

test('official FLX6 pad-mode render targets remain profile-owned across both decks', () => {
  for (const side of ['left', 'right']) {
    const suffix = side === 'left' ? 'L' : 'R';
    assert.equal(resolveProfileRenderTarget(`deck.${side}.pad_mode.hotcue`), `hotcue_${suffix}`);
    assert.equal(resolveProfileRenderTarget(`deck.${side}.pad_mode.fx`), `padfx_${suffix}`);
    assert.equal(resolveProfileRenderTarget(`deck.${side}.pad_mode.beatjump`), `beatjump_${suffix}`);
    assert.equal(resolveProfileRenderTarget(`deck.${side}.pad_mode.sampler`), `sampler_${suffix}`);

    for (const targetId of [`hotcue_${suffix}`, `padfx_${suffix}`, `beatjump_${suffix}`, `sampler_${suffix}`]) {
      assert.equal(resolveProfileEditorTarget(targetId).owner, 'profile');
    }
  }
});

test('profile-owned editor targets keep transitional surface-only fallbacks', () => {
  const loadButton = resolveProfileEditorTarget('load_1');
  assert.equal(loadButton.targetId, 'load_1');
  assert.equal(loadButton.canonicalTarget, 'deck.left.transport.load');

  const rightLoopIn = resolveProfileEditorTarget('loop_in_R');
  assert.equal(rightLoopIn.targetId, 'loop_in_R');
  assert.equal(rightLoopIn.canonicalTarget, 'deck.right.loop.in');

  const loopMemory = resolveProfileEditorTarget('loop_x5F_memory_x5F_L');
  assert.equal(loopMemory.targetId, 'loop_memory_L');
  assert.equal(loopMemory.canonicalTarget, 'deck.left.loop.memory');

  const mergeButton = resolveProfileEditorTarget('merge_x5F_button_x5F_R');
  assert.equal(mergeButton.targetId, 'merge_button_R');
  assert.equal(mergeButton.canonicalTarget, 'deck.right.fx.quick_select');
});

test('render kinds come from profile-owned UI metadata before regex fallbacks', () => {
  assert.equal(getProfileRenderKind('slider_ch1'), 'fader');
  assert.equal(getProfileRenderKind('headphone_cue_1'), 'button');
  assert.equal(getProfileRenderKind('trim_1'), 'knob');
  assert.equal(getProfileRenderKind('jog_L_touch'), 'jog');
});

test('profile-owned render targets resolve shift, reloop/exit, and browser controls', () => {
  assert.equal(resolveProfileRenderTarget('deck.left.transport.shift'), 'shift_L');
  assert.equal(resolveProfileRenderTarget('deck.right.transport.shift'), 'shift_R');
  assert.equal(resolveProfileRenderTarget('deck.left.loop.reloop_exit'), 'reloop_exit_L');
  assert.equal(resolveProfileRenderTarget('deck.right.loop.reloop_exit'), 'reloop_exit_R');
  assert.equal(resolveProfileRenderTarget('browser.scroll'), 'browser_scroll');
  assert.equal(resolveProfileRenderTarget('browser.push'), 'browser_push');
  assert.equal(resolveProfileRenderTarget('browser.back'), 'browser_back');
  assert.equal(resolveProfileRenderTarget('browser.view'), 'browser_view');
});

test('all official FLX6 input mappings with canonical meaning resolve to an official render target', () => {
  const missing = [];
  const seen = new Set();
  for (const binding of flx6InputMappings) {
    if (!binding.canonical) continue;
    if (seen.has(binding.canonical)) continue;
    seen.add(binding.canonical);
    if (!resolveProfileRenderTarget(binding.canonical)) {
      missing.push(binding.canonical);
    }
  }
  assert.deepEqual(missing, [], `Missing official render targets for: ${missing.join(', ')}`);
});
