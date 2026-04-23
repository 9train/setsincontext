import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJogCalibrationPreview,
  getJogCalibrationEntry,
  installJogRuntime,
  resolveJogCalibrationProfileKey,
} from '../src/jog-runtime.js';
import { installMockBrowser } from './browser-test-helpers.js';

function parseAngle(transform) {
  const m = /rotate\(([-0-9.]+)deg\)/.exec(String(transform || ''));
  return m ? Number(m[1]) : null;
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to equal ${expected}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, overrides) {
  if (overrides == null) return clone(base);
  if (typeof overrides !== 'object' || Array.isArray(overrides)) return overrides;
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const out = { ...source };
  Object.entries(overrides).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = merge(source[key], value);
      return;
    }
    out[key] = value;
  });
  return out;
}

function createJogFeelConfig(overrides = {}) {
  return merge({
    device: 'Pioneer DDJ-FLX6',
    controls: {
      jog: {
        type: 'jog',
        deltaCodec: 'relative7',
        defaultLane: 'wheel_side',
        lanes: {
          wheel_side: { directScale: 0.11, velocityScale: 0.04, damping: 0.5, maxVel: 0.4, motionMode: 'nudge' },
          wheel_side_shifted: { directScale: 0.22, velocityScale: 0.01, damping: 0.5, maxVel: 0.4, motionMode: 'nudge' },
          platter_vinyl_on: { directScale: 0.33, velocityScale: 0.05, damping: 0.6, maxVel: 0.5, motionMode: 'vinyl_platter' },
          platter_vinyl_off: { directScale: 0.44, velocityScale: 0.12, damping: 0.78, maxVel: 0.5, motionMode: 'spin' },
          platter_shifted: { directScale: 0.55, velocityScale: 0.03, damping: 0.6, maxVel: 0.5, motionMode: 'vinyl_platter' },
          scratch: { directScale: 0.77, velocityScale: 0.01, damping: 0.3, maxVel: 0.2, motionMode: 'scratch' },
          scratch_shifted: { directScale: 0.88, velocityScale: 0.01, damping: 0.3, maxVel: 0.2, motionMode: 'scratch' },
          jog_cutter: { directScale: 0.99, velocityScale: 0.01, damping: 0.25, maxVel: 0.2, motionMode: 'jog_cutter' },
        },
      },
    },
  }, overrides);
}

function createMotionEvent({
  side = 'left',
  controller = 33,
  value = 65,
  mappingId = `deck.${side}.jog.motion.primary`,
  context = { deckLayer: 'main' },
  timestamp = 1000,
  controllerState,
} = {}) {
  const ch = side === 'left' ? 1 : 2;
  return {
    eventType: 'normalized_input',
    canonicalTarget: `deck.${side}.jog.motion`,
    mappingId,
    interaction: 'cc',
    type: 'cc',
    ch,
    controller,
    d1: controller,
    d2: value,
    value,
    context,
    timestamp,
    ...(controllerState ? { controllerState } : {}),
  };
}

function encodeRelative7Delta(delta) {
  const numeric = Number(delta);
  if (!Number.isInteger(numeric) || numeric < -63 || numeric > 63) {
    throw new RangeError(`relative7 delta out of range: ${delta}`);
  }
  if (numeric === 0) return 64;
  return 64 + numeric;
}

function createRelativeMotionEvent({ delta = 1, ...options } = {}) {
  return createMotionEvent({
    ...options,
    value: encodeRelative7Delta(delta),
  });
}

function createTouchEvent({
  side = 'left',
  shifted = false,
  active = true,
  timestamp = 1000,
  controllerState,
} = {}) {
  const ch = side === 'left' ? 1 : 2;
  const note = shifted ? 103 : 54;
  const interaction = active ? 'noteon' : 'noteoff';
  return {
    eventType: 'normalized_input',
    canonicalTarget: `deck.${side}.jog.touch`,
    mappingId: `deck.${side}.jog.touch${shifted ? '.shifted' : ''}.${active ? 'press' : 'release'}`,
    interaction,
    type: interaction,
    ch,
    d1: note,
    d2: active ? 127 : 0,
    value: active ? 127 : 0,
    context: shifted ? { deckLayer: 'main', shifted: true } : { deckLayer: 'main' },
    timestamp,
    ...(controllerState ? { controllerState } : {}),
  };
}

function createAuthoritativeJogVisual(overrides = {}) {
  return merge({
    side: 'L',
    angle: 1.23,
    vel: 0,
    damping: 0.5,
    lane: 'wheel_side',
    motionMode: 'nudge',
    touchActive: false,
    touchLane: null,
    authoredAt: 1000,
    frameMs: 16,
  }, overrides);
}

function setSavedJogCalibration(env, preferences) {
  env.localStorage.setItem('flx.jogCalibration.v1', JSON.stringify(preferences));
}

test('absolute mode maps 0..127 to 0..360 on the matched jog side', () => {
  const env = installMockBrowser({ elementIds: ['jog_L', 'jog_R'] });
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('absolute');

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 0 });
    assert.equal(env.elements.jog_L.style.transform, 'rotate(0deg)');

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 127 });
    assert.equal(env.elements.jog_L.style.transform, 'rotate(360deg)');
    assert.equal(env.elements.jog_R.style.transform, undefined);
  } finally {
    env.restore();
  }
});

test('touch events visibly toggle the jog touch state without rotating the platter', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  installJogRuntime({ getUnifiedMap: () => [] });

  try {
    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true }));

    assert.equal(parseAngle(env.elements.jog_L.style.transform), null);
    assert.equal(env.elements.jog_L.dataset.jogTouchActive, 'true');
    assert.equal(env.elements.jog_L.dataset.jogLane, 'touch');
    assert.equal(env.elements.jog_L.dataset.jogScratchActive, 'false');
    assert.ok(env.elements.jog_L.classList.contains('jog-touch-active'));
    assert.equal(env.elements.jog_L.style.filter, 'brightness(1.12)');

    env.window.consumeInfo(createTouchEvent({ side: 'left', active: false, timestamp: 1001 }));

    assert.equal(env.elements.jog_L.dataset.jogTouchActive, 'false');
    assert.equal(env.elements.jog_L.dataset.jogLane, 'idle');
    assert.equal(env.elements.jog_L.style.filter, undefined);
    assert.equal(env.elements.jog_L.classList.contains('jog-touch-active'), false);
  } finally {
    env.restore();
  }
});

