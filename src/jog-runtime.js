// /src/jog-runtime.js
// Shared HTML-page jog wrapper/runtime used by the canonical host/viewer pages.

import {
  decodeRelative7,
  decodeSignedBit7,
  decodeTwosComplement7,
} from './controllers/core/delta-codecs.js';
import { getEventJogLane, isBinaryEventActive } from './controllers/core/state.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

const JOG_EVENT_HANDLED_FLAG = '__flxJogVisualHandled';
const JOG_RENDER_FRAME_MS = 16;
const JOG_MAX_CATCHUP_MS = 500;
const JOG_MIN_ACTIVE_VELOCITY = 0.001;
const JOG_DEFAULT_LANE = 'wheel_side';
const JOG_CALIBRATION_STORAGE_KEY = 'flx.jogCalibration.v1';
const JOG_CALIBRATION_CONTROLLER_ID = 'ddj-flx6';
const JOG_CALIBRATION_MODES = Object.freeze(['normal', 'vinyl', 'jog_cutter']);
const JOG_CALIBRATION_SURFACES = Object.freeze(['side', 'top_touch']);
const JOG_CALIBRATION_DEFAULT_SCOPE = 'default';

const jogMotionProfiles = Object.freeze({
  default: Object.freeze({
    directScale: 0.24,
    velocityScale: 0.08,
    damping: 0.68,
    maxVel: 0.2,
    motionMode: 'nudge',
  }),
  wheel_side: Object.freeze({
    directScale: 0.18,
    velocityScale: 0.06,
    damping: 0.64,
    maxVel: 0.16,
    motionMode: 'nudge',
  }),
  wheel_side_shifted: Object.freeze({
    directScale: 0.14,
    velocityScale: 0.05,
    damping: 0.6,
    maxVel: 0.12,
    motionMode: 'nudge',
  }),
  platter_vinyl_on: Object.freeze({
    directScale: 0.28,
    velocityScale: 0.08,
    damping: 0.7,
    maxVel: 0.22,
    motionMode: 'vinyl_platter',
  }),
  platter_vinyl_off: Object.freeze({
    directScale: 0.36,
    velocityScale: 0.12,
    damping: 0.78,
    maxVel: 0.28,
    motionMode: 'spin',
  }),
  platter_shifted: Object.freeze({
    directScale: 0.24,
    velocityScale: 0.07,
    damping: 0.66,
    maxVel: 0.18,
    motionMode: 'vinyl_platter',
  }),
  scratch: Object.freeze({
    directScale: 0.62,
    velocityScale: 0.015,
    damping: 0.34,
    maxVel: 0.08,
    motionMode: 'scratch',
  }),
  scratch_shifted: Object.freeze({
    directScale: 0.46,
    velocityScale: 0.012,
    damping: 0.3,
    maxVel: 0.06,
    motionMode: 'scratch',
  }),
  jog_cutter: Object.freeze({
    directScale: 0.5,
    velocityScale: 0.01,
    damping: 0.28,
    maxVel: 0.05,
    motionMode: 'jog_cutter',
  }),
});

const jogProfileLanes = new Set([
  'wheel_side',
  'wheel_side_shifted',
  'platter_vinyl_on',
  'platter_vinyl_off',
  'platter_shifted',
  'scratch',
  'scratch_shifted',
  'jog_cutter',
]);

const jogTouchLanes = new Set(['touch', 'touch_shifted']);

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function hasOwn(source, key) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeJogText(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizeMotionLane(value) {
  const lane = normalizeJogText(value);
  return jogProfileLanes.has(lane) ? lane : null;
}

function normalizeTouchLane(value) {
  const lane = normalizeJogText(value);
  return jogTouchLanes.has(lane) ? lane : null;
}

function normalizeDeltaCodec(value) {
  const text = normalizeJogText(value);
  return text || 'relative7';
}

function normalizeCalibrationSide(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'L' || text === 'LEFT') return 'L';
  if (text === 'R' || text === 'RIGHT') return 'R';
  return null;
}

function normalizeCalibrationSurface(value) {
  const text = normalizeJogText(value);
  if (text === 'side' || text === 'wheel_side' || text === 'wheel-side') return 'side';
  if (
    text === 'top_touch'
    || text === 'top-touch'
    || text === 'toptouch'
    || text === 'top touched'
    || text === 'top touched platter'
    || text === 'top_touched_platter'
  ) {
    return 'top_touch';
  }
  return null;
}

function getSideKey(side) {
  return side === 'L' ? 'left' : side === 'R' ? 'right' : null;
}

function getCalibrationSideKey(value) {
  const text = normalizeJogText(value);
  if (text === 'left' || text === 'right') return text;
  return getSideKey(normalizeCalibrationSide(value));
}

function getFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getBooleanState(container, key) {
  if (!container || !key || !hasOwn(container, key)) return undefined;
  const value = container[key];
  if (value == null) return null;
  return !!value;
}

function decodeJogDelta(value, codec = 'relative7') {
  const mode = normalizeDeltaCodec(codec);
  if (mode === 'twos-complement-7' || mode === 'twoscomplement7') {
    return decodeTwosComplement7(value);
  }
  if (mode === 'signed-bit-7' || mode === 'signedbit7') {
    return decodeSignedBit7(value);
  }
  return decodeRelative7(value);
}

function hasJogProfileFields(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return (
    hasOwn(profile, 'directScale')
    || hasOwn(profile, 'degreesPerCount')
    || hasOwn(profile, 'velocityScale')
    || hasOwn(profile, 'damping')
    || hasOwn(profile, 'maxVel')
    || hasOwn(profile, 'maxVelocity')
    || hasOwn(profile, 'motionMode')
  );
}

function getWindowFeelConfig() {
  try {
    const feel = typeof window !== 'undefined' && window && window.__MIDI_FEEL__;
    return feel && typeof feel === 'object' ? feel.FEEL_CFG || null : null;
  } catch {
    return null;
  }
}

function getJogDefaultLane(feelConfig) {
  const jog = getJogFeelConfig(feelConfig);
  const lane = normalizeMotionLane(jog && jog.defaultLane);
  return lane || JOG_DEFAULT_LANE;
}

function getJogDeltaCodec(feelConfig) {
  const jog = getJogFeelConfig(feelConfig);
  return normalizeDeltaCodec(jog && (jog.deltaCodec || jog.codec));
}

function normalizeJogLaneProfile(profile, fallback) {
  const source = asObject(profile) || {};
  const base = fallback || jogMotionProfiles.default;
  const directScale = getFiniteNumber(source.directScale) ?? getFiniteNumber(source.degreesPerCount);
  const velocityScale = getFiniteNumber(source.velocityScale);
  const damping = getFiniteNumber(source.damping);
  const maxVel = getFiniteNumber(source.maxVel) ?? getFiniteNumber(source.maxVelocity);
  const motionMode = normalizeJogText(source.motionMode);

  return Object.freeze({
    directScale: directScale != null ? directScale : base.directScale,
    velocityScale: velocityScale != null ? velocityScale : base.velocityScale,
    damping: damping != null ? damping : base.damping,
    maxVel: maxVel != null ? maxVel : base.maxVel,
    motionMode: motionMode || base.motionMode,
  });
}

export function getJogFeelConfig(feelConfig = getWindowFeelConfig()) {
  const root = asObject(feelConfig);
  if (!root) return null;

  if (normalizeJogText(root.type) === 'jog') {
    return root;
  }

  const controls = asObject(root.controls);
  const jog = asObject(controls && controls.jog);
  if (!jog) return null;
  if (jog.type == null) return jog;
  return normalizeJogText(jog.type) === 'jog' ? jog : null;
}

export function getJogLaneProfile(lane, feelConfig = getWindowFeelConfig()) {
  const normalizedLane = normalizeMotionLane(lane) || getJogDefaultLane(feelConfig);
  const fallback = jogMotionProfiles[normalizedLane] || jogMotionProfiles.default;
  const jog = getJogFeelConfig(feelConfig);
  const lanes = asObject(jog && jog.lanes);
  const laneProfile = asObject(lanes && lanes[normalizedLane]);

  if (hasJogProfileFields(laneProfile)) {
    return normalizeJogLaneProfile(laneProfile, fallback);
  }

  if (hasJogProfileFields(jog)) {
    return normalizeJogLaneProfile(jog, fallback);
  }

  return fallback;
}

function isScratchLikeMotionMode(mode) {
  const text = normalizeJogText(mode);
  return text === 'scratch' || text === 'jog_cutter';
}

