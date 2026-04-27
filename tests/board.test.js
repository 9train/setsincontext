// tests/board.test.js (ESM)
// Uses Node's built-in test runner. Run with: node --test tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeRelative7,
  getContinuousRenderValue,
  getUnifiedMap,
  getLinearControlPosition,
  getLinearControlRatio,
  inspectBoardTarget,
  remergeLearned,
  resolveCanonicalRenderTargetId,
  resolveInfoRenderPlan,
  resolveInfoRenderTarget,
  resolveRenderTargetId,
  shouldHoldBinaryVisualState,
} from '../src/board.js';
import { setFileMapCache, setUnifiedMap } from '../src/board/state.js';
import { installMockBrowser } from './browser-test-helpers.js';

test('inputs 0 and 64 return 0', () => {
  assert.strictEqual(decodeRelative7(0), 0);
  assert.strictEqual(decodeRelative7(64), 0);
});

test('inputs 1..63 produce negative FLX6 steps', () => {
  for (let v = 1; v <= 63; v++) {
    assert.ok(decodeRelative7(v) < 0, `expected < 0 for v=${v}`);
  }
});

test('inputs 65..127 produce positive FLX6 steps', () => {
  assert.strictEqual(decodeRelative7(65), 1);
  for (let v = 65; v <= 127; v++) {
    assert.ok(decodeRelative7(v) > 0, `expected > 0 for v=${v}`);
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
  assert.strictEqual(resolveCanonicalRenderTargetId('mixer.channel.1.gain'), 'trim_1');
  assert.strictEqual(resolveCanonicalRenderTargetId('mixer.channel.2.filter'), 'filter_2');
  assert.strictEqual(resolveCanonicalRenderTargetId('mixer.channel.4.input_select'), 'channel_4');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.tempo.fader'), 'slider_TEMPO_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.jog.touch'), 'jog_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.transport.play'), 'play_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.transport.cue'), 'cue_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.loop.in'), 'loop_in_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.loop.in'), 'loop_in_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.transport.sync'), 'beatsync_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.transport.master'), 'master_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.pad_mode.keyboard'), 'hotcue_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.pad_mode.sample_scratch'), 'sampler_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.transport.layer'), 'decks_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.fx.quick'), 'knob_MERGEFX_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.fx.quick_select'), 'merge_button_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.loop.call.backward'), 'select_loop_call_LL');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.loop.memory'), 'loop_memory_R');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.left.pad_mode.hotcue'), 'hotcue_L');
  assert.strictEqual(resolveCanonicalRenderTargetId('deck.right.pad.8'), 'pad_R_8');
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
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.right.transport.load.alternate.release'),
    'load_4',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.right.transport.sync.alternate.press'),
    'beatsync_R',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.left.transport.master.main.shifted.press'),
    'master_L',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.right.pad_mode.sample_scratch.alternate.shifted.press'),
    'sampler_R',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.left.fx.quick_select.press'),
    'merge_button_L',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.left.loop.memory.main.press'),
    'loop_memory_L',
  );
  assert.strictEqual(
    resolveCanonicalRenderTargetId('', 'deck.left.pad.1.alternate.sampler.press'),
    'pad_L_1',
  );
});