test('lane-level FEEL config becomes the primary jog tuning source', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    const info = createMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
    });
    env.window.consumeInfo(info);

    assert.equal(parseAngle(env.elements.jog_L.style.transform), null);
    assert.deepEqual(jog.getJogLaneProfile('wheel_side'), {
      directScale: 0.11,
      velocityScale: 0.04,
      damping: 0.5,
      maxVel: 0.4,
      motionMode: 'nudge',
    });
    assert.deepEqual(info.render.jogVisual, {
      side: 'L',
      angle: 0.11,
      vel: 0.04,
      damping: 0.5,
      lane: 'wheel_side',
      motionMode: 'nudge',
      touchActive: false,
      touchLane: null,
      authoredAt: 1000,
      frameMs: 16,
    });

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.11);
  } finally {
    env.restore();
  }
});

test('lane-level jog tuning accepts degreesPerCount and maxVelocity aliases', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = {
    FEEL_CFG: {
      device: 'Pioneer DDJ-FLX6',
      controls: {
        jog: {
          type: 'jog',
          deltaCodec: 'relative7',
          defaultLane: 'wheel_side',
          lanes: {
            wheel_side: {
              degreesPerCount: 0.21,
              velocityScale: 0.03,
              damping: 0.45,
              maxVelocity: 0.31,
              motionMode: 'nudge',
            },
          },
        },
      },
    },
  };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    const info = createMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
    });
    env.window.consumeInfo(info);

    assert.deepEqual(jog.getJogLaneProfile('wheel_side'), {
      directScale: 0.21,
      velocityScale: 0.03,
      damping: 0.45,
      maxVel: 0.31,
      motionMode: 'nudge',
    });
    assert.equal(info.render.jogVisual.angle, 0.21);
    assert.equal(info.render.jogVisual.vel, 0.03);
    assert.equal(info.render.jogVisual.damping, 0.45);

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.21);
  } finally {
    env.restore();
  }
});

test('generic controls.jog config still works as a backward-compatible fallback', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = {
    FEEL_CFG: {
      controls: {
        jog: {
          type: 'jog',
          deltaCodec: 'relative7',
          defaultLane: 'wheel_side',
          directScale: 0.2,
          velocityScale: 0.05,
          damping: 0.4,
          maxVel: 0.3,
          motionMode: 'nudge',
        },
      },
    },
  };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    const info = createMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
    });
    env.window.consumeInfo(info);

    assert.equal(info.render.jogVisual.angle, 0.2);
    assert.equal(info.render.jogVisual.vel, 0.05);
    assert.equal(info.render.jogVisual.damping, 0.4);

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.2);
  } finally {
    env.restore();
  }
});

test('touch-active platter motion selects the configured scratch profile instead of wheel-side nudge', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L', 'jog_R'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    const nudge = createMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
    });
    env.window.consumeInfo(nudge);
    await env.runAnimationFrames(1);
    const nudgeAngle = parseAngle(env.elements.jog_L.style.transform);

    env.window.consumeInfo(createTouchEvent({ side: 'right', active: true }));
    const scratch = createMotionEvent({
      side: 'right',
      controller: 34,
      mappingId: 'deck.right.jog.motion.secondary',
      controllerState: {
        jogTouch: { right: true },
        jogLane: { right: 'platter_vinyl_on' },
      },
    });
    env.window.consumeInfo(scratch);
    await env.runAnimationFrames(1);

    const scratchAngle = parseAngle(env.elements.jog_R.style.transform);
    assert.ok(scratchAngle > nudgeAngle);
    assert.equal(scratch.render.jogVisual.lane, 'scratch');
    assert.equal(scratch.render.jogVisual.motionMode, 'scratch');
    assert.equal(env.elements.jog_R.dataset.jogLane, 'scratch');
    assert.equal(env.elements.jog_R.dataset.jogScratchActive, 'true');
  } finally {
    env.restore();
  }
});

test('touch-active motion can select the configured jog_cutter profile when controller truth knows cutter is enabled', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  installJogRuntime({ getUnifiedMap: () => [] }).setMode('tape');

  try {
    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true }));

    const info = createMotionEvent({
      side: 'left',
      controller: 34,
      mappingId: 'deck.left.jog.motion.secondary',
      controllerState: {
        jogTouch: { left: true },
        jogCutter: { left: true },
        jogLane: { left: 'platter_vinyl_on' },
      },
    });
    env.window.consumeInfo(info);
    await env.runAnimationFrames(1);

    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.99);
    assert.equal(info.render.jogVisual.lane, 'jog_cutter');
    assert.equal(info.render.jogVisual.motionMode, 'jog_cutter');
    assert.equal(env.elements.jog_L.dataset.jogLane, 'jog_cutter');
    assert.equal(env.elements.jog_L.dataset.jogScratchActive, 'true');
  } finally {
    env.restore();
  }
});

test('shifted wheel-side and platter-touch motion use their shifted lane profiles', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L', 'jog_R'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  installJogRuntime({ getUnifiedMap: () => [] }).setMode('tape');

  try {
    const shiftedWheel = createMotionEvent({
      side: 'left',
      controller: 38,
      mappingId: 'deck.left.jog.motion.shifted.primary',
      context: { deckLayer: 'main', shifted: true },
    });
    env.window.consumeInfo(shiftedWheel);
    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.22);
    assert.equal(shiftedWheel.render.jogVisual.lane, 'wheel_side_shifted');

    env.window.consumeInfo(createTouchEvent({ side: 'right', shifted: true, active: true }));
    const shiftedScratch = createMotionEvent({
      side: 'right',
      controller: 41,
      mappingId: 'deck.right.jog.motion.shifted.secondary',
      context: { deckLayer: 'main', shifted: true },
      controllerState: {
        jogTouch: { right: true },
        jogLane: { right: 'platter_shifted' },
      },
    });
    env.window.consumeInfo(shiftedScratch);
    await env.runAnimationFrames(1);

    assertClose(parseAngle(env.elements.jog_R.style.transform), 0.88);
    assert.equal(shiftedScratch.render.jogVisual.lane, 'scratch_shifted');
    assert.equal(shiftedScratch.render.jogVisual.motionMode, 'scratch');
  } finally {
    env.restore();
  }
});

