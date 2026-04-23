import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionRegistry,
  deriveSessionStatus,
  normalizeSessionMetadata,
} from '../server/session-registry.js';

function createNowSequence() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 3, 22, 12, 0, tick++)).toISOString();
}

test('normalizeSessionMetadata keeps only supported session fields', () => {
  assert.deepEqual(
    normalizeSessionMetadata({
      mode: 'REMOTE',
      visibility: ' public ',
      sessionTitle: '  Warehouse Warmup  ',
      hostName: '  Rafa  ',
      viewerName: 'guest',
      viewerEmail: 'guest@example.com',
    }),
    {
      mode: 'remote',
      visibility: 'public',
      title: 'Warehouse Warmup',
      hostName: 'Rafa',
    },
  );
});

test('deriveSessionStatus reflects waiting, live, and ended room states', () => {
  assert.equal(deriveSessionStatus({ hosts: 1, viewers: 0 }), 'waiting');
  assert.equal(deriveSessionStatus({ hosts: 1, viewers: 2 }), 'live');
  assert.equal(deriveSessionStatus({ hosts: 0, viewers: 0 }), 'ended');
});

test('viewer-created sessions stay ad hoc until host metadata arrives', () => {
  const registry = createSessionRegistry({ now: createNowSequence() });

  const viewerSession = registry.recordJoin({
    room: 'alpha',
    role: 'viewer',
    hosts: 0,
    viewers: 1,
    metadata: {
      mode: 'local',
      visibility: 'public',
      sessionTitle: 'Warm Up',
      hostName: 'viewer supplied',
    },
  });

  assert.equal(viewerSession.adHoc, true);
  assert.equal(viewerSession.metadataSource, 'viewer');
  assert.equal(viewerSession.mode, 'local');
  assert.equal(viewerSession.visibility, 'public');
  assert.equal(viewerSession.title, 'Warm Up');
  assert.equal(viewerSession.hostName, null);
  assert.equal(viewerSession.status, 'waiting');

  const hostSession = registry.recordJoin({
    room: 'alpha',
    role: 'host',
    hosts: 1,
    viewers: 1,
    metadata: {
      mode: 'remote',
      visibility: 'private',
      sessionTitle: 'Headliner',
      hostName: 'Rafa',
    },
  });

  assert.equal(hostSession.adHoc, false);
  assert.equal(hostSession.metadataSource, 'host');
  assert.equal(hostSession.mode, 'remote');
  assert.equal(hostSession.visibility, 'private');
  assert.equal(hostSession.title, 'Headliner');
  assert.equal(hostSession.hostName, 'Rafa');
  assert.equal(hostSession.viewerCount, 1);
  assert.equal(hostSession.hostCount, 1);
  assert.equal(hostSession.status, 'live');
});

test('viewer metadata does not override host-authored sessions and ended sessions remain queryable', () => {
  const registry = createSessionRegistry({ now: createNowSequence() });

  registry.recordJoin({
    room: 'omega',
    role: 'host',
    hosts: 1,
    viewers: 0,
    metadata: {
      mode: 'remote',
      visibility: 'public',
      sessionTitle: 'Main Set',
      hostName: 'Rafa',
    },
  });

  const joined = registry.recordJoin({
    room: 'omega',
    role: 'viewer',
    hosts: 1,
    viewers: 1,
    metadata: {
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Viewer Override',
      hostName: 'Guest',
    },
  });

  assert.equal(joined.mode, 'remote');
  assert.equal(joined.visibility, 'public');
  assert.equal(joined.title, 'Main Set');
  assert.equal(joined.hostName, 'Rafa');
  assert.equal(joined.status, 'live');

  const ended = registry.syncRoomState({ room: 'omega', hosts: 0, viewers: 0 });
  assert.equal(ended.status, 'ended');
  assert.equal(registry.getSession('omega')?.status, 'ended');
});

test('resolveSessionKey uses the current room id as the minimal join key foundation', () => {
  const registry = createSessionRegistry({ now: createNowSequence() });

  registry.recordJoin({
    room: 'alpha',
    role: 'host',
    hosts: 1,
    viewers: 0,
    metadata: {
      mode: 'remote',
      visibility: 'public',
      sessionTitle: 'Main Room',
      hostName: 'Rafa',
    },
  });

  const resolved = registry.resolveSessionKey('  alpha  ');
  assert.equal(resolved?.room, 'alpha');
  assert.equal(resolved?.title, 'Main Room');
  assert.equal(resolved?.hostName, 'Rafa');
  assert.equal(registry.resolveSessionKey('missing-room'), null);
  assert.equal(registry.resolveSessionKey('   '), null);
});

test('private host-authored sessions require a valid invite token while public resolution stays open', () => {
  const registry = createSessionRegistry({
    now: createNowSequence(),
    createToken: () => 'viewer-token-alpha',
  });

  registry.recordJoin({
    room: 'alpha',
    role: 'host',
    hosts: 1,
    viewers: 0,
    metadata: {
      mode: 'local',
      visibility: 'private',
      sessionTitle: 'Afterparty',
      hostName: 'Rafa',
    },
    hostAccessToken: 'host-secret-alpha',
  });

  const missingAccess = registry.resolveSessionAccess({ key: 'alpha' });
  assert.equal(missingAccess.ok, false);
  assert.equal(missingAccess.code, 'invite_required');

  const invalidAccess = registry.resolveSessionAccess({
    key: 'alpha',
    accessToken: 'wrong-token',
  });
  assert.equal(invalidAccess.ok, false);
  assert.equal(invalidAccess.code, 'invalid_access');

  const privateInvite = registry.getPrivateInvite({
    room: 'alpha',
    hostAccessToken: 'host-secret-alpha',
  });
  assert.equal(privateInvite.ok, true);
  assert.equal(privateInvite.ok ? privateInvite.accessToken : '', 'viewer-token-alpha');

  const allowedAccess = registry.resolveSessionAccess({
    key: 'alpha',
    accessToken: privateInvite.ok ? privateInvite.accessToken : '',
  });
  assert.equal(allowedAccess.ok, true);
  assert.equal(allowedAccess.ok ? allowedAccess.session.visibility : '', 'private');

  const deniedViewerJoin = registry.authorizeSessionJoin({
    room: 'alpha',
    role: 'viewer',
  });
  assert.equal(deniedViewerJoin.ok, false);
  assert.equal(deniedViewerJoin.code, 'invite_required');

  const allowedViewerJoin = registry.authorizeSessionJoin({
    room: 'alpha',
    role: 'viewer',
    accessToken: privateInvite.ok ? privateInvite.accessToken : '',
  });
  assert.equal(allowedViewerJoin.ok, true);

  const deniedInvite = registry.getPrivateInvite({
    room: 'alpha',
    hostAccessToken: 'wrong-host-secret',
  });
  assert.equal(deniedInvite.ok, false);
  assert.equal(deniedInvite.code, 'host_access_required');

  registry.recordJoin({
    room: 'beta',
    role: 'host',
    hosts: 1,
    viewers: 0,
    metadata: {
      visibility: 'public',
      sessionTitle: 'Open Room',
      hostName: 'Rafa',
    },
  });

  const publicAccess = registry.resolveSessionAccess({ key: 'beta' });
  assert.equal(publicAccess.ok, true);
  assert.equal(publicAccess.ok ? publicAccess.session.visibility : '', 'public');
});
