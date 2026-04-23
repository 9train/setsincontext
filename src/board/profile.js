import { getDefaultControllerProfile } from '../controllers/profiles/index.js';
import {
  getElByAnyIdIn,
  getProfileCalibrationHints,
  getProfileRenderKind,
  inferCanonicalTargetFromMappingId as inferCanonicalTargetFromProfileMappingId,
  listProfileEditorTargetsInSvg,
  resolveProfileEditorTarget,
  resolveProfileEditorTargetFromElement,
  resolveProfileRenderTarget,
  resolveProfileSurfaceTarget,
} from '../controllers/core/ui.js';

export const DEFAULT_BOARD_PROFILE = getDefaultControllerProfile();
export const DEFAULT_SVG_URL = DEFAULT_BOARD_PROFILE
  && DEFAULT_BOARD_PROFILE.assets
  && DEFAULT_BOARD_PROFILE.assets.boardSvgPath
  || './assets/board.svg';
export const DEFAULT_MAP_URL = DEFAULT_BOARD_PROFILE
  && DEFAULT_BOARD_PROFILE.assets
  && DEFAULT_BOARD_PROFILE.assets.defaultMapPath
  || './flx6_map.json';

export function getElByAnyId(root, id) {
  return getElByAnyIdIn(root, id);
}

export function resolveRenderTargetId(targetId = '') {
  return resolveProfileSurfaceTarget(targetId, DEFAULT_BOARD_PROFILE) || String(targetId || '');
}

export function resolveCanonicalRenderTargetId(canonicalTarget = '', mappingId = '') {
  return resolveProfileRenderTarget(canonicalTarget, mappingId, DEFAULT_BOARD_PROFILE);
}

export function resolveBoardSelectionFromElement(element) {
  return resolveProfileEditorTargetFromElement(element, DEFAULT_BOARD_PROFILE);
}

export function resolveBoardEditorTarget(targetId = '') {
  return resolveProfileEditorTarget(targetId, DEFAULT_BOARD_PROFILE);
}

export function inferCanonicalTargetFromMappingId(mappingId = '') {
  return inferCanonicalTargetFromProfileMappingId(mappingId, DEFAULT_BOARD_PROFILE);
}

export function getBoardCalibrationHints() {
  return getProfileCalibrationHints(DEFAULT_BOARD_PROFILE);
}

export function getBoardRenderKind(targetId = '', canonicalTarget = '') {
  return getProfileRenderKind(targetId, canonicalTarget, DEFAULT_BOARD_PROFILE);
}

export function listBoardTargetsInSvg(svgRoot) {
  return listProfileEditorTargetsInSvg(svgRoot, DEFAULT_BOARD_PROFILE);
}

export function getBoardProfileId() {
  return DEFAULT_BOARD_PROFILE && DEFAULT_BOARD_PROFILE.id || null;
}
