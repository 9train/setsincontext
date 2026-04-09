import test from 'node:test';
import assert from 'node:assert/strict';

import { installJogRuntime } from '../src/jog-runtime.js';
import { installMockBrowser } from './browser-test-helpers.js';

function parseAngle(transform) {
  const m = /rotate\(([-0-9.]+)deg\)/.exec(String(transform || ''));
  return m ? Number(m[1]) : null;
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

test('tape mode uses wrapped 7-bit deltas for direction handling', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('tape');

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 1 });
    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 127 });
    await env.runAnimationFrames(1);

    assert.equal(parseAngle(env.elements.jog_L.style.transform), -5);
  } finally {
    env.restore();
  }
});

test('tape mode accumulates repeated movement over successive frames', async () => {
  const env = installMockBrowser({ elementIds: ['jog_L'] });
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('tape');

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 1 });
    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 2 });
    await env.runAnimationFrames(1);
    const firstAngle = parseAngle(env.elements.jog_L.style.transform);

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 22, value: 3 });
    await env.runAnimationFrames(1);
    const secondAngle = parseAngle(env.elements.jog_L.style.transform);

    assert.ok(firstAngle > 0);
    assert.ok(secondAngle > firstAngle);
    assert.ok(Math.abs(secondAngle - 7.3) < 1e-9);
  } finally {
    env.restore();
  }
});

test('side detection updates only the mapped jog side', () => {
  const env = installMockBrowser({ elementIds: ['jog_L', 'jog_R'] });
  const map = [{ key: 'cc:1:23', target: 'jog_R' }];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('absolute');
    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 23, value: 64 });

    assert.equal(env.elements.jog_L.style.transform, undefined);
    assert.equal(
      env.elements.jog_R.style.transform,
      `rotate(${64 * (360 / 127)}deg)`
    );
  } finally {
    env.restore();
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

test('touch note events do not move the shared jog runtime platter', () => {
  const env = installMockBrowser({ elementIds: ['jog_x5F_L'] });
  const map = [
    { key: 'noteon:1:54', target: 'jog_x5F_L' },
    { key: 'cc:1:33', target: 'jog_x5F_L' },
  ];
  const jog = installJogRuntime({ getUnifiedMap: () => map });

  try {
    jog.setMode('absolute');

    env.window.consumeInfo({ type: 'noteon', ch: 1, d1: 54, d2: 127 });
    assert.equal(env.elements.jog_x5F_L.style.transform, undefined);

    env.window.consumeInfo({ type: 'cc', ch: 1, controller: 33, value: 64 });
    assert.equal(
      env.elements.jog_x5F_L.style.transform,
      `rotate(${64 * (360 / 127)}deg)`,
    );
  } finally {
    env.restore();
  }
});

test('canonical jog targets drive the shared jog runtime without relying on map lookup', () => {
  const env = installMockBrowser({ elementIds: ['jog_L', 'jog_R'] });
  const jog = installJogRuntime({ getUnifiedMap: () => [] });

  try {
    jog.setMode('absolute');
    env.window.consumeInfo({
      eventType: 'normalized_input',
      canonicalTarget: 'deck.right.jog.motion',
      mappingId: 'deck.right.jog.motion.primary',
      interaction: 'cc',
      type: 'cc',
      ch: 2,
      controller: 33,
      value: 64,
    });

    assert.equal(env.elements.jog_L.style.transform, undefined);
    assert.equal(
      env.elements.jog_R.style.transform,
      `rotate(${64 * (360 / 127)}deg)`,
    );
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
