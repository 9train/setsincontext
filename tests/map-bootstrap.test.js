import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRemoteMap,
  installFallbackMapBootstrap,
  loadFallbackMap,
  MAP_CACHE_KEY,
} from '../src/map-bootstrap.js';
import { installMockBrowser } from './browser-test-helpers.js';

test('applyRemoteMap is the canonical remote map applier', () => {
  const env = installMockBrowser();
  const map = [{ key: 'cc:1:22', target: 'jog_L' }];
  const expectedMap = [{ key: 'cc:1:22', target: 'jog_L', ownership: 'draft' }];

  try {
    assert.equal(applyRemoteMap(map), true);
    assert.deepEqual(env.window.__currentMap, expectedMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedMap));
    assert.equal(env.dispatchedEvents.length, 1);
    assert.equal(env.dispatchedEvents[0].type, 'flx:remote-map');
    assert.deepEqual(env.dispatchedEvents[0].detail, expectedMap);
  } finally {
    env.restore();
  }
});

test('loadFallbackMap prefers cached learned map before static fallback', async () => {
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
    const map = await loadFallbackMap();
    assert.deepEqual(map, expectedCached);
    assert.equal(fetchCalls, 0);
  } finally {
    env.restore();
  }
});

test('fallback bootstrap can apply a static/default learned map', async () => {
  const fallbackMap = [{ key: 'cc:1:77', target: 'jog_L' }];
  const expectedMap = [{ key: 'cc:1:77', target: 'jog_L', ownership: 'fallback' }];
  const env = installMockBrowser({
    fetchImpl: async () => ({ ok: true, json: async () => fallbackMap }),
  });

  try {
    installFallbackMapBootstrap({ delayMs: 1 });
    await env.runAllTimeouts();

    assert.deepEqual(env.window.__currentMap, expectedMap);
    assert.equal(env.window.__currentMapOwnership, 'fallback');
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedMap));
    assert.equal(env.dispatchedEvents.length, 1);
    assert.deepEqual(env.dispatchedEvents[0].detail, expectedMap);
  } finally {
    env.restore();
  }
});

test('fallback bootstrap does not overwrite a newer remote map', async () => {
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
    installFallbackMapBootstrap({ delayMs: 1 });
    applyRemoteMap(remoteMap);
    await env.runAllTimeouts();

    assert.deepEqual(env.window.__currentMap, expectedRemoteMap);
    assert.equal(env.window.__currentMapOwnership, 'draft');
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), JSON.stringify(expectedRemoteMap));
    assert.equal(fetchCalls, 0);
    assert.equal(env.dispatchedEvents.length, 1);
    assert.deepEqual(env.dispatchedEvents[0].detail, expectedRemoteMap);
  } finally {
    env.restore();
  }
});

test('fallback bootstrap stays stable when no map is available', async () => {
  const env = installMockBrowser({
    fetchImpl: async () => ({ ok: false, json: async () => null }),
  });

  try {
    installFallbackMapBootstrap({ delayMs: 1 });
    await env.runAllTimeouts();

    assert.equal(env.window.__currentMap, undefined);
    assert.equal(env.localStorage.getItem(MAP_CACHE_KEY), null);
    assert.equal(env.dispatchedEvents.length, 0);
  } finally {
    env.restore();
  }
});
