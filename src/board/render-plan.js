import { getUnifiedMapEntries } from './state.js';
import {
  FALLBACK_RENDER_OWNERSHIP,
  OFFICIAL_RENDER_OWNERSHIP,
  UNKNOWN_RENDER_OWNERSHIP,
  hasOwn,
  infoKey,
  normalizeCompatibilityOwnership,
  normalizeRenderOwnership,
} from './map-store.js';
import {
  inferCanonicalTargetFromMappingId,
  resolveCanonicalRenderTargetId,
  resolveRenderTargetId,
} from './profile.js';

const PHYSICAL_CROSSFADER_TARGET_ID = 'xfader_slider';
const CROSSFADER_MAPPING_ID_RE = /^mixer\.crossfader\./i;
const JOG_CONTROL_RE = /^deck\.(left|right)\.jog\./i;

function findEntryByResolvedInfo(info) {
  const target = String(
    info && info.render && info.render.targetId
    || info && info.resolvedRenderTarget
    || ''
  ).trim();
  if (!target) return null;

  return {
    target,
    canonicalTarget: info && info.render && info.render.canonicalTarget
      || info && info.canonicalTarget
      || inferCanonicalTargetFromMappingId(info && info.mappingId)
      || null,
    mappingId: info && info.render && info.render.mappingId
      || info && info.mappingId
      || null,
    context: info && info.context || null,
    profileId: info && info.profileId || null,
  };
}

function getOfficialRenderResolution(info) {
  if (!info || typeof info !== 'object') return null;

  const render = info.render && typeof info.render === 'object'
    ? info.render
    : null;
  const hasResolvedTargetField = hasOwn(info, 'resolvedRenderTarget');
  if (!render && !hasResolvedTargetField) return null;

  const target = String(
    render && render.targetId
    || info.resolvedRenderTarget
    || ''
  ).trim() || null;

  return {
    target,
    canonicalTarget: render && render.canonicalTarget
      || info.canonicalTarget
      || inferCanonicalTargetFromMappingId(info.mappingId)
      || null,
    mappingId: render && render.mappingId
      || info.mappingId
      || null,
    context: info.context || null,
    profileId: info.profileId || null,
    truthStatus: render && render.truthStatus
      || info.truthStatus
      || null,
    source: render && render.source
      || (target ? 'resolved-render-target' : 'resolved-render-missing'),
  };
}

function findEntryByCanonicalInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const target = resolveCanonicalRenderTargetId(info.canonicalTarget, info.mappingId);
  if (!target) return null;
  return {
    target,
    canonicalTarget: info.canonicalTarget || inferCanonicalTargetFromMappingId(info.mappingId) || null,
    mappingId: info.mappingId || null,
    context: info.context || null,
    profileId: info.profileId || null,
  };
}

function findEntryByRawInfo(info, mapEntries = getUnifiedMapEntries()) {
  const key = infoKey(info);
  return (mapEntries || []).find((entry) =>
    (entry.key && entry.key === key && entry.target)
    || (!entry.key && entry.type === (info.type || '').toLowerCase()
      && entry.ch === info.ch
      && entry.code === (info.controller ?? info.d1)
      && entry.target)
  ) || null;
}

function findOfficialMeaningHint(info) {
  if (!info || typeof info !== 'object') return null;
  const canonicalTarget = info.canonicalTarget
    || inferCanonicalTargetFromMappingId(info.mappingId)
    || null;
  const mappingId = info.mappingId || null;
  if (!canonicalTarget && !mappingId) return null;

  return {
    target: null,
    canonicalTarget,
    mappingId,
    context: info.context || null,
    profileId: info.profileId || null,
    truthStatus: info.truthStatus || null,
    source: 'controller-meaning',
  };
}

function findExplicitCompatibilityEntry(info) {
  if (!info || typeof info !== 'object') return null;

  const compat = info.boardCompat && typeof info.boardCompat === 'object'
    ? info.boardCompat
    : null;
  const target = String(
    compat && compat.targetId
    || (info.__flxDebug === true ? info.__flxDebugTarget : '')
    || ''
  ).trim();
  if (!target) return null;

  return {
    target,
    canonicalTarget: compat && compat.canonicalTarget
      || info.canonicalTarget
      || inferCanonicalTargetFromMappingId(info.mappingId)
      || null,
    mappingId: compat && compat.mappingId
      || info.mappingId
      || null,
    context: compat && compat.context
      || info.context
      || null,
    profileId: compat && compat.profileId
      || info.profileId
      || null,
    source: compat && compat.source
      || (info.__flxDebug === true ? 'debug-explicit-target' : 'explicit-compatibility-target'),
    reason: compat && compat.reason
      || (info.__flxDebug === true ? 'debug-only-visible-control' : 'explicit-compatibility-target'),
  };
}

