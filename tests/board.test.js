// tests/board.test.js (ESM)
// Uses Node's built-in test runner. Run with: node --test tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeRelative7,
  getContinuousRenderValue,
  getLinearControlPosition,
  getLinearControlRatio,
  resolveCanonicalRenderTargetId,
  resolveInfoRenderTarget,
  resolveRenderTargetId,
} from '../src/board.js';

test('inputs 0 and 64 return 0', () => {
  assert.strictEqual(decodeRelative7(0), 0);
  assert.strictEqual(decodeRelative7(64), 0);
});

test('inputs 1..63 produce positive steps', () => {
  for (let v = 1; v <= 63; v++) {
    assert.ok(decodeRelative7(v) > 0, `expected > 0 for v=${v}`);
  }
});

test('inputs 65..127 produce negative steps', () => {
  assert.strictEqual(decodeRelative7(65), -63);
  for (let v = 65; v <= 127; v++) {
    assert.ok(decodeRelative7(v) < 0, `expected < 0 for v=${v}`);
  }
});

test('render target aliases point crossfader and jog touch mappings at the visible element', () => {
  assert.strictEqual(resolveRenderTargetId('xfader'), 'xfader_slider');
  assert.strictEqual(resolveRenderTargetId('crossfader'), 'xfader_slider');
  assert.strictEqual(resolveRenderTargetId('jog_L_touch'), 'jog_L');
  assert.strictEqual(resolveRenderTargetId('slider_TEMPO_L'), 'slider_TEMPO_L');
});

test('canonical control targets resolve directly to board render targets', () => {
  assert.strictEqual(resolveCanonicalRenderTargetId('mixer.crossfader'), 'xfader_slider');
  assert.strictEqual(resolveCanonicalRenderTargetId('mixer.channel.1.fader'), 'slider_ch1');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.tempo.fader'), 'slider_TEMPO_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.jog.touch'), 'jog_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.transport.play'), 'play_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.transport.cue'), 'cue_R');
});

test('mapping ids can resolve prioritized canonical board targets during transition', () => {
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.left.transport.play.main.press'),
    'play_L',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.right.jog.motion.secondary'),
    'jog_R',
  );
});

test('board target resolution prefers canonical controller meaning before raw map lookup', () => {
  const rawMap = [{ key: 'cc:9:99', target: 'slider_ch4' }];
  const info = {
    canonicalTarget: 'mixer.channel.1.fader',
    mappingId: 'mixer.channel.1.fader.primary',
    type: 'cc',
    ch: 9,
    controller: 99,
    value: 64,
  };

  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), 'slider_ch1');
});

test('board target resolution still falls back to raw map entries when canonical fields are absent', () => {
  const rawMap = [{ key: 'noteon:1:11', target: 'play_L' }];
  const info = { type: 'noteon', ch: 1, d1: 11, d2: 127, value: 127 };

  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), 'play_L');
});

test('tempo fader coarse CC keeps its existing slider position semantics', () => {
  const state = Object.create(null);
  const entry = { target: 'slider_TEMPO_L' };

  assert.strictEqual(
    getContinuousRenderValue(entry, { controller: 0, value: 64, ch: 1 }, state),
    64,
  );
});

test('tempo fader fine CC refines a known coarse value without clobbering it', () => {
  const state = Object.create(null);
  const entry = { target: 'slider_TEMPO_L' };

  assert.strictEqual(
    getContinuousRenderValue(entry, { controller: 0, value: 64, ch: 1 }, state),
    64,
  );
  assert.strictEqual(
    getContinuousRenderValue(entry, { controller: 32, value: 64, ch: 1 }, state),
    64.5,
  );
});

test('tempo fader fine CC alone does not move the slider before a coarse value arrives', () => {
  const state = Object.create(null);
  const entry = { target: 'slider_TEMPO_L' };

  assert.strictEqual(
    getContinuousRenderValue(entry, { controller: 32, value: 96, ch: 1 }, state),
    null,
  );
  assert.strictEqual(
    getContinuousRenderValue(entry, { controller: 0, value: 10, ch: 1 }, state),
    10.75,
  );
});

test('linear control ratio preserves endpoints and snaps the common center detent', () => {
  assert.strictEqual(getLinearControlRatio(0), 0);
  assert.strictEqual(getLinearControlRatio(64), 0.5);
  assert.strictEqual(getLinearControlRatio(127), 1);
});

test('linear control position clamps out-of-range values for crossfader rendering', () => {
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: -20 }),
    10,
  );
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: 127 }),
    110,
  );
});

test('crossfader center value renders at the exact midpoint', () => {
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: 64 }),
    60,
  );
});

test('tempo fader uses the same midpoint logic with inverted slider travel', () => {
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: 0, invert: true }),
    110,
  );
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: 64, invert: true }),
    60,
  );
  assert.strictEqual(
    getLinearControlPosition({ min: 10, max: 110, value: 127, invert: true }),
    10,
  );
});
