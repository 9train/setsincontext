// Explicit runtime bridge for the official host/viewer pages.
// The window/global aliases below are compatibility and tooling surfaces only.
// Future cleanup should move tools to runtimeApp methods before removing them.

import { buildDebuggerEventSnapshot } from '../event-log-snapshot.js';

const BRIDGE_KEY = '__FLX_RUNTIME_BRIDGE__';
const PUBLIC_KEY = 'FLXRuntime';
const DEFAULT_RECENT_DEBUGGER_HISTORY_LIMIT = 24;

function identity(value) {
  return value;
}

function noop() {}

function cloneRuntimeDetails(details) {
  if (!details || typeof details !== 'object') return null;
  return Object.freeze({
    midiStatus: details.midiStatus ?? null,
    ready: details.ready === true,
    deviceName: details.deviceName ?? null,
    profileId: details.profileId ?? null,
    profileLabel: details.profileLabel ?? null,
    transport: details.transport ?? null,
    lastEventAt: Number.isFinite(Number(details.lastEventAt)) ? Number(details.lastEventAt) : null,
  });
}

function cloneRelayRuntimeDetails(details) {
  if (!details || typeof details !== 'object') return null;
  return Object.freeze({
    role: details.role ?? null,
    room: details.room ?? null,
    url: details.url ?? null,
  });
}

function cloneRecorderStatus(details) {
  if (!details || typeof details !== 'object') return null;
  const eventCount = Number(details.eventCount);
  return Object.freeze({
    available: details.available === true || details.installed === true,
    installed: details.installed === true,
    state: details.state ?? null,
    eventCount: Number.isFinite(eventCount) ? eventCount : null,
    logSchema: details.logSchema ?? null,
  });
}

function addNamedListener(bucket, name, fn, symbolName) {
  if (!(bucket instanceof Map) || typeof fn !== 'function') return () => {};
  const key = name || Symbol(symbolName);
  bucket.set(key, fn);
  return () => {
    bucket.delete(key);
  };
}

function notifyListeners(bucket, ...args) {
  if (!(bucket instanceof Map)) return;
  for (const listener of bucket.values()) {
    try { listener(...args); } catch {}
  }
}

function getBridgeTarget(target = null) {
  if (target && typeof target === 'object') return target;
  if (typeof window !== 'undefined' && window && typeof window === 'object') return window;
  if (typeof globalThis !== 'undefined') return globalThis;
  return null;
}

function readDescriptorValue(target, key, descriptor) {
  if (!descriptor) return undefined;
  if ('value' in descriptor) return descriptor.value;
  try {
    return descriptor.get ? descriptor.get.call(target) : undefined;
  } catch {
    return undefined;
  }
}

function defineBridgeAlias(target, key, { getValue, setValue }) {
  if (!target || !key || typeof getValue !== 'function' || typeof setValue !== 'function') return;

  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const existingValue = readDescriptorValue(target, key, descriptor);
  if (descriptor && descriptor.configurable === false) {
    if (existingValue !== undefined) setValue(existingValue);
    return;
  }

  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get: getValue,
    set: setValue,
  });

  if (existingValue !== undefined) {
    setValue(existingValue);
  }
}

function createListenerStore() {
  return {
    wsStatus: new Map(),
    midiStatus: new Map(),
    controllerRuntime: new Map(),
    recentDebuggerHistory: new Map(),
    consumeBefore: new Map(),
    consumeAfter: new Map(),
    learnInputs: new Map(),
    monitorInputs: new Map(),
  };
}

function trimRecentDebuggerSnapshots(state) {
  const limit = Math.max(1, Number(state.recentDebuggerHistoryLimit) || DEFAULT_RECENT_DEBUGGER_HISTORY_LIMIT);
  while (state.recentDebuggerSnapshots.length > limit) {
    state.recentDebuggerSnapshots.pop();
  }
}

function captureRecentDebuggerSnapshot(state, listeners, info) {
  if (!info || typeof info !== 'object') return null;
  const snapshot = buildDebuggerEventSnapshot(info, {
    runtimeStatus: {
      wsStatus: state.status.ws,
      midiStatus: state.status.midi,
      controllerRuntime: state.status.controllerRuntime,
      relayRuntime: state.status.relayRuntime,
      recorderStatus: state.status.recorderStatus,
    },
  });
  state.recentDebuggerSnapshots.unshift(snapshot);
  trimRecentDebuggerSnapshots(state);
  const history = state.recentDebuggerSnapshots.slice();
  notifyListeners(listeners.recentDebuggerHistory, snapshot, history);
  return snapshot;
}