test('multiple fast jog events before one animation frame preserve total delta instead of dropping motion', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = {
    FEEL_CFG: createJogFeelConfig({
      controls: {
        jog: {
          lanes: {
            wheel_side: {
              directScale: 0.2,
              velocityScale: 0,
              damping: 0.5,
              maxVel: 0.1,
              motionMode: 'nudge',
            },
          },
        },
      },
    }),
  };
  installJogRuntime({ getUnifiedMap: () => [] }).setMode('tape');

  try {
    let lastInfo = null;
    for (let index = 0; index < 20; index += 1) {
      lastInfo = createMotionEvent({
        side: 'left',
        controller: 33,
        mappingId: 'deck.left.jog.motion.primary',
        timestamp: 1000 + index,
      });
      env.window.consumeInfo(lastInfo);
    }

    assert.equal(parseAngle(env.elements.jog_L.style.transform), null);
    assert.equal(lastInfo.render.jogVisual.angle, 4);

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 4);
  } finally {
    env.restore();
  }
});

test('calibration summary no longer just echoes the current directScale', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L');

    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: 5, timestamp: 1000 }));
    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: 5, timestamp: 1001 }));

    const summary = jog.stopCalibration();
    const laneSummary = summary.lanes[0];

    assert.equal(summary.side, 'L');
    assert.equal(summary.totalEventCount, 2);
    assert.equal(summary.totalDeltaCount, 10);
    assert.deepEqual(laneSummary, {
      side: 'L',
      lane: 'wheel_side',
      mode: 'normal',
      surface: 'side',
      eventCount: 2,
      totalDelta: 10,
      totalAbsDelta: 10,
      currentDirectScale: 0.11,
      visualDegreesMoved: 1.1,
      suggestedDegreesPerCountFromSigned: 36,
      suggestedDegreesPerCountFromAbs: 36,
      suggestedDegreesPerCount: 36,
      suggestedDirectScale: 36,
      note: null,
    });
    assert.notEqual(laneSummary.suggestedDirectScale, laneSummary.currentDirectScale);
  } finally {
    env.restore();
  }
});

test('calibration records host-side jog motion even when the jog SVG element is missing', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L');

    const info = createRelativeMotionEvent({ side: 'left', delta: 5, timestamp: 1000 });
    env.window.consumeInfo(info);

    const summary = jog.stopCalibration();

    assert.equal(info.render, undefined);
    assert.equal(summary.pageRole, 'host');
    assert.equal(summary.totalEventCount, 1);
    assert.equal(summary.totalDeltaCount, 5);
    assert.equal(summary.touchSeen, false);
    assert.equal(summary.motionSeen, true);
    assert.equal(summary.ignoredEventCount, 0);
    assert.equal(summary.lastIgnoredReason, null);
    assert.deepEqual(summary.lastSeenJogEvent, {
      type: 'cc',
      side: 'L',
      lane: 'wheel_side',
      effectiveLane: 'wheel_side',
      delta: 5,
      authoritative: false,
      timestamp: 1000,
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.primary',
    });
    assert.deepEqual(summary.lastSeenMotionEvent, summary.lastSeenJogEvent);
    assert.equal(summary.lastSeenTouchEvent, null);
  } finally {
    env.restore();
  }
});

test('calibration summary warns clearly when no jog motion events were seen', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'], locationHref: 'http://localhost/host.html' });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    const summary = jog.startCalibration('L');
    assert.equal(summary.pageRole, 'host');

    const stopped = jog.stopCalibration();
    assert.equal(stopped.totalEventCount, 0);
    assert.equal(stopped.totalDeltaCount, 0);
    assert.equal(stopped.touchSeen, false);
    assert.equal(stopped.motionSeen, false);
    assert.equal(stopped.ignoredEventCount, 0);
    assert.equal(stopped.lastSeenJogEvent, null);
    assert.equal(stopped.lastSeenMotionEvent, null);
    assert.equal(stopped.lastSeenTouchEvent, null);
    assert.match(stopped.warning, /No jog motion events reached the runtime/i);
  } finally {
    env.restore();
  }
});

test('top touch calibration ignores touch note but remains armed', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'vinyl', surface: 'top_touch' });

    const info = createTouchEvent({ side: 'left', active: true, timestamp: 1000 });
    env.window.consumeInfo(info);

    const summary = jog.getCalibration();

    assert.equal(summary.active, true);
    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.totalDeltaCount, 0);
    assert.equal(summary.touchSeen, true);
    assert.equal(summary.motionSeen, false);
    assert.equal(summary.ignoredEventCount, 0);
    assert.equal(summary.lastIgnoredReason, null);
    assert.deepEqual(summary.lastSeenTouchEvent, {
      type: 'noteon',
      side: 'L',
      lane: 'touch',
      effectiveLane: null,
      delta: null,
      authoritative: false,
      timestamp: 1000,
      canonicalTarget: 'deck.left.jog.touch',
      mappingId: 'deck.left.jog.touch.press',
    });
    assert.deepEqual(summary.lastSeenJogEvent, summary.lastSeenTouchEvent);
    assert.equal(summary.lastSeenMotionEvent, null);
    assert.equal(info._jogRuntimeDiagnostic.eventKind, 'touch_note');
    assert.equal(info._jogRuntimeDiagnostic.lane, 'touch');
    assert.equal(info._jogRuntimeDiagnostic.calibration.action, 'waiting');
    assert.equal(info._jogRuntimeDiagnostic.calibration.selectedMode, 'vinyl');
    assert.equal(info._jogRuntimeDiagnostic.calibration.selectedSurface, 'top_touch');
    assert.equal(info._jogRuntimeDiagnostic.calibration.expectedMotion, 'platter CC 34/35/41');
    assert.match(info._jogRuntimeDiagnostic.calibration.reason, /touch note carries no motion delta/i);
  } finally {
    env.restore();
  }
});

