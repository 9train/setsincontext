import { deckSides, fxUnits, mixerChannels } from './vocabulary.js';
import {
  cloneTruthValue,
  createTruthValue,
  setTruthValue,
  truthValueIsKnown,
  truthValueStatus,
} from './truth.js';

export const controllerStateBuckets = Object.freeze([
  'shift',
  'deckLayer',
  'padMode',
  'jogLane',
  'jogTouch',
  'jogCutter',
  'jogVinylMode',
  'channel4Input',
  'beatFx',
  'pairedValues',
  'temporary',
  'truth',
]);

const deckPairBySide = Object.freeze({
  left: Object.freeze([1, 3]),
  right: Object.freeze([2, 4]),
});

const deckLayerByNumber = Object.freeze({
  1: 'main',
  2: 'main',
  3: 'alternate',
  4: 'alternate',
});

const deckNumberBySideAndLayer = Object.freeze({
  left: Object.freeze({ main: 1, alternate: 3 }),
  right: Object.freeze({ main: 2, alternate: 4 }),
});

function normalizeSide(side) {
  const text = String(side || '').trim().toLowerCase();
  return deckSides.includes(text) ? text : null;
}

function normalizeDeckLayer(layer) {
  const text = String(layer || '').trim().toLowerCase();
  if (text === 'main' || text === 'alternate') return text;
  return null;
}

function normalizePadMode(mode) {
  const text = String(mode || '').trim().toLowerCase();
  return text || null;
}

function resolveInitialPadMode(options, side) {
  if (options && options.padMode && Object.prototype.hasOwnProperty.call(options.padMode, side)) {
    return normalizePadMode(options.padMode[side]);
  }
  return normalizePadMode(options && options.defaultPadMode);
}

function normalizeChannel4Input(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'deck4' || text === 'sampler') return text;
  return null;
}

function normalizeJogLane(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizeBeatFxUnit(value) {
  const unit = Number(value);
  return fxUnits.includes(unit) ? unit : null;
}

function normalizeBeatFxSlot(value) {
  const slot = Number(value);
  return slot >= 1 && slot <= 3 ? slot : null;
}

function normalizeBeatFxChannel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'master' || text === 'mst') return 'master';
  if (text === 'ch1' || text === 'channel1' || text === '1') return 'ch1';
  if (text === 'ch2' || text === 'channel2' || text === '2') return 'ch2';
  if (text === 'ch3' || text === 'channel3' || text === '3') return 'ch3';
  if (text === 'ch4' || text === 'channel4' || text === '4') return 'ch4';
  return null;
}

function normalizeMidiAbsoluteValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(127, numeric));
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

function cloneBeatFxUnit(unit = {}) {
  return {
    selectedSlot: unit.selectedSlot != null ? Number(unit.selectedSlot) : null,
    selectedChannel: unit.selectedChannel || null,
    enabled: unit.enabled == null ? null : !!unit.enabled,
    levelDepth: unit.levelDepth != null ? Number(unit.levelDepth) : null,
  };
}

function createDeckOwnershipShape(side, ownerDeck = null, ownerLayer = null) {
  return {
    surfaceSide: side,
    pairedDecks: [...deckPairBySide[side]],
    ownerDeck,
    ownerLayer,
  };
}

function createBeatFxTruthUnit(unitNumber, entry = {}) {
  return {
    unit: unitNumber,
    selectedSlot: cloneTruthValue(entry.selectedSlot),
    selectedChannel: cloneTruthValue(entry.selectedChannel),
    enabled: cloneTruthValue(entry.enabled),
    levelDepth: cloneTruthValue(entry.levelDepth),
  };
}

function createJogTruthEntry(entry = {}) {
  return {
    lastLane: cloneTruthValue(entry.lastLane),
    touchActive: cloneTruthValue(entry.touchActive),
    touchVariant: cloneTruthValue(entry.touchVariant),
    jogCutterEnabled: cloneTruthValue(entry.jogCutterEnabled),
    jogCutterButton: cloneTruthValue(entry.jogCutterButton),
    vinylModeButton: cloneTruthValue(entry.vinylModeButton),
    vinylMode: cloneTruthValue(entry.vinylMode),
  };
}

