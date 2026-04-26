// /src/map-bootstrap.js
// Shared helpers for cached/static/remote map candidates.
//
// These maps are draft/diagnostic metadata only. They may be shown in review
// and debugger surfaces, but they are not official FLX6 runtime truth.

export const MAP_CACHE_KEY = 'learned_map';
export const FALLBACK_MAP_URL = '/learned_map.json';
export const FALLBACK_BOOT_DELAY_MS = 1200;
const MAP_CANDIDATE_WINDOW_MS = 60_000;
const DEFAULT_REMOTE_MAP_OWNERSHIP = 'draft';
const DEFAULT_FALLBACK_MAP_OWNERSHIP = 'fallback';
const DEFAULT_DRAFT_MAP_STATE = 'draft-candidate';
const DRAFT_MAP_EVENT = 'flx:draft-map-candidate';

function normalizeOwnership(value, fallback = DEFAULT_REMOTE_MAP_OWNERSHIP) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'draft' || text === 'fallback'
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

function hasUsableMapEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const target = String(entry.target || '').trim();
  const key = String(entry.key || '').trim();
  const type = String(entry.type || '').trim().toLowerCase();
  const channel = Number(entry.ch);
  const code = Number(entry.code);

  if (target && key) return true;
  if (!target || !type) return false;
  return Number.isFinite(channel) && Number.isFinite(code);
}

function annotateMapEntries(map, fallbackOwnership = DEFAULT_REMOTE_MAP_OWNERSHIP) {
  if (!Array.isArray(map) || map.length === 0) return null;
  const annotated = map
    .filter(hasUsableMapEntry)
    .map((entry) => ({
      ...(entry || {}),
      ownership: normalizeOwnership(entry && entry.ownership, fallbackOwnership),
    }));
  return annotated.length ? annotated : null;
}

function buildDraftMapMetadata(map, {
  source = 'remote-map-sync',
  state = DEFAULT_DRAFT_MAP_STATE,
  fallbackOwnership = DEFAULT_REMOTE_MAP_OWNERSHIP,
  key = null,
  room = null,
} = {}) {
  const ownership = inferMapOwnership(map, fallbackOwnership);
  return Object.freeze({
    ownership,
    source,
    state,
    key: key || null,
    room: room || null,
    mapAuthority: ownership,
    mapState: state,
    controllerTruth: false,
    runtimeAuthority: false,
    diagnosticOnly: true,
    label: ownership === 'fallback' ? 'fallback candidate' : 'draft candidate',
    note: 'Diagnostic-only map candidate; not official runtime truth.',
  });
}

function recordCandidateSeen() {
  try { window.__mapCandidateSeenAt = Date.now(); } catch {}
}

export function hasDraftMapCandidate() {
  try {
    if (Array.isArray(window.__currentMap) && window.__currentMap.length > 0) return true;
    if (window.__mapCandidateSeenAt && (Date.now() - window.__mapCandidateSeenAt) < MAP_CANDIDATE_WINDOW_MS) return true;
  } catch {}
  return false;
}

export function rememberDraftMapCandidate(map, {
  source = 'remote-map-sync',
  state = DEFAULT_DRAFT_MAP_STATE,
  fallbackOwnership = DEFAULT_REMOTE_MAP_OWNERSHIP,
  persist = true,
  key = null,
  room = null,
} = {}) {
  const normalizedMap = annotateMapEntries(map, inferMapOwnership(map, fallbackOwnership));
  if (!normalizedMap) return false;
  const metadata = buildDraftMapMetadata(normalizedMap, {
    source,
    state,
    fallbackOwnership,
    key,
    room,
  });
  try { window.__currentMap = normalizedMap; } catch {}
  try { window.__currentMapOwnership = metadata.ownership; } catch {}
  try { window.__currentMapState = metadata.state; } catch {}
  try { window.__currentMapRuntimeAuthority = false; } catch {}
  try { window.__currentMapMetadata = metadata; } catch {}
  if (persist) {
    try { localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(normalizedMap)); } catch {}
  }
  recordCandidateSeen();
  return true;
}

export function dispatchDraftMapCandidate(map, {
  source = 'remote-map-sync',
  state = DEFAULT_DRAFT_MAP_STATE,
  fallbackOwnership = DEFAULT_REMOTE_MAP_OWNERSHIP,
  key = null,
  room = null,
} = {}) {
  const normalizedMap = annotateMapEntries(map, inferMapOwnership(map, fallbackOwnership));
  if (!normalizedMap) return false;
  const metadata = buildDraftMapMetadata(normalizedMap, {
    source,
    state,
    fallbackOwnership,
    key,
    room,
  });
  try {
    window.dispatchEvent(new CustomEvent(DRAFT_MAP_EVENT, {
      detail: {
        map: normalizedMap,
        metadata,
      },
    }));
    return true;
  } catch {}
  return false;
}

export function acceptDraftMapCandidate(map, options = {}) {
  if (!rememberDraftMapCandidate(map, options)) return false;
  dispatchDraftMapCandidate(map, options);
  return true;
}

// Back-compat aliases retained for older debug and legacy callers. Despite the
// old names, these functions now store/announce diagnostic draft candidates
// only; they do not make a map official runtime truth.
export function markMapApplied() {
  recordCandidateSeen();
}

export function hasAppliedMap() {
  return hasDraftMapCandidate();
}

export function rememberRuntimeMap(map, options = {}) {
  return rememberDraftMapCandidate(map, options);
}

export function dispatchRemoteMap(map, options = {}) {
  return dispatchDraftMapCandidate(map, options);
}

export function applyRemoteMap(map, options = {}) {
  return acceptDraftMapCandidate(map, options);
}

export function loadCachedDraftMapCandidate() {
  try {
    const cached = localStorage.getItem(MAP_CACHE_KEY);
    if (!cached) return null;
    const map = JSON.parse(cached);
    return annotateMapEntries(map, DEFAULT_REMOTE_MAP_OWNERSHIP);
  } catch {}
  return null;
}

export async function loadStaticFallbackMapCandidate({ url = FALLBACK_MAP_URL } = {}) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const map = await r.json();
    return annotateMapEntries(map, DEFAULT_FALLBACK_MAP_OWNERSHIP);
  } catch {}
  return null;
}

export async function loadDraftMapCandidate({ preferCache = true, url = FALLBACK_MAP_URL } = {}) {
  if (preferCache) {
    const cached = loadCachedDraftMapCandidate();
    if (cached) return cached;
  }
  return loadStaticFallbackMapCandidate({ url });
}

export function loadCachedMap() {
  return loadCachedDraftMapCandidate();
}

export function loadStaticFallbackMap(options = {}) {
  return loadStaticFallbackMapCandidate(options);
}

export async function loadFallbackMap(options = {}) {
  return loadDraftMapCandidate(options);
}

export function installDraftMapCandidateBootstrap({
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
      if (hasDraftMapCandidate()) return;
      const map = await loadDraftMapCandidate({ preferCache, url });
      if (!map || hasDraftMapCandidate()) return;
      const ownership = inferMapOwnership(map, DEFAULT_FALLBACK_MAP_OWNERSHIP);
      if (acceptDraftMapCandidate(map, {
        source: ownership === 'fallback' ? 'static-fallback-map' : 'cached-draft-map',
        fallbackOwnership: ownership,
      })) {
        try { console.log('[draft-map] candidate loaded', map.length, 'entries after', Date.now() - start, 'ms'); } catch {}
      }
    } catch {}
  }, delayMs);
}

export function installFallbackMapBootstrap(options = {}) {
  return installDraftMapCandidateBootstrap(options);
}
