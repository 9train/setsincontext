import crypto from 'crypto';

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

function applyRoomState(session, { hosts = 0, viewers = 0, timestamp }) {
  session.hostCount = hosts;
  session.viewerCount = viewers;
  session.status = deriveSessionStatus({ hosts, viewers });
  session.updatedAt = timestamp;
}

export function createSessionRegistry({
  now = () => new Date().toISOString(),
  createToken = createOpaqueToken,
} = {}) {
  const sessions = new Map();
  const sessionSecrets = new Map();

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

    if (!secrets.viewerAccessToken || normalizedAccessToken !== secrets.viewerAccessToken) {
      return { ok: false, code: 'invalid_access', session: cloneSession(session) };
    }

    return {
      ok: true,
      session: cloneSession(session),
      accessToken: normalizedAccessToken,
    };
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

    if (isProtectedPrivateSession(session)) {
      ensurePrivateViewerAccessToken(room);
    }

    applyRoomState(session, { hosts, viewers, timestamp });
    return cloneSession(session);
  }

  function syncRoomState({ room, hosts = 0, viewers = 0 } = {}) {
    if (!room || !sessions.has(room)) return null;
    const session = sessions.get(room);
    applyRoomState(session, { hosts, viewers, timestamp: now() });
    return cloneSession(session);
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
      const secrets = ensureSessionSecrets(room);
      if (!secrets.hostAccessToken) {
        return { ok: true, session: cloneSession(session) };
      }

      const normalizedHostAccessToken = normalizeAccessToken(hostAccessToken);
      if (normalizedHostAccessToken && normalizedHostAccessToken === secrets.hostAccessToken) {
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

    const secrets = ensureSessionSecrets(room);
    const normalizedHostAccessToken = normalizeAccessToken(hostAccessToken);
    if (
      !secrets.hostAccessToken ||
      !normalizedHostAccessToken ||
      normalizedHostAccessToken !== secrets.hostAccessToken
    ) {
      return { ok: false, code: 'host_access_required', session: cloneSession(session) };
    }

    return {
      ok: true,
      session: cloneSession(session),
      accessToken: ensurePrivateViewerAccessToken(room),
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
    recordJoin,
    resolveSessionAccess,
    resolveSessionKey,
    syncRoomState,
  };
}