function createDefaultTruth(options = {}, compatibility) {
  const truth = options.truth || {};
  const deckOwnership = truth.deckOwnership || {};
  const padTruth = truth.padMode || {};
  const jogTruth = truth.jog || {};
  const beatFxTruth = truth.beatFx || {};

  return {
    deckControl: mixerChannels.reduce((out, deckNumber) => {
      out[deckNumber] = cloneTruthValue(
        truth.deckControl && truth.deckControl[deckNumber],
      );
      return out;
    }, {}),
    deckOwnership: {
      left: deckOwnership.left
        ? cloneTruthValue(deckOwnership.left)
        : createTruthValue(createDeckOwnershipShape('left'), 'unknown', {
          source: 'startup-unknown',
          note: 'deck owner not known until a deck-specific lane or status row arrives',
        }),
      right: deckOwnership.right
        ? cloneTruthValue(deckOwnership.right)
        : createTruthValue(createDeckOwnershipShape('right'), 'unknown', {
          source: 'startup-unknown',
          note: 'deck owner not known until a deck-specific lane or status row arrives',
        }),
    },
    padMode: {
      left: padTruth.left
        ? cloneTruthValue(padTruth.left)
        : createTruthValue(null, 'unknown', {
          source: 'startup-unknown',
          note: 'pad mode is unknown until the hardware authors it',
        }),
      right: padTruth.right
        ? cloneTruthValue(padTruth.right)
        : createTruthValue(null, 'unknown', {
          source: 'startup-unknown',
          note: 'pad mode is unknown until the hardware authors it',
        }),
    },
    jog: {
      left: createJogTruthEntry(jogTruth.left),
      right: createJogTruthEntry(jogTruth.right),
    },
    channel4Input: truth.channel4Input
      ? cloneTruthValue(truth.channel4Input)
      : createTruthValue(normalizeChannel4Input(compatibility.channel4Input), 'unknown', {
        source: 'startup-unknown',
        note: 'CH4 Deck4/Sampler selector is unknown until the hardware authors it',
      }),
    beatFx: {
      unit1: createBeatFxTruthUnit(1, beatFxTruth.unit1),
      unit2: createBeatFxTruthUnit(2, beatFxTruth.unit2),
    },
  };
}

function cloneTruthState(truth = {}) {
  return {
    deckControl: mixerChannels.reduce((out, deckNumber) => {
      out[deckNumber] = cloneTruthValue(truth.deckControl && truth.deckControl[deckNumber]);
      return out;
    }, {}),
    deckOwnership: {
      left: cloneTruthValue(truth.deckOwnership && truth.deckOwnership.left, createDeckOwnershipShape('left')),
      right: cloneTruthValue(truth.deckOwnership && truth.deckOwnership.right, createDeckOwnershipShape('right')),
    },
    padMode: {
      left: cloneTruthValue(truth.padMode && truth.padMode.left),
      right: cloneTruthValue(truth.padMode && truth.padMode.right),
    },
    jog: {
      left: createJogTruthEntry(truth.jog && truth.jog.left),
      right: createJogTruthEntry(truth.jog && truth.jog.right),
    },
    channel4Input: cloneTruthValue(truth.channel4Input),
    beatFx: {
      unit1: createBeatFxTruthUnit(1, truth.beatFx && truth.beatFx.unit1),
      unit2: createBeatFxTruthUnit(2, truth.beatFx && truth.beatFx.unit2),
    },
  };
}

function syncCompatibilityFromTruth(state) {
  if (!state || typeof state !== 'object' || !state.truth) return state;

  deckSides.forEach((side) => {
    const owner = state.truth.deckOwnership && state.truth.deckOwnership[side];
    if (owner && owner.value && owner.value.ownerLayer) {
      state.deckLayer[side] = owner.value.ownerLayer;
    }

    const pad = state.truth.padMode && state.truth.padMode[side];
    if (pad && pad.value) {
      state.padMode[side] = pad.value;
    }

    const jog = state.truth.jog && state.truth.jog[side];
    if (jog && jog.lastLane && jog.lastLane.value) {
      state.jogLane[side] = jog.lastLane.value;
    }
    if (jog && jog.touchActive && jog.touchActive.value != null) {
      state.jogTouch[side] = !!jog.touchActive.value;
    }
    if (jog && jog.jogCutterEnabled) {
      state.jogCutter[side] = jog.jogCutterEnabled.value == null
        ? null
        : !!jog.jogCutterEnabled.value;
    }
    if (jog && jog.vinylMode) {
      state.jogVinylMode[side] = jog.vinylMode.value == null
        ? null
        : !!jog.vinylMode.value;
    }
  });

  const channel4Input = state.truth.channel4Input;
  state.channel4Input = channel4Input && channel4Input.value || null;

  fxUnits.forEach((unitNumber) => {
    const key = `unit${unitNumber}`;
    const unitTruth = state.truth.beatFx && state.truth.beatFx[key];
    if (!unitTruth) return;
    state.beatFx[key] = {
      selectedSlot: unitTruth.selectedSlot && unitTruth.selectedSlot.value != null
        ? Number(unitTruth.selectedSlot.value)
        : null,
      selectedChannel: unitTruth.selectedChannel && unitTruth.selectedChannel.value || null,
      enabled: unitTruth.enabled && unitTruth.enabled.value == null
        ? null
        : !!(unitTruth.enabled && unitTruth.enabled.value),
      levelDepth: unitTruth.levelDepth && unitTruth.levelDepth.value != null
        ? Number(unitTruth.levelDepth.value)
        : null,
    };
  });

  state.shift.global = !!(state.shift.left || state.shift.right);
  return state;
}