export function resolveEffectiveJogLane(info, sideState = {}, feelConfig = getWindowFeelConfig()) {
  const visual = getAuthoritativeJogVisual(info);
  const requestedLane =
    normalizeMotionLane(visual && visual.lane)
    || normalizeMotionLane(sideState.inputLane)
    || normalizeMotionLane(getEventJogLane(info))
    || getJogDefaultLane(feelConfig);

  if (
    requestedLane === 'wheel_side'
    || requestedLane === 'wheel_side_shifted'
    || requestedLane === 'scratch'
    || requestedLane === 'scratch_shifted'
    || requestedLane === 'jog_cutter'
  ) {
    return requestedLane;
  }

  const touchActive = visual && typeof visual.touchActive === 'boolean'
    ? visual.touchActive
    : !!sideState.touchActive;
  if (!touchActive) return requestedLane;

  if (sideState.jogCutterKnown && sideState.jogCutterActive) {
    return 'jog_cutter';
  }

  if (requestedLane === 'platter_shifted') return 'scratch_shifted';
  if (requestedLane === 'platter_vinyl_on' || requestedLane === 'platter_vinyl_off') {
    return 'scratch';
  }

  return requestedLane;
}

function getCalibrationSurfaceForLane(lane) {
  const normalizedLane = normalizeMotionLane(lane);
  if (!normalizedLane) return null;

  if (normalizedLane === 'wheel_side' || normalizedLane === 'wheel_side_shifted') {
    return 'side';
  }

  if (
    normalizedLane === 'scratch'
    || normalizedLane === 'scratch_shifted'
    || normalizedLane === 'jog_cutter'
  ) {
    return 'top_touch';
  }

  return null;
}

function resolveJogCalibrationMode({
  inputLane = null,
  effectiveLane = null,
  jogCutterKnown = false,
  jogCutterActive = false,
  jogVinylModeKnown = false,
  jogVinylMode = null,
} = {}) {
  const normalizedInputLane = normalizeMotionLane(inputLane);
  const normalizedEffectiveLane = normalizeMotionLane(effectiveLane) || normalizedInputLane;

  if (normalizedEffectiveLane === 'jog_cutter' || (jogCutterKnown && jogCutterActive)) {
    return 'jog_cutter';
  }

  if (jogVinylModeKnown) {
    return jogVinylMode ? 'vinyl' : 'normal';
  }

  if (normalizedInputLane === 'platter_vinyl_on' || normalizedEffectiveLane === 'platter_vinyl_on') {
    return 'vinyl';
  }

  if (normalizedInputLane === 'platter_vinyl_off' || normalizedEffectiveLane === 'platter_vinyl_off') {
    return 'normal';
  }

  return 'normal';
}

function resolveJogCalibrationSurface({
  inputLane = null,
  effectiveLane = null,
  touchActive = false,
} = {}) {
  const normalizedInputLane = normalizeMotionLane(inputLane);
  const normalizedEffectiveLane = normalizeMotionLane(effectiveLane) || normalizedInputLane;

  if (normalizedInputLane === 'wheel_side' || normalizedInputLane === 'wheel_side_shifted') {
    return 'side';
  }

  if (
    normalizedEffectiveLane === 'scratch'
    || normalizedEffectiveLane === 'scratch_shifted'
    || normalizedEffectiveLane === 'jog_cutter'
  ) {
    return 'top_touch';
  }

  if (
    touchActive
    && normalizedInputLane
    && normalizedInputLane !== 'wheel_side'
    && normalizedInputLane !== 'wheel_side_shifted'
  ) {
    return 'top_touch';
  }

  return 'side';
}

export function resolveJogCalibrationProfileKey({
  side = null,
  inputLane = null,
  effectiveLane = null,
  touchActive = false,
  jogCutterKnown = false,
  jogCutterActive = false,
  jogVinylModeKnown = false,
  jogVinylMode = null,
} = {}) {
  const normalizedSide = normalizeCalibrationSide(side);
  const normalizedInputLane = normalizeMotionLane(inputLane);
  const normalizedEffectiveLane = normalizeMotionLane(effectiveLane) || normalizedInputLane;

  return Object.freeze({
    side: normalizedSide,
    sideKey: getSideKey(normalizedSide),
    mode: resolveJogCalibrationMode({
      inputLane: normalizedInputLane,
      effectiveLane: normalizedEffectiveLane,
      jogCutterKnown,
      jogCutterActive,
      jogVinylModeKnown,
      jogVinylMode,
    }),
    surface: resolveJogCalibrationSurface({
      inputLane: normalizedInputLane,
      effectiveLane: normalizedEffectiveLane,
      touchActive,
    }),
    inputLane: normalizedInputLane,
    effectiveLane: normalizedEffectiveLane,
  });
}

function createCalibrationState() {
  return {
    active: false,
    side: null,
    mode: null,
    surface: null,
    startedAt: null,
    stoppedAt: null,
    entries: new Map(),
    touchSeen: false,
    motionSeen: false,
    ignoredEventCount: 0,
    lastIgnoredReason: null,
    lastSeenJogEvent: null,
    lastSeenMotionEvent: null,
    lastSeenTouchEvent: null,
    pageRole: null,
    pagePath: null,
    warning: null,
  };
}

function roundJogNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundJogNumber(numeric) : null;
}

function getCalibrationSuggestionDegrees(totalCounts) {
  const numeric = Math.abs(Number(totalCounts) || 0);
  if (!(numeric > 0)) return null;
  return roundJogNumber(360 / numeric);
}

function getCalibrationNote(totalDelta, totalAbsDelta) {
  const signedCounts = Math.abs(Number(totalDelta) || 0);
  const absCounts = Math.abs(Number(totalAbsDelta) || 0);
  const countDifference = absCounts - signedCounts;
  if (!(countDifference > 0)) return null;

  const significantDifference = countDifference >= Math.max(2, absCounts * 0.05);
  if (!significantDifference) return null;

  return 'Signed and absolute counts differ significantly; calibration likely included back-and-forth movement.';
}

function getCalibrationPagePath() {
  try {
    const path = typeof location !== 'undefined' && location ? String(location.pathname || '') : '';
    return path || null;
  } catch {
    return null;
  }
}

function getCalibrationPageRole() {
  const detect = (value) => {
    const text = normalizeJogText(value);
    return text === 'host' || text === 'viewer' ? text : null;
  };

  try {
    const explicitRole = detect(typeof window !== 'undefined' && window ? window.FLX_ROLE : null);
    if (explicitRole) return explicitRole;
  } catch {}

  try {
    const bodyRole = detect(typeof document !== 'undefined' && document && document.body && document.body.dataset
      ? document.body.dataset.role
      : null);
    if (bodyRole) return bodyRole;
  } catch {}

  try {
    if (typeof document !== 'undefined' && document && document.body && document.body.classList) {
      if (document.body.classList.contains('host')) return 'host';
      if (document.body.classList.contains('viewer')) return 'viewer';
    }
  } catch {}

  try {
    const path = String(location && location.pathname || '').toLowerCase();
    if (path.endsWith('/host.html') || path === '/host.html' || path.endsWith('host.html')) return 'host';
    if (path.endsWith('/viewer.html') || path === '/viewer.html' || path.endsWith('viewer.html')) return 'viewer';
  } catch {}

  return 'unknown';
}

function getCalibrationViewerWarning(pageRole) {
  return pageRole === 'viewer'
    ? 'Calibration is running on viewer.html. Viewer jogVisual relay frames are not physical FLX6 input; run calibration on host.html.'
    : null;
}

function describeCalibrationExpectedMotion(surface) {
  const normalizedSurface = normalizeCalibrationSurface(surface);
  if (normalizedSurface === 'top_touch') return 'platter CC 34/35/41';
  if (normalizedSurface === 'side') return 'side-wheel CC 33/38';
  return 'matching jog motion CC';
}

function describeCalibrationSurfaceMismatchReason(selectedSurface, observedSurface) {
  const selected = normalizeCalibrationSurface(selectedSurface);
  const observed = normalizeCalibrationSurface(observedSurface);
  if (selected === 'top_touch' && observed === 'side') {
    return 'Top-touch calibration was selected, but side-wheel CC motion was received. Calibration is waiting for platter CC 34/35/41.';
  }
  if (selected === 'side' && observed === 'top_touch') {
    return 'Side calibration was selected, but a top-touch platter lane was received. Calibration is waiting for side-wheel CC 33/38.';
  }
  return `Calibration is tracking ${selected || 'unknown'}, so ${observed || 'unknown'} jog motion was ignored.`;
}

function refreshCalibrationPageContext(calibration) {
  if (!calibration || typeof calibration !== 'object') return;
  calibration.pageRole = getCalibrationPageRole();
  calibration.pagePath = getCalibrationPagePath();
  calibration.warning = getCalibrationViewerWarning(calibration.pageRole);
}

