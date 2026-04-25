import { hashToken } from './session-token-utils.js';

const INVITE_TYPES = new Set(['host_access', 'viewer_invite']);

function cleanText(value, { maxLength = 240 } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeInviteType(value) {
  const type = cleanText(value, { maxLength: 40 });
  return INVITE_TYPES.has(type) ? type : null;
}

function normalizeTimestamp(value) {
  return cleanText(value, { maxLength: 80 });
}

export function createInviteRecord(input = {}, { now = () => new Date().toISOString() } = {}) {
  const sessionId = cleanText(input.sessionId, { maxLength: 120 });
  const room = cleanText(input.room, { maxLength: 140 });
  const type = normalizeInviteType(input.type);
  const tokenHash = cleanText(input.tokenHash, { maxLength: 240 }) || hashToken(input.rawToken);
  const createdAt = normalizeTimestamp(input.createdAt) || now();

  if (!sessionId || !room || !type || !tokenHash) return null;

  return {
    sessionId,
    room,
    type,
    tokenHash,
    createdAt,
    lastUsedAt: normalizeTimestamp(input.lastUsedAt),
    expiresAt: normalizeTimestamp(input.expiresAt),
    revokedAt: normalizeTimestamp(input.revokedAt),
  };
}

export function isInviteUsable(record, { at = new Date().toISOString() } = {}) {
  if (!record || record.revokedAt) return false;
  if (!record.expiresAt) return true;
  return String(record.expiresAt) > String(at);
}
