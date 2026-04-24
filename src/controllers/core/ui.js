import { lookupCanonicalAlias } from './aliases.js';
import { getDefaultControllerProfile } from '../profiles/index.js';

const FALLBACK_EDITOR_ROOT_PATTERNS = Object.freeze([
  /^(slider_ch[1-4])$/i,
  /^(slider_tempo_(l|r))$/i,
  /^(xfader(_slider)?|crossfader)$/i,
  /^(channel(_x5f_)?[1-4])$/i,
  /^(jog_[lr])$/i,
  /^(trim_|hi_|mid_|low_|filter_|knob_)/i,
  /^pad_(l|r)_[0-8]\b/i,
  /^(play_|cue_|load_|hotcue_|padfx_|sampler_|beatjump_|beatsync_)/i,
]);

function normalizeProfile(profile) {
  return profile && typeof profile === 'object'
    ? profile
    : getDefaultControllerProfile();
}

export function toIdVariants(id = '') {
  const value = String(id || '').trim();
  const out = new Set([value]);
  if (value.includes('_x5F_')) out.add(value.replace(/_x5F_/g, '_'));
  if (value.includes('_')) out.add(value.replace(/_/g, '_x5F_'));
  return [...out].flatMap((item) => [item, item.toLowerCase()]);
}

function idsMatch(a, b) {
  if (!a || !b) return false;
  const candidates = new Set(toIdVariants(a));
  return toIdVariants(b).some((value) => candidates.has(value));
}

function lookupRecordValue(record, key) {
  if (!record || !key) return null;
  for (const variant of toIdVariants(key)) {
    if (Object.prototype.hasOwnProperty.call(record, variant)) return record[variant];
  }
  return null;
}

function getProfileUi(profile) {
  return normalizeProfile(profile)?.ui || null;
}

function getProfileAliases(profile) {
  const normalizedProfile = normalizeProfile(profile);
  return normalizedProfile?.aliases || null;
}

function normalizeUiTarget(target, profile, owner = 'profile') {
  if (!target || !target.targetId) return null;
  return {
    targetId: resolveProfileSurfaceTarget(target.targetId, profile) || String(target.targetId),
    canonicalTarget: target.canonicalTarget || null,
    label: target.label || target.targetId,
    aliases: Array.isArray(target.aliases) ? [...target.aliases] : [],
    renderKind: target.renderKind || null,
    owner,
  };
}

function findDeclaredUiTarget(candidate, profile) {
  const ui = getProfileUi(profile);
  if (!ui || !Array.isArray(ui.editorTargets) || !candidate) return null;
  const input = String(candidate || '').trim();
  for (const target of ui.editorTargets) {
    if (!target || !target.targetId) continue;
    if (target.canonicalTarget && target.canonicalTarget === input) {
      return normalizeUiTarget(target, profile);
    }
    if (idsMatch(target.targetId, input)) {
      return normalizeUiTarget(target, profile);
    }
    if ((target.aliases || []).some((alias) => idsMatch(alias, input))) {
      return normalizeUiTarget(target, profile);
    }
  }
  return null;
}

function getFallbackTargetSortKey(id) {
  if (/^slider_ch/i.test(id)) return `1_${id}`;
  if (/^slider_tempo_/i.test(id)) return `2_${id}`;
  if (/^(xfader|crossfader)/i.test(id)) return `3_${id}`;
  if (/^jog_/i.test(id)) return `4_${id}`;
  if (/^(trim_|hi_|mid_|low_|filter_)/i.test(id)) return `5_${id}`;
  if (/^knob_/i.test(id)) return `6_${id}`;
  if (/^pad_/i.test(id)) return `7_${id}`;
  if (/^(hotcue_|padfx_|sampler_|beatjump_|beatsync_|play_|cue_|load_)/i.test(id)) {
    return `8_${id}`;
  }
  return `z_${id}`;
}

function looksLikeFallbackRootId(id) {
  return FALLBACK_EDITOR_ROOT_PATTERNS.some((pattern) => pattern.test(String(id || '')));
}

function canonicalizeFallbackTarget(element) {
  let current = element;
  while (current && typeof current.getAttribute === 'function') {
    const id = current.getAttribute('id');
    if (id && looksLikeFallbackRootId(id)) return id;
    current = current.parentNode;
  }

  current = element;
  while (current && typeof current.getAttribute === 'function') {
    const id = current.getAttribute('id');
    if (id) return id;
    current = current.parentNode;
  }

  return null;
}

function discoverFallbackEditorTargetIds(svgRoot) {
  if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') return [];
  const seen = new Set();
  const out = [];
  for (const node of svgRoot.querySelectorAll('[id]')) {
    const rootId = canonicalizeFallbackTarget(node);
    if (!rootId) continue;
    const key = toIdVariants(rootId)[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rootId);
  }
  out.sort((left, right) => getFallbackTargetSortKey(left).localeCompare(getFallbackTargetSortKey(right)));
  return out;
}

export function getElByAnyIdIn(root, id) {
  if (!root || !id || typeof root.getElementById !== 'function') return null;
  for (const variant of toIdVariants(id)) {
    const el = root.getElementById(variant);
    if (el) return el;
  }
  return null;
}

export function resolveProfileSurfaceTarget(targetId = '', profile = getDefaultControllerProfile()) {
  const value = String(targetId || '').trim();
  if (!value) return null;
  const surfaceAliases = getProfileUi(profile)?.surfaceAliases || null;
  return lookupRecordValue(surfaceAliases, value) || value;
}