test('top touch calibration records subsequent platter CC motion after touch', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'vinyl', surface: 'top_touch' });

    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true, timestamp: 1000 }));
    env.window.consumeInfo(createRelativeMotionEvent({
      side: 'left',
      controller: 34,
      mappingId: 'deck.left.jog.motion.secondary',
      timestamp: 1001,
    }));

    const summary = jog.stopCalibration();

    assert.equal(summary.totalEventCount, 1);
    assert.equal(summary.totalDeltaCount, 1);
    assert.equal(summary.touchSeen, true);
    assert.equal(summary.motionSeen, true);
    assert.equal(summary.warning, null);
    assert.equal(summary.lanes.length, 1);
    assert.equal(summary.lanes[0].lane, 'scratch');
    assert.equal(summary.lanes[0].mode, 'vinyl');
    assert.equal(summary.lanes[0].surface, 'top_touch');
    assert.deepEqual(summary.lastSeenMotionEvent, {
      type: 'cc',
      side: 'L',
      lane: 'platter_vinyl_on',
      effectiveLane: 'scratch',
      delta: 1,
      authoritative: false,
      timestamp: 1001,
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.secondary',
    });
    assert.deepEqual(summary.lastSeenJogEvent, summary.lastSeenMotionEvent);
    assert.deepEqual(summary.lastSeenTouchEvent, {
      type: 'noteon',
      side: 'L',
      lane: 'touch',
      effectiveLane: null,
      delta: null,
      authoritative: false,
      timestamp: 1000,
      canonicalTarget: 'deck.left.jog.touch',
      mappingId: 'deck.left.jog.touch.press',
    });
  } finally {
    env.restore();
  }
});

test('top touch calibration gives a specific warning when only touch was seen', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'normal', surface: 'top_touch' });

    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true, timestamp: 1000 }));

    const summary = jog.stopCalibration();

    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.touchSeen, true);
    assert.equal(summary.motionSeen, false);
    assert.equal(summary.ignoredEventCount, 0);
    assert.equal(summary.lastIgnoredReason, null);
    assert.equal(summary.warning, 'Top touch was detected, but no platter motion CC was received.');
  } finally {
    env.restore();
  }
});

test('top touch calibration rejects side platter CC with a specific warning', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'normal', surface: 'top_touch' });

    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true, timestamp: 1000 }));
    const info = createRelativeMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
      timestamp: 1001,
    });
    env.window.consumeInfo(info);

    const summary = jog.stopCalibration();

    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.touchSeen, true);
    assert.equal(summary.motionSeen, true);
    assert.equal(summary.ignoredEventCount, 1);
    assert.equal(
      summary.lastIgnoredReason,
      'Top-touch calibration was selected, but side-wheel CC motion was received. Calibration is waiting for platter CC 34/35/41.',
    );
    assert.equal(
      summary.warning,
      'Side platter motion was received, but top-touch calibration is waiting for platter CC 34/35/41.',
    );
    assert.equal(info._jogRuntimeDiagnostic.eventKind, 'motion_cc');
    assert.equal(info._jogRuntimeDiagnostic.lane, 'wheel_side');
    assert.equal(info._jogRuntimeDiagnostic.effectiveLane, 'wheel_side');
    assert.equal(info._jogRuntimeDiagnostic.calibration.action, 'ignored');
    assert.equal(
      info._jogRuntimeDiagnostic.calibration.reason,
      'Top-touch calibration was selected, but side-wheel CC motion was received. Calibration is waiting for platter CC 34/35/41.',
    );
    assert.deepEqual(summary.lastSeenMotionEvent, {
      type: 'cc',
      side: 'L',
      lane: 'wheel_side',
      effectiveLane: 'wheel_side',
      delta: 1,
      authoritative: false,
      timestamp: 1001,
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.primary',
    });
  } finally {
    env.restore();
  }
});

test('side calibration gives a specific warning when a top-touch platter lane is received', () => {
  const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'normal', surface: 'side' });

    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true, timestamp: 1000 }));
    const info = createRelativeMotionEvent({
      side: 'left',
      controller: 35,
      mappingId: 'deck.left.jog.motion.tertiary',
      timestamp: 1001,
    });
    env.window.consumeInfo(info);

    const summary = jog.stopCalibration();

    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.touchSeen, true);
    assert.equal(summary.motionSeen, true);
    assert.equal(summary.ignoredEventCount, 1);
    assert.equal(
      summary.warning,
      'Top-touch platter motion was received, but side calibration is waiting for side-wheel CC 33/38.',
    );
    assert.equal(info._jogRuntimeDiagnostic.lane, 'platter_vinyl_off');
    assert.equal(info._jogRuntimeDiagnostic.effectiveLane, 'scratch');
    assert.equal(info._jogRuntimeDiagnostic.calibration.action, 'ignored');
    assert.equal(
      info._jogRuntimeDiagnostic.calibration.reason,
      'Side calibration was selected, but a top-touch platter lane was received. Calibration is waiting for side-wheel CC 33/38.',
    );
  } finally {
    env.restore();
  }
});

test('one-direction calibration uses 360 divided by the absolute signed total delta', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L');

    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: -6, timestamp: 1000 }));
    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: -4, timestamp: 1001 }));

    const laneSummary = jog.stopCalibration().lanes[0];

    assert.equal(laneSummary.totalDelta, -10);
    assert.equal(laneSummary.totalAbsDelta, 10);
    assert.equal(laneSummary.suggestedDegreesPerCountFromSigned, 36);
    assert.equal(laneSummary.suggestedDegreesPerCountFromAbs, 36);
    assert.equal(laneSummary.note, null);
  } finally {
    env.restore();
  }
});

