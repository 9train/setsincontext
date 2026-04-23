import { decodeRelative7 as decodeRelative7Delta } from '../controllers/core/delta-codecs.js';
import { pairedAbsoluteState } from './state.js';
import { resolveRenderTargetId } from './profile.js';

export function decodeRelative7(v) {
  return decodeRelative7Delta(v);
}

function clampMidi7(v) {
  return Math.max(0, Math.min(127, Number(v) || 0));
}

export function getLinearControlRatio(value) {
  const v = clampMidi7(value);
  if (v === 64) return 0.5;
  return v / 127;
}

export function getLinearControlPosition({ min, max, value, invert = false }) {
  const lo = Number(min) || 0;
  const hi = Number(max) || 0;
  const t = getLinearControlRatio(value);
  return invert ? hi - ((hi - lo) * t) : lo + ((hi - lo) * t);
}

function getPairedAbsoluteKey(entry, info) {
  return `${resolveRenderTargetId(entry?.target)}:${info?.ch ?? 'any'}`;
}

function getAbsolutePairLane(entry, info) {
  const mappingId = String(info?.mappingId || '').trim().toLowerCase();
  if (mappingId.endsWith('.primary')) return 'primary';
  if (mappingId.endsWith('.secondary')) return 'secondary';

  const targetId = resolveRenderTargetId(entry?.target);
  if (!/^slider_tempo_(l|r)$/i.test(targetId)) return null;

  const controller = Number(info?.controller ?? info?.d1);
  if (controller === 0) return 'primary';
  if (controller === 32) return 'secondary';
  return null;
}

export function getContinuousRenderValue(entry, info, state = pairedAbsoluteState) {
  const value = clampMidi7(info?.value ?? info?.d2);
  const lane = getAbsolutePairLane(entry, info);
  const isPairedAbsolute = lane && (
    String(info?.valueShape || '').toLowerCase() === 'absolute'
    || /^slider_tempo_(l|r)$/i.test(resolveRenderTargetId(entry?.target))
  );
  if (!isPairedAbsolute) return value;

  const slotKey = getPairedAbsoluteKey(entry, info);
  const slot = state[slotKey] || (state[slotKey] = { msb: null, lsb: 0 });

  if (lane === 'primary') {
    slot.msb = value;
    return Math.min(127, slot.msb + ((slot.lsb || 0) / 128));
  }

  if (lane === 'secondary') {
    slot.lsb = value;
    if (slot.msb == null) return null;
    return Math.min(127, slot.msb + (slot.lsb / 128));
  }

  return value;
}

export function shouldHoldBinaryVisualState(info) {
  const type = String(info?.type || info?.interaction || '').trim().toLowerCase();
  return !!(
    info
    && info.mapped === true
    && String(info.valueShape || '').trim().toLowerCase() === 'binary'
    && (type === 'noteon' || type === 'noteoff')
  );
}