test('board inspection keeps official FLX6 surface truth separate from draft and fallback mappings', () => {
  const inspection = inspectBoardTarget('play_L', [
    {
      key: 'noteon:1:11',
      target: 'play_L',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 11,
      name: 'Draft Play',
    },
    {
      key: 'noteon:1:12',
      target: 'play_L',
      ownership: 'fallback',
      type: 'noteon',
      ch: 1,
      code: 12,
      name: 'Legacy Play',
    },
    {
      key: 'noteon:1:13',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 13,
      name: 'Supplementary Play',
    },
  ]);

  assert.equal(inspection.targetId, 'play_L');
  assert.equal(inspection.label, 'Left Play');
  assert.equal(inspection.canonicalTarget, 'deck.left.transport.play');
  assert.equal(inspection.officialSource.status, 'official');
  assert.equal(inspection.officialSource.source, 'official-profile-ui');
  assert.equal(inspection.compatibilityMappings.length, 3);
  assert.equal(inspection.compatibilityMappings[0].ownership, 'draft');
  assert.equal(inspection.compatibilityMappings[0].key, 'noteon:1:11');
  assert.equal(inspection.compatibilityMappings[0].reviewStatus, 'shadowing-official');
  assert.equal(inspection.compatibilityMappings[0].reviewState, 'blocked');
  assert.equal(inspection.compatibilityMappings[1].reviewStatus, 'supplementary-canonical');
  assert.equal(inspection.compatibilityMappings[1].reviewState, 'blocked');
  assert.equal(inspection.compatibilityMappings[2].ownership, 'fallback');
  assert.equal(inspection.compatibilityMappings[2].reviewStatus, 'competing-surface');
  assert.equal(inspection.compatibilityMappings[2].reviewState, 'blocked');
  assert.equal(inspection.ownershipCounts.draft, 2);
  assert.equal(inspection.ownershipCounts.fallback, 1);
  assert.equal(inspection.mappingReview.authoritativeOwner, 'official');
  assert.equal(inspection.mappingReview.reviewState, 'blocked');
  assert.equal(inspection.mappingReview.shadowingCount, 1);
  assert.equal(inspection.mappingReview.competingCount, 1);
  assert.equal(inspection.mappingReview.supplementaryCount, 1);
  assert.equal(inspection.mappingReview.blockedCount, 3);
  assert.match(inspection.mappingReview.promotionBlockers[0], /resolve/i);
  assert.match(inspection.mappingReview.promotionRequirements[0], /Review each draft/i);
});

test('board inspection surfaces learn-draft provenance for provisional mappings', () => {
  const env = installMockBrowser();

  try {
    env.localStorage.setItem('controllerLearnDraft:pioneer-ddj-flx6', JSON.stringify({
      kind: 'controller-learn-draft',
      version: 1,
      profileId: 'pioneer-ddj-flx6',
      mode: 'single',
      createdAt: 10,
      updatedAt: 12,
      assignments: [],
      mappings: [{
        id: 'draft.deck.left.transport.play.noteon.1.11',
        raw: {
          transport: 'midi',
          kind: 'noteon',
          channel: 1,
          code: 11,
          key: 'noteon:1:11',
        },
        rawTarget: 'play_L',
        canonical: 'deck.left.transport.play',
        note: 'Captured while reviewing play ownership.',
        learn: {
          captureId: 'capture:11:1',
          sourceKey: 'noteon:1:11',
          assignedAt: 12,
          suggestedBy: 'normalized',
          existingMappingId: 'deck.left.transport.play.main.press',
        },
      }],
    }));

    const inspection = inspectBoardTarget('play_L', [{
      key: 'noteon:1:11',
      target: 'play_L',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 11,
      name: 'Draft Play',
    }]);

    assert.equal(inspection.compatibilityMappings[0].source, 'learn-draft');
    assert.equal(inspection.compatibilityMappings[0].learn.suggestedBy, 'normalized');
    assert.equal(inspection.compatibilityMappings[0].learn.existingMappingId, 'deck.left.transport.play.main.press');
    assert.match(inspection.compatibilityMappings[0].whyExists, /reviewing play ownership/i);
    assert.match(inspection.compatibilityMappings[0].authorityNote, /must not be mistaken for shipped truth/i);
    assert.equal(inspection.compatibilityMappings[0].reviewState, 'blocked');
  } finally {
    env.restore();
  }
});

test('board inspection marks draft-only compatibility entries as inspectable until review evidence is attached', () => {
  const inspection = inspectBoardTarget('mystery_pad', [{
    key: 'noteon:1:21',
    target: 'mystery_pad',
    ownership: 'draft',
    canonicalTarget: 'deck.left.pad.1',
    type: 'noteon',
    ch: 1,
    code: 21,
    name: 'Loose Draft Pad',
  }]);

  assert.equal(inspection.officialSource.status, 'unknown');
  assert.equal(inspection.compatibilityMappings.length, 1);
  assert.equal(inspection.compatibilityMappings[0].reviewStatus, 'compatibility-owner');
  assert.equal(inspection.compatibilityMappings[0].reviewState, 'inspectable-only');
  assert.equal(inspection.compatibilityMappings[0].reviewReady, false);
  assert.match(inspection.compatibilityMappings[0].reviewRequirements[0], /learn-session evidence/i);
  assert.equal(inspection.mappingReview.reviewState, 'inspectable-only');
  assert.equal(inspection.mappingReview.inspectableOnlyCount, 1);
  assert.equal(inspection.mappingReview.reviewCandidateCount, 0);
});

