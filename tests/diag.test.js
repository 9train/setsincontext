import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInfoRenderPlan } from '../src/board.js';
import { createRawInputEvent, normalizeRawInputEvent } from '../src/controllers/core/normalization.js';
import { createControllerState } from '../src/controllers/core/state.js';
import { flx6Profile } from '../src/controllers/profiles/ddj-flx6.js';
import {
  buildBasicInspectionPresentationModel,
  buildBasicLatestPresentationModel,
} from '../src/diag/basic.js';
import {
  buildDebuggerSessionPresentationModel,
  buildInspectionPresentationModel,
} from '../src/diag/inspection-presentation.js';
import { UNKNOWN_CONTROL_EXPLANATION } from '../src/diag/control-explanations.js';
import { resolveFlx6InputEvent } from '../src/controllers/profiles/ddj-flx6.middle.js';
import {
  buildDebuggerBoardInspectionSnapshot,
  resolveDebuggerFocusState,
} from '../src/diag.js';
import { buildDebuggerEventSnapshot } from '../src/event-log-snapshot.js';

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

function findRow(snapshot, label) {
  return snapshot.controllerStateRows.find((row) => row.label === label) || null;
}

function findHardwareTruthRow(snapshot, label) {
  return snapshot.hardwareTruthMatrix.rows.find((row) => row.label === label) || null;
}

function findPresentationRow(presentation, label) {
  for (const section of presentation.sections || []) {
    const row = (section.rows || []).find((entry) => entry.label === label);
    if (row) return row;
  }
  return null;
}

test('debugger snapshot exposes the official FLX6 truth chain for a sampler pad trigger', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 12,
    code: 52,
    value: 127,
    data1: 52,
    data2: 127,
    key: 'noteon:12:52',
    bytes: [0x9B, 52, 127],
  }), state);

  const snapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved), {
    runtimeStatus: {
      wsStatus: 'connected',
      relayRuntime: { role: 'host', room: 'debug-room' },
      recorderStatus: {
        available: true,
        installed: true,
        state: 'recording',
        eventCount: 2,
        logSchema: 'flx-recorder-log/v3',
      },
    },
  });
  const padModeRow = findRow(snapshot, 'Pad Mode (Left)');

  assert.equal(snapshot.raw.statusByteHex, '0x9B');
  assert.equal(snapshot.raw.channel, 12);
  assert.equal(snapshot.raw.data1, 52);
  assert.equal(snapshot.raw.data2, 127);
  assert.equal(snapshot.device.name, 'Pioneer DDJ-FLX6');
  assert.equal(snapshot.device.profileId, flx6Profile.id);
  assert.equal(snapshot.binding.status, 'official');
  assert.equal(snapshot.binding.id, 'deck.left.pad.5.alternate.sampler.press');
  assert.match(snapshot.normalized.controlLabel, /Sampler/i);
  assert.equal(snapshot.normalized.canonicalTarget, 'deck.left.pad.5');
  assert.match(snapshot.resolution.pathSummary, /official binding deck\.left\.pad\.5\.alternate\.sampler\.press/);
  assert.equal(snapshot.resolution.mappingSource, 'official');
  assert.equal(snapshot.semantic.meaningLabel, 'Sampler Pad 5 Trigger');
  assert.equal(snapshot.semantic.truthStatus, 'official');
  assert.equal(snapshot.render.targetId, 'pad_L_5');
  assert.equal(snapshot.render.authority, 'official-render');
  assert.equal(snapshot.render.ownership, 'official');
  assert.equal(snapshot.render.boardUpdated, 'yes');
  assert.equal(snapshot.authority.resolutionOwner, 'official');
  assert.equal(snapshot.debugTransaction.mapping.officialId, 'deck.left.pad.5.alternate.sampler.press');
  assert.equal(snapshot.debugTransaction.mapping.canonicalTarget, 'deck.left.pad.5');
  assert.match(snapshot.debugTransaction.context.summary, /surface Left/i);
  assert.match(snapshot.debugTransaction.context.stateSummary, /Pad Mode \(Left\): Sampler/);
  assert.equal(snapshot.debugTransaction.board.targetId, 'pad_L_5');
  assert.equal(snapshot.debugTransaction.renderResult.outcome, 'updated');
  assert.equal(snapshot.debugTransaction.mappingAuthority.owner, 'official');
  assert.equal(snapshot.debugTransaction.relay.role, 'host');
  assert.equal(snapshot.debugTransaction.relay.status, 'connected');
  assert.equal(snapshot.debugTransaction.recorder.state, 'recording');
  assert.ok(padModeRow);
  assert.equal(padModeRow.before, 'unknown');
  assert.equal(padModeRow.after, 'Sampler');
  assert.equal(padModeRow.status, 'official');
});

