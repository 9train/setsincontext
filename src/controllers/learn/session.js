import { findProfileInputBindings } from '../core/normalization.js';
import { canonicalControlList, getCanonicalControl } from '../core/vocabulary.js';

export const learnModes = Object.freeze([
  'single',
  'multi',
  'replace',
]);

export const learnCandidateSources = Object.freeze([
  'normalized',
  'profile',
  'vocabulary',
]);

export const learnDraftKind = 'controller-learn-draft';
export const learnDraftVersion = 1;
export const defaultLearnCandidateLimit = 8;
export const defaultLearnCaptureLimit = 24;

/**
 * Candidate canonical target suggested during one learn capture.
 *
 * @typedef {Object} LearnCandidate
 * @property {import('../core/vocabulary.js').CanonicalControlId} canonicalTarget
 * @property {string} label
 * @property {number} score
 * @property {'normalized'|'profile'|'vocabulary'} source
 * @property {string} reason
 * @property {string=} mappingId
 * @property {string=} section
 * @property {string=} family
 * @property {string=} side
 * @property {string=} valueShape
 */

/**
 * A captured controller event saved during a learn session.
 *
 * @typedef {Object} LearnCapture
 * @property {string} id
 * @property {number} capturedAt
 * @property {string|null} profileId
 * @property {string|null} sourceId
 * @property {import('../core/contracts.js').RawInputEvent|null} raw
 * @property {import('../core/contracts.js').NormalizedInputEvent|null} normalized
 * @property {{ transport: string, kind: string, channel: number|null, code: number|null, key: string|null }} signature
 * @property {boolean} mapped
 * @property {string|null} existingMappingId
 * @property {import('../core/vocabulary.js').CanonicalControlId|null} existingCanonicalTarget
 * @property {string|null} valueShape
 * @property {string|null} rawTarget
 * @property {LearnCandidate[]} candidates
 */

/**
 * Draft mapping emitted by learn flows before it is persisted.
 *
 * @typedef {Object} LearnDraftMapping
 * @property {string} id
 * @property {import('../profiles/definition.js').RawInputLocator} raw
 * @property {string=} rawTarget
 * @property {import('../core/vocabulary.js').CanonicalControlId} canonical
 * @property {import('../core/vocabulary.js').ControlContext=} context
 * @property {'absolute'|'delta'|'binary'=} valueShape
 * @property {string=} note
 * @property {{ captureId: string, sourceKey: string|null, assignedAt: number, suggestedBy: string|null, existingMappingId: string|null }} learn
 */

/**
 * One assignment from a capture to a canonical target.
 *
 * @typedef {Object} LearnAssignment
 * @property {string} id
 * @property {string} captureId
 * @property {import('../core/vocabulary.js').CanonicalControlId} canonicalTarget
 * @property {number} assignedAt
 * @property {LearnDraftMapping} mapping
 */

/**
 * Draft mapping artifact that can be inspected, copied, or saved later.
 *
 * @typedef {Object} LearnDraft
 * @property {'controller-learn-draft'} kind
 * @property {1} version
 * @property {string|null} profileId
 * @property {'single'|'multi'|'replace'} mode
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {LearnDraftMapping[]} mappings
 * @property {LearnAssignment[]} assignments
 */

/**
 * Runtime snapshot for one active learn session.
 *
 * @typedef {Object} LearnSessionState
 * @property {string} id
 * @property {'single'|'multi'|'replace'} mode
 * @property {boolean} active
 * @property {string|null} profileId
 * @property {import('../profiles/definition.js').ControllerProfileDefinition|null} profile
 * @property {import('../core/vocabulary.js').CanonicalControlId|null} targetId
 * @property {LearnCapture[]} captures
 * @property {LearnAssignment[]} assignments
 * @property {string|null} lastCaptureId
 * @property {number|null} updatedAt
 * @property {number} candidateLimit
 * @property {number} captureLimit
 * @property {LearnDraft} draft
 */

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nowValue(timestamp) {
  return timestamp != null ? toNumber(timestamp, Date.now()) : Date.now();
}

