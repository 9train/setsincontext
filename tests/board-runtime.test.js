import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeInfo } from '../src/board.js';
import {
  applyFlx6VisualStateProjection,
  installBoardWindowBindings,
  isMixerGroupedKnobId,
} from '../src/board/runtime.js';
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

const PAD_MODE_GROUP_IDS = Object.freeze({
  left: Object.freeze(['hotcue_L', 'padfx_L', 'beatjump_L', 'sampler_L']),
  right: Object.freeze(['hotcue_R', 'padfx_R', 'beatjump_R', 'sampler_R']),
});
const DECK_STATE_GROUP_IDS = Object.freeze({
  left: Object.freeze(['deck_layer_alt_L', 'deck_layer_main_L', 'vinyl_L']),
  right: Object.freeze(['deck_layer_alt_R', 'deck_layer_main_R', 'vinyl_R']),
});
const FLX6_VISUAL_TARGET_IDS = Object.freeze([
  ...PAD_MODE_GROUP_IDS.left,
  ...PAD_MODE_GROUP_IDS.right,
  ...DECK_STATE_GROUP_IDS.left,
  ...DECK_STATE_GROUP_IDS.right,
]);

function createTargetFixture(targetIds = FLX6_VISUAL_TARGET_IDS) {
  const root = new MockSvgRoot();
  targetIds.forEach((id) => {
    root.appendChild(new MockSvgElement('g', id));
  });
  return root;
}

function isLit(root, id) {
  const el = root.getElementById(id);
  assert.ok(el, `${id} should exist in the board fixture`);
  return el.classList.contains('lit');
}

function assertExclusiveLit(root, ids, activeId, label = '') {
  ids.forEach((id) => {
    assert.equal(
      isLit(root, id),
      id === activeId,
      `${label}${id} lit state`,
    );
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

[
  ['hotcue', 'hotcue_L'],
  ['sampler', 'sampler_L'],
  ['fx', 'padfx_L'],
  ['beatjump', 'beatjump_L'],
].forEach(([mode, activeId]) => {
  test(`FLX6 pad-mode projection lights left ${mode} exclusively`, async () => {
    await withBoardRuntimeEnv(async () => {
      const root = createTargetFixture();
      setBoardSvgRoot(root);

      consumeInfo({
        controllerState: {
          padMode: { left: mode },
        },
      });

      assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, activeId, 'left pad mode ');
      assertExclusiveLit(root, PAD_MODE_GROUP_IDS.right, null, 'right pad mode ');
    });
  });
});

test('FLX6 pad-mode projection lights right sampler independently', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerState: {
        padMode: { right: 'sampler' },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.right, 'sampler_R', 'right pad mode ');
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, null, 'left pad mode ');
  });
});

test('FLX6 pad-mode projection supports different active modes per side', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerState: {
        padMode: { left: 'hotcue', right: 'sampler' },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'hotcue_L', 'left pad mode ');
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.right, 'sampler_R', 'right pad mode ');
  });
});

test('FLX6 pad-mode projection supports the same active mode on both sides', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerState: {
        padMode: { left: 'fx', right: 'fx' },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'padfx_L', 'left pad mode ');
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.right, 'padfx_R', 'right pad mode ');
  });
});

test('FLX6 pad-mode projection keeps the active mode lit on repeated press and release events', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    const activeState = {
      padMode: { left: 'hotcue' },
    };

    consumeInfo({
      type: 'noteon',
      value: 127,
      render: { targetId: 'hotcue_L' },
      controllerState: activeState,
    });
    consumeInfo({
      type: 'noteon',
      value: 127,
      render: { targetId: 'hotcue_L' },
      controllerState: activeState,
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'hotcue_L', 'left pad mode repeated press ');

    consumeInfo({
      type: 'noteoff',
      value: 0,
      render: { targetId: 'hotcue_L' },
      controllerState: activeState,
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'hotcue_L', 'left pad mode release ');
  });
});

