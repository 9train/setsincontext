# DDJ-FLX-6 MIDI Visualizer

## Project Overview

This app is a browser-based visualizer for a Pioneer DDJ-FLX6. It has two main pages:

- `host.html`: reads MIDI from the controller, draws the board locally, and relays controller events over WebSocket
- `viewer.html`: shows the same board state remotely by listening over WebSocket

The supported development lane is now centered on `src/controllers/`. That controller layer is the official place for ongoing controller work, and the shipped DDJ-FLX6 profile is the default/demo controller for the live app path.

## Official App Path

When future work needs a default target, use this lane:

- `host.html` for the host page
- `viewer.html` for the viewer page
- Browser WebMIDI through `src/midi.js` and `src/controllers/adapters/web-midi.js`
- Browser WebSocket handling through `src/ws.js`
- The canonical server in `server/server.js`
- The controller layer under `src/controllers/`
- The `pioneer-ddj-flx6` profile as the default and main demo controller

`index.html` is only a small launcher/redirect into that runtime. It is not a separate app path.

## Legacy / Experimental Paths

These files remain in the repo, but they are not the official runtime lane:

- `public/index.html` and `src/main.js` are retained legacy/demo bootstraps
- `src/host-midi.js` is an older alternate browser WebMIDI helper
- `src/wsClient.js` and `src/legacy/wsClient.js` are compatibility WebSocket clients, not the main one
- `ws-bridge.js` and `legacy/ws-bridge.js` are deprecated standalone relay experiments
- `server/midi-bridge.js` and `server/hid.js` are legacy/dev-only Node-side diagnostics, not normal runtime paths
- `src/app-boot.js` and `src/events.js` are experimental FEEL/editor hooks
- The learned-map storage path in `src/mapper.js` and `src/wizard.js` is a board-renderer compatibility layer, not the source of truth for controller profiles

## What The App Does Right Now

- Reads live MIDI from a DDJ-FLX6 in the browser through WebMIDI
- Resolves live input through the official FLX6 controller profile and normalized event path
- Draws the controller board in the browser
- Mirrors host activity to one or more viewer pages through WebSocket rooms
- Treats learned, fallback, and remote maps as draft/provisional diagnostic metadata, not official controller truth
- Renders official controller events on the viewer without learned-map fallback bootstrap
- Includes host-side tools for recording, diagnostics, mapping, and local debug testing

## Why This App Exists

So far, this project has two jobs:

- Give you a practical DDJ-FLX6 visualizer you can run in a browser and mirror to another screen or OBS-style browser source
- Move the app from older raw target handling toward a cleaner controller architecture with canonical control names, shared state, and profile-driven behavior

In plain English: the app already works as a visualizer, and it is also being used to build a better controller system without breaking the current app.

## Current Features

- Official browser entrypoints: `host.html`, `viewer.html`, and `index.html` as a small redirect/launcher
- Browser WebMIDI host flow through `src/midi.js`
- WebSocket relay with rooms, reconnect logic, presence, and room map sync
- Board rendering from `assets/board.svg`
- Official FLX6 controller profile with aliases, input mappings, output bindings, and script hooks
- Learned mapping storage and room sync as provisional draft metadata only
- Room map persistence on the server in `data/room_maps.json` as draft metadata only
- Host tools: recorder, diagnostics overlay, mapping wizard, local debug helper, and a few older helper panels still in the repo
- New controller-layer modules under `src/controllers/`
- Shared canonical control vocabulary
- Shared raw-to-normalized input pipeline
- Shared `DeviceAdapter` contract and working `WebMidiAdapter`
- Canonical-first board rendering behavior
- Shared `ControllerState` object for controller-owned runtime state
- First MIDI output / LED message support for a small set of FLX6 transport LEDs

## How To Run The App

### Requirements

- Node.js 18 or newer
- A browser that supports WebMIDI for the host page
- A WebSocket-capable local network/browser setup

The supported host path today is the browser WebMIDI path. The older Node MIDI/HID bridge files are legacy developer diagnostics and are not loaded during normal startup unless explicitly enabled.

### Install And Start

```bash
npm install
npm start
```

Default local ports:

- HTTP: `http://localhost:8080`
- WebSocket: `ws://localhost:8787`

Official local URLs:

- Host: `http://localhost:8080/host.html?ws=ws://localhost:8787`
- Viewer: `http://localhost:8080/viewer.html?ws=ws://localhost:8787`

If you want HTTP and WebSocket on the same port, use:

```bash
SINGLE_PORT=1 npm start
```

Single-port URLs:

- Host: `http://localhost:8080/host.html?ws=ws://localhost:8080`
- Viewer: `http://localhost:8080/viewer.html?ws=ws://localhost:8080`

Developer diagnostic commands:

```bash
npm run dev:list-midi
npm run dev:list-hid
```

## How To Use The App Step By Step

### Basic Host Setup

1. Plug in the DDJ-FLX6.
2. Start the app with `npm start`.
3. Open the host page:

```text
http://localhost:8080/host.html?ws=ws://localhost:8787
```

4. If the browser asks for MIDI permission, allow it.
5. Look at the top-right status text on the host page.
6. Make sure `WS:` shows a connected state.
7. Make sure `MIDI:` moves to something useful like `requesting`, `ready`, or `listening:<device name>`.
8. Move a fader, jog wheel, or button on the controller.
9. The board should react on the host page.

### Open A Viewer

1. Open the viewer page in another tab, browser window, or machine:

```text
http://localhost:8080/viewer.html?ws=ws://localhost:8787
```

2. Move a control on the host controller again.
3. The viewer should match the host board.

### Put Host And Viewer In The Same Room

Use the same `room` value on both URLs:

- Host: `http://localhost:8080/host.html?ws=ws://localhost:8787&room=studio-a`
- Viewer: `http://localhost:8080/viewer.html?ws=ws://localhost:8787&room=studio-a`

### Choose A Specific MIDI Device Name

If needed, add `midi` to the host URL:

```text
http://localhost:8080/host.html?ws=ws://localhost:8787&room=studio-a&midi=DDJ-FLX6
```

### Use The Host Tools

- `Rec`, `Stop`, `Play`, `Save`, and `Load` let you record and replay incoming controller events
- The mapping wizard can capture raw controls and save learned board mappings
- The diagnostics overlay can show the incoming event stream and resolved targets
- A few older helper panels are still available in the host page, but the mapping wizard is the clearest current learn/mapping UI

## How To Test The App

### Automated Tests

Run the current focused test suite with:

```bash
npm test
```

That currently runs the same suite as:

```bash
npm run test:unit
```

Run only the room-join integration coverage with:

```bash
npm run test:room-join
```

Equivalent direct command:

```bash
node --test tests/server-room-join.test.js
```

### Manual Test With Real Hardware

1. Start the server with `npm start`.
2. Open `host.html`.
3. Open `viewer.html` in the same room.
4. Move the crossfader and confirm it renders.
5. Move channel faders 1 through 4 and confirm they render.
6. Move the left and right tempo faders and confirm they render.
7. Move the left and right jog wheels and confirm they render.
8. Press the left and right play buttons and confirm they render.
9. Press the left and right cue buttons and confirm they render.
10. Reload the viewer and confirm it receives the current room map again.

### Manual Test Without Hardware

On a local host like `localhost`, the app exposes a debug helper on the host page. After the host page is open, run this in the browser console:

```js
window.__FLX_DEBUG__.pulseVisibleControl()
```

That helper sends a visible test event through the same host -> WebSocket -> viewer path used by the live app.

## Controller Architecture Overview

The newer controller system lives in `src/controllers/`. It is partly integrated today and is the main place for controller work going forward.

### Main Pieces

- `src/controllers/core/`
  Shared contracts, alias helpers, canonical vocabulary, normalization helpers, controller state, and hook runtime
- `src/controllers/adapters/`
  Shared adapter boundary plus the working browser `WebMidiAdapter`
- `src/controllers/profiles/`
  The DDJ-FLX6 profile definition, aliases, input mappings, output bindings, and script hooks
- `src/controllers/learn/`
  Learn-session helpers that capture input and build draft canonical mappings
- `src/controllers/output/`
  Shared output message shapes for LEDs and later hardware feedback

### Raw Vs Normalized Input Pipeline

The live FLX6 input path now follows this shape:

1. WebMIDI receives raw MIDI bytes.
2. `src/controllers/adapters/web-midi.js` decodes them into `RawInputEvent` objects.
3. The FLX6 profile maps those raw events into `NormalizedInputEvent` objects.
4. Normalized events carry canonical fields like `canonicalTarget`, `mappingId`, `context`, and `mapped`.
5. The host relays those normalized controller events over WebSocket.
6. The board renderer prefers canonical controller meaning first, then falls back to raw map lookup if needed.

This is the key transition in the repo right now: newer canonical controller meaning is already being used without forcing a full renderer rewrite.

### Canonical Control Vocabulary

The shared vocabulary in `src/controllers/core/vocabulary.js` currently exports 191 canonical control descriptors.

Examples:

- `mixer.crossfader`
- `mixer.channel.1.fader`
- `deck.left.tempo.fader`
- `deck.right.jog.motion`
- `deck.left.transport.play`

These names are meant to be the app's stable internal language, even if raw MIDI addresses or old SVG target ids change later.

### Shared Controller State

`ControllerState` lives in `src/controllers/core/state.js`.

It already tracks shared runtime state such as:

- Deck layer buckets
- Jog touch state
- Paired coarse/fine values for controls like the FLX6 tempo faders
- Temporary session data used by controller hooks

The state model also has room for shift and pad mode behavior as more live mappings move into the profile layer.

### Controller Script Hooks

The FLX6 profile exposes hook slots for:

- `init`
- `input`
- `output`
- `shutdown`
- `keepalive`
- `learn`

