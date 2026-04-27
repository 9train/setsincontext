import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeInfo } from '../src/board.js';
import { installBoardWindowBindings, isMixerGroupedKnobId } from '../src/board/runtime.js';
import {
  heldBinaryTargets,
  jogAngle,
  knobAccumAngle,
  lastCCValue,
  litTimers,
  pairedAbsoluteState,
  setBoardSvgRoot,
  setMissingCalibrationHintsWarned,
  setUnifiedMap,
} from '../src/board/state.js';
import { installMockBrowser } from './browser-test-helpers.js';

function createClassList() {
  const tokens = new Set();
  return {
    add(...values) {
      values.forEach((value) => tokens.add(String(value)));
    },
    remove(...values) {
      values.forEach((value) => tokens.delete(String(value)));
    },
    contains(value) {
      return tokens.has(String(value));
    },
  };
}

function clearStore(store) {
  for (const key of Object.keys(store || {})) {
    delete store[key];
  }
}

function resetBoardRuntimeState() {
  setBoardSvgRoot(null);
  setUnifiedMap([]);
  setMissingCalibrationHintsWarned(false);
  clearStore(lastCCValue);
  clearStore(knobAccumAngle);
  clearStore(jogAngle);
  clearStore(litTimers);
  clearStore(heldBinaryTargets);
  clearStore(pairedAbsoluteState);
}

function assignOwnerSvg(node, ownerSvgElement) {
  node.ownerSVGElement = ownerSvgElement;
  for (const child of node.children) {
    assignOwnerSvg(child, ownerSvgElement);
  }
}

class MockSvgElement {
  constructor(tagName, id, { attrs = {}, bbox = { x: 0, y: 0, width: 100, height: 100 } } = {}) {
    this.tagName = String(tagName || 'g');
    this.id = id || null;
    this.children = [];
    this.parentNode = null;
    this.ownerSVGElement = null;
    this.classList = createClassList();
    this.dataset = {};
    this.style = {
      removeProperty(name) {
        delete this[name];
      },
    };
    this._attrs = new Map();
    this._bbox = { ...bbox };

    if (id) this._attrs.set('id', String(id));
    for (const [name, value] of Object.entries(attrs)) {
      this._attrs.set(name, String(value));
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    assignOwnerSvg(child, this.tagName.toLowerCase() === 'svg' ? this : this.ownerSVGElement);
    return child;
  }

  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }

  hasAttribute(name) {
    return this._attrs.has(name);
  }

  setAttribute(name, value) {
    this._attrs.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }

  removeAttribute(name) {
    this._attrs.delete(name);
  }

  getBBox() {
    return { ...this._bbox };
  }
}

class MockSvgRoot extends MockSvgElement {
  constructor(id = 'board_svg') {
    super('svg', id);
    this.ownerSVGElement = this;
  }

  getElementById(id) {
    const needle = String(id || '');
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (!node) continue;
      if ((node.id || node.getAttribute('id')) === needle) return node;
      stack.unshift(...node.children);
    }
    return null;
  }
}

function createKnobFixture({
  knobId,
  baseId = null,
  cx = 50,
  cy = 50,
  radius = 10,
  attrs = {},
  knobBBox = { x: 40, y: 35, width: 20, height: 30 },
  pointerId = `${knobId}_pointer`,
  pointerAttrs = {},
  pointerBBox = { x: 45, y: 35, width: 10, height: 20 },
} = {}) {
  const root = new MockSvgRoot();
  const knob = new MockSvgElement('g', knobId, { attrs, bbox: knobBBox });
  let baseCircle = null;

  if (baseId) {
    baseCircle = new MockSvgElement('circle', baseId, {
      attrs: { cx, cy, r: radius },
      bbox: { x: Number(cx) - Number(radius), y: Number(cy) - Number(radius), width: Number(radius) * 2, height: Number(radius) * 2 },
    });
    knob.appendChild(baseCircle);
  }

  const pointer = new MockSvgElement('path', pointerId, {
    attrs: pointerAttrs,
    bbox: pointerBBox,
  });
  knob.appendChild(pointer);
  root.appendChild(knob);

  return { root, knob, baseCircle, pointer };
}

function createSliderFixture(id, attrs) {
  return new MockSvgElement('rect', id, {
    attrs,
    bbox: { x: 0, y: 0, width: 12, height: 24 },
  });
}

async function withBoardRuntimeEnv(run) {
  const env = installMockBrowser();
  resetBoardRuntimeState();
  try {
    await run(env);
  } finally {
    resetBoardRuntimeState();
    env.restore();
  }
}