function setJogRuntimeDiagnostic(info, calibration, {
  side = null,
  lane = null,
  effectiveLane = null,
  delta = null,
  authoritative = false,
  eventKind = null,
  calibrationKey = null,
  calibrationAction = null,
  calibrationReason = null,
} = {}) {
  if (!info || typeof info !== 'object') return;

  const normalizedSide = normalizeCalibrationSide(side);
  const normalizedLane = normalizeJogText(lane);
  const normalizedEffectiveLane = normalizeMotionLane(effectiveLane);
  const selectedSurface = normalizeCalibrationSurface(calibration && calibration.surface);
  const selectedMode = normalizeCalibrationMode(calibration && calibration.mode);
  const observedMode = normalizeCalibrationMode(calibrationKey && calibrationKey.mode)
    || getCalibrationModeForLane(normalizedEffectiveLane || normalizedLane);
  const observedSurface = normalizeCalibrationSurface(calibrationKey && calibrationKey.surface)
    || getCalibrationSurfaceForLane(normalizedEffectiveLane || normalizedLane);

  try {
    info._jogRuntimeDiagnostic = Object.freeze({
      side: normalizedSide,
      sideKey: getSideKey(normalizedSide),
      lane: normalizedLane,
      effectiveLane: normalizedEffectiveLane,
      delta: delta == null ? null : getFiniteNumber(delta),
      authoritative: authoritative === true,
      eventKind: normalizeJogText(eventKind),
      calibration: Object.freeze({
        active: !!(calibration && calibration.active),
        action: calibrationAction ? String(calibrationAction) : null,
        pageRole: calibration && calibration.pageRole || getCalibrationPageRole(),
        pagePath: calibration && calibration.pagePath || getCalibrationPagePath(),
        selectedSide: calibration && calibration.side || null,
        selectedMode,
        selectedSurface,
        observedMode,
        observedSurface,
        expectedMotion: calibration && calibration.active
          ? describeCalibrationExpectedMotion(selectedSurface)
          : null,
        recorded: calibrationAction === 'recorded',
        ignored: calibrationAction === 'ignored',
        waiting: calibrationAction === 'waiting',
        reason: calibrationReason || null,
      }),
    });
  } catch {}
}

function createCalibrationEventSnapshot(info, {
  side = null,
  lane = null,
  effectiveLane = null,
  delta = null,
  authoritative = false,
} = {}) {
  return Object.freeze({
    type: normalizeJogText(info && info.type),
    side: side || null,
    lane: normalizeJogText(lane),
    effectiveLane: normalizeMotionLane(effectiveLane),
    delta: delta == null ? null : getFiniteNumber(delta),
    authoritative: authoritative === true,
    timestamp: getFiniteNumber(info && info.timestamp),
    canonicalTarget: info && info.canonicalTarget ? String(info.canonicalTarget) : null,
    mappingId: info && info.mappingId ? String(info.mappingId) : null,
  });
}

function noteCalibrationSeenEvent(calibration, info, details = {}) {
  if (!calibration || !calibration.active) return;
  refreshCalibrationPageContext(calibration);
  calibration.lastSeenJogEvent = createCalibrationEventSnapshot(info, details);
}

function noteCalibrationTouchEvent(calibration, info, details = {}) {
  if (!calibration || !calibration.active) return;
  refreshCalibrationPageContext(calibration);
  const snapshot = createCalibrationEventSnapshot(info, details);
  calibration.touchSeen = true;
  calibration.lastSeenJogEvent = snapshot;
  calibration.lastSeenTouchEvent = snapshot;
}

function noteCalibrationMotionEvent(calibration, info, details = {}) {
  if (!calibration || !calibration.active) return;
  refreshCalibrationPageContext(calibration);
  const snapshot = createCalibrationEventSnapshot(info, details);
  calibration.motionSeen = true;
  calibration.lastSeenJogEvent = snapshot;
  calibration.lastSeenMotionEvent = snapshot;
}

function noteCalibrationIgnoredEvent(calibration, reason, info, details = {}) {
  if (!calibration || !calibration.active) return;
  refreshCalibrationPageContext(calibration);
  calibration.ignoredEventCount += 1;
  calibration.lastIgnoredReason = reason || null;
  calibration.lastSeenJogEvent = createCalibrationEventSnapshot(info, details);
}

function isSidePlatterMotionEvent(eventSnapshot) {
  const lane = normalizeMotionLane(eventSnapshot && eventSnapshot.lane);
  const effectiveLane = normalizeMotionLane(eventSnapshot && eventSnapshot.effectiveLane);
  return (
    lane === 'wheel_side'
    || lane === 'wheel_side_shifted'
    || effectiveLane === 'wheel_side'
    || effectiveLane === 'wheel_side_shifted'
  );
}

function isTopTouchMotionEvent(eventSnapshot) {
  const lane = normalizeMotionLane(eventSnapshot && eventSnapshot.lane);
  const effectiveLane = normalizeMotionLane(eventSnapshot && eventSnapshot.effectiveLane);
  return (
    lane === 'platter_vinyl_on'
    || lane === 'platter_vinyl_off'
    || lane === 'platter_shifted'
    || effectiveLane === 'scratch'
    || effectiveLane === 'scratch_shifted'
    || effectiveLane === 'jog_cutter'
  );
}

function buildCalibrationWarning(calibration, totalEventCount) {
  const viewerWarning = getCalibrationViewerWarning(calibration.pageRole);
  if (viewerWarning) return viewerWarning;
  if (totalEventCount > 0) return null;
  if (
    normalizeCalibrationSurface(calibration.surface) === 'top_touch'
    && isSidePlatterMotionEvent(calibration.lastSeenMotionEvent)
  ) {
    return 'Side platter motion was received, but top-touch calibration is waiting for platter CC 34/35/41.';
  }
  if (
    normalizeCalibrationSurface(calibration.surface) === 'side'
    && isTopTouchMotionEvent(calibration.lastSeenMotionEvent)
  ) {
    return 'Top-touch platter motion was received, but side calibration is waiting for side-wheel CC 33/38.';
  }
  if (
    normalizeCalibrationSurface(calibration.surface) === 'top_touch'
    && calibration.touchSeen
    && !calibration.motionSeen
  ) {
    return 'Top touch was detected, but no platter motion CC was received.';
  }
  if (calibration.lastIgnoredReason) return `No calibration samples were recorded. ${calibration.lastIgnoredReason}`;
  return 'No jog motion events reached the runtime during calibration. Check host.html, MIDI input, and that the FLX6 jog wheel is producing normalized motion events.';
}

function buildCalibrationSummary(calibration) {
  refreshCalibrationPageContext(calibration);
  const entries = Array.from(calibration.entries.values()).map((entry) => {
    const currentDirectScale = Number.isFinite(Number(entry.currentDirectScale))
      ? Number(entry.currentDirectScale)
      : (entry.totalAbsDelta > 0 ? entry.appliedAbsAngle / entry.totalAbsDelta : null);
    const suggestedDegreesPerCountFromSigned = getCalibrationSuggestionDegrees(entry.totalDelta);
    const suggestedDegreesPerCountFromAbs = getCalibrationSuggestionDegrees(entry.totalAbsDelta);
    const suggestedDegreesPerCount = suggestedDegreesPerCountFromSigned ?? suggestedDegreesPerCountFromAbs;

    return Object.freeze({
      side: entry.side,
      lane: entry.lane,
      mode: entry.mode || null,
      surface: entry.surface || null,
      eventCount: entry.eventCount,
      totalDelta: entry.totalDelta,
      totalAbsDelta: entry.totalAbsDelta,
      currentDirectScale: roundJogNumberOrNull(currentDirectScale),
      visualDegreesMoved: roundJogNumberOrNull(entry.appliedAbsAngle),
      suggestedDegreesPerCountFromSigned,
      suggestedDegreesPerCountFromAbs,
      suggestedDegreesPerCount,
      suggestedDirectScale: suggestedDegreesPerCount,
      note: getCalibrationNote(entry.totalDelta, entry.totalAbsDelta),
    });
  });

  const totalEventCount = entries.reduce((sum, entry) => sum + entry.eventCount, 0);
  const totalDeltaCount = entries.reduce((sum, entry) => sum + entry.totalAbsDelta, 0);

  return Object.freeze({
    active: !!calibration.active,
    side: calibration.side || null,
    mode: calibration.mode || null,
    surface: calibration.surface || null,
    startedAt: calibration.startedAt,
    stoppedAt: calibration.stoppedAt,
    touchSeen: !!calibration.touchSeen,
    motionSeen: !!calibration.motionSeen,
    ignoredEventCount: calibration.ignoredEventCount || 0,
    lastIgnoredReason: calibration.lastIgnoredReason || null,
    lastSeenJogEvent: calibration.lastSeenJogEvent || null,
    lastSeenMotionEvent: calibration.lastSeenMotionEvent || null,
    lastSeenTouchEvent: calibration.lastSeenTouchEvent || null,
    pageRole: calibration.pageRole || 'unknown',
    pagePath: calibration.pagePath || null,
    warning: buildCalibrationWarning(calibration, totalEventCount),
    totalEventCount,
    totalDeltaCount,
    lanes: Object.freeze(entries),
  });
}

function printCalibrationSummary(summary) {
  try {
    console.info('[JOG calibration]', summary);
  } catch {}
  return summary;
}

