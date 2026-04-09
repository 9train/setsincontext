import { deckSides } from './vocabulary.js';

export const controllerStateBuckets = Object.freeze([
  'shift',
  'deckLayer',
  'padMode',
  'jogTouch',
  'pairedValues',
  'temporary',
]);

/**
 * One stored coarse/fine value pair used by controllers that split a control
 * across two lanes, such as 14-bit tempo faders.
 *
 * @typedef {Object} PairedValueState
 * @property {number|null} coarse
 * @property {number} fine
 * @property {number|null} value
 * @property {number|null} updatedAt
 * @property {string|null=} canonicalTarget
 * @property {string|null=} side
 * @property {string|null=} deckLayer
 * @property {string|null=} rawTarget
 */

/**
 * Shared controller-layer state used for modal and multi-step controller behavior.
 * This is intentionally plain so it is easy to inspect in dev tools.
 *
 * @typedef {Object} ControllerState
 * @property {string|null} profileId
 * @property {number|null} updatedAt
 * @property {{ global: boolean, left: boolean, right: boolean }} shift
 * @property {{ left: string, right: string }} deckLayer
 * @property {{ left: string, right: string }} padMode
 * @property {{ left: boolean, right: boolean }} jogTouch
 * @property {Record<string, PairedValueState>} pairedValues
 * @property {Record<string, unknown>} temporary
 */

function normalizeSide(side) {
  const text = String(side || '').toLowerCase();
  return deckSides.includes(text) ? text : null;
}

function clonePairedValues(pairedValues) {
  const out = {};
  Object.entries(pairedValues || {}).forEach(([key, value]) => {
    out[key] = {
      coarse: value && value.coarse != null ? Number(value.coarse) : null,
      fine: value && value.fine != null ? Number(value.fine) : 0,
      value: value && value.value != null ? Number(value.value) : null,
      updatedAt: value && value.updatedAt != null ? Number(value.updatedAt) : null,
      canonicalTarget: value && value.canonicalTarget || null,
      side: value && value.side || null,
      deckLayer: value && value.deckLayer || null,
      rawTarget: value && value.rawTarget || null,
    };
  });
  return out;
}

function touchState(state, timestamp) {
  if (!state || typeof state !== 'object') return state;
  state.updatedAt = timestamp != null ? Number(timestamp) : Date.now();
  return state;
}

/**
 * Creates a shared per-controller state object with predictable side buckets.
 *
 * @param {Object=} options
 * @param {string=} options.profileId
 * @param {string=} options.defaultDeckLayer
 * @param {string=} options.defaultPadMode
 * @param {Object=} options.shift
 * @param {Object=} options.deckLayer
 * @param {Object=} options.padMode
 * @param {Object=} options.jogTouch
 * @param {Record<string, PairedValueState>=} options.pairedValues
 * @param {Record<string, unknown>=} options.temporary
 * @param {number=} options.updatedAt
 * @returns {ControllerState}
 */
export function createControllerState(options = {}) {
  const state = {
    profileId: options.profileId || null,
    updatedAt: options.updatedAt != null ? Number(options.updatedAt) : null,
    shift: {
      global: !!(options.shift && options.shift.global),
      left: !!(options.shift && options.shift.left),
      right: !!(options.shift && options.shift.right),
    },
    deckLayer: {
      left: String(options.deckLayer && options.deckLayer.left || options.defaultDeckLayer || 'main'),
      right: String(options.deckLayer && options.deckLayer.right || options.defaultDeckLayer || 'main'),
    },
    padMode: {
      left: String(options.padMode && options.padMode.left || options.defaultPadMode || 'hotcue'),
      right: String(options.padMode && options.padMode.right || options.defaultPadMode || 'hotcue'),
    },
    jogTouch: {
      left: !!(options.jogTouch && options.jogTouch.left),
      right: !!(options.jogTouch && options.jogTouch.right),
    },
    pairedValues: clonePairedValues(options.pairedValues),
    temporary: { ...(options.temporary || {}) },
  };

  state.shift.global = !!(state.shift.global || state.shift.left || state.shift.right);
  return state;
}

/**
 * Builds a plain snapshot of the current controller state for debugging or tests.
 *
 * @param {ControllerState=} state
 * @returns {ControllerState}
 */
export function snapshotControllerState(state) {
  return createControllerState(state || {});
}

/**
 * Returns whether a button-like event should count as "active".
 *
 * @param {import('./contracts.js').NormalizedInputEvent|Object} event
 * @returns {boolean}
 */
export function isBinaryEventActive(event) {
  const interaction = String(event && (event.interaction || event.type) || '').toLowerCase();
  const value = Number(event && (event.value ?? event.d2 ?? event.data2) || 0);
  if (interaction === 'noteoff') return false;
  if (interaction === 'noteon') return value > 0;
  if (interaction === 'cc') return value > 0;
  return !!value;
}

/**
 * Tries to resolve deck side from a normalized controller event.
 *
 * @param {import('./contracts.js').NormalizedInputEvent|Object} event
 * @returns {'left'|'right'|null}
 */
export function getEventSide(event) {
  const canonicalTarget = String(event && event.canonicalTarget || '').toLowerCase();
  if (canonicalTarget.startsWith('deck.left.')) return 'left';
  if (canonicalTarget.startsWith('deck.right.')) return 'right';

  const mappingId = String(event && event.mappingId || '').toLowerCase();
  if (mappingId.startsWith('deck.left.')) return 'left';
  if (mappingId.startsWith('deck.right.')) return 'right';

  return null;
}