test('board inspection marks learned draft compatibility entries as review candidates without treating them as shipped truth', () => {
  const env = installMockBrowser();

  try {
    env.localStorage.setItem('controllerLearnDraft:pioneer-ddj-flx6', JSON.stringify({
      kind: 'controller-learn-draft',
      version: 1,
      profileId: 'pioneer-ddj-flx6',
      mode: 'single',
      createdAt: 10,
      updatedAt: 12,
      assignments: [],
      mappings: [{
        id: 'draft.deck.left.transport.play.noteon.1.31',
        raw: {
          transport: 'midi',
          kind: 'noteon',
          channel: 1,
          code: 31,
          key: 'noteon:1:31',
        },
        rawTarget: 'mystery_transport',
        canonical: 'deck.left.transport.play',
        note: 'Candidate for official transport review.',
        learn: {
          captureId: 'capture:31:1',
          sourceKey: 'noteon:1:31',
          assignedAt: 12,
          suggestedBy: 'normalized',
          existingMappingId: null,
        },
      }],
    }));

    const inspection = inspectBoardTarget('mystery_transport', [{
      key: 'noteon:1:31',
      target: 'mystery_transport',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 31,
      name: 'Candidate Draft Play',
    }]);

    assert.equal(inspection.officialSource.status, 'unknown');
    assert.equal(inspection.compatibilityMappings[0].reviewStatus, 'compatibility-owner');
    assert.equal(inspection.compatibilityMappings[0].reviewState, 'review-candidate');
    assert.equal(inspection.compatibilityMappings[0].reviewReady, true);
    assert.deepEqual(inspection.compatibilityMappings[0].promotionBlockers, []);
    assert.match(inspection.compatibilityMappings[0].reviewStateSummary, /review-ready/i);
    assert.equal(inspection.mappingReview.reviewState, 'review-candidate');
    assert.equal(inspection.mappingReview.reviewCandidateCount, 1);
    assert.match(inspection.mappingReview.promotionRequirements[0], /Review each draft/i);
    assert.match(inspection.mappingReview.promotionRequirements[1], /official FLX6 target\/profile definition/i);
  } finally {
    env.restore();
  }
});

test('default FLX6 board resolution requires an official resolved render target instead of inferring one from canonical meaning', () => {
  const rawMap = [{ key: 'cc:9:99', target: 'slider_ch4' }];
  const info = {
    canonicalTarget: 'mixer.channel.1.fader',
    mappingId: 'mixer.channel.1.fader.primary',
    type: 'cc',
    ch: 9,
    controller: 99,
    value: 64,
  };

  assert.deepEqual(resolveInfoRenderPlan(info, rawMap), {
    targetId: null,
    authority: 'official-missing',
    source: 'resolved-render-target-required',
    fallbackReason: 'official-render-target-required',
    canonicalTarget: 'mixer.channel.1.fader',
    mappingId: 'mixer.channel.1.fader.primary',
    context: null,
    profileId: null,
    ownership: 'official',
    fallback: false,
    compatibility: false,
    blocked: true,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), null);
});

test('board target resolution honors an explicit resolved render target before canonical fallback', () => {
  const rawMap = [{ key: 'noteon:3:60', target: 'pad_L_1' }];
  const info = {
    canonicalTarget: 'deck.left.transport.layer.status.alternate',
    mappingId: 'deck.left.transport.layer.status.alternate.on',
    render: {
      targetId: 'decks_L',
      canonicalTarget: 'deck.left.transport.layer.status.alternate',
      mappingId: 'deck.left.transport.layer.status.alternate.on',
    },
    type: 'noteon',
    ch: 3,
    d1: 60,
    d2: 127,
    value: 127,
  };

  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), 'decks_L');
});

