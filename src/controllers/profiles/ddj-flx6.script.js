import {
  applyControllerStateEvent,
  createControllerState,
  getEventSide,
  rememberPairedValue,
  setTemporaryState,
  snapshotControllerState,
} from '../core/state.js';
import { buildFlx6OutputMessages } from './ddj-flx6.outputs.js';
import { resolveFlx6InputEvent } from './ddj-flx6.middle.js';

function freezeTemplate(value) {
  if (!value || typeof value !== 'object') return value;
  Object.keys(value).forEach((key) => {
    value[key] = freezeTemplate(value[key]);
  });
  return Object.freeze(value);
}

export const flx6RuntimeStateTemplate = freezeTemplate(
  createControllerState({
    profileId: 'pioneer-ddj-flx6',
    defaultDeckLayer: 'main',
    temporary: {
      lastInput: null,
      lastPairedValue: null,
      lastDebugEvent: null,
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
    jogLane: {
      ...base.jogLane,
      ...(overrides.jogLane || {}),
    },
    jogTouch: {
      ...base.jogTouch,
      ...(overrides.jogTouch || {}),
    },
    jogCutter: {
      ...base.jogCutter,
      ...(overrides.jogCutter || {}),
    },
    jogVinylMode: {
      ...base.jogVinylMode,
      ...(overrides.jogVinylMode || {}),
    },
    channel4Input: Object.prototype.hasOwnProperty.call(overrides, 'channel4Input')
      ? overrides.channel4Input
      : base.channel4Input,
    beatFx: {
      ...(base.beatFx || {}),
      ...(overrides.beatFx || {}),
      unit1: {
        ...(base.beatFx && base.beatFx.unit1 || {}),
        ...(overrides.beatFx && overrides.beatFx.unit1 || {}),
      },
      unit2: {
        ...(base.beatFx && base.beatFx.unit2 || {}),
        ...(overrides.beatFx && overrides.beatFx.unit2 || {}),
      },
    },
    pairedValues: {
      ...base.pairedValues,
      ...(overrides.pairedValues || {}),
    },
    temporary: {
      ...base.temporary,
      ...(overrides.temporary || {}),
    },
    truth: {
      ...(base.truth || {}),
      ...(overrides.truth || {}),
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
  const rawValue = Number(event && (event.compatValue ?? event.value));
  const side = getEventSide(event);
  const deckLayer = event && event.context && event.context.deckLayer
    || (side && state && state.deckLayer && state.deckLayer[side])
    || 'main';

  const isPrimary = mappingId.endsWith('.primary') || controller === 0;
  const isSecondary = mappingId.endsWith('.secondary') || controller === 32;
  if (!isPrimary && !isSecondary) return null;

  return rememberPairedValue(state, {
    slotKey,
    coarse: isPrimary ? rawValue : undefined,
    fine: isSecondary ? rawValue : undefined,
    canonicalTarget: event.canonicalTarget || null,
    side,
    deckLayer,
    rawTarget: event.rawTarget || null,
    timestamp: event.timestamp,
  });
}

function applyFlx6DerivedState(state, event) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : createFlx6RuntimeState();

  if (!event || typeof event !== 'object') return runtimeState;

  const pairedSlot = rememberFlx6PairedInput(runtimeState, event);
  const side = getEventSide(event);
  const deckLayer = side && runtimeState.deckLayer
    ? runtimeState.deckLayer[side]
    : null;
  const semantic = event.semantic || null;
  const deckContext = semantic && semantic.deckContext || null;
  const owner = deckContext && deckContext.owner || null;
  const render = event.render || null;

  setTemporaryState(runtimeState, 'lastInput', {
    canonicalTarget: event.canonicalTarget || null,
    mappingId: event.mappingId || null,
    interaction: event.interaction || event.type || null,
    side,
    deckLayer,
    ownerDeck: owner && owner.deckNumber != null ? Number(owner.deckNumber) : null,
    ownerLayer: owner && owner.deckLayer || null,
    truthStatus: event.truthStatus || semantic && semantic.truthStatus || null,
    semanticFamily: semantic && semantic.family || null,
    semanticAction: semantic && semantic.action || null,
    semanticMeaning: semantic && semantic.meaning || null,
    renderTarget: render && render.targetId || event.resolvedRenderTarget || null,
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

  if (event.debug) {
    setTemporaryState(runtimeState, 'lastDebugEvent', event.debug, event.timestamp);
  }

  return runtimeState;
}

export function applyFlx6InputState(state, event) {
  const runtimeState = state && typeof state === 'object'
    ? state
    : createFlx6RuntimeState();

  if (!event || typeof event !== 'object') return runtimeState;

  applyControllerStateEvent(runtimeState, event);
  return applyFlx6DerivedState(runtimeState, event);
}

export function describeFlx6InputModel() {
  return Object.freeze({
    deckLayerChannels: Object.freeze({
      main: Object.freeze([1, 2]),
      alternate: Object.freeze([3, 4]),
    }),
    jogMotion: Object.freeze({
      left: Object.freeze(['cc:1:33', 'cc:1:34', 'cc:1:35', 'cc:1:38', 'cc:1:41', 'cc:3:33', 'cc:3:34', 'cc:3:35', 'cc:3:38', 'cc:3:41']),
      right: Object.freeze(['cc:2:33', 'cc:2:34', 'cc:2:35', 'cc:2:38', 'cc:2:41', 'cc:4:33', 'cc:4:34', 'cc:4:35', 'cc:4:38', 'cc:4:41']),
    }),
    jogTouch: Object.freeze({
      left: Object.freeze(['noteon:1:54', 'noteoff:1:54', 'noteon:1:103', 'noteoff:1:103', 'noteon:3:54', 'noteoff:3:54', 'noteon:3:103', 'noteoff:3:103']),
      right: Object.freeze(['noteon:2:54', 'noteoff:2:54', 'noteon:2:103', 'noteoff:2:103', 'noteon:4:54', 'noteoff:4:54', 'noteon:4:103', 'noteoff:4:103']),
    }),
    jogCutter: Object.freeze({
      left: Object.freeze(['noteon:1:28', 'noteoff:1:28', 'noteon:3:28', 'noteoff:3:28']),
      right: Object.freeze(['noteon:2:28', 'noteoff:2:28', 'noteon:4:28', 'noteoff:4:28']),
    }),
    jogVinylMode: Object.freeze({
      left: Object.freeze(['noteon:1:23', 'noteoff:1:23', 'noteon:3:23', 'noteoff:3:23']),
      right: Object.freeze(['noteon:2:23', 'noteoff:2:23', 'noteon:4:23', 'noteoff:4:23']),
    }),
    deckControlStatus: Object.freeze({
      left: Object.freeze(['noteon:1:60', 'noteoff:1:60', 'noteon:3:60', 'noteoff:3:60']),
      right: Object.freeze(['noteon:2:60', 'noteoff:2:60', 'noteon:4:60', 'noteoff:4:60']),
    }),
    transport: Object.freeze({
      play: Object.freeze({
        left: Object.freeze(['noteon:1:11', 'noteoff:1:11', 'noteon:1:71', 'noteoff:1:71', 'noteon:3:11', 'noteoff:3:11', 'noteon:3:71', 'noteoff:3:71']),
        right: Object.freeze(['noteon:2:11', 'noteoff:2:11', 'noteon:2:71', 'noteoff:2:71', 'noteon:4:11', 'noteoff:4:11', 'noteon:4:71', 'noteoff:4:71']),
      }),
      cue: Object.freeze({
        left: Object.freeze(['noteon:1:12', 'noteoff:1:12', 'noteon:1:72', 'noteoff:1:72', 'noteon:3:12', 'noteoff:3:12', 'noteon:3:72', 'noteoff:3:72']),
        right: Object.freeze(['noteon:2:12', 'noteoff:2:12', 'noteon:2:72', 'noteoff:2:72', 'noteon:4:12', 'noteoff:4:12', 'noteon:4:72', 'noteoff:4:72']),
      }),
      sync: Object.freeze({
        left: Object.freeze(['noteon:1:88', 'noteoff:1:88', 'noteon:1:93', 'noteoff:1:93', 'noteon:3:88', 'noteoff:3:88', 'noteon:3:93', 'noteoff:3:93']),
        right: Object.freeze(['noteon:2:88', 'noteoff:2:88', 'noteon:2:93', 'noteoff:2:93', 'noteon:4:88', 'noteoff:4:88', 'noteon:4:93', 'noteoff:4:93']),
      }),
      master: Object.freeze({
        left: Object.freeze(['noteon:1:92', 'noteoff:1:92', 'noteon:1:96', 'noteoff:1:96', 'noteon:3:92', 'noteoff:3:92', 'noteon:3:96', 'noteoff:3:96']),
        right: Object.freeze(['noteon:2:92', 'noteoff:2:92', 'noteon:2:96', 'noteoff:2:96', 'noteon:4:92', 'noteoff:4:92', 'noteon:4:96', 'noteoff:4:96']),
      }),
    }),
    browser: Object.freeze({
      scroll: Object.freeze(['cc:7:64', 'cc:7:100']),
      push: Object.freeze(['noteon:7:65', 'noteoff:7:65', 'noteon:7:66', 'noteoff:7:66']),
      back: Object.freeze(['noteon:7:101', 'noteoff:7:101', 'noteon:7:102', 'noteoff:7:102']),
      view: Object.freeze(['noteon:7:122', 'noteoff:7:122', 'noteon:7:103', 'noteoff:7:103', 'noteon:7:104', 'noteoff:7:104']),
      load: Object.freeze({
        deck1: Object.freeze(['noteon:7:70', 'noteoff:7:70', 'noteon:7:88', 'noteoff:7:88']),
        deck2: Object.freeze(['noteon:7:71', 'noteoff:7:71', 'noteon:7:89', 'noteoff:7:89']),
        deck3: Object.freeze(['noteon:7:72', 'noteoff:7:72', 'noteon:7:96', 'noteoff:7:96']),
        deck4: Object.freeze(['noteon:7:73', 'noteoff:7:73', 'noteon:7:97', 'noteoff:7:97']),
      }),
    }),
    channel4Input: Object.freeze(['noteon:4:13', 'noteoff:4:13']),
    beatFx: Object.freeze({
      select: Object.freeze({
        unit1: Object.freeze(['noteon:5:112', 'noteoff:5:112', 'noteon:5:113', 'noteoff:5:113', 'noteon:5:114', 'noteoff:5:114']),
        unit2: Object.freeze(['noteon:6:112', 'noteoff:6:112', 'noteon:6:113', 'noteoff:6:113', 'noteon:6:114', 'noteoff:6:114']),
      }),
      channelSelect: Object.freeze({
        unit1: Object.freeze(['noteon:5:20', 'noteoff:5:20', 'noteon:5:28', 'noteoff:5:28', 'noteon:5:29', 'noteoff:5:29', 'noteon:5:30', 'noteoff:5:30', 'noteon:5:31', 'noteoff:5:31']),
        unit2: Object.freeze(['noteon:6:20', 'noteoff:6:20', 'noteon:6:28', 'noteoff:6:28', 'noteon:6:29', 'noteoff:6:29', 'noteon:6:30', 'noteoff:6:30', 'noteon:6:31', 'noteoff:6:31']),
      }),
      beatStep: Object.freeze({
        unit1: Object.freeze(['noteon:5:6', 'noteoff:5:6', 'noteon:5:7', 'noteoff:5:7']),
        unit2: Object.freeze(['noteon:6:6', 'noteoff:6:6', 'noteon:6:7', 'noteoff:6:7']),
      }),
      levelDepth: Object.freeze({
        unit1: Object.freeze(['cc:5:2', 'cc:5:34', 'cc:5:4', 'cc:5:36', 'cc:5:6', 'cc:5:38']),
        unit2: Object.freeze(['cc:6:2', 'cc:6:34', 'cc:6:4', 'cc:6:36', 'cc:6:6', 'cc:6:38']),
      }),
      onOff: Object.freeze({
        unit1: Object.freeze(['noteon:5:71', 'noteoff:5:71', 'noteon:5:72', 'noteoff:5:72', 'noteon:5:73', 'noteoff:5:73']),
        unit2: Object.freeze(['noteon:6:71', 'noteoff:6:71', 'noteon:6:72', 'noteoff:6:72', 'noteon:6:73', 'noteoff:6:73']),
      }),
    }),
    sharedState: Object.freeze({
      shift: Object.freeze(['left', 'right', 'global']),
      deckLayer: Object.freeze(['left', 'right']),
      padMode: Object.freeze(['left', 'right']),
      jogLane: Object.freeze(['left', 'right']),
      jogTouch: Object.freeze(['left', 'right']),
      jogCutter: Object.freeze(['left', 'right']),
      jogVinylMode: Object.freeze(['left', 'right']),
      channel4Input: Object.freeze(['deck4', 'sampler']),
      beatFx: Object.freeze(['unit1', 'unit2']),
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
  const resolvedEvents = [];

  for (let index = 0; index < events.length; index += 1) {
    const resolved = resolveFlx6InputEvent({
      rawEvent: raw || null,
      inputEvent: events[index],
      controllerState: runtimeState,
      profile: controllerCtx && controllerCtx.profile || null,
    });
    applyFlx6DerivedState(runtimeState, resolved);
    resolvedEvents.push(resolved);
  }

  return {
    ok: true,
    executed: resolvedEvents.length > 0,
    profileId: runtimeState.profileId,
    state: runtimeState,
    handled: resolvedEvents.length,
    reason: resolvedEvents.length ? null : 'no-normalized-events',
    rawKey: raw && raw.key || null,
    events: resolvedEvents,
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