test('beatfx_x5F_levels_x5F_knob keeps using the existing CSS transform path', async () => {
  await withBoardRuntimeEnv(async () => {
    const { root, knob } = createKnobFixture({
      knobId: 'beatfx_x5F_levels_x5F_knob',
      baseId: 'beatfx_x5F_levels_x5F_knob_x5F_1',
      cx: '968.96997',
      cy: '394.89999',
      radius: '12',
      knobBBox: { x: 956.97, y: 379.18, width: 24, height: 27.72 },
      pointerId: 'beatfx_x5F_levels_x5F_knob2',
      pointerBBox: { x: 963.97, y: 379.18, width: 10, height: 10 },
    });

    setBoardSvgRoot(root);
    consumeInfo({
      type: 'cc',
      value: 127,
      render: {
        targetId: 'beatfx_x5F_levels_x5F_knob',
        canonicalTarget: 'beatfx.level_depth',
      },
    });

    assert.equal(knob.style.transformBox, 'fill-box');
    assert.equal(knob.style.transformOrigin, 'center');
    assert.equal(knob.style.transform, 'rotate(270deg)');
    assert.equal(knob.getAttribute('transform'), null);
  });
});

test('beatfx_x5F_levels_x5F_knob is not detected as a mixer grouped knob', () => {
  assert.equal(isMixerGroupedKnobId('beatfx_x5F_levels_x5F_knob'), false);
});

test('only trim, hi, mid, low, and filter ids are eligible for mixer grouped knob handling', () => {
  ['trim_1', 'hi_1', 'mid_1', 'low_1', 'filter_1', 'trim_4'].forEach((id) => {
    assert.equal(isMixerGroupedKnobId(id), true, `${id} should match the mixer grouped knob rule`);
  });

  [
    'beatfx_x5F_levels_x5F_knob',
    'trim_base_1',
    'hi_Knob_1',
    'mid',
    'filter_a',
    'jog_L',
    'slider_ch1',
  ].forEach((id) => {
    assert.equal(isMixerGroupedKnobId(id), false, `${id} should not match the mixer grouped knob rule`);
  });
});

test('mixer knobs use CSS rotation and do not accumulate repeated transforms', async () => {
  const cases = [
    ['trim_1', 'trim_base_1', '712.20648', '118.68346', '12'],
    ['hi_1', 'hi_base_1', '712.20648', '158.68346', '10'],
    ['mid_1', 'mid_base_1', '712.20648', '196.68346', '10'],
    ['low_1', 'low_base_1', '712.20648', '234.68346', '10'],
    ['filter_1', 'filter_base_1', '712.20648', '272.68347', '10'],
  ];

  await withBoardRuntimeEnv(async () => {
    for (const [knobId, baseId, cx, cy, radius] of cases) {
      resetBoardRuntimeState();
      const { root, knob } = createKnobFixture({
        knobId,
        baseId,
        cx,
        cy,
        radius,
        knobBBox: { x: Number(cx) - 12, y: Number(cy) - 16, width: 24, height: 32 },
      });

      setBoardSvgRoot(root);
      consumeInfo({
        type: 'cc',
        value: 0,
        render: {
          targetId: knobId,
        },
      });

      assert.equal(knob.style.transformBox, 'fill-box', `${knobId} should use CSS transform-box`);
      assert.equal(knob.style.transformOrigin, 'center', `${knobId} should use CSS transform-origin`);
      assert.equal(knob.style.transform, 'rotate(-135deg)', `${knobId} should map 0 to -135deg`);
      assert.equal(knob.getAttribute('transform'), null, `${knobId} should not mutate the SVG transform attribute`);

      consumeInfo({
        type: 'cc',
        value: 127,
        render: {
          targetId: knobId,
        },
      });

      assert.equal(knob.style.transform, 'rotate(135deg)', `${knobId} should map 127 to 135deg`);
      assert.equal((knob.style.transform.match(/rotate\(/g) || []).length, 1, `${knobId} should keep a single rotate() transform`);
    }
  });
});

test('mixer knob rotation does not mutate unrelated transforms', async () => {
  await withBoardRuntimeEnv(async () => {
    const { root, knob, pointer } = createKnobFixture({
      knobId: 'hi_1',
      baseId: 'hi_base_1',
      cx: '712.20648',
      cy: '158.68346',
      attrs: { transform: 'translate(5 7)' },
      pointerAttrs: { transform: 'scale(2)' },
      knobBBox: { x: 700.20648, y: 142.68346, width: 24, height: 32 },
    });

    setBoardSvgRoot(root);
    consumeInfo({
      type: 'cc',
      value: 127,
      render: {
        targetId: 'hi_1',
      },
    });

    assert.equal(knob.getAttribute('transform'), 'translate(5 7)');
    assert.equal(pointer.getAttribute('transform'), 'scale(2)');
    assert.equal(knob.style.transform, 'rotate(135deg)');
  });
});

test('jog rotation still works', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = new MockSvgRoot();
    const jog = new MockSvgElement('g', 'jog_L');
    root.appendChild(jog);

    setBoardSvgRoot(root);
    consumeInfo({
      type: 'cc',
      value: 65,
      render: {
        targetId: 'jog_L',
      },
    });

    assert.equal(jog.style.transformBox, 'fill-box');
    assert.equal(jog.style.transformOrigin, 'center');
    assert.equal(jog.style.transform, 'rotate(2.5deg)');
    assert.equal(jog.classList.contains('lit'), true);
  });
});

