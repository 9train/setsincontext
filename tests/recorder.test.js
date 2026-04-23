import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInfoRenderPlan } from '../src/board.js';
import { buildDebuggerEventSnapshot } from '../src/event-log-snapshot.js';
import { createRecorder } from '../src/recorder.js';
import {
  RECORDER_EVENT_SCHEMA,
  RECORDER_LOG_SCHEMA,
  RECORDER_LOG_VERSION,
  RECORDER_REPLAY_SCHEMA,
} from '../src/recorder/schema.js';
import { createRawInputEvent, normalizeRawInputEvent } from '../src/controllers/core/normalization.js';
import { createControllerState } from '../src/controllers/core/state.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';
import { resolveFlx6InputEvent } from '../src/controllers/profiles/ddj-flx6.middle.js';

function createFlx6RawInput(overrides = {}) {
  const interaction = overrides.interaction || 'cc';
  const channel = overrides.channel != null ? overrides.channel : 1;
  const code = overrides.code != null ? overrides.code : 19;
  const value = overrides.value != null ? overrides.value : 64;
  const data1 = overrides.data1 != null ? overrides.data1 : code;
  const data2 = overrides.data2 != null ? overrides.data2 : value;

  return createRawInputEvent({
    transport: 'midi',
    profileId: flx6Profile.id,
    sourceId: 'Pioneer DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    interaction,
    channel,
    code,
    value,
    data1,
    data2,
    key: `${interaction}:${channel}:${code}`,
    timestamp: overrides.timestamp != null ? overrides.timestamp : 123,
    bytes: overrides.bytes || [0xB0, data1, data2],
  });
}

function resolveFromRaw(raw, state) {
  const normalized = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    controllerState: state,
  }).events[0];

  return resolveFlx6InputEvent({
    rawEvent: raw,
    inputEvent: normalized,
    controllerState: state,
    profile: flx6Profile,
  });
}

function attachBoardRender(event, overrides = {}) {
  const renderPlan = resolveInfoRenderPlan(event, []);
  return {
    ...event,
    _boardRender: {
      ...renderPlan,
      applied: renderPlan.targetId ? true : false,
      outcome: renderPlan.blocked ? 'blocked' : renderPlan.targetId ? 'updated' : 'absent',
      detail: renderPlan.blocked
        ? renderPlan.fallbackReason || renderPlan.source
        : renderPlan.targetId
          ? 'test-applied'
          : 'no-render-target',
      ...overrides,
    },
  };
}

function createResolvedPlayEvent() {
  const state = createControllerState({ profileId: flx6Profile.id });
  return resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 11,
    value: 127,
    data1: 11,
    data2: 127,
    key: 'noteon:1:11',
    bytes: [0x90, 11, 127],
  }), state);
}

test('recorder captures post-consume board resolution as structured log data', () => {
  const recorder = createRecorder();
  const originalWindow = globalThis.window;
  const consumed = [];

  globalThis.window = {
    consumeInfo(info) {
      consumed.push(info);
      Object.assign(info, attachBoardRender(info));
      return 'consumed';
    },
  };

  try {
    recorder.install();
    recorder.start();

    const result = globalThis.window.consumeInfo({ ...createResolvedPlayEvent() });
    const events = recorder.stop();

    assert.equal(result, 'consumed');
    assert.equal(consumed.length, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].seq, 1);
    assert.equal(events[0].sourceTimestamp, 123);
    assert.equal(events[0].timing.order, 1);
    assert.equal(events[0].timing.sourceTimestampMs, 123);
    assert.equal(events[0].info._boardRender.targetId, 'play_L');
    assert.equal(events[0].replayInfo._boardRender.targetId, 'play_L');
    assert.equal(events[0].logEvent.raw.key, 'noteon:1:11');
    assert.equal(events[0].logEvent.binding.id, 'deck.left.transport.play.main.press');
    assert.equal(events[0].logEvent.render.targetId, 'play_L');
    assert.equal(events[0].logEvent.render.authority, 'official-render');
    assert.equal(events[0].logEvent.resolution.mappingSource, 'official');
    assert.equal(events[0].event.schema, RECORDER_EVENT_SCHEMA);
    assert.equal(events[0].event.render.targetId, 'play_L');
    assert.equal(events[0].event.id, undefined);

    const exported = JSON.parse(recorder.exportJSON());
    assert.equal(exported.version, RECORDER_LOG_VERSION);
    assert.equal(exported.schema, RECORDER_LOG_SCHEMA);
    assert.equal(exported.capture.replaySchema, RECORDER_REPLAY_SCHEMA);
    assert.equal(exported.capture.eventSchema, RECORDER_EVENT_SCHEMA);
    assert.equal(exported.eventCount, 1);
    assert.equal(exported.events[0].timing.order, 1);
    assert.equal(exported.events[0].timing.sourceTimestampMs, 123);
    assert.equal(exported.events[0].replay.schema, RECORDER_REPLAY_SCHEMA);
    assert.equal(exported.events[0].replay.info._boardRender.targetId, 'play_L');
    assert.equal(exported.events[0].event.render.targetId, 'play_L');
    assert.equal(exported.events[0].event.id, undefined);
  } finally {
    recorder.uninstall();
    globalThis.window = originalWindow;
  }
});