test('calibration preview computes ticksPerTurn and visualDegreesPerTick from measured full-turn ticks', () => {
  const preview = buildJogCalibrationPreview({
    mode: 'normal',
    lanes: [
      {
        side: 'L',
        lane: 'wheel_side',
        eventCount: 6,
        totalDelta: 120,
        totalAbsDelta: 120,
        note: null,
      },
    ],
  }, {
    mode: 'normal',
    surface: 'side',
    updatedAt: 2468,
  });

  assert.deepEqual(preview, {
    controllerId: 'ddj-flx6',
    mode: 'normal',
    surface: 'side',
    entries: [
      {
        side: 'left',
        mode: 'normal',
        surface: 'side',
        ticksPerTurn: 120,
        visualDegreesPerTick: 3,
        eventCount: 6,
        totalDelta: 120,
        totalAbsDelta: 120,
        laneCount: 1,
        note: null,
        updatedAt: 2468,
      },
    ],
  });
});

test('back-and-forth calibration reports signed and absolute suggestions with a note', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L');

    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: 5, timestamp: 1000 }));
    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: -2, timestamp: 1001 }));
    env.window.consumeInfo(createRelativeMotionEvent({ side: 'left', delta: 1, timestamp: 1002 }));

    const laneSummary = jog.stopCalibration().lanes[0];

    assert.equal(laneSummary.eventCount, 3);
    assert.equal(laneSummary.totalDelta, 4);
    assert.equal(laneSummary.totalAbsDelta, 8);
    assert.equal(laneSummary.visualDegreesMoved, 0.88);
    assert.equal(laneSummary.suggestedDegreesPerCountFromSigned, 90);
    assert.equal(laneSummary.suggestedDegreesPerCountFromAbs, 45);
    assert.match(laneSummary.note, /back-and-forth movement/i);
  } finally {
    env.restore();
  }
});

test('saved calibration changes jog visual rotation sensitivity for the matching side and mode', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  setSavedJogCalibration(env, {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          ticksPerTurn: 10,
          visualDegreesPerTick: 36,
          updatedAt: 1234,
        },
      },
      right: {},
    },
  });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    const info = createRelativeMotionEvent({ side: 'left', delta: 1, timestamp: 1000 });
    env.window.consumeInfo(info);

    assert.equal(jog.getJogLaneProfile('wheel_side', 'L').directScale, 36);
    assert.equal(jog.getJogLaneProfile('wheel_side', 'L').calibrated, true);
    assert.equal(jog.getJogLaneProfile('wheel_side', 'L').physicalDegreesPerTick, 36);
    assert.equal(jog.getJogLaneProfile('wheel_side', 'L').velocityScale, 0);
    assert.equal(jog.getJogLaneProfile('wheel_side', 'L').maxVel, 0);
    assert.equal(info.render.jogVisual.angle, 36);
    assert.equal(info.render.jogVisual.vel, 0);

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 36);
  } finally {
    env.restore();
  }
});

test('saved calibration makes a full physical turn land on one visual turn without inertia overshoot', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  setSavedJogCalibration(env, {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          ticksPerTurn: 120,
          visualDegreesPerTick: 3,
          updatedAt: 1234,
        },
      },
      right: {},
    },
  });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    let lastInfo = null;
    for (let index = 0; index < 120; index += 1) {
      lastInfo = createRelativeMotionEvent({
        side: 'left',
        delta: 1,
        timestamp: 1000 + index,
      });
      env.window.consumeInfo(lastInfo);
    }

    assert.equal(lastInfo.render.jogVisual.angle, 360);
    assert.equal(lastInfo.render.jogVisual.vel, 0);
    assert.equal(jog.getState().L.vel, 0);

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 360);

    await env.runAnimationFrames(20);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 360);
  } finally {
    env.restore();
  }
});

test('saved calibration keeps partial turns exact', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  setSavedJogCalibration(env, {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          ticksPerTurn: 120,
          visualDegreesPerTick: 3,
          updatedAt: 1234,
        },
      },
      right: {},
    },
  });
  installJogRuntime({ getUnifiedMap: () => [] }).setMode('tape');

  try {
    for (let index = 0; index < 30; index += 1) {
      env.window.consumeInfo(createRelativeMotionEvent({
        side: 'left',
        delta: 1,
        timestamp: 1000 + index,
      }));
    }

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 90);
  } finally {
    env.restore();
  }
});

test('saved calibration does not drift after calibrated jog motion stops', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  setSavedJogCalibration(env, {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          ticksPerTurn: 120,
          visualDegreesPerTick: 3,
          updatedAt: 1234,
        },
      },
      right: {},
    },
  });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');

    for (let index = 0; index < 30; index += 1) {
      env.window.consumeInfo(createRelativeMotionEvent({
        side: 'left',
        delta: 1,
        timestamp: 1000 + index,
      }));
    }

    await env.runAnimationFrames(1);
    const settledAngle = parseAngle(env.elements.jog_L.style.transform);
    assertClose(settledAngle, 90);
    assert.equal(jog.getState().L.vel, 0);

    await env.runAnimationFrames(20);
    assertClose(parseAngle(env.elements.jog_L.style.transform), settledAngle);
    assert.equal(jog.getState().L.vel, 0);
  } finally {
    env.restore();
  }
});