test('blocked official render results stay authoritative instead of rehydrating through canonical fallback', () => {
  const rawMap = [{ key: 'noteon:1:11', target: 'play_R' }];
  const info = {
    canonicalTarget: 'deck.left.transport.play',
    mappingId: 'deck.left.transport.play.main.press',
    render: {
      targetId: null,
      canonicalTarget: 'deck.left.transport.play',
      mappingId: 'deck.left.transport.play.main.press',
      truthStatus: 'blocked',
      source: 'no-official-render-target',
    },
    type: 'noteon',
    ch: 1,
    d1: 11,
    d2: 127,
    value: 127,
  };

  assert.deepEqual(resolveInfoRenderPlan(info, rawMap), {
    targetId: null,
    authority: 'official-missing',
    source: 'no-official-render-target',
    fallbackReason: 'official-render-blocked',
    canonicalTarget: 'deck.left.transport.play',
    mappingId: 'deck.left.transport.play.main.press',
    context: null,
    profileId: null,
    ownership: 'official',
    fallback: false,
    compatibility: false,
    blocked: true,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), null);
});

test('default board resolution ignores canonical fallback candidates even when learned maps suggest conflicting targets', () => {
  const badMap = [
    { key: 'cc:7:31', target: 'jog_R' },
    { key: 'cc:1:33', target: 'xfader_slider' },
  ];

  assert.strictEqual(resolveInfoRenderTarget({
    canonicalTarget: 'mixer.crossfader',
    mappingId: 'mixer.crossfader.primary',
    type: 'cc',
    ch: 7,
    controller: 31,
    value: 64,
  }, badMap), null);

  assert.strictEqual(resolveInfoRenderTarget({
    canonicalTarget: 'deck.left.jog.motion',
    mappingId: 'deck.left.jog.motion.primary',
    type: 'cc',
    ch: 1,
    controller: 33,
    value: 65,
  }, badMap), null);
});

test('bare boardCompat no longer becomes render authority for jog motion', () => {
  const info = {
    canonicalTarget: 'deck.left.jog.motion',
    mappingId: 'deck.left.jog.motion.primary',
    type: 'cc',
    ch: 1,
    controller: 33,
    d1: 33,
    d2: 65,
    value: 65,
    boardCompat: {
      targetId: 'xfader_slider',
      source: 'compatibility-test',
      reason: 'compat-test',
    },
  };

  assert.deepEqual(resolveInfoRenderPlan(info, []), {
    targetId: null,
    authority: 'official-missing',
    source: 'resolved-render-target-required',
    fallbackReason: 'official-render-target-required',
    canonicalTarget: 'deck.left.jog.motion',
    mappingId: 'deck.left.jog.motion.primary',
    context: null,
    profileId: null,
    ownership: 'official',
    fallback: false,
    compatibility: false,
    blocked: true,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, []), null);
});

test('jog touch and jog cutter compatibility targets cannot resolve to the physical crossfader', () => {
  const cases = [
    {
      label: 'jog touch board compatibility',
      info: {
        canonicalTarget: 'deck.left.jog.touch',
        mappingId: 'deck.left.jog.touch.press',
        type: 'noteon',
        ch: 1,
        d1: 54,
        d2: 127,
        value: 127,
        boardCompat: {
          targetId: 'xfader_slider',
          source: 'compatibility-test',
          reason: 'compat-test',
        },
      },
    },
    {
      label: 'jog cutter debug target',
      info: {
        __flxDebug: true,
        __flxDebugTarget: 'xfader_slider',
        canonicalTarget: 'deck.left.jog.cutter',
        mappingId: 'deck.left.jog.cutter.main.press',
        type: 'noteon',
        ch: 1,
        d1: 28,
        d2: 127,
        value: 127,
      },
    },
  ];

  cases.forEach(({ label, info }) => {
    assert.strictEqual(resolveInfoRenderTarget(info, []), null, label);
  });
});

