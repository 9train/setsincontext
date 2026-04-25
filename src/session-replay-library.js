import {
  createRecordingExportObject,
  RECORDER_LOG_SCHEMA,
  RECORDER_LOG_VERSION,
} from './recorder/schema.js';

export const SESSION_REPLAY_LIBRARY_VERSION = 1;
export const SESSION_REPLAY_RECORD_SCHEMA = 'flx-session-replay-record/v1';
export const SESSION_REPLAY_STORAGE_PREFIX = 'flx.sessionReplay.v1';
export const SESSION_REPLAY_INDEX_KEY = `${SESSION_REPLAY_STORAGE_PREFIX}.index`;

function getDefaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function compactString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function createReplayId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function keyForReplay(replayId) {
  return `${SESSION_REPLAY_STORAGE_PREFIX}.${replayId}`;
}

function normalizeReplayPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
    throw new Error('Replay payload must be a recorder export object with events');
  }
  if (
    payload.schema === RECORDER_LOG_SCHEMA &&
    payload.version === RECORDER_LOG_VERSION &&
    payload.metadata &&
    payload.durationMs != null &&
    payload.eventCount != null
  ) {
    return cloneJsonValue(payload);
  }
  return createRecordingExportObject({
    speed: payload.speed,
    events: payload.events,
    metadata: payload.metadata,
  });
}

function summarizePayload(payload) {
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  const session = metadata.session && typeof metadata.session === 'object' ? metadata.session : {};
  return {
    durationMs: Number.isFinite(Number(payload?.durationMs)) ? Number(payload.durationMs) : 0,
    eventCount: Number.isFinite(Number(payload?.eventCount)) ? Number(payload.eventCount) : Array.isArray(payload?.events) ? payload.events.length : 0,
    room: compactString(session.room),
    title: compactString(session.title || session.sessionTitle),
    hostName: compactString(session.hostName),
    schema: compactString(payload?.schema) || RECORDER_LOG_SCHEMA,
    version: Number.isFinite(Number(payload?.version)) ? Number(payload.version) : RECORDER_LOG_VERSION,
  };
}

function toListItem(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    replayId: record.replayId,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    durationMs: record.durationMs,
    eventCount: record.eventCount,
    room: record.room,
    title: record.title,
    hostName: record.hostName,
    schema: record.schema,
    version: record.version,
  };
}

function cleanReplayRecord(record) {
  if (!record || typeof record !== 'object' || !record.replayId || !record.payload) return null;
  return {
    recordSchema: record.recordSchema || SESSION_REPLAY_RECORD_SCHEMA,
    libraryVersion: Number(record.libraryVersion) || SESSION_REPLAY_LIBRARY_VERSION,
    replayId: String(record.replayId),
    name: compactString(record.name) || 'Untitled replay',
    createdAt: compactString(record.createdAt) || nowIso(),
    updatedAt: compactString(record.updatedAt) || compactString(record.createdAt) || nowIso(),
    durationMs: Number.isFinite(Number(record.durationMs)) ? Number(record.durationMs) : 0,
    eventCount: Number.isFinite(Number(record.eventCount)) ? Number(record.eventCount) : 0,
    room: compactString(record.room),
    title: compactString(record.title),
    hostName: compactString(record.hostName),
    schema: compactString(record.schema) || RECORDER_LOG_SCHEMA,
    version: Number.isFinite(Number(record.version)) ? Number(record.version) : RECORDER_LOG_VERSION,
    payload: record.payload,
  };
}

export function createSessionReplayLibrary({ storage = getDefaultStorage() } = {}) {
  function requireStorage() {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('Session replay library requires localStorage-compatible storage');
    }
    return storage;
  }

  function readIndex() {
    const target = requireStorage();
    const parsed = safeJsonParse(target.getItem(SESSION_REPLAY_INDEX_KEY), []);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }

  function writeIndex(replayIds) {
    const target = requireStorage();
    const unique = Array.from(new Set((replayIds || []).map(String).filter(Boolean)));
    target.setItem(SESSION_REPLAY_INDEX_KEY, JSON.stringify(unique));
    return unique;
  }

  function loadReplay(replayId) {
    if (!replayId) return null;
    const target = requireStorage();
    const record = cleanReplayRecord(safeJsonParse(target.getItem(keyForReplay(replayId))));
    return record ? cloneJsonValue(record) : null;
  }

  function listReplays() {
    const records = readIndex()
      .map((replayId) => loadReplay(replayId))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return records.map(toListItem);
  }

  function saveReplay({ replayId = null, name = '', payload } = {}) {
    const target = requireStorage();
    const normalizedPayload = normalizeReplayPayload(payload);
    const existing = replayId ? loadReplay(replayId) : null;
    const id = existing?.replayId || compactString(replayId) || createReplayId();
    const summary = summarizePayload(normalizedPayload);
    const createdAt = existing?.createdAt || summary.createdAt || nowIso();
    const record = cleanReplayRecord({
      recordSchema: SESSION_REPLAY_RECORD_SCHEMA,
      libraryVersion: SESSION_REPLAY_LIBRARY_VERSION,
      replayId: id,
      name: compactString(name) || existing?.name || summary.title || 'Untitled replay',
      createdAt,
      updatedAt: nowIso(),
      ...summary,
      payload: normalizedPayload,
    });

    target.setItem(keyForReplay(id), JSON.stringify(record));
    writeIndex([id, ...readIndex()]);
    return cloneJsonValue(record);
  }

  function deleteReplay(replayId) {
    if (!replayId) return false;
    const target = requireStorage();
    const existing = target.getItem(keyForReplay(replayId));
    target.removeItem(keyForReplay(replayId));
    writeIndex(readIndex().filter((entry) => entry !== String(replayId)));
    return existing != null;
  }

  return {
    saveReplay,
    loadReplay,
    listReplays,
    deleteReplay,
  };
}

export const sessionReplayLibrary = createSessionReplayLibrary();

export function createReplayDownloadFilename(record) {
  const base = compactString(record?.name || record?.title) || 'session-replay';
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'session-replay';
  return `${safe}.json`;
}