[
  ['right', { jogCutter: { right: true }, jogVinylMode: { right: false } }, 'deck_layer_alt_R'],
  ['right', { jogCutter: { right: false }, jogVinylMode: { right: false } }, 'deck_layer_main_R'],
  ['right', { jogCutter: { right: false }, jogVinylMode: { right: true } }, 'vinyl_R'],
  ['right', { jogCutter: { right: true }, jogVinylMode: { right: true } }, 'deck_layer_alt_R'],
  ['left', { jogCutter: { left: true }, jogVinylMode: { left: false } }, 'deck_layer_alt_L'],
  ['left', { jogCutter: { left: false }, jogVinylMode: { left: false } }, 'deck_layer_main_L'],
  ['left', { jogCutter: { left: false }, jogVinylMode: { left: true } }, 'vinyl_L'],
  ['left', { jogCutter: { left: true }, jogVinylMode: { left: true } }, 'deck_layer_alt_L'],
].forEach(([side, controllerState, activeId]) => {
  test(`FLX6 deck-state projection lights ${activeId} exclusively`, async () => {
    await withBoardRuntimeEnv(async () => {
      const root = createTargetFixture();
      setBoardSvgRoot(root);

      consumeInfo({ controllerState });

      assertExclusiveLit(root, DECK_STATE_GROUP_IDS[side], activeId, `${side} deck state `);
    });
  });
});

test('FLX6 compact controllerVisualState projection is accepted', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerVisualState: {
        padMode: { left: 'padfx' },
        jogCutter: { right: true },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'padfx_L', 'left visual pad mode ');
    assertExclusiveLit(root, DECK_STATE_GROUP_IDS.right, 'deck_layer_alt_R', 'right visual deck state ');
  });
});

test('FLX6 controllerState projection is accepted as a host-local fallback source', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerState: {
        padMode: { right: 'beatjump' },
        jogCutter: { left: false },
        jogVinylMode: { left: true },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.right, 'beatjump_R', 'right fallback pad mode ');
    assertExclusiveLit(root, DECK_STATE_GROUP_IDS.left, 'vinyl_L', 'left fallback deck state ');
  });
});

test('FLX6 controllerVisualState has priority over controllerState projection data', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);

    consumeInfo({
      controllerVisualState: {
        padMode: { left: 'sampler' },
        jogCutter: { right: true },
        jogVinylMode: { right: false },
      },
      controllerState: {
        padMode: { left: 'hotcue' },
        jogCutter: { right: false },
        jogVinylMode: { right: true },
      },
    });

    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'sampler_L', 'priority pad mode ');
    assertExclusiveLit(root, DECK_STATE_GROUP_IDS.right, 'deck_layer_alt_R', 'priority deck state ');
  });
});

test('FLX6 visual-state projection mutates only board lit classes', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);
    const projection = Object.freeze({
      padMode: Object.freeze({ left: 'hotcue' }),
      jogCutter: Object.freeze({ right: false }),
      jogVinylMode: Object.freeze({ right: false }),
    });

    assert.equal(applyFlx6VisualStateProjection(projection), true);

    assert.deepEqual(projection, {
      padMode: { left: 'hotcue' },
      jogCutter: { right: false },
      jogVinylMode: { right: false },
    });
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'hotcue_L', 'direct projection pad mode ');
    assertExclusiveLit(root, DECK_STATE_GROUP_IDS.right, 'deck_layer_main_R', 'direct projection deck state ');
  });
});

test('FLX6 visual-state projection coexists with normal one-target event rendering', async () => {
  await withBoardRuntimeEnv(async () => {
    const root = createTargetFixture([...FLX6_VISUAL_TARGET_IDS, 'play_L']);
    setBoardSvgRoot(root);

    consumeInfo({
      type: 'noteon',
      value: 127,
      render: { targetId: 'play_L' },
      controllerState: {
        padMode: { left: 'sampler' },
      },
    });

    assert.equal(isLit(root, 'play_L'), true);
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'sampler_L', 'one-target coexistence ');
  });
});

test('FLX6 visual-state projection is board-local and does not send WebSocket payloads', async () => {
  await withBoardRuntimeEnv(async (env) => {
    const root = createTargetFixture();
    setBoardSvgRoot(root);
    let sendCount = 0;
    env.window.wsClient = {
      send() {
        sendCount += 1;
      },
    };

    consumeInfo({
      controllerVisualState: {
        padMode: { left: 'hotcue' },
        jogCutter: { right: true },
      },
    });

    assert.equal(sendCount, 0);
    assertExclusiveLit(root, PAD_MODE_GROUP_IDS.left, 'hotcue_L', 'local projection ');
    assertExclusiveLit(root, DECK_STATE_GROUP_IDS.right, 'deck_layer_alt_R', 'local projection ');
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
