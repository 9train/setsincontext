// /src/midi.js
// Robust WebMIDI reader with safe globals + clear status updates.
// Works in ESM or plain script. No optional chaining, no default params syntax.
// SOP: OG preserved; added FEEL integration + snippet-based handleCC routing.
// Canonical/default MIDI path for the official host runtime:
//   host.html -> bootMIDIFromQuery() -> initWebMIDI() -> browser WebMIDI

// Requires:
//   /src/midi-feel.js            → export function buildFeelRuntime(config)
//   /src/engine/feel-loader.js   → export async function loadFeelConfig({ deviceName, url })
//   /maps/flx6-feel.json         → feel config (served by your dev server)

import { buildFeelRuntime } from './midi-feel.js';
import { loadFeelConfig }   from './engine/feel-loader.js';
import { createWebMidiAdapter } from './controllers/adapters/web-midi.js';
import { getDefaultControllerProfile } from './controllers/profiles/index.js';

// ---------- FEEL globals ----------
// FEEL boundary in the canonical host runtime:
// - bootMIDIFromQuery() loads device feel config by default
// - the host exposes window.__MIDI_FEEL__ for inspection/debugging
// - the only in-file FEEL apply path is the optional xfader dispatcher bridge below
// - live FEEL editing hooks live outside the supported host path unless explicitly enabled
var FEEL = null;
var FEEL_CFG = {
  device: 'UNKNOWN',
  deviceName: 'UNKNOWN',
  global: {},
  controls: {},
  enabled: false
};

var DEFAULT_HOST_PROFILE = getDefaultControllerProfile();
var DEFAULT_HOST_INPUT = DEFAULT_HOST_PROFILE
  && DEFAULT_HOST_PROFILE.defaults
  && DEFAULT_HOST_PROFILE.defaults.preferredInputName
  || DEFAULT_HOST_PROFILE && DEFAULT_HOST_PROFILE.displayName
  || 'DDJ-FLX6';

function makeDisabledFeelConfig(deviceName, reason) {
  var name = deviceName || 'UNKNOWN';
  return {
    device: name,
    deviceName: name,
    global: {},
    controls: {},
    enabled: false,
    disabledReason: reason || 'feel-disabled'
  };
}

function publishFeelState(reason, error) {
  try {
    if (typeof window !== 'undefined') {
      window.__MIDI_FEEL__ = {
        FEEL: FEEL,
        FEEL_CFG: FEEL_CFG,
        enabled: !!FEEL,
        reason: reason || null,
        error: error ? String((error && error.message) || error) : null
      };
    }
  } catch (e) {}
}

async function initFeelRuntime(deviceName) {
  var cfg = null;

  try {
    cfg = await loadFeelConfig({ deviceName: deviceName });
  } catch (eLoad) {
    FEEL = null;
    FEEL_CFG = makeDisabledFeelConfig(deviceName, 'config-load-failed');
    try { console.warn('[MIDI] FEEL disabled; config load failed for', deviceName, eLoad); } catch(_){}
    publishFeelState('config-load-failed', eLoad);
    return;
  }

  try {
    FEEL_CFG = (cfg && typeof cfg === 'object')
      ? { ...cfg, enabled: true }
      : {
          ...makeDisabledFeelConfig(deviceName, 'invalid-config'),
          enabled: true
        };
    FEEL = buildFeelRuntime(FEEL_CFG);
    publishFeelState(null, null);
  } catch (eBuild) {
    FEEL = null;
    FEEL_CFG = makeDisabledFeelConfig(deviceName, 'runtime-init-failed');
    try { console.warn('[MIDI] FEEL disabled; runtime init failed for', deviceName, eBuild); } catch(_){}
    publishFeelState('runtime-init-failed', eBuild);
  }
}