test('slider and fader behavior still works', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = new MockSvgRoot();
    const channelFader = createSliderFixture('slider_ch1', {
      y: '100',
      'data-minY': '0',
      'data-maxY': '100',
    });
    const crossfader = createSliderFixture('xfader_slider', {
      x: '0',
      'data-minX': '0',
      'data-maxX': '100',
    });

    root.appendChild(channelFader);
    root.appendChild(crossfader);
    setBoardSvgRoot(root);

    consumeInfo({
      type: 'cc',
      value: 127,
      render: {
        targetId: 'slider_ch1',
      },
    });
    consumeInfo({
      type: 'cc',
      value: 127,
      valueShape: 'absolute',
      canonicalTarget: 'mixer.crossfader',
      mappingId: 'mixer.crossfader.primary',
      ch: 7,
      controller: 31,
      d1: 31,
      d2: 127,
      render: {
        targetId: 'xfader_slider',
        canonicalTarget: 'mixer.crossfader',
        mappingId: 'mixer.crossfader.primary',
      },
    });

    assert.equal(channelFader.getAttribute('y'), '0.0');
    assert.equal(crossfader.getAttribute('x'), '100.0');
  });
});

test('bare boardCompat cannot move the physical crossfader in runtime', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = new MockSvgRoot();
    const crossfader = createSliderFixture('xfader_slider', {
      x: '0',
      'data-minX': '0',
      'data-maxX': '100',
    });

    root.appendChild(crossfader);
    setBoardSvgRoot(root);

    const info = {
      type: 'cc',
      ch: 1,
      controller: 33,
      d1: 33,
      d2: 65,
      value: 65,
      canonicalTarget: 'deck.left.jog.motion',
      mappingId: 'deck.left.jog.motion.primary',
      boardCompat: {
        targetId: 'xfader_slider',
        source: 'compatibility-test',
        reason: 'compat-test',
      },
      controllerState: {
        jogCutter: { left: true, right: null },
        jogTouch: { left: true, right: false },
      },
    };

    consumeInfo(info);

    assert.equal(crossfader.getAttribute('x'), '0');
    assert.equal(info._boardRender.targetId, null);
    assert.equal(info._boardRender.authority, 'official-missing');
    assert.equal(info._boardRender.source, 'resolved-render-target-required');
    assert.equal(info._boardRender.outcome, 'blocked');
    assert.equal(info._boardRender.detail, 'official-render-target-required');
  });
});

test('physical crossfader MSB and LSB lanes still render accurately while jog cutter is active', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = new MockSvgRoot();
    const crossfader = createSliderFixture('xfader_slider', {
      x: '0',
      'data-minX': '0',
      'data-maxX': '100',
    });

    root.appendChild(crossfader);
    setBoardSvgRoot(root);

    consumeInfo({
      type: 'cc',
      ch: 7,
      controller: 31,
      d1: 31,
      d2: 64,
      value: 64,
      valueShape: 'absolute',
      canonicalTarget: 'mixer.crossfader',
      mappingId: 'mixer.crossfader.primary',
      controllerState: {
        jogCutter: { left: true, right: null },
      },
      render: {
        targetId: 'xfader_slider',
        canonicalTarget: 'mixer.crossfader',
        mappingId: 'mixer.crossfader.primary',
      },
    });

    assert.equal(crossfader.getAttribute('x'), '50.0');

    consumeInfo({
      type: 'cc',
      ch: 7,
      controller: 63,
      d1: 63,
      d2: 127,
      value: 127,
      valueShape: 'absolute',
      canonicalTarget: 'mixer.crossfader',
      mappingId: 'mixer.crossfader.secondary',
      controllerState: {
        jogCutter: { left: true, right: null },
      },
      render: {
        targetId: 'xfader_slider',
        canonicalTarget: 'mixer.crossfader',
        mappingId: 'mixer.crossfader.secondary',
      },
    });

    assert.equal(crossfader.getAttribute('x'), '51.2');
  });
});

test('FLXTest.rotateKnob reports the rotated element and keeps mixer knobs on CSS', async () => {
  await withBoardRuntimeEnv(async (env) => {
    const { root, knob } = createKnobFixture({
      knobId: 'hi_1',
      baseId: 'hi_base_1',
      cx: '712.20648',
      cy: '158.68346',
      knobBBox: { x: 700.20648, y: 142.68346, width: 24, height: 32 },
    });

    setBoardSvgRoot(root);
    installBoardWindowBindings();

    const info = env.window.FLXTest.rotateKnob('hi_1', 127);

    assert.deepEqual(info, {
      requestedId: 'hi_1',
      resolvedElementId: 'hi_1',
      rotateTargetId: 'hi_1',
      mixerGroupedKnob: true,
      strategy: 'css-transform',
      angleDeg: 135,
    });
    assert.equal(knob.dataset.flxDebugRotateTarget, 'true');
    assert.equal(knob.style.transform, 'rotate(135deg)');
  });
});
