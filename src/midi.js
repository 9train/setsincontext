// /src/midi.js
// Robust WebMIDI reader with safe globals + clear status updates.
// Works in ESM or plain script. No optional chaining, no default params syntax.
// SOP: OG preserved; FEEL now lives in the controller-layer adapter/runtime.
// Canonical/default MIDI path for the official host runtime:
//   host.html -> bootMIDIFromQuery() -> initWebMIDI() -> browser WebMIDI

import { createWebMidiAdapter } from './controllers/adapters/web-midi.js';
import { getDefaultControllerProfile } from './controllers/profiles/index.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

var DEFAULT_HOST_PROFILE = getDefaultControllerProfile();
var DEFAULT_HOST_INPUT = DEFAULT_HOST_PROFILE
  && DEFAULT_HOST_PROFILE.defaults
  && DEFAULT_HOST_PROFILE.defaults.preferredInputName
  || DEFAULT_HOST_PROFILE && DEFAULT_HOST_PROFILE.displayName
  || 'DDJ-FLX6';

function publishFeelState(state) {
  try {
    if (typeof window !== 'undefined') {
      window.__MIDI_FEEL__ = state || {
        FEEL: null,
        FEEL_CFG: {
          device: 'UNKNOWN',
          deviceName: 'UNKNOWN',
          global: {},
          controls: {},
          enabled: false,
          disabledReason: 'not-initialized'
        },
        enabled: false,
        reason: 'not-initialized',
        error: null
      };
    }
  } catch (e) {}
}

// Allow external access for console tuning:
try {
  if (typeof window !== 'undefined') {
    publishFeelState(null);
  }
} catch (e) {}

// Define console helpers immediately; safe no-ops outside the browser.
try {
  if (typeof window !== 'undefined') {
    if (typeof window.WebMIDIListInputs !== 'function') {
      window.WebMIDIListInputs = function () { return []; };
    }
    if (typeof window.WebMIDIChooseInput !== 'function') {
      window.WebMIDIChooseInput = function () {
        console.warn('[WebMIDI] Not ready yet');
        return false;
      };
    }
  }
} catch (e) { /* ignore */ }

// ---- public API -----------------------------------------------------
export async function initWebMIDI(opts) {
  opts = opts || {};
  var onInfo         = (typeof opts.onInfo   === 'function') ? opts.onInfo   : function(){};
  var onStatus       = (typeof opts.onStatus === 'function') ? opts.onStatus : function(){};
  var preferredInput = (typeof opts.preferredInput === 'string' && opts.preferredInput)
    ? opts.preferredInput
    : DEFAULT_HOST_INPUT;
  var preferredOutput = (typeof opts.preferredOutput === 'string' && opts.preferredOutput)
    ? opts.preferredOutput
    : preferredInput;
  var logEnabled     = !!opts.log;
  var runtimeApp = getRuntimeApp();

  function log(){ if (logEnabled) { try { console.log.apply(console, arguments); } catch(e){} } }
  var adapter = createWebMidiAdapter({
    preferredInput: preferredInput,
    preferredOutput: preferredOutput,
    onStatus: onStatus,
    log: logEnabled
  });
  var unsubscribeFeelState = adapter && adapter.onFeelStateChange
    ? adapter.onFeelStateChange(function (state) {
        publishFeelState(state);
      })
    : function(){};

  var unsubscribeInput = adapter.onInput(function (envelope) {
    var events = envelope && envelope.normalized || [];
    if (!events.length) return;

    for (var i = 0; i < events.length; i++) {
      var normalized = events[i] || {};
      var info = Object.assign({}, normalized, {
        raw: envelope && envelope.raw || normalized.raw || null,
        controllerState: envelope && envelope.controllerState || null,
        device: envelope && envelope.device || null,
        profile: envelope && envelope.profile || null
      });

      // Optional compatibility bridge for older global dispatcher experiments.
      try { handleFeelBridge(info); } catch (eFeel) { try { console.warn('[MIDI/feel] bridge error', eFeel); } catch(_){} }

      // 1) your app callback
      try { onInfo(info); } catch(e){}
      // 2) bridge-owned learn/monitor notifications; globals remain as aliases
      try { runtimeApp && runtimeApp.emitLearnInput && runtimeApp.emitLearnInput(info); } catch(e){}
      try { runtimeApp && runtimeApp.emitMonitorInput && runtimeApp.emitMonitorInput(info); } catch(e){}
    }
  });

  try {
    await adapter.connect();
    try { publishFeelState(adapter.getFeelState ? adapter.getFeelState() : null); } catch(e){}
  } catch (e) {
    try { console.warn('[WebMIDI] Adapter connect failed.', e); } catch(err){}
  }

  exposeGlobals(adapter);
  return makeHandle(adapter, unsubscribeInput, unsubscribeFeelState);
}