function createRuntimeBridge(target) {
  const listeners = createListenerStore();
  const state = {
    target,
    handlers: {
      consumeInfo: identity,
      normalizeInfo: identity,
      setWSStatus: noop,
      setMIDIStatus: noop,
      legacyLearnHook: null,
      legacyMonitorHook: null,
    },
    bound: {},
    status: {
      ws: null,
      midi: null,
      controllerRuntime: null,
      relayRuntime: null,
      recorderStatus: null,
    },
    recentDebuggerHistoryLimit: DEFAULT_RECENT_DEBUGGER_HISTORY_LIMIT,
    recentDebuggerSnapshots: [],
    wsClient: undefined,
  };

  const bridge = {
    get target() {
      return state.target;
    },

    getInfoConsumer() {
      return state.handlers.consumeInfo;
    },

    setInfoConsumer(fn) {
      state.handlers.consumeInfo = typeof fn === 'function' ? fn : identity;
      return state.handlers.consumeInfo;
    },

    consumeInfo(info) {
      for (const tap of listeners.consumeBefore.values()) {
        try { tap(info); } catch {}
      }
      const result = (state.handlers.consumeInfo || identity)(info);
      captureRecentDebuggerSnapshot(state, listeners, info);
      for (const tap of listeners.consumeAfter.values()) {
        try { tap(info, result); } catch {}
      }
      return result;
    },

    getNormalizer() {
      return state.handlers.normalizeInfo;
    },

    setNormalizer(fn) {
      state.handlers.normalizeInfo = typeof fn === 'function' ? fn : identity;
      return state.handlers.normalizeInfo;
    },

    normalizeInfo(info) {
      return (state.handlers.normalizeInfo || identity)(info);
    },

    consumeNormalizedInfo(info) {
      return bridge.consumeInfo(bridge.normalizeInfo(info));
    },

    addConsumeTap(name, fn, { phase = 'after' } = {}) {
      const bucket = phase === 'before' ? listeners.consumeBefore : listeners.consumeAfter;
      return addNamedListener(bucket, name, fn, 'consume-tap');
    },

    getLegacyLearnHook() {
      return state.handlers.legacyLearnHook;
    },

    setLegacyLearnHook(fn) {
      state.handlers.legacyLearnHook = typeof fn === 'function' ? fn : null;
      return state.handlers.legacyLearnHook;
    },

    emitLearnInput(info) {
      try { state.handlers.legacyLearnHook?.(info); } catch {}
      notifyListeners(listeners.learnInputs, info);
      return info;
    },

    addLearnListener(name, fn) {
      return addNamedListener(listeners.learnInputs, name, fn, 'learn-input-listener');
    },

    waitForNextLearnInput({ timeoutMs = 15000 } = {}) {
      const waitMs = timeoutMs == null ? 15000 : Math.max(0, Number(timeoutMs) || 0);
      return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;
        const remove = bridge.addLearnListener(null, (info) => {
          if (settled) return;
          settled = true;
          if (timeoutId != null) clearTimeout(timeoutId);
          remove();
          resolve(info);
        });
        timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          remove();
          reject(new Error('Timed out'));
        }, waitMs);
      });
    },

    captureNextLearnInput(options = {}) {
      return bridge.waitForNextLearnInput(options);
    },

    getLegacyMonitorHook() {
      return state.handlers.legacyMonitorHook;
    },

    setLegacyMonitorHook(fn) {
      state.handlers.legacyMonitorHook = typeof fn === 'function' ? fn : null;
      return state.handlers.legacyMonitorHook;
    },

    emitMonitorInput(info) {
      try { state.handlers.legacyMonitorHook?.(info); } catch {}
      notifyListeners(listeners.monitorInputs, info);
      return info;
    },

    addMonitorListener(name, fn) {
      return addNamedListener(listeners.monitorInputs, name, fn, 'monitor-input-listener');
    },

    getWSStatusHandler() {
      return state.handlers.setWSStatus;
    },

    setWSStatusHandler(fn) {
      state.handlers.setWSStatus = typeof fn === 'function' ? fn : noop;
      return state.handlers.setWSStatus;
    },

    setWSStatus(status) {
      state.status.ws = status ?? null;
      try { (state.handlers.setWSStatus || noop)(status); } catch {}
      for (const listener of listeners.wsStatus.values()) {
        try { listener(status); } catch {}
      }
      return status;
    },

    getWSStatus() {
      return state.status.ws;
    },

    addWSStatusListener(name, fn) {
      return addNamedListener(listeners.wsStatus, name, fn, 'ws-status-listener');
    },

    getMIDIStatusHandler() {
      return state.handlers.setMIDIStatus;
    },

    setMIDIStatusHandler(fn) {
      state.handlers.setMIDIStatus = typeof fn === 'function' ? fn : noop;
      return state.handlers.setMIDIStatus;
    },

    setMIDIStatus(status) {
      state.status.midi = status ?? null;
      try { (state.handlers.setMIDIStatus || noop)(status); } catch {}
      for (const listener of listeners.midiStatus.values()) {
        try { listener(status); } catch {}
      }
      return status;
    },

    getMIDIStatus() {
      return state.status.midi;
    },

    addMIDIStatusListener(name, fn) {
      return addNamedListener(listeners.midiStatus, name, fn, 'midi-status-listener');
    },

    setControllerRuntime(details) {
      state.status.controllerRuntime = cloneRuntimeDetails(details);
      for (const listener of listeners.controllerRuntime.values()) {
        try { listener(state.status.controllerRuntime); } catch {}
      }
      return state.status.controllerRuntime;
    },

    getControllerRuntime() {
      return state.status.controllerRuntime;
    },

    addControllerRuntimeListener(name, fn) {
      return addNamedListener(listeners.controllerRuntime, name, fn, 'controller-runtime-listener');
    },

    setRelayRuntime(details) {
      state.status.relayRuntime = cloneRelayRuntimeDetails(details);
      return state.status.relayRuntime;
    },

    getRelayRuntime() {
      return state.status.relayRuntime;
    },

    setRecorderStatus(details) {
      state.status.recorderStatus = cloneRecorderStatus(details);
      return state.status.recorderStatus;
    },

    getRecorderStatus() {
      return state.status.recorderStatus;
    },

    getRecentDebuggerSnapshots() {
      return state.recentDebuggerSnapshots.slice();
    },

    clearRecentDebuggerSnapshots() {
      state.recentDebuggerSnapshots.length = 0;
      notifyListeners(listeners.recentDebuggerHistory, null, []);
      return [];
    },

    addRecentDebuggerHistoryListener(name, fn) {
      return addNamedListener(listeners.recentDebuggerHistory, name, fn, 'recent-debugger-history-listener');
    },

    getWSClient() {
      return state.wsClient;
    },

    setWSClient(client) {
      state.wsClient = client;
      return client;
    },
  };

  state.bound.consumeInfo = bridge.consumeInfo.bind(bridge);
  state.bound.normalizeInfo = bridge.normalizeInfo.bind(bridge);
  state.bound.setWSStatus = bridge.setWSStatus.bind(bridge);
  state.bound.setMIDIStatus = bridge.setMIDIStatus.bind(bridge);

  // Compatibility/tooling aliases owned by this bridge. Keep these wired until
  // diagnostics, learn/edit tools, recorder, and tests call runtimeApp directly.
  defineBridgeAlias(target, 'consumeInfo', {
    getValue: () => state.bound.consumeInfo,
    setValue: (fn) => {
      if (fn === state.bound.consumeInfo) return;
      bridge.setInfoConsumer(fn);
    },
  });

  defineBridgeAlias(target, 'normalizeInfo', {
    getValue: () => state.bound.normalizeInfo,
    setValue: (fn) => {
      if (fn === state.bound.normalizeInfo) return;
      bridge.setNormalizer(fn);
    },
  });

  defineBridgeAlias(target, 'setWSStatus', {
    getValue: () => state.bound.setWSStatus,
    setValue: (fn) => {
      if (fn === state.bound.setWSStatus) return;
      bridge.setWSStatusHandler(fn);
    },
  });

  defineBridgeAlias(target, 'setMIDIStatus', {
    getValue: () => state.bound.setMIDIStatus,
    setValue: (fn) => {
      if (fn === state.bound.setMIDIStatus) return;
      bridge.setMIDIStatusHandler(fn);
    },
  });

  defineBridgeAlias(target, 'FLX_LEARN_HOOK', {
    getValue: () => bridge.getLegacyLearnHook(),
    setValue: (fn) => {
      bridge.setLegacyLearnHook(fn);
    },
  });

  defineBridgeAlias(target, 'FLX_MONITOR_HOOK', {
    getValue: () => bridge.getLegacyMonitorHook(),
    setValue: (fn) => {
      bridge.setLegacyMonitorHook(fn);
    },
  });

  defineBridgeAlias(target, 'wsClient', {
    getValue: () => bridge.getWSClient(),
    setValue: (client) => {
      bridge.setWSClient(client);
    },
  });

  try {
    Object.defineProperty(target, PUBLIC_KEY, {
      configurable: true,
      enumerable: false,
      value: bridge,
      writable: false,
    });
  } catch {
    try {
      target[PUBLIC_KEY] = bridge;
    } catch {}
  }

  return bridge;
}

export function getRuntimeApp(target = null) {
  const root = getBridgeTarget(target);
  if (!root) return null;
  if (!root[BRIDGE_KEY]) {
    root[BRIDGE_KEY] = createRuntimeBridge(root);
  }
  return root[BRIDGE_KEY];
}
