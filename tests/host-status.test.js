import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHostControllerStatusState,
  applyMidiStatusToControllerState,
  absorbControllerRuntimeInfo,
  describeHostControllerStatus,
  describeHostMIDIStatus,
  describeHostWSStatus,
  formatHostControllerStatus,
  getHostStatusHealthState,
} from '../src/host-status.js';

test('host controller status stays explicit about not-ready states', () => {
  const state = createHostControllerStatusState();

  applyMidiStatusToControllerState(state, 'requesting');
  assert.equal(formatHostControllerStatus(state), 'CTRL: requesting MIDI access');

  applyMidiStatusToControllerState(state, 'ready');
  assert.equal(formatHostControllerStatus(state), 'CTRL: waiting for FLX6 input');

  applyMidiStatusToControllerState(state, 'no-inputs');
  assert.equal(formatHostControllerStatus(state), 'CTRL: no MIDI input detected');
});

test('host controller status reports the connected FLX6 device and profile once ready', () => {
  const state = createHostControllerStatusState();

  applyMidiStatusToControllerState(state, 'listening:Pioneer DDJ-FLX6');
  absorbControllerRuntimeInfo(state, {
    deviceName: 'Pioneer DDJ-FLX6',
    profileId: 'pioneer-ddj-flx6',
    profileLabel: 'Pioneer DDJ-FLX6',
    transport: 'midi',
    ready: true,
    timestamp: 123,
  });

  assert.equal(
    formatHostControllerStatus(state),
    'CTRL: ready | Pioneer DDJ-FLX6 | pioneer-ddj-flx6',
  );
  assert.equal(state.transport, 'midi');
  assert.equal(state.lastEventAt, 123);
});

test('host status helpers describe the room link, MIDI lane, and controller path for debugger framing', () => {
  const state = createHostControllerStatusState();
  applyMidiStatusToControllerState(state, 'ready');
  absorbControllerRuntimeInfo(state, {
    deviceName: 'Pioneer DDJ-FLX6',
    profileId: 'pioneer-ddj-flx6',
    profileLabel: 'Pioneer DDJ-FLX6',
    transport: 'midi',
  });

  assert.deepEqual(describeHostWSStatus('connected'), {
    summary: 'Host room connected',
    detail: 'Viewer relay path is live.',
    badge: 'host connected',
    tone: 'official',
  });
  assert.deepEqual(describeHostMIDIStatus('ready'), {
    summary: 'Waiting for FLX6 input',
    detail: 'MIDI access is ready, but no live FLX6 event has arrived yet.',
    badge: 'midi waiting',
    tone: 'unknown',
  });
  assert.deepEqual(describeHostControllerStatus(state), {
    ready: false,
    summary: 'Waiting for first FLX6 event',
    detail: 'Pioneer DDJ-FLX6 | profile Pioneer DDJ-FLX6 | WebMIDI host',
    badge: 'controller waiting',
    tone: 'unknown',
  });
});

test('compact host chrome maps official to green and everything else to red', () => {
  assert.equal(getHostStatusHealthState('official'), 'ok');
  assert.equal(getHostStatusHealthState('blocked'), 'bad');
  assert.equal(getHostStatusHealthState('unknown'), 'bad');
  assert.equal(getHostStatusHealthState({ tone: 'official' }), 'ok');
  assert.equal(getHostStatusHealthState({ tone: 'blocked' }), 'bad');
  assert.equal(getHostStatusHealthState({ tone: 'unknown' }), 'bad');
});
