import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { createSessionStore } from '../server/session-store.js';
import { hashToken } from '../server/session-token-utils.js';

async function withTempStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flx6-session-store-'));
  const filePath = path.join(dir, 'sessions.json');

  try {
    return await run({ dir, filePath });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('session store persists session records and reloads them from disk', async () => {
  await withTempStore(async ({ filePath }) => {
    const store = createSessionStore({
      filePath,
      createId: () => 'session-alpha',
      now: () => '2026-04-22T12:00:00.000Z',
    });

    const session = store.upsertSession({
      room: 'alpha',
      mode: 'remote',
      visibility: 'public',
      title: 'Warehouse Warmup',
      hostName: 'Rafa',
      status: 'waiting',
      hostCount: 1,
      viewerCount: 0,
      adHoc: false,
      metadataSource: 'host',
      createdAt: '2026-04-22T12:00:00.000Z',
      updatedAt: '2026-04-22T12:00:01.000Z',
    });

    assert.equal(session.sessionId, 'session-alpha');
    assert.equal(session.ownerUserId, null);
    assert.equal(session.endedAt, null);

    const reloaded = createSessionStore({ filePath });
    assert.deepEqual(reloaded.getSessionByRoom('alpha'), session);

    const ended = reloaded.upsertSession({
      room: 'alpha',
      status: 'ended',
      hostCount: 0,
      viewerCount: 0,
      updatedAt: '2026-04-22T12:05:00.000Z',
    });

    assert.equal(ended.sessionId, 'session-alpha');
    assert.equal(ended.status, 'ended');
    assert.equal(ended.endedAt, '2026-04-22T12:05:00.000Z');
  });
});

test('durable invite records hash tokens and never write raw URL tokens', async () => {
  await withTempStore(async ({ filePath }) => {
    const store = createSessionStore({
      filePath,
      createId: () => 'session-private',
      now: () => '2026-04-22T12:00:00.000Z',
    });
    const session = store.upsertSession({
      room: 'gamma',
      visibility: 'private',
      status: 'waiting',
      adHoc: false,
    });

    const invite = store.upsertInvite({
      sessionId: session.sessionId,
      room: 'gamma',
      type: 'viewer_invite',
      rawToken: 'viewer-secret-token',
    });

    assert.equal(invite.tokenHash, hashToken('viewer-secret-token'));
    assert.equal('rawToken' in invite, false);

    const persisted = await fs.readFile(filePath, 'utf8');
    assert.equal(persisted.includes('viewer-secret-token'), false);
    assert.equal(persisted.includes(invite.tokenHash), true);

    const used = store.useInviteToken({
      sessionId: session.sessionId,
      room: 'gamma',
      type: 'viewer_invite',
      rawToken: 'viewer-secret-token',
      at: '2026-04-22T12:01:00.000Z',
    });
    assert.equal(used.lastUsedAt, '2026-04-22T12:01:00.000Z');

    const denied = store.useInviteToken({
      sessionId: session.sessionId,
      room: 'gamma',
      type: 'viewer_invite',
      rawToken: 'wrong-token',
    });
    assert.equal(denied, null);
  });
});

test('session store starts empty and warns when JSON is corrupt', async () => {
  await withTempStore(async ({ filePath }) => {
    await fs.writeFile(filePath, '{not valid json', 'utf8');
    const warnings = [];

    const store = createSessionStore({
      filePath,
      logger: {
        warn: (...args) => warnings.push(args.join(' ')),
      },
    });

    assert.deepEqual(store.listSessions(), []);
    assert.equal(warnings.some((line) => line.includes('failed to load session store')), true);
  });
});

test('participant records are available as an account-ready stub', async () => {
  await withTempStore(async ({ filePath }) => {
    const store = createSessionStore({
      filePath,
      createId: () => 'session-alpha',
      now: () => '2026-04-22T12:00:00.000Z',
    });
    const session = store.upsertSession({ room: 'alpha' });

    const participant = store.upsertParticipant({
      participantId: 'participant-host',
      sessionId: session.sessionId,
      room: 'alpha',
      role: 'host',
      displayName: 'Rafa',
      email: 'rafa@example.com',
      userId: 'future-account-id',
      anonymousId: 'anon-host',
    });

    assert.equal(participant.userId, null);
    assert.equal(participant.disconnectedAt, null);
    assert.deepEqual(store.listParticipants({ sessionId: session.sessionId }), [participant]);

    const disconnected = store.markParticipantDisconnected({
      participantId: 'participant-host',
      lastSeenAt: '2026-04-22T12:05:00.000Z',
      disconnectedAt: '2026-04-22T12:05:00.000Z',
    });
    assert.equal(disconnected.participantId, 'participant-host');
    assert.equal(disconnected.joinedAt, participant.joinedAt);
    assert.equal(disconnected.lastSeenAt, '2026-04-22T12:05:00.000Z');
    assert.equal(disconnected.disconnectedAt, '2026-04-22T12:05:00.000Z');
  });
});
