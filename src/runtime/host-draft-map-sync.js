// Host draft/provisional map metadata sync for learn/review tools.
// This module does not apply maps to rendering and does not make draft maps
// official controller truth.

export function pushDraftMapMetadata({
  runtimeApp,
  loadMappings,
  now = Date.now,
  consoleRef = console,
} = {}) {
  try {
    const draftMapArray = loadMappings?.() || [];
    const wsClient = runtimeApp?.getWSClient?.();

    if (wsClient?.sendMap) {
      wsClient.sendMap(draftMapArray);
    } else if (wsClient?.send) {
      wsClient.send({ type: 'map:set', map: draftMapArray, ts: now() });
    }

    return draftMapArray;
  } catch (e) {
    consoleRef?.warn?.('[host] draft map sync failed', e);
    return [];
  }
}

export function initHostDraftMapSync({
  runtimeApp,
  loadMappings,
  windowRef = typeof window !== 'undefined' ? window : null,
  setTimeoutRef = typeof setTimeout !== 'undefined' ? setTimeout : null,
  delayMs = 250,
  now = Date.now,
  consoleRef = console,
} = {}) {
  const pushNow = () => pushDraftMapMetadata({
    runtimeApp,
    loadMappings,
    now,
    consoleRef,
  });

  setTimeoutRef?.(pushNow, delayMs);
  windowRef?.addEventListener?.('flx:map-updated', pushNow);

  return {
    pushNow,
    dispose() {
      windowRef?.removeEventListener?.('flx:map-updated', pushNow);
    },
  };
}