test('debugger snapshot keeps a blocked official render distinct from the official semantic path', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 7,
    code: 100,
    value: 65,
    data1: 100,
    data2: 65,
    key: 'cc:7:100',
    bytes: [0xB6, 100, 65],
  }), state);

  const snapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved, {
    applied: false,
    outcome: 'blocked',
    detail: 'no-official-render-target',
  }));

  assert.equal(snapshot.semantic.meaningLabel, 'Shifted Browser Scroll');
  assert.equal(snapshot.semantic.truthStatus, 'official');
  assert.equal(snapshot.binding.status, 'official');
  assert.equal(snapshot.render.targetId, null);
  assert.equal(snapshot.render.authority, 'official-missing');
  assert.equal(snapshot.render.ownership, 'official');
  assert.equal(snapshot.render.truthStatus, 'blocked');
  assert.equal(snapshot.render.boardUpdated, 'no');
  assert.equal(snapshot.render.outcome, 'blocked');
  assert.equal(snapshot.authority.resolutionOwner, 'official');
});

test('debugger snapshot shows inferred controller truth instead of overstating it as official', () => {
  const state = createControllerState({ profileId: flx6Profile.id });

  resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 1,
    code: 34,
    value: 65,
    data1: 34,
    data2: 65,
    key: 'cc:1:34',
    bytes: [0xB0, 34, 65],
  }), state);

  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 23,
    value: 127,
    data1: 23,
    data2: 127,
    key: 'noteon:1:23',
    bytes: [0x90, 23, 127],
  }), state);

  const snapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved));
  const vinylModeRow = findRow(snapshot, 'Vinyl Mode (Left)');
  const vinylButtonRow = findRow(snapshot, 'Vinyl Button (Left)');

  assert.ok(vinylModeRow);
  assert.equal(vinylModeRow.status, 'inferred');
  assert.equal(vinylModeRow.after, 'Off');
  assert.ok(vinylButtonRow);
  assert.equal(vinylButtonRow.status, 'official');
  assert.equal(vinylButtonRow.after, 'On');
  assert.equal(snapshot.render.targetId, 'jogcut_L');
  assert.equal(snapshot.authority.truthStatus, 'official');
  assert.equal(snapshot.render.ownership, 'official');
  assert.equal(snapshot.authority.resolutionOwner, 'official');
});

test('debugger snapshot builds a focused hardware truth matrix for jog calibration mismatches', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'cc',
    channel: 1,
    code: 33,
    value: 65,
    data1: 33,
    data2: 65,
    key: 'cc:1:33',
    bytes: [0xB0, 33, 65],
  }), state);

  const snapshot = buildDebuggerEventSnapshot(attachBoardRender({
    ...resolved,
    _jogRuntimeDiagnostic: {
      side: 'L',
      sideKey: 'left',
      lane: 'wheel_side',
      effectiveLane: 'wheel_side',
      delta: 1,
      authoritative: false,
      eventKind: 'motion_cc',
      calibration: {
        active: true,
        action: 'ignored',
        pageRole: 'host',
        pagePath: '/host.html',
        selectedSide: 'L',
        selectedMode: 'normal',
        selectedSurface: 'top_touch',
        observedMode: 'normal',
        observedSurface: 'side',
        expectedMotion: 'platter CC 34/35/41',
        recorded: false,
        ignored: true,
        waiting: false,
        reason: 'Top-touch calibration was selected, but side-wheel CC motion was received. Calibration is waiting for platter CC 34/35/41.',
      },
    },
  }));

  const jogRow = findHardwareTruthRow(snapshot, 'Jog Lane');
  const whyRow = findHardwareTruthRow(snapshot, 'Why');

  assert.equal(snapshot.hardwareTruthMatrix.raw.kind, 'cc');
  assert.equal(snapshot.hardwareTruthMatrix.raw.channel, 1);
  assert.equal(snapshot.hardwareTruthMatrix.raw.code, 33);
  assert.equal(snapshot.hardwareTruthMatrix.raw.value, 65);
  assert.equal(snapshot.hardwareTruthMatrix.mapping.id, 'deck.left.jog.motion.primary');
  assert.equal(snapshot.hardwareTruthMatrix.mapping.canonicalTarget, 'deck.left.jog.motion');
  assert.equal(snapshot.hardwareTruthMatrix.context.side, 'Left');
  assert.equal(snapshot.hardwareTruthMatrix.jog.rawLane, 'wheel_side');
  assert.equal(snapshot.hardwareTruthMatrix.jog.effectiveLane, 'wheel_side');
  assert.equal(snapshot.hardwareTruthMatrix.render.targetId, 'jog_L');
  assert.equal(snapshot.hardwareTruthMatrix.render.authority, snapshot.render.authority);
  assert.equal(snapshot.hardwareTruthMatrix.render.source, snapshot.render.source);
  assert.equal(snapshot.hardwareTruthMatrix.status, 'blocked');
  assert.equal(
    snapshot.hardwareTruthMatrix.reason,
    'Top-touch calibration was selected, but side-wheel CC motion was received. Calibration is waiting for platter CC 34/35/41.',
  );
  assert.ok(jogRow);
  assert.match(jogRow.value, /Wheel Side/i);
  assert.match(jogRow.note, /selected Left \| Normal \| Top Touch/i);
  assert.match(jogRow.note, /expected platter CC 34\/35\/41/i);
  assert.ok(whyRow);
  assert.match(whyRow.value, /side-wheel CC motion was received/i);
});