test('resolveJogCalibrationProfileKey derives exact side, mode, and surface from controller state', () => {
  const cases = [
    {
      input: { side: 'L', inputLane: 'wheel_side', effectiveLane: 'wheel_side', touchActive: false, jogVinylModeKnown: true, jogVinylMode: false },
      expected: { side: 'L', sideKey: 'left', mode: 'normal', surface: 'side', inputLane: 'wheel_side', effectiveLane: 'wheel_side' },
    },
    {
      input: { side: 'L', inputLane: 'platter_vinyl_off', effectiveLane: 'scratch', touchActive: true, jogVinylModeKnown: true, jogVinylMode: false },
      expected: { side: 'L', sideKey: 'left', mode: 'normal', surface: 'top_touch', inputLane: 'platter_vinyl_off', effectiveLane: 'scratch' },
    },
    {
      input: { side: 'L', inputLane: 'wheel_side', effectiveLane: 'wheel_side', touchActive: false, jogVinylModeKnown: true, jogVinylMode: true },
      expected: { side: 'L', sideKey: 'left', mode: 'vinyl', surface: 'side', inputLane: 'wheel_side', effectiveLane: 'wheel_side' },
    },
    {
      input: { side: 'L', inputLane: 'platter_vinyl_on', effectiveLane: 'scratch', touchActive: true, jogVinylModeKnown: true, jogVinylMode: true },
      expected: { side: 'L', sideKey: 'left', mode: 'vinyl', surface: 'top_touch', inputLane: 'platter_vinyl_on', effectiveLane: 'scratch' },
    },
    {
      input: { side: 'L', inputLane: 'wheel_side', effectiveLane: 'wheel_side', touchActive: false, jogCutterKnown: true, jogCutterActive: true },
      expected: { side: 'L', sideKey: 'left', mode: 'jog_cutter', surface: 'side', inputLane: 'wheel_side', effectiveLane: 'wheel_side' },
    },
    {
      input: { side: 'L', inputLane: 'platter_vinyl_on', effectiveLane: 'jog_cutter', touchActive: true, jogCutterKnown: true, jogCutterActive: true, jogVinylModeKnown: true, jogVinylMode: true },
      expected: { side: 'L', sideKey: 'left', mode: 'jog_cutter', surface: 'top_touch', inputLane: 'platter_vinyl_on', effectiveLane: 'jog_cutter' },
    },
  ];

  cases.forEach(({ input, expected }) => {
    assert.deepEqual(resolveJogCalibrationProfileKey(input), expected);
  });
});

test('top-touch calibration selects the correct profile key for normal, vinyl, and jog_cutter motion', () => {
  const cases = [
    {
      name: 'normal',
      mode: 'normal',
      inputLane: 'platter_vinyl_off',
      effectiveLane: 'scratch',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 35,
        mappingId: 'deck.left.jog.motion.tertiary',
        timestamp: 1000,
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: false },
          jogVinylMode: { left: false },
          jogLane: { left: 'platter_vinyl_off' },
        },
      }),
    },
    {
      name: 'vinyl',
      mode: 'vinyl',
      inputLane: 'platter_vinyl_on',
      effectiveLane: 'scratch',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 34,
        mappingId: 'deck.left.jog.motion.secondary',
        timestamp: 1000,
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: false },
          jogVinylMode: { left: true },
          jogLane: { left: 'platter_vinyl_on' },
        },
      }),
    },
    {
      name: 'jog_cutter',
      mode: 'jog_cutter',
      inputLane: 'platter_vinyl_on',
      effectiveLane: 'jog_cutter',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 34,
        mappingId: 'deck.left.jog.motion.secondary',
        timestamp: 1000,
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: true },
          jogVinylMode: { left: true },
          jogLane: { left: 'platter_vinyl_on' },
        },
      }),
    },
  ];

  cases.forEach(({ name, mode, inputLane, effectiveLane, event }) => {
    const env = installMockBrowser({ locationHref: 'http://localhost/host.html' });
    env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
    const jog = installJogRuntime({ getUnifiedMap: () => [] });

    try {
      jog.setMode('tape');
      jog.startCalibration('L', { mode, surface: 'top_touch' });

      env.window.consumeInfo(createTouchEvent({ side: 'left', active: true, timestamp: 999 }));
      env.window.consumeInfo(event);

      const summary = jog.stopCalibration();

      assert.equal(summary.lanes.length, 1, `${name} should record exactly one calibration lane`);
      assert.equal(summary.touchSeen, true, `${name} should keep top-touch calibration armed`);
      assert.equal(summary.motionSeen, true, `${name} should see a platter motion CC`);
      assert.equal(summary.lanes[0].mode, mode, `${name} should select the expected calibration mode`);
      assert.equal(summary.lanes[0].surface, 'top_touch', `${name} should stay in the top-touch surface`);
      assert.equal(summary.lanes[0].lane, effectiveLane, `${name} should record the expected effective lane`);
      assert.equal(summary.lastSeenMotionEvent.lane, inputLane, `${name} should preserve the physical input lane`);
      assert.equal(summary.lastSeenMotionEvent.effectiveLane, effectiveLane, `${name} should preserve the effective lane`);
    } finally {
      env.restore();
    }
  });
});

