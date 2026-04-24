import { createAdapterInputHub } from './boundary.js';
import { createControllerScriptRuntime } from '../core/hooks.js';
import { createControllerFeelRuntime } from '../core/feel.js';
import { createRawInputEvent, normalizeRawInputEvent } from '../core/normalization.js';
import { matchControllerProfile } from '../profiles/index.js';

export const WEB_MIDI_ADAPTER_ID = 'generic-web-midi';

/**
 * Concrete WebMIDI adapter shape used by the current host runtime.
 * This extends the shared device-adapter contract with a few WebMIDI-specific
 * helpers that the official host boot path and compatibility tools still need.
 *
 * @typedef {import('./boundary.js').DeviceAdapter & {
 *   listInputs: () => string[],
 *   listOutputs: () => string[],
 *   chooseInput: (name: string) => boolean,
 *   chooseOutput: (name: string) => boolean,
 *   getAccess: () => MIDIAccess|null,
 *   getSelectedInput: () => MIDIInput|null,
 *   getSelectedOutput: () => MIDIOutput|null,
 *   getControllerState: () => import('../core/state.js').ControllerState|null,
 *   getFeelState: () => object|null,
 *   onFeelStateChange: (callback: (state: object) => void) => () => void,
 * }} WebMidiAdapter
 */

/**
 * @typedef {Object} WebMidiAdapterOptions
 * @property {string=} id
 * @property {string=} preferredInput
 * @property {string=} preferredOutput
 * @property {boolean=} log
 * @property {(status: string) => void=} onStatus
 * @property {() => number=} now
 * @property {(deviceName?: string, transport?: 'midi', meta?: object) => import('../profiles/definition.js').ControllerProfileDefinition|null=} resolveProfile
 * @property {(options?: MIDIAccessOptions) => Promise<MIDIAccess>=} requestMIDIAccess
 * @property {(options?: { deviceName?: string, fallbackUrl?: string }) => Promise<object>=} loadFeelConfig
 */

function toArray(iter) {
  if (!iter) return [];
  try { return Array.from(iter); } catch (e) {}
  const out = [];
  try {
    for (let item = iter.next(); !item.done; item = iter.next()) out.push(item.value);
  } catch (e) {}
  return out;
}

function norm(value) {
  let text = String(value || '');
  try { text = text.normalize('NFKC'); } catch (e) {}
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212-]/g, '-');
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return text;
}

function pickPort(ports, wanted) {
  if (!ports || !ports.length) return null;
  if (wanted) {
    const exact = ports.find((port) => port && port.name === wanted);
    if (exact) return exact;
    const wantedNorm = norm(wanted);
    const fuzzy = ports.find((port) => {
      const portNorm = norm(port && port.name);
      return portNorm === wantedNorm
        || portNorm.indexOf(wantedNorm) >= 0
        || wantedNorm.indexOf(portNorm) >= 0;
    });
    if (fuzzy) return fuzzy;
  }
  return (
    ports.find((port) => /IAC/i.test(port && port.name) && /(Bridge|Bus)/i.test(port && port.name)) ||
    ports.find((port) => /(Pioneer|DDJ|FLX)/i.test(port && port.name)) ||
    ports[0] ||
    null
  );
}

function pickOutput(outputs, wanted, inputName) {
  return pickPort(outputs, wanted || inputName || '');
}

function getPortSourceId(port) {
  if (!port || typeof port !== 'object') return 'web-midi';
  return String(port.id || port.name || 'web-midi');
}

function resolveDefaultProfile(deviceName, transport, meta) {
  return matchControllerProfile(deviceName, transport, meta);
}