test('debugger snapshot labels draft compatibility render ownership explicitly', () => {
  const renderPlan = resolveInfoRenderPlan(
    { type: 'noteon', ch: 1, d1: 11, d2: 127, value: 127 },
    [{ key: 'noteon:1:11', target: 'play_L', ownership: 'draft' }],
    { allowLegacyMapFallback: true },
  );

  const snapshot = buildDebuggerEventSnapshot({
    type: 'noteon',
    ch: 1,
    d1: 11,
    d2: 127,
    value: 127,
    _boardRender: {
      ...renderPlan,
      applied: true,
      outcome: 'updated',
      detail: 'test-applied',
    },
  });

  assert.equal(snapshot.render.authority, 'compatibility-raw');
  assert.equal(snapshot.render.ownership, 'draft');
  assert.equal(snapshot.authority.resolutionOwner, 'draft');
  assert.equal(snapshot.resolution.mappingSource, 'draft');
  assert.match(snapshot.resolution.ownerSummary, /draft\/learned compatibility mapping/i);
  assert.match(snapshot.resolution.pathSummary, /board compatibility play_L/);
  assert.equal(snapshot.debugTransaction.mapping.officialId, null);
  assert.equal(snapshot.debugTransaction.mappingAuthority.owner, 'draft');
});

test('diagnostics surface draft candidates without making unknown raw events authoritative', () => {
  const mapEntries = [{
    key: 'noteon:1:77',
    target: 'play_L',
    ownership: 'draft',
    canonicalTarget: 'deck.left.transport.play',
    type: 'noteon',
    ch: 1,
    code: 77,
    name: 'Draft Play Candidate',
  }];
  const rawEvent = {
    type: 'noteon',
    ch: 1,
    d1: 77,
    d2: 127,
    value: 127,
    __flxDebug: true,
    __flxDebugSource: 'fallback-map-review',
  };
  const renderPlan = resolveInfoRenderPlan(rawEvent, mapEntries);
  const snapshot = buildDebuggerEventSnapshot({
    ...rawEvent,
    _boardRender: {
      ...renderPlan,
      applied: false,
      outcome: 'absent',
      detail: 'no-render-target',
    },
  });
  const inspection = buildDebuggerBoardInspectionSnapshot('play_L', {
    mapEntries,
    recentSnapshots: [snapshot],
    preferredSnapshot: snapshot,
  });

  assert.equal(snapshot.render.targetId, null);
  assert.equal(snapshot.render.authority, 'unmapped');
  assert.equal(snapshot.render.ownership, 'unknown');
  assert.equal(snapshot.render.boardUpdated, 'no');
  assert.equal(snapshot.authority.resolutionOwner, 'unknown');
  assert.equal(inspection.officialSource.status, 'official');
  assert.equal(inspection.compatibilityMappings.length, 1);
  assert.equal(inspection.compatibilityMappings[0].ownership, 'draft');
  assert.equal(inspection.compatibilityMappings[0].reviewState, 'blocked');
  assert.equal(inspection.mappingReview.authoritativeOwner, 'official');
  assert.equal(inspection.relatedEvent, null);
});

