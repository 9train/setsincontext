/**
 * Raw-to-canonical alias entry.
 *
 * @typedef {Object} CanonicalAliasEntry
 * @property {string} raw
 * @property {import('./vocabulary.js').CanonicalControlId} canonical
 */

/**
 * Frozen alias map keyed by raw target id.
 *
 * @typedef {Readonly<Record<string, import('./vocabulary.js').CanonicalControlId>>} CanonicalAliasMap
 */

function toIdVariants(id = '') {
  const value = String(id);
  const out = new Set([value, value.toLowerCase()]);
  if (value.includes('_x5F_')) out.add(value.replace(/_x5F_/g, '_'));
  if (value.includes('_')) out.add(value.replace(/_/g, '_x5F_'));
  return [...out].flatMap((item) => [item, item.toLowerCase()]);
}

/**
 * Creates a read-only alias map that tolerates escaped SVG ids.
 *
 * @param {CanonicalAliasEntry[]} entries
 * @returns {CanonicalAliasMap}
 */
export function defineAliasMap(entries) {
  const out = {};
  for (const entry of entries || []) {
    if (!entry || !entry.raw || !entry.canonical) continue;
    for (const variant of toIdVariants(entry.raw)) {
      out[variant] = entry.canonical;
    }
  }
  return Object.freeze(out);
}

/**
 * Resolves a raw target id into the app's canonical control id.
 *
 * @param {CanonicalAliasMap} aliases
 * @param {string} rawTarget
 * @returns {import('./vocabulary.js').CanonicalControlId|null}
 */
export function lookupCanonicalAlias(aliases, rawTarget) {
  if (!aliases || !rawTarget) return null;
  for (const variant of toIdVariants(rawTarget)) {
    if (aliases[variant]) return aliases[variant];
  }
  return null;
}