function decodeMIDIParts(data) {
  if (!data || data.length < 2) return null;
  const status = data[0];
  const data1 = data[1] || 0;
  const data2 = data[2] || 0;
  const typeNibble = status & 0xF0;
  const channel = (status & 0x0F) + 1;

  if (typeNibble === 0x90) {
    if (data2 === 0) {
      return {
        interaction: 'noteoff',
        channel,
        code: data1,
        value: 0,
        data1,
        data2: 0,
        key: `noteoff:${channel}:${data1}`,
      };
    }
    return {
      interaction: 'noteon',
      channel,
      code: data1,
      value: data2,
      data1,
      data2,
      key: `noteon:${channel}:${data1}`,
    };
  }

  if (typeNibble === 0x80) {
    return {
      interaction: 'noteoff',
      channel,
      code: data1,
      value: 0,
      data1,
      data2,
      key: `noteoff:${channel}:${data1}`,
    };
  }

  if (typeNibble === 0xB0) {
    return {
      interaction: 'cc',
      channel,
      code: data1,
      value: data2,
      data1,
      data2,
      key: `cc:${channel}:${data1}`,
    };
  }

  if (typeNibble === 0xE0) {
    return {
      interaction: 'pitch',
      channel,
      code: 0,
      value: ((data2 << 7) | data1) - 8192,
      data1,
      data2,
      key: `pitch:${channel}:0`,
    };
  }

  return null;
}

function decodeRawMIDIEvent(data, meta) {
  const parts = decodeMIDIParts(data);
  if (!parts) return null;
  return createRawInputEvent({
    transport: 'midi',
    profileId: meta && meta.profileId,
    sourceId: meta && meta.sourceId,
    deviceName: meta && meta.deviceName,
    interaction: parts.interaction,
    channel: parts.channel,
    code: parts.code,
    value: parts.value,
    data1: parts.data1,
    data2: parts.data2,
    key: parts.key,
    timestamp: meta && meta.timestamp,
    bytes: Array.isArray(data) ? data : Array.from(data || []),
  });
}

function coerceMidiByte(value) {
  let numeric = typeof value === 'boolean' ? (value ? 127 : 0) : Number(value);
  if (!Number.isFinite(numeric)) numeric = 0;
  numeric = Math.round(numeric);
  if (numeric < 0) numeric = 0;
  if (numeric > 127) numeric = 127;
  return numeric;
}

function parseTargetKey(key) {
  const match = /^([a-z]+):(\d+):(\d+)$/i.exec(String(key || ''));
  if (!match) return null;
  return {
    interaction: String(match[1] || '').toLowerCase(),
    channel: Number(match[2] || 0),
    code: Number(match[3] || 0),
  };
}

function feedbackMessageToMidiBytes(message) {
  const target = message && message.target;
  if (!target || typeof target !== 'object') return null;

  const parsed = parseTargetKey(target.key);
  const interaction = parsed && parsed.interaction
    ? parsed.interaction
    : 'cc';
  const channel = parsed && parsed.channel
    ? parsed.channel
    : Number(target.channel || 0);
  const code = parsed && parsed.code >= 0
    ? parsed.code
    : Number(target.code || 0);

  if (!(channel >= 1 && channel <= 16) || !(code >= 0 && code <= 127)) {
    return null;
  }

  const value = coerceMidiByte(message && message.value);
  const statusBase = interaction === 'noteoff'
    ? 0x80
    : interaction === 'noteon'
      ? 0x90
      : 0xB0;

  return [statusBase | ((channel - 1) & 0x0F), code & 0x7F, value];
}

function freezeDeviceInfo(input, output, profile) {
  if (!input && !output && !profile) return null;
  return Object.freeze({
    id: String(
      (input && input.id) ||
      (output && output.id) ||
      (profile && profile.id) ||
      WEB_MIDI_ADAPTER_ID
    ),
    transport: 'midi',
    name: (input && input.name) || (output && output.name) || (profile && profile.displayName) || 'Web MIDI',
    manufacturer: (input && input.manufacturer) || (output && output.manufacturer) || (profile && profile.manufacturer),
    model: (profile && profile.model) || (input && input.name) || (output && output.name),
    inputName: input && input.name || undefined,
    outputName: output && output.name || undefined,
    profileId: profile && profile.id || undefined,
  });
}

