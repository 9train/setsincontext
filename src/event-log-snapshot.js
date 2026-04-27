import { getEventJogLane } from './controllers/core/state.js';

const TONE_BY_STATUS = Object.freeze({
  official: Object.freeze({
    background: '#13311d',
    border: '#2f8551',
    color: '#b7f7c7',
  }),
  draft: Object.freeze({
    background: '#163246',
    border: '#3f8bc9',
    color: '#b7e3ff',
  }),
  fallback: Object.freeze({
    background: '#3f2d0f',
    border: '#c58a25',
    color: '#ffe1a3',
  }),
  inferred: Object.freeze({
    background: '#163246',
    border: '#3f8bc9',
    color: '#b7e3ff',
  }),
  unknown: Object.freeze({
    background: '#252c3d',
    border: '#53607d',
    color: '#d9e2ff',
  }),
  blocked: Object.freeze({
    background: '#431c23',
    border: '#c95c71',
    color: '#ffc3cc',
  }),
  compatibility: Object.freeze({
    background: '#3f2d0f',
    border: '#c58a25',
    color: '#ffe1a3',
  }),
  unmatched: Object.freeze({
    background: '#3a2433',
    border: '#9d6e90',
    color: '#f1d6ea',
  }),
  updated: Object.freeze({
    background: '#13311d',
    border: '#2f8551',
    color: '#b7f7c7',
  }),
  absent: Object.freeze({
    background: '#252c3d',
    border: '#53607d',
    color: '#d9e2ff',
  }),
});

let nextSnapshotId = 1;

function normalizeStatus(value, fallback = 'unknown') {
  const text = String(value || '').trim().toLowerCase();
  return text || fallback;
}

