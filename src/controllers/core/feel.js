import { loadFeelConfig as defaultLoadFeelConfig } from '../../engine/feel-loader.js';
import { buildFeelRuntime as defaultBuildFeelRuntime } from '../../midi-feel.js';
import {
  decodeRelative7,
  decodeSignedBit7,
  decodeTwosComplement7,
} from './delta-codecs.js';

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function normalizeCodec(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || 'relative7';
}

function normalizeSide(value) {
  const side = String(value || '').trim().toLowerCase();
  return side === 'left' || side === 'right' ? side : null;
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode || null;
}

function createDisabledFeelConfig({
  deviceName,
  profileId,
  configPath,
  reason,
} = {}) {
  const name = String(deviceName || 'UNKNOWN');
  return {
    device: name,
    deviceName: name,
    profileId: profileId || null,
    configPath: configPath || null,
    global: {},
    controls: {},
    enabled: false,
    disabledReason: reason || 'feel-disabled',
  };
}

function getStateReason(feelConfig, fallbackReason) {
  if (feelConfig && feelConfig.disabledReason) return String(feelConfig.disabledReason);
  return fallbackReason || null;
}

function cloneRegistry(registry) {
  const out = {};
  Object.entries(registry || {}).forEach(([instanceId, meta]) => {
    out[instanceId] = Object.freeze({
      ...meta,
      dispatcher: Object.freeze({ ...(meta && meta.dispatcher || {}) }),
    });
  });
  return Object.freeze(out);
}

function collectFeelRegistry(profile) {
  const mappings = Array.isArray(profile && profile.inputs && profile.inputs.mappings)
    ? profile.inputs.mappings
    : [];
  const out = {};

  mappings.forEach((binding) => {
    const feel = asObject(binding && binding.feel);
    if (!Object.keys(feel).length) return;

    const instanceId = String(
      feel.instanceId
      || binding && binding.canonical
      || binding && binding.id
      || ''
    );
    if (!instanceId) return;

    const existing = out[instanceId] || {};
    out[instanceId] = {
      instanceId,
      configKey: String(
        feel.configKey
        || feel.controlId
        || existing.configKey
        || instanceId
      ),
      mode: normalizeMode(feel.mode || existing.mode),
      side: normalizeSide(feel.side || existing.side),
      dispatcher: {
        ...(existing.dispatcher || {}),
        ...(asObject(feel.dispatcher)),
      },
    };
  });

  return cloneRegistry(out);
}

export function decodeFeelDelta(value, codec = 'relative7') {
  const mode = normalizeCodec(codec);
  if (mode === 'twos-complement-7' || mode === 'twoscomplement7') {
    return decodeTwosComplement7(value);
  }
  if (mode === 'signed-bit-7' || mode === 'signedbit7') {
    return decodeSignedBit7(value);
  }
  return decodeRelative7(value);
}

function getShiftScale(controllerState, side, ctrlCfg) {
  if (!side || !controllerState || !controllerState.shift || !controllerState.shift[side]) return null;
  const shiftScale = Number(ctrlCfg && ctrlCfg.shiftScale);
  return Number.isFinite(shiftScale) && shiftScale > 0 ? shiftScale : null;
}

function getWheelResolution(meta, ctrlCfg, feelConfig) {
  const metaResolution = Number(meta && meta.wheelResolution);
  if (Number.isFinite(metaResolution) && metaResolution > 0) return metaResolution;

  const ctrlResolution = Number(ctrlCfg && ctrlCfg.wheelResolution);
  if (Number.isFinite(ctrlResolution) && ctrlResolution > 0) return ctrlResolution;

  const globalResolution = Number(
    feelConfig
    && feelConfig.global
    && feelConfig.global.jog
    && feelConfig.global.jog.wheelResolution
  );
  return Number.isFinite(globalResolution) && globalResolution > 0
    ? globalResolution
    : null;
}

function getFeelControlConfig(feelConfig, configKey) {
  if (!feelConfig || !feelConfig.controls || !configKey) return null;
  const control = feelConfig.controls[configKey];
  return control && typeof control === 'object' ? control : null;
}