test('board inspection links a control back to official truth, separate draft mappings, and recent event context', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 11,
    value: 127,
    data1: 11,
    data2: 127,
    key: 'noteon:1:11',
    bytes: [0x90, 11, 127],
  }), state);
  const eventSnapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved));

  const inspection = buildDebuggerBoardInspectionSnapshot('play_L', {
    mapEntries: [{
      key: 'noteon:1:11',
      target: 'play_L',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 11,
      name: 'Draft Play',
    }],
    recentSnapshots: [eventSnapshot],
    preferredSnapshot: eventSnapshot,
  });

  assert.equal(inspection.targetId, 'play_L');
  assert.equal(inspection.officialSource.status, 'official');
  assert.equal(inspection.compatibilityMappings.length, 1);
  assert.equal(inspection.compatibilityMappings[0].ownership, 'draft');
  assert.equal(inspection.compatibilityMappings[0].reviewStatus, 'shadowing-official');
  assert.equal(inspection.compatibilityMappings[0].reviewState, 'blocked');
  assert.equal(inspection.mappingReview.authoritativeOwner, 'official');
  assert.equal(inspection.mappingReview.reviewState, 'blocked');
  assert.equal(inspection.mappingReview.shadowingCount, 1);
  assert.match(inspection.mappingReview.provisionalSummary, /1 shadowing/);
  assert.match(inspection.mappingReview.explicitReviewSummary, /1 blocked/);
  assert.equal(inspection.relatedEvent.rawKey, 'noteon:1:11');
  assert.equal(inspection.relatedEvent.mappingSource, 'official');
  assert.match(inspection.relatedEvent.summary, /Play/i);
  assert.match(inspection.relatedEvent.pathSummary, /official binding deck\.left\.transport\.play/);
});

test('debugger focus state keeps the live truth card on the newest event while pinned review stays on its selected anchor', () => {
  const latestSnapshot = Object.freeze({
    id: 2,
    render: Object.freeze({ targetId: 'cue_L' }),
    binding: Object.freeze({ rawTarget: 'cue_L', id: 'deck.left.transport.cue.main.press' }),
    normalized: Object.freeze({ mappingId: 'deck.left.transport.cue.main.press' }),
    semantic: Object.freeze({ canonicalTarget: 'deck.left.transport.cue' }),
  });
  const pinnedSnapshot = Object.freeze({
    id: 1,
    render: Object.freeze({ targetId: 'play_L' }),
    binding: Object.freeze({ rawTarget: 'play_L', id: 'deck.left.transport.play.main.press' }),
    normalized: Object.freeze({ mappingId: 'deck.left.transport.play.main.press' }),
    semantic: Object.freeze({ canonicalTarget: 'deck.left.transport.play' }),
  });

  const focus = resolveDebuggerFocusState({
    recentSnapshots: [latestSnapshot, pinnedSnapshot],
    inspectionPinned: true,
    selectedReviewSnapshotId: 1,
  });

  assert.equal(focus.latestSnapshot.id, 2);
  assert.equal(focus.inspectionSnapshot.id, 1);
  assert.equal(focus.inspectionTargetId, 'play_L');
});

test('inspection presentation organizes surface review around live-vs-pinned context, authority, mappings, blockers, and safe next steps', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 11,
    value: 127,
    data1: 11,
    data2: 127,
    key: 'noteon:1:11',
    bytes: [0x90, 11, 127],
  }), state);
  const eventSnapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved));

  const inspection = buildDebuggerBoardInspectionSnapshot('play_L', {
    mapEntries: [{
      key: 'noteon:1:11',
      target: 'play_L',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 11,
      name: 'Draft Play',
    }],
    recentSnapshots: [eventSnapshot],
    preferredSnapshot: eventSnapshot,
  });
  const presentation = buildInspectionPresentationModel(inspection, {
    inspectionPinned: true,
    inspectionPinSource: 'recent-event',
  });

  assert.equal(presentation.title, 'Pinned Surface Review');
  assert.deepEqual(
    presentation.sections.map((section) => section.title),
    ['Inspection Context', 'Target Identity', 'Current Authority', 'Current Mappings', 'Review State', 'Safe Next Step', 'Live Event Link'],
  );
  assert.deepEqual(
    presentation.badges.map((badge) => badge.label),
    ['official truth', 'Promotion Blocked', 'draft 1', 'pinned review'],
  );
  assert.equal(presentation.sections[0].rows[0].value, 'Pinned selected-surface review');
  assert.match(presentation.sections[0].rows[1].note, /Linked live event:/i);
  assert.equal(presentation.sections[3].rows[0].label, 'Authoritative');
  assert.match(presentation.sections[3].rows[1].value, /noteon:1:11 -> deck\.left\.transport\.play/);
  assert.equal(presentation.sections[4].rows[0].value, 'Promotion Blocked');
  assert.match(presentation.sections[4].rows[1].value, /Resolve why this draft shadows/i);
  assert.equal(presentation.sections[5].rows[0].label, 'Now');
  assert.match(presentation.sections[5].rows[0].value, /official FLX6 owner as the active truth/i);
  assert.match(presentation.sections[5].rows[1].value, /Resolve why this draft shadows/i);
});