function cleanContext(context) {
  if (!context || typeof context !== 'object') return undefined;
  const out = {};
  Object.entries(context).forEach(([key, value]) => {
    if (value == null) return;
    out[key] = value;
  });
  return Object.keys(out).length ? out : undefined;
}

function rawKeyFromParts(kind, channel, code) {
  if (!kind || channel == null || code == null) return null;
  return `${kind}:${channel}:${code}`;
}

function rawSignatureFrom(raw, normalized) {
  const transport = String(
    raw && raw.transport
    || normalized && normalized.transport
    || 'midi'
  );
  const kind = String(
    raw && raw.interaction
    || normalized && (normalized.interaction || normalized.type)
    || 'unknown'
  );
  const channel = raw && raw.channel != null
    ? toNumber(raw.channel, null)
    : normalized && normalized.channel != null
      ? toNumber(normalized.channel, null)
      : normalized && normalized.ch != null
        ? toNumber(normalized.ch, null)
        : null;
  const code = raw && raw.code != null
    ? toNumber(raw.code, null)
    : normalized && normalized.code != null
      ? toNumber(normalized.code, null)
      : normalized && normalized.controller != null
        ? toNumber(normalized.controller, null)
        : normalized && normalized.d1 != null
          ? toNumber(normalized.d1, null)
          : null;
  const key = raw && raw.key
    || normalized && normalized.key
    || rawKeyFromParts(kind, channel, code);

  return Object.freeze({
    transport,
    kind,
    channel,
    code,
    key: key || null,
  });
}

function resolveValueShape(raw, normalized) {
  if (normalized && normalized.valueShape) return String(normalized.valueShape);

  const interaction = String(
    raw && raw.interaction
    || normalized && (normalized.interaction || normalized.type)
    || ''
  ).toLowerCase();

  if (interaction === 'noteon' || interaction === 'noteoff') return 'binary';
  if (interaction === 'pitch') return 'absolute';
  if (interaction === 'cc') return 'absolute';
  return null;
}

function inferSideHint(normalized, profileBindings) {
  const candidates = [];

  const canonicalTarget = String(normalized && normalized.canonicalTarget || '').toLowerCase();
  if (canonicalTarget.startsWith('deck.left.')) candidates.push('left');
  if (canonicalTarget.startsWith('deck.right.')) candidates.push('right');

  (profileBindings || []).forEach((binding) => {
    const text = String(binding && binding.canonical || '').toLowerCase();
    if (text.startsWith('deck.left.')) candidates.push('left');
    if (text.startsWith('deck.right.')) candidates.push('right');
  });

  return candidates[0] || null;
}

function addCandidate(store, next) {
  if (!next || !next.canonicalTarget) return;
  const key = String(next.canonicalTarget);
  const current = store.get(key);
  if (!current || next.score > current.score) {
    store.set(key, Object.freeze({ ...next }));
  }
}