function touchState(state, timestamp) {
  if (!state || typeof state !== 'object') return state;
  state.updatedAt = timestamp != null ? Number(timestamp) : Date.now();
  return state;
}

function hasShiftedContext(event) {
  return !!(
    event
    && event.context
    && event.context.shifted
  );
}

export function resolveDeckNumberForSideLayer(side, deckLayer) {
  const normalizedSide = normalizeSide(side);
  const normalizedLayer = normalizeDeckLayer(deckLayer);
  if (!normalizedSide || !normalizedLayer) return null;
  return deckNumberBySideAndLayer[normalizedSide][normalizedLayer] || null;
}

function resolveSideForDeckNumber(deckNumber) {
  const numeric = Number(deckNumber);
  if (numeric === 1 || numeric === 3) return 'left';
  if (numeric === 2 || numeric === 4) return 'right';
  return null;
}

function resolveDeckLayerForDeckNumber(deckNumber) {
  return deckLayerByNumber[Number(deckNumber)] || null;
}

export function getEventJogLane(event) {
  const canonicalTarget = String(event && event.canonicalTarget || '').toLowerCase();
  const mappingId = String(event && event.mappingId || '').toLowerCase();
  const code = Number(event && (event.controller ?? event.d1));
  const type = String(event && (event.interaction || event.type) || '').toLowerCase();
  const touchCandidate = type === 'noteon' || type === 'noteoff' || code === 54 || code === 103;
  const motionCandidate = type === 'cc' || code === 33 || code === 34 || code === 35 || code === 38 || code === 41;
  const canonicalIsTouch = canonicalTarget.endsWith('.jog.touch');
  const canonicalIsMotion = canonicalTarget.endsWith('.jog.motion');

  if (canonicalIsTouch || (!canonicalTarget && touchCandidate)) {
    if (/\.shifted\.(press|release)$/i.test(mappingId) || code === 103 || hasShiftedContext(event)) {
      return 'touch_shifted';
    }
    return 'touch';
  }

  if (canonicalTarget && !canonicalIsMotion) return null;
  if (!canonicalIsMotion && !motionCandidate) return null;

  if (/\.alternate\.shifted\.secondary$/i.test(mappingId) || /\.shifted\.secondary$/i.test(mappingId) || code === 41) {
    return 'platter_shifted';
  }
  if (/\.alternate\.shifted\.primary$/i.test(mappingId) || /\.shifted\.primary$/i.test(mappingId) || code === 38) {
    return 'wheel_side_shifted';
  }
  if (/\.alternate\.tertiary$/i.test(mappingId) || /\.tertiary$/i.test(mappingId) || code === 35) {
    return 'platter_vinyl_off';
  }
  if (/\.alternate\.secondary$/i.test(mappingId) || /\.secondary$/i.test(mappingId) || code === 34) {
    return 'platter_vinyl_on';
  }
  if (/\.alternate\.primary$/i.test(mappingId) || /\.primary$/i.test(mappingId) || code === 33) {
    return 'wheel_side';
  }

  return null;
}

export function isBinaryEventActive(event) {
  const interaction = String(event && (event.interaction || event.type) || '').toLowerCase();
  const value = Number(event && (event.value ?? event.d2 ?? event.data2) || 0);
  if (interaction === 'noteoff') return false;
  if (interaction === 'noteon') return value > 0;
  if (interaction === 'cc') return value > 0;
  return !!value;
}