test('default board resolution ignores raw learned-map crossfader candidates on both unofficial and official lanes', () => {
  const badMap = [{ key: 'cc:1:33', target: 'xfader_slider' }];

  assert.deepEqual(resolveInfoRenderPlan({
    type: 'cc',
    ch: 1,
    controller: 33,
    d1: 33,
    d2: 65,
    value: 65,
  }, badMap), {
    targetId: null,
    authority: 'unmapped',
    source: 'unmapped',
    fallbackReason: null,
    canonicalTarget: null,
    mappingId: null,
    context: null,
    profileId: null,
    ownership: 'unknown',
    fallback: false,
    compatibility: false,
    blocked: false,
  });

  const goodMap = [
    { key: 'cc:7:31', target: 'xfader_slider' },
    { key: 'cc:7:63', target: 'xfader_slider' },
  ];

  assert.strictEqual(resolveInfoRenderTarget({
    type: 'cc',
    ch: 7,
    controller: 31,
    d1: 31,
    d2: 64,
    value: 64,
  }, goodMap), null);

  assert.strictEqual(resolveInfoRenderTarget({
    type: 'cc',
    ch: 7,
    controller: 63,
    d1: 63,
    d2: 32,
    value: 32,
  }, goodMap), null);
});

test('default FLX6 board resolution ignores raw learned-map targets with no official render ownership', () => {
  const rawMap = [{ key: 'noteon:1:11', target: 'play_L' }];
  const info = { type: 'noteon', ch: 1, d1: 11, d2: 127, value: 127 };

  assert.deepEqual(resolveInfoRenderPlan(info, rawMap), {
    targetId: null,
    authority: 'unmapped',
    source: 'unmapped',
    fallbackReason: null,
    canonicalTarget: null,
    mappingId: null,
    context: null,
    profileId: null,
    ownership: 'unknown',
    fallback: false,
    compatibility: false,
    blocked: false,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), null);
});

test('localStorage learned maps stay draft diagnostic-only even if they claim official ownership', () => {
  const env = installMockBrowser();

  try {
    setFileMapCache([]);
    setUnifiedMap([]);
    env.localStorage.setItem('flx.learned.map.v1', JSON.stringify([{
      key: 'noteon:1:77',
      target: 'play_L',
      ownership: 'official',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 77,
      name: 'Claimed Official Play',
    }]));

    remergeLearned();
    const learnedMap = getUnifiedMap();
    assert.equal(learnedMap.length, 1);
    assert.equal(learnedMap[0].ownership, 'draft');

    const rawInfo = { type: 'noteon', ch: 1, d1: 77, d2: 127, value: 127 };
    assert.deepEqual(resolveInfoRenderPlan(rawInfo, learnedMap), {
      targetId: null,
      authority: 'unmapped',
      source: 'unmapped',
      fallbackReason: null,
      canonicalTarget: null,
      mappingId: null,
      context: null,
      profileId: null,
      ownership: 'unknown',
      fallback: false,
      compatibility: false,
      blocked: false,
    });

    const inspection = inspectBoardTarget('play_L', learnedMap);
    assert.equal(inspection.officialSource.status, 'official');
    assert.equal(inspection.compatibilityMappings.length, 1);
    assert.equal(inspection.compatibilityMappings[0].ownership, 'draft');
    assert.equal(inspection.compatibilityMappings[0].reviewStatus, 'shadowing-official');
    assert.equal(inspection.mappingReview.authoritativeOwner, 'official');
  } finally {
    setFileMapCache([]);
    setUnifiedMap([]);
    env.restore();
  }
});

test('raw learned-map fallback is suppressed when official controller meaning exists but no board render target does', () => {
  const rawMap = [{ key: 'cc:7:64', target: 'jog_L' }];
  const info = {
    canonicalTarget: 'browser.scroll',
    mappingId: 'browser.scroll.primary',
    type: 'cc',
    ch: 7,
    controller: 64,
    value: 65,
  };

  assert.deepEqual(resolveInfoRenderPlan(info, rawMap), {
    targetId: null,
    authority: 'official-missing',
    source: 'no-official-render-target',
    fallbackReason: 'official-meaning-without-render-target',
    canonicalTarget: 'browser.scroll',
    mappingId: 'browser.scroll.primary',
    context: null,
    profileId: null,
    ownership: 'official',
    fallback: false,
    compatibility: false,
    blocked: true,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, rawMap), null);
});

