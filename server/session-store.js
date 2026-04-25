import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createInviteRecord, isInviteUsable } from './session-invites.js';
import { createParticipantRecord } from './session-participants.js';
import { hashToken } from './session-token-utils.js';

const STORE_VERSION = 1;
const SESSION_MODES = new Set(['local', 'remote']);
const SESSION_VISIBILITIES = new Set(['private', 'public']);
const SESSION_STATUSES = new Set(['waiting', 'live', 'ended']);

function cleanText(value, { maxLength = 240 } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return {
    version: STORE_VERSION,
    sessions: [],
    participants: [],
    invites: [],
  };
}

function collectionValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeMode(value, fallback = 'remote') {
  const mode = cleanText(value, { maxLength: 16 })?.toLowerCase();
  return SESSION_MODES.has(mode) ? mode : fallback;
}

function normalizeVisibility(value, fallback = 'private') {
  const visibility = cleanText(value, { maxLength: 16 })?.toLowerCase();
  return SESSION_VISIBILITIES.has(visibility) ? visibility : fallback;
}

function normalizeStatus(value, fallback = 'waiting') {
  const status = cleanText(value, { maxLength: 16 })?.toLowerCase();
  return SESSION_STATUSES.has(status) ? status : fallback;
}

function normalizeCount(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function normalizeTimestamp(value) {
  return cleanText(value, { maxLength: 80 });
}

function createSessionId() {
  return `sess_${crypto.randomUUID()}`;
}

function createSessionRecord(
  input = {},
  {
    existing = null,
    createId = createSessionId,
    now = () => new Date().toISOString(),
  } = {},
) {
  const room = cleanText(input.room ?? existing?.room, { maxLength: 140 });
  if (!room) return null;

  const timestamp = now();
  const updatedAt = normalizeTimestamp(input.updatedAt) || timestamp;
  const status = normalizeStatus(input.status, existing?.status || 'waiting');
  const title = cleanText(input.title ?? input.sessionTitle ?? existing?.title, { maxLength: 140 }) || room;
  const endedAt = status === 'ended'
    ? (normalizeTimestamp(input.endedAt) || existing?.endedAt || updatedAt || timestamp)
    : null;

  return {
    sessionId: cleanText(input.sessionId ?? existing?.sessionId, { maxLength: 120 }) || createId(),
    room,
    mode: normalizeMode(input.mode, existing?.mode || 'remote'),
    visibility: normalizeVisibility(input.visibility, existing?.visibility || 'private'),
    title,
    hostName: cleanText(input.hostName ?? existing?.hostName, { maxLength: 80 }),
    status,
    hostCount: normalizeCount(input.hostCount, existing?.hostCount || 0),
    viewerCount: normalizeCount(input.viewerCount, existing?.viewerCount || 0),
    adHoc: typeof input.adHoc === 'boolean'
      ? input.adHoc
      : (typeof existing?.adHoc === 'boolean' ? existing.adHoc : true),
    metadataSource: cleanText(input.metadataSource ?? existing?.metadataSource, { maxLength: 40 }) || 'fallback',
    ownerUserId: null,
    createdAt: normalizeTimestamp(input.createdAt) || existing?.createdAt || timestamp,
    updatedAt,
    endedAt,
  };
}

function normalizeState(input = {}, options = {}) {
  const state = emptyState();

  for (const session of collectionValues(input.sessions)) {
    const record = createSessionRecord(session, options);
    if (record) state.sessions.push(record);
  }

  for (const participant of collectionValues(input.participants)) {
    const record = createParticipantRecord(participant, { now: options.now });
    if (record) state.participants.push(record);
  }

  for (const invite of collectionValues(input.invites)) {
    const record = createInviteRecord(invite, options);
    if (record) state.invites.push(record);
  }

  return state;
}

function loadState(filePath, { logger = console, now, createId } = {}) {
  if (!filePath) return emptyState();
  if (!fs.existsSync(filePath)) return emptyState();

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return normalizeState(parsed, { now, createId });
  } catch (error) {
    logger?.warn?.('[SESSION_STORE] failed to load session store; starting empty', {
      filePath,
      error: error?.message || String(error),
    });
    return emptyState();
  }
}

function inviteMatches(invite, { sessionId, room, type, tokenHash } = {}) {
  if (sessionId && invite.sessionId !== sessionId) return false;
  if (room && invite.room !== room) return false;
  if (type && invite.type !== type) return false;
  if (tokenHash && invite.tokenHash !== tokenHash) return false;
  return true;
}