export function getEventSide(event) {
  const canonicalTarget = String(event && event.canonicalTarget || '').toLowerCase();
  if (canonicalTarget.startsWith('deck.left.')) return 'left';
  if (canonicalTarget.startsWith('deck.right.')) return 'right';

  const mappingId = String(event && event.mappingId || '').toLowerCase();
  if (mappingId.startsWith('deck.left.')) return 'left';
  if (mappingId.startsWith('deck.right.')) return 'right';

  return null;
}

function snapshotTemporary(temporary) {
  return { ...(temporary || {}) };
}

/**
 * Shared controller-layer state with compatibility buckets plus explicit truth
 * descriptors for hardware-authored, inferred, and unknown controller facts.
 *
 * @param {Object=} options
 * @returns {Object}
 */
export function createControllerState(options = {}) {
  const compatibility = {
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
      left: resolveInitialPadMode(options, 'left'),
      right: resolveInitialPadMode(options, 'right'),
    },
    jogLane: {
      left: normalizeJogLane(options.jogLane && options.jogLane.left),
      right: normalizeJogLane(options.jogLane && options.jogLane.right),
    },
    jogTouch: {
      left: !!(options.jogTouch && options.jogTouch.left),
      right: !!(options.jogTouch && options.jogTouch.right),
    },
    jogCutter: {
      left: options.jogCutter && Object.prototype.hasOwnProperty.call(options.jogCutter, 'left')
        ? (options.jogCutter.left == null ? null : !!options.jogCutter.left)
        : null,
      right: options.jogCutter && Object.prototype.hasOwnProperty.call(options.jogCutter, 'right')
        ? (options.jogCutter.right == null ? null : !!options.jogCutter.right)
        : null,
    },
    jogVinylMode: {
      left: options.jogVinylMode && Object.prototype.hasOwnProperty.call(options.jogVinylMode, 'left')
        ? (options.jogVinylMode.left == null ? null : !!options.jogVinylMode.left)
        : null,
      right: options.jogVinylMode && Object.prototype.hasOwnProperty.call(options.jogVinylMode, 'right')
        ? (options.jogVinylMode.right == null ? null : !!options.jogVinylMode.right)
        : null,
    },
    channel4Input: normalizeChannel4Input(options.channel4Input),
    beatFx: {
      unit1: cloneBeatFxUnit(options.beatFx && options.beatFx.unit1),
      unit2: cloneBeatFxUnit(options.beatFx && options.beatFx.unit2),
    },
  };

  const state = {
    profileId: options.profileId || null,
    updatedAt: options.updatedAt != null ? Number(options.updatedAt) : null,
    shift: compatibility.shift,
    deckLayer: compatibility.deckLayer,
    padMode: compatibility.padMode,
    jogLane: compatibility.jogLane,
    jogTouch: compatibility.jogTouch,
    jogCutter: compatibility.jogCutter,
    jogVinylMode: compatibility.jogVinylMode,
    channel4Input: compatibility.channel4Input,
    beatFx: compatibility.beatFx,
    pairedValues: clonePairedValues(options.pairedValues),
    temporary: snapshotTemporary(options.temporary),
    truth: createDefaultTruth(options, compatibility),
  };

  if (options.truth && typeof options.truth === 'object') {
    state.truth = cloneTruthState(options.truth);
  }

  syncCompatibilityFromTruth(state);
  return state;
}

export function snapshotControllerState(state) {
  return createControllerState(state || {});
}

export function getDeckOwnershipTruth(state, side) {
  const normalizedSide = normalizeSide(side);
  if (!normalizedSide) return cloneTruthValue(null, createDeckOwnershipShape('left'));
  return cloneTruthValue(
    state && state.truth && state.truth.deckOwnership && state.truth.deckOwnership[normalizedSide],
    createDeckOwnershipShape(normalizedSide),
  );
}

export function getPadModeTruth(state, side) {
  const normalizedSide = normalizeSide(side);
  return normalizedSide
    ? cloneTruthValue(state && state.truth && state.truth.padMode && state.truth.padMode[normalizedSide])
    : cloneTruthValue();
}

export function getJogTruth(state, side) {
  const normalizedSide = normalizeSide(side);
  if (!normalizedSide) return createJogTruthEntry();
  return createJogTruthEntry(
    state && state.truth && state.truth.jog && state.truth.jog[normalizedSide],
  );
}

export function getChannel4InputTruth(state) {
  return cloneTruthValue(state && state.truth && state.truth.channel4Input);
}