The input, output, init, and shutdown surfaces are real and tested. The keepalive and learn hook slots exist, but the FLX6 implementations are still placeholders and are not fully wired into the live host workflow yet.

## Current Controller Support

### Official Profile Today

- Profile: `pioneer-ddj-flx6`
- Transport: browser WebMIDI
- Working adapter: `createWebMidiAdapter()`

### FLX6 Profile Coverage Right Now

The FLX6 profile currently ships with:

- 42 input mapping entries
- 8 output binding entries
- A large alias map that helps bridge older raw names to canonical control ids

The current normalized input bindings cover these live FLX6 areas:

- Crossfader
- Channel faders 1 through 4
- Left and right tempo faders
- Left and right jog motion
- Left and right jog touch
- Left and right play buttons for main and alternate deck layers
- Left and right cue buttons for main and alternate deck layers

Controls outside that list may still work in the older raw-map path, but they are not all part of the new normalized FLX6 profile yet.

## MIDI Output / LED Support

The repo now has the first real controller-output path in the new controller layer.

What exists today:

- Canonical output requests can be resolved through the FLX6 profile
- `WebMidiAdapter.send()` can turn those requests into real MIDI output bytes
- The FLX6 profile currently includes LED bindings for:
- Left and right `play`
- Left and right `cue`
- Both main and alternate deck layers

What is still limited:

- This is not full-board LED support yet
- The main app does not yet drive a full automatic LED feedback loop from overall app state
- Output coverage is still small and focused on the first transport LEDs

## Learn Mode

There are two different learn-related paths in this repo today.

### 1. Existing Host Mapping Wizard

This is the live UI path already available on the host page.

It can:

- Listen for the next MIDI event
- Save raw learned mappings to local storage
- Import and export learned mapping JSON
- Link multiple raw keys to the same board target across modes
- Push learned room maps over WebSocket so viewers can stay in sync

This path is useful today, but it still works in the older raw mapping style. It maps controller events to board target ids, not to the newer canonical controller vocabulary.

### 2. New Controller-Layer Learn Session

This lives in `src/controllers/learn/session.js`.

It can:

- Capture raw and normalized events
- Suggest likely canonical targets
- Search the canonical vocabulary
- Build draft canonical mappings without mutating the live profile

This path is real code and has automated tests, but it is not yet the main host UI workflow.

### Current Learn-Mode Reality

- Learn-related work is definitely present
- The older mapping wizard is the live path users can use now
- The newer canonical learn flow is a foundation layer and is not fully wired into the FLX6 runtime hooks yet

## Project Status

The app is usable today as a DDJ-FLX6 browser visualizer with host/viewer sync.

The controller system is in a middle stage:

- Some important architecture work is already real, integrated, and tested
- The full app still has older runtime pieces beside the new controller layer
- The new controller layer has not replaced every legacy path yet

That means the project is beyond scaffolding, but it is not finished.

## Known Limitations

- The host page needs a browser environment with WebMIDI support
- The official runtime is still centered on browser WebMIDI, not a fully migrated controller runtime
- Only one modern controller profile is in place right now: the DDJ-FLX6
- The FLX6 profile does not yet cover every control on the board
- Viewer pages do not open MIDI directly
- LED output support is still narrow
- Learn mode is split between the older raw mapping UI and the newer canonical draft flow
- Some top-level controller entry files still use placeholder wording even though deeper controller modules are already real

## Coming Soon / Next Steps

- Expand FLX6 normalized mappings to more controls and pad-related behavior
- Wire the canonical learn flow into the live host experience
- Grow MIDI output coverage beyond the first play/cue LEDs
- Feed richer app state into the controller output path for real live feedback
- Continue moving runtime logic from older raw paths into the shared controller layer
- Add more integration-style tests around host boot, reconnects, and controller output
- Document a tested browser and hardware matrix

## Developer Notes

If you are working on the current architecture, these files matter most:

- `src/midi.js`
- `src/controllers/adapters/web-midi.js`
- `src/controllers/core/normalization.js`
- `src/controllers/core/state.js`
- `src/controllers/core/hooks.js`
- `src/controllers/profiles/ddj-flx6.js`
- `src/controllers/profiles/ddj-flx6.mappings.js`
- `src/controllers/profiles/ddj-flx6.outputs.js`
- `src/controllers/profiles/ddj-flx6.script.js`
- `src/board.js`
- `src/ws.js`
- `src/bootstrap-host.js`
- `src/bootstrap-viewer.js`
- `server/server.js`

One important caution: the repo still has some older and experimental paths. The official runtime described in this README is:

- `host.html`
- `viewer.html`
- `index.html` only as a launcher/redirect into those pages
- `src/midi.js`
- `src/controllers/`
- `src/bootstrap-host.js`
- `src/bootstrap-viewer.js`
- `src/ws.js`
- `src/controllers/profiles/ddj-flx6.js`

Other files in the repo can still be useful, but they are not the main path this README is describing.
