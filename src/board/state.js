export let svgRoot = null;
export let unifiedMap = [];
export let fileMapCache = [];
export let missingCalibrationHintsWarned = false;

export const lastCCValue = Object.create(null);
export const knobAccumAngle = Object.create(null);
export const jogAngle = Object.create(null);
export const pairedAbsoluteState = Object.create(null);
export const litTimers = Object.create(null);
export const heldBinaryTargets = Object.create(null);

export const CONTINUOUS_LIT_HOLD_MS = 180;
export const BINARY_RELEASE_HOLD_MS = 90;
export const BINARY_FLASH_HOLD_MS = 140;

export const OFFICIAL_RENDER_OWNERSHIP = 'official';
export const DRAFT_RENDER_OWNERSHIP = 'draft';
export const FALLBACK_RENDER_OWNERSHIP = 'fallback';
export const UNKNOWN_RENDER_OWNERSHIP = 'unknown';

export function setBoardSvgRoot(nextSvgRoot) {
  svgRoot = nextSvgRoot || null;
  return svgRoot;
}

export function getBoardSvgRoot() {
  return svgRoot;
}

export function setUnifiedMap(nextMap) {
  unifiedMap = Array.isArray(nextMap) ? nextMap : [];
  return unifiedMap;
}

export function getUnifiedMapEntries() {
  return unifiedMap;
}

export function getUnifiedMap() {
  return unifiedMap.slice();
}

export function setFileMapCache(nextMap) {
  fileMapCache = Array.isArray(nextMap) ? nextMap : [];
  return fileMapCache;
}

export function getFileMapCache() {
  return fileMapCache;
}

export function hasMissingCalibrationHintsWarned() {
  return missingCalibrationHintsWarned;
}

export function setMissingCalibrationHintsWarned(nextValue) {
  missingCalibrationHintsWarned = !!nextValue;
  return missingCalibrationHintsWarned;
}
