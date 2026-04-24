// /src/map-bootstrap.js
// Shared helpers for cached/static map bootstrap and runtime map application.

export const MAP_CACHE_KEY = 'learned_map';
export const FALLBACK_MAP_URL = '/learned_map.json';
export const FALLBACK_BOOT_DELAY_MS = 1200;
const MAP_APPLIED_WINDOW_MS = 60_000;
const DEFAULT_REMOTE_MAP_OWNERSHIP = 'draft';
const DEFAULT_FALLBACK_MAP_OWNERSHIP = 'fallback';

function normalizeOwnership(value, fallback = DEFAULT_REMOTE_MAP_OWNERSHIP) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'official' || text === 'draft' || text === 'fallback'
    ? text
    : fallback;
}

function inferMapOwnership(map, fallback = DEFAULT_REMOTE_MAP_OWNERSHIP) {
  if (!Array.isArray(map)) return normalizeOwnership(null, fallback);
  for (let index = 0; index < map.length; index += 1) {
    const entry = map[index];
    if (entry && entry.ownership) return normalizeOwnership(entry.ownership, fallback);
  }
  return normalizeOwnership(null, fallback);
}

function annotateMapEntries(map, fallbackOwnership = DEFAULT_REMOTE_MAP_OWNERSHIP) {
  if (!Array.isArray(map) || map.length === 0) return null;
  return map.map((entry) => ({
    ...(entry || {}),
    ownership: normalizeOwnership(entry && entry.ownership, fallbackOwnership),
  }));
}

export function markMapApplied() {
  try { window.__mapAppliedAt = Date.now(); } catch {}
}

export function hasAppliedMap() {
  try {
    if (Array.isArray(window.__currentMap) && window.__currentMap.length > 0) return true;
    if (window.__mapAppliedAt && (Date.now() - window.__mapAppliedAt) < MAP_APPLIED_WINDOW_MS) return true;
  } catch {}
  return false;
}

export function rememberRuntimeMap(map) {
  const normalizedMap = annotateMapEntries(map, inferMapOwnership(map, DEFAULT_REMOTE_MAP_OWNERSHIP));
  if (!normalizedMap) return false;
  try { window.__currentMap = normalizedMap; } catch {}
  try { window.__currentMapOwnership = inferMapOwnership(normalizedMap, DEFAULT_REMOTE_MAP_OWNERSHIP); } catch {}
  try { localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(normalizedMap)); } catch {}
  markMapApplied();
  return true;
}

export function dispatchRemoteMap(map) {
  const normalizedMap = annotateMapEntries(map, inferMapOwnership(map, DEFAULT_REMOTE_MAP_OWNERSHIP));
  if (!normalizedMap) return false;
  try {
    window.dispatchEvent(new CustomEvent('flx:remote-map', { detail: normalizedMap }));
    return true;
  } catch {}
  return false;
}

export function applyRemoteMap(map) {
  if (!rememberRuntimeMap(map)) return false;
  dispatchRemoteMap(map);
  return true;
}

export function loadCachedMap() {
  try {
    const cached = localStorage.getItem(MAP_CACHE_KEY);
    if (!cached) return null;
    const map = JSON.parse(cached);
    return annotateMapEntries(map, DEFAULT_REMOTE_MAP_OWNERSHIP);
  } catch {}
  return null;
}

export async function loadStaticFallbackMap({ url = FALLBACK_MAP_URL } = {}) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const map = await r.json();
    return annotateMapEntries(map, DEFAULT_FALLBACK_MAP_OWNERSHIP);
  } catch {}
  return null;
}

export async function loadFallbackMap({ preferCache = true, url = FALLBACK_MAP_URL } = {}) {
  if (preferCache) {
    const cached = loadCachedMap();
    if (cached) return cached;
  }
  return loadStaticFallbackMap({ url });
}

export function installFallbackMapBootstrap({
  delayMs = FALLBACK_BOOT_DELAY_MS,
  url = FALLBACK_MAP_URL,
  preferCache = true,
  onceKey = '__fallbackMapBootstrapInstalled',
  disableFlag = 'WS_DISABLE_FALLBACK',
} = {}) {
  try {
    if (window[onceKey]) return;
    window[onceKey] = true;
    if (window[disableFlag] === true) return;
  } catch {}

  const start = Date.now();
  setTimeout(async () => {
    try {
      if (hasAppliedMap()) return;
      const map = await loadFallbackMap({ preferCache, url });
      if (!map || hasAppliedMap()) return;
      if (applyRemoteMap(map)) {
        try { console.log('[fallback-map] applied', map.length, 'entries after', Date.now() - start, 'ms'); } catch {}
      }
    } catch {}
  }, delayMs);
}
