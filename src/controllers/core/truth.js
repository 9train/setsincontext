export const controllerTruthStatuses = Object.freeze([
  'official',
  'inferred',
  'unknown',
  'blocked',
]);

function cloneMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return { ...meta };
}

export function normalizeTruthStatus(status) {
  const text = String(status || '').trim().toLowerCase();
  return controllerTruthStatuses.includes(text) ? text : 'unknown';
}

/**
 * Plain truth descriptor carried through controller state, semantics, and debug
 * payloads. `value` can be any JSON-like value.
 *
 * @template T
 * @param {T|null=} value
 * @param {'official'|'inferred'|'unknown'|'blocked'=} status
 * @param {Object=} options
 * @param {string=} options.source
 * @param {number=} options.observedAt
 * @param {string=} options.note
 * @param {Object=} options.meta
 * @returns {{ value: T|null, status: 'official'|'inferred'|'unknown'|'blocked', source: string, observedAt: number|null, note: string|null, meta: Object|null }}
 */
export function createTruthValue(value = null, status = 'unknown', options = {}) {
  return {
    value,
    status: normalizeTruthStatus(status),
    source: String(options.source || 'unknown'),
    observedAt: options.observedAt != null ? Number(options.observedAt) : null,
    note: options.note != null ? String(options.note) : null,
    meta: cloneMeta(options.meta),
  };
}

/**
 * Copies one truth descriptor into a fresh plain object.
 *
 * @template T
 * @param {{ value?: T|null, status?: string, source?: string, observedAt?: number|null, note?: string|null, meta?: Object|null }=} entry
 * @param {T|null=} fallbackValue
 * @returns {{ value: T|null, status: 'official'|'inferred'|'unknown'|'blocked', source: string, observedAt: number|null, note: string|null, meta: Object|null }}
 */
export function cloneTruthValue(entry, fallbackValue = null) {
  return createTruthValue(
    entry && Object.prototype.hasOwnProperty.call(entry, 'value') ? entry.value : fallbackValue,
    entry && entry.status || 'unknown',
    {
      source: entry && entry.source || 'unknown',
      observedAt: entry && entry.observedAt != null ? Number(entry.observedAt) : null,
      note: entry && entry.note != null ? String(entry.note) : null,
      meta: entry && entry.meta || null,
    },
  );
}

/**
 * Mutates an existing truth descriptor in place.
 *
 * @template T
 * @param {{ value?: T|null, status?: string, source?: string, observedAt?: number|null, note?: string|null, meta?: Object|null }|null} target
 * @param {T|null=} value
 * @param {'official'|'inferred'|'unknown'|'blocked'=} status
 * @param {Object=} options
 * @param {string=} options.source
 * @param {number=} options.observedAt
 * @param {string=} options.note
 * @param {Object=} options.meta
 * @returns {{ value: T|null, status: 'official'|'inferred'|'unknown'|'blocked', source: string, observedAt: number|null, note: string|null, meta: Object|null }}
 */
export function setTruthValue(target, value = null, status = 'unknown', options = {}) {
  const next = target && typeof target === 'object'
    ? target
    : createTruthValue();
  next.value = value;
  next.status = normalizeTruthStatus(status);
  next.source = String(options.source || next.source || 'unknown');
  next.observedAt = options.observedAt != null ? Number(options.observedAt) : next.observedAt ?? null;
  next.note = options.note != null ? String(options.note) : next.note ?? null;
  next.meta = cloneMeta(options.meta != null ? options.meta : next.meta);
  return next;
}

export function truthValueStatus(entry) {
  return normalizeTruthStatus(entry && entry.status);
}

export function truthValueIsKnown(entry) {
  const status = truthValueStatus(entry);
  return status === 'official' || status === 'inferred';
}
