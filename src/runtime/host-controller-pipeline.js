export function normalizeHostInfo(x) {
  if (!x || typeof x !== 'object') return x;

  if (x.type && typeof x.payload === 'object') {
    const t = String(x.type).toLowerCase();
    if (t === 'midi_like' || t === 'midi' || t === 'info') {
      x = x.payload;
    }
  }

  const info = { ...x };
  const t = String(info.type || '').toLowerCase();

  if (t === 'cc') {
    const d1 = info.d1 ?? info.controller ?? 0;
    const d2 = info.d2 ?? info.value ?? 0;
    info.controller = d1;
    info.value = d2;
    info.d1 = d1;
    info.d2 = d2;
    info.type = 'cc';
    return info;
  }

  if (t === 'noteon' || t === 'noteoff') {
    info.d1 = info.d1 ?? info.code ?? 0;
    info.d2 = info.d2 ?? info.value ?? 0;
    return info;
  }

  if (t === 'midi') {
    const mt = String(info.mtype || '').toLowerCase();
    if (mt === 'cc') {
      info.type = 'cc';
      const d1 = info.d1 ?? info.controller ?? info.code ?? 0;
      const d2 = info.d2 ?? info.value ?? 0;
      info.controller = d1;
      info.value = d2;
      info.d1 = d1;
      info.d2 = d2;
      return info;
    }
    if (mt === 'noteon' || mt === 'noteoff') {
      info.type = mt;
      info.d1 = info.d1 ?? info.code ?? 0;
      info.d2 = info.d2 ?? info.value ?? 0;
      return info;
    }
  }

  return info;
}

export function extractHostControllerDetails(info) {
  return {
    deviceName: info?.deviceName || info?.device?.inputName || info?.device?.name || null,
    profileId: info?.profileId || info?.device?.profileId || info?.profile?.id || null,
    profileLabel: info?.profile?.displayName || null,
    transport: info?.transport || info?.device?.transport || 'midi',
    ready: true,
    timestamp: info?.timestamp,
  };
}

function assertRuntimeApp(runtimeApp) {
  if (!runtimeApp || typeof runtimeApp !== 'object') {
    throw new TypeError('initHostControllerPipeline requires a runtimeApp object');
  }
  if (typeof runtimeApp.setNormalizer !== 'function') {
    throw new TypeError('initHostControllerPipeline requires runtimeApp.setNormalizer');
  }
  if (typeof runtimeApp.setInfoConsumer !== 'function') {
    throw new TypeError('initHostControllerPipeline requires runtimeApp.setInfoConsumer');
  }
}

export function initHostControllerPipeline({
  runtimeApp,
  boardConsume,
  hostStatus,
} = {}) {
  assertRuntimeApp(runtimeApp);

  let lastBoardResult;

  function consumeHostInfo(info) {
    hostStatus?.noteControllerDetails?.(extractHostControllerDetails(info));

    const wsClient = runtimeApp.getWSClient?.();
    if (wsClient?.isAlive?.()) {
      wsClient.send?.(info);
    }

    lastBoardResult = typeof boardConsume === 'function'
      ? boardConsume(info)
      : undefined;
    hostStatus?.refresh?.();
    return lastBoardResult;
  }

  runtimeApp.setNormalizer(normalizeHostInfo);
  runtimeApp.setInfoConsumer(consumeHostInfo);

  return {
    normalizeInfo: normalizeHostInfo,
    consumeHostInfo,
    extractHostControllerDetails,
    getLastBoardResult: () => lastBoardResult,
  };
}