function calibrationSelectionMatches(calibration, calibrationKey) {
  if (!calibrationKey || !calibrationKey.side) return false;

  const selectedMode = normalizeCalibrationMode(calibration && calibration.mode);
  const selectedSurface = normalizeCalibrationSurface(calibration && calibration.surface);

  if (selectedMode && selectedMode !== normalizeCalibrationMode(calibrationKey.mode)) return false;
  if (selectedSurface && selectedSurface !== normalizeCalibrationSurface(calibrationKey.surface)) return false;
  return true;
}

function recordCalibrationSample(calibration, motion, profile) {
  if (!calibration.active) return;
  const calibrationKey = motion && motion.calibrationKey;
  const delta = Number(motion && motion.delta) || 0;
  if (!calibrationKey || !calibrationKey.side) return;
  if (calibration.side && calibration.side !== calibrationKey.side) return;
  if (!calibrationSelectionMatches(calibration, calibrationKey)) return;

  const motionLane = normalizeMotionLane(motion && motion.effectiveLane) || JOG_DEFAULT_LANE;
  const key = `${calibrationKey.side}:${motionLane}`;
  const entry = calibration.entries.get(key) || {
    side: calibrationKey.side,
    lane: motionLane,
    mode: calibrationKey.mode || null,
    surface: calibrationKey.surface || null,
    eventCount: 0,
    totalDelta: 0,
    totalAbsDelta: 0,
    currentDirectScale: 0,
    appliedAbsAngle: 0,
  };

  entry.eventCount += 1;
  entry.totalDelta += delta;
  entry.totalAbsDelta += Math.abs(delta);
  entry.currentDirectScale = Number(profile && profile.directScale) || 0;
  entry.appliedAbsAngle += Math.abs(delta * (Number(profile && profile.directScale) || 0));
  calibration.entries.set(key, entry);
}

function isLikelyJogEvent(info) {
  if (!info || typeof info !== 'object') return false;
  if (getAuthoritativeJogVisual(info)) return true;
  const canonicalTarget = String(info.canonicalTarget || '').toLowerCase();
  const mappingId = String(info.mappingId || '').toLowerCase();
  if (canonicalTarget.includes('.jog.') || mappingId.includes('.jog.')) return true;
  const lane = getEventJogLane(info);
  return !!(normalizeMotionLane(lane) || normalizeTouchLane(lane));
}

function resolveJogMotionSample(sideState, info, lane, feelConfig, side, calibrationPreferences) {
  const delta = decodeJogDelta((info.value ?? info.d2 ?? 0) | 0, getJogDeltaCodec(feelConfig));
  const inputLane = normalizeMotionLane(lane) || getJogDefaultLane(feelConfig);
  sideState.inputLane = inputLane;
  const effectiveLane = resolveEffectiveJogLane(info, sideState, feelConfig);
  const calibrationKey = resolveJogCalibrationProfileKey({
    side,
    inputLane,
    effectiveLane,
    touchActive: sideState.touchActive,
    jogCutterKnown: sideState.jogCutterKnown,
    jogCutterActive: sideState.jogCutterActive,
    jogVinylModeKnown: sideState.jogVinylModeKnown,
    jogVinylMode: sideState.jogVinylMode,
  });
  const profile = applyJogCalibrationToLaneProfile(
    getJogLaneProfile(effectiveLane, feelConfig),
    {
      side,
      lane: effectiveLane,
      mode: calibrationKey.mode,
      surface: calibrationKey.surface,
      preferences: calibrationPreferences,
    },
  );
  return { delta, inputLane, effectiveLane, calibrationKey, profile };
}

function createSideState() {
  return {
    angle: 0,
    vel: 0,
    calibratedMotion: false,
    damping: jogMotionProfiles.default.damping,
    inputLane: null,
    motionLane: null,
    motionMode: 'idle',
    touchActive: false,
    touchLane: null,
    jogCutterKnown: false,
    jogCutterActive: false,
    jogVinylModeKnown: false,
    jogVinylMode: null,
    renderDirty: false,
    el: null,
  };
}

function toIdVariants(id) {
  const v = String(id || '');
  const a = new Set([v]);
  if (v.includes('_x5F_')) a.add(v.replace(/_x5F_/g, '_'));
  if (v.includes('_')) a.add(v.replace(/_/g, '_x5F_'));
  return [...a];
}

function getEl(id) {
  for (const vid of toIdVariants(id)) {
    const el = document.getElementById(vid);
    if (el) return el;
  }
  return null;
}

function normalizeJogTargetId(target) {
  return String(target || '')
    .toLowerCase()
    .replace(/_x5f_/g, '_');
}

function getJogSideFromTarget(target) {
  const id = normalizeJogTargetId(target);
  if (/^jog_l(?:_|$)/.test(id)) return 'L';
  if (/^jog_r(?:_|$)/.test(id)) return 'R';
  return null;
}

function getAuthoritativeJogVisual(info) {
  const visual = info && info.render && info.render.jogVisual;
  return visual && typeof visual === 'object' ? visual : null;
}

function getJogSideFromCanonicalInfo(info) {
  const authoritative = getAuthoritativeJogVisual(info);
  if (authoritative && (authoritative.side === 'L' || authoritative.side === 'R')) {
    return authoritative.side;
  }

  const canonicalTarget = String(info && info.canonicalTarget || '').toLowerCase();
  const mappingId = String(info && info.mappingId || '').toLowerCase();

  if (canonicalTarget === 'deck.left.jog.motion' || canonicalTarget === 'deck.left.jog.touch') return 'L';
  if (canonicalTarget === 'deck.right.jog.motion' || canonicalTarget === 'deck.right.jog.touch') return 'R';
  if (mappingId.startsWith('deck.left.jog.motion') || mappingId.startsWith('deck.left.jog.touch')) return 'L';
  if (mappingId.startsWith('deck.right.jog.motion') || mappingId.startsWith('deck.right.jog.touch')) return 'R';
  return null;
}

function applyRotation(el, ang) {
  if (!el) return;
  try {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
    el.style.transform = `rotate(${ang}deg)`;
  } catch {}
  try {
    const bb = el.getBBox();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.setAttribute('transform', `rotate(${ang} ${cx} ${cy})`);
  } catch {}
}

function clearStyleProp(style, name) {
  if (!style || !name) return;
  if (typeof style.removeProperty === 'function') {
    style.removeProperty(name);
    return;
  }
  delete style[name];
}

function roundJogNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(4));
}

function getWindowLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeCalibrationMode(value) {
  const text = normalizeJogText(value);
  if (text === 'normal') return 'normal';
  if (text === 'vinyl') return 'vinyl';
  if (text === 'jog_cutter' || text === 'jog-cutter' || text === 'jog cutter') return 'jog_cutter';
  return null;
}

function getCalibrationModeForLane(lane) {
  const normalizedLane = normalizeMotionLane(lane);
  if (!normalizedLane) return null;

  if (normalizedLane === 'jog_cutter') return 'jog_cutter';

  if (
    normalizedLane === 'platter_vinyl_on'
    || normalizedLane === 'platter_vinyl_off'
    || normalizedLane === 'platter_shifted'
    || normalizedLane === 'scratch'
    || normalizedLane === 'scratch_shifted'
  ) {
    return 'vinyl';
  }

  if (normalizedLane === 'wheel_side' || normalizedLane === 'wheel_side_shifted') {
    return 'normal';
  }

  return null;
}

function createEmptyJogCalibrationPreferences(controllerId = JOG_CALIBRATION_CONTROLLER_ID) {
  return {
    controllerId,
    jog: {
      left: {},
      right: {},
    },
  };
}

function normalizeJogCalibrationEntry(entry) {
  const source = asObject(entry);
  if (!source) return null;

  const ticksPerTurn = Math.abs(Number(source.ticksPerTurn) || 0);
  const visualDegreesPerTick = getFiniteNumber(source.visualDegreesPerTick);
  if (!(ticksPerTurn > 0) || !(visualDegreesPerTick > 0)) return null;

  const normalized = {
    ticksPerTurn: roundJogNumber(ticksPerTurn),
    visualDegreesPerTick: roundJogNumber(visualDegreesPerTick),
  };

  const smoothing = getFiniteNumber(source.smoothing);
  if (smoothing != null) normalized.smoothing = roundJogNumber(smoothing);

  const updatedAt = getFiniteNumber(source.updatedAt);
  if (updatedAt != null) normalized.updatedAt = updatedAt;

  return Object.freeze(normalized);
}

function hasCalibrationModePreferences(modePreferences) {
  if (!modePreferences || typeof modePreferences !== 'object') return false;
  if (normalizeJogCalibrationEntry(modePreferences)) return true;
  if (normalizeJogCalibrationEntry(modePreferences[JOG_CALIBRATION_DEFAULT_SCOPE])) return true;
  return JOG_CALIBRATION_SURFACES.some((surface) => !!normalizeJogCalibrationEntry(modePreferences[surface]));
}