export function statusTone(value) {
  const text = normalizeStatus(value);
  if (text.startsWith('official')) return TONE_BY_STATUS.official;
  if (text.startsWith('draft')) return TONE_BY_STATUS.draft;
  if (text.startsWith('fallback')) return TONE_BY_STATUS.fallback;
  if (text.startsWith('compatibility')) return TONE_BY_STATUS.compatibility;
  if (text === 'compatibility') return TONE_BY_STATUS.compatibility;
  if (text === 'inferred') return TONE_BY_STATUS.inferred;
  if (text === 'blocked') return TONE_BY_STATUS.blocked;
  if (text.includes('blocked')) return TONE_BY_STATUS.blocked;
  if (text === 'updated') return TONE_BY_STATUS.updated;
  if (text === 'absent' || text === 'pending' || text === 'deferred' || text === 'unsupported-type') return TONE_BY_STATUS.absent;
  if (text === 'unmapped') return TONE_BY_STATUS.unmatched;
  if (text === 'unmatched') return TONE_BY_STATUS.unmatched;
  return TONE_BY_STATUS.unknown;
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasOwn(target, key) {
  return !!target && Object.prototype.hasOwnProperty.call(target, key);
}

function makeEventKey(info, rawLane) {
  if (rawLane && rawLane.key) return String(rawLane.key);
  const interaction = String(info && (info.type || info.interaction) || 'unknown').toLowerCase();
  const channel = info && info.ch != null ? Number(info.ch) : null;
  const code = info && (info.controller ?? info.d1) != null
    ? Number(info.controller ?? info.d1)
    : null;
  return `${interaction}:${channel != null ? channel : '?'}:${code != null ? code : '?'}`;
}

function inferMidiStatusByte(interaction, channel) {
  const normalizedInteraction = normalizeStatus(interaction);
  const normalizedChannel = asNumber(channel);
  if (normalizedChannel == null) return null;
  const zeroBasedChannel = Math.max(0, Math.min(15, normalizedChannel - 1));
  if (normalizedInteraction === 'cc') return 0xB0 + zeroBasedChannel;
  if (normalizedInteraction === 'noteon') return 0x90 + zeroBasedChannel;
  if (normalizedInteraction === 'noteoff') return 0x80 + zeroBasedChannel;
  if (normalizedInteraction === 'pitch') return 0xE0 + zeroBasedChannel;
  return null;
}

function formatHexByte(value) {
  const numeric = asNumber(value);
  if (numeric == null) return 'unknown';
  return `0x${numeric.toString(16).toUpperCase().padStart(2, '0')}`;
}

function displayToken(token) {
  const text = String(token || '').trim();
  const lower = text.toLowerCase();
  if (!lower) return '';
  if (lower === 'cc') return 'CC';
  if (lower === 'fx') return 'FX';
  if (lower === 'midi') return 'MIDI';
  if (lower === 'flx6') return 'FLX6';
  if (lower === 'ui') return 'UI';
  if (lower === 'bpm') return 'BPM';
  if (/^ch[1-4]$/.test(lower)) return lower.toUpperCase();
  if (/^deck[1-4]$/.test(lower)) return `Deck${lower.slice(4)}`;
  if (/^\d+$/.test(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function humanizeIdentifier(value, options = {}) {
  const text = String(value || '').trim();
  if (!text) return 'unknown';
  const tokens = text
    .replace(/_x5F_/g, '_')
    .split(/[._\s/-]+/)
    .filter(Boolean);
  if (!tokens.length) return 'unknown';

  if (options.shiftedFirst && tokens[tokens.length - 1].toLowerCase() === 'shifted') {
    tokens.unshift(tokens.pop());
  }

  return tokens.map((token) => displayToken(token)).join(' ');
}

function humanizeMeaning(meaningId) {
  const text = String(meaningId || '').trim();
  if (!text) return 'Unmapped Input';
  return humanizeIdentifier(text, { shiftedFirst: true });
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function formatSide(side) {
  const text = String(side || '').trim().toLowerCase();
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDeckOwnershipValue(value, status = 'unknown') {
  if (!value || typeof value !== 'object') {
    return status === 'blocked' ? 'blocked' : 'unknown';
  }
  const ownerDeck = value.ownerDeck != null ? Number(value.ownerDeck) : null;
  const ownerLayer = value.ownerLayer || null;
  if (ownerDeck == null && !ownerLayer) return status === 'blocked' ? 'blocked' : 'unknown';
  if (ownerDeck != null && ownerLayer) return `Deck ${ownerDeck} / ${humanizeIdentifier(ownerLayer)}`;
  if (ownerDeck != null) return `Deck ${ownerDeck}`;
  return humanizeIdentifier(ownerLayer);
}

function formatScalarValue(value, status = 'unknown') {
  if (value == null) {
    return status === 'blocked' ? 'blocked' : 'unknown';
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return humanizeIdentifier(value, { shiftedFirst: true });
  if (Array.isArray(value)) return value.map((entry) => formatScalarValue(entry, status)).join(', ');
  return JSON.stringify(value);
}

function describeTruthSnapshot(snapshot, formatter = formatScalarValue) {
  const status = normalizeStatus(snapshot && snapshot.status);
  const source = snapshot && snapshot.source || 'unknown';
  const value = snapshot && hasOwn(snapshot, 'value') ? snapshot.value : null;
  return Object.freeze({
    text: formatter(value, status),
    status,
    source,
  });
}

export function joinNotes(values) {
  return values.filter(Boolean).join(' | ') || null;
}

function formatCompatibilityRange(beforeValue, afterValue, formatter = formatScalarValue) {
  if (beforeValue == null && afterValue == null) return null;
  return `compat ${formatter(beforeValue)} -> ${formatter(afterValue)}`;
}

function buildTruthRow({
  label,
  before,
  after,
  formatter = formatScalarValue,
  note = null,
}) {
  const beforeValue = describeTruthSnapshot(before, formatter);
  const afterValue = describeTruthSnapshot(after, formatter);
  return Object.freeze({
    label,
    before: beforeValue.text,
    after: afterValue.text,
    status: afterValue.status,
    source: afterValue.source,
    note,
  });
}

function buildControllerStateRows(truthFocus) {
  const rows = [];
  if (!truthFocus || typeof truthFocus !== 'object') return rows;

  const deckOwnership = truthFocus.deckOwnership;
  if (deckOwnership) {
    const bindingDeck = deckOwnership.binding && deckOwnership.binding.deckNumber != null
      ? `binding Deck ${Number(deckOwnership.binding.deckNumber)}`
      : null;
    const bindingLayer = deckOwnership.binding && deckOwnership.binding.deckLayer
      ? humanizeIdentifier(deckOwnership.binding.deckLayer)
      : null;
    rows.push(buildTruthRow({
      label: `Deck Owner (${formatSide(deckOwnership.side)})`,
      before: deckOwnership.before,
      after: deckOwnership.after,
      formatter: formatDeckOwnershipValue,
      note: joinNotes([
        bindingDeck && bindingLayer ? `${bindingDeck} / ${bindingLayer}` : bindingDeck || bindingLayer,
        formatCompatibilityRange(
          deckOwnership.compatibilityDeckLayerBefore,
          deckOwnership.compatibilityDeckLayerAfter,
        ),
      ]),
    }));
  }

  const padMode = truthFocus.padMode;
  if (padMode) {
    rows.push(buildTruthRow({
      label: `Pad Mode (${formatSide(padMode.side)})`,
      before: padMode.before,
      after: padMode.after,
      note: formatCompatibilityRange(
        padMode.compatibilityValueBefore,
        padMode.compatibilityValueAfter,
      ),
    }));
  }

  const vinylMode = truthFocus.vinylMode;
  if (vinylMode) {
    rows.push(buildTruthRow({
      label: `Jog Lane (${formatSide(vinylMode.side)})`,
      before: vinylMode.lane && vinylMode.lane.before,
      after: vinylMode.lane && vinylMode.lane.after,
    }));
    rows.push(buildTruthRow({
      label: `Vinyl Mode (${formatSide(vinylMode.side)})`,
      before: vinylMode.mode && vinylMode.mode.before,
      after: vinylMode.mode && vinylMode.mode.after,
    }));
    rows.push(buildTruthRow({
      label: `Vinyl Button (${formatSide(vinylMode.side)})`,
      before: vinylMode.button && vinylMode.button.before,
      after: vinylMode.button && vinylMode.button.after,
    }));
  }

  const jogCutter = truthFocus.jogCutter;
  if (jogCutter) {
    rows.push(buildTruthRow({
      label: `Jog Cutter Mode (${formatSide(jogCutter.side)})`,
      before: jogCutter.enabled && jogCutter.enabled.before,
      after: jogCutter.enabled && jogCutter.enabled.after,
    }));
    rows.push(buildTruthRow({
      label: `Jog Cutter Button (${formatSide(jogCutter.side)})`,
      before: jogCutter.button && jogCutter.button.before,
      after: jogCutter.button && jogCutter.button.after,
    }));
  }

  const channel4Selector = truthFocus.channel4Selector;
  if (channel4Selector) {
    rows.push(buildTruthRow({
      label: 'CH4 Input',
      before: channel4Selector.before,
      after: channel4Selector.after,
      note: channel4Selector.targetId ? `render ${channel4Selector.targetId}` : null,
    }));
  }

  const beatFx = truthFocus.beatFx;
  if (beatFx) {
    const beatFxNote = joinNotes([
      beatFx.slotContext != null ? `lane slot ${Number(beatFx.slotContext)}` : null,
      beatFx.channelContext ? `lane channel ${humanizeIdentifier(beatFx.channelContext)}` : null,
      beatFx.targetId ? `render ${beatFx.targetId}` : null,
    ]);
    rows.push(buildTruthRow({
      label: `Beat FX Unit ${Number(beatFx.unit)} Slot`,
      before: beatFx.selectedSlot && beatFx.selectedSlot.before,
      after: beatFx.selectedSlot && beatFx.selectedSlot.after,
      note: joinNotes([
        beatFxNote,
        formatCompatibilityRange(
          beatFx.compatibilityBefore && beatFx.compatibilityBefore.selectedSlot,
          beatFx.compatibilityAfter && beatFx.compatibilityAfter.selectedSlot,
        ),
      ]),
    }));
    rows.push(buildTruthRow({
      label: `Beat FX Unit ${Number(beatFx.unit)} Channel`,
      before: beatFx.selectedChannel && beatFx.selectedChannel.before,
      after: beatFx.selectedChannel && beatFx.selectedChannel.after,
      note: formatCompatibilityRange(
        beatFx.compatibilityBefore && beatFx.compatibilityBefore.selectedChannel,
        beatFx.compatibilityAfter && beatFx.compatibilityAfter.selectedChannel,
      ),
    }));
    rows.push(buildTruthRow({
      label: `Beat FX Unit ${Number(beatFx.unit)} Enabled`,
      before: beatFx.enabled && beatFx.enabled.before,
      after: beatFx.enabled && beatFx.enabled.after,
      note: formatCompatibilityRange(
        beatFx.compatibilityBefore && beatFx.compatibilityBefore.enabled,
        beatFx.compatibilityAfter && beatFx.compatibilityAfter.enabled,
      ),
    }));
    rows.push(buildTruthRow({
      label: `Beat FX Unit ${Number(beatFx.unit)} Depth`,
      before: beatFx.levelDepth && beatFx.levelDepth.before,
      after: beatFx.levelDepth && beatFx.levelDepth.after,
      note: formatCompatibilityRange(
        beatFx.compatibilityBefore && beatFx.compatibilityBefore.levelDepth,
        beatFx.compatibilityAfter && beatFx.compatibilityAfter.levelDepth,
      ),
    }));
  }

  return rows;
}

function truthValueText(value, formatter = formatScalarValue) {
  return describeTruthSnapshot(value, formatter).text;
}

function deriveLikelyControlLabel(binding, semantic, info) {
  const bindingLabel = normalizeText(binding && binding.label);
  if (bindingLabel) return bindingLabel;

  const rawTarget = normalizeText(
    binding && binding.rawTarget
    || info && info.rawTarget
  );
  if (rawTarget) return humanizeIdentifier(rawTarget, { shiftedFirst: true });

  const canonicalTarget = normalizeText(
    binding && binding.canonicalTarget
    || semantic && semantic.canonicalTarget
    || info && info.canonicalTarget
  );
  if (canonicalTarget) return humanizeMeaning(canonicalTarget);

  return humanizeMeaning(semantic && semantic.meaning || null);
}

function summarizeNormalizedContext(context) {
  if (!context || typeof context !== 'object') return null;
  return joinNotes([
    context.deckLayer ? `layer ${humanizeIdentifier(context.deckLayer)}` : null,
    context.mode ? `mode ${humanizeIdentifier(context.mode)}` : null,
    context.shifted === true ? 'shift held' : null,
    context.unit != null ? `unit ${Number(context.unit)}` : null,
    context.slot != null ? `slot ${Number(context.slot)}` : null,
    context.selectedChannel ? `channel ${humanizeIdentifier(context.selectedChannel)}` : null,
  ]);
}

function buildEventContextSnapshot(binding, semantic, info) {
  const context = binding && binding.context || info && info.context || null;
  const deckContext = semantic && semantic.deckContext || null;
  const owner = deckContext && deckContext.owner || null;
  const bindingDeck = deckContext && deckContext.binding || null;

  return Object.freeze({
    normalizedSummary: summarizeNormalizedContext(context),
    surfaceSide: deckContext && deckContext.surfaceSide ? formatSide(deckContext.surfaceSide) : null,
    owner: owner && (owner.deckNumber != null || owner.deckLayer)
      ? joinNotes([
        owner.deckNumber != null ? `Deck ${Number(owner.deckNumber)}` : null,
        owner.deckLayer ? humanizeIdentifier(owner.deckLayer) : null,
      ])
      : null,
    bindingOwner: bindingDeck && (bindingDeck.deckNumber != null || bindingDeck.deckLayer)
      ? joinNotes([
        bindingDeck.deckNumber != null ? `binding Deck ${Number(bindingDeck.deckNumber)}` : null,
        bindingDeck.deckLayer ? humanizeIdentifier(bindingDeck.deckLayer) : null,
      ])
      : null,
    padMode: deckContext && deckContext.padMode
      ? truthValueText(deckContext.padMode)
      : null,
    vinylMode: deckContext && deckContext.vinylMode
      ? truthValueText(deckContext.vinylMode)
      : null,
    jogLane: deckContext && deckContext.vinylModeButton
      ? truthValueText(deckContext.vinylModeButton)
      : null,
    jogCutter: deckContext && deckContext.jogCutter
      ? truthValueText(deckContext.jogCutter)
      : null,
    channel4Input: deckContext && deckContext.channel4Input
      ? truthValueText(deckContext.channel4Input)
      : null,
    shifted: context && context.shifted === true ? 'On' : null,
  });
}

function deriveResolutionSource(bindingStatus, boardRender) {
  const ownership = normalizeStatus(boardRender && boardRender.ownership, null);
  if (ownership) return ownership;
  if (bindingStatus === 'official') return 'official';
  if (bindingStatus === 'compatibility') return 'fallback';
  return 'unknown';
}

function describeResolutionPath({
  binding,
  bindingStatus,
  semantic,
  boardRender,
  info,
}) {
  const canonicalTarget = binding && binding.canonicalTarget
    || semantic && semantic.canonicalTarget
    || info && info.canonicalTarget
    || null;
  const mappingId = binding && binding.id || info && info.mappingId || null;
  const mappingSource = deriveResolutionSource(bindingStatus, boardRender);
  const targetId = boardRender && boardRender.targetId || null;
  const steps = [];

  if (binding && binding.id) {
    steps.push(`official binding ${binding.id}`);
  } else if (mappingId || canonicalTarget) {
    steps.push(`normalized target ${canonicalTarget || mappingId}`);
  } else {
    steps.push('unmapped live input');
  }

  if (canonicalTarget) {
    steps.push(`canonical ${canonicalTarget}`);
  }

  if (targetId) {
    steps.push(`${boardRender.compatibility ? 'board compatibility' : 'board render'} ${targetId}`);
  } else if (boardRender && boardRender.blocked) {
    steps.push(boardRender.fallbackReason || boardRender.source || 'render blocked');
  } else {
    steps.push('no visible board target');
  }

  let ownerSummary = 'No resolution owner available.';
  if (mappingSource === 'official') {
    ownerSummary = 'Official FLX6 profile truth owns this resolution.';
  } else if (mappingSource === 'draft') {
    ownerSummary = 'A draft/learned compatibility mapping owns the visible board result.';
  } else if (mappingSource === 'fallback') {
    ownerSummary = 'A fallback compatibility mapping owns the visible board result.';
  }

  return Object.freeze({
    mappingSource,
    controlLabel: deriveLikelyControlLabel(binding, semantic, info),
    normalizedTarget: canonicalTarget || mappingId || null,
    targetId,
    pathSummary: steps.join(' -> '),
    ownerSummary,
    whySummary: joinNotes([
      binding && binding.note,
      boardRender && boardRender.detail,
      boardRender && boardRender.fallbackReason,
      boardRender && boardRender.source && boardRender.source !== 'unknown'
        ? `source ${boardRender.source}`
        : null,
    ]),
  });
}

function deriveBindingStatus(info, binding, boardRender) {
  if (binding && (binding.id || binding.canonicalTarget)) return 'official';
  if (info && (info.mappingId || info.canonicalTarget)) return 'official';
  if (boardRender && (boardRender.compatibility || String(boardRender.authority || '').startsWith('compatibility'))) {
    return 'compatibility';
  }
  if (info && info.__flxDebug === true && String(info.__flxDebugTarget || '').trim()) {
    return 'compatibility';
  }
  return 'unmatched';
}

function deriveBindingFamily(binding, semantic, info) {
  if (semantic && semantic.family) return String(semantic.family);
  const canonicalTarget = binding && binding.canonicalTarget || info && info.canonicalTarget || '';
  const segments = String(canonicalTarget).split('.').filter(Boolean);
  if (!segments.length) return 'unknown';
  if (segments[0] === 'deck' && segments[2]) return segments[2];
  if (segments[0] === 'mixer' && segments[1]) return segments[1];
  return segments[0];
}

function normalizeBoardRender(info, render) {
  const boardRender = info && info._boardRender && typeof info._boardRender === 'object'
    ? info._boardRender
    : {};
  const authority = boardRender.authority || null;
  const source = boardRender.source || render && render.source || null;
  const targetId = boardRender.targetId || render && render.targetId || info && info.resolvedRenderTarget || null;
  const truthStatus = render && render.truthStatus
    || (boardRender.blocked ? 'blocked' : null)
    || 'unknown';
  const outcome = boardRender.outcome
    || (boardRender.blocked ? 'blocked' : targetId ? 'pending' : 'absent');
  const applied = boardRender.applied === true
    ? 'yes'
    : boardRender.applied === false
      ? 'no'
      : 'unknown';
  const ownership = normalizeStatus(boardRender.ownership, null)
    || (String(authority || '').startsWith('official')
      ? 'official'
      : String(authority || '').startsWith('compatibility')
        ? 'fallback'
        : 'unknown');
  return Object.freeze({
    targetId,
    authority: authority || 'unknown',
    ownership,
    source: source || 'unknown',
    fallbackReason: boardRender.fallbackReason || null,
    truthStatus: normalizeStatus(truthStatus),
    compatibility: !!boardRender.compatibility || String(authority || '').startsWith('compatibility'),
    blocked: !!boardRender.blocked || normalizeStatus(truthStatus) === 'blocked',
    applied,
    outcome: normalizeStatus(outcome, 'unknown'),
    detail: boardRender.detail || null,
  });
}

function formatOutcomeLabel(outcome) {
  const normalized = normalizeStatus(outcome);
  if (normalized === 'updated') return 'Updated';
  if (normalized === 'blocked') return 'Blocked';
  if (normalized === 'absent') return 'No Target';
  if (normalized === 'target-missing') return 'Target Missing';
  if (normalized === 'deferred') return 'Waiting For Pair';
  if (normalized === 'pending') return 'Target Resolved';
  if (normalized === 'unsupported-type') return 'Unsupported Type';
  return humanizeIdentifier(normalized);
}

function normalizeMappingAuthority(value) {
  const text = normalizeStatus(value, 'unknown');
  if (text === 'official' || text === 'draft' || text === 'fallback') return text;
  return 'unknown';
}

function summarizeControllerStateRows(rows = []) {
  const entries = Array.isArray(rows) ? rows : [];
  const summary = entries
    .slice(0, 3)
    .map((row) => row && row.label && row.after != null ? `${row.label}: ${row.after}` : null)
    .filter(Boolean)
    .join(' | ');
  if (!summary) return null;
  if (entries.length <= 3) return summary;
  return `${summary} | +${entries.length - 3} more`;
}

function relayToneFromStatus(status) {
  const text = normalizeStatus(status, 'unknown');
  if (text === 'connected') return 'official';
  if (text === 'closed') return 'blocked';
  return 'unknown';
}

function recorderToneFromState(state) {
  const text = normalizeStatus(state, 'unknown');
  if (text === 'recording') return 'official';
  if (text === 'unavailable') return 'blocked';
  return 'unknown';
}

function buildRelayTransactionSnapshot(runtimeStatus = {}) {
  const relayRuntime = runtimeStatus && runtimeStatus.relayRuntime || null;
  const role = normalizeText(relayRuntime && relayRuntime.role);
  const room = normalizeText(relayRuntime && relayRuntime.room);
  const status = normalizeText(runtimeStatus && runtimeStatus.wsStatus);

  if (!role && !room && !status) {
    return Object.freeze({
      available: false,
      role: null,
      room: null,
      status: null,
      tone: 'unknown',
      summary: 'Relay status unavailable.',
    });
  }

  return Object.freeze({
    available: true,
    role,
    room,
    status: status || 'unknown',
    tone: relayToneFromStatus(status),
    summary: joinNotes([
      role
        ? `${humanizeIdentifier(role)} relay ${humanizeIdentifier(status || 'unknown')}`
        : `Relay ${humanizeIdentifier(status || 'unknown')}`,
      room ? `room ${room}` : null,
    ]) || 'Relay status available.',
  });
}

function buildRecorderTransactionSnapshot(runtimeStatus = {}) {
  const recorderStatus = runtimeStatus && runtimeStatus.recorderStatus || null;
  if (!recorderStatus || typeof recorderStatus !== 'object') {
    return Object.freeze({
      available: false,
      installed: false,
      state: null,
      eventCount: null,
      logSchema: null,
      tone: 'unknown',
      captureReady: false,
      summary: 'Recorder status unavailable.',
    });
  }

  const state = normalizeText(recorderStatus.state) || 'unknown';
  const installed = recorderStatus.installed === true;
  const available = recorderStatus.available !== false || installed;
  const eventCount = Number.isFinite(Number(recorderStatus.eventCount))
    ? Number(recorderStatus.eventCount)
    : null;
  const logSchema = normalizeText(recorderStatus.logSchema);

  let summary = 'Recorder status available.';
  if (!available) summary = 'Recorder unavailable.';
  else if (state === 'recording') summary = 'Recorder capturing debugger log entries.';
  else if (installed) summary = 'Recorder ready to capture debugger log entries.';

  return Object.freeze({
    available,
    installed,
    state,
    eventCount,
    logSchema,
    tone: available ? recorderToneFromState(state) : 'blocked',
    captureReady: available && installed,
    summary: joinNotes([
      summary,
      eventCount != null ? `${eventCount} events buffered` : null,
      logSchema,
    ]) || summary,
  });
}

function buildMappingAuthoritySnapshot(resolution, render) {
  const owner = normalizeMappingAuthority(resolution && resolution.mappingSource);
  let summary = 'Mapping authority is unknown.';
  if (owner === 'official') summary = 'Official FLX6 profile truth owns this mapping path.';
  if (owner === 'draft') summary = 'Draft/learned compatibility mapping owns this mapping path.';
  if (owner === 'fallback') summary = 'Fallback compatibility mapping owns this mapping path.';

  return Object.freeze({
    owner,
    summary: joinNotes([
      summary,
      render && render.blocked ? 'Board render is blocked.' : null,
    ]) || summary,
  });
}

function readNested(source, path = []) {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[segment];
  }
  return current ?? null;
}

function formatCalibrationSide(side) {
  const text = String(side || '').trim().toUpperCase();
  if (text === 'L') return 'Left';
  if (text === 'R') return 'Right';
  return null;
}

function formatTruthStatusSummary(truth, formatter = formatScalarValue) {
  const described = describeTruthSnapshot(truth, formatter);
  return Object.freeze({
    value: described.text,
    status: described.status,
    source: described.source,
    summary: described.status === 'unknown'
      ? described.text
      : `${humanizeIdentifier(described.status)} ${described.text}`,
  });
}

function truthSummaryKnown(entry) {
  return !!entry && (entry.status !== 'unknown' || entry.value !== 'unknown');
}

function formatJogLaneChain(rawLane, effectiveLane) {
  if (rawLane && effectiveLane && rawLane !== effectiveLane) {
    return `${humanizeIdentifier(rawLane)} -> ${humanizeIdentifier(effectiveLane)}`;
  }
  if (effectiveLane) return humanizeIdentifier(effectiveLane);
  if (rawLane) return humanizeIdentifier(rawLane);
  return null;
}

function buildHardwareTruthContext(snapshot, semantic) {
  const deckContext = semantic && semantic.deckContext || null;
  const jogCutterState = formatTruthStatusSummary(
    deckContext && deckContext.jogCutter,
  );
  const vinylModeState = formatTruthStatusSummary(
    deckContext && deckContext.vinylMode,
  );
  const summary = joinNotes([
    snapshot && snapshot.context && snapshot.context.surfaceSide ? `surface ${snapshot.context.surfaceSide}` : null,
    snapshot && snapshot.context && snapshot.context.owner ? `owner ${snapshot.context.owner}` : null,
    snapshot && snapshot.context && snapshot.context.bindingOwner ? snapshot.context.bindingOwner : null,
  ]);
  const modeSummary = joinNotes([
    snapshot && snapshot.context && snapshot.context.padMode ? `pad ${snapshot.context.padMode}` : null,
    truthSummaryKnown(vinylModeState) ? `vinyl ${vinylModeState.summary}` : null,
    truthSummaryKnown(jogCutterState) ? `jog cutter ${jogCutterState.summary}` : null,
    snapshot && snapshot.context && snapshot.context.shifted === 'On' ? 'shift held' : null,
    snapshot && snapshot.normalized && snapshot.normalized.contextSummary ? snapshot.normalized.contextSummary : null,
  ]);

  return Object.freeze({
    side: snapshot && snapshot.context && snapshot.context.surfaceSide || null,
    owner: snapshot && snapshot.context && snapshot.context.owner || null,
    bindingOwner: snapshot && snapshot.context && snapshot.context.bindingOwner || null,
    padMode: snapshot && snapshot.context && snapshot.context.padMode || null,
    shifted: snapshot && snapshot.context && snapshot.context.shifted || null,
    summary,
    modeSummary,
  });
}

function buildHardwareTruthJog(snapshot, info, semantic, debug) {
  const jogDiagnostic = info && info._jogRuntimeDiagnostic && typeof info._jogRuntimeDiagnostic === 'object'
    ? info._jogRuntimeDiagnostic
    : null;
  const rawLane = normalizeText(jogDiagnostic && jogDiagnostic.lane)
    || normalizeText(getEventJogLane(info))
    || null;
  const effectiveLane = normalizeText(jogDiagnostic && jogDiagnostic.effectiveLane)
    || normalizeText(info && info.render && info.render.jogVisual && info.render.jogVisual.lane)
    || rawLane;
  const calibration = jogDiagnostic && jogDiagnostic.calibration && typeof jogDiagnostic.calibration === 'object'
    ? jogDiagnostic.calibration
    : null;
  const controllerLaneState = formatTruthStatusSummary(
    readNested(debug, ['truthFocus', 'vinylMode', 'lane', 'after']),
  );
  const deckContext = semantic && semantic.deckContext || null;
  const jogCutterState = formatTruthStatusSummary(
    readNested(debug, ['truthFocus', 'jogCutter', 'enabled', 'after']) || deckContext && deckContext.jogCutter,
  );
  const vinylModeState = formatTruthStatusSummary(
    readNested(debug, ['truthFocus', 'vinylMode', 'mode', 'after']) || deckContext && deckContext.vinylMode,
  );
  const relevant = !!(
    rawLane
    || effectiveLane
    || calibration
    || snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget && snapshot.semantic.canonicalTarget.includes('.jog.')
    || info && info.render && info.render.jogVisual
  );
  const calibrationSelection = calibration && calibration.active
    ? joinNotes([
      formatCalibrationSide(calibration.selectedSide),
      calibration.selectedMode ? humanizeIdentifier(calibration.selectedMode) : null,
      calibration.selectedSurface ? humanizeIdentifier(calibration.selectedSurface) : null,
    ])
    : null;

  return Object.freeze({
    relevant,
    rawLane,
    effectiveLane,
    laneSummary: formatJogLaneChain(rawLane, effectiveLane),
    controllerLane: controllerLaneState,
    jogCutterState,
    vinylModeState,
    authoritative: jogDiagnostic ? jogDiagnostic.authoritative === true : false,
    eventKind: normalizeText(jogDiagnostic && jogDiagnostic.eventKind),
    calibration: calibration
      ? Object.freeze({
        active: calibration.active === true,
        action: normalizeText(calibration.action),
        pageRole: normalizeText(calibration.pageRole),
        pagePath: normalizeText(calibration.pagePath),
        selectedSide: calibration.selectedSide || null,
        selectedMode: normalizeText(calibration.selectedMode),
        selectedSurface: normalizeText(calibration.selectedSurface),
        observedMode: normalizeText(calibration.observedMode),
        observedSurface: normalizeText(calibration.observedSurface),
        expectedMotion: normalizeText(calibration.expectedMotion),
        recorded: calibration.recorded === true,
        ignored: calibration.ignored === true,
        waiting: calibration.waiting === true,
        reason: normalizeText(calibration.reason),
        selectionSummary: calibrationSelection,
      })
      : null,
  });
}

function resolveHardwareTruthMatrixStatus(snapshot, jog) {
  if (jog && jog.calibration && (jog.calibration.ignored || jog.calibration.waiting)) return 'blocked';
  if (snapshot && snapshot.render && snapshot.render.blocked) return 'blocked';
  const mappingSource = normalizeMappingAuthority(snapshot && snapshot.resolution && snapshot.resolution.mappingSource);
  if (mappingSource === 'draft' || mappingSource === 'fallback') return mappingSource;
  const mapped = !!(
    snapshot
    && snapshot.normalized
    && (snapshot.normalized.mapped || snapshot.normalized.mappingId || snapshot.normalized.canonicalTarget)
  );
  if (!mapped && !(snapshot && snapshot.render && snapshot.render.targetId)) return 'unmapped';
  if (snapshot && snapshot.binding && snapshot.binding.status === 'unmatched' && !(snapshot.render && snapshot.render.targetId)) {
    return 'unmapped';
  }
  return 'official';
}

function resolveHardwareTruthMatrixReason(snapshot, jog) {
  const calibrationReason = jog && jog.calibration && jog.calibration.reason || null;
  if (calibrationReason) return calibrationReason;
  if (snapshot && snapshot.render && snapshot.render.blocked) {
    return joinNotes([
      snapshot.render.detail,
      snapshot.render.fallbackReason,
    ]) || 'The board render did not apply to this event.';
  }
  const mapped = !!(
    snapshot
    && snapshot.normalized
    && (snapshot.normalized.mapped || snapshot.normalized.mappingId || snapshot.normalized.canonicalTarget)
  );
  if (!mapped && !(snapshot && snapshot.render && snapshot.render.targetId)) {
    return 'No official FLX6 mapping or board target matched this live input.';
  }
  return null;
}

function buildHardwareTruthMatrixRows(snapshot, { context, jog, status, reason }) {
  const rows = [
    Object.freeze({
      label: 'Raw MIDI',
      value: joinNotes([
        snapshot && snapshot.raw && snapshot.raw.interactionLabel
          ? `${snapshot.raw.interactionLabel} ch ${snapshot.raw.channel != null ? snapshot.raw.channel : '?'}`
          : null,
        snapshot && snapshot.raw && snapshot.raw.data1 != null ? `code ${snapshot.raw.data1}` : null,
        snapshot && snapshot.raw && snapshot.raw.data2 != null ? `value ${snapshot.raw.data2}` : null,
      ]) || snapshot && snapshot.raw && snapshot.raw.key || 'unknown',
      mono: true,
      badges: snapshot && snapshot.raw
        ? [{ label: snapshot.raw.interactionLabel, status: snapshot.raw.interaction }]
        : [],
      note: snapshot && snapshot.raw && snapshot.raw.statusByteHex ? `status ${snapshot.raw.statusByteHex}` : null,
    }),
    Object.freeze({
      label: 'Profile Mapping',
      value: snapshot && snapshot.normalized && snapshot.normalized.mappingId || snapshot && snapshot.binding && snapshot.binding.id || 'unmapped',
      mono: true,
      badges: snapshot && snapshot.binding
        ? [{ label: snapshot.binding.status, status: snapshot.binding.status }]
        : [],
      note: snapshot && snapshot.normalized && snapshot.normalized.controlLabel
        ? `control ${snapshot.normalized.controlLabel}`
        : null,
    }),
    Object.freeze({
      label: 'Canonical Target',
      value: snapshot && snapshot.normalized && snapshot.normalized.canonicalTarget
        || snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget
        || 'unknown',
      mono: true,
      badges: [],
      note: null,
    }),
    Object.freeze({
      label: 'Deck Context',
      value: context && context.summary || 'No deck or layer context',
      mono: false,
      badges: [],
      note: context && context.modeSummary || null,
    }),
  ];

  if (jog && jog.relevant) {
    rows.push(Object.freeze({
      label: 'Jog Lane',
      value: jog.laneSummary || 'unknown',
      mono: false,
      badges: jog.controllerLane && jog.controllerLane.status !== 'unknown'
        ? [{ label: jog.controllerLane.status, status: jog.controllerLane.status }]
        : [],
      note: joinNotes([
        truthSummaryKnown(jog.controllerLane) ? `controller lane ${jog.controllerLane.summary}` : null,
        truthSummaryKnown(jog.vinylModeState) ? `vinyl ${jog.vinylModeState.summary}` : null,
        truthSummaryKnown(jog.jogCutterState) ? `jog cutter ${jog.jogCutterState.summary}` : null,
        jog.calibration && jog.calibration.active && jog.calibration.selectionSummary
          ? `selected ${jog.calibration.selectionSummary}`
          : null,
        jog.calibration && jog.calibration.active && jog.calibration.expectedMotion
          ? `expected ${jog.calibration.expectedMotion}`
          : null,
      ]),
    }));
  }

  rows.push(
    Object.freeze({
      label: 'Render Target',
      value: snapshot && snapshot.render && snapshot.render.targetId || 'none',
      mono: true,
      badges: snapshot && snapshot.render
        ? [{ label: snapshot.render.outcomeLabel, status: snapshot.render.outcome }]
        : [],
      note: joinNotes([
        snapshot && snapshot.render && snapshot.render.authority
          ? `authority ${humanizeIdentifier(snapshot.render.authority)}`
          : null,
        snapshot && snapshot.render && snapshot.render.source
          ? `source ${humanizeIdentifier(snapshot.render.source)}`
          : null,
      ]),
    }),
    Object.freeze({
      label: 'Truth Status',
      value: humanizeIdentifier(status),
      mono: false,
      badges: [{ label: status, status }],
      note: joinNotes([
        snapshot && snapshot.resolution && snapshot.resolution.ownerSummary || null,
        snapshot && snapshot.semantic && snapshot.semantic.truthStatus
          ? `semantic ${snapshot.semantic.truthStatus}`
          : null,
      ]),
    }),
  );

  if (reason) {
    rows.push(Object.freeze({
      label: 'Why',
      value: reason,
      mono: false,
      badges: [{ label: 'warning', status: status === 'blocked' ? 'blocked' : status }],
      note: null,
    }));
  }

  return Object.freeze(rows);
}

function buildHardwareTruthMatrix(snapshot, info, { semantic = null, debug = null } = {}) {
  const context = buildHardwareTruthContext(snapshot, semantic);
  const jog = buildHardwareTruthJog(snapshot, info, semantic, debug);
  const status = resolveHardwareTruthMatrixStatus(snapshot, jog);
  const reason = resolveHardwareTruthMatrixReason(snapshot, jog);
  return Object.freeze({
    status,
    reason,
    warning: reason,
    raw: Object.freeze({
      kind: snapshot && snapshot.raw && snapshot.raw.interaction || 'unknown',
      channel: snapshot && snapshot.raw && snapshot.raw.channel != null ? snapshot.raw.channel : null,
      code: snapshot && snapshot.raw && snapshot.raw.data1 != null ? snapshot.raw.data1 : null,
      value: snapshot && snapshot.raw && snapshot.raw.data2 != null ? snapshot.raw.data2 : null,
    }),
    mapping: Object.freeze({
      id: snapshot && snapshot.normalized && snapshot.normalized.mappingId || snapshot && snapshot.binding && snapshot.binding.id || null,
      canonicalTarget: snapshot && snapshot.normalized && snapshot.normalized.canonicalTarget
        || snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget
        || null,
    }),
    context,
    jog,
    render: Object.freeze({
      targetId: snapshot && snapshot.render && snapshot.render.targetId || null,
      authority: snapshot && snapshot.render && snapshot.render.authority || null,
      source: snapshot && snapshot.render && snapshot.render.source || null,
      ownership: snapshot && snapshot.render && snapshot.render.ownership || null,
      outcome: snapshot && snapshot.render && snapshot.render.outcome || null,
    }),
    summary: joinNotes([
      snapshot && snapshot.normalized && snapshot.normalized.mappingId
        ? `mapping ${snapshot.normalized.mappingId}`
        : 'unmapped input',
      jog && jog.relevant && jog.laneSummary ? `jog ${jog.laneSummary}` : null,
      snapshot && snapshot.render && snapshot.render.targetId ? `render ${snapshot.render.targetId}` : null,
      reason,
    ]) || `${humanizeIdentifier(status)} hardware truth`,
    rows: buildHardwareTruthMatrixRows(snapshot, { context, jog, status, reason }),
  });
}

function buildDebugTransactionSnapshot(snapshot, runtimeStatus = {}) {
  const officialId = snapshot && snapshot.binding && snapshot.binding.status === 'official'
    ? snapshot.binding.id || snapshot.normalized && snapshot.normalized.mappingId || null
    : null;
  const matchedId = snapshot && snapshot.binding && snapshot.binding.id
    || snapshot && snapshot.normalized && snapshot.normalized.mappingId
    || null;
  const boardTargetId = snapshot && snapshot.render && snapshot.render.targetId
    || snapshot && snapshot.resolution && snapshot.resolution.targetId
    || null;
  const contextSummary = joinNotes([
    snapshot && snapshot.context && snapshot.context.surfaceSide ? `surface ${snapshot.context.surfaceSide}` : null,
    snapshot && snapshot.context && snapshot.context.owner ? `owner ${snapshot.context.owner}` : null,
    snapshot && snapshot.context && snapshot.context.padMode ? `pad ${snapshot.context.padMode}` : null,
    snapshot && snapshot.context && snapshot.context.vinylMode ? `vinyl ${snapshot.context.vinylMode}` : null,
    snapshot && snapshot.context && snapshot.context.jogCutter ? `jog cutter ${snapshot.context.jogCutter}` : null,
    snapshot && snapshot.context && snapshot.context.channel4Input ? `CH4 ${snapshot.context.channel4Input}` : null,
    snapshot && snapshot.context && snapshot.context.shifted === 'On' ? 'shift held' : null,
  ]) || 'No extra deck or mode context.';
  const stateSummary = summarizeControllerStateRows(snapshot && snapshot.controllerStateRows);
  const mappingAuthority = buildMappingAuthoritySnapshot(
    snapshot && snapshot.resolution,
    snapshot && snapshot.render,
  );
  const relay = buildRelayTransactionSnapshot(runtimeStatus);
  const recorder = buildRecorderTransactionSnapshot(runtimeStatus);

  return Object.freeze({
    deviceProfile: Object.freeze({
      deviceName: snapshot && snapshot.device && snapshot.device.name || null,
      profile: snapshot && snapshot.device && (snapshot.device.profileLabel || snapshot.device.profileId) || null,
      profileId: snapshot && snapshot.device && snapshot.device.profileId || null,
      transport: snapshot && snapshot.device && snapshot.device.transport || null,
      summary: joinNotes([
        snapshot && snapshot.device && snapshot.device.name || 'unknown device',
        snapshot && snapshot.device && snapshot.device.profileLabel
          ? `profile ${snapshot.device.profileLabel}`
          : snapshot && snapshot.device && snapshot.device.profileId
            ? `profile ${snapshot.device.profileId}`
            : null,
        snapshot && snapshot.device && snapshot.device.transport
          ? `transport ${humanizeIdentifier(snapshot.device.transport)}`
          : null,
      ]) || 'Device/profile unavailable.',
    }),
    rawMidi: Object.freeze({
      status: snapshot && snapshot.raw && snapshot.raw.statusByte != null ? snapshot.raw.statusByte : null,
      statusHex: snapshot && snapshot.raw && snapshot.raw.statusByteHex || 'unknown',
      channel: snapshot && snapshot.raw && snapshot.raw.channel != null ? snapshot.raw.channel : null,
      data1: snapshot && snapshot.raw && snapshot.raw.data1 != null ? snapshot.raw.data1 : null,
      data2: snapshot && snapshot.raw && snapshot.raw.data2 != null ? snapshot.raw.data2 : null,
      summary: joinNotes([
        snapshot && snapshot.raw && snapshot.raw.statusByteHex || 'unknown',
        snapshot && snapshot.raw && snapshot.raw.channel != null ? `ch ${snapshot.raw.channel}` : null,
        snapshot && snapshot.raw && snapshot.raw.data1 != null ? `d1 ${snapshot.raw.data1}` : null,
        snapshot && snapshot.raw && snapshot.raw.data2 != null ? `d2 ${snapshot.raw.data2}` : null,
      ]) || 'Raw MIDI unavailable.',
    }),
    mapping: Object.freeze({
      officialId,
      matchedId,
      canonicalTarget: snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget
        || snapshot && snapshot.normalized && snapshot.normalized.canonicalTarget
        || null,
      summary: joinNotes([
        officialId ? `official ${officialId}` : matchedId ? `matched ${matchedId}` : 'no official mapping',
        snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget
          ? `canonical ${snapshot.semantic.canonicalTarget}`
          : snapshot && snapshot.normalized && snapshot.normalized.canonicalTarget
            ? `canonical ${snapshot.normalized.canonicalTarget}`
            : null,
      ]) || 'Mapping unavailable.',
    }),
    context: Object.freeze({
      summary: contextSummary,
      stateSummary,
      surfaceSide: snapshot && snapshot.context && snapshot.context.surfaceSide || null,
      owner: snapshot && snapshot.context && snapshot.context.owner || null,
      padMode: snapshot && snapshot.context && snapshot.context.padMode || null,
      vinylMode: snapshot && snapshot.context && snapshot.context.vinylMode || null,
      jogCutter: snapshot && snapshot.context && snapshot.context.jogCutter || null,
      channel4Input: snapshot && snapshot.context && snapshot.context.channel4Input || null,
      shifted: snapshot && snapshot.context && snapshot.context.shifted || null,
    }),
    board: Object.freeze({
      targetId: boardTargetId,
      summary: boardTargetId ? `SVG target ${boardTargetId}` : 'No resolved board target.',
    }),
    renderResult: Object.freeze({
      outcome: snapshot && snapshot.render && snapshot.render.outcome || 'unknown',
      outcomeLabel: snapshot && snapshot.render && snapshot.render.outcomeLabel || 'Unknown',
      boardUpdated: snapshot && snapshot.render && snapshot.render.boardUpdated || 'unknown',
      summary: joinNotes([
        snapshot && snapshot.render && snapshot.render.outcomeLabel || 'Unknown',
        snapshot && snapshot.render && snapshot.render.boardUpdated === 'yes'
          ? 'board updated'
          : snapshot && snapshot.render && snapshot.render.boardUpdated === 'no'
            ? 'board not updated'
            : 'board update unknown',
        snapshot && snapshot.render && snapshot.render.detail || null,
        snapshot && snapshot.render && snapshot.render.fallbackReason || null,
      ]) || 'Render result unavailable.',
    }),
    mappingAuthority,
    relay,
    recorder,
  });
}

export function buildDebuggerEventSnapshot(info, options = {}) {
  const runtimeStatus = options && typeof options === 'object' && options.runtimeStatus && typeof options.runtimeStatus === 'object'
    ? options.runtimeStatus
    : {};
  const controllerRuntime = runtimeStatus && runtimeStatus.controllerRuntime || null;
  const debug = info && info.debug && typeof info.debug === 'object' ? info.debug : {};
  const rawLane = debug.rawLane || null;
  const semantic = debug.semantic || info && info.semantic || null;
  const render = debug.render || info && info.render || null;
  const binding = debug.binding || info && info.matchedBinding || null;
  const boardRender = normalizeBoardRender(info, render);
  const bytes = rawLane && Array.isArray(rawLane.bytes)
    ? rawLane.bytes.slice(0, 3)
    : Array.isArray(info && info.bytes)
      ? info.bytes.slice(0, 3)
      : null;
  const interaction = String(rawLane && rawLane.interaction || info && (info.type || info.interaction) || 'unknown').toLowerCase();
  const channel = rawLane && rawLane.channel != null
    ? Number(rawLane.channel)
    : info && info.ch != null
      ? Number(info.ch)
      : null;
  const rawLaneCode = rawLane && rawLane.code != null ? rawLane.code : null;
  const rawLaneValue = rawLane && rawLane.value != null ? rawLane.value : null;
  const data1 = bytes && bytes.length > 1
    ? asNumber(bytes[1])
    : asNumber(info ? (info.d1 ?? info.controller ?? rawLaneCode) : rawLaneCode);
  const data2 = bytes && bytes.length > 2
    ? asNumber(bytes[2])
    : asNumber(info ? (info.d2 ?? info.value ?? rawLaneValue) : rawLaneValue);
  const statusByte = bytes && bytes.length
    ? asNumber(bytes[0])
    : inferMidiStatusByte(interaction, channel);
  const key = makeEventKey(info, rawLane);
  const bindingStatus = deriveBindingStatus(info, binding, boardRender);
  const canonicalTarget = binding && binding.canonicalTarget
    || render && render.canonicalTarget
    || info && info.canonicalTarget
    || null;
  const deviceName = normalizeText(
    info && info.deviceName
    || info && info.device && (info.device.inputName || info.device.name)
    || controllerRuntime && controllerRuntime.deviceName
  );
  const profileId = normalizeText(
    info && info.profileId
    || info && info.device && info.device.profileId
    || info && info.profile && info.profile.id
    || controllerRuntime && controllerRuntime.profileId
  );
  const profileLabel = normalizeText(
    info && info.profile && info.profile.displayName
    || info && info.profile && info.profile.name
    || controllerRuntime && controllerRuntime.profileLabel
  );
  const meaningId = semantic && semantic.meaning || canonicalTarget || null;
  const meaningLabel = humanizeMeaning(meaningId);
  const semanticTruthStatus = normalizeStatus(
    semantic && semantic.truthStatus
    || debug && debug.truthStatus
    || info && info.truthStatus,
  );
  const controllerStateRows = buildControllerStateRows(debug.truthFocus);
  const eventContext = buildEventContextSnapshot(binding, semantic, info);
  const resolution = describeResolutionPath({
    binding,
    bindingStatus,
    semantic,
    boardRender,
    info,
  });

  const snapshotBase = {
    id: nextSnapshotId++,
    key,
    timestamp: asNumber(rawLane && rawLane.timestamp || info && info.timestamp),
    raw: Object.freeze({
      key,
      interaction,
      interactionLabel: humanizeIdentifier(interaction),
      statusByte,
      statusByteHex: formatHexByte(statusByte),
      channel,
      data1,
      data2,
      decodedLane: rawLane && rawLane.key || null,
      transport: rawLane && rawLane.transport || null,
    }),
    device: Object.freeze({
      transport: normalizeText(
        rawLane && rawLane.transport
        || info && info.transport
        || info && info.device && info.device.transport
        || controllerRuntime && controllerRuntime.transport
      ) || 'unknown',
      sourceId: normalizeText(info && info.sourceId || info && info.device && info.device.id),
      name: deviceName,
      profileId,
      profileLabel,
    }),
    normalized: Object.freeze({
      mapped: !!(info && info.mapped || canonicalTarget),
      controlLabel: resolution.controlLabel,
      mappingId: binding && binding.id || info && info.mappingId || null,
      canonicalTarget,
      rawTarget: binding && binding.rawTarget || info && info.rawTarget || null,
      valueShape: binding && binding.valueShape || info && info.valueShape || null,
      context: binding && binding.context || info && info.context || null,
      contextSummary: eventContext.normalizedSummary,
    }),
    binding: Object.freeze({
      status: bindingStatus,
      id: binding && binding.id || info && info.mappingId || null,
      label: binding && binding.label || null,
      family: deriveBindingFamily(binding, semantic, info),
      canonicalTarget,
      rawTarget: binding && binding.rawTarget || info && info.rawTarget || null,
      note: binding && binding.note || null,
    }),
    semantic: Object.freeze({
      family: semantic && semantic.family || 'unknown',
      action: semantic && semantic.action || interaction || 'unknown',
      meaningId,
      meaningLabel,
      truthStatus: semanticTruthStatus,
      canonicalTarget,
    }),
    render: Object.freeze({
      targetId: boardRender.targetId,
      authority: boardRender.authority,
      ownership: boardRender.ownership,
      source: boardRender.source,
      fallbackReason: boardRender.fallbackReason,
      truthStatus: boardRender.truthStatus,
      compatibility: boardRender.compatibility,
      blocked: boardRender.blocked,
      boardUpdated: boardRender.applied,
      outcome: boardRender.outcome,
      outcomeLabel: formatOutcomeLabel(boardRender.outcome),
      detail: boardRender.detail,
    }),
    authority: Object.freeze({
      truthStatus: semanticTruthStatus,
      bindingStatus,
      renderAuthority: boardRender.authority,
      resolutionOwner: boardRender.ownership,
      compatibility: boardRender.compatibility ? 'compatibility' : 'official',
      blocked: boardRender.blocked ? 'blocked' : 'clear',
    }),
    context: eventContext,
    resolution,
    controllerStateRows,
  };
  const hardwareTruthMatrix = buildHardwareTruthMatrix(snapshotBase, info, { semantic, debug });
  const snapshot = Object.freeze({
    ...snapshotBase,
    hardwareTruthMatrix,
  });
  const debugTransaction = buildDebugTransactionSnapshot(snapshot, runtimeStatus);

  const targetLabel = snapshot.render.targetId || 'no target';
  const meaningSummary = snapshot.normalized.controlLabel || snapshot.semantic.meaningLabel || 'Unmapped Input';
  const rawSummary = `${snapshot.raw.interaction.toUpperCase()} ${snapshot.raw.key}`;

  return Object.freeze({
    ...snapshot,
    debugTransaction,
    summary: `${rawSummary} -> ${meaningSummary} -> ${targetLabel}`,
    recentSummary: `${meaningSummary} -> ${targetLabel}`,
  });
}
