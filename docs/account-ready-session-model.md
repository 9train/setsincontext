# Account-Ready Session Model

This document describes the current anonymous session model and the account-ready fields that exist so a future auth layer can attach safely. It is not an auth implementation plan.

## Current Anonymous Model

- Users do not log in yet.
- Room keys are still the main join mechanism.
- Public sessions can be resolved by room key.
- Private sessions use viewer invite access tokens.
- Host control for private session invite generation uses `hostAccess`.
- WebSocket joins enforce private viewer invite access before a viewer enters a protected private session.
- Sessions, participants, and invite/secret records persist durably when `SESSION_STORE_FILE` is set.
- Without `SESSION_STORE_FILE`, the runtime keeps the same in-memory behavior and does not write durable account-ready records.

## Session Record

The durable session record is the account-ready root for a room:

```json
{
  "sessionId": "sess_...",
  "room": "studio-a",
  "mode": "remote",
  "visibility": "private",
  "title": "Sunday scratch lesson",
  "hostName": "Rafa",
  "status": "waiting",
  "hostCount": 1,
  "viewerCount": 0,
  "adHoc": false,
  "metadataSource": "host",
  "ownerUserId": null,
  "createdAt": "2026-04-22T12:00:00.000Z",
  "updatedAt": "2026-04-22T12:00:00.000Z",
  "endedAt": null
}
```

Field notes:

- `sessionId` is the durable session identifier.
- `room` remains the human/shareable join key.
- `mode` is `local` or `remote`.
- `visibility` is `private` or `public`.
- `title` and `hostName` are display metadata, currently supplied by the host flow when present.
- `status` is `waiting`, `live`, or `ended`.
- `hostCount` and `viewerCount` mirror current room presence.
- `adHoc` marks sessions that were created by compatibility/viewer-only flows before host metadata exists.
- `metadataSource` records whether metadata came from fallback, viewer, or host context.
- `ownerUserId` is always `null` in current runtime behavior.
- `createdAt`, `updatedAt`, and `endedAt` describe lifecycle timing. `endedAt` is set when a session reaches ended status.

## Participant Record

The durable participant record is where anonymous users and future account users meet:

```json
{
  "participantId": "participant_c_abc123_1",
  "sessionId": "sess_...",
  "room": "studio-a",
  "role": "viewer",
  "displayName": "Ada",
  "email": "ada@example.com",
  "userId": null,
  "anonymousId": "c_abc123",
  "joinedAt": "2026-04-22T12:00:00.000Z",
  "lastSeenAt": "2026-04-22T12:05:00.000Z",
  "disconnectedAt": null
}
```

Field notes:

- `participantId` identifies one durable participant lifecycle for a socket room/role membership.
- `sessionId` links the participant to a durable session.
- `room` keeps the room key available for compatibility and inspection.
- `role` is `host` or `viewer`.
- `displayName` and `email` are private participant metadata, normalized from viewer name/email inputs when present.
- `userId` is always `null` in current runtime behavior.
- `anonymousId` links the record to the anonymous socket connection before accounts exist.
- `joinedAt`, `lastSeenAt`, and `disconnectedAt` describe lifecycle timing.

## Invite And Secret Record

Invite and host-control secrets are durable only as hashes:

```json
{
  "sessionId": "sess_...",
  "room": "studio-a",
  "type": "viewer_invite",
  "tokenHash": "sha256:...",
  "createdAt": "2026-04-22T12:00:00.000Z",
  "lastUsedAt": null,
  "expiresAt": null,
  "revokedAt": null
}
```

Supported `type` values:

- `host_access`
- `viewer_invite`

Secret rules:

- Raw `hostAccess` and viewer invite tokens must not be stored durably.
- `tokenHash` is the only durable secret value.
- `lastUsedAt` is updated when a valid durable invite token is used.
- `expiresAt` and `revokedAt` are nullable lifecycle fields reserved by the durable model.

## Privacy Rules

- `viewerName` and `viewerEmail` are private participant metadata.
- `viewerName` and `viewerEmail` must not appear in public session payloads.
- Raw tokens must not be stored durably.
- Token hashes must not appear in public API payloads.
- Host access hashes must not appear in public API payloads.
- The raw viewer invite token may still appear in a generated private `joinUrlPath`, because current private invite links require the viewer page to receive the token in the URL.
- Public session payloads may include session display metadata such as `room`, `mode`, `visibility`, `title`, `hostName`, `status`, counts, `adHoc`, and a viewer `joinUrlPath`.
- Public payloads must not expose `sessionId`, `ownerUserId`, participant records, raw tokens, token hashes, or host access values.

## Future Account Migration

The future account layer should wrap this model, not replace it.

- `ownerUserId` can later attach a session to an account.
- `participant.userId` can later attach a participant to an account.
- `anonymousId` lets sessions and participants exist before login and then be correlated during a future claim/attach flow.
- Room keys and invite URLs should remain backward-compatible.
- Existing private invite enforcement should remain the gate for private viewer access unless a future auth layer explicitly adds a stronger compatible path.
- Future auth should add ownership and identity around the existing session, participant, and invite records instead of moving session truth into website UI state.
- A future service-only claim helper can be added when account IDs exist, but it should not be exposed as an HTTP route until auth is actually available.

## Explicit Non-Goals

- No login yet.
- No signup yet.
- No public profiles yet.
- No payments yet.
- No public discovery yet.
- No database migration yet.
- No JWTs, cookies, OAuth providers, or hosted auth providers yet.
- No account dashboard or session history UI yet.