test('recorder loads legacy v1 recordings and rebuilds reusable log snapshots', () => {
  const recorder = createRecorder();
  const legacyEvent = attachBoardRender(createResolvedPlayEvent());

  recorder.loadFromObject({
    version: 1,
    speed: 1.5,
    events: [
      { t: 42, info: legacyEvent },
    ],
  });

  const [entry] = recorder.events;
  assert.equal(entry.t, 42);
  assert.equal(entry.seq, 1);
  assert.equal(entry.sourceTimestamp, 123);
  assert.equal(entry.timing.order, 1);
  assert.equal(entry.timing.relativeMs, 42);
  assert.equal(entry.info._boardRender.targetId, 'play_L');
  assert.equal(entry.logEvent.render.targetId, 'play_L');
  assert.equal(entry.logEvent.semantic.meaningLabel, 'Transport Play');
  assert.equal(entry.event.render.targetId, 'play_L');
  assert.equal(entry.event.id, undefined);
});

test('recorder preserves stored v2 log snapshots during load and replay-oriented subsets', () => {
  const recorder = createRecorder();
  const legacyEvent = attachBoardRender(createResolvedPlayEvent());
  const baseLogEvent = buildDebuggerEventSnapshot(legacyEvent);
  const storedLogEvent = {
    ...baseLogEvent,
    summary: 'Stored playback snapshot',
    recentSummary: 'Stored playback snapshot -> play_L',
    render: {
      ...baseLogEvent.render,
      detail: 'stored-detail',
    },
  };

  recorder.loadFromObject({
    version: 2,
    schema: 'flx-recorder-log/v2',
    speed: 1,
    events: [
      {
        t: 42,
        seq: 7,
        capturedAt: 420,
        sourceTimestamp: 999,
        info: legacyEvent,
        logEvent: storedLogEvent,
      },
    ],
  });

  const [entry] = recorder.events;
  assert.equal(entry.t, 42);
  assert.equal(entry.seq, 7);
  assert.equal(entry.capturedAt, 420);
  assert.equal(entry.sourceTimestamp, 999);
  assert.equal(entry.logEvent.summary, 'Stored playback snapshot');
  assert.equal(entry.logEvent.recentSummary, 'Stored playback snapshot -> play_L');
  assert.equal(entry.logEvent.render.detail, 'stored-detail');
  assert.equal(entry.logEvent.render.targetId, 'play_L');
  assert.equal(entry.event.render.detail, 'stored-detail');
  assert.equal(entry.event.schema, RECORDER_EVENT_SCHEMA);
  assert.equal(entry.event.id, undefined);
});

test('recorder loads v3 recordings with explicit timing, replay payload, and structured events', () => {
  const recorder = createRecorder();
  const legacyEvent = attachBoardRender(createResolvedPlayEvent());
  const storedEvent = {
    ...buildDebuggerEventSnapshot(legacyEvent),
    summary: 'Structured recorder event',
  };
  delete storedEvent.id;

  recorder.loadFromObject({
    version: RECORDER_LOG_VERSION,
    schema: RECORDER_LOG_SCHEMA,
    capture: {
      replaySchema: RECORDER_REPLAY_SCHEMA,
      eventSchema: RECORDER_EVENT_SCHEMA,
    },
    speed: 0.75,
    events: [
      {
        timing: {
          order: 3,
          relativeMs: 55,
          capturedAtMs: 155,
          sourceTimestampMs: 888,
        },
        replay: {
          schema: RECORDER_REPLAY_SCHEMA,
          info: legacyEvent,
        },
        event: {
          ...storedEvent,
          schema: RECORDER_EVENT_SCHEMA,
        },
      },
    ],
  });

  const [entry] = recorder.events;
  assert.equal(entry.seq, 3);
  assert.equal(entry.t, 55);
  assert.equal(entry.capturedAt, 155);
  assert.equal(entry.sourceTimestamp, 888);
  assert.equal(entry.replayInfo._boardRender.targetId, 'play_L');
  assert.equal(entry.event.schema, RECORDER_EVENT_SCHEMA);
  assert.equal(entry.event.summary, 'Structured recorder event');
  assert.equal(entry.event.render.targetId, 'play_L');
  assert.equal(entry.event.id, undefined);
  assert.equal(entry.logEvent.summary, 'Structured recorder event');
});
