import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockBrowser } from './browser-test-helpers.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

test('learnNext captures through the controller-layer session while keeping the legacy learned-map fallback', async () => {
  const env = installMockBrowser({
    elementIds: ['play_L'],
  });
  env.elements.play_L.classList = {
    add() {},
    remove() {},
  };

  try {
    const [{ getRuntimeApp }, learn] = await Promise.all([
      importFresh('../src/runtime/app-bridge.js'),
      importFresh('../src/learn.js'),
    ]);
    const runtimeApp = getRuntimeApp();
    const waitForCapture = learn.learnNext({
      target: 'play_L',
      name: 'play_L',
      timeoutMs: 100,
    });

    runtimeApp.emitLearnInput({
      eventType: 'normalized_input',
      profileId: 'pioneer-ddj-flx6',
      canonicalTarget: 'deck.left.transport.play',
      mappingId: 'deck.left.transport.play.main.press',
      rawTarget: 'play_L',
      context: { deckLayer: 'main' },
      mapped: true,
      interaction: 'noteon',
      type: 'noteon',
      ch: 1,
      d1: 11,
      d2: 127,
      value: 127,
      timestamp: 10,
      raw: {
        eventType: 'raw_input',
        transport: 'midi',
        profileId: 'pioneer-ddj-flx6',
        sourceId: 'Pioneer DDJ-FLX6',
        interaction: 'noteon',
        channel: 1,
        code: 11,
        value: 127,
        data1: 11,
        data2: 127,
        key: 'noteon:1:11',
        timestamp: 10,
      },
    });

    const entry = await waitForCapture;
    const savedLegacy = JSON.parse(env.localStorage.getItem(learn.LEARNED_MAPPINGS_KEY));
    const savedBoardMap = JSON.parse(env.localStorage.getItem('flx.learned.map.v1'));
    const savedDraft = JSON.parse(
      env.localStorage.getItem(learn.getControllerLearnDraftStorageKey('pioneer-ddj-flx6'))
    );

    assert.equal(entry.target, 'play_L');
    assert.equal(entry.canonicalTarget, 'deck.left.transport.play');
    assert.equal(entry.draft.canonical, 'deck.left.transport.play');
    assert.equal(entry.learnDraft.kind, 'controller-learn-draft');

    assert.equal(savedLegacy.length, 1);
    assert.equal(savedLegacy[0].target, 'play_L');
    assert.equal(savedLegacy[0].canonicalTarget, 'deck.left.transport.play');
    assert.equal(savedLegacy[0].mappingId, 'deck.left.transport.play.main.press');
    assert.equal(savedLegacy[0].rawTarget, 'play_L');
    assert.equal('draft' in savedLegacy[0], false);
    assert.equal('learnDraft' in savedLegacy[0], false);

    assert.equal(savedBoardMap.length, 1);
    assert.equal(savedBoardMap[0].target, 'play_L');
    assert.equal(savedBoardMap[0].canonicalTarget, 'deck.left.transport.play');
    assert.equal(savedBoardMap[0].mappingId, 'deck.left.transport.play.main.press');

    assert.equal(savedDraft.kind, 'controller-learn-draft');
    assert.equal(savedDraft.profileId, 'pioneer-ddj-flx6');
    assert.equal(savedDraft.mappings.length, 1);
    assert.equal(savedDraft.mappings[0].canonical, 'deck.left.transport.play');
    assert.equal(savedDraft.mappings[0].raw.key, 'noteon:1:11');
    assert.ok(env.dispatchedEvents.some((event) => event.type === 'flx:map-updated'));
  } finally {
    env.restore();
  }
});

test('draft review export stays draft-only and can scope to the selected target', async () => {
  const env = installMockBrowser();

  try {
    env.localStorage.setItem('flx.learned.map.v1', JSON.stringify([
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
        key: 'cc:1:22',
        target: 'cue_L',
        ownership: 'draft',
        canonicalTarget: 'deck.left.transport.cue',
        type: 'cc',
        ch: 1,
        code: 22,
        name: 'Draft Cue',
      },
    ]));
    env.localStorage.setItem('controllerLearnDraft:pioneer-ddj-flx6', JSON.stringify({
      kind: 'controller-learn-draft',
      version: 1,
      profileId: 'pioneer-ddj-flx6',
      mode: 'single',
      createdAt: 10,
      updatedAt: 20,
      assignments: [
        {
          captureId: 'capture:11:1',
          canonicalTarget: 'deck.left.transport.play',
        },
        {
          captureId: 'capture:22:1',
          canonicalTarget: 'deck.left.transport.cue',
        },
      ],
      mappings: [
        {
          id: 'draft.deck.left.transport.play.noteon.1.11',
          rawTarget: 'play_L',
          canonical: 'deck.left.transport.play',
          raw: {
            key: 'noteon:1:11',
            channel: 1,
            code: 11,
          },
          learn: {
            captureId: 'capture:11:1',
            sourceKey: 'noteon:1:11',
          },
        },
        {
          id: 'draft.deck.left.transport.cue.cc.1.22',
          rawTarget: 'cue_L',
          canonical: 'deck.left.transport.cue',
          raw: {
            key: 'cc:1:22',
            channel: 1,
            code: 22,
          },
          learn: {
            captureId: 'capture:22:1',
            sourceKey: 'cc:1:22',
          },
        },
      ],
    }));

    const learn = await importFresh('../src/learn.js');
    const artifact = learn.buildDraftReviewArtifact({
      targetId: 'play_L',
      canonicalTarget: 'deck.left.transport.play',
    });

    assert.equal(artifact.kind, 'flx6-draft-review');
    assert.equal(artifact.safety.officialProfileIncluded, false);
    assert.equal(artifact.scope.mode, 'selected-target');
    assert.equal(artifact.scope.targetId, 'play_L');
    assert.equal(artifact.scope.canonicalTarget, 'deck.left.transport.play');
    assert.equal(artifact.summary.boardDraftCount, 1);
    assert.equal(artifact.summary.learnDraftMappingCount, 1);
    assert.equal(artifact.summary.rawLaneCount, 1);
    assert.equal(artifact.boardDraftMappings.length, 1);
    assert.equal(artifact.boardDraftMappings[0].target, 'play_L');
    assert.equal(artifact.learnDraft.mappings.length, 1);
    assert.equal(artifact.learnDraft.mappings[0].rawTarget, 'play_L');
    assert.match(artifact.safety.description, /official FLX6 profile truth is intentionally excluded/i);
  } finally {
    env.restore();
  }
});
