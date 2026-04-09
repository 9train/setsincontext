import {
  applyControllerStateEvent,
  createControllerState,
  getEventSide,
  rememberPairedValue,
  setTemporaryState,
  snapshotControllerState,
} from '../core/state.js';

function freezeTemplate(state) {
  const pairedValues = {};
  Object.entries(state.pairedValues || {}).forEach(([key, value]) => {
    pairedValues[key] = Object.freeze({ ...value });
  });

  return Object.freeze({
    ...state,
    shift: Object.freeze({ ...(state.shift || {}) }),
    deckLayer: Object.freeze({ ...(state.deckLayer || {}) }),
    padMode: Object.freeze({ ...(state.padMode || {}) }),
    jogTouch: Object.freeze({ ...(state.jogTouch || {}) }),
    pairedValues: Object.freeze(pairedValues),
    temporary: Object.freeze({ ...(state.temporary || {}) }),
  });
}

export const flx6RuntimeStateTemplate = freezeTemplate(
  createControllerState({
    profileId: 'pioneer-ddj-flx6',
    defaultDeckLayer: 'main',
    defaultPadMode: 'hotcue',
    temporary: {
      lastInput: null,
      lastPairedValue: null,
    },
  }),
);

export function createFlx6RuntimeState(overrides = {}) {
  const base = snapshotControllerState(flx6RuntimeStateTemplate);
  return createControllerState({
    ...base,
    ...overrides,
    profileId: overrides.profileId || base.profileId,
    shift: {
      ...base.shift,
      ...(overrides.shift || {}),
    },
    deckLayer: {
      ...base.deckLayer,
      ...(overrides.deckLayer || {}),
    },
    padMode: {
      ...base.padMode,
      ...(overrides.padMode || {}),
    },
    jogTouch: {
      ...base.jogTouch,
      ...(overrides.jogTouch || {}),
    },
    pairedValues: {
      ...base.pairedValues,
      ...(overrides.pairedValues || {}),
    },
    temporary: {
      ...base.temporary,
      ...(overrides.temporary || {}),
    },
  });
}

function getFlx6TempoSlotKey(event, state) {
  const canonicalTarget = String(event && event.canonicalTarget || '').toLowerCase();
  if (canonicalTarget !== 'deck.left.tempo.fader' && canonicalTarget !== 'deck.right.tempo.fader') {
    return null;
  }

  const side = getEventSide(event);
  const deckLayer = event && event.context && event.context.deckLayer
    || (side && state && state.deckLayer && state.deckLayer[side])
    || 'main';

  return `${canonicalTarget}:${deckLayer}`;
}

function rememberFlx6PairedInput(state, event) {
  const slotKey = getFlx6TempoSlotKey(event, state);
  if (!slotKey) return null;

  const mappingId = String(event && event.mappingId || '').toLowerCase();
  const controller = Number(event && (event.controller ?? event.d1));
  const side = getEventSide(event);
  const deckLayer = event && event.context && event.context.deckLayer
    || (side && state && state.deckLayer && state.deckLayer[side])
    || 'main';

  const isPrimary = mappingId.endsWith('.primary') || controller === 0;
  const isSecondary = mappingId.endsWith('.secondary') || controller === 32;
  if (!isPrimary && !isSecondary) return null;

  return rememberPairedValue(state, {
    slotKey,
    coarse: isPrimary ? event.value : undefined,
    fine: isSecondary ? event.value : undefined,
    canonicalTarget: event.canonicalTarget || null,
    side,
    deckLayer,
    rawTarget: event.rawTarget || null,
    timestamp: event.timestamp,
  });
}

export function applyFlx6InputState(state, event) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : createFlx6RuntimeState();

  if (!event || typeof event !== 'object') return runtimeState;

  applyControllerStateEvent(runtimeState, event);

  const pairedSlot = rememberFlx6PairedInput(runtimeState, event);
  const side = getEventSide(event);
  const deckLayer = side && runtimeState.deckLayer
    ? runtimeState.deckLayer[side]
    : null;

  setTemporaryState(runtimeState, 'lastInput', {
    canonicalTarget: event.canonicalTarget || null,
    mappingId: event.mappingId || null,
    interaction: event.interaction || event.type || null,
    side,
    deckLayer,
    timestamp: event.timestamp != null ? Number(event.timestamp) : runtimeState.updatedAt,
  }, event.timestamp);

  if (pairedSlot) {
    setTemporaryState(runtimeState, 'lastPairedValue', {
      slotKey: getFlx6TempoSlotKey(event, runtimeState),
      value: pairedSlot.value,
      coarse: pairedSlot.coarse,
      fine: pairedSlot.fine,
      deckLayer: pairedSlot.deckLayer,
      side: pairedSlot.side,
      timestamp: pairedSlot.updatedAt,
    }, event.timestamp);
  }

  return runtimeState;
}

export function describeFlx6InputModel() {
  return Object.freeze({
    deckLayerChannels: Object.freeze({
      main: Object.freeze([1, 2]),
      alternate: Object.freeze([3, 4]),
    }),
    jogMotion: Object.freeze({
      left: Object.freeze(['cc:1:33', 'cc:1:34']),
      right: Object.freeze(['cc:2:33', 'cc:2:34']),
    }),
    jogTouch: Object.freeze({
      left: Object.freeze(['noteon:1:54', 'noteoff:1:54']),
      right: Object.freeze(['noteon:2:54', 'noteoff:2:54']),
    }),
    sharedState: Object.freeze({
      shift: Object.freeze(['left', 'right', 'global']),
      deckLayer: Object.freeze(['left', 'right']),
      padMode: Object.freeze(['left', 'right']),
      jogTouch: Object.freeze(['left', 'right']),
      pairedValues: Object.freeze(['deck.left.tempo.fader:*', 'deck.right.tempo.fader:*']),
    }),
  });
}

export function runFlx6Init() {
  return {
    ok: false,
    executed: false,
    reason: 'flx6-init-not-wired',
  };
}

export function runFlx6Keepalive() {
  return {
    ok: false,
    executed: false,
    reason: 'flx6-keepalive-not-wired',
  };
}

export function runFlx6LearnHook() {
  return {
    ok: false,
    executed: false,
    reason: 'flx6-learn-hook-not-wired',
  };
}

export const flx6RuntimeHooks = Object.freeze({
  init: Object.freeze({
    id: 'flx6.init',
    modulePath: './ddj-flx6.script.js',
    exportName: 'runFlx6Init',
    summary: 'Reserved startup hook for future FLX6-specific setup without moving runtime behavior yet.',
  }),
  keepalive: Object.freeze({
    id: 'flx6.keepalive',
    modulePath: './ddj-flx6.script.js',
    exportName: 'runFlx6Keepalive',
    summary: 'Reserved heartbeat hook for future FLX6 LED or output refresh work.',
  }),
  input: Object.freeze({
    id: 'flx6.input',
    modulePath: './ddj-flx6.script.js',
    exportName: 'applyFlx6InputState',
    summary: 'Updates shared FLX6 controller state for modal input behavior such as pad modes, jog touch, shift, and paired tempo lanes.',
  }),
  learn: Object.freeze({
    id: 'flx6.learn',
    modulePath: './ddj-flx6.script.js',
    exportName: 'runFlx6LearnHook',
    summary: 'Reserved learn-flow hook for future FLX6 mapping discovery support.',
  }),
});

export default flx6RuntimeHooks;