function buildVocabularyCandidates(options = {}) {
  const limit = options.limit || defaultLearnCandidateLimit;
  const valueShape = String(options.valueShape || '').toLowerCase();
  const sideHint = String(options.sideHint || '').toLowerCase();

  return canonicalControlList
    .map((descriptor) => {
      let score = 0;
      const descriptorShape = String(descriptor.valueShape || '').toLowerCase();

      if (valueShape && descriptorShape === valueShape) score += 50;
      else if (valueShape === 'binary' && (descriptor.kind === 'button' || descriptor.kind === 'touch' || descriptor.kind === 'pad')) score += 28;
      else if (valueShape === 'absolute' && descriptor.kind === 'continuous') score += 24;
      else if (valueShape === 'delta' && descriptorShape === 'delta') score += 36;
      else score += 4;

      if (sideHint && descriptor.side === sideHint) score += 16;
      if (!sideHint && !descriptor.side) score += 4;

      if (descriptor.bindingStyle === 'surface' && valueShape !== 'binary') score += 6;
      if ((descriptor.bindingStyle === 'action' || descriptor.bindingStyle === 'modifier') && valueShape === 'binary') score += 6;
      if (descriptor.feedback && descriptor.feedback.light && valueShape === 'binary') score += 2;

      return {
        canonicalTarget: descriptor.id,
        label: descriptor.label,
        score,
        source: 'vocabulary',
        reason: `Matches the ${valueShape || 'captured'} control shape in the canonical vocabulary.`,
        section: descriptor.section,
        family: descriptor.family,
        side: descriptor.side,
        valueShape: descriptor.valueShape,
      };
    })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function resolveCaptureInput(input, options = {}) {
  const envelope = options.envelope && typeof options.envelope === 'object'
    ? options.envelope
    : null;

  if (input && typeof input === 'object' && input.raw && Array.isArray(input.normalized)) {
    return {
      raw: input.raw || null,
      normalized: input.normalized[0] || null,
      profile: input.profile || options.profile || null,
    };
  }

  if (envelope) {
    return {
      raw: envelope.raw || null,
      normalized: input && typeof input === 'object' ? input : envelope.normalized && envelope.normalized[0] || null,
      profile: envelope.profile || options.profile || null,
    };
  }

  if (input && typeof input === 'object' && (
    input.eventType === 'normalized_input'
    || 'canonicalTarget' in input
    || 'mapped' in input
    || 'mappingId' in input
  )) {
    return {
      raw: input.raw || null,
      normalized: input,
      profile: options.profile || null,
    };
  }

  if (input && typeof input === 'object' && (input.eventType === 'raw_input' || input.interaction && input.channel != null && input.code != null)) {
    return {
      raw: input,
      normalized: null,
      profile: options.profile || null,
    };
  }

  return {
    raw: input && input.raw || null,
    normalized: input && typeof input === 'object' ? input : null,
    profile: options.profile || null,
  };
}

function buildLearnCandidates(raw, normalized, options = {}) {
  const profile = options.profile || null;
  const limit = options.limit || defaultLearnCandidateLimit;
  const candidates = new Map();

  if (normalized && normalized.mapped && normalized.canonicalTarget) {
    const descriptor = getCanonicalControl(normalized.canonicalTarget);
    addCandidate(candidates, {
      canonicalTarget: normalized.canonicalTarget,
      label: descriptor && descriptor.label || normalized.canonicalTarget,
      score: 100,
      source: 'normalized',
      reason: 'Already mapped by the live normalized event path.',
      mappingId: normalized.mappingId || undefined,
      section: descriptor && descriptor.section,
      family: descriptor && descriptor.family,
      side: descriptor && descriptor.side,
      valueShape: normalized.valueShape || descriptor && descriptor.valueShape,
    });
  }

  const profileBindings = raw && profile
    ? findProfileInputBindings(raw, profile)
    : [];
  profileBindings.forEach((binding) => {
    const descriptor = getCanonicalControl(binding.canonical);
    addCandidate(candidates, {
      canonicalTarget: binding.canonical,
      label: descriptor && descriptor.label || binding.canonical,
      score: 92,
      source: 'profile',
      reason: 'Matches an existing raw-input binding in the current profile.',
      mappingId: binding.id || undefined,
      section: descriptor && descriptor.section,
      family: descriptor && descriptor.family,
      side: descriptor && descriptor.side,
      valueShape: binding.valueShape || descriptor && descriptor.valueShape,
    });
  });

  const valueShape = resolveValueShape(raw, normalized);
  const sideHint = inferSideHint(normalized, profileBindings);

  buildVocabularyCandidates({ limit, valueShape, sideHint }).forEach((candidate) => {
    addCandidate(candidates, candidate);
  });

  return Array.from(candidates.values())
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function cloneMapping(mapping) {
  return {
    ...mapping,
    raw: mapping && mapping.raw ? { ...mapping.raw } : undefined,
    context: mapping && mapping.context ? { ...mapping.context } : undefined,
    learn: mapping && mapping.learn ? { ...mapping.learn } : undefined,
  };
}

function cloneAssignment(assignment) {
  return {
    ...assignment,
    mapping: cloneMapping(assignment.mapping),
  };
}

/**
 * Creates a simple learn session. The session stores captures, assignment
 * decisions, and one draft mapping artifact without touching the live profile.
 *
 * @param {Object=} options
 * @param {'single'|'multi'|'replace'} options.mode
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} options.profile
 * @param {string=} options.profileId
 * @param {number=} options.candidateLimit
 * @param {number=} options.captureLimit
 * @param {number=} options.now
 * @returns {LearnSessionState}
 */
export function createLearnSession(options = {}) {
  const mode = learnModes.includes(options.mode) ? options.mode : 'single';
  const profile = options.profile || null;
  const profileId = options.profileId || profile && profile.id || null;
  const createdAt = nowValue(options.now);

  return {
    id: `learn:${createdAt}`,
    mode,
    active: false,
    profileId,
    profile,
    targetId: null,
    captures: [],
    assignments: [],
    lastCaptureId: null,
    updatedAt: createdAt,
    candidateLimit: Math.max(1, toNumber(options.candidateLimit, defaultLearnCandidateLimit)),
    captureLimit: Math.max(1, toNumber(options.captureLimit, defaultLearnCaptureLimit)),
    draft: {
      kind: learnDraftKind,
      version: learnDraftVersion,
      profileId,
      mode,
      createdAt,
      updatedAt: createdAt,
      mappings: [],
      assignments: [],
    },
  };
}

/**
 * Backward-compatible alias for earlier placeholder callers.
 *
 * @param {'single'|'multi'|'replace'} [mode='single']
 * @returns {LearnSessionState}
 */
export function createLearnSessionStub(mode = 'single') {
  return createLearnSession({ mode });
}

/**
 * Arms a learn session. If a canonical target is supplied, the next capture can
 * be auto-assigned into the draft mapping output.
 *
 * @param {LearnSessionState} session
 * @param {Object=} options
 * @param {import('../core/vocabulary.js').CanonicalControlId=} options.targetId
 * @param {number=} options.timestamp
 * @returns {LearnSessionState}
 */
export function armLearnSession(session, options = {}) {
  if (!session || typeof session !== 'object') return session;
  session.active = true;
  session.targetId = options.targetId || session.targetId || null;
  session.updatedAt = nowValue(options.timestamp);
  return session;
}

/**
 * Stops active capture on a learn session.
 *
 * @param {LearnSessionState} session
 * @param {number=} timestamp
 * @returns {LearnSessionState}
 */
export function stopLearnSession(session, timestamp) {
  if (!session || typeof session !== 'object') return session;
  session.active = false;
  session.targetId = null;
  session.updatedAt = nowValue(timestamp);
  return session;
}

/**
 * Returns the latest stored capture, if any.
 *
 * @param {LearnSessionState} session
 * @returns {LearnCapture|null}
 */
export function getLatestLearnCapture(session) {
  if (!session || !Array.isArray(session.captures) || !session.captures.length) return null;
  return session.captures[session.captures.length - 1] || null;
}

/**
 * Searches canonical targets by id/label so users can choose a destination even
 * when automatic suggestions are not enough.
 *
 * @param {string=} query
 * @param {Object=} options
 * @param {number=} options.limit
 * @returns {ReadonlyArray<import('../core/vocabulary.js').CanonicalControlDescriptor>}
 */
export function searchCanonicalTargets(query = '', options = {}) {
  const limit = Math.max(1, toNumber(options.limit, 20));
  const text = String(query || '').trim().toLowerCase();
  const tokens = text ? text.split(/\s+/).filter(Boolean) : [];

  const matches = canonicalControlList
    .map((descriptor) => {
      const haystack = [
        descriptor.id,
        descriptor.label,
        descriptor.family,
        descriptor.section,
        descriptor.role,
        descriptor.side,
      ].filter(Boolean).join(' ').toLowerCase();

      let score = 0;
      if (!text) score = 1;
      else if (descriptor.id === text) score = 120;
      else if (descriptor.id.includes(text)) score = 90;
      else if (descriptor.label.toLowerCase() === text) score = 80;
      else if (descriptor.label.toLowerCase().includes(text)) score = 70;
      else if (tokens.length && tokens.every((token) => haystack.includes(token))) score = 55 + tokens.length;
      else if (haystack.includes(text)) score = 40;

      return { descriptor, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.descriptor.label.localeCompare(right.descriptor.label))
    .slice(0, limit)
    .map((entry) => entry.descriptor);

  return Object.freeze(matches);
}

/**
 * Captures one raw/normalized event into the learn session and builds likely
 * canonical target suggestions from the current profile plus the vocabulary.
 *
 * @param {LearnSessionState} session
 * @param {import('../core/contracts.js').NormalizedInputEvent|import('../core/contracts.js').RawInputEvent|import('../adapters/boundary.js').AdapterInputEnvelope|Object} input
 * @param {Object=} options
 * @param {import('../adapters/boundary.js').AdapterInputEnvelope=} options.envelope
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} options.profile
 * @param {number=} options.timestamp
 * @returns {LearnCapture|null}
 */
export function captureLearnInput(session, input, options = {}) {
  if (!session || typeof session !== 'object') return null;

  const resolved = resolveCaptureInput(input, {
    envelope: options.envelope,
    profile: options.profile || session.profile,
  });
  const raw = resolved.raw || null;
  const normalized = resolved.normalized || null;
  if (!raw && !normalized) return null;

  const profile = resolved.profile || session.profile || null;
  const capturedAt = nowValue(options.timestamp || normalized && normalized.timestamp || raw && raw.timestamp);
  const signature = rawSignatureFrom(raw, normalized);
  const capture = Object.freeze({
    id: `capture:${capturedAt}:${session.captures.length + 1}`,
    capturedAt,
    profileId: session.profileId || profile && profile.id || normalized && normalized.profileId || raw && raw.profileId || null,
    sourceId: normalized && normalized.sourceId || raw && raw.sourceId || null,
    raw,
    normalized,
    signature,
    mapped: !!(normalized && normalized.mapped),
    existingMappingId: normalized && normalized.mappingId || null,
    existingCanonicalTarget: normalized && normalized.canonicalTarget || null,
    valueShape: resolveValueShape(raw, normalized),
    rawTarget: normalized && normalized.rawTarget || null,
    candidates: Object.freeze(
      buildLearnCandidates(raw, normalized, {
        profile,
        limit: session.candidateLimit,
      })
    ),
  });

  session.captures.push(capture);
  if (session.captures.length > session.captureLimit) {
    session.captures.splice(0, session.captures.length - session.captureLimit);
  }

  if (session.mode === 'single') {
    session.captures = [session.captures[session.captures.length - 1]];
  }

  session.lastCaptureId = capture.id;
  session.updatedAt = capturedAt;

  if (session.active && session.targetId) {
    assignLearnCapture(session, {
      captureId: capture.id,
      canonicalTarget: session.targetId,
      timestamp: capturedAt,
    });
    if (session.mode === 'single') stopLearnSession(session, capturedAt);
  }

  return capture;
}

/**
 * Creates a small handler that can be assigned to `window.FLX_LEARN_HOOK`.
 * The existing MIDI path already passes normalized events into that hook.
 *
 * @param {LearnSessionState} session
 * @param {Object=} options
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} options.profile
 * @returns {(input: import('../core/contracts.js').NormalizedInputEvent|Object, envelope?: import('../adapters/boundary.js').AdapterInputEnvelope) => LearnCapture|null}
 */
export function createLearnInputHandler(session, options = {}) {
  return function onLearnInput(input, envelope) {
    return captureLearnInput(session, input, {
      ...options,
      envelope,
    });
  };
}

function buildDraftMappingFromCapture(capture, options = {}) {
  const canonicalTarget = String(options.canonicalTarget || '').trim();
  const descriptor = getCanonicalControl(canonicalTarget);
  if (!descriptor) {
    throw new Error(`Unknown canonical target: ${canonicalTarget}`);
  }

  const assignedAt = nowValue(options.timestamp);
  const signature = capture && capture.signature || rawSignatureFrom(capture && capture.raw, capture && capture.normalized);
  const suggestedBy = capture && Array.isArray(capture.candidates) && capture.candidates.length
    ? capture.candidates[0].source
    : null;
  const mappingId = [
    'draft',
    canonicalTarget,
    String(signature && signature.key || 'unknown').replace(/[^a-z0-9]+/gi, '.').replace(/^\.+|\.+$/g, ''),
  ].filter(Boolean).join('.');

  return {
    id: mappingId,
    raw: {
      transport: signature.transport,
      kind: signature.kind,
      channel: signature.channel != null ? signature.channel : undefined,
      code: signature.code != null ? signature.code : undefined,
      key: signature.key || undefined,
    },
    rawTarget: options.rawTarget != null
      ? options.rawTarget
      : capture && capture.rawTarget || undefined,
    canonical: descriptor.id,
    context: cleanContext(
      options.context !== undefined
        ? options.context
        : capture && capture.normalized && capture.normalized.context
    ),
    valueShape: options.valueShape
      || capture && capture.valueShape
      || descriptor.valueShape,
    note: options.note || `Learned from ${signature.key || 'unknown-input'}.`,
    learn: {
      captureId: capture.id,
      sourceKey: signature.key || null,
      assignedAt,
      suggestedBy,
      existingMappingId: capture && capture.existingMappingId || null,
    },
  };
}

/**
 * Assigns a captured raw input to a canonical target and writes the result into
 * the draft mapping artifact owned by the session.
 *
 * @param {LearnSessionState} session
 * @param {Object} options
 * @param {string=} options.captureId
 * @param {import('../core/vocabulary.js').CanonicalControlId=} options.canonicalTarget
 * @param {import('../core/vocabulary.js').ControlContext=} options.context
 * @param {'absolute'|'delta'|'binary'=} options.valueShape
 * @param {string=} options.rawTarget
 * @param {string=} options.note
 * @param {number=} options.timestamp
 * @returns {LearnAssignment}
 */
export function assignLearnCapture(session, options) {
  if (!session || typeof session !== 'object') {
    throw new Error('assignLearnCapture needs a learn session');
  }

  const captureId = options && options.captureId || session.lastCaptureId;
  const capture = session.captures.find((entry) => entry.id === captureId);
  if (!capture) {
    throw new Error(`Unknown learn capture: ${captureId}`);
  }

  const canonicalTarget = options && options.canonicalTarget || session.targetId;
  if (!canonicalTarget) {
    throw new Error('assignLearnCapture needs a canonicalTarget');
  }

  const assignedAt = nowValue(options && options.timestamp);
  const mapping = buildDraftMappingFromCapture(capture, {
    ...options,
    canonicalTarget,
    timestamp: assignedAt,
  });

  let mappings = session.draft.mappings.filter((entry) => entry && entry.raw && entry.raw.key !== mapping.raw.key);
  if (session.mode === 'replace' || session.mode === 'single') {
    mappings = mappings.filter((entry) => entry.canonical !== mapping.canonical);
  }
  if (session.mode === 'single') {
    mappings = [];
  }
  mappings.push(mapping);

  const assignment = {
    id: `assignment:${assignedAt}:${session.assignments.length + 1}`,
    captureId: capture.id,
    canonicalTarget: mapping.canonical,
    assignedAt,
    mapping,
  };

  session.assignments.push(assignment);
  session.draft.mappings = mappings;
  session.draft.assignments = session.assignments.slice();
  session.draft.updatedAt = assignedAt;
  session.updatedAt = assignedAt;

  return assignment;
}

/**
 * Returns a plain draft artifact that can be inspected, copied, or saved later.
 * This first pass does not mutate any live profile files.
 *
 * @param {LearnSessionState} session
 * @returns {LearnDraft}
 */
export function exportLearnDraft(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('exportLearnDraft needs a learn session');
  }

  return {
    kind: learnDraftKind,
    version: learnDraftVersion,
    profileId: session.draft.profileId || session.profileId || null,
    mode: session.mode,
    createdAt: session.draft.createdAt,
    updatedAt: session.draft.updatedAt,
    mappings: session.draft.mappings.map(cloneMapping),
    assignments: session.assignments.map(cloneAssignment),
  };
}
