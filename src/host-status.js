function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeStatus(value, fallback = 'idle') {
  const text = String(value || '').trim().toLowerCase();
  return text || fallback;
}

function humanizeProfileId(profileId) {
  const text = normalizeText(profileId);
  return text || 'unknown-profile';
}

function formatTransportLabel(transport) {
  const text = normalizeStatus(transport, 'midi');
  if (text === 'midi') return 'WebMIDI host';
  if (text === 'unknown') return 'runtime unknown';
  return `${text} host`;
}

function joinDetailParts(parts = []) {
  return parts.filter(Boolean).join(' | ') || null;
}

export function getHostStatusHealthState(modelOrTone) {
  const tone = normalizeStatus(
    modelOrTone && typeof modelOrTone === 'object'
      ? modelOrTone.tone
      : modelOrTone,
    'unknown',
  );
  return tone === 'official' ? 'ok' : 'bad';
}

export function createHostControllerStatusState() {
  return {
    midiStatus: 'idle',
    ready: false,
    deviceName: null,
    profileId: null,
    profileLabel: null,
    transport: 'midi',
    lastEventAt: null,
  };
}

export function applyMidiStatusToControllerState(state, status) {
  const next = state || createHostControllerStatusState();
  const text = normalizeText(status) || 'idle';
  next.midiStatus = text;

  if (text === 'requesting') {
    next.ready = false;
  } else if (text === 'ready') {
    next.ready = false;
  } else if (text.startsWith('listening:')) {
    next.ready = true;
    next.deviceName = normalizeText(text.slice('listening:'.length)) || next.deviceName;
  } else if (
    text === 'no-inputs'
    || text === 'denied'
    || text === 'unsupported'
    || text === 'stopped'
    || text === 'disconnected'
    || text === 'host: off'
  ) {
    next.ready = false;
  }

  return next;
}

export function absorbControllerRuntimeInfo(state, details = {}) {
  const next = state || createHostControllerStatusState();
  if (!details || typeof details !== 'object') return next;

  const deviceName = normalizeText(
    details.deviceName
    || details.inputName
    || details.name
  );
  if (deviceName) next.deviceName = deviceName;

  const profileId = normalizeText(details.profileId);
  if (profileId) next.profileId = profileId;

  const profileLabel = normalizeText(
    details.profileLabel
    || details.displayName
    || details.profileName
  );
  if (profileLabel) next.profileLabel = profileLabel;

  const transport = normalizeText(details.transport);
  if (transport) next.transport = transport;

  if (details.ready === true) next.ready = true;
  if (details.ready === false) next.ready = false;

  const timestamp = Number(details.timestamp);
  if (Number.isFinite(timestamp) && timestamp >= 0) next.lastEventAt = timestamp;

  return next;
}

export function describeHostWSStatus(status) {
  const current = normalizeStatus(status, 'connecting');

  if (current === 'connected') {
    return Object.freeze({
      summary: 'Host room connected',
      detail: 'Viewer relay path is live.',
      badge: 'host connected',
      tone: 'official',
    });
  }

  if (current === 'connecting') {
    return Object.freeze({
      summary: 'Connecting host room',
      detail: 'Waiting for the runtime room link.',
      badge: 'host connecting',
      tone: 'unknown',
    });
  }

  if (current === 'closed') {
    return Object.freeze({
      summary: 'Host room disconnected',
      detail: 'Live relay is offline until the room reconnects.',
      badge: 'host offline',
      tone: 'blocked',
    });
  }

  return Object.freeze({
    summary: `Host room ${current}`,
    detail: 'Runtime room state is present but not yet classified.',
    badge: 'host unknown',
    tone: 'unknown',
  });
}

export function describeHostMIDIStatus(status) {
  const current = normalizeStatus(status, 'idle');

  if (current === 'requesting') {
    return Object.freeze({
      summary: 'Requesting MIDI access',
      detail: 'Waiting for browser permission before FLX6 input can go live.',
      badge: 'midi requesting',
      tone: 'unknown',
    });
  }

  if (current === 'ready') {
    return Object.freeze({
      summary: 'Waiting for FLX6 input',
      detail: 'MIDI access is ready, but no live FLX6 event has arrived yet.',
      badge: 'midi waiting',
      tone: 'unknown',
    });
  }

  if (current.startsWith('listening:')) {
    const deviceName = normalizeText(status.slice('listening:'.length)) || 'controller';
    return Object.freeze({
      summary: 'Listening for live controller input',
      detail: deviceName,
      badge: 'midi live',
      tone: 'official',
    });
  }

  if (current === 'no-inputs') {
    return Object.freeze({
      summary: 'No MIDI input detected',
      detail: 'The browser is up, but no FLX6-style input is available.',
      badge: 'midi missing',
      tone: 'blocked',
    });
  }

  if (current === 'denied') {
    return Object.freeze({
      summary: 'MIDI access denied',
      detail: 'The browser blocked WebMIDI access for this host session.',
      badge: 'midi denied',
      tone: 'blocked',
    });
  }

  if (current === 'unsupported') {
    return Object.freeze({
      summary: 'WebMIDI unsupported',
      detail: 'This browser cannot expose the FLX6 input path.',
      badge: 'midi unsupported',
      tone: 'blocked',
    });
  }

  if (current === 'host: off' || current === 'stopped' || current === 'disconnected') {
    return Object.freeze({
      summary: 'MIDI lane not ready',
      detail: 'The host runtime is not listening for controller input right now.',
      badge: 'midi offline',
      tone: 'blocked',
    });
  }

  return Object.freeze({
    summary: 'MIDI idle',
    detail: 'Waiting for the host runtime to request controller input.',
    badge: 'midi idle',
    tone: 'unknown',
  });
}

