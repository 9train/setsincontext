import { createControllerState, snapshotControllerState } from './state.js';
import {
  createFlx6RuntimeState,
  handleInput as handleFlx6Input,
  handleOutput as handleFlx6Output,
  init as initFlx6Script,
  runFlx6Keepalive,
  runFlx6LearnHook,
  shutdown as shutdownFlx6Script,
} from '../profiles/ddj-flx6.script.js';

export const controllerHookPhases = Object.freeze([
  'init',
  'input',
  'output',
  'shutdown',
  'keepalive',
  'learn',
]);

/**
 * Small app-owned context object passed to controller scripts.
 * It exposes the profile, live device identity, and the shared controller state.
 *
 * @typedef {Object} ControllerScriptContext
 * @property {string|null} profileId
 * @property {import('../profiles/definition.js').ControllerProfileDefinition|null} profile
 * @property {import('../adapters/boundary.js').AdapterDeviceInfo|null} device
 * @property {'midi'|'hid'|'virtual'|null} transport
 * @property {string|null} adapterId
 * @property {'host'|'viewer'|'unknown'} role
 * @property {string|null} room
 * @property {import('./state.js').ControllerState} state
 * @property {() => import('./state.js').ControllerState} getState
 * @property {() => import('./state.js').ControllerState} snapshotState
 * @property {() => number} now
 */

/**
 * Generic result returned by controller hooks.
 *
 * @typedef {Object} ControllerHookResult
 * @property {boolean=} ok
 * @property {boolean=} executed
 * @property {'init'|'input'|'output'|'shutdown'|'keepalive'|'learn'=} phase
 * @property {string|null=} profileId
 * @property {import('./state.js').ControllerState|null=} state
 * @property {number=} handled
 * @property {string|null=} reason
 * @property {import('../output/feedback.js').FeedbackMessage[]=} messages
 */

/**
 * Shared lifecycle interface implemented by profile-owned controller scripts.
 *
 * @typedef {Object} ControllerScriptLifecycle
 * @property {(controllerCtx: ControllerScriptContext) => ControllerHookResult=} init
 * @property {(raw: import('./contracts.js').RawInputEvent|null, normalized: import('./contracts.js').NormalizedInputEvent[], state: import('./state.js').ControllerState, controllerCtx: ControllerScriptContext) => ControllerHookResult=} input
 * @property {(appState: unknown, state: import('./state.js').ControllerState, controllerCtx: ControllerScriptContext) => ControllerHookResult=} output
 * @property {(controllerCtx: ControllerScriptContext, state: import('./state.js').ControllerState) => ControllerHookResult=} shutdown
 * @property {(controllerCtx: ControllerScriptContext, state: import('./state.js').ControllerState) => ControllerHookResult=} keepalive
 * @property {(controllerCtx: ControllerScriptContext, state: import('./state.js').ControllerState) => ControllerHookResult=} learn
 */

/**
 * Live hook runner returned by the controller layer.
 *
 * @typedef {Object} ControllerScriptRuntime
 * @property {import('../profiles/definition.js').ControllerProfileDefinition|null} profile
 * @property {ControllerScriptContext} context
 * @property {import('./state.js').ControllerState} state
 * @property {() => ControllerHookResult} init
 * @property {(raw: import('./contracts.js').RawInputEvent|null, normalized: import('./contracts.js').NormalizedInputEvent[]|import('./contracts.js').NormalizedInputEvent|null) => ControllerHookResult} handleInput
 * @property {(appState: unknown) => ControllerHookResult} handleOutput
 * @property {() => ControllerHookResult} shutdown
 * @property {() => import('./state.js').ControllerState} getState
 * @property {() => import('./state.js').ControllerState} snapshotState
 */

const controllerScriptRegistry = Object.freeze({
  'flx6.init': initFlx6Script,
  'flx6.input': handleFlx6Input,
  'flx6.output': handleFlx6Output,
  'flx6.shutdown': shutdownFlx6Script,
  'flx6.keepalive': runFlx6Keepalive,
  'flx6.learn': runFlx6LearnHook,
});

const controllerScriptExportRegistry = Object.freeze({
  init: initFlx6Script,
  handleInput: handleFlx6Input,
  handleOutput: handleFlx6Output,
  shutdown: shutdownFlx6Script,
  runFlx6Keepalive,
  runFlx6LearnHook,
});

const controllerStateFactoryRegistry = Object.freeze({
  'pioneer-ddj-flx6': createFlx6RuntimeState,
});

function normalizeHookResult(result, options = {}) {
  const base = {
    ok: !!options.defaultOk,
    executed: !!options.defaultExecuted,
    phase: options.phase || null,
    profileId: options.profileId || null,
    state: options.state || null,
    handled: options.handled != null ? Number(options.handled) : undefined,
    reason: options.reason || null,
    messages: [],
  };

  if (!result || typeof result !== 'object') return base;

  return {
    ...base,
    ...result,
    ok: result.ok != null ? !!result.ok : base.ok,
    executed: result.executed != null ? !!result.executed : base.executed,
    phase: result.phase || base.phase,
    profileId: result.profileId || base.profileId,
    state: result.state || base.state,
    handled: result.handled != null ? Number(result.handled) : base.handled,
    reason: result.reason != null ? String(result.reason) : base.reason,
    messages: Array.isArray(result.messages) ? result.messages.slice() : base.messages,
  };
}