test('explicit debug targets remain renderable as a named compatibility path', () => {
  const info = {
    __flxDebug: true,
    __flxDebugTarget: 'play_L',
    canonicalTarget: 'deck.left.transport.play',
    mappingId: 'deck.left.transport.play.main.press',
    type: 'noteon',
    ch: 1,
    d1: 11,
    d2: 127,
    value: 127,
  };

  assert.deepEqual(resolveInfoRenderPlan(info, []), {
    targetId: 'play_L',
    authority: 'compatibility-render',
    source: 'debug-explicit-target',
    fallbackReason: 'debug-only-visible-control',
    canonicalTarget: 'deck.left.transport.play',
    mappingId: 'deck.left.transport.play.main.press',
    context: null,
    profileId: null,
    ownership: 'fallback',
    fallback: true,
    compatibility: true,
    blocked: false,
  });
  assert.strictEqual(resolveInfoRenderTarget(info, []), 'play_L');
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

test('paired absolute controls refine crossfader and channel controls without treating the fine lane as a separate jump', () => {
  const state = Object.create(null);
  const crossfader = { target: 'xfader_slider' };
  const channelFader = { target: 'slider_ch1' };

  assert.strictEqual(
    getContinuousRenderValue(crossfader, {
      value: 64,
      d2: 64,
      ch: 7,
      controller: 31,
      mappingId: 'mixer.crossfader.primary',
      valueShape: 'absolute',
    }, state),
    64,
  );
  assert.strictEqual(
    getContinuousRenderValue(crossfader, {
      value: 32,
      d2: 32,
      ch: 7,
      controller: 63,
      mappingId: 'mixer.crossfader.secondary',
      valueShape: 'absolute',
    }, state),
    64.25,
  );

  assert.strictEqual(
    getContinuousRenderValue(channelFader, {
      value: 96,
      d2: 96,
      ch: 1,
      controller: 19,
      mappingId: 'mixer.channel.1.fader.primary',
      valueShape: 'absolute',
    }, state),
    96,
  );
  assert.strictEqual(
    getContinuousRenderValue(channelFader, {
      value: 64,
      d2: 64,
      ch: 1,
      controller: 51,
      mappingId: 'mixer.channel.1.fader.secondary',
      valueShape: 'absolute',
    }, state),
    96.5,
  );
});

test('paired absolute fine lanes wait for their matching primary lane before moving the rendered control', () => {
  const state = Object.create(null);
  const knob = { target: 'trim_1' };

  assert.strictEqual(
    getContinuousRenderValue(knob, {
      value: 90,
      d2: 90,
      ch: 1,
      controller: 36,
      mappingId: 'mixer.channel.1.gain.secondary',
      valueShape: 'absolute',
    }, state),
    null,
  );

  assert.strictEqual(
    getContinuousRenderValue(knob, {
      value: 20,
      d2: 20,
      ch: 1,
      controller: 4,
      mappingId: 'mixer.channel.1.gain.primary',
      valueShape: 'absolute',
    }, state),
    20.703125,
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

test('mapped binary controls stay visually held until release while legacy flashes still fall back to pulse mode', () => {
  assert.equal(shouldHoldBinaryVisualState({
    mapped: true,
    valueShape: 'binary',
    type: 'noteon',
  }), true);

  assert.equal(shouldHoldBinaryVisualState({
    mapped: true,
    valueShape: 'binary',
    interaction: 'noteoff',
  }), true);

  assert.equal(shouldHoldBinaryVisualState({
    mapped: false,
    valueShape: 'binary',
    type: 'noteon',
  }), false);

  assert.equal(shouldHoldBinaryVisualState({
    mapped: true,
    valueShape: 'absolute',
    type: 'noteon',
  }), false);
});
