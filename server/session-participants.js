import crypto from 'node:crypto';

const PARTICIPANT_ROLES = new Set(['host', 'viewer']);

function cleanText(value, { maxLength = 240 } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeRole(value) {
  const role = cleanText(value, { maxLength: 20 })?.toLowerCase();
  return PARTICIPANT_ROLES.has(role) ? role : 'viewer';
}

function normalizeTimestamp(value) {
  return cleanText(value, { maxLength: 80 });
}

export function normalizeParticipantMetadata(input = {}, { role = 'viewer' } = {}) {
  if (normalizeRole(role) !== 'viewer') {
    return {
      displayName: null,
      email: null,
    };
  }

  return {
    displayName: cleanText(input.viewerName ?? input.displayName, { maxLength: 120 }),
    email: cleanText(input.viewerEmail ?? input.email, { maxLength: 240 }),
  };
}

export function createParticipantRecord(
  input = {},
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
  } = {},
) {
  const sessionId = cleanText(input.sessionId, { maxLength: 120 });
  const room = cleanText(input.room, { maxLength: 140 });
  if (!sessionId || !room) return null;

  const joinedAt = normalizeTimestamp(input.joinedAt) || now();
  const lastSeenAt = normalizeTimestamp(input.lastSeenAt) || joinedAt;

  return {
    participantId: cleanText(input.participantId, { maxLength: 120 }) || createId(),
    sessionId,
    room,
    role: normalizeRole(input.role),
    displayName: cleanText(input.displayName, { maxLength: 120 }),
    email: cleanText(input.email, { maxLength: 240 }),
    userId: null,
    anonymousId: cleanText(input.anonymousId, { maxLength: 120 }),
    joinedAt,
    lastSeenAt,
    disconnectedAt: normalizeTimestamp(input.disconnectedAt),
  };
}