/**
 * Creates a concrete browser WebMIDI adapter that reuses the controller-layer
 * raw -> normalized pipeline and current FLX6 profile matching.
 *
 * @param {WebMidiAdapterOptions=} options
 * @returns {WebMidiAdapter}
 */
export function createWebMidiAdapter(options) {
  const opts = options || {};
  const inputHub = createAdapterInputHub();
  const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function noop() {};
  const resolveProfile = typeof opts.resolveProfile === 'function'
    ? opts.resolveProfile
    : resolveDefaultProfile;
  const requestMIDIAccess = typeof opts.requestMIDIAccess === 'function'
    ? opts.requestMIDIAccess
    : typeof navigator !== 'undefined' && navigator && typeof navigator.requestMIDIAccess === 'function'
      ? navigator.requestMIDIAccess.bind(navigator)
      : null;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const logEnabled = !!opts.log;

  function log() {
    if (!logEnabled) return;
    try { console.log.apply(console, arguments); } catch (e) {}
  }

  let access = null;
  let input = null;
  let output = null;
  let profile = null;
  let deviceInfo = null;
  let stateHandler = null;
  let messageHandler = null;
  let scriptRuntime = null;
  let scriptRuntimeKey = '';
  const feelRuntime = createControllerFeelRuntime({
    loadFeelConfig: opts.loadFeelConfig,
  });

  function listInputPorts() {
    return toArray(access && access.inputs && access.inputs.values && access.inputs.values());
  }

  function listOutputPorts() {
    return toArray(access && access.outputs && access.outputs.values && access.outputs.values());
  }

  function refreshDeviceInfo() {
    profile = resolveProfile(
      input && input.name || output && output.name,
      'midi',
      { access, input, output },
    ) || null;
    deviceInfo = freezeDeviceInfo(input, output, profile);
    return deviceInfo;
  }

  function getScriptRuntimeKey(currentProfile) {
    if (!currentProfile) return '';
    const info = deviceInfo || {};
    return [
      currentProfile.id || '',
      info.id || '',
      info.inputName || '',
      info.outputName || '',
    ].join('::');
  }

  function shutdownScriptRuntime() {
    if (!scriptRuntime) {
      scriptRuntimeKey = '';
      return null;
    }

    let result = null;
    try {
      result = scriptRuntime.shutdown();
    } catch (error) {
      log('[WebMIDI] script shutdown failed', error);
    }

    scriptRuntime = null;
    scriptRuntimeKey = '';
    return result;
  }

  function syncScriptRuntime(currentProfile) {
    if (!currentProfile) {
      shutdownScriptRuntime();
      return null;
    }

    const nextKey = getScriptRuntimeKey(currentProfile);
    if (scriptRuntime && nextKey && nextKey === scriptRuntimeKey) {
      return scriptRuntime;
    }

    shutdownScriptRuntime();
    scriptRuntime = createControllerScriptRuntime({
      profile: currentProfile,
      device: deviceInfo,
      adapterId: String(opts.id || WEB_MIDI_ADAPTER_ID),
      transport: 'midi',
      role: 'host',
      now,
    });
    scriptRuntimeKey = nextKey;

    try {
      scriptRuntime.init();
    } catch (error) {
      log('[WebMIDI] script init failed', error);
    }

    return scriptRuntime;
  }

  async function syncFeelProfile(currentProfile) {
    try {
      return await feelRuntime.syncProfile(currentProfile, input && input.name || output && output.name || '');
    } catch (error) {
      log('[WebMIDI] FEEL sync failed', error);
      return feelRuntime.getState();
    }
  }

  function attachInput(nextInput) {
    try {
      if (input && input.onmidimessage === messageHandler) input.onmidimessage = null;
    } catch (e) {}

    input = nextInput || null;

    try {
      if (input && messageHandler) input.onmidimessage = messageHandler;
    } catch (e) {}

    refreshDeviceInfo();
  }

  function attachOutput(nextOutput) {
    output = nextOutput || null;
    refreshDeviceInfo();
  }

  function chooseInput(name) {
    const next = pickPort(listInputPorts(), name || '');
    if (!next) {
      try { console.warn('[WebMIDI] No such input:', name); } catch (e) {}
      return false;
    }
    attachInput(next);
    if (!output) attachOutput(pickOutput(listOutputPorts(), opts.preferredOutput, next && next.name));
    syncFeelProfile(profile);
    syncScriptRuntime(profile);
    onStatus(`listening:${next.name}`);
    log('[WebMIDI] Switched to:', next.name);
    return true;
  }

  function chooseOutput(name) {
    const next = pickOutput(listOutputPorts(), name || '', input && input.name);
    if (!next) {
      try { console.warn('[WebMIDI] No such output:', name); } catch (e) {}
      return false;
    }
    attachOutput(next);
    syncFeelProfile(profile);
    syncScriptRuntime(profile);
    log('[WebMIDI] Output set to:', next.name);
    return true;
  }

  function handleMIDIMessage(event) {
    const currentInput = input;
    const currentProfile = profile || resolveProfile(currentInput && currentInput.name, 'midi', {
      access,
      input: currentInput,
      output,
    }) || null;
    const rawEvent = decodeRawMIDIEvent(event && event.data, {
      deviceName: currentInput && currentInput.name,
      sourceId: getPortSourceId(currentInput),
      profileId: currentProfile && currentProfile.id,
      timestamp: Number(now()) || Date.now(),
    });
    if (!rawEvent) return;

    const currentScript = syncScriptRuntime(currentProfile);
    const previousState = currentScript && currentScript.snapshotState
      ? currentScript.snapshotState()
      : null;
    const result = normalizeRawInputEvent(rawEvent, {
      profile: currentProfile,
      profileId: currentProfile && currentProfile.id,
      sourceId: rawEvent.sourceId,
      timestamp: rawEvent.timestamp,
      feelRuntime,
      controllerState: currentScript && currentScript.getState
        ? currentScript.getState()
        : null,
    });

    let inputResult = null;
    try {
      if (currentScript) inputResult = currentScript.handleInput(rawEvent, result && result.events || []);
    } catch (error) {
      log('[WebMIDI] script input failed', error);
    }

    const emittedEvents = Array.isArray(inputResult && inputResult.events) && inputResult.events.length
      ? inputResult.events
      : result && result.events || [];

    try {
      feelRuntime.dispatchControllerState({
        previousState,
        nextState: currentScript && currentScript.snapshotState
          ? currentScript.snapshotState()
          : null,
      });
    } catch (error) {
      log('[WebMIDI] FEEL dispatch failed', error);
    }

    inputHub.emit({
      raw: rawEvent,
      normalized: emittedEvents,
      device: deviceInfo,
      profile: currentProfile,
      controllerState: currentScript && currentScript.snapshotState
        ? currentScript.snapshotState()
        : null,
      timestamp: rawEvent.timestamp,
    });
  }

  function installStateHandler() {
    if (!access) return;
    if (stateHandler) return;
    stateHandler = function onStateChange(event) {
      try {
        const type = event && event.port && event.port.type;
        const name = event && event.port && event.port.name;
        const state = event && event.port && event.port.state;
        if (type && name && state) log('[WebMIDI] state:', `${type} "${name}" ${state}`);
      } catch (e) {}
    };

    try {
      if (typeof access.addEventListener === 'function') {
        access.addEventListener('statechange', stateHandler);
      } else if ('onstatechange' in access) {
        access.onstatechange = stateHandler;
      }
    } catch (e) {}
  }

  messageHandler = handleMIDIMessage;

  return {
    id: String(opts.id || WEB_MIDI_ADAPTER_ID),
    displayName: 'Web MIDI',
    transport: 'midi',
    async connect() {
      if (!requestMIDIAccess) {
        onStatus('unsupported');
        try { console.warn('[WebMIDI] Not supported in this environment.'); } catch (e) {}
        return null;
      }

      onStatus('requesting');

      try {
        access = await requestMIDIAccess({ sysex: false });
      } catch (error) {
        onStatus('denied');
        try { console.warn('[WebMIDI] Permission denied or request failed.'); } catch (e) {}
        return null;
      }

      onStatus('ready');
      installStateHandler();

      const inputs = listInputPorts();
      const outputs = listOutputPorts();

      if (!inputs.length) {
        attachInput(null);
        attachOutput(pickOutput(outputs, opts.preferredOutput, ''));
        await syncFeelProfile(profile);
        onStatus('no-inputs');
        try { console.warn('[WebMIDI] No MIDI inputs found.'); } catch (e) {}
        return deviceInfo;
      }

      const nextInput = pickPort(inputs, opts.preferredInput || '');
      if (!nextInput) {
        onStatus('no-inputs');
        try {
          console.warn('[WebMIDI] No matching input. Available:', inputs.map((port) => port && port.name));
        } catch (e) {}
        return deviceInfo;
      }

      attachInput(nextInput);
      attachOutput(pickOutput(outputs, opts.preferredOutput, nextInput && nextInput.name));
      await syncFeelProfile(profile);
      syncScriptRuntime(profile);
      onStatus(`listening:${nextInput.name}`);
      log('[WebMIDI] Listening on:', nextInput.name);
      return deviceInfo;
    },
    disconnect(reason) {
      try {
        if (input && input.onmidimessage === messageHandler) input.onmidimessage = null;
      } catch (e) {}

      try {
        if (access) {
          if (typeof access.removeEventListener === 'function' && stateHandler) {
            access.removeEventListener('statechange', stateHandler);
          } else if ('onstatechange' in access) {
            access.onstatechange = null;
          }
        }
      } catch (e) {}

      access = null;
      input = null;
      output = null;
      profile = null;
      deviceInfo = null;
      stateHandler = null;
      shutdownScriptRuntime();
      syncFeelProfile(null);

      onStatus(reason === 'stopped' ? 'stopped' : 'disconnected');
      log('[WebMIDI] Stopped');
    },
    onInput(callback) {
      return inputHub.subscribe(callback);
    },
    send(messages) {
      const queue = Array.isArray(messages) ? messages.slice() : [];
      const currentScript = syncScriptRuntime(profile);
      let pending = queue;

      try {
        const hookResult = currentScript
          ? currentScript.handleOutput({
            requestedMessages: queue.slice(),
            device: deviceInfo,
            profile,
            timestamp: Number(now()) || Date.now(),
          })
          : null;
        if (hookResult && Array.isArray(hookResult.messages) && hookResult.messages.length) {
          pending = pending.concat(hookResult.messages);
        }
      } catch (error) {
        log('[WebMIDI] script output failed', error);
      }

      if (!output || typeof output.send !== 'function' || !pending.length) return false;

      let sent = 0;
      pending.forEach((message) => {
        const bytes = feedbackMessageToMidiBytes(message);
        if (!bytes) return;
        try {
          output.send(bytes);
          sent += 1;
        } catch (e) {}
      });

      return sent > 0;
    },
    getDeviceInfo() {
      return deviceInfo;
    },
    listInputs() {
      return listInputPorts().map((port) => port && port.name).filter(Boolean);
    },
    listOutputs() {
      return listOutputPorts().map((port) => port && port.name).filter(Boolean);
    },
    chooseInput,
    chooseOutput,
    getAccess() {
      return access;
    },
    getSelectedInput() {
      return input;
    },
    getSelectedOutput() {
      return output;
    },
    getControllerState() {
      return scriptRuntime && scriptRuntime.snapshotState
        ? scriptRuntime.snapshotState()
        : null;
    },
    getFeelState() {
      return feelRuntime.getState();
    },
    onFeelStateChange(callback) {
      return feelRuntime.onChange(callback);
    },
  };
}

export default createWebMidiAdapter;