// ---- SOP addition: snippet-compatible bootstrap (feels integrated) ----
// Usage: await bootMIDIFromQuery();  // picks ?midi= or defaults to DDJ-FLX6
export async function bootMIDIFromQuery(overrides) {
  overrides = overrides || {};
  if (typeof window === 'undefined') {
    return initWebMIDI({
      onInfo: function(){},
      onStatus: function(){},
      preferredInput: DEFAULT_HOST_INPUT,
      log: false
    });
  }

  var search = '';
  try { search = String(window.location && window.location.search || ''); } catch(e) { search = ''; }
  var qs = new URLSearchParams(search);
  var preferred = qs.get('midi') || window.__MIDI_DEVICE_NAME__ || DEFAULT_HOST_INPUT;

  var onInfo = (typeof overrides.onInfo === 'function')
    ? overrides.onInfo
    : (function(){
        try {
          if (typeof window.consumeInfo === 'function') return window.consumeInfo;
        } catch(e){}
        return function(){};
      })();

  var onStatus = (typeof overrides.onStatus === 'function')
    ? overrides.onStatus
    : (function(){
        try {
          if (typeof window.setMIDIStatus === 'function') return window.setMIDIStatus;
        } catch(e){}
        return function(){};
      })();

  var logFlag = false;
  try { logFlag = qs.has('logmidi'); } catch(e) { logFlag = false; }

  try { console.log('[MIDI] starting init with', preferred); } catch(e){}

  try {
    var handle = await initWebMIDI({
      onInfo: onInfo,
      onStatus: onStatus,
      preferredInput: preferred,
      log: logFlag
    });
    try { console.log('[MIDI] init OK'); } catch(e){}
    return handle;
  } catch (e2) {
    try { console.warn('[MIDI] init failed', e2); } catch(err){}
    try { onStatus('host: off'); } catch(err2){}
    return {
      get access(){ return null; },
      get input(){ return null; },
      listInputs: function(){ return []; },
      stop: function(){ try { onStatus('stopped'); } catch(e3){} }
    };
  }
}

// Also expose a global for non-module usage
try {
  if (typeof window !== 'undefined' && typeof window.FLXBootMIDI !== 'function') {
    window.FLXBootMIDI = function(overrides){ return bootMIDIFromQuery(overrides); };
  }
} catch(e){}

// ===================== FEEL compatibility bridge =====================

// CC map (extend as needed)
var CC = { XFADER: 0x10 };

function handleFeelBridge(info) {
  var feel = info && info.feel;
  if (!feel || feel.applied !== true || feel.accepted === false) return;

  var isCanonicalCrossfader = info && info.canonicalTarget === 'mixer.crossfader';
  var isLegacyCrossfaderCC = info && info.controller === CC.XFADER;
  var isPrimaryLane = !info || !info.mappingId || !/\.secondary$/i.test(String(info.mappingId));

  if ((isCanonicalCrossfader || isLegacyCrossfaderCC) && isPrimaryLane) {
    var semanticValue = feel.value != null ? feel.value : info && info.semanticValue;
    if (semanticValue == null) return;
    // Canonical host note:
    // This bridge only has an effect when an experimental/global dispatcher exists.
    // The official host/viewer runtime does not install that dispatcher today.
    try {
      if (typeof dispatcher !== 'undefined' && dispatcher && dispatcher.emit) {
        dispatcher.emit('xfader:set', semanticValue);
      }
    } catch(e){}
  }
}

// ===================== internals (unchanged OG) =====================

function exposeGlobals(adapter) {
  if (typeof window === 'undefined') return;
  try {
    window.WebMIDIListInputs = function(){
      try { return adapter && adapter.listInputs ? adapter.listInputs() : []; } catch(e){ return []; }
    };
    window.WebMIDIChooseInput = function(name){
      try {
        if (!adapter || !adapter.chooseInput) return false;
        return adapter.chooseInput(name || '');
      } catch(e){ return false; }
    };
  } catch(e) {}
}

function makeHandle(adapter, unsubscribeInput, unsubscribeFeelState) {
  return {
    get access(){ return adapter && adapter.getAccess ? adapter.getAccess() : null; },
    get input(){
      var device = adapter && adapter.getDeviceInfo ? adapter.getDeviceInfo() : null;
      return device && device.inputName ? device.inputName : null;
    },
    listInputs: function(){
      try { return adapter && adapter.listInputs ? adapter.listInputs() : []; } catch(e){ return []; }
    },
    listOutputs: function(){
      try { return adapter && adapter.listOutputs ? adapter.listOutputs() : []; } catch(e){ return []; }
    },
    getDeviceInfo: function(){
      try { return adapter && adapter.getDeviceInfo ? adapter.getDeviceInfo() : null; } catch(e){ return null; }
    },
    getFeelState: function(){
      try { return adapter && adapter.getFeelState ? adapter.getFeelState() : null; } catch(e){ return null; }
    },
    chooseInput: function(name){
      try { return adapter && adapter.chooseInput ? adapter.chooseInput(name || '') : false; } catch(e){ return false; }
    },
    chooseOutput: function(name){
      try { return adapter && adapter.chooseOutput ? adapter.chooseOutput(name || '') : false; } catch(e){ return false; }
    },
    stop: function(){
      try { if (typeof unsubscribeInput === 'function') unsubscribeInput(); } catch(e){}
      try { if (typeof unsubscribeFeelState === 'function') unsubscribeFeelState(); } catch(e){}
      try { if (adapter && adapter.disconnect) adapter.disconnect('stopped'); } catch(e){}
    }
  };
}