export function createSessionStore({
  filePath = process.env.SESSION_STORE_FILE || null,
  logger = console,
  now = () => new Date().toISOString(),
  createId = createSessionId,
} = {}) {
  const storeFile = cleanText(filePath, { maxLength: 1000 });
  const state = loadState(storeFile, { logger, now, createId });

  function persist() {
    if (!storeFile) return;

    let tempFile = null;
    try {
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      tempFile = `${storeFile}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      fs.renameSync(tempFile, storeFile);
    } catch (error) {
      if (tempFile) {
        try { fs.rmSync(tempFile, { force: true }); } catch {}
      }
      logger?.warn?.('[SESSION_STORE] failed to persist session store', {
        filePath: storeFile,
        error: error?.message || String(error),
      });
    }
  }

  function getSessionByRoom(room) {
    const normalizedRoom = cleanText(room, { maxLength: 140 });
    if (!normalizedRoom) return null;
    return clone(state.sessions.find((session) => session.room === normalizedRoom) || null);
  }

  function getSessionById(sessionId) {
    const normalizedId = cleanText(sessionId, { maxLength: 120 });
    if (!normalizedId) return null;
    return clone(state.sessions.find((session) => session.sessionId === normalizedId) || null);
  }

  function upsertSession(input = {}) {
    const sessionId = cleanText(input.sessionId, { maxLength: 120 });
    const room = cleanText(input.room, { maxLength: 140 });
    const index = state.sessions.findIndex((session) => (
      (sessionId && session.sessionId === sessionId) ||
      (room && session.room === room)
    ));
    const existing = index >= 0 ? state.sessions[index] : null;
    const record = createSessionRecord(input, { existing, createId, now });
    if (!record) return null;

    if (index >= 0) state.sessions[index] = record;
    else state.sessions.push(record);
    persist();
    return clone(record);
  }

  function listSessions() {
    return state.sessions.map(clone);
  }

  function upsertParticipant(input = {}) {
    const participantId = cleanText(input.participantId, { maxLength: 120 });
    const index = state.participants.findIndex((participant) => (
      participantId && participant.participantId === participantId
    ));
    const existing = index >= 0 ? state.participants[index] : null;
    const record = createParticipantRecord(
      {
        ...existing,
        ...input,
        joinedAt: input.joinedAt ?? existing?.joinedAt,
      },
      { now },
    );
    if (!record) return null;

    if (index >= 0) state.participants[index] = record;
    else state.participants.push(record);
    persist();
    return clone(record);
  }

  function listParticipants({ sessionId, room } = {}) {
    return state.participants
      .filter((participant) => {
        if (sessionId && participant.sessionId !== sessionId) return false;
        if (room && participant.room !== room) return false;
        return true;
      })
      .map(clone);
  }

  function markParticipantDisconnected({ participantId, disconnectedAt, lastSeenAt } = {}) {
    const normalizedParticipantId = cleanText(participantId, { maxLength: 120 });
    if (!normalizedParticipantId) return null;

    const index = state.participants.findIndex((participant) => (
      participant.participantId === normalizedParticipantId
    ));
    if (index < 0) return null;

    const timestamp = normalizeTimestamp(disconnectedAt) || normalizeTimestamp(lastSeenAt) || now();
    const record = createParticipantRecord(
      {
        ...state.participants[index],
        lastSeenAt: normalizeTimestamp(lastSeenAt) || timestamp,
        disconnectedAt: timestamp,
      },
      { now },
    );
    if (!record) return null;

    state.participants[index] = record;
    persist();
    return clone(record);
  }

  function upsertInvite(input = {}) {
    const record = createInviteRecord(input, { now });
    if (!record) return null;

    const index = state.invites.findIndex((invite) => inviteMatches(invite, {
      sessionId: record.sessionId,
      room: record.room,
      type: record.type,
      tokenHash: record.tokenHash,
    }));
    const existing = index >= 0 ? state.invites[index] : null;

    if (existing) {
      state.invites[index] = {
        ...record,
        createdAt: existing.createdAt,
        lastUsedAt: record.lastUsedAt || existing.lastUsedAt,
        expiresAt: record.expiresAt || existing.expiresAt,
        revokedAt: record.revokedAt || existing.revokedAt,
      };
    } else {
      for (const invite of state.invites) {
        if (
          invite.sessionId === record.sessionId &&
          invite.type === record.type &&
          invite.revokedAt == null
        ) {
          invite.revokedAt = record.createdAt;
        }
      }
      state.invites.push(record);
    }

    persist();
    return clone(index >= 0 ? state.invites[index] : record);
  }

  function listInvites(filter = {}) {
    return state.invites
      .filter((invite) => inviteMatches(invite, filter))
      .map(clone);
  }

  function hasUsableInvite(filter = {}) {
    const at = normalizeTimestamp(filter.at) || now();
    return state.invites.some((invite) => (
      inviteMatches(invite, filter) &&
      isInviteUsable(invite, { at })
    ));
  }

  function useInviteToken({ sessionId, room, type, rawToken, at } = {}) {
    const tokenHash = hashToken(rawToken);
    if (!tokenHash) return null;

    const usedAt = normalizeTimestamp(at) || now();
    const index = state.invites.findIndex((invite) => (
      inviteMatches(invite, { sessionId, room, type, tokenHash }) &&
      isInviteUsable(invite, { at: usedAt })
    ));
    if (index < 0) return null;

    state.invites[index] = {
      ...state.invites[index],
      lastUsedAt: usedAt,
    };
    persist();
    return clone(state.invites[index]);
  }

  return {
    getSessionById,
    getSessionByRoom,
    hasUsableInvite,
    listInvites,
    listParticipants,
    listSessions,
    markParticipantDisconnected,
    upsertInvite,
    upsertParticipant,
    upsertSession,
    useInviteToken,
  };
}