test('saved calibration routes jog motion by side, mode, and surface without changing mappings', () => {
  const cases = [
    {
      name: 'normal side',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 33,
        mappingId: 'deck.left.jog.motion.primary',
        controllerState: {
          jogTouch: { left: false },
          jogCutter: { left: false },
          jogVinylMode: { left: false },
          jogLane: { left: 'wheel_side' },
        },
      }),
      expectedAngle: 3,
      expectedLane: 'wheel_side',
      expectedMode: 'nudge',
    },
    {
      name: 'normal top touch',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 35,
        mappingId: 'deck.left.jog.motion.tertiary',
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: false },
          jogVinylMode: { left: false },
          jogLane: { left: 'platter_vinyl_off' },
        },
      }),
      expectedAngle: 4,
      expectedLane: 'scratch',
      expectedMode: 'scratch',
    },
    {
      name: 'vinyl side',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 33,
        mappingId: 'deck.left.jog.motion.primary',
        controllerState: {
          jogTouch: { left: false },
          jogCutter: { left: false },
          jogVinylMode: { left: true },
          jogLane: { left: 'wheel_side' },
        },
      }),
      expectedAngle: 5,
      expectedLane: 'wheel_side',
      expectedMode: 'nudge',
    },
    {
      name: 'vinyl top touch',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 34,
        mappingId: 'deck.left.jog.motion.secondary',
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: false },
          jogVinylMode: { left: true },
          jogLane: { left: 'platter_vinyl_on' },
        },
      }),
      expectedAngle: 6,
      expectedLane: 'scratch',
      expectedMode: 'scratch',
    },
    {
      name: 'jog cutter side',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 33,
        mappingId: 'deck.left.jog.motion.primary',
        controllerState: {
          jogTouch: { left: false },
          jogCutter: { left: true },
          jogVinylMode: { left: true },
          jogLane: { left: 'wheel_side' },
        },
      }),
      expectedAngle: 7,
      expectedLane: 'wheel_side',
      expectedMode: 'nudge',
    },
    {
      name: 'jog cutter top touch',
      event: createRelativeMotionEvent({
        side: 'left',
        controller: 34,
        mappingId: 'deck.left.jog.motion.secondary',
        controllerState: {
          jogTouch: { left: true },
          jogCutter: { left: true },
          jogVinylMode: { left: true },
          jogLane: { left: 'platter_vinyl_on' },
        },
      }),
      expectedAngle: 8,
      expectedLane: 'jog_cutter',
      expectedMode: 'jog_cutter',
    },
  ];

  cases.forEach(({ event, expectedAngle, expectedLane, expectedMode }) => {
    const env = installMockBrowser({ elementIds: ['jog_L'] });
    env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
    setSavedJogCalibration(env, {
      controllerId: 'ddj-flx6',
      jog: {
        left: {
          normal: {
            side: { ticksPerTurn: 120, visualDegreesPerTick: 3, updatedAt: 1111 },
            top_touch: { ticksPerTurn: 90, visualDegreesPerTick: 4, updatedAt: 1112 },
          },
          vinyl: {
            side: { ticksPerTurn: 72, visualDegreesPerTick: 5, updatedAt: 1113 },
            top_touch: { ticksPerTurn: 60, visualDegreesPerTick: 6, updatedAt: 1114 },
          },
          jog_cutter: {
            side: { ticksPerTurn: 51.4286, visualDegreesPerTick: 7, updatedAt: 1115 },
            top_touch: { ticksPerTurn: 45, visualDegreesPerTick: 8, updatedAt: 1116 },
          },
        },
        right: {},
      },
    });
    const jog = installJogRuntime({ getUnifiedMap: () => [] });

    try {
      jog.setMode('tape');
      env.window.consumeInfo(event);

      assert.equal(event.render.jogVisual.angle, expectedAngle);
      assert.equal(event.render.jogVisual.lane, expectedLane);
      assert.equal(event.render.jogVisual.motionMode, expectedMode);
    } finally {
      env.restore();
    }
  });
});

test('exact calibration lookup falls back safely when a profile is missing', () => {
  const preferences = {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          default: {
            ticksPerTurn: 120,
            visualDegreesPerTick: 3,
          },
          top_touch: {
            ticksPerTurn: 90,
            visualDegreesPerTick: 4,
          },
        },
      },
      right: {},
    },
  };

  assert.equal(
    getJogCalibrationEntry(preferences, { side: 'L', mode: 'normal', surface: 'top_touch' }).visualDegreesPerTick,
    4,
  );
  assert.equal(
    getJogCalibrationEntry(preferences, { side: 'L', lane: 'wheel_side', mode: 'normal', surface: 'side' }).visualDegreesPerTick,
    3,
  );
  assert.equal(
    getJogCalibrationEntry(preferences, { side: 'L', lane: 'platter_vinyl_on', mode: 'vinyl', surface: 'top_touch' }),
    null,
  );
});

test('resetting one selected jog calibration profile falls back to the default jog visual sensitivity', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  setSavedJogCalibration(env, {
    controllerId: 'ddj-flx6',
    jog: {
      left: {
        normal: {
          side: {
            ticksPerTurn: 10,
            visualDegreesPerTick: 36,
            updatedAt: 1234,
          },
        },
      },
      right: {},
    },
  });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    assert.equal(jog.getJogLaneProfile('wheel_side', 'L', { mode: 'normal', surface: 'side' }).directScale, 36);

    jog.resetCalibrationPreference({ side: 'L', mode: 'normal', surface: 'side' });

    assert.equal(jog.getJogLaneProfile('wheel_side', 'L', { mode: 'normal', surface: 'side' }).directScale, 0.11);
    assert.equal(env.localStorage.getItem('flx.jogCalibration.v1'), null);
  } finally {
    env.restore();
  }
});

test('calibration ignores unrelated lane families while tracking a selected mode', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L', { mode: 'normal' });

    env.window.consumeInfo({
      type: 'cc',
      ch: 1,
      controller: 91,
      value: 127,
      d1: 91,
      d2: 127,
      canonicalTarget: 'deck.left.tempo',
      mappingId: 'deck.left.tempo.main',
      timestamp: 999,
    });

    env.window.consumeInfo(createMotionEvent({
      side: 'left',
      controller: 34,
      mappingId: 'deck.left.jog.motion.secondary',
      timestamp: 1000,
      controllerState: {
        jogTouch: { left: true },
        jogLane: { left: 'platter_vinyl_on' },
      },
    }));

    const summary = jog.stopCalibration();

    assert.equal(summary.mode, 'normal');
    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.totalDeltaCount, 0);
    assert.equal(summary.ignoredEventCount, 1);
    assert.match(summary.lastIgnoredReason, /tracking normal/i);
  } finally {
    env.restore();
  }
});

test('calibration tracking leaves normal jog runtime behavior unchanged', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    jog.startCalibration('L');

    const info = createMotionEvent({
      side: 'left',
      controller: 33,
      mappingId: 'deck.left.jog.motion.primary',
    });
    env.window.consumeInfo(info);

    assert.deepEqual(info.render.jogVisual, {
      side: 'L',
      angle: 0.11,
      vel: 0.04,
      damping: 0.5,
      lane: 'wheel_side',
      motionMode: 'nudge',
      touchActive: false,
      touchLane: null,
      authoredAt: 1000,
      frameMs: 16,
    });

    await env.runAnimationFrames(1);
    assertClose(parseAngle(env.elements.jog_L.style.transform), 0.11);

    const laneSummary = jog.stopCalibration().lanes[0];
    assert.equal(laneSummary.totalDelta, 1);
    assert.equal(laneSummary.currentDirectScale, 0.11);
  } finally {
    env.restore();
  }
});

