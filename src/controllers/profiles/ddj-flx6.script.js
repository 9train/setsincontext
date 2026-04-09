import {
  applyControllerStateEvent,
  createControllerState,
  getEventSide,
  rememberPairedValue,
  setTemporaryState,
  snapshotControllerState,
} from '../core/state.js';
import { buildFlx6OutputMessages } from './ddj-flx6.outputs.js';

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

function getHookTimestamp(controllerCtx, fallback) {
  if (fallback != null) return Number(fallback);
  if (controllerCtx && typeof controllerCtx.now === 'function') {
    return Number(controllerCtx.now()) || Date.now();
  }
  return Date.now();
}

function getSessionState(runtimeState) {
  return runtimeState && runtimeState.temporary && typeof runtimeState.temporary.session === 'object'
    ? runtimeState.temporary.session
    : {};
}

export function init(controllerCtx) {
  const runtimeState = controllerCtx && controllerCtx.state && typeof controllerCtx.state === 'object'
    ? controllerCtx.state
    : createFlx6RuntimeState();
  const timestamp = getHookTimestamp(controllerCtx);

  setTemporaryState(runtimeState, 'session', {
    ...getSessionState(runtimeState),
    profileId: controllerCtx && controllerCtx.profileId || runtimeState.profileId || 'pioneer-ddj-flx6',
    transport: controllerCtx && controllerCtx.transport || 'midi',
    inputName: controllerCtx && controllerCtx.device && controllerCtx.device.inputName || null,
    outputName: controllerCtx && controllerCtx.device && controllerCtx.device.outputName || null,
    initializedAt: timestamp,
    shutdownAt: null,
  }, timestamp);

  return {
    ok: true,
    executed: true,
    profileId: runtimeState.profileId,
    state: runtimeState,
    reason: null,
  };
}

export function handleInput(raw, normalized, state, controllerCtx) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : createFlx6RuntimeState({
      profileId: controllerCtx && controllerCtx.profileId,
    });
  const events = Array.isArray(normalized)
    ? normalized
    : normalized ? [normalized] : [];

  for (let index = 0; index < events.length; index += 1) {
    applyFlx6InputState(runtimeState, events[index]);
  }

  return {
    ok: true,
    executed: events.length > 0,
    profileId: runtimeState.profileId,
    state: runtimeState,
    handled: events.length,
    reason: events.length ? null : 'no-normalized-events',
    rawKey: raw && raw.key || null,
  };
}

export function handleOutput(appState, controllerState, controllerCtx) {
  const runtimeState = controllerState && typeof controllerState === 'object'
    ? controllerState
    : createFlx6RuntimeState({
      profileId: controllerCtx && controllerCtx.profileId,
    });
  const requestedMessages = Array.isArray(appState && appState.requestedMessages)
    ? appState.requestedMessages
    : [];
  const timestamp = getHookTimestamp(controllerCtx);
  const bindings = controllerCtx
    && controllerCtx.profile
    && controllerCtx.profile.outputs
    && Array.isArray(controllerCtx.profile.outputs.bindings)
      ? controllerCtx.profile.outputs.bindings
      : [];
  const generatedMessages = buildFlx6OutputMessages(requestedMessages, {
    profileId: controllerCtx && controllerCtx.profileId || runtimeState.profileId,
    timestamp,
    controllerState: runtimeState,
    bindings,
  });

  setTemporaryState(runtimeState, 'lastOutput', {
    requestedCount: requestedMessages.length,
    generatedCount: generatedMessages.length,
    canonicalTargets: generatedMessages.map((message) => message.canonicalTarget).filter(Boolean),
    timestamp,
  }, timestamp);

  return {
    ok: true,
    executed: generatedMessages.length > 0,
    profileId: runtimeState.profileId,
    state: runtimeState,
    messages: generatedMessages,
    reason: generatedMessages.length
      ? null
      : requestedMessages.length
        ? 'no-output-bindings-matched'
        : 'no-output-requests',
  };
}

export function shutdown(controllerCtx, controllerState) {
  const runtimeState = controllerState && typeof controllerState === 'object'
    ? controllerState
    : controllerCtx && controllerCtx.state && typeof controllerCtx.state === 'object'
      ? controllerCtx.state
      : createFlx6RuntimeState();
  const timestamp = getHookTimestamp(controllerCtx);

  setTemporaryState(runtimeState, 'session', {
    ...getSessionState(runtimeState),
    shutdownAt: timestamp,
  }, timestamp);

  return {
    ok: true,
    executed: true,
    profileId: runtimeState.profileId,
    state: runtimeState,
    reason: null,
  };
}

export function runFlx6Init(controllerCtx) {
  return init(controllerCtx);
}

export function runFlx6Keepalive(controllerCtx, state) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : controllerCtx && controllerCtx.state && typeof controllerCtx.state === 'object'
      ? controllerCtx.state
      : createFlx6RuntimeState();
  const timestamp = getHookTimestamp(controllerCtx);

  setTemporaryState(runtimeState, 'lastKeepalive', {
    timestamp,
  }, timestamp);

  return {
    ok: true,
    executed: false,
    profileId: runtimeState.profileId,
    state: runtimeState,
    reason: 'flx6-keepalive-not-wired',
  };
}

export function runFlx6LearnHook(controllerCtx, state) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : controllerCtx && controllerCtx.state && typeof controllerCtx.state === 'object'
      ? controllerCtx.state
      : createFlx6RuntimeState();

  return {
    ok: true,
    executed: false,
    profileId: runtimeState.profileId,
    state: runtimeState,
    reason: 'flx6-learn-hook-not-wired',
  };
}

export const flx6RuntimeHooks = Object.freeze({
  init: Object.freeze({
    id: 'flx6.init',
    modulePath: './ddj-flx6.script.js',
    exportName: 'init',
    summary: 'Initializes FLX6 controller-owned state for the live app hook lifecycle.',
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
    exportName: 'handleInput',
    summary: 'Consumes normalized FLX6 input events and updates shared controller state for modal behavior.',
  }),
  output: Object.freeze({
    id: 'flx6.output',
    modulePath: './ddj-flx6.script.js',
    exportName: 'handleOutput',
    summary: 'Receives canonical app-side output requests and resolves the first FLX6 transport LED messages.',
  }),
  shutdown: Object.freeze({
    id: 'flx6.shutdown',
    modulePath: './ddj-flx6.script.js',
    exportName: 'shutdown',
    summary: 'Marks the end of one FLX6 controller session so temporary script state can close cleanly.',
  }),
  learn: Object.freeze({
    id: 'flx6.learn',
    modulePath: './ddj-flx6.script.js',
    exportName: 'runFlx6LearnHook',
    summary: 'Reserved learn-flow hook for future FLX6 mapping discovery support.',
  }),
});

export default flx6RuntimeHooks;
