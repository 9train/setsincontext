// /src/host-debug.js
// Local-only debug helper for testing canonical host -> WS -> viewer control flow
// without a physical controller attached. It now emits normalized controller
// events first, with legacy MIDI-like fields preserved for compatibility.

import { applyRemoteMap, loadFallbackMap } from './map-bootstrap.js';
import { lookupCanonicalAlias } from './controllers/core/aliases.js';
import { createRawInputEvent, normalizeRawInputEvent } from './controllers/core/normalization.js';
import { getDefaultControllerProfile } from './controllers/profiles/index.js';

const LOCAL_DEBUG_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const DEBUG_SOURCE = 'host-debug';
const DEBUG_PROFILE = getDefaultControllerProfile();

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasMappedEvent(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!entry.target || !entry.type) return false;
  return Number.isFinite(Number(entry.ch)) && Number.isFinite(Number(entry.code));
}

function getTargetRank(entry) {
  const target = String(entry.target || '');
  const type = String(entry.type || '').toLowerCase();
  const code = Number(entry.code);

  if (/^(xfader(_slider)?|crossfader)$/i.test(target) && type === 'cc') return 0;
  if (/^slider_ch[1-4]$/i.test(target) && type === 'cc') return 1;
  if (/^slider_tempo_(l|r)$/i.test(target) && type === 'cc' && code !== 32) return 2;
  if (/^jog_/i.test(target) && type === 'cc') return 3;
  if (/^(play_|cue_|btn_|mode_|pad_)/i.test(target)) return 4;
  if (/^slider_tempo_(l|r)$/i.test(target) && type === 'cc' && code === 32) return 90;
  return 100;
}

function sortByDebugPriority(a, b) {
  const rankA = getTargetRank(a);
  const rankB = getTargetRank(b);
  if (rankA !== rankB) return rankA - rankB;

  const typeA = String(a.type || '').toLowerCase();
  const typeB = String(b.type || '').toLowerCase();
  if (typeA !== typeB) {
    if (typeA === 'cc') return -1;
    if (typeB === 'cc') return 1;
    if (typeA === 'noteon') return -1;
    if (typeB === 'noteon') return 1;
  }

  return String(a.target || '').localeCompare(String(b.target || ''));
}

function buildDebugMeta(entry) {
  return {
    __flxDebug: true,
    __flxDebugSource: DEBUG_SOURCE,
    __flxDebugTarget: String(entry.target || ''),
    __flxDebugKey: entry.key || `${entry.type}:${entry.ch}:${entry.code}`,
  };
}

function buildDebugInfo(type, entry, value) {
  const code = Number(entry.code);
  const v = Number(value);
  const channel = Number(entry.ch);
  const profileId = DEBUG_PROFILE && DEBUG_PROFILE.id || null;
  const raw = createRawInputEvent({
    transport: 'midi',
    profileId: profileId || undefined,
    sourceId: DEBUG_SOURCE,
    deviceName: DEBUG_PROFILE && DEBUG_PROFILE.displayName || 'FLX debug',
    interaction: type,
    channel: channel,
    code: code,
    value: v,
    data1: code,
    data2: v,
    key: `${type}:${channel}:${code}`,
    timestamp: 0,
    bytes: [],
  });
  const normalized = normalizeRawInputEvent(raw, {
    profile: DEBUG_PROFILE,
    profileId: profileId || undefined,
    sourceId: DEBUG_SOURCE,
    timestamp: 0,
  }).events[0] || {};
  const aliases = DEBUG_PROFILE && DEBUG_PROFILE.aliases && DEBUG_PROFILE.aliases.controls || null;
  const aliasedCanonicalTarget = lookupCanonicalAlias(aliases, entry.target || '');
  const canonicalTarget = normalized.canonicalTarget || aliasedCanonicalTarget || null;
  const mapped = !!(normalized.mapped || canonicalTarget);

  const info = {
    ...buildDebugMeta(entry),
    eventType: 'normalized_input',
    profileId: profileId,
    canonicalTarget,
    mappingId: normalized.mappingId || null,
    context: normalized.context || null,
    mapped: mapped || !!canonicalTarget,
    rawTarget: normalized.rawTarget || entry.target || null,
    interaction: normalized.interaction || type,
    type: normalized.type || type,
    ch: normalized.ch != null ? normalized.ch : channel,
    d1: normalized.d1 != null ? normalized.d1 : code,
    d2: normalized.d2 != null ? normalized.d2 : v,
    value: normalized.value != null ? normalized.value : v,
    timestamp: normalized.timestamp != null ? normalized.timestamp : 0,
  };

  if (type === 'cc') {
    info.controller = normalized.controller != null ? normalized.controller : code;
  }

  return info;
}

