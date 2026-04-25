import crypto from 'node:crypto';

const TOKEN_HASH_ALGORITHM = 'sha256';
const TOKEN_HASH_PREFIX = `${TOKEN_HASH_ALGORITHM}:`;

export function normalizeStoredToken(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 240) : null;
}

export function hashToken(rawToken) {
  const normalized = normalizeStoredToken(rawToken);
  if (!normalized) return null;

  const digest = crypto
    .createHash(TOKEN_HASH_ALGORITHM)
    .update(normalized)
    .digest('base64url');
  return `${TOKEN_HASH_PREFIX}${digest}`;
}

export function verifyTokenHash(rawToken, tokenHash) {
  const expected = hashToken(rawToken);
  if (!expected || !tokenHash) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(tokenHash));
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
