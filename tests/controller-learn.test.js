import test from 'node:test';
import assert from 'node:assert/strict';

import { createRawInputEvent, normalizeRawInputEvent } from '../src/controllers/core/normalization.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';
import {
  armLearnSession,
  assignLearnCapture,
  captureLearnInput,
  createLearnInputHandler,
  createLearnSession,
  exportLearnDraft,
  searchCanonicalTargets,
  stopLearnSession,
} from '../src/controllers/learn/session.js';

function normalizeFlx6(details) {
  const raw = createRawInputEvent({
    transport: 'midi',
    profileId: flx6Profile.id,
    sourceId: 'DDJ-FLX6',
    deviceName: 'Pioneer DDJ-FLX6',
    timestamp: details.timestamp || 1,
    ...details,
  });

  const result = normalizeRawInputEvent(raw, {
    profile: flx6Profile,
    profileId: flx6Profile.id,
    sourceId: raw.sourceId,
    timestamp: raw.timestamp,
  });

  return {
    raw,
    normalized: result.events[0],
  };
}

test('createLearnSession builds a simple draft-oriented learn flow state', () => {
  const session = createLearnSession({
    profile: flx6Profile,
    mode: 'replace',
    now: 10,
  });

  assert.equal(session.profileId, flx6Profile.id);
  assert.equal(session.mode, 'replace');
  assert.equal(session.active, false);
  assert.equal(session.draft.kind, 'controller-learn-draft');
  assert.deepEqual(session.draft.mappings, []);
});

test('captureLearnInput stores raw input, normalized meaning, and likely candidates', () => {
  const session = createLearnSession({
    profile: flx6Profile,
    mode: 'multi',
    now: 20,
  });
  const event = normalizeFlx6({
    interaction: 'noteon',
    channel: 1,
    code: 11,
    value: 127,
    data1: 11,
    data2: 127,
    key: 'noteon:1:11',
    bytes: [0x90, 11, 127],
    timestamp: 21,
  });

  const capture = captureLearnInput(session, event.normalized, {
    profile: flx6Profile,
  });

  assert.equal(capture.signature.key, 'noteon:1:11');
  assert.equal(capture.mapped, true);
  assert.equal(capture.existingCanonicalTarget, 'deck.left.transport.play');
  assert.equal(capture.candidates[0].canonicalTarget, 'deck.left.transport.play');
  assert.equal(capture.candidates[0].source, 'normalized');
  assert.equal(session.lastCaptureId, capture.id);
});

test('assignLearnCapture writes a draft mapping artifact without mutating the live profile', () => {
  const session = createLearnSession({
    profile: flx6Profile,
    mode: 'replace',
    now: 30,
  });
  const event = normalizeFlx6({
    interaction: 'cc',
    channel: 1,
    code: 19,
    value: 64,
    data1: 19,
    data2: 64,
    key: 'cc:1:19',
    bytes: [0xB0, 19, 64],
    timestamp: 31,
  });

  const capture = captureLearnInput(session, event.normalized, {
    profile: flx6Profile,
  });

  const assignment = assignLearnCapture(session, {
    captureId: capture.id,
    canonicalTarget: 'mixer.channel.1.fader',
    note: 'Drafted from the first learn pass.',
    timestamp: 32,
  });

  assert.equal(assignment.canonicalTarget, 'mixer.channel.1.fader');
  assert.deepEqual(session.draft.mappings, [{
    id: 'draft.mixer.channel.1.fader.cc.1.19',
    raw: {
      transport: 'midi',
      kind: 'cc',
      channel: 1,
      code: 19,
      key: 'cc:1:19',
    },
    rawTarget: 'slider_ch1',
    canonical: 'mixer.channel.1.fader',
    context: undefined,
    valueShape: 'absolute',
    note: 'Drafted from the first learn pass.',
    learn: {
      captureId: capture.id,
      sourceKey: 'cc:1:19',
      assignedAt: 32,
      suggestedBy: 'normalized',
      existingMappingId: 'mixer.channel.1.fader.primary',
    },
  }]);

  const draft = exportLearnDraft(session);
  assert.equal(draft.kind, 'controller-learn-draft');
  assert.equal(draft.mappings.length, 1);
  assert.equal(flx6Profile.inputs.mappings.length > 0, true);
});

test('createLearnInputHandler fits the current learn-hook path and can auto-assign an armed target', () => {
  const session = createLearnSession({
    profile: flx6Profile,
    mode: 'single',
    now: 40,
  });
  const handler = createLearnInputHandler(session, {
    profile: flx6Profile,
  });
  const event = normalizeFlx6({
    interaction: 'noteon',
    channel: 2,
    code: 12,
    value: 127,
    data1: 12,
    data2: 127,
    key: 'noteon:2:12',
    bytes: [0x91, 12, 127],
    timestamp: 41,
  });

  armLearnSession(session, {
    targetId: 'deck.right.transport.cue',
    timestamp: 41,
  });
  const capture = handler(event.normalized);

  assert.equal(capture.existingCanonicalTarget, 'deck.right.transport.cue');
  assert.equal(session.draft.mappings.length, 1);
  assert.equal(session.draft.mappings[0].canonical, 'deck.right.transport.cue');
  assert.equal(session.active, false);

  stopLearnSession(session, 42);
  assert.equal(session.active, false);
});

test('searchCanonicalTargets helps choose a canonical target when suggestions are not enough', () => {
  const results = searchCanonicalTargets('play right', { limit: 5 });
  assert.equal(results[0].id, 'deck.right.transport.play');
});