export function getBeatFxTruth(state, unitNumber) {
  const unitKey = `unit${Number(unitNumber) || 1}`;
  return createBeatFxTruthUnit(
    Number(unitNumber) || 1,
    state && state.truth && state.truth.beatFx && state.truth.beatFx[unitKey],
  );
}

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

export function setDeckOwnershipState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  const deckLayer = normalizeDeckLayer(options.deckLayer);
  const deckNumber = Number(options.deckNumber || resolveDeckNumberForSideLayer(side, deckLayer));
  if (!side || !deckLayer || !Number.isFinite(deckNumber)) return state;

  touchState(state, options.timestamp);

  setTruthValue(
    state.truth.deckOwnership[side],
    createDeckOwnershipShape(side, deckNumber, deckLayer),
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );

  setTruthValue(
    state.truth.deckControl[deckNumber],
    true,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );

  const pairedDecks = deckPairBySide[side] || [];
  pairedDecks
    .filter((candidate) => candidate !== deckNumber)
    .forEach((candidate) => {
      setTruthValue(
        state.truth.deckControl[candidate],
        false,
        options.status || 'official',
        {
          source: options.source || 'hardware',
          observedAt: state.updatedAt,
          note: options.note || null,
        },
      );
    });

  syncCompatibilityFromTruth(state);
  return state;
}

export function setDeckControlState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const deckNumber = Number(options.deckNumber);
  if (!mixerChannels.includes(deckNumber)) return state;

  touchState(state, options.timestamp);

  setTruthValue(
    state.truth.deckControl[deckNumber],
    options.active == null ? null : !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );

  const side = resolveSideForDeckNumber(deckNumber);
  const deckLayer = resolveDeckLayerForDeckNumber(deckNumber);
  if (options.active === true && side && deckLayer) {
    setDeckOwnershipState(state, {
      side,
      deckLayer,
      deckNumber,
      status: options.status || 'official',
      source: options.source || 'hardware',
      note: options.note || null,
      timestamp: state.updatedAt,
    });
  } else if (options.active === false && side) {
    const owner = state.truth.deckOwnership[side];
    if (owner && owner.value && owner.value.ownerDeck === deckNumber) {
      const pairedDeck = deckPairBySide[side].find((candidate) => candidate !== deckNumber);
      const pairedTruth = pairedDeck != null ? state.truth.deckControl[pairedDeck] : null;
      if (truthValueIsKnown(pairedTruth) && pairedTruth.value === true) {
        setDeckOwnershipState(state, {
          side,
          deckLayer: resolveDeckLayerForDeckNumber(pairedDeck),
          deckNumber: pairedDeck,
          status: truthValueStatus(pairedTruth),
          source: pairedTruth.source || options.source || 'hardware',
          note: pairedTruth.note || options.note || null,
          timestamp: state.updatedAt,
        });
      } else {
        setTruthValue(
          owner,
          createDeckOwnershipShape(side),
          'unknown',
          {
            source: options.source || 'hardware',
            observedAt: state.updatedAt,
            note: options.note || 'owner released without paired confirmation',
          },
        );
      }
    }
  }

  syncCompatibilityFromTruth(state);
  return state;
}

export function setDeckLayerState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  const deckLayer = normalizeDeckLayer(options.layer);
  if (!side || !deckLayer) return state;
  touchState(state, options.timestamp);
  state.deckLayer[side] = deckLayer;
  return state;
}

