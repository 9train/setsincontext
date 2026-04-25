# Session Replay Memory

Session Replay Memory is the Stage 1 replay foundation for the DDJ-FLX6 runtime. It keeps replay tied to the same normalized event model and board rendering path as live mode, while staying local-first and account-free.

## What Is Stored

Recording exports remain `flx-recorder-log/v3` JSON files. New exports include additive metadata:

- app name
- export creation time
- recorder schema/version
- duration and event count
- session hints from the runtime URL when available, such as room, mode, visibility, session title, and host name
- device/profile hints from runtime state when available

The replay payload still stores normalized `consumeInfo` events plus structured debugger snapshots. Older v1/v2/v3 recordings remain loadable.

## Local Replay Memory

The host Recording section can save a named replay to this browser. Saved replays live in browser localStorage through `src/session-replay-library.js`.

Each local record stores:

- replay id
- name
- created/updated timestamps
- duration and event count
- room/title/host name when available
- recorder schema/version
- the full replay JSON payload

Local replay memory is device/browser-local. Clearing browser site data can remove saved replays.

## JSON Files

Use **Download JSON** to export the current recorder buffer or a saved replay. Use **Load JSON** to import a recorder export back into the host. JSON replay files are the portable format for now.

## Accounts And Cloud Storage

There are no accounts, login/signup flows, payments, public discovery, cloud dashboards, or database storage in this stage.

The account-ready path remains:

1. keep local replay JSON versioned and portable
2. keep anonymous session persistence separate from replay memory
3. later attach replay records to an account/cloud model without changing the live normalized event path

## Privacy Notes

Replay files may contain detailed controller action history, timing, room/session labels, host names, device/profile metadata, and debugger-oriented event snapshots. Treat exported JSON as session history, not as a harmless settings file.

Replay playback is marked as replay-originated and is not recorded back into the recorder by default. Playback still uses the same runtime `consumeInfo` path as live mode so the board renderer behaves the same way. Remote relay behavior is unchanged: if the current host runtime already relays consumed events to connected viewers, replay follows that same existing path.
