# Session Persistence Deployment

Stage 4 keeps the runtime JSON-backed store simple, explicit, and replaceable. It does not add login, auth UI, payments, public discovery, profiles, or a database implementation.

## SESSION_STORE_FILE

`SESSION_STORE_FILE` is an optional server environment variable that points to the JSON file used for durable session runtime data.

When it is set, the runtime persists:

- `sessions`
- `participants`
- `invites`

The JSON store keeps current room behavior intact. Room keys remain the join foundation. Private viewer invites still use URL tokens, and durable invite records store token hashes only. WebSocket joins still enforce private invite access before a viewer enters a protected private session.

When `SESSION_STORE_FILE` is omitted, the session store is memory-only. Sessions, participants, and invites work during the current Node process, but account-ready records are not written to disk and are lost on restart. This remains the default so local development and tests do not accidentally create persistent runtime files.

## Local Setup

For local persistence, point `SESSION_STORE_FILE` at a local ignored path:

```sh
SESSION_STORE_FILE=.runtime-data/sessions.json npm start
```

The parent directory is created automatically when the first write occurs. Writes use a temporary file in the same directory and then rename it into place.

Local runtime JSON files should not be committed. This repo ignores common local persistence paths such as `data/*.json`, `.runtime-data/`, and `.session-store/`.

## Deployed Node Hosts

On a deployed Node host, set `SESSION_STORE_FILE` in the host's environment configuration:

```sh
SESSION_STORE_FILE=/var/app/session-data/sessions.json
```

Use a path that the Node process can write to. If the platform supports mounted persistent volumes, place the file on that volume. If the platform only offers an ephemeral filesystem, the JSON file can disappear on deploy, restart, reschedule, or image rebuild.

Ephemeral filesystem loss does not expose raw invite tokens, but it can remove durable session, participant, invite hash, and ended-session records. Active in-memory behavior also resets when the process restarts.

## Fit For Demos And Small Pilots

The JSON store is good enough for demos and small pilots because it is easy to inspect, easy to back up, and has no extra service dependency. It keeps the runtime's current public/private session behavior clear while making restarts less fragile on hosts with persistent disk.

This is not the long-term multi-instance production store. Migrate once any of these become true:

- More than one Node instance needs to share session state.
- Session history becomes valuable product data.
- Operators need backups, retention, admin inspection, or analytics.
- Concurrent writes become frequent enough that a single JSON file is risky.
- Users need durable account ownership, team access, or billing-adjacent state.

Reasonable next stores include Postgres, Supabase, SQLite on a durable volume, or another managed database that fits the deployment shape.

## Future database shape

Do not implement this database yet. This sketch documents the eventual shape so the JSON store can remain replaceable.

```sql
sessions (
  sessionId text primary key,
  room text not null,
  mode text not null,
  visibility text not null,
  title text not null,
  hostName text,
  status text not null,
  hostCount integer not null,
  viewerCount integer not null,
  adHoc boolean not null,
  metadataSource text not null,
  ownerUserId text,
  createdAt timestamptz not null,
  updatedAt timestamptz not null,
  endedAt timestamptz
)
```

Important indexes:

- `sessions.room`
- `sessions.sessionId`

```sql
session_participants (
  participantId text primary key,
  sessionId text not null,
  room text not null,
  role text not null,
  displayName text,
  email text,
  userId text,
  anonymousId text,
  joinedAt timestamptz not null,
  lastSeenAt timestamptz not null,
  disconnectedAt timestamptz
)
```

Important indexes:

- `participants.sessionId`
- `participants.room`

```sql
session_invites (
  sessionId text not null,
  room text not null,
  type text not null,
  tokenHash text not null,
  createdAt timestamptz not null,
  lastUsedAt timestamptz,
  expiresAt timestamptz,
  revokedAt timestamptz
)
```

Important indexes:

- `invites.sessionId`
- `invites.room`
- `invites.type`
- `invites.tokenHash`

## Data Privacy Checklist

- [ ] Raw invite and host access tokens are URL-only.
- [ ] Durable secrets are hashed before persistence.
- [ ] `viewerName` and `viewerEmail` are private participant metadata.
- [ ] Public payloads do not expose `viewerName` or `viewerEmail`.
- [ ] Public payloads do not expose `tokenHash`.
- [ ] Public payloads do not expose `hostAccess`.
- [ ] The JSON file pointed at by `SESSION_STORE_FILE` should not be committed.
- [ ] Local session data files are ignored by git.

## Auth Timing

Authentication should come after production persistence is understood. The current anonymous model already has the durable roots a future auth layer needs: sessions, participants, invite hashes, `ownerUserId`, and participant `userId` placeholders.

Adding auth before the persistence behavior is proven would blur whether bugs come from identity, storage, or private invite enforcement. Stage 4 should keep those concerns separate: first make persistence operationally clear, then attach real account identity later.