export function lookupProfileCanonicalTarget(targetId = '', profile = getDefaultControllerProfile()) {
  const value = String(targetId || '').trim();
  if (!value) return null;

  const declaredTarget = findDeclaredUiTarget(value, profile);
  if (declaredTarget?.canonicalTarget) return declaredTarget.canonicalTarget;

  const aliases = getProfileAliases(profile);
  return (
    lookupCanonicalAlias(aliases?.controls || null, value)
    || lookupCanonicalAlias(aliases?.surfaceTargets || null, value)
    || null
  );
}

export function inferCanonicalTargetFromMappingId(mappingId = '', profile = getDefaultControllerProfile()) {
  const value = String(mappingId || '').trim();
  if (!value) return null;
  const renderTargets = getProfileUi(profile)?.renderTargets || {};
  for (const canonicalTarget of Object.keys(renderTargets)) {
    if (value === canonicalTarget || value.startsWith(`${canonicalTarget}.`)) {
      return canonicalTarget;
    }
  }
  return null;
}

export function resolveProfileRenderTarget(
  canonicalTarget = '',
  mappingId = '',
  profile = getDefaultControllerProfile(),
) {
  const renderTargets = getProfileUi(profile)?.renderTargets || {};
  const mappingKey = String(mappingId || '').trim();
  if (mappingKey) {
    let candidate = mappingKey;
    while (candidate) {
      const mappedTarget = lookupRecordValue(renderTargets, candidate);
      if (mappedTarget) return resolveProfileSurfaceTarget(mappedTarget, profile);
      const nextCandidate = candidate.replace(/\.[^.]+$/, '');
      if (!nextCandidate || nextCandidate === candidate) break;
      candidate = nextCandidate;
    }
  }

  const canonicalKey = String(canonicalTarget || '').trim() || inferCanonicalTargetFromMappingId(mappingId, profile);
  if (!canonicalKey) return null;
  const targetId = renderTargets[canonicalKey];
  if (targetId) return resolveProfileSurfaceTarget(targetId, profile);

  const declaredTarget = findDeclaredUiTarget(canonicalKey, profile);
  return declaredTarget?.targetId || null;
}

export function resolveProfileEditorTarget(targetId = '', profile = getDefaultControllerProfile()) {
  const value = String(targetId || '').trim();
  if (!value) return null;

  const declaredTarget = findDeclaredUiTarget(value, profile);
  if (declaredTarget) return declaredTarget;

  const canonicalTarget = lookupProfileCanonicalTarget(value, profile);
  const resolvedTargetId = (
    resolveProfileRenderTarget(canonicalTarget, '', profile)
    || resolveProfileSurfaceTarget(value, profile)
    || value
  );

  return {
    targetId: resolvedTargetId,
    canonicalTarget,
    label: resolvedTargetId,
    aliases: [],
    renderKind: null,
    owner: 'fallback',
  };
}

export function resolveProfileEditorTargetFromElement(element, profile = getDefaultControllerProfile()) {
  let current = element;
  let firstId = null;
  while (current && typeof current.getAttribute === 'function') {
    const id = current.getAttribute('id');
    if (id) {
      firstId = firstId || id;
      const declaredTarget = findDeclaredUiTarget(id, profile);
      if (declaredTarget) return declaredTarget;
    }
    current = current.parentNode;
  }
  const fallbackTargetId = canonicalizeFallbackTarget(element);
  return fallbackTargetId
    ? resolveProfileEditorTarget(fallbackTargetId, profile)
    : (firstId ? resolveProfileEditorTarget(firstId, profile) : null);
}

export function listProfileEditorTargetsInSvg(svgRoot, profile = getDefaultControllerProfile()) {
  const seen = new Set();
  const out = [];
  const ui = getProfileUi(profile);

  if (ui && Array.isArray(ui.editorTargets)) {
    for (const target of ui.editorTargets) {
      const normalizedTarget = normalizeUiTarget(target, profile);
      if (!normalizedTarget || !normalizedTarget.targetId) continue;
      if (svgRoot && !getElByAnyIdIn(svgRoot, normalizedTarget.targetId)) continue;
      const key = toIdVariants(normalizedTarget.targetId)[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalizedTarget);
    }
  }

  for (const targetId of discoverFallbackEditorTargetIds(svgRoot)) {
    const normalizedTarget = resolveProfileEditorTarget(targetId, profile);
    if (!normalizedTarget || !normalizedTarget.targetId) continue;
    const key = toIdVariants(normalizedTarget.targetId)[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalizedTarget);
  }

  return out;
}

export function getProfileGroupRules(profile = getDefaultControllerProfile(), fallbackRules = []) {
  const groupRules = getProfileUi(profile)?.groupRules;
  return Array.isArray(groupRules) && groupRules.length ? groupRules : fallbackRules;
}

export function getProfileCalibrationHints(profile = getDefaultControllerProfile()) {
  const hints = getProfileUi(profile)?.calibrationHints;
  return Array.isArray(hints) ? hints : [];
}

export function getProfileRenderKind(
  targetId = '',
  canonicalTarget = '',
  profile = getDefaultControllerProfile(),
) {
  const byTarget = targetId ? findDeclaredUiTarget(targetId, profile) : null;
  if (byTarget?.renderKind) return byTarget.renderKind;

  if (canonicalTarget) {
    const byCanonical = findDeclaredUiTarget(canonicalTarget, profile);
    if (byCanonical?.renderKind) return byCanonical.renderKind;
  }

  return null;
}