function describeMissingOfficialRender(info) {
  const meaningHint = findOfficialMeaningHint(info);
  if (!meaningHint) return null;

  const hasCanonicalBoardTarget = !!resolveCanonicalRenderTargetId(
    meaningHint.canonicalTarget,
    meaningHint.mappingId,
  );

  return {
    ...meaningHint,
    source: hasCanonicalBoardTarget
      ? 'resolved-render-target-required'
      : 'no-official-render-target',
    reason: hasCanonicalBoardTarget
      ? 'official-render-target-required'
      : 'official-meaning-without-render-target',
  };
}

function allowLegacyMapCompatibility(options) {
  // Diagnostic/debug escape hatch only. Normal host/viewer runtime must stay on
  // official render payloads and explicit debug targets, never raw learned maps.
  return !!(options && options.allowLegacyMapFallback === true);
}

function deriveRenderPlanOwnership(authority, entry, explicitOwnership = null) {
  const declaredOwnership = normalizeRenderOwnership(explicitOwnership, null);
  if (declaredOwnership) return declaredOwnership;

  const normalizedAuthority = String(authority || '').trim().toLowerCase();
  if (normalizedAuthority.startsWith('official')) return OFFICIAL_RENDER_OWNERSHIP;
  if (normalizedAuthority === 'compatibility-raw') {
    return normalizeCompatibilityOwnership(entry && entry.ownership, FALLBACK_RENDER_OWNERSHIP);
  }
  if (normalizedAuthority.startsWith('compatibility')) return FALLBACK_RENDER_OWNERSHIP;
  if (normalizedAuthority === 'unmapped') return UNKNOWN_RENDER_OWNERSHIP;
  return normalizeRenderOwnership(entry && entry.ownership, UNKNOWN_RENDER_OWNERSHIP);
}

function resolvePlannedTargetId(targetId) {
  return resolveRenderTargetId(targetId) || String(targetId || '').trim() || null;
}

function isPhysicalCrossfaderTargetId(targetId) {
  return resolvePlannedTargetId(targetId) === PHYSICAL_CROSSFADER_TARGET_ID;
}

function matchesOfficialCrossfaderRawLane(info) {
  const type = String(info && (info.type || info.interaction) || '').trim().toLowerCase();
  if (type !== 'cc') return false;

  const channel = Number(info && (info.ch ?? info.channel));
  const code = Number(info && (info.controller ?? info.code ?? info.d1));
  return channel === 7 && (code === 31 || code === 63);
}

function getRenderPlanCanonicalTarget(info, renderPlan) {
  return renderPlan && renderPlan.canonicalTarget
    || info && info.canonicalTarget
    || inferCanonicalTargetFromMappingId(renderPlan && renderPlan.mappingId || info && info.mappingId)
    || null;
}

function getRenderPlanMappingId(info, renderPlan) {
  return renderPlan && renderPlan.mappingId
    || info && info.mappingId
    || null;
}

function hasJogControlTruth(info, renderPlan) {
  const canonicalTarget = String(getRenderPlanCanonicalTarget(info, renderPlan) || '').trim();
  const mappingId = String(getRenderPlanMappingId(info, renderPlan) || '').trim();
  return JOG_CONTROL_RE.test(canonicalTarget) || JOG_CONTROL_RE.test(mappingId);
}

function hasOfficialPhysicalCrossfaderTruth(info, renderPlan) {
  const canonicalTarget = String(getRenderPlanCanonicalTarget(info, renderPlan) || '').trim();
  const mappingId = String(getRenderPlanMappingId(info, renderPlan) || '').trim();
  if (canonicalTarget === 'mixer.crossfader') return true;
  if (CROSSFADER_MAPPING_ID_RE.test(mappingId)) return true;
  return matchesOfficialCrossfaderRawLane(info);
}

function createRenderPlan({
  targetId = null,
  authority = 'unmapped',
  source = 'unmapped',
  fallbackReason = null,
  entry = null,
  ownership = null,
  blocked = false,
} = {}) {
  const compatibility = authority === 'compatibility-render'
    || authority === 'compatibility-canonical'
    || authority === 'compatibility-raw';
  return {
    targetId: resolvePlannedTargetId(targetId),
    authority,
    source,
    fallbackReason,
    canonicalTarget: entry && entry.canonicalTarget || null,
    mappingId: entry && entry.mappingId || null,
    context: entry && entry.context || null,
    profileId: entry && entry.profileId || null,
    ownership: deriveRenderPlanOwnership(authority, entry, ownership),
    fallback: compatibility,
    compatibility,
    blocked: blocked === true || authority === 'official-missing',
  };
}

function protectPhysicalCrossfaderRender(info, renderPlan) {
  if (!renderPlan || !isPhysicalCrossfaderTargetId(renderPlan.targetId)) return renderPlan;
  if (hasOfficialPhysicalCrossfaderTruth(info, renderPlan) && !hasJogControlTruth(info, renderPlan)) {
    return renderPlan;
  }

  return {
    ...renderPlan,
    targetId: null,
    source: 'unsafe-crossfader-render-blocked',
    fallbackReason: 'physical-crossfader-truth-required',
    blocked: true,
  };
}

function createProtectedRenderPlan(info, options = {}) {
  return protectPhysicalCrossfaderRender(info, createRenderPlan(options));
}

