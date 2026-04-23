// src/recorder.js
// Record / playback for the normalized events already flowing through
// window.consumeInfo. Recorder entries keep the replay payload for playback and
// a debugger-grade log snapshot for trustworthy history/export.

import {
  createRecordedEntry,
  createRecordingExportObject,
  normalizeLoadedRecordedEntry,
  RECORDER_LOG_SCHEMA,
} from './recorder/schema.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

function now() {
  // perf timer where available (stable relative clock)
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
}

function hashInfo(info) {
  // crude dedup hash to avoid double-capture if both WS and WebMIDI fire
  const t = (info.type || '').toLowerCase();
  const code = t === 'cc' ? (info.controller ?? info.d1) : info.d1;
  const v = t === 'cc' ? info.value : info.d2;
  return `${t}|${info.ch}|${code}|${v}`;
}

export function createRecorder() {
  let removeConsumeTap = null;
  const consumeTapKey = Symbol('recorder');

  const state = {
    isRecording: false,
    startedAt: 0,
    events: [],           // [{ timing, replayInfo, event }] + legacy aliases for existing runtime consumers
    dedupMs: 6,
    _recent: new Map(),   // key -> ts
    _playTimers: [],
    _onEvent: null,       // optional callback during playback
    speed: 1.0,
    loop: false,
  };

  function publishRecorderStatus(status = state.isRecording ? 'recording' : 'ready') {
    const runtimeApp = getRuntimeApp();
    if (!runtimeApp || typeof runtimeApp.setRecorderStatus !== 'function') return;
    runtimeApp.setRecorderStatus({
      available: true,
      installed: !!removeConsumeTap,
      state: status,
      eventCount: state.events.length,
      logSchema: RECORDER_LOG_SCHEMA,
    });
  }

  function record(info) {
    if (!state.isRecording) return;
    const ts = now();

    // Deduplicate very-near duplicates (e.g., WS + WebMIDI)
    const k = hashInfo(info);
    const last = state._recent.get(k) || -1e9;
    if (ts - last < state.dedupMs) return;
    state._recent.set(k, ts);

    const t = ts - state.startedAt;
    const entry = createRecordedEntry(info, {
      seq: state.events.length + 1,
      t,
      capturedAt: ts,
    });
    if (entry) state.events.push(entry);
  }

  function install() {
    if (removeConsumeTap) return;
    const runtimeApp = getRuntimeApp();
    if (!runtimeApp) return;
    removeConsumeTap = runtimeApp.addConsumeTap(consumeTapKey, (info) => {
      try { record(info); } catch {}
    }, { phase: 'after' });
    publishRecorderStatus();
    console.log('%c[Recorder] installed – events flowing through will be capturable.', 'color:#6ea8fe');
  }

  function uninstall() {
    if (!removeConsumeTap) return;
    removeConsumeTap();
    removeConsumeTap = null;
    getRuntimeApp()?.setRecorderStatus?.(null);
    console.log('%c[Recorder] uninstalled.', 'color:#6ea8fe');
  }

  // Legacy helpers kept for completeness (no-ops if already wrapped)
  function wrapConsume() { install(); }
  function unwrapConsume() { uninstall(); }

  function start({ dedupMs = 6 } = {}) {
    if (!removeConsumeTap) install();
    state.events.length = 0;
    state._recent.clear();
    state.dedupMs = dedupMs;
    state.startedAt = now();
    state.isRecording = true;
    publishRecorderStatus('recording');
    console.log('%c[Recorder] Recording…', 'color:#6ea8fe');
  }

  function stop() {
    state.isRecording = false;
    if (removeConsumeTap) publishRecorderStatus('ready');
    console.log('%c[Recorder] Stopped. Events:', 'color:#6ea8fe', state.events.length);
    return state.events.slice();
  }

  function clear() {
    state.events.length = 0;
    state._recent.clear();
    if (removeConsumeTap) publishRecorderStatus(state.isRecording ? 'recording' : 'ready');
    console.log('%c[Recorder] Cleared buffer.', 'color:#6ea8fe');
  }

  function exportJSON() {
    return JSON.stringify(
      createRecordingExportObject({
        speed: state.speed,
        events: state.events,
      }),
      null, 2
    );
  }

  async function download(filename = 'take.json') {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log('%c[Recorder] Downloaded', 'color:#6ea8fe', filename);
  }

  function loadFromObject(obj) {
    if (!obj || !Array.isArray(obj.events)) throw new Error('Bad recording object');
    state.events = obj.events
      .map((entry, index) => normalizeLoadedRecordedEntry(entry, index))
      .filter(Boolean);
    if (obj.speed != null) state.speed = +obj.speed || 1;
    if (removeConsumeTap) publishRecorderStatus(state.isRecording ? 'recording' : 'ready');
    console.log('%c[Recorder] Loaded events:', 'color:#6ea8fe', state.events.length);
  }

  async function loadFromText(text) {
    const obj = JSON.parse(text);
    loadFromObject(obj);
  }

  function stopPlayback() {
    state._playTimers.forEach(id => clearTimeout(id));
    state._playTimers.length = 0;
  }

  function play({ speed = 1.0, loop = false, onEvent = null } = {}) {
    const runtimeApp = getRuntimeApp();
    if (!runtimeApp) {
      console.warn('[Recorder] consumeInfo not ready – cannot play.');
      return;
    }
    stopPlayback();
    state.speed = speed;
    state.loop = loop;
    state._onEvent = onEvent || null;

    const total = state.events.length;
    if (!total) {
      console.warn('[Recorder] Nothing to play.');
      return;
    }

    const scale = 1 / Math.max(0.001, speed);

    state.events.forEach((entry, idx) => {
      const info = entry && (entry.replayInfo || entry.info);
      const t = entry && entry.timing && entry.timing.relativeMs != null
        ? entry.timing.relativeMs
        : entry && entry.t;
      if (!info) return;
      const delay = Math.max(0, t * scale);
      const tid = setTimeout(() => {
        try {
          if (state._onEvent) state._onEvent(info, idx, entry);
          runtimeApp.consumeInfo(info);
        } catch (e) {
          console.warn('[Recorder] playback error', e);
        }

        if (loop && idx === total - 1) {
          // schedule another play after the (scaled) full duration
          const lastEntry = state.events[total - 1];
          const totalDur = (
            lastEntry && lastEntry.timing && lastEntry.timing.relativeMs != null
              ? lastEntry.timing.relativeMs
              : lastEntry && lastEntry.t
          ) || 0;
          const tid2 = setTimeout(() => play({ speed, loop, onEvent }), totalDur + 1);
          state._playTimers.push(tid2);
        }
      }, delay);
      state._playTimers.push(tid);
    });

    console.log(`%c[Recorder] Playing ${total} events (speed ${speed}×, loop=${loop})`, 'color:#6ea8fe');
  }

  return {
    // lifecycle
    install, uninstall, wrapConsume, unwrapConsume,
    // record control
    start, stop, clear,
    // export/import
    exportJSON, download, loadFromObject, loadFromText,
    // playback
    play, stopPlayback,
    // state access
    get events() { return state.events.slice(); }
  };
}

// Default instance + global for console convenience
export const recorder = createRecorder();

if (typeof window !== 'undefined') {
  window.FLXRec = recorder;
}
