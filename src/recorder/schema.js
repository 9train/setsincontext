import { buildDebuggerEventSnapshot } from '../event-log-snapshot.js';

export const RECORDER_LOG_VERSION = 3;
export const RECORDER_LOG_SCHEMA = 'flx-recorder-log/v3';
export const RECORDER_EVENT_SCHEMA = 'flx-recorded-event/v1';
export const RECORDER_REPLAY_SCHEMA = 'consume-info/v1';

export const RECORDER_CAPTURE_META = Object.freeze({
  source: 'runtime-app.consumeInfo',
  phase: 'after',
  boardState: 'post-consume',
  replaySchema: RECORDER_REPLAY_SCHEMA,
  eventSchema: RECORDER_EVENT_SCHEMA,
});

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function cloneRecordingValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneRecordingValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => typeof entry !== 'function')
        .map(([key, entry]) => [key, cloneRecordingValue(entry)]),
    );
  }
  return value;
}

function cloneStructuredValue(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {}
  }
  return cloneRecordingValue(value);
}

function cloneRecorderEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const hasSummary = typeof event.summary === 'string' || typeof event.recentSummary === 'string';
  const hasRawKey = typeof (event.raw && event.raw.key) === 'string';
  if (!hasSummary && !hasRawKey) return null;
  return cloneStructuredValue(event);
}

function sanitizeStoredEvent(event) {
  const storedEvent = cloneRecorderEvent(event);
  if (!storedEvent) return null;
  delete storedEvent.id;
  if (typeof storedEvent.schema !== 'string') {
    storedEvent.schema = RECORDER_EVENT_SCHEMA;
  }
  return Object.freeze(storedEvent);
}

function resolveReplayInfo(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.replay && typeof entry.replay === 'object' && entry.replay.info && typeof entry.replay.info === 'object') {
    return entry.replay.info;
  }
  if (entry.replayInfo && typeof entry.replayInfo === 'object') return entry.replayInfo;
  if (entry.info && typeof entry.info === 'object') return entry.info;
  return null;
}

function resolveStoredEvent(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.event && typeof entry.event === 'object') return entry.event;
  if (entry.logEvent && typeof entry.logEvent === 'object') return entry.logEvent;
  return null;
}

export function createRecordedTiming(options = {}) {
  const order = asNumber(options.seq, 0);
  const relativeMs = asNumber(options.t, 0);
  const capturedAtMs = asNumber(options.capturedAt, relativeMs);
  const sourceTimestampMs = options.sourceTimestamp == null
    ? null
    : asNumber(options.sourceTimestamp, null);

  return Object.freeze({
    order,
    relativeMs,
    capturedAtMs,
    sourceTimestampMs,
  });
}

export function buildStoredRecordedEvent(replayInfo, event = null) {
  const clonedReplayInfo = replayInfo && typeof replayInfo === 'object'
    ? cloneStructuredValue(replayInfo)
    : null;
  const reusableEvent = sanitizeStoredEvent(event);
  if (reusableEvent) return reusableEvent;
  if (!clonedReplayInfo) return null;
  return sanitizeStoredEvent(buildDebuggerEventSnapshot(clonedReplayInfo));
}

export function createRecordedEntry(replayInfo, options = {}) {
  const clonedReplayInfo = replayInfo && typeof replayInfo === 'object'
    ? cloneStructuredValue(replayInfo)
    : null;
  if (!clonedReplayInfo) return null;

  const sourceTimestamp = options.sourceTimestamp != null
    ? asNumber(options.sourceTimestamp, null)
    : clonedReplayInfo.timestamp != null
      ? asNumber(clonedReplayInfo.timestamp, null)
      : null;
  const timing = createRecordedTiming({
    seq: options.seq,
    t: options.t,
    capturedAt: options.capturedAt,
    sourceTimestamp,
  });
  const liveEvent = cloneRecorderEvent(options.logEvent);
  const storedEvent = buildStoredRecordedEvent(clonedReplayInfo, liveEvent);

  return {
    seq: timing.order,
    t: timing.relativeMs,
    capturedAt: timing.capturedAtMs,
    sourceTimestamp: timing.sourceTimestampMs,
    timing,
    info: clonedReplayInfo,
    replayInfo: clonedReplayInfo,
    logEvent: liveEvent || cloneStructuredValue(storedEvent),
    event: storedEvent,
  };
}

export function normalizeLoadedRecordedEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;

  const replayInfo = resolveReplayInfo(entry);
  if (!replayInfo) return null;

  const timing = entry.timing && typeof entry.timing === 'object' ? entry.timing : null;
  return createRecordedEntry(replayInfo, {
    seq: timing && timing.order != null ? timing.order : entry.seq != null ? entry.seq : index + 1,
    t: timing && timing.relativeMs != null ? timing.relativeMs : entry.t,
    capturedAt: timing && timing.capturedAtMs != null ? timing.capturedAtMs : entry.capturedAt != null ? entry.capturedAt : entry.t,
    sourceTimestamp: timing && Object.prototype.hasOwnProperty.call(timing, 'sourceTimestampMs')
      ? timing.sourceTimestampMs
      : entry.sourceTimestamp,
    logEvent: resolveStoredEvent(entry),
  });
}

export function serializeRecordedEntry(entry) {
  const normalized = normalizeLoadedRecordedEntry(entry);
  if (!normalized) return null;

  return {
    timing: normalized.timing,
    replay: Object.freeze({
      schema: RECORDER_REPLAY_SCHEMA,
      info: cloneStructuredValue(normalized.replayInfo),
    }),
    event: normalized.event,
  };
}

export function createRecordingExportObject(options = {}) {
  const events = Array.isArray(options.events) ? options.events : [];
  const serializedEvents = events
    .map((entry) => serializeRecordedEntry(entry))
    .filter(Boolean);

  return {
    version: RECORDER_LOG_VERSION,
    schema: RECORDER_LOG_SCHEMA,
    capture: RECORDER_CAPTURE_META,
    speed: Number(options.speed) || 1,
    eventCount: serializedEvents.length,
    events: serializedEvents,
  };
}
