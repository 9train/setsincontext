import crypto from 'crypto';

import { createSessionStore } from './session-store.js';
import { normalizeParticipantMetadata } from './session-participants.js';

const DEFAULT_MODE = 'remote';
const DEFAULT_VISIBILITY = 'private';
const DEFAULT_TOKEN_BYTES = 18;

function cleanText(value, { maxLength = 120 } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeMode(value) {
  const text = cleanText(value, { maxLength: 16 })?.toLowerCase();
  return text === 'local' || text === 'remote' ? text : null;
}

function normalizeVisibility(value) {
  const text = cleanText(value, { maxLength: 16 })?.toLowerCase();
  return text === 'private' || text === 'public' ? text : null;
}

export function normalizeSessionMetadata(input = {}) {
  return {
    mode: normalizeMode(input.mode),
    visibility: normalizeVisibility(input.visibility),
    title: cleanText(input.sessionTitle ?? input.title, { maxLength: 140 }),
    hostName: cleanText(input.hostName, { maxLength: 80 }),
  };
}

export function deriveSessionStatus({ hosts = 0, viewers = 0 } = {}) {
  if (hosts > 0 && viewers > 0) return 'live';
  if (hosts > 0 || viewers > 0) return 'waiting';
  return 'ended';
}

function cloneSession(session) {
  return session ? { ...session } : null;
}

function normalizeJoinKey(value) {
  return cleanText(value, { maxLength: 140 });
}

function normalizeAccessToken(value) {
  return cleanText(value, { maxLength: 240 });
}

function getStoredSessionJoinKey(session) {
  if (!session || typeof session !== 'object') return null;
  return normalizeJoinKey(session.joinKey) || normalizeJoinKey(session.room);
}

function createOpaqueToken(byteLength = DEFAULT_TOKEN_BYTES) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function isProtectedPrivateSession(session) {
  return !!session && session.visibility === 'private' && session.adHoc === false;
}

function createSession(room, timestamp) {
  return {
    room,
    mode: DEFAULT_MODE,
    visibility: DEFAULT_VISIBILITY,
    title: room,
    hostName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'waiting',
    viewerCount: 0,
    hostCount: 0,
    adHoc: true,
    metadataSource: 'fallback',
  };
}

function createSessionFromDurableRecord(record) {
  if (!record?.room) return null;
  return {
    room: record.room,
    mode: record.mode || DEFAULT_MODE,
    visibility: record.visibility || DEFAULT_VISIBILITY,
    title: record.title || record.room,
    hostName: record.hostName || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status || 'waiting',
    viewerCount: Number.isFinite(record.viewerCount) ? record.viewerCount : 0,
    hostCount: Number.isFinite(record.hostCount) ? record.hostCount : 0,
    adHoc: typeof record.adHoc === 'boolean' ? record.adHoc : true,
    metadataSource: record.metadataSource || 'fallback',
  };
}

function applyRoomState(session, { hosts = 0, viewers = 0, timestamp }) {
  session.hostCount = hosts;
  session.viewerCount = viewers;
  session.status = deriveSessionStatus({ hosts, viewers });
  session.updatedAt = timestamp;
}

export function createSessionRegistry({
  now = () => new Date().toISOString(),
  createToken = createOpaqueToken,
  sessionStore = createSessionStore({ filePath: null, now }),
  logger = console,
} = {}) {
  const sessions = new Map();
  const sessionSecrets = new Map();

  function warnDurableStoreFailure(action, error) {
    logger?.warn?.(`[SESSION_REGISTRY] durable ${action} failed:`, error?.message || error);
  }

  function safeStoreCall(action, callback, fallback = null) {
    if (!sessionStore || typeof callback !== 'function') return fallback;
    try {
      return callback();
    } catch (error) {
      warnDurableStoreFailure(action, error);
      return fallback;
    }
  }

  function getDurableSessionRecord(room) {
    if (!sessionStore?.getSessionByRoom) return null;
    return safeStoreCall('session read', () => sessionStore.getSessionByRoom(room));
  }

  function persistSession(session) {
    if (!sessionStore?.upsertSession || !session) return null;
    return safeStoreCall('session write', () => sessionStore.upsertSession(session));
  }

  function persistInvite(session, { type, rawToken, timestamp } = {}) {
    if (!sessionStore?.upsertInvite || !session || !rawToken) return null;
    const durableSession = getDurableSessionRecord(session.room) || persistSession(session);
    if (!durableSession?.sessionId) return null;

    return safeStoreCall('invite write', () => sessionStore.upsertInvite({
      sessionId: durableSession.sessionId,
      room: session.room,
      type,
      rawToken,
      createdAt: timestamp,
    }));
  }

  function persistSessionAndSecrets(session, {
    hostAccessToken,
    viewerAccessToken,
    timestamp,
  } = {}) {
    persistSession(session);
    persistInvite(session, {
      type: 'host_access',
      rawToken: hostAccessToken,
      timestamp,
    });
    persistInvite(session, {
      type: 'viewer_invite',
      rawToken: viewerAccessToken,
      timestamp,
    });
  }

  function useDurableInviteToken(session, { type, rawToken } = {}) {
    if (!sessionStore?.useInviteToken || !session || !rawToken) return null;
    const durableSession = getDurableSessionRecord(session.room);
    if (!durableSession?.sessionId) return null;
    return safeStoreCall('invite token read', () => sessionStore.useInviteToken({
      sessionId: durableSession.sessionId,
      room: session.room,
      type,
      rawToken,
      at: now(),
    }));
  }

  function hasDurableInvite(session, type) {
    if (!sessionStore?.hasUsableInvite || !session) return false;
    const durableSession = getDurableSessionRecord(session.room);
    if (!durableSession?.sessionId) return false;
    return !!safeStoreCall('invite presence read', () => sessionStore.hasUsableInvite({
      sessionId: durableSession.sessionId,
      room: session.room,
      type,
      at: now(),
    }), false);
  }

  function hydrateSessionsFromStore() {
    if (!sessionStore?.listSessions) return;
    const storedSessions = safeStoreCall('session list read', () => sessionStore.listSessions(), []);
    for (const record of storedSessions) {
      const session = createSessionFromDurableRecord(record);
      if (session) sessions.set(session.room, session);
    }
  }

  hydrateSessionsFromStore();

  function ensureSession(room, timestamp) {
    if (!sessions.has(room)) {
      sessions.set(room, createSession(room, timestamp));
    }
    return sessions.get(room);
  }

  function ensureSessionSecrets(room) {
    if (!sessionSecrets.has(room)) {
      sessionSecrets.set(room, {
        hostAccessToken: null,
        viewerAccessToken: null,
      });
    }
    return sessionSecrets.get(room);
  }

  function noteHostAccessToken(room, hostAccessToken) {
    const normalized = normalizeAccessToken(hostAccessToken);
    if (!normalized) return null;
    const secrets = ensureSessionSecrets(room);
    secrets.hostAccessToken = normalized;
    return normalized;
  }

  function ensurePrivateViewerAccessToken(room) {
    const secrets = ensureSessionSecrets(room);
    if (!secrets.viewerAccessToken) {
      secrets.viewerAccessToken = createToken();
    }
    return secrets.viewerAccessToken;
  }

  function authorizeViewerAccessToSession(session, accessToken) {
    if (!session) {
      return { ok: false, code: 'session_not_found' };
    }

    if (!isProtectedPrivateSession(session)) {
      return { ok: true, session: cloneSession(session), accessToken: null };
    }

    const normalizedAccessToken = normalizeAccessToken(accessToken);
    const secrets = ensureSessionSecrets(session.room);

    if (!normalizedAccessToken) {
      return { ok: false, code: 'invite_required', session: cloneSession(session) };
    }

    if (secrets.viewerAccessToken) {
      if (normalizedAccessToken === secrets.viewerAccessToken) {
        useDurableInviteToken(session, {
          type: 'viewer_invite',
          rawToken: normalizedAccessToken,
        });
        return {
          ok: true,
          session: cloneSession(session),
          accessToken: normalizedAccessToken,
        };
      }
      return { ok: false, code: 'invalid_access', session: cloneSession(session) };
    }

    const durableInvite = useDurableInviteToken(session, {
      type: 'viewer_invite',
      rawToken: normalizedAccessToken,
    });
    if (!durableInvite) {
      return { ok: false, code: 'invalid_access', session: cloneSession(session) };
    }

    secrets.viewerAccessToken = normalizedAccessToken;
    return {
      ok: true,
      session: cloneSession(session),
      accessToken: normalizedAccessToken,
    };
  }

  function authorizeHostAccessToSession(session, hostAccessToken, { requireKnownSecret = false } = {}) {
    const secrets = ensureSessionSecrets(session.room);
    const normalizedHostAccessToken = normalizeAccessToken(hostAccessToken);

    if (secrets.hostAccessToken) {
      if (!!normalizedHostAccessToken && normalizedHostAccessToken === secrets.hostAccessToken) {
        useDurableInviteToken(session, {
          type: 'host_access',
          rawToken: normalizedHostAccessToken,
        });
        return true;
      }
      return false;
    }

    const hasStoredHostAccess = hasDurableInvite(session, 'host_access');
    if (normalizedHostAccessToken) {
      const durableInvite = useDurableInviteToken(session, {
        type: 'host_access',
        rawToken: normalizedHostAccessToken,
      });
      if (durableInvite) {
        secrets.hostAccessToken = normalizedHostAccessToken;
        return true;
      }
    }

    if (requireKnownSecret || hasStoredHostAccess) return false;
    return true;
  }

  function recordJoin({
    room,
    role = 'viewer',
    hosts = 0,
    viewers = 0,
    metadata = {},
    hostAccessToken,
  } = {}) {
    if (!room) return null;

    const timestamp = now();
    const normalized = normalizeSessionMetadata(metadata);
    const session = ensureSession(room, timestamp);
    const normalizedHostAccessToken = normalizeAccessToken(hostAccessToken);
    const canApplyViewerMetadata = role !== 'host' && session.adHoc;
    const hasHostMetadata = role === 'host' && !!(
      normalized.mode ||
      normalized.visibility ||
      normalized.title ||
      normalized.hostName
    );
    const hasViewerMetadata = role !== 'host' && !!(
      normalized.mode ||
      normalized.visibility ||
      normalized.title
    );

    if (role === 'host') {
      if (normalizedHostAccessToken) {
        noteHostAccessToken(room, normalizedHostAccessToken);
      }
      if (normalized.mode) session.mode = normalized.mode;
      if (normalized.visibility) session.visibility = normalized.visibility;
      if (normalized.title) session.title = normalized.title;
      if (normalized.hostName) session.hostName = normalized.hostName;

      if (hasHostMetadata) {
        session.adHoc = false;
        session.metadataSource = 'host';
      }
    } else if (canApplyViewerMetadata) {
      if (normalized.mode) session.mode = normalized.mode;
      if (normalized.visibility) session.visibility = normalized.visibility;
      if (normalized.title) session.title = normalized.title;

      if (hasViewerMetadata && session.metadataSource === 'fallback') {
        session.metadataSource = 'viewer';
      }
    }

    const viewerAccessToken = isProtectedPrivateSession(session)
      ? ensurePrivateViewerAccessToken(room)
      : null;

    applyRoomState(session, { hosts, viewers, timestamp });
    persistSessionAndSecrets(session, {
      hostAccessToken: isProtectedPrivateSession(session) ? normalizedHostAccessToken : null,
      viewerAccessToken,
      timestamp,
    });
    return cloneSession(session);
  }

  function syncRoomState({ room, hosts = 0, viewers = 0 } = {}) {
    if (!room || !sessions.has(room)) return null;
    const session = sessions.get(room);
    applyRoomState(session, { hosts, viewers, timestamp: now() });
    persistSession(session);
    return cloneSession(session);
  }

  function recordParticipantJoin({
    room,
    role = 'viewer',
    participantId,
    anonymousId,
    metadata = {},
  } = {}) {
    if (!sessionStore?.upsertParticipant || !room || !participantId) return null;

    const session = sessions.get(room);
    const durableSession = getDurableSessionRecord(room) || (session ? persistSession(session) : null);
    if (!durableSession?.sessionId) return null;

    const timestamp = now();
    const participantMetadata = normalizeParticipantMetadata(metadata, { role });
    const participantInput = {
      participantId,
      sessionId: durableSession.sessionId,
      room: durableSession.room || room,
      role,
      anonymousId,
      lastSeenAt: timestamp,
      disconnectedAt: null,
    };

    if (participantMetadata.displayName) participantInput.displayName = participantMetadata.displayName;
    if (participantMetadata.email) participantInput.email = participantMetadata.email;

    return safeStoreCall('participant write', () => sessionStore.upsertParticipant(participantInput));
  }

  function markParticipantDisconnected({ participantId } = {}) {
    if (!sessionStore?.markParticipantDisconnected || !participantId) return null;
    const timestamp = now();
    return safeStoreCall('participant disconnect write', () => sessionStore.markParticipantDisconnected({
      participantId,
      lastSeenAt: timestamp,
      disconnectedAt: timestamp,
    }));
  }

  function getSession(room) {
    return cloneSession(sessions.get(room));
  }

  function resolveSessionKey(key) {
    const normalizedKey = normalizeJoinKey(key);
    if (!normalizedKey) return null;

    const directMatch = sessions.get(normalizedKey);
    if (directMatch) return cloneSession(directMatch);

    for (const session of sessions.values()) {
      if (getStoredSessionJoinKey(session) === normalizedKey) {
        return cloneSession(session);
      }
    }

    return null;
  }

  function resolveSessionAccess({ key, accessToken } = {}) {
    const session = resolveSessionKey(key);
    if (!session) {
      return { ok: false, code: 'session_not_found' };
    }
    return authorizeViewerAccessToSession(session, accessToken);
  }

  function authorizeSessionJoin({
    room,
    role = 'viewer',
    accessToken,
    hostAccessToken,
  } = {}) {
    const session = sessions.get(room);
    if (!session) {
      return { ok: true, session: null };
    }

    if (!isProtectedPrivateSession(session)) {
      return { ok: true, session: cloneSession(session) };
    }

    if (role === 'host') {
      if (authorizeHostAccessToSession(session, hostAccessToken)) {
        return { ok: true, session: cloneSession(session) };
      }

      return { ok: false, code: 'host_access_required', session: cloneSession(session) };
    }

    return authorizeViewerAccessToSession(session, accessToken);
  }

  function getPrivateInvite({ room, hostAccessToken } = {}) {
    const session = sessions.get(room);
    if (!session) {
      return { ok: false, code: 'session_not_found' };
    }

    if (!isProtectedPrivateSession(session)) {
      return { ok: false, code: 'not_private', session: cloneSession(session) };
    }

    if (!authorizeHostAccessToSession(session, hostAccessToken, { requireKnownSecret: true })) {
      return { ok: false, code: 'host_access_required', session: cloneSession(session) };
    }

    const accessToken = ensurePrivateViewerAccessToken(room);
    persistSessionAndSecrets(session, {
      viewerAccessToken: accessToken,
      timestamp: now(),
    });

    return {
      ok: true,
      session: cloneSession(session),
      accessToken,
    };
  }

  function listSessions() {
    return [...sessions.values()]
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(cloneSession);
  }

  return {
    authorizeSessionJoin,
    getSession,
    getPrivateInvite,
    listSessions,
    markParticipantDisconnected,
    recordJoin,
    recordParticipantJoin,
    resolveSessionAccess,
    resolveSessionKey,
    syncRoomState,
  };
}