function freezeCalibrationModePreferences(source = {}) {
  const out = {};

  const legacyEntry = normalizeJogCalibrationEntry(source);
  if (legacyEntry) {
    out[JOG_CALIBRATION_DEFAULT_SCOPE] = legacyEntry;
    return Object.freeze(out);
  }

  const normalizedSource = asObject(source) || {};
  const defaultEntry = normalizeJogCalibrationEntry(normalizedSource[JOG_CALIBRATION_DEFAULT_SCOPE]);
  if (defaultEntry) out[JOG_CALIBRATION_DEFAULT_SCOPE] = defaultEntry;

  JOG_CALIBRATION_SURFACES.forEach((surface) => {
    const entry = normalizeJogCalibrationEntry(normalizedSource[surface]);
    if (entry) out[surface] = entry;
  });

  return Object.freeze(out);
}

function freezeCalibrationSidePreferences(source = {}) {
  const out = {};
  JOG_CALIBRATION_MODES.forEach((mode) => {
    if (!source || !Object.prototype.hasOwnProperty.call(source, mode)) return;
    const modePreferences = freezeCalibrationModePreferences(source[mode]);
    if (hasCalibrationModePreferences(modePreferences)) out[mode] = modePreferences;
  });
  return Object.freeze(out);
}

export function normalizeJogCalibrationPreferences(
  preferences,
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
) {
  const source = asObject(preferences) || {};
  const jog = asObject(source.jog) || {};

  return Object.freeze({
    controllerId: controllerId || JOG_CALIBRATION_CONTROLLER_ID,
    jog: Object.freeze({
      left: freezeCalibrationSidePreferences(asObject(jog.left) || {}),
      right: freezeCalibrationSidePreferences(asObject(jog.right) || {}),
    }),
  });
}

function hasSavedJogCalibration(preferences) {
  const normalized = normalizeJogCalibrationPreferences(preferences);
  return ['left', 'right'].some((sideKey) => (
    JOG_CALIBRATION_MODES.some((mode) => hasCalibrationModePreferences(normalized.jog[sideKey][mode]))
  ));
}

function persistJogCalibrationPreferences(preferences, {
  storage = getWindowLocalStorage(),
  storageKey = JOG_CALIBRATION_STORAGE_KEY,
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
} = {}) {
  const normalized = normalizeJogCalibrationPreferences(preferences, controllerId);
  if (!storage || typeof storage.setItem !== 'function') return normalized;

  try {
    if (!hasSavedJogCalibration(normalized)) {
      if (typeof storage.removeItem === 'function') storage.removeItem(storageKey);
      else storage.setItem(storageKey, JSON.stringify(createEmptyJogCalibrationPreferences(controllerId)));
      return normalized;
    }
    storage.setItem(storageKey, JSON.stringify(normalized));
  } catch {}

  return normalized;
}

export function loadJogCalibrationPreferences({
  storage = getWindowLocalStorage(),
  storageKey = JOG_CALIBRATION_STORAGE_KEY,
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
} = {}) {
  if (!storage || typeof storage.getItem !== 'function') {
    return normalizeJogCalibrationPreferences(null, controllerId);
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return normalizeJogCalibrationPreferences(null, controllerId);
    return normalizeJogCalibrationPreferences(JSON.parse(raw), controllerId);
  } catch {
    return normalizeJogCalibrationPreferences(null, controllerId);
  }
}

function cloneCalibrationPreferences(preferences, controllerId = JOG_CALIBRATION_CONTROLLER_ID) {
  const current = normalizeJogCalibrationPreferences(preferences, controllerId);
  const next = createEmptyJogCalibrationPreferences(controllerId);

  ['left', 'right'].forEach((sideKey) => {
    JOG_CALIBRATION_MODES.forEach((modeKey) => {
      const modePreferences = current.jog[sideKey][modeKey];
      if (!hasCalibrationModePreferences(modePreferences)) return;
      const clonedMode = {};
      const defaultEntry = normalizeJogCalibrationEntry(modePreferences[JOG_CALIBRATION_DEFAULT_SCOPE]);
      if (defaultEntry) clonedMode[JOG_CALIBRATION_DEFAULT_SCOPE] = defaultEntry;
      JOG_CALIBRATION_SURFACES.forEach((surfaceKey) => {
        const entry = normalizeJogCalibrationEntry(modePreferences[surfaceKey]);
        if (entry) clonedMode[surfaceKey] = entry;
      });
      if (Object.keys(clonedMode).length) {
        next.jog[sideKey][modeKey] = clonedMode;
      }
    });
  });

  return next;
}

export function getJogCalibrationEntry(preferences, {
  side = null,
  lane = null,
  mode = null,
  surface = null,
} = {}) {
  const sideKey = getCalibrationSideKey(side);
  if (!sideKey) return null;

  const normalizedPreferences = normalizeJogCalibrationPreferences(preferences);
  const resolvedMode = normalizeCalibrationMode(mode) || getCalibrationModeForLane(lane);
  if (!resolvedMode) return null;

  const modePreferences = normalizedPreferences.jog[sideKey][resolvedMode];
  if (!hasCalibrationModePreferences(modePreferences)) return null;

  const resolvedSurface = normalizeCalibrationSurface(surface) || getCalibrationSurfaceForLane(lane);
  if (resolvedSurface && modePreferences[resolvedSurface]) {
    return modePreferences[resolvedSurface];
  }

  return modePreferences[JOG_CALIBRATION_DEFAULT_SCOPE] || null;
}

export function applyJogCalibrationToLaneProfile(
  profile,
  {
    side = null,
    lane = null,
    mode = null,
    surface = null,
    preferences = null,
  } = {},
) {
  const calibrationEntry = getJogCalibrationEntry(preferences, {
    side,
    lane,
    mode,
    surface,
  });
  if (!calibrationEntry) return profile;

  const directScale = getFiniteNumber(calibrationEntry.visualDegreesPerTick);
  if (!(directScale > 0)) return profile;

  return Object.freeze({
    ...profile,
    calibrated: true,
    physicalDegreesPerTick: directScale,
    directScale,
    velocityScale: 0,
    maxVel: 0,
  });
}

function computeCalibrationTicksPerTurn(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const signedTicks = Math.abs(Number(entry.totalDelta) || 0);
  if (signedTicks > 0) return signedTicks;
  const absoluteTicks = Math.abs(Number(entry.totalAbsDelta) || 0);
  return absoluteTicks > 0 ? absoluteTicks : null;
}

export function buildJogCalibrationPreview(summary, {
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
  mode = null,
  surface = null,
  updatedAt = Date.now(),
} = {}) {
  const source = asObject(summary) || {};
  const resolvedMode = normalizeCalibrationMode(mode) || normalizeCalibrationMode(source.mode);
  const resolvedSurface = normalizeCalibrationSurface(surface) || normalizeCalibrationSurface(source.surface);
  const lanes = Array.isArray(source.lanes) ? source.lanes : [];
  const grouped = new Map();

  lanes.forEach((laneSummary) => {
    const lane = normalizeMotionLane(laneSummary && laneSummary.lane);
    const entryMode = normalizeCalibrationMode(laneSummary && laneSummary.mode)
      || resolvedMode
      || getCalibrationModeForLane(lane);
    if (!lane || !entryMode || (resolvedMode && entryMode !== resolvedMode)) return;

    const entrySurface = normalizeCalibrationSurface(laneSummary && laneSummary.surface)
      || resolvedSurface
      || getCalibrationSurfaceForLane(lane);
    if (!entrySurface || (resolvedSurface && entrySurface !== resolvedSurface)) return;

    const side = normalizeCalibrationSide(laneSummary && laneSummary.side);
    const sideKey = getSideKey(side);
    if (!sideKey) return;

    const groupedKey = `${sideKey}:${entryMode}:${entrySurface}`;
    const entry = grouped.get(groupedKey) || {
      side: sideKey,
      mode: entryMode,
      surface: entrySurface,
      eventCount: 0,
      totalDelta: 0,
      totalAbsDelta: 0,
      laneCount: 0,
      note: null,
    };

    entry.eventCount += Number(laneSummary && laneSummary.eventCount) || 0;
    entry.totalDelta += Number(laneSummary && laneSummary.totalDelta) || 0;
    entry.totalAbsDelta += Math.abs(Number(laneSummary && laneSummary.totalAbsDelta) || 0);
    entry.laneCount += 1;
    if (!entry.note && laneSummary && laneSummary.note) entry.note = String(laneSummary.note);
    grouped.set(groupedKey, entry);
  });

  const authoredAt = getFiniteNumber(updatedAt) ?? Date.now();
  const entries = Array.from(grouped.values())
    .map((entry) => {
      const ticksPerTurn = computeCalibrationTicksPerTurn(entry);
      if (!(ticksPerTurn > 0)) return null;

      return Object.freeze({
        side: entry.side,
        mode: entry.mode,
        surface: entry.surface,
        ticksPerTurn: roundJogNumber(ticksPerTurn),
        visualDegreesPerTick: roundJogNumber(360 / ticksPerTurn),
        eventCount: entry.eventCount,
        totalDelta: entry.totalDelta,
        totalAbsDelta: entry.totalAbsDelta,
        laneCount: entry.laneCount,
        note: entry.note,
        updatedAt: authoredAt,
      });
    })
    .filter(Boolean);

  return Object.freeze({
    controllerId: controllerId || JOG_CALIBRATION_CONTROLLER_ID,
    mode: resolvedMode,
    surface: resolvedSurface,
    entries: Object.freeze(entries),
  });
}