// Allow external access for console tuning:
try {
  if (typeof window !== 'undefined') {
    publishFeelState('not-initialized', null);
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

  function log(){ if (logEnabled) { try { console.log.apply(console, arguments); } catch(e){} } }
  var adapter = createWebMidiAdapter({
    preferredInput: preferredInput,
    preferredOutput: preferredOutput,
    onStatus: onStatus,
    log: logEnabled
  });

  var unsubscribeInput = adapter.onInput(function (envelope) {
    var events = envelope && envelope.normalized || [];
    if (!events.length) return;

    for (var i = 0; i < events.length; i++) {
      var info = events[i];

      // ===== FEEL-AWARE ROUTING via your snippet (non-breaking) =====
      try { if (info.type === 'cc') handleCC(info); } catch (eFeel) { try { console.warn('[MIDI/feel] routing error', eFeel); } catch(_){} }

      // 1) your app callback
      try { onInfo(info); } catch(e){}
      // 2) optional console hooks; never throw
      try { if (typeof window !== 'undefined' && window.FLX_LEARN_HOOK)   window.FLX_LEARN_HOOK(info); } catch(e){}
      try { if (typeof window !== 'undefined' && window.FLX_MONITOR_HOOK) window.FLX_MONITOR_HOOK(info); } catch(e){}
    }
  });

  try {
    await adapter.connect();
  } catch (e) {
    try { console.warn('[WebMIDI] Adapter connect failed.', e); } catch(err){}
  }

  exposeGlobals(adapter);
  return makeHandle(adapter, unsubscribeInput);
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

  // Load FEEL config first, but never let FEEL failures stop canonical MIDI boot.
  await initFeelRuntime(preferred);

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

// ===================== SNIPPET ADDITIONS (Feel routing helpers) =====================

// CC map (extend as needed)
var CC = { XFADER: 0x10 };

// Safe getters + simple absolute processor fallback
function feelCfg(id){
  try {
    if (FEEL_CFG && FEEL_CFG.controls && FEEL_CFG.controls[id]) return FEEL_CFG.controls[id];
  } catch(e){}
  return {};
}

function feelAbs(id, raw, cfg){
  try {
    if (FEEL && FEEL.processAbsolute) return FEEL.processAbsolute(id, raw, cfg || {});
  } catch(e){}
  var v = (raw || 0) / 127;
  if (v < 0) v = 0; else if (v > 1) v = 1;
  return { apply: true, value: v };
}

// Centralized CC handler using FEEL (extend with more controls later)
function handleCC(info) {
  // Crossfader (absolute) now prefers the canonical target from the controller
  // layer, with the older raw CC number kept only as a transition fallback for
  // non-profile callers.
  var isCanonicalCrossfader = info && info.canonicalTarget === 'mixer.crossfader';
  var isLegacyCrossfaderCC = info && info.controller === CC.XFADER;
  var isPrimaryLane = !info || !info.mappingId || !/\.secondary$/i.test(String(info.mappingId));

  if ((isCanonicalCrossfader || isLegacyCrossfaderCC) && isPrimaryLane) {
    var cfg = feelCfg('xfader');
    var out = feelAbs('xfader', info.value, cfg);
    if (out && out.apply) {
      // Canonical host note:
      // This bridge only has an effect when an experimental/global dispatcher exists.
      // The official host/viewer runtime does not install that dispatcher today.
      try {
        if (typeof dispatcher !== 'undefined' && dispatcher && dispatcher.emit) {
          dispatcher.emit('xfader:set', out.value);
        }
      } catch(e){}
    }
    return;
  }

  // Add more here, e.g. filter/jog:
  // if (info.controller === 0x11) { /* processRelative('filter', delta, cfg) */ }
  // if (info.controller === 0x21) { /* processJog(delta, cfg) */ }
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

function makeHandle(adapter, unsubscribeInput) {
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
    chooseInput: function(name){
      try { return adapter && adapter.chooseInput ? adapter.chooseInput(name || '') : false; } catch(e){ return false; }
    },
    chooseOutput: function(name){
      try { return adapter && adapter.chooseOutput ? adapter.chooseOutput(name || '') : false; } catch(e){ return false; }
    },
    stop: function(){
      try { if (typeof unsubscribeInput === 'function') unsubscribeInput(); } catch(e){}
      try { if (adapter && adapter.disconnect) adapter.disconnect('stopped'); } catch(e){}
    }
  };
}