export function resolveInfoRenderPlan(info, mapEntries = getUnifiedMapEntries(), options = {}) {
  const officialEntry = findEntryByResolvedInfo(info);
  if (officialEntry) {
    return createProtectedRenderPlan(info, {
      targetId: officialEntry.target,
      authority: 'official-render',
      source: getOfficialRenderResolution(info)?.source || 'resolved-render-target',
      entry: officialEntry,
    });
  }

  const officialResolution = getOfficialRenderResolution(info);
  if (officialResolution) {
    return createProtectedRenderPlan(info, {
      targetId: null,
      authority: 'official-missing',
      source: officialResolution.source || 'resolved-render-missing',
      fallbackReason: officialResolution.truthStatus === 'blocked'
        ? 'official-render-blocked'
        : 'official-render-missing',
      entry: officialResolution,
    });
  }

  const explicitCompatibilityEntry = findExplicitCompatibilityEntry(info);
  if (explicitCompatibilityEntry) {
    return createProtectedRenderPlan(info, {
      targetId: explicitCompatibilityEntry.target,
      authority: 'compatibility-render',
      source: explicitCompatibilityEntry.source,
      fallbackReason: explicitCompatibilityEntry.reason,
      entry: explicitCompatibilityEntry,
    });
  }

  if (allowLegacyMapCompatibility(options)) {
    const canonicalEntry = findEntryByCanonicalInfo(info);
    if (canonicalEntry) {
      return createProtectedRenderPlan(info, {
        targetId: canonicalEntry.target,
        authority: 'compatibility-canonical',
        source: 'legacy-map-compatibility',
        fallbackReason: 'explicit-legacy-canonical-compatibility',
        entry: canonicalEntry,
      });
    }
  }

  const missingOfficialRender = describeMissingOfficialRender(info);
  if (missingOfficialRender) {
    return createProtectedRenderPlan(info, {
      targetId: null,
      authority: 'official-missing',
      source: missingOfficialRender.source,
      fallbackReason: missingOfficialRender.reason,
      entry: missingOfficialRender,
    });
  }

  if (allowLegacyMapCompatibility(options)) {
    const rawEntry = findEntryByRawInfo(info, mapEntries);
    if (rawEntry) {
      return createProtectedRenderPlan(info, {
        targetId: rawEntry.target,
        authority: 'compatibility-raw',
        source: 'legacy-map-compatibility',
        fallbackReason: 'explicit-legacy-raw-compatibility',
        entry: rawEntry,
      });
    }
  }

  return createProtectedRenderPlan(info);
}

export function resolveInfoRenderTarget(info, mapEntries = getUnifiedMapEntries(), options = {}) {
  return resolveInfoRenderPlan(info, mapEntries, options).targetId;
}

function setBoardRenderInfo(info, boardRender) {
  if (!info || typeof info !== 'object' || !boardRender) return null;

  const frozenBoardRender = Object.freeze({
    targetId: boardRender.targetId || null,
    authority: boardRender.authority || 'unmapped',
    source: boardRender.source || 'unmapped',
    fallbackReason: boardRender.fallbackReason || null,
    canonicalTarget: boardRender.canonicalTarget || null,
    mappingId: boardRender.mappingId || null,
    ownership: normalizeRenderOwnership(boardRender.ownership, UNKNOWN_RENDER_OWNERSHIP),
    fallback: !!boardRender.fallback,
    compatibility: !!boardRender.compatibility,
    blocked: !!boardRender.blocked,
    applied: boardRender.applied === true,
    outcome: boardRender.outcome || null,
    detail: boardRender.detail || null,
  });

  try { info._targetId = frozenBoardRender.targetId; } catch {}
  try { info._boardRender = frozenBoardRender; } catch {}
  try { info._renderAuthority = frozenBoardRender.authority; } catch {}
  return frozenBoardRender;
}

export function attachBoardRenderInfo(info, renderPlan) {
  if (!info || typeof info !== 'object' || !renderPlan) return null;

  return setBoardRenderInfo(info, {
    targetId: renderPlan.targetId || null,
    authority: renderPlan.authority || 'unmapped',
    source: renderPlan.source || 'unmapped',
    fallbackReason: renderPlan.fallbackReason || null,
    canonicalTarget: renderPlan.canonicalTarget || null,
    mappingId: renderPlan.mappingId || null,
    ownership: renderPlan.ownership || UNKNOWN_RENDER_OWNERSHIP,
    fallback: !!renderPlan.fallback,
    compatibility: !!renderPlan.compatibility,
    blocked: !!renderPlan.blocked,
    applied: false,
    outcome: renderPlan.blocked
      ? 'blocked'
      : renderPlan.targetId
        ? 'pending'
        : 'absent',
    detail: renderPlan.fallbackReason
      || renderPlan.source
      || (renderPlan.targetId ? 'render-target-resolved' : 'no-render-target'),
  });
}

export function updateBoardRenderInfo(info, updates = {}) {
  if (!info || typeof info !== 'object') return null;
  const current = info._boardRender || {};
  return setBoardRenderInfo(info, {
    ...current,
    ...updates,
  });
}
