// src/mapper.js
// Local board-target override storage shared by Wizard + board.js.
// This is a compatibility layer for the current FLX6 board renderer, not the
// source of truth for the official controller profile under src/controllers/.
// Format for each entry:
//   { key: "cc:ch:code", type: "cc|noteon|noteoff|pitch", ch: 1-16, code: int, target: "svgId", name?: string }

const LS_KEY = 'flx.learned.map.v1';
const DEFAULT_MAPPING_OWNERSHIP = 'draft';

// --- helpers ---
function keyFromParts(type, ch, code) {
  const t = String(type || '').toLowerCase();
  return `${t}:${ch}:${code}`;
}
function normalizeOwnership(value, fallback = DEFAULT_MAPPING_OWNERSHIP) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'draft' || text === 'fallback'
    ? text
    : fallback;
}
function ensureEntry(e) {
  const type = String(e.type || '').toLowerCase();
  const ch   = Number(e.ch);
  const code = Number(e.code);
  const key  = e.key || keyFromParts(type, ch, code);
  return {
    ...e,
    key,
    type,
    ch,
    code,
    target: String(e.target || ''),
    name: e.name || e.target || key,
    ownership: normalizeOwnership(e.ownership, DEFAULT_MAPPING_OWNERSHIP),
  };
}
function clone(arr) { return JSON.parse(JSON.stringify(arr || [])); }

function matchesScope(entry, options = {}) {
  if (!entry || typeof entry !== 'object') return false;
  const targetId = String(options.targetId || '').trim();
  const canonicalTarget = String(options.canonicalTarget || '').trim();
  if (!targetId && !canonicalTarget) return true;
  return (
    (targetId && String(entry.target || '').trim() === targetId)
    || (canonicalTarget && String(entry.canonicalTarget || '').trim() === canonicalTarget)
  );
}

export function hasUsableMappings(list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const target = String(entry.target || '').trim();
    const type = String(entry.type || '').trim().toLowerCase();
    const key = String(entry.key || '').trim();
    const channel = Number(entry.ch);
    const code = Number(entry.code);

    if (target && key) return true;
    if (!target || !type) return false;
    return Number.isFinite(channel) && Number.isFinite(code);
  });
}

// --- API ---
export function loadMappings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.map(ensureEntry);
  } catch {
    return [];
  }
}

export function saveMappings(list = []) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list.map(ensureEntry)));
  } catch {}
}

export function upsertMapping(entry) {
  const e = ensureEntry(entry);
  const all = loadMappings();
  const out = all.filter(m => (m.key || '') !== e.key);
  out.push(e);
  saveMappings(out);
  return e;
}

export function removeMappingByKey(key) {
  const all = loadMappings();
  const out = all.filter(m => (m.key || '') !== key);
  saveMappings(out);
  return out.length !== all.length;
}

export function clearMappings() {
  saveMappings([]);
}

export function loadDraftMappings(options = {}) {
  return loadMappings().filter((entry) =>
    entry.ownership === DEFAULT_MAPPING_OWNERSHIP && matchesScope(entry, options)
  );
}

export function keyForInfo(info) {
  const t = (info.type || '').toLowerCase();
  const ch = info.ch;
  const code = t === 'cc' ? (info.controller ?? info.d1)
            : (t === 'noteon' || t === 'noteoff') ? info.d1
            : (info.d1 ?? 0);
  return keyFromParts(t, ch, code);
}

export { LS_KEY };