export function saveJogCalibrationPreferences(summary, {
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
  mode = null,
  surface = null,
  preferences = null,
  storage = getWindowLocalStorage(),
  storageKey = JOG_CALIBRATION_STORAGE_KEY,
  updatedAt = Date.now(),
} = {}) {
  const preview = buildJogCalibrationPreview(summary, {
    controllerId,
    mode,
    surface,
    updatedAt,
  });
  const next = cloneCalibrationPreferences(preferences, controllerId);

  preview.entries.forEach((entry) => {
    if (!entry || !entry.side || !entry.mode || !entry.surface) return;
    next.jog[entry.side][entry.mode] = next.jog[entry.side][entry.mode] || {};
    next.jog[entry.side][entry.mode][entry.surface] = normalizeJogCalibrationEntry(entry);
  });

  const normalized = persistJogCalibrationPreferences(next, {
    storage,
    storageKey,
    controllerId,
  });

  return Object.freeze({
    preview,
    preferences: normalized,
  });
}

export function resetJogCalibrationPreferences(preferences, {
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
  side = null,
  mode = null,
  surface = null,
  storage = getWindowLocalStorage(),
  storageKey = JOG_CALIBRATION_STORAGE_KEY,
} = {}) {
  const next = cloneCalibrationPreferences(preferences, controllerId);

  const targetSideKey = getCalibrationSideKey(side);
  const sideKeys = targetSideKey ? [targetSideKey] : ['left', 'right'];
  const targetMode = normalizeCalibrationMode(mode);
  const modes = targetMode ? [targetMode] : [...JOG_CALIBRATION_MODES];
  const targetSurface = normalizeCalibrationSurface(surface);

  sideKeys.forEach((sideKey) => {
    modes.forEach((modeKey) => {
      if (!hasCalibrationModePreferences(next.jog[sideKey][modeKey])) return;
      if (!targetSurface) {
        delete next.jog[sideKey][modeKey];
        return;
      }
      delete next.jog[sideKey][modeKey][targetSurface];
      if (!hasCalibrationModePreferences(next.jog[sideKey][modeKey])) {
        delete next.jog[sideKey][modeKey];
      }
    });
  });

  return persistJogCalibrationPreferences(next, {
    storage,
    storageKey,
    controllerId,
  });
}

function findJogSide(info, mapEntries) {
  const canonicalSide = getJogSideFromCanonicalInfo(info);
  if (canonicalSide) return canonicalSide;

  const type = (info.type || '').toLowerCase();
  const code = type === 'cc' ? (info.controller ?? info.d1) : info.d1;
  const key = `${type}:${info.ch}:${code}`;
  const hits = (mapEntries || []).filter((m) =>
    (m.key && m.key === key && m.target)
    || (!m.key && m.type === type && m.ch === info.ch && m.code === (info.controller ?? info.d1) && m.target)
  );

  for (const hit of hits) {
    const side = getJogSideFromTarget(hit.target);
    if (side) return side;
  }
  return null;
}

function updateJogVisualState(sideState) {
  const el = sideState.el;
  if (!el) return;

  const motionLane = normalizeMotionLane(sideState.motionLane);
  const touchLane = normalizeTouchLane(sideState.touchLane);
  const scratchActive = sideState.touchActive && isScratchLikeMotionMode(sideState.motionMode);
  const lane = scratchActive && motionLane
    ? motionLane
    : sideState.touchActive
      ? (touchLane || motionLane || 'touch')
      : (motionLane || touchLane || 'idle');

  el.dataset.jogTouchActive = sideState.touchActive ? 'true' : 'false';
  el.dataset.jogScratchActive = scratchActive ? 'true' : 'false';
  el.dataset.jogLane = lane;
  el.dataset.jogMotionMode = sideState.motionMode || 'idle';

  el.classList.toggle('jog-touch-active', sideState.touchActive);
  el.classList.toggle('jog-scratch-active', scratchActive);

  if (sideState.touchActive) {
    el.style.filter = scratchActive
      ? 'brightness(1.22) saturate(1.08)'
      : 'brightness(1.12)';
    return;
  }

  clearStyleProp(el.style, 'filter');
}

function setInfoJogVisual(info, snapshot) {
  if (!info || typeof info !== 'object' || !snapshot) return;
  const render = info.render && typeof info.render === 'object'
    ? { ...info.render }
    : {};
  render.jogVisual = snapshot;
  info.render = render;
}

function buildJogVisualSnapshot(side, sideState, info, now, authoredAt = undefined) {
  const snapshotLane = sideState.motionLane || sideState.touchLane || null;
  const timestamp = Number.isFinite(Number(authoredAt))
    ? Number(authoredAt)
    : (Number.isFinite(Number(info && info.timestamp))
      ? Number(info.timestamp)
      : now);

  return {
    side,
    angle: roundJogNumber(sideState.angle),
    vel: roundJogNumber(sideState.vel),
    damping: roundJogNumber(sideState.damping),
    lane: snapshotLane,
    motionMode: sideState.motionMode || 'idle',
    touchActive: !!sideState.touchActive,
    touchLane: sideState.touchLane || null,
    authoredAt: timestamp,
    frameMs: JOG_RENDER_FRAME_MS,
  };
}

function advanceJogStateForAge(sideState, visual, now) {
  const authoredAt = Number(visual && visual.authoredAt);
  if (!Number.isFinite(authoredAt)) return;

  const ageMs = Math.max(0, Math.min(JOG_MAX_CATCHUP_MS, now - authoredAt));
  if (!ageMs || Math.abs(sideState.vel) < JOG_MIN_ACTIVE_VELOCITY) return;

  const frameMs = Math.max(1, Number(visual && visual.frameMs) || JOG_RENDER_FRAME_MS);
  const frameCount = Math.max(0, (ageMs / frameMs) - 1);
  const damping = Number(sideState.damping);

  if (!Number.isFinite(frameCount) || frameCount <= 0 || !Number.isFinite(damping)) return;

  if (Math.abs(damping - 1) < 1e-9) {
    sideState.angle += sideState.vel * frameCount;
    return;
  }

  const dampPow = Math.pow(damping, frameCount);
  sideState.angle += sideState.vel * ((1 - dampPow) / (1 - damping));
  sideState.vel *= dampPow;
  if (Math.abs(sideState.vel) < JOG_MIN_ACTIVE_VELOCITY) sideState.vel = 0;
}

function syncSideStateFromControllerState(sideState, side, info) {
  const sideKey = getSideKey(side);
  const controllerState = info && info.controllerState;
  if (!sideKey || !controllerState || typeof controllerState !== 'object') return;

  const jogTouch = getBooleanState(controllerState.jogTouch, sideKey);
  if (typeof jogTouch === 'boolean') {
    sideState.touchActive = jogTouch;
    if (!jogTouch) sideState.touchLane = null;
  }

  if (controllerState.jogLane && hasOwn(controllerState.jogLane, sideKey)) {
    const lane = normalizeJogText(controllerState.jogLane[sideKey]);
    if (normalizeTouchLane(lane)) {
      sideState.touchLane = lane;
    } else if (normalizeMotionLane(lane)) {
      sideState.inputLane = lane;
    }
  }

  const jogCutter = getBooleanState(controllerState.jogCutter, sideKey);
  if (jogCutter === null) {
    sideState.jogCutterKnown = false;
    sideState.jogCutterActive = false;
  } else if (typeof jogCutter === 'boolean') {
    sideState.jogCutterKnown = true;
    sideState.jogCutterActive = jogCutter;
  }

  const jogVinylMode = getBooleanState(controllerState.jogVinylMode, sideKey);
  if (jogVinylMode === null) {
    sideState.jogVinylModeKnown = false;
    sideState.jogVinylMode = null;
  } else if (typeof jogVinylMode === 'boolean') {
    sideState.jogVinylModeKnown = true;
    sideState.jogVinylMode = jogVinylMode;
  }
}