export function describeHostControllerStatus(state) {
  const current = state || createHostControllerStatusState();
  const profileToken = current.profileLabel || humanizeProfileId(current.profileId);
  const transportLabel = formatTransportLabel(current.transport);
  const knownDetail = joinDetailParts([
    current.deviceName,
    profileToken ? `profile ${profileToken}` : null,
    transportLabel,
  ]);
  const midiStatus = normalizeStatus(current.midiStatus, 'idle');

  if (current.ready) {
    return Object.freeze({
      ready: true,
      summary: 'Controller live',
      detail: knownDetail || 'Live controller path is active.',
      badge: 'controller live',
      tone: 'official',
    });
  }

  if (midiStatus === 'requesting') {
    return Object.freeze({
      ready: false,
      summary: 'Waiting on MIDI access',
      detail: 'Controller status will go live after browser permission is granted.',
      badge: 'controller waiting',
      tone: 'unknown',
    });
  }

  if (midiStatus === 'ready') {
    return Object.freeze({
      ready: false,
      summary: 'Waiting for first FLX6 event',
      detail: knownDetail || 'The controller path is ready but has not gone live yet.',
      badge: 'controller waiting',
      tone: 'unknown',
    });
  }

  if (midiStatus === 'no-inputs') {
    return Object.freeze({
      ready: false,
      summary: 'No FLX6 input detected',
      detail: knownDetail || 'No controller input is currently attached to this host session.',
      badge: 'controller missing',
      tone: 'blocked',
    });
  }

  if (midiStatus === 'denied') {
    return Object.freeze({
      ready: false,
      summary: 'Controller blocked by MIDI permissions',
      detail: 'Grant WebMIDI access before trusting the live debugger path.',
      badge: 'controller blocked',
      tone: 'blocked',
    });
  }

  if (midiStatus === 'unsupported') {
    return Object.freeze({
      ready: false,
      summary: 'Controller path unsupported',
      detail: 'This browser cannot expose the FLX6 WebMIDI lane.',
      badge: 'controller blocked',
      tone: 'blocked',
    });
  }

  if (midiStatus === 'host: off' || midiStatus === 'stopped' || midiStatus === 'disconnected') {
    return Object.freeze({
      ready: false,
      summary: 'Controller path not ready',
      detail: knownDetail || 'The host runtime is not currently listening for FLX6 input.',
      badge: 'controller offline',
      tone: 'blocked',
    });
  }

  if (current.deviceName || current.profileId || current.profileLabel) {
    return Object.freeze({
      ready: false,
      summary: 'Controller known, waiting to go live',
      detail: knownDetail,
      badge: 'controller waiting',
      tone: 'unknown',
    });
  }

  return Object.freeze({
    ready: false,
    summary: 'Controller idle',
    detail: 'Waiting for the host runtime to discover a live FLX6 path.',
    badge: 'controller idle',
    tone: 'unknown',
  });
}

export function formatHostControllerStatus(state) {
  const current = state || createHostControllerStatusState();
  const profileToken = humanizeProfileId(current.profileId);

  if (current.ready) {
    const deviceToken = current.deviceName || 'controller-ready';
    return `CTRL: ready | ${deviceToken} | ${profileToken}`;
  }

  const midiStatus = String(current.midiStatus || 'idle').trim().toLowerCase();
  if (midiStatus === 'requesting') return 'CTRL: requesting MIDI access';
  if (midiStatus === 'ready') return `CTRL: waiting for FLX6 input${current.deviceName ? ` | ${current.deviceName}` : ''}`;
  if (midiStatus === 'no-inputs') return 'CTRL: no MIDI input detected';
  if (midiStatus === 'denied') return 'CTRL: MIDI access denied';
  if (midiStatus === 'unsupported') return 'CTRL: WebMIDI unsupported';
  if (midiStatus === 'host: off' || midiStatus === 'stopped' || midiStatus === 'disconnected') return 'CTRL: not ready';

  if (current.deviceName || current.profileId) {
    return `CTRL: waiting | ${current.deviceName || 'device-unknown'} | ${profileToken}`;
  }

  return 'CTRL: idle';
}
