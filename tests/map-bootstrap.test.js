import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptDraftMapCandidate,
  installDraftMapCandidateBootstrap,
  loadDraftMapCandidate,
  MAP_CACHE_KEY,
} from '../src/map-bootstrap.js';
import { installMockBrowser } from './browser-test-helpers.js';

test('acceptDraftMapCandidate records remote maps as diagnostic draft metadata', () => {
  const env = installMockBrowser();
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  const expectedMap = [{ key: 'cc:1:22', target: 'jog_L', ownership: 'draft' }];

  try {
    assert.equal(acceptDraftMapCandidate(map), true);
    assert.deepEqual(env.window.__currentMap, expectedMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.window.__currentMapRuntimeAuthority, false);
    assert.equal(env.window.__currentMapMetadata.controllerTruth, false);
    assert.equal(env.window.__currentMapMetadata.diagnosticOnly, true);
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedMap));
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:draft-map-candidate');
    assert.deepEqual(env.dispatchedEvents[0].detail.map, expectedMap);
    assert.equal(env.dispatchedEvents[0].detail.metadata.controllerTruth, false);
  } finally {
    env.restore();
  }
});

test('empty remote maps cannot wipe the current learned-map metadata', () => {
  const env = installMockBrowser();
  const currentMap = [{ key: 'cc:1:22', target: 'jog_L' }];
  const expectedMap = [{ key: 'cc:1:22', target: 'jog_L', ownership: 'draft' }];

  try {
    assert.equal(acceptDraftMapCandidate(currentMap), true);
    assert.equal(acceptDraftMapCandidate([]), false);
    assert.equal(acceptDraftMapCandidate({}), false);

    assert.deepEqual(env.window.__currentMap, expectedMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedMap));
    assert.equal(env.dispatchedEvents.length, 1);
  } finally {
    env.restore();
  }
});

test('remote and cached learned maps cannot claim official ownership', async () => {
  const env = installMockBrowser();
  const claimedOfficialMap = [{
    key: 'noteon:1:11',
    target: 'play_L',
    ownership: 'official',
  }];
  const expectedDraftMap = [{
    key: 'noteon:1:11',
    target: 'play_L',
    ownership: 'draft',
  }];

  try {
    assert.equal(acceptDraftMapCandidate(claimedOfficialMap), true);
    assert.deepEqual(env.window.__currentMap, expectedDraftMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.window.__currentMapRuntimeAuthority, false);
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedDraftMap));

    const cachedMap = await loadDraftMapCandidate();
    assert.deepEqual(cachedMap, expectedDraftMap);
  } finally {
    env.restore();
  }
});

test('loadDraftMapCandidate prefers cached learned map before static fallback', async () => {
  let fetchCalls = 0;
  const env = installMockBrowser({
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => [{ key: 'cc:1:99', target: 'jog_R' }] };
    },
  });
  const cached = [{ key: 'cc:1:22', target: 'jog_L' }];
  const expectedCached = [{ key: 'cc:1:22', target: 'jog_L', ownership: 'draft' }];
  env.localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(cached));

  try {
    const map = await loadDraftMapCandidate();
    assert.deepEqual(map, expectedCached);
    assert.equal(fetchCalls, 0);
  } finally {
    env.restore();
  }
});

test('draft candidate bootstrap can load a static/default fallback map for diagnostics', async () => {
  const fallbackMap = [{ key: 'cc:1:77', target: 'jog_L' }];
  const expectedMap = [{ key: 'cc:1:77', target: 'jog_L', ownership: 'fallback' }];
  const env = installMockBrowser({
    fetchImpl: async () => ({ ok: true, json: async () => fallbackMap }),
  });

  try {
    installDraftMapCandidateBootstrap({ delayMs: 1 });
    await env.runAllTimeouts();

    assert.deepEqual(env.window.__currentMap, expectedMap);
    assert.equal(env.window.__currentMapOwnership, 'fallback');
    assert.equal(env.window.__currentMapRuntimeAuthority, false);
    assert.equal(env.window.__currentMapMetadata.label, 'fallback candidate');
    assert.equal(env.window.__currentMapMetadata.controllerTruth, false);
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedMap));
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:draft-map-candidate');
    assert.deepEqual(env.dispatchedEvents[0].detail.map, expectedMap);
  } finally {
    env.restore();
  }
});

test('draft candidate bootstrap does not overwrite a newer remote draft candidate', async () => {
  let fetchCalls = 0;
  const fallbackMap = [{ key: 'cc:1:10', target: 'jog_L' }];
  const remoteMap = [{ key: 'cc:1:11', target: 'jog_R' }];
  const expectedRemoteMap = [{ key: 'cc:1:11', target: 'jog_R', ownership: 'draft' }];
  const env = installMockBrowser({
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => fallbackMap };
    },
  });

  try {
    installDraftMapCandidateBootstrap({ delayMs: 1 });
    acceptDraftMapCandidate(remoteMap);
    await env.runAllTimeouts();

    assert.deepEqual(env.window.__currentMap, expectedRemoteMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedRemoteMap));
    assert.equal(fetchCalls, 0);
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:draft-map-candidate');
    assert.deepEqual(env.dispatchedEvents[0].detail.map, expectedRemoteMap);
  } finally {
    env.restore();
  }
});

test('draft candidate bootstrap stays stable when no map is available', async () => {
  const env = installMockBrowser({
    fetchImpl: async () => ({ ok: false, json: async () => null }),
  });

  try {
    installDraftMapCandidateBootstrap({ delayMs: 1 });
    await env.runAllTimeouts();

    assert.equal(env.window.__currentMap, undefined);
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), null);
    assert.equal(env.dispatchedEvents.length, 0);
  } finally {
    env.restore();
  }
});