function applyAuthoritativeJogVisual(sideState, info, visual, now, feelConfig) {
  const fallbackProfile = getJogLaneProfile(visual && visual.lane, feelConfig);
  sideState.angle = Number.isFinite(Number(visual.angle)) ? Number(visual.angle) : sideState.angle;
  sideState.vel = Number.isFinite(Number(visual.vel)) ? Number(visual.vel) : 0;
  sideState.calibratedMotion = false;
  sideState.damping = Number.isFinite(Number(visual.damping))
    ? Number(visual.damping)
    : fallbackProfile.damping;
  sideState.motionLane = normalizeMotionLane(visual && visual.lane);
  sideState.motionMode = visual && visual.motionMode
    ? String(visual.motionMode)
    : (sideState.touchActive ? 'scratch' : 'idle');
  sideState.touchActive = !!(visual && visual.touchActive);
  sideState.touchLane = normalizeTouchLane(visual && visual.touchLane)
    || (sideState.touchActive ? 'touch' : null);

  if (sideState.motionLane === 'jog_cutter') {
    sideState.jogCutterKnown = true;
    sideState.jogCutterActive = true;
  }

  advanceJogStateForAge(sideState, visual, now);
  if (sideState.el) applyRotation(sideState.el, sideState.angle);
  updateJogVisualState(sideState);
  sideState.renderDirty = false;
  setInfoJogVisual(info, buildJogVisualSnapshot(visual.side || null, sideState, info, now, now));
}