test('viewer authoritative jogVisual events are not recorded as physical calibration samples', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'], locationHref: 'http://localhost/viewer.html' });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  env.window.FLX_ROLE = 'viewer';
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('tape');
    const startSummary = jog.startCalibration('L');
    assert.match(startSummary.warning, /viewer\.html/i);

    const info = createRelativeMotionEvent({ side: 'left', delta: 5, timestamp: 1000 });
    info.render = { jogVisual: createAuthoritativeJogVisual() };
    env.window.consumeInfo(info);

    assertClose(parseAngle(env.elements.jog_L.style.transform), 1.23);
    assert.equal(info._jogRuntimeDiagnostic.eventKind, 'authoritative_relay');
    assert.equal(info._jogRuntimeDiagnostic.authoritative, true);
    assert.equal(info._jogRuntimeDiagnostic.calibration.action, 'ignored');
    assert.match(info._jogRuntimeDiagnostic.calibration.reason, /viewer relay jogvisual snapshots/i);
    assert.equal(info._jogRuntimeDiagnostic.calibration.pageRole, 'viewer');

    const summary = jog.stopCalibration();
    assert.equal(summary.pageRole, 'viewer');
    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.totalDeltaCount, 0);
    assert.equal(summary.touchSeen, false);
    assert.equal(summary.motionSeen, false);
    assert.equal(summary.ignoredEventCount, 1);
    assert.match(summary.lastIgnoredReason, /viewer relay jogvisual snapshots/i);
    assert.match(summary.warning, /viewer\.html/i);
    assert.deepEqual(summary.lastSeenJogEvent, {
      type: 'cc',
      side: 'L',
      lane: 'wheel_side',
      effectiveLane: 'wheel_side',
      delta: null,
      authoritative: true,
      timestamp: 1000,
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.primary',
    });
    assert.equal(summary.lastSeenMotionEvent, null);
    assert.equal(summary.lastSeenTouchEvent, null);
  } finally {
    env.restore();
  }
});

test('host-authored render.jogVisual snapshots reflect the resolved lane profile instead of the raw platter lane', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
  installJogRuntime({ getUnifiedMap: () => [] }).setMode('tape');

  try {
    env.window.consumeInfo(createTouchEvent({ side: 'left', active: true }));

    const info = createMotionEvent({
      side: 'left',
      controller: 34,
      mappingId: 'deck.left.jog.motion.secondary',
      controllerState: {
        jogTouch: { left: true },
        jogCutter: { left: true },
        jogLane: { left: 'platter_vinyl_on' },
      },
    });
    env.window.consumeInfo(info);

    assert.deepEqual(info.render.jogVisual, {
      side: 'L',
      angle: 0.99,
      vel: 0.01,
      damping: 0.25,
      lane: 'jog_cutter',
      motionMode: 'jog_cutter',
      touchActive: true,
      touchLane: 'touch',
      authoredAt: 1000,
      frameMs: 16,
    });
  } finally {
    env.restore();
  }
});

test('authoritative jog visuals let the viewer catch up without double-applying raw jog deltas', async () => {
  let relayInfo = null;
  let hostAngle = null;

  {
    const env = installMockBrowser({ elementIds: ['jog_L'] });
    env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
    const jog = installJogRuntime({ getUnifiedMap: () => [], now: () => 1000 });

    try {
      jog.setMode('tape');

      relayInfo = createMotionEvent({
        side: 'left',
        controller: 35,
        mappingId: 'deck.left.jog.motion.tertiary',
        timestamp: 1000,
      });
      env.window.consumeInfo(relayInfo);
      await env.runAnimationFrames(4);
      hostAngle = parseAngle(env.elements.jog_L.style.transform);
    } finally {
      env.restore();
    }
  }

  {
    const env = installMockBrowser({ elementIds: ['jog_L'] });
    env.window.__MIDI_FEEL__ = { FEEL_CFG: createJogFeelConfig() };
    const jog = installJogRuntime({ getUnifiedMap: () => [], now: () => 1064 });

    try {
      jog.setMode('tape');

      const remoteInfo = clone(relayInfo);
      remoteInfo.value = 63;
      remoteInfo.d2 = 63;
      env.window.consumeInfo(remoteInfo);

      const viewerAngle = parseAngle(env.elements.jog_L.style.transform);
      assertClose(viewerAngle, hostAngle);
      assert.equal(remoteInfo.render.jogVisual.authoredAt, 1064);
      assertClose(remoteInfo.render.jogVisual.angle, Number(viewerAngle.toFixed(4)));
      assert.equal(env.elements.jog_L.dataset.jogLane, 'platter_vinyl_off');
      assert.equal(env.elements.jog_L.dataset.jogMotionMode, 'spin');
    } finally {
      env.restore();
    }
  }
});

test('escaped learned-map jog targets still resolve the correct side', () => {
  const env = installMockBrowser({ elementIds: ['jog_x5F_L', 'jog_x5F_R'] });
  const map = [{ key: 'cc:1:33', target: 'jog_x5F_L' }];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('absolute');
    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 33, value: 127 });

    assert.equal(env.elements.jog_x5F_L.style.transform, 'rotate(360deg)');
    assert.equal(env.elements.jog_x5F_R.style.transform, undefined);
  } finally {
    env.restore();
  }
});

test('install guard prevents double-wrapping consumeInfo', () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  let calls = 0;
  env.window.consumeInfo = () => { calls += 1; };

  try {
    const jog = installJogRuntime({ getUnifiedMap: () => map });
    jog.setMode('absolute');
    installJogRuntime({ getUnifiedMap: () => map });

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 127 });

    assert.equal(calls, 1);
    assert.equal(env.elements.jog_L.style.transform, 'rotate(360deg)');
  } finally {
    env.restore();
  }
});