function wait(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLocalDebugRuntime(locationLike) {
  const hostname = String(locationLike && locationLike.hostname || '').toLowerCase();
  return LOCAL_DEBUG_HOSTS.has(hostname);
}

export function findDebugMapping(entries) {
  const candidates = asArray(entries)
    .filter(hasMappedEvent)
    .filter((entry) => getTargetRank(entry) < 100)
    .sort(sortByDebugPriority);

  return candidates[0] || null;
}

export function listDebugMappings(entries) {
  return asArray(entries)
    .filter(hasMappedEvent)
    .filter((entry) => getTargetRank(entry) < 100)
    .sort(sortByDebugPriority)
    .map((entry) => ({
      key: entry.key || `${entry.type}:${entry.ch}:${entry.code}`,
      target: entry.target,
      type: entry.type,
      ch: Number(entry.ch),
      code: Number(entry.code),
    }));
}

export function buildDebugEventPlan(entry, { stepDelayMs = 180 } = {}) {
  if (!hasMappedEvent(entry)) return [];

  const type = String(entry.type || '').toLowerCase();
  const target = String(entry.target || '');
  const code = Number(entry.code);

  if (type === 'cc') {
    if (/^slider_tempo_(l|r)$/i.test(target) && code === 32) return [];

    if (/^(xfader(_slider)?|crossfader|slider_ch[1-4]|slider_tempo_(l|r))$/i.test(target)) {
      return [0, 64, 127].map((value, index) => ({
        delayMs: index * stepDelayMs,
        info: buildDebugInfo('cc', entry, value),
      }));
    }

    if (/^jog_/i.test(target)) {
      return [1, 2, 3].map((value, index) => ({
        delayMs: index * stepDelayMs,
        info: buildDebugInfo('cc', entry, value),
      }));
    }

    return [0, 127].map((value, index) => ({
      delayMs: index * stepDelayMs,
      info: buildDebugInfo('cc', entry, value),
    }));
  }

  return [
    { delayMs: 0, info: buildDebugInfo('noteon', entry, 127) },
    { delayMs: stepDelayMs, info: buildDebugInfo('noteoff', entry, 0) },
  ];
}

export async function pulseMappedControl({
  mapEntries = [],
  consumeInfo,
  getWSClient = () => undefined,
  loadFallback = loadFallbackMap,
  applyMap = applyRemoteMap,
  logger = console,
  stepDelayMs = 180,
  mapSyncDelayMs = 200,
} = {}) {
  if (typeof consumeInfo !== 'function') {
    return { ok: false, reason: 'no-consumer' };
  }

  let currentMap = asArray(mapEntries);
  let entry = findDebugMapping(currentMap);
  let hydrated = false;

  if (!entry && typeof loadFallback === 'function') {
    const fallbackMap = await loadFallback();
    if (Array.isArray(fallbackMap) && fallbackMap.length) {
      hydrated = true;
      currentMap = fallbackMap;
      try {
        if (typeof applyMap === 'function') applyMap(fallbackMap);
      } catch (e) {
        try { logger.warn('[FLX debug] failed to apply fallback map locally', e); } catch {}
      }
      try {
        getWSClient()?.sendMap?.(fallbackMap);
      } catch (e) {
        try { logger.warn('[FLX debug] failed to sync fallback map to room', e); } catch {}
      }
      entry = findDebugMapping(currentMap);
    }
  }

  if (!entry) {
    try { logger.warn('[FLX debug] no mapped visible control available for debug pulse'); } catch {}
    return {
      ok: false,
      reason: 'no-visible-control',
      mapSize: currentMap.length,
    };
  }

  const plan = buildDebugEventPlan(entry, { stepDelayMs });
  if (!plan.length) {
    try { logger.warn('[FLX debug] selected control is not usable for debug pulse', entry); } catch {}
    return { ok: false, reason: 'unusable-control', entry };
  }

  let syncedMap = false;
  if (currentMap.length) {
    try {
      syncedMap = !!getWSClient()?.sendMap?.(currentMap);
      if (syncedMap) {
        try { logger.info('[FLX debug] synced map to room before pulse:', currentMap.length, 'entries'); } catch {}
        await wait(mapSyncDelayMs);
      }
    } catch (e) {
      try { logger.warn('[FLX debug] failed to sync room map before pulse', e); } catch {}
    }
  }

  try {
    logger.info(
      '[FLX debug] injecting event via canonical host consumeInfo -> WS relay path:',
      entry.target,
      entry.key || `${entry.type}:${entry.ch}:${entry.code}`
    );
  } catch {}

  let elapsed = 0;
  for (const step of plan) {
    const at = Number(step.delayMs) || 0;
    await wait(Math.max(0, at - elapsed));
    elapsed = at;
    consumeInfo(step.info);
  }

  return {
    ok: true,
    hydrated,
    syncedMap,
    entry,
    plan,
    wsAlive: !!getWSClient()?.isAlive?.(),
  };
}

export function installHostDebug({
  getUnifiedMap = () => [],
  consumeInfo,
  getWSClient = () => (typeof window !== 'undefined' ? window.wsClient : undefined),
  logger = console,
  locationLike = typeof window !== 'undefined' ? window.location : undefined,
  stepDelayMs = 180,
  mapSyncDelayMs = 200,
  loadFallback = loadFallbackMap,
  applyMap = applyRemoteMap,
} = {}) {
  if (!isLocalDebugRuntime(locationLike)) return null;

  const api = {
    listVisibleControls() {
      return listDebugMappings(getUnifiedMap());
    },
    pulseVisibleControl(options = {}) {
      return pulseMappedControl({
        mapEntries: getUnifiedMap(),
        consumeInfo: consumeInfo,
        getWSClient,
        logger,
        loadFallback,
        applyMap,
        stepDelayMs: options.stepDelayMs ?? stepDelayMs,
        mapSyncDelayMs: options.mapSyncDelayMs ?? mapSyncDelayMs,
      });
    },
  };

  if (typeof window !== 'undefined') {
    window.__FLX_DEBUG__ = api;
  }

  return api;
}