export function setPadModeState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  const mode = normalizePadMode(options.mode);
  if (!side || !mode) return state;

  touchState(state, options.timestamp);
  state.padMode[side] = mode;
  setTruthValue(
    state.truth.padMode[side],
    mode,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setJogLaneState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  const lane = normalizeJogLane(options.lane);

  touchState(state, options.timestamp);
  state.jogLane[side] = lane;
  setTruthValue(
    state.truth.jog[side].lastLane,
    lane,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setJogTouchState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;

  touchState(state, options.timestamp);
  state.jogTouch[side] = !!options.active;
  setTruthValue(
    state.truth.jog[side].touchActive,
    !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );

  if (options.variant) {
    setTruthValue(
      state.truth.jog[side].touchVariant,
      String(options.variant),
      options.status || 'official',
      {
        source: options.source || 'hardware',
        observedAt: state.updatedAt,
        note: options.note || null,
      },
    );
  }
  return state;
}

function setJogCutterButtonState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  setTruthValue(
    state.truth.jog[side].jogCutterButton,
    options.active == null ? null : !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

function setJogVinylButtonState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  setTruthValue(
    state.truth.jog[side].vinylModeButton,
    options.active == null ? null : !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setJogCutterState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  state.jogCutter[side] = options.active == null ? null : !!options.active;
  setTruthValue(
    state.truth.jog[side].jogCutterEnabled,
    options.active == null ? null : !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setJogVinylModeState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const side = normalizeSide(options.side);
  if (!side) return state;
  touchState(state, options.timestamp);
  state.jogVinylMode[side] = options.active == null ? null : !!options.active;
  setTruthValue(
    state.truth.jog[side].vinylMode,
    options.active == null ? null : !!options.active,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setChannel4InputState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const selection = normalizeChannel4Input(options.selection);
  touchState(state, options.timestamp);
  state.channel4Input = selection;
  setTruthValue(
    state.truth.channel4Input,
    selection,
    options.status || 'official',
    {
      source: options.source || 'hardware',
      observedAt: state.updatedAt,
      note: options.note || null,
    },
  );
  return state;
}

export function setBeatFxState(state, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const unitNumber = normalizeBeatFxUnit(options.unit) || 1;
  const unitKey = `unit${unitNumber}`;
  if (!state.truth.beatFx[unitKey]) {
    state.truth.beatFx[unitKey] = createBeatFxTruthUnit(unitNumber);
  }
  if (!state.beatFx[unitKey]) {
    state.beatFx[unitKey] = cloneBeatFxUnit();
  }

  touchState(state, options.timestamp);

  if (Object.prototype.hasOwnProperty.call(options, 'selectedSlot')) {
    const previousSlot = state.beatFx[unitKey].selectedSlot != null
      ? Number(state.beatFx[unitKey].selectedSlot)
      : null;
    const slot = normalizeBeatFxSlot(options.selectedSlot);
    state.beatFx[unitKey].selectedSlot = slot;
    setTruthValue(
      state.truth.beatFx[unitKey].selectedSlot,
      slot,
      options.status || 'official',
      {
        source: options.source || 'hardware',
        observedAt: state.updatedAt,
        note: options.note || null,
      },
    );

    if (
      options.resetEnabledOnSlotChange
      && !Object.prototype.hasOwnProperty.call(options, 'enabled')
      && slot !== previousSlot
    ) {
      state.beatFx[unitKey].enabled = null;
      setTruthValue(
        state.truth.beatFx[unitKey].enabled,
        null,
        'unknown',
        {
          source: options.enabledResetSource || options.source || 'hardware',
          observedAt: state.updatedAt,
          note: options.enabledResetNote
            || 'Beat FX slot changed before the selected slot enabled state was authored',
        },
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(options, 'selectedChannel')) {
    const selectedChannel = normalizeBeatFxChannel(options.selectedChannel);
    state.beatFx[unitKey].selectedChannel = selectedChannel;
    setTruthValue(
      state.truth.beatFx[unitKey].selectedChannel,
      selectedChannel,
      options.status || 'official',
      {
        source: options.source || 'hardware',
        observedAt: state.updatedAt,
        note: options.note || null,
      },
    );
  }

  if (Object.prototype.hasOwnProperty.call(options, 'levelDepth')) {
    const levelDepth = normalizeMidiAbsoluteValue(options.levelDepth);
    state.beatFx[unitKey].levelDepth = levelDepth;
    setTruthValue(
      state.truth.beatFx[unitKey].levelDepth,
      levelDepth,
      options.status || 'official',
      {
        source: options.source || 'hardware',
        observedAt: state.updatedAt,
        note: options.note || null,
      },
    );
  }

  if (Object.prototype.hasOwnProperty.call(options, 'enabled')) {
    const enabled = options.enabled == null ? null : !!options.enabled;
    state.beatFx[unitKey].enabled = enabled;
    setTruthValue(
      state.truth.beatFx[unitKey].enabled,
      enabled,
      options.status || 'official',
      {
        source: options.source || 'hardware',
        observedAt: state.updatedAt,
        note: options.note || null,
      },
    );
  }

  return state;
}

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
  slot.deckLayer = normalizeDeckLayer(options.deckLayer) || slot.deckLayer || null;
  slot.rawTarget = options.rawTarget || slot.rawTarget || null;

  state.pairedValues[slotKey] = slot;
  return slot;
}

export function setTemporaryState(state, key, value, timestamp) {
  if (!state || typeof state !== 'object' || !key) return state;
  touchState(state, timestamp);
  state.temporary[String(key)] = value;
  return state;
}

function maybeToggleKnownTruth(truthValue, source, timestamp, note) {
  if (!truthValueIsKnown(truthValue)) {
    setTruthValue(truthValue, null, 'unknown', {
      source,
      observedAt: timestamp,
      note: note || 'toggle observed before prior state was known',
    });
    return null;
  }

  const next = !truthValue.value;
  setTruthValue(truthValue, next, 'inferred', {
    source,
    observedAt: timestamp,
    note,
  });
  return next;
}

export function applyControllerStateEvent(state, event, options = {}) {
  if (!state || typeof state !== 'object' || !event || typeof event !== 'object') return state;

  const binding = options.binding || null;
  const side = getEventSide(event);
  const canonicalTarget = String(event.canonicalTarget || '').toLowerCase();
  const mappingId = String(event.mappingId || '').toLowerCase();
  const timestamp = event.timestamp;
  const deckLayer = normalizeDeckLayer(event.context && event.context.deckLayer);
  const active = isBinaryEventActive(event);
  const beatFxUnit = normalizeBeatFxUnit(event.context && event.context.unit);
  const beatFxSlot = normalizeBeatFxSlot(event.context && event.context.slot);
  const beatFxChannel = normalizeBeatFxChannel(event.context && event.context.selectedChannel);

  if (
    side
    && deckLayer
    && !/^deck\.(left|right)\.transport\.layer\.status\.(main|alternate)$/i.test(canonicalTarget)
  ) {
    setDeckLayerState(state, {
      side,
      layer: deckLayer,
      timestamp,
    });
  }

  if (/^deck\.(left|right)\.transport\.layer\.status\.(main|alternate)$/i.test(canonicalTarget)) {
    const match = /^deck\.(left|right)\.transport\.layer\.status\.(main|alternate)$/i.exec(canonicalTarget);
    const ownerSide = match && match[1];
    const ownerLayer = match && match[2];
    const ownerDeck = resolveDeckNumberForSideLayer(ownerSide, ownerLayer);
    if (ownerDeck != null) {
      setDeckControlState(state, {
        deckNumber: ownerDeck,
        active,
        status: 'official',
        source: 'deck-control-status-row',
        timestamp,
        note: mappingId || canonicalTarget,
      });
    }
  }

  if (canonicalTarget === 'mixer.channel.4.input_select') {
    setChannel4InputState(state, {
      selection: active ? 'sampler' : 'deck4',
      status: 'official',
      source: 'channel-4-selector',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  if (canonicalTarget === 'beatfx.select' && beatFxUnit && beatFxSlot && active) {
    setBeatFxState(state, {
      unit: beatFxUnit,
      selectedSlot: beatFxSlot,
      status: 'official',
      source: 'beat-fx-select-state-row',
      timestamp,
      note: mappingId || canonicalTarget,
      resetEnabledOnSlotChange: true,
    });
  }

  if (canonicalTarget === 'beatfx.channel_select' && beatFxUnit && beatFxChannel && active) {
    setBeatFxState(state, {
      unit: beatFxUnit,
      selectedChannel: beatFxChannel,
      status: 'official',
      source: 'beat-fx-channel-select-state-row',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  if (canonicalTarget === 'beatfx.level_depth' && beatFxUnit) {
    if (beatFxSlot) {
      setBeatFxState(state, {
        unit: beatFxUnit,
        selectedSlot: beatFxSlot,
        status: 'official',
        source: 'beat-fx-level-depth-slot-row',
        timestamp,
        note: mappingId || canonicalTarget,
        resetEnabledOnSlotChange: true,
      });
    }

    const controller = Number(event.controller ?? event.d1);
    const rawValue = Number(event.compatValue ?? event.value);
    const isPrimaryLane = mappingId.endsWith('.primary') || (Number.isFinite(controller) && controller < 32);
    const isSecondaryLane = mappingId.endsWith('.secondary') || (Number.isFinite(controller) && controller >= 32);
    const pairedValue = rememberPairedValue(state, {
      slotKey: `beatfx.unit.${beatFxUnit}.level_depth:${beatFxSlot || 'current'}`,
      coarse: isPrimaryLane ? rawValue : undefined,
      fine: isSecondaryLane ? rawValue : undefined,
      canonicalTarget,
      rawTarget: event.rawTarget || null,
      timestamp,
    });

    if (pairedValue && pairedValue.value != null) {
      setBeatFxState(state, {
        unit: beatFxUnit,
        levelDepth: pairedValue.value,
        status: 'official',
        source: 'beat-fx-level-depth-lane',
        timestamp,
        note: mappingId || canonicalTarget,
      });
    }
  }

  if (canonicalTarget === 'beatfx.on_off' && beatFxUnit) {
    if (beatFxSlot) {
      setBeatFxState(state, {
        unit: beatFxUnit,
        selectedSlot: beatFxSlot,
        status: 'official',
        source: 'beat-fx-on-off-slot-row',
        timestamp,
        note: mappingId || canonicalTarget,
        resetEnabledOnSlotChange: true,
      });
    }

    if (active) {
      const unitKey = `unit${beatFxUnit}`;
      const next = maybeToggleKnownTruth(
        state.truth.beatFx[unitKey].enabled,
        'beat-fx-on-off-toggle',
        state.updatedAt,
        mappingId || canonicalTarget,
      );
      state.beatFx[unitKey].enabled = next == null ? null : !!next;
    }
  }

  if (side && canonicalTarget.endsWith('.transport.shift')) {
    setShiftState(state, {
      side,
      active,
      timestamp,
    });
  }

  if (side && canonicalTarget.endsWith('.jog.touch')) {
    const lane = getEventJogLane(event);
    setJogLaneState(state, {
      side,
      lane,
      status: 'official',
      source: 'jog-touch-lane',
      timestamp,
      note: mappingId || canonicalTarget,
    });
    setJogTouchState(state, {
      side,
      active,
      variant: lane,
      status: 'official',
      source: 'jog-touch-lane',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  if (side && canonicalTarget.endsWith('.jog.cutter')) {
    setJogCutterButtonState(state, {
      side,
      active,
      status: 'official',
      source: 'jog-cutter-button',
      timestamp,
      note: mappingId || canonicalTarget,
    });
    if (active) {
      const next = maybeToggleKnownTruth(
        state.truth.jog[side].jogCutterEnabled,
        'jog-cutter-toggle',
        state.updatedAt,
        mappingId || canonicalTarget,
      );
      state.jogCutter[side] = next == null ? null : !!next;
    }
  }

  if (side && canonicalTarget.endsWith('.jog.vinyl_mode')) {
    setJogVinylButtonState(state, {
      side,
      active,
      status: 'official',
      source: 'vinyl-toggle-button',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  if (side && canonicalTarget.endsWith('.jog.vinyl_mode') && active) {
    const next = maybeToggleKnownTruth(
      state.truth.jog[side].vinylMode,
      'vinyl-toggle-button',
      state.updatedAt,
      mappingId || canonicalTarget,
    );
    state.jogVinylMode[side] = next == null ? null : !!next;
  }

  if (side && canonicalTarget.endsWith('.jog.motion')) {
    const lane = getEventJogLane(event);
    setJogLaneState(state, {
      side,
      lane,
      status: 'official',
      source: 'jog-motion-lane',
      timestamp,
      note: mappingId || canonicalTarget,
    });

    if (lane === 'platter_vinyl_on') {
      setJogVinylModeState(state, {
        side,
        active: true,
        status: 'official',
        source: 'jog-motion-lane',
        timestamp,
        note: mappingId || canonicalTarget,
      });
    } else if (lane === 'platter_vinyl_off') {
      setJogVinylModeState(state, {
        side,
        active: false,
        status: 'official',
        source: 'jog-motion-lane',
        timestamp,
        note: mappingId || canonicalTarget,
      });
    }
  }

  const padModeMatch = /^deck\.(left|right)\.pad_mode\.([a-z0-9_]+)$/i.exec(canonicalTarget);
  if (padModeMatch && active) {
    setPadModeState(state, {
      side: padModeMatch[1],
      mode: padModeMatch[2],
      status: 'official',
      source: 'pad-mode-button',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  const padSurfaceMatch = /^deck\.(left|right)\.pad\.(\d+)$/i.exec(canonicalTarget);
  if (padSurfaceMatch && event.context && event.context.mode) {
    setPadModeState(state, {
      side: padSurfaceMatch[1],
      mode: event.context.mode,
      status: 'official',
      source: 'pad-bank-lane',
      timestamp,
      note: mappingId || canonicalTarget,
    });
  }

  syncCompatibilityFromTruth(state);
  return state;
}
