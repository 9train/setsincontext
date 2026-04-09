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
    const learn = await importFresh('../src/learn.js');
    const waitForCapture = learn.learnNext({
      target: 'play_L',
      name: 'play_L',
      timeoutMs: 100,
    });

    env.window.FLX_LEARN_HOOK({
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

    assert.equal(savedDraft.kind, 'controller-learn-draft');
    assert.equal(savedDraft.profileId, 'pioneer-ddj-flx6');
    assert.equal(savedDraft.mappings.length, 1);
    assert.equal(savedDraft.mappings[0].canonical, 'deck.left.transport.play');
    assert.equal(savedDraft.mappings[0].raw.key, 'noteon:1:11');
  } finally {
    env.restore();
  }
});