function getBindingFeelMeta(binding) {
  const feel = asObject(binding && binding.feel);
  if (!Object.keys(feel).length) return null;
  return {
    instanceId: String(
      feel.instanceId
      || binding && binding.canonical
      || binding && binding.id
      || ''
    ),
    configKey: String(
      feel.configKey
      || feel.controlId
      || feel.instanceId
      || binding && binding.canonical
      || binding && binding.id
      || ''
    ),
    mode: normalizeMode(feel.mode),
    side: normalizeSide(feel.side),
    deltaCodec: normalizeCodec(feel.deltaCodec || feel.codec),
    wheelResolution: feel.wheelResolution,
  };
}

function statesDiffer(previousValue, nextValue) {
  return previousValue !== nextValue;
}

export function createControllerFeelRuntime(options = {}) {
  const loadFeelConfig = typeof options.loadFeelConfig === 'function'
    ? options.loadFeelConfig
    : defaultLoadFeelConfig;
  const buildFeelRuntime = typeof options.buildFeelRuntime === 'function'
    ? options.buildFeelRuntime
    : defaultBuildFeelRuntime;
  const listeners = new Set();

  let feelRuntime = null;
  let feelConfig = createDisabledFeelConfig({ reason: 'not-initialized' });
  let registry = cloneRegistry({});
  let syncKey = '';

  function buildSnapshot(reason, error) {
    return Object.freeze({
      FEEL: feelRuntime,
      FEEL_CFG: feelConfig,
      enabled: !!feelRuntime,
      profileId: feelConfig && feelConfig.profileId || null,
      deviceName: feelConfig && feelConfig.deviceName || null,
      reason: reason != null ? reason : getStateReason(feelConfig, null),
      error: error ? String((error && error.message) || error) : null,
      registry,
    });
  }

  function publish(reason, error) {
    const snapshot = buildSnapshot(reason, error);

    listeners.forEach((listener) => {
      try { listener(snapshot); } catch (e) {}
    });

    return snapshot;
  }

  async function syncProfile(profile, deviceName) {
    const profileId = profile && profile.id || null;
    const configPath = profile && profile.assets && profile.assets.feelConfigPath || null;
    const nextSyncKey = [
      profileId || '',
      String(deviceName || ''),
      String(configPath || ''),
    ].join('::');

    if (syncKey && nextSyncKey === syncKey) {
      return publish(null, null);
    }

    syncKey = nextSyncKey;
    registry = collectFeelRegistry(profile);

    if (!profile || !configPath) {
      feelRuntime = null;
      feelConfig = createDisabledFeelConfig({
        deviceName,
        profileId,
        configPath,
        reason: 'profile-has-no-feel-config',
      });
      return publish('profile-has-no-feel-config', null);
    }

    let loadedConfig = null;

    try {
      loadedConfig = await loadFeelConfig({
        deviceName,
        fallbackUrl: configPath,
      });
    } catch (error) {
      try {
        console.warn('[controller-feel] FEEL disabled; config load failed for', deviceName, error);
      } catch (e) {}
      feelRuntime = null;
      feelConfig = createDisabledFeelConfig({
        deviceName,
        profileId,
        configPath,
        reason: 'config-load-failed',
      });
      return publish('config-load-failed', error);
    }

    try {
      feelConfig = {
        ...createDisabledFeelConfig({
          deviceName,
          profileId,
          configPath,
          reason: 'invalid-config',
        }),
        ...(asObject(loadedConfig)),
        device: String(
          loadedConfig && loadedConfig.device
          || loadedConfig && loadedConfig.deviceName
          || deviceName
          || 'UNKNOWN'
        ),
        deviceName: String(
          loadedConfig && loadedConfig.deviceName
          || loadedConfig && loadedConfig.device
          || deviceName
          || 'UNKNOWN'
        ),
        profileId,
        configPath,
        enabled: true,
      };
      feelRuntime = buildFeelRuntime(feelConfig);
      return publish(null, null);
    } catch (error) {
      try {
        console.warn('[controller-feel] FEEL disabled; runtime init failed for', deviceName, error);
      } catch (e) {}
      feelRuntime = null;
      feelConfig = createDisabledFeelConfig({
        deviceName,
        profileId,
        configPath,
        reason: 'runtime-init-failed',
      });
      return publish('runtime-init-failed', error);
    }
  }

  function processBinding(rawEvent, binding, controllerState) {
    const meta = getBindingFeelMeta(binding);
    if (!feelRuntime || !meta || !meta.instanceId || !meta.configKey) return null;

    const ctrlCfg = getFeelControlConfig(feelConfig, meta.configKey);
    if (!ctrlCfg) return null;

    const mode = normalizeMode(meta.mode || ctrlCfg.type);
    if (!mode) return null;

    if (mode === 'absolute' && typeof feelRuntime.processAbsolute === 'function') {
      const result = feelRuntime.processAbsolute(
        meta.instanceId,
        Number(rawEvent && rawEvent.value || 0),
        ctrlCfg,
      );
      return Object.freeze({
        applied: true,
        accepted: !!(result && result.apply),
        blocked: !(result && result.apply),
        mode,
        instanceId: meta.instanceId,
        configKey: meta.configKey,
        value: result && result.value,
      });
    }

    if (mode === 'relative' && typeof feelRuntime.processRelative === 'function') {
      const delta = decodeFeelDelta(rawEvent && rawEvent.value, meta.deltaCodec || ctrlCfg.deltaCodec || ctrlCfg.codec);
      const result = feelRuntime.processRelative(meta.instanceId, delta, ctrlCfg);
      return Object.freeze({
        applied: true,
        accepted: true,
        blocked: false,
        mode,
        instanceId: meta.instanceId,
        configKey: meta.configKey,
        delta,
        value: result && result.value,
      });
    }

    if (mode === 'jog' && typeof feelRuntime.processJog === 'function') {
      let delta = decodeFeelDelta(rawEvent && rawEvent.value, meta.deltaCodec || ctrlCfg.deltaCodec || ctrlCfg.codec);
      const wheelResolution = getWheelResolution(meta, ctrlCfg, feelConfig);
      if (wheelResolution) delta /= wheelResolution;

      const runtimeCfg = { ...ctrlCfg };
      const shiftScale = getShiftScale(controllerState, meta.side, ctrlCfg);
      if (shiftScale) {
        const baseScale = Number(runtimeCfg.scaleOverride);
        runtimeCfg.scaleOverride = Number.isFinite(baseScale)
          ? baseScale * shiftScale
          : shiftScale;
      }

      const motion = feelRuntime.processJog(meta.instanceId, delta, runtimeCfg);
      return Object.freeze({
        applied: true,
        accepted: true,
        blocked: false,
        mode,
        instanceId: meta.instanceId,
        configKey: meta.configKey,
        delta,
        motion: motion ? Object.freeze({ ...motion }) : null,
      });
    }

    return null;
  }

  function dispatchControllerState(payload = {}) {
    if (!feelRuntime) return [];

    const previousState = payload.previousState || null;
    const nextState = payload.nextState || null;
    if (!previousState || !nextState) return [];

    const actions = [];
    Object.values(registry).forEach((meta) => {
      if (!meta || !meta.instanceId) return;
      const side = normalizeSide(meta.side);
      const dispatcher = asObject(meta.dispatcher);

      if (
        side
        && dispatcher.rearmOnDeckLayer
        && statesDiffer(
          previousState && previousState.deckLayer && previousState.deckLayer[side],
          nextState && nextState.deckLayer && nextState.deckLayer[side],
        )
      ) {
        if ((meta.mode === 'absolute' || meta.mode === 'relative') && typeof feelRuntime.resetSoft === 'function') {
          feelRuntime.resetSoft(meta.instanceId);
          actions.push({
            type: 'rearm-soft-takeover',
            reason: 'deck-layer-changed',
            side,
            instanceId: meta.instanceId,
          });
        }
        if (meta.mode === 'jog' && typeof feelRuntime.resetJog === 'function') {
          feelRuntime.resetJog(meta.instanceId);
          actions.push({
            type: 'reset-jog-motion',
            reason: 'deck-layer-changed',
            side,
            instanceId: meta.instanceId,
          });
        }
      }

      if (
        side
        && dispatcher.resetOnShiftChange
        && statesDiffer(
          !!(previousState && previousState.shift && previousState.shift[side]),
          !!(nextState && nextState.shift && nextState.shift[side]),
        )
        && typeof feelRuntime.resetJog === 'function'
      ) {
        feelRuntime.resetJog(meta.instanceId);
        actions.push({
          type: 'reset-jog-motion',
          reason: 'shift-state-changed',
          side,
          instanceId: meta.instanceId,
        });
      }
    });

    return actions;
  }

  return {
    syncProfile,
    processBinding,
    dispatchControllerState,
    getState() {
      return buildSnapshot(null, null);
    },
    onChange(listener) {
      if (typeof listener !== 'function') return function noop() {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export default createControllerFeelRuntime;