function resolveScriptFunction(reference) {
  if (!reference || typeof reference !== 'object') return null;

  if (reference.id && controllerScriptRegistry[reference.id]) {
    return controllerScriptRegistry[reference.id];
  }

  if (reference.exportName && controllerScriptExportRegistry[reference.exportName]) {
    return controllerScriptExportRegistry[reference.exportName];
  }

  return null;
}

function resolveControllerScript(profile) {
  const hooks = profile && profile.runtime && profile.runtime.hooks || {};
  return {
    init: resolveScriptFunction(hooks.init),
    input: resolveScriptFunction(hooks.input),
    output: resolveScriptFunction(hooks.output),
    shutdown: resolveScriptFunction(hooks.shutdown),
    keepalive: resolveScriptFunction(hooks.keepalive),
    learn: resolveScriptFunction(hooks.learn),
  };
}

function createStateForProfile(profile, overrides = {}) {
  const profileId = profile && profile.id || overrides.profileId || null;
  const factory = profileId && controllerStateFactoryRegistry[profileId];

  if (typeof factory === 'function') {
    return factory({
      profileId,
      ...overrides,
    });
  }

  return createControllerState({
    profileId,
    defaultDeckLayer: profile && profile.defaults && profile.defaults.defaultDeckLayer,
    defaultPadMode: profile && profile.defaults && profile.defaults.defaultPadMode,
    ...overrides,
  });
}

/**
 * Creates the small shared context object passed into controller hooks.
 *
 * @param {Object=} options
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} options.profile
 * @param {import('../adapters/boundary.js').AdapterDeviceInfo=} options.device
 * @param {import('./state.js').ControllerState=} options.state
 * @param {string=} options.adapterId
 * @param {'host'|'viewer'|'unknown'} options.role
 * @param {string=} options.room
 * @param {() => number=} options.now
 * @returns {ControllerScriptContext}
 */
export function createControllerContext(options = {}) {
  const profile = options.profile || null;
  const state = options.state && typeof options.state === 'object'
    ? options.state
    : createStateForProfile(profile);
  const now = typeof options.now === 'function' ? options.now : Date.now;

  return Object.freeze({
    profileId: profile && profile.id || state.profileId || null,
    profile,
    device: options.device || null,
    transport: options.transport || options.device && options.device.transport || null,
    adapterId: options.adapterId || null,
    role: options.role || 'unknown',
    room: options.room || null,
    state,
    getState() {
      return state;
    },
    snapshotState() {
      return snapshotControllerState(state);
    },
    now,
  });
}

/**
 * Creates a small app-owned hook runner around one controller profile.
 *
 * @param {Object=} options
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} options.profile
 * @param {import('../adapters/boundary.js').AdapterDeviceInfo=} options.device
 * @param {import('./state.js').ControllerState=} options.state
 * @param {string=} options.adapterId
 * @param {'host'|'viewer'|'unknown'} options.role
 * @param {string=} options.room
 * @param {() => number=} options.now
 * @returns {ControllerScriptRuntime}
 */
export function createControllerScriptRuntime(options = {}) {
  const profile = options.profile || null;
  const profileId = profile && profile.id || null;
  const state = options.state && typeof options.state === 'object'
    ? options.state
    : createStateForProfile(profile);
  const controllerCtx = createControllerContext({
    ...options,
    profile,
    state,
  });
  const script = resolveControllerScript(profile);
  let started = false;

  return {
    profile,
    context: controllerCtx,
    state,
    init() {
      if (!script.init) {
        return normalizeHookResult(null, {
          phase: 'init',
          profileId,
          state,
          reason: 'hook-not-configured',
        });
      }

      const result = script.init(controllerCtx);
      started = true;
      return normalizeHookResult(result, {
        phase: 'init',
        profileId,
        state,
        defaultOk: true,
        defaultExecuted: true,
      });
    },
    handleInput(raw, normalized) {
      const events = Array.isArray(normalized)
        ? normalized
        : normalized ? [normalized] : [];

      if (!script.input) {
        return normalizeHookResult(null, {
          phase: 'input',
          profileId,
          state,
          handled: events.length,
          reason: 'hook-not-configured',
        });
      }

      const result = script.input(raw || null, events, state, controllerCtx);
      return normalizeHookResult(result, {
        phase: 'input',
        profileId,
        state,
        handled: events.length,
        defaultOk: events.length > 0,
        defaultExecuted: events.length > 0,
      });
    },
    handleOutput(appState) {
      if (!script.output) {
        return normalizeHookResult(null, {
          phase: 'output',
          profileId,
          state,
          reason: 'hook-not-configured',
        });
      }

      const result = script.output(appState, state, controllerCtx);
      return normalizeHookResult(result, {
        phase: 'output',
        profileId,
        state,
        defaultOk: true,
      });
    },
    shutdown() {
      if (!script.shutdown) {
        return normalizeHookResult(null, {
          phase: 'shutdown',
          profileId,
          state,
          reason: started ? 'hook-not-configured' : 'not-started',
        });
      }

      const result = script.shutdown(controllerCtx, state);
      started = false;
      return normalizeHookResult(result, {
        phase: 'shutdown',
        profileId,
        state,
        defaultOk: true,
        defaultExecuted: true,
      });
    },
    getState() {
      return state;
    },
    snapshotState() {
      return snapshotControllerState(state);
    },
  };
}