/**
 * Updates one shift bucket.
 *
 * @param {ControllerState} state
 * @param {Object=} options
 * @param {'left'|'right'|'global'} options.side
 * @param {boolean=} options.active
 * @param {number=} options.timestamp
 * @returns {ControllerState}
 */
export function setShiftState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  touchState(state, options.timestamp);

  if (options.side === 'global' || !options.side) {
    state.shift.global = !!options.active;
    return state;
  }

  const side = normalizeSide(options.side);
  if (!side) return state;
  state.shift[side] = !!options.active;
  state.shift.global = !!(state.shift.left || state.shift.right);
  return state;
}

/**
 * Updates one deck-layer bucket.
 *
 * @param {ControllerState} state
 * @param {Object=} options
 * @param {'left'|'right'} options.side
 * @param {string=} options.layer
 * @param {number=} options.timestamp
 * @returns {ControllerState}
 */
export function setDeckLayerState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  state.deckLayer[side] = String(options.layer || state.deckLayer[side] || 'main');
  return state;
}

/**
 * Updates one pad-mode bucket.
 *
 * @param {ControllerState} state
 * @param {Object=} options
 * @param {'left'|'right'} options.side
 * @param {string=} options.mode
 * @param {number=} options.timestamp
 * @returns {ControllerState}
 */
export function setPadModeState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  state.padMode[side] = String(options.mode || state.padMode[side] || 'hotcue');
  return state;
}

/**
 * Updates one jog-touch bucket.
 *
 * @param {ControllerState} state
 * @param {Object=} options
 * @param {'left'|'right'} options.side
 * @param {boolean=} options.active
 * @param {number=} options.timestamp
 * @returns {ControllerState}
 */
export function setJogTouchState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  state.jogTouch[side] = !!options.active;
  return state;
}

/**
 * Stores one coarse/fine pair slot.
 *
 * @param {ControllerState} state
 * @param {Object=} options
 * @param {string=} options.slotKey
 * @param {number=} options.coarse
 * @param {number=} options.fine
 * @param {string=} options.canonicalTarget
 * @param {'left'|'right'} options.side
 * @param {string=} options.deckLayer
 * @param {string=} options.rawTarget
 * @param {number=} options.timestamp
 * @returns {PairedValueState|null}
 */
export function rememberPairedValue(state, options = {}) {
  if (!state || typeof state !== 'object') return null;
  const slotKey = String(options.slotKey || '');
  if (!slotKey) return null;

  touchState(state, options.timestamp);

  const slot = {
    ...(state.pairedValues[slotKey] || {
      coarse: null,
      fine: 0,
      value: null,
      updatedAt: null,
      canonicalTarget: null,
      side: null,
      deckLayer: null,
      rawTarget: null,
    }),
  };

  if (options.coarse != null) slot.coarse = Number(options.coarse);
  if (options.fine != null) slot.fine = Number(options.fine);
  if (!Number.isFinite(slot.fine)) slot.fine = 0;
  if (!Number.isFinite(slot.coarse)) slot.coarse = null;

  slot.value = slot.coarse == null
    ? null
    : Math.max(0, Math.min(127, slot.coarse + ((slot.fine || 0) / 128)));
  slot.updatedAt = state.updatedAt;
  slot.canonicalTarget = options.canonicalTarget || slot.canonicalTarget || null;
  slot.side = normalizeSide(options.side) || slot.side || null;
  slot.deckLayer = options.deckLayer || slot.deckLayer || null;
  slot.rawTarget = options.rawTarget || slot.rawTarget || null;

  state.pairedValues[slotKey] = slot;
  return slot;
}

/**
 * Stores temporary controller-owned state such as a last-seen event hint.
 *
 * @param {ControllerState} state
 * @param {string} key
 * @param {unknown} value
 * @param {number=} timestamp
 * @returns {ControllerState}
 */
export function setTemporaryState(state, key, value, timestamp) {
  if (!state || typeof state !== 'object' || !key) return state;
  touchState(state, timestamp);
  state.temporary[String(key)] = value;
  return state;
}

/**
 * Applies the shared modal state that can be inferred generically from a
 * normalized controller event.
 *
 * @param {ControllerState} state
 * @param {import('./contracts.js').NormalizedInputEvent|Object} event
 * @returns {ControllerState}
 */
export function applyControllerStateEvent(state, event) {
  if (!state || typeof state !== 'object' || !event || typeof event !== 'object') return state;

  const side = getEventSide(event);
  const canonicalTarget = String(event.canonicalTarget || '').toLowerCase();
  const timestamp = event.timestamp;

  if (side && event.context && event.context.deckLayer) {
    setDeckLayerState(state, {
      side,
      layer: event.context.deckLayer,
      timestamp,
    });
  }

  if (side && canonicalTarget.endsWith('.transport.shift')) {
    setShiftState(state, {
      side,
      active: isBinaryEventActive(event),
      timestamp,
    });
  }

  if (side && canonicalTarget.endsWith('.jog.touch')) {
    setJogTouchState(state, {
      side,
      active: isBinaryEventActive(event),
      timestamp,
    });
  }

  const padModeMatch = /^deck\.(left|right)\.pad_mode\.([a-z0-9_]+)$/i.exec(canonicalTarget);
  if (padModeMatch && isBinaryEventActive(event)) {
    setPadModeState(state, {
      side: padModeMatch[1],
      mode: padModeMatch[2],
      timestamp,
    });
  }

  return state;
}