test('debugger session presentation frames host readiness, active path, and pinned review without collapsing live truth into the pinned selection', () => {
  const latestSnapshot = Object.freeze({
    id: 2,
    summary: 'CC cc:1:12 -> Cue -> cue_L',
    recentSummary: 'Cue -> cue_L',
    raw: Object.freeze({ key: 'cc:1:12' }),
    device: Object.freeze({
      transport: 'midi',
      name: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
    }),
  });
  const pinnedSnapshot = Object.freeze({
    id: 1,
    summary: 'NOTEON noteon:1:11 -> Play -> play_L',
    recentSummary: 'Play -> play_L',
    raw: Object.freeze({ key: 'noteon:1:11' }),
    device: latestSnapshot.device,
  });

  const presentation = buildDebuggerSessionPresentationModel({
    wsStatus: 'connected',
    midiStatus: 'ready',
    controllerStatus: {
      midiStatus: 'ready',
      ready: false,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: null,
    },
    inspectionPinned: true,
    inspectionPinSource: 'recent-event',
    inspectionTargetId: 'play_L',
    latestSnapshot,
    inspectionSnapshot: pinnedSnapshot,
  });

  assert.equal(presentation.title, 'Live Debugger Context');
  assert.deepEqual(
    presentation.badges.map((badge) => badge.label),
    ['host connected', 'midi waiting', 'controller waiting', 'pinned review'],
  );
  assert.deepEqual(
    presentation.sections.map((section) => section.title),
    ['Host And Runtime', 'Inspection Flow'],
  );
  assert.equal(presentation.sections[0].rows[3].label, 'Active Path');
  assert.match(presentation.sections[0].rows[3].value, /WebMIDI host -> Pioneer DDJ-FLX6 -> profile Pioneer DDJ-FLX6/);
  assert.equal(presentation.sections[1].rows[0].value, 'Cue -> cue_L');
  assert.equal(presentation.sections[1].rows[1].value, 'play_L pinned for review');
  assert.match(presentation.sections[1].rows[1].note, /Pinned review anchor: NOTEON noteon:1:11 -> Play -> play_L/);
});

test('basic diagnostics turn an official live event into a plain-English explanation card', () => {
  const state = createControllerState({ profileId: flx6Profile.id });
  const resolved = resolveFromRaw(createFlx6RawInput({
    interaction: 'noteon',
    channel: 1,
    code: 11,
    value: 127,
    data1: 11,
    data2: 127,
    key: 'noteon:1:11',
    bytes: [0x90, 11, 127],
  }), state);
  const snapshot = buildDebuggerEventSnapshot(attachBoardRender(resolved));
  const inspection = buildDebuggerBoardInspectionSnapshot('play_L', {
    recentSnapshots: [snapshot],
    preferredSnapshot: snapshot,
  });
  const presentation = buildBasicLatestPresentationModel(snapshot, inspection);

  assert.equal(presentation.title, 'Latest Controller Action');
  assert.match(presentation.subtitle, /You pressed PLAY \/ PAUSE/i);
  assert.equal(findPresentationRow(presentation, 'What Did I Touch').value, 'PLAY / PAUSE');
  assert.equal(findPresentationRow(presentation, 'Where Is It').value, 'Left deck, transport section.');
  assert.equal(findPresentationRow(presentation, 'What Does It Do').value, 'Starts or stops the song on this deck.');
  assert.equal(findPresentationRow(presentation, 'Action').value, 'Pressed.');
  assert.equal(findPresentationRow(presentation, 'Current Deck / Mode'), null);
});

test('basic diagnostics keep unknown board controls honest instead of inventing explanations', () => {
  const inspection = buildDebuggerBoardInspectionSnapshot('mystery_transport', {
    mapEntries: [{
      key: 'noteon:1:77',
      target: 'mystery_transport',
      ownership: 'draft',
      canonicalTarget: 'deck.left.transport.play',
      type: 'noteon',
      ch: 1,
      code: 77,
      name: 'Mystery Transport',
    }],
  });
  const presentation = buildBasicInspectionPresentationModel(inspection, {
    inspectionPinned: true,
  });

  assert.equal(presentation.title, 'Pinned Control Help');
  assert.equal(findPresentationRow(presentation, 'What Does It Do').value, UNKNOWN_CONTROL_EXPLANATION);
  assert.match(findPresentationRow(presentation, 'Action').value, /No live input/i);
});
