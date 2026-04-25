import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionReplayLibrary,
  SESSION_REPLAY_RECORD_SCHEMA,
} from '../src/session-replay-library.js';
import {
  RECORDER_LOG_SCHEMA,
  RECORDER_LOG_VERSION,
  RECORDER_METADATA_SCHEMA,
  RECORDER_REPLAY_SCHEMA,
} from '../src/recorder/schema.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
  };
}

function createReplayPayload() {
  return {
    version: RECORDER_LOG_VERSION,
    schema: RECORDER_LOG_SCHEMA,
    metadata: {
      schema: RECORDER_METADATA_SCHEMA,
      appName: 'Sets In Context DDJ-FLX6 Runtime',
      createdAt: '2026-04-25T12:00:00.000Z',
      recorder: {
        schema: RECORDER_LOG_SCHEMA,
        version: RECORDER_LOG_VERSION,
      },
      durationMs: 250,
      eventCount: 1,
      session: {
        room: 'alpha',
        title: 'Warmup',
        hostName: 'Rafa',
      },
    },
    capture: {
      replaySchema: RECORDER_REPLAY_SCHEMA,
    },
    speed: 1,
    durationMs: 250,
    eventCount: 1,
    events: [
      {
        timing: {
          order: 1,
          relativeMs: 250,
          capturedAtMs: 260,
          sourceTimestampMs: 10,
        },
        replay: {
          schema: RECORDER_REPLAY_SCHEMA,
          info: {
            type: 'cc',
            ch: 1,
            controller: 19,
            value: 64,
            d1: 19,
            d2: 64,
          },
        },
        event: {
          schema: 'flx-recorded-event/v1',
          summary: 'Filter changed',
        },
      },
    ],
  };
}

test('session replay library saves, lists, loads, and deletes local replay records', () => {
  const storage = createMemoryStorage();
  const library = createSessionReplayLibrary({ storage });

  const saved = library.saveReplay({
    name: 'Filter practice',
    payload: createReplayPayload(),
  });

  assert.equal(saved.recordSchema, SESSION_REPLAY_RECORD_SCHEMA);
  assert.equal(saved.name, 'Filter practice');
  assert.equal(saved.durationMs, 250);
  assert.equal(saved.eventCount, 1);
  assert.equal(saved.room, 'alpha');
  assert.equal(saved.title, 'Warmup');
  assert.equal(saved.hostName, 'Rafa');
  assert.equal(saved.schema, RECORDER_LOG_SCHEMA);
  assert.equal(saved.version, RECORDER_LOG_VERSION);
  assert.equal(saved.payload.events.length, 1);

  const list = library.listReplays();
  assert.equal(list.length, 1);
  assert.equal(list[0].replayId, saved.replayId);
  assert.equal(list[0].name, 'Filter practice');
  assert.equal(list[0].payload, undefined);

  const loaded = library.loadReplay(saved.replayId);
  assert.equal(loaded.replayId, saved.replayId);
  assert.equal(loaded.payload.schema, RECORDER_LOG_SCHEMA);
  assert.equal(loaded.payload.metadata.schema, RECORDER_METADATA_SCHEMA);

  assert.equal(library.deleteReplay(saved.replayId), true);
  assert.equal(library.loadReplay(saved.replayId), null);
  assert.deepEqual(library.listReplays(), []);
});