export function installJogRuntime({
  getUnifiedMap = () => [],
  getFeelConfig = getWindowFeelConfig,
  exposeGlobalControls = false,
  now = () => Date.now(),
  controllerId = JOG_CALIBRATION_CONTROLLER_ID,
  calibrationStorageKey = JOG_CALIBRATION_STORAGE_KEY,
} = {}) {
  const CFG = { mode: 'tape' };
  let calibrationPreferences = loadJogCalibrationPreferences({
    controllerId,
    storageKey: calibrationStorageKey,
  });
  const S = {
    L: createSideState(),
    R: createSideState(),
    anim: null,
    calibration: createCalibrationState(),
  };

  function resolveJogEls() {
    S.L.el = getEl('jog_L');
    S.R.el = getEl('jog_R');
    updateJogVisualState(S.L);
    updateJogVisualState(S.R);
  }

  function scheduleTick() {
    if (S.anim != null) return;
    S.anim = requestAnimationFrame(tick);
  }

  function tick() {
    S.anim = null;
    if (CFG.mode !== 'tape') return;

    let needsAnotherFrame = false;

    ['L', 'R'].forEach((side) => {
      const j = S[side];
      if (!j.el) return;
      let renderedBeforeAdvance = false;

      if (j.renderDirty) {
        applyRotation(j.el, j.angle);
        j.renderDirty = false;
        renderedBeforeAdvance = true;
      }

      if (Math.abs(j.vel) < JOG_MIN_ACTIVE_VELOCITY) {
        j.vel = 0;
        return;
      }

      if (j.calibratedMotion) {
        j.vel = 0;
        return;
      }

      j.angle += j.vel;
      j.vel *= j.damping;
      if (Math.abs(j.vel) < JOG_MIN_ACTIVE_VELOCITY) j.vel = 0;

      if (renderedBeforeAdvance) {
        j.renderDirty = true;
        needsAnotherFrame = true;
        return;
      }

      applyRotation(j.el, j.angle);
      if (Math.abs(j.vel) >= JOG_MIN_ACTIVE_VELOCITY) {
        needsAnotherFrame = true;
      }
    });

    if (needsAnotherFrame) scheduleTick();
  }

  function handleJogTouch(side, sideState, info, lane) {
    const feelConfig = getFeelConfig?.();
    const wasTouchActive = !!sideState.touchActive;

    sideState.touchActive = isBinaryEventActive(info);
    sideState.touchLane = sideState.touchActive
      ? (normalizeTouchLane(lane) || sideState.touchLane || 'touch')
      : null;

    if (wasTouchActive && !sideState.touchActive && isScratchLikeMotionMode(sideState.motionMode)) {
      const releaseLane = resolveEffectiveJogLane(null, sideState, feelConfig);
      const releaseProfile = getJogLaneProfile(releaseLane, feelConfig);
      sideState.motionLane = releaseLane;
      sideState.damping = releaseProfile.damping;
      sideState.motionMode = Math.abs(sideState.vel) >= JOG_MIN_ACTIVE_VELOCITY
        ? releaseProfile.motionMode
        : 'idle';
    }

    updateJogVisualState(sideState);
    if (Math.abs(sideState.vel) >= JOG_MIN_ACTIVE_VELOCITY) scheduleTick();
  }

  function handleJogMotion(sideState, motion) {
    const delta = Number(motion && motion.delta) || 0;
    const inputLane = normalizeMotionLane(motion && motion.inputLane) || JOG_DEFAULT_LANE;
    const effectiveLane = normalizeMotionLane(motion && motion.effectiveLane) || inputLane;
    const profile = motion && motion.profile ? motion.profile : getJogLaneProfile(effectiveLane, getFeelConfig?.());
    const calibratedMotion = !!(profile && profile.calibrated);

    sideState.inputLane = inputLane;
    sideState.motionLane = effectiveLane;
    sideState.motionMode = profile.motionMode;
    sideState.calibratedMotion = calibratedMotion;
    sideState.damping = profile.damping;
    sideState.angle += delta * profile.directScale;
    if (calibratedMotion) {
      sideState.vel = 0;
    } else {
      sideState.vel += delta * profile.velocityScale;

      if (Number.isFinite(profile.maxVel) && profile.maxVel > 0) {
        sideState.vel = Math.max(-profile.maxVel, Math.min(profile.maxVel, sideState.vel));
      }
    }

    if (delta !== 0) {
      sideState.renderDirty = true;
      scheduleTick();
    }

    updateJogVisualState(sideState);
  }

  function onEvent(info) {
    if (!info || CFG.mode === 'off') return;

    const side = findJogSide(info, getUnifiedMap?.() || []);
    if (!side) {
      if (isLikelyJogEvent(info)) {
        const unresolvedReason = 'A jog-like event reached the runtime, but no matching jog side could be resolved.';
        noteCalibrationIgnoredEvent(
          S.calibration,
          unresolvedReason,
          info,
        );
        setJogRuntimeDiagnostic(info, S.calibration, {
          eventKind: 'unresolved',
          calibrationAction: S.calibration.active ? 'ignored' : null,
          calibrationReason: S.calibration.active ? unresolvedReason : null,
        });
      }
      return;
    }

    const j = S[side];
    syncSideStateFromControllerState(j, side, info);

    const authoritative = getAuthoritativeJogVisual(info);
    const lane = getEventJogLane(info);
    const pageRole = getCalibrationPageRole();

    if (authoritative) {
      const authoritativeReason = S.calibration.active
        ? (pageRole === 'viewer'
          ? 'Viewer relay jogVisual snapshots are not physical calibration samples.'
          : 'Authoritative jogVisual snapshots are relay/render data, not raw physical calibration samples.')
        : null;
      noteCalibrationIgnoredEvent(
        S.calibration,
        authoritativeReason,
        info,
        {
          side,
          lane: authoritative.lane || lane,
          effectiveLane: authoritative.lane || lane,
          authoritative: true,
        },
      );
      setJogRuntimeDiagnostic(info, S.calibration, {
        side,
        lane: authoritative.lane || lane,
        effectiveLane: authoritative.lane || lane,
        authoritative: true,
        eventKind: 'authoritative_relay',
        calibrationAction: authoritativeReason ? 'ignored' : null,
        calibrationReason: authoritativeReason,
      });
      if (!j.el) resolveJogEls();
      if (!j.el) return;
      applyAuthoritativeJogVisual(j, info, authoritative, Number(now()) || 0, getFeelConfig?.());
      info[JOG_EVENT_HANDLED_FLAG] = true;
      if (Math.abs(j.vel) >= JOG_MIN_ACTIVE_VELOCITY) scheduleTick();
      return;
    }

    if (lane === 'touch' || lane === 'touch_shifted') {
      const touchCalibrationReason = S.calibration.active
        ? `Jog touch arrived as a note event. Calibration is still waiting for ${describeCalibrationExpectedMotion(S.calibration.surface)} because the touch note carries no motion delta.`
        : null;
      noteCalibrationTouchEvent(S.calibration, info, {
        side,
        lane,
      });
      setJogRuntimeDiagnostic(info, S.calibration, {
        side,
        lane,
        eventKind: 'touch_note',
        calibrationAction: touchCalibrationReason ? 'waiting' : null,
        calibrationReason: touchCalibrationReason,
      });
      handleJogTouch(side, j, info, lane);
      if (!j.el) resolveJogEls();
      if (!j.el) return;
      updateJogVisualState(j);
      setInfoJogVisual(info, buildJogVisualSnapshot(side, j, info, Number(now()) || 0));
      info[JOG_EVENT_HANDLED_FLAG] = true;
      return;
    }

    if ((info.type || '').toLowerCase() !== 'cc') {
      const nonCcReason = 'The jog event was not a CC motion event, so calibration ignored it.';
      noteCalibrationIgnoredEvent(
        S.calibration,
        nonCcReason,
        info,
        {
          side,
          lane,
        },
      );
      setJogRuntimeDiagnostic(info, S.calibration, {
        side,
        lane,
        eventKind: 'non_cc',
        calibrationAction: S.calibration.active ? 'ignored' : null,
        calibrationReason: S.calibration.active ? nonCcReason : null,
      });
      return;
    }

    const feelConfig = getFeelConfig?.();
    const inputLane = normalizeMotionLane(lane) || getJogDefaultLane(feelConfig);
    const motion = CFG.mode === 'tape'
      ? resolveJogMotionSample(j, info, lane, feelConfig, side, calibrationPreferences)
      : null;
    noteCalibrationMotionEvent(S.calibration, info, {
      side,
      lane,
      effectiveLane: motion ? motion.effectiveLane : inputLane,
      delta: motion ? motion.delta : decodeJogDelta((info.value ?? info.d2 ?? 0) | 0, getJogDeltaCodec(feelConfig)),
    });
    let calibrationAction = null;
    let calibrationReason = null;
    if (CFG.mode !== 'tape') {
      calibrationAction = S.calibration.active ? 'ignored' : null;
      calibrationReason = `Calibration only records tape-mode jog motion. The current jog mode is ${CFG.mode}.`;
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: inputLane,
        },
      );
    } else if (pageRole === 'viewer') {
      calibrationAction = S.calibration.active ? 'ignored' : null;
      calibrationReason = 'Viewer pages do not record jog calibration samples. Run calibration on host.html with live FLX6 input.';
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: motion.effectiveLane,
          delta: motion.delta,
        },
      );
    } else if (S.calibration.active && S.calibration.side && S.calibration.side !== side) {
      calibrationAction = 'ignored';
      calibrationReason = `Calibration is tracking ${S.calibration.side}, so jog motion from ${side} was ignored.`;
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: motion.effectiveLane,
          delta: motion.delta,
        },
      );
    } else if (
      motion
      && S.calibration.active
      && S.calibration.mode
      && normalizeCalibrationMode(motion.calibrationKey && motion.calibrationKey.mode) !== S.calibration.mode
    ) {
      calibrationAction = 'ignored';
      calibrationReason = `Calibration is tracking ${S.calibration.mode}, so ${motion.calibrationKey && motion.calibrationKey.mode || 'unknown'} jog motion was ignored.`;
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: motion.effectiveLane,
          delta: motion.delta,
        },
      );
    } else if (
      motion
      && S.calibration.active
      && S.calibration.surface
      && normalizeCalibrationSurface(motion.calibrationKey && motion.calibrationKey.surface) !== S.calibration.surface
    ) {
      calibrationAction = 'ignored';
      calibrationReason = describeCalibrationSurfaceMismatchReason(
        S.calibration.surface,
        motion.calibrationKey && motion.calibrationKey.surface,
      );
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: motion.effectiveLane,
          delta: motion.delta,
        },
      );
    } else if (motion && motion.delta === 0) {
      calibrationAction = S.calibration.active ? 'ignored' : null;
      calibrationReason = 'The jog motion delta decoded to 0, so there was no movement sample to record.';
      noteCalibrationIgnoredEvent(
        S.calibration,
        calibrationReason,
        info,
        {
          side,
          lane,
          effectiveLane: motion.effectiveLane,
          delta: motion.delta,
        },
      );
    } else if (motion) {
      calibrationAction = S.calibration.active ? 'recorded' : null;
      noteCalibrationSeenEvent(S.calibration, info, {
        side,
        lane,
        effectiveLane: motion.effectiveLane,
        delta: motion.delta,
      });
      recordCalibrationSample(S.calibration, motion, motion.profile);
    }
    setJogRuntimeDiagnostic(info, S.calibration, {
      side,
      lane,
      effectiveLane: motion ? motion.effectiveLane : inputLane,
      delta: motion ? motion.delta : null,
      eventKind: 'motion_cc',
      calibrationKey: motion && motion.calibrationKey,
      calibrationAction,
      calibrationReason,
    });

    if (!j.el) resolveJogEls();
    if (!j.el) return;

    if (CFG.mode === 'absolute') {
      j.angle = (info.value ?? info.d2 ?? 0) * (360 / 127);
      j.vel = 0;
      j.calibratedMotion = false;
      j.inputLane = inputLane;
      j.motionLane = j.inputLane;
      j.motionMode = 'absolute';
      applyRotation(j.el, j.angle);
      updateJogVisualState(j);
      setInfoJogVisual(info, buildJogVisualSnapshot(side, j, info, Number(now()) || 0));
      info[JOG_EVENT_HANDLED_FLAG] = true;
      return;
    }

    if (CFG.mode === 'tape') {
      handleJogMotion(j, motion);
      setInfoJogVisual(info, buildJogVisualSnapshot(side, j, info, Number(now()) || 0));
      info[JOG_EVENT_HANDLED_FLAG] = true;
    }
  }

  resolveJogEls();

  if (!window.__JOG_WRAP__) {
    window.__JOG_WRAP__ = true;
    getRuntimeApp()?.addConsumeTap('jog-runtime', (info) => {
      try { onEvent(info); } catch {}
    }, { phase: 'before' });
  }

  const api = {
    setMode: (m) => {
      CFG.mode = (m === 'off' || m === 'absolute' || m === 'tape') ? m : 'off';
      if (m !== 'tape' && S.anim) {
        cancelAnimationFrame(S.anim);
        S.anim = null;
      }
    },
    get mode() {
      return CFG.mode;
    },
    getJogFeelConfig() {
      return getJogFeelConfig(getFeelConfig?.());
    },
    getJogLaneProfile(lane, sideOrOptions = null, maybeOptions = null) {
      const side = typeof sideOrOptions === 'string' || sideOrOptions == null
        ? sideOrOptions
        : sideOrOptions.side;
      const options = sideOrOptions && typeof sideOrOptions === 'object' && !Array.isArray(sideOrOptions)
        ? sideOrOptions
        : (maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {});
      return applyJogCalibrationToLaneProfile(
        getJogLaneProfile(lane, getFeelConfig?.()),
        {
          side,
          lane,
          mode: options.mode,
          surface: options.surface,
          preferences: calibrationPreferences,
        },
      );
    },
    resolveEffectiveJogLane(info, side) {
      const targetSide = side === 'R' ? S.R : S.L;
      return resolveEffectiveJogLane(info, targetSide, getFeelConfig?.());
    },
    startCalibration(side, options = {}) {
      S.calibration.active = true;
      S.calibration.side = normalizeCalibrationSide(side);
      S.calibration.mode = normalizeCalibrationMode(options.mode);
      S.calibration.surface = normalizeCalibrationSurface(options.surface);
      S.calibration.startedAt = Number(now()) || Date.now();
      S.calibration.stoppedAt = null;
      S.calibration.entries = new Map();
      S.calibration.touchSeen = false;
      S.calibration.motionSeen = false;
      S.calibration.ignoredEventCount = 0;
      S.calibration.lastIgnoredReason = null;
      S.calibration.lastSeenJogEvent = null;
      S.calibration.lastSeenMotionEvent = null;
      S.calibration.lastSeenTouchEvent = null;
      refreshCalibrationPageContext(S.calibration);
      return buildCalibrationSummary(S.calibration);
    },
    stopCalibration() {
      S.calibration.active = false;
      S.calibration.stoppedAt = Number(now()) || Date.now();
      return printCalibrationSummary(buildCalibrationSummary(S.calibration));
    },
    cancelCalibration() {
      S.calibration = createCalibrationState();
      return buildCalibrationSummary(S.calibration);
    },
    getCalibration() {
      return printCalibrationSummary(buildCalibrationSummary(S.calibration));
    },
    getCalibrationPreferences() {
      return calibrationPreferences;
    },
    getCalibrationPreference(selection = {}) {
      return getJogCalibrationEntry(calibrationPreferences, selection);
    },
    previewCalibration(summary, options = {}) {
      return buildJogCalibrationPreview(summary, {
        controllerId,
        ...options,
      });
    },
    saveCalibration(summary, options = {}) {
      const saved = saveJogCalibrationPreferences(summary, {
        controllerId,
        preferences: calibrationPreferences,
        storageKey: calibrationStorageKey,
        ...options,
      });
      calibrationPreferences = saved.preferences;
      return saved;
    },
    resetCalibrationPreference(options = {}) {
      calibrationPreferences = resetJogCalibrationPreferences(calibrationPreferences, {
        controllerId,
        storageKey: calibrationStorageKey,
        ...options,
      });
      return calibrationPreferences;
    },
    listCalibrationModes() {
      return [...JOG_CALIBRATION_MODES];
    },
    listCalibrationSurfaces() {
      return [...JOG_CALIBRATION_SURFACES];
    },
    getState() {
      return {
        L: { ...S.L },
        R: { ...S.R },
      };
    },
  };

  if (exposeGlobalControls) {
    window.__JOG__ = api;
  }

  return api;
}
