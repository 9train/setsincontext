import { loadMappings as loadLocalMappings } from '../mapper.js';
import {
  DRAFT_RENDER_OWNERSHIP,
  FALLBACK_RENDER_OWNERSHIP,
  OFFICIAL_RENDER_OWNERSHIP,
  UNKNOWN_RENDER_OWNERSHIP,
  getFileMapCache,
  getUnifiedMap,
  setFileMapCache,
  setUnifiedMap,
} from './state.js';

export {
  DRAFT_RENDER_OWNERSHIP,
  FALLBACK_RENDER_OWNERSHIP,
  OFFICIAL_RENDER_OWNERSHIP,
  UNKNOWN_RENDER_OWNERSHIP,
} from './state.js';

export function normalizeRenderOwnership(value, fallback = UNKNOWN_RENDER_OWNERSHIP) {
  const text = String(value || '').trim().toLowerCase();
  return text === OFFICIAL_RENDER_OWNERSHIP
    || text === DRAFT_RENDER_OWNERSHIP
    || text === FALLBACK_RENDER_OWNERSHIP
    || text === UNKNOWN_RENDER_OWNERSHIP
    ? text
    : fallback;
}

export function normalizeCompatibilityOwnership(value, fallback = FALLBACK_RENDER_OWNERSHIP) {
  const text = String(value || '').trim().toLowerCase();
  if (text === DRAFT_RENDER_OWNERSHIP || text === FALLBACK_RENDER_OWNERSHIP) return text;

  const normalizedFallback = normalizeRenderOwnership(fallback, FALLBACK_RENDER_OWNERSHIP);
  return normalizedFallback === OFFICIAL_RENDER_OWNERSHIP
    ? DRAFT_RENDER_OWNERSHIP
    : normalizedFallback;
}

export function inferMapOwnership(entries, fallback = FALLBACK_RENDER_OWNERSHIP) {
  if (!Array.isArray(entries)) return normalizeCompatibilityOwnership(null, fallback);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry && entry.ownership) {
      return normalizeCompatibilityOwnership(entry.ownership, fallback);
    }
  }
  return normalizeCompatibilityOwnership(null, fallback);
}

export function normalizeMapEntries(entries, fallbackOwnership = FALLBACK_RENDER_OWNERSHIP) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => ({
    ...(entry || {}),
    ownership: normalizeCompatibilityOwnership(entry && entry.ownership, fallbackOwnership),
  }));
}

// Merge only diagnostic compatibility data. The result is useful for
// inspection, learn review, and explicit debug compatibility mode; normal board
// rendering still resolves from official controller render payloads first.
export function mergeMaps(fileMap, local, options = {}) {
  const baseOwnership = normalizeCompatibilityOwnership(options.baseOwnership, FALLBACK_RENDER_OWNERSHIP);
  const overlayOwnership = normalizeCompatibilityOwnership(options.overlayOwnership, DRAFT_RENDER_OWNERSHIP);
  const byKey = new Map();

  normalizeMapEntries(fileMap || [], baseOwnership).forEach((entry) => {
    const key = entry.key || (
      entry.type
      && entry.ch != null
      && entry.code != null
      ? `${entry.type}:${entry.ch}:${entry.code}`
      : entry.target
    );
    if (key) byKey.set(key, { ...entry });
  });

  normalizeMapEntries(local || [], overlayOwnership).forEach((entry) => {
    const key = entry.key || (
      entry.type
      && entry.ch != null
      && entry.code != null
      ? `${entry.type}:${entry.ch}:${entry.code}`
      : entry.target || entry.name
    );
    if (!key) return;

    if (byKey.has(key)) {
      const base = byKey.get(key);
      byKey.set(key, { ...base, ...entry, name: entry.name || base.name });
      return;
    }

    byKey.set(key, { ...entry });
  });

  return Array.from(byKey.values());
}

export async function fetchJSON(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

export function infoKey(info) {
  const code = info.type === 'cc'
    ? (info.controller ?? info.d1)
    : (info.type === 'noteon' || info.type === 'noteoff')
      ? info.d1
      : info.d1;
  return `${(info.type || '').toLowerCase()}:${info.ch}:${code}`;
}

export function hasOwn(record, key) {
  return !!record && Object.prototype.hasOwnProperty.call(record, key);
}

export async function loadInitialUnifiedMap(mapUrl) {
  const shippedMap = normalizeMapEntries(await fetchJSON(mapUrl), FALLBACK_RENDER_OWNERSHIP);
  setFileMapCache(shippedMap);
  return remergeLocalMappings();
}

export function remergeLocalMappings() {
  return setUnifiedMap(mergeMaps(getFileMapCache(), loadLocalMappings(), {
    baseOwnership: FALLBACK_RENDER_OWNERSHIP,
    overlayOwnership: DRAFT_RENDER_OWNERSHIP,
  }));
}

export function applyDraftCompatibilityMap(remoteMap) {
  const overlayOwnership = inferMapOwnership(remoteMap, DRAFT_RENDER_OWNERSHIP);
  return setUnifiedMap(mergeMaps(getFileMapCache(), remoteMap, {
    baseOwnership: FALLBACK_RENDER_OWNERSHIP,
    overlayOwnership,
  }));
}

export function applyRemoteMap(remoteMap) {
  return applyDraftCompatibilityMap(remoteMap);
}

export function remergeLearned() {
  const merged = remergeLocalMappings();
  // eslint-disable-next-line no-console
  console.log('[Board] Remerged (manual):', merged.length);
  return getUnifiedMap();
}
