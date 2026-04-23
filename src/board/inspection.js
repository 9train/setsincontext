import { loadControllerLearnDraft } from '../learn.js';
import { getUnifiedMapEntries } from './state.js';
import {
  DRAFT_RENDER_OWNERSHIP,
  FALLBACK_RENDER_OWNERSHIP,
  OFFICIAL_RENDER_OWNERSHIP,
  UNKNOWN_RENDER_OWNERSHIP,
  normalizeMapEntries,
  normalizeRenderOwnership,
} from './map-store.js';
import {
  getBoardProfileId,
  getBoardRenderKind,
  inferCanonicalTargetFromMappingId,
  resolveBoardEditorTarget,
  resolveCanonicalRenderTargetId,
  resolveRenderTargetId,
} from './profile.js';
import {
  buildCompatibilityPromotionChecklist,
  buildInspectableMappingReviewPresentation,
  describeCompatibilityAuthorityNote,
  describeCompatibilityDifference,
  describeCompatibilityReviewState,
  describeCompatibilityReviewStateLabel,
  describeCompatibilityReviewStatus,
  describeCompatibilitySource,
  describeCompatibilityWhyExists,
} from './inspection/review-text.js';

function compareOwnership(left = UNKNOWN_RENDER_OWNERSHIP, right = UNKNOWN_RENDER_OWNERSHIP) {
  const order = {
    official: 0,
    draft: 1,
    fallback: 2,
    unknown: 3,
  };
  return (order[left] ?? order.unknown) - (order[right] ?? order.unknown);
}

function sortInspectableMappings(left, right) {
  const ownershipOrder = compareOwnership(left && left.ownership, right && right.ownership);
  if (ownershipOrder !== 0) return ownershipOrder;
  const leftKey = String(left && left.key || '');
  const rightKey = String(right && right.key || '');
  const keyOrder = leftKey.localeCompare(rightKey);
  if (keyOrder !== 0) return keyOrder;
  return String(left && left.targetId || '').localeCompare(String(right && right.targetId || ''));
}

function findInspectableMappingsForTarget(targetId, canonicalTarget, mapEntries = getUnifiedMapEntries()) {
  const resolvedTargetId = resolveRenderTargetId(targetId);
  if (!resolvedTargetId) return [];

  const seen = new Set();
  return normalizeMapEntries(mapEntries, FALLBACK_RENDER_OWNERSHIP)
    .map((entry) => {
      const resolvedEntryTarget = resolveRenderTargetId(entry && entry.target);
      const entryCanonicalTarget = entry && entry.canonicalTarget
        || inferCanonicalTargetFromMappingId(entry && entry.mappingId)
        || null;
      const matchesTarget = !!resolvedEntryTarget && resolvedEntryTarget === resolvedTargetId;
      const matchesCanonicalOnly = !resolvedEntryTarget && !!canonicalTarget && entryCanonicalTarget === canonicalTarget;
      if (!matchesTarget && !matchesCanonicalOnly) return null;

      const record = Object.freeze({
        key: entry && entry.key || null,
        ownership: normalizeRenderOwnership(entry && entry.ownership, FALLBACK_RENDER_OWNERSHIP),
        targetId: resolvedEntryTarget || null,
        declaredTargetId: entry && entry.target || null,
        canonicalTarget: entryCanonicalTarget,
        mappingId: entry && entry.mappingId || null,
        name: entry && entry.name || null,
        type: entry && entry.type || null,
        channel: entry && entry.ch != null ? Number(entry.ch) : null,
        code: entry && entry.code != null ? Number(entry.code) : null,
      });
      const dedupeKey = JSON.stringify([
        record.key,
        record.ownership,
        record.targetId,
        record.canonicalTarget,
        record.mappingId,
      ]);
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      return record;
    })
    .filter(Boolean)
    .sort(sortInspectableMappings);
}

function summarizeInspectableOwnership(mappings) {
  const summary = {
    draft: 0,
    fallback: 0,
    official: 0,
    unknown: 0,
  };
  mappings.forEach((entry) => {
    const key = normalizeRenderOwnership(entry && entry.ownership, UNKNOWN_RENDER_OWNERSHIP);
    summary[key] = (summary[key] || 0) + 1;
  });
  return Object.freeze(summary);
}

function freezeUniqueStrings(values = []) {
  return Object.freeze(Array.from(new Set(
    (Array.isArray(values) ? values : []).filter(Boolean),
  )));
}

function normalizeLearnDraftMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return null;
  const raw = mapping.raw && typeof mapping.raw === 'object'
    ? mapping.raw
    : null;
  const learn = mapping.learn && typeof mapping.learn === 'object'
    ? mapping.learn
    : null;

  return Object.freeze({
    id: mapping.id || null,
    canonical: mapping.canonical || null,
    rawTarget: mapping.rawTarget || null,
    note: mapping.note || null,
    raw: raw
      ? Object.freeze({
          transport: raw.transport || null,
          kind: raw.kind || null,
          channel: raw.channel != null ? Number(raw.channel) : null,
          code: raw.code != null ? Number(raw.code) : null,
          key: raw.key || null,
        })
      : null,
    learn: learn
      ? Object.freeze({
          captureId: learn.captureId || null,
          sourceKey: learn.sourceKey || null,
          assignedAt: learn.assignedAt != null ? Number(learn.assignedAt) : null,
          suggestedBy: learn.suggestedBy || null,
          existingMappingId: learn.existingMappingId || null,
        })
      : null,
  });
}

function buildLearnDraftIndex(profileId = getBoardProfileId()) {
  const draft = loadControllerLearnDraft(profileId);
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.mappings)) {
    return Object.freeze({
      profileId,
      byKey: Object.freeze(new Map()),
    });
  }

  const byKey = new Map();
  draft.mappings.forEach((mapping) => {
    const normalized = normalizeLearnDraftMapping(mapping);
    const sourceKey = normalized && normalized.raw && normalized.raw.key || null;
    if (!normalized || !sourceKey) return;
    const list = byKey.get(sourceKey) || [];
    list.push(normalized);
    byKey.set(sourceKey, list);
  });

  return Object.freeze({
    profileId,
    byKey: Object.freeze(byKey),
  });
}

function findLearnDraftDetails(entry, learnDraftIndex) {
  if (!entry || !entry.key || !learnDraftIndex || !(learnDraftIndex.byKey instanceof Map)) return null;
  const candidates = learnDraftIndex.byKey.get(entry.key);
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const canonicalTarget = entry.canonicalTarget || null;
  const declaredTargetId = entry.declaredTargetId || null;
  return candidates.find((candidate) =>
    candidate
    && (
      candidate.canonical === canonicalTarget
      || candidate.rawTarget === declaredTargetId
      || candidate.rawTarget === entry.targetId
    )
  ) || candidates[0] || null;
}

function deriveCompatibilityReviewStatus(entry, officialSource) {
  const hasOfficialSurface = officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP;
  const sameSurface = !!(
    entry
    && officialSource
    && entry.targetId
    && officialSource.targetId
    && entry.targetId === officialSource.targetId
  );
  const sameCanonical = !!(
    entry
    && officialSource
    && entry.canonicalTarget
    && officialSource.canonicalTarget
    && entry.canonicalTarget === officialSource.canonicalTarget
  );

  if (!hasOfficialSurface) return 'compatibility-owner';
  if (sameSurface && sameCanonical) return 'shadowing-official';
  if (sameSurface) return 'competing-surface';
  if (sameCanonical) return 'supplementary-canonical';
  return 'compatibility-owner';
}

function buildCompatibilityReviewRequirements(entry, learnDraft) {
  const requirements = [];
  const hasCanonicalTarget = !!(entry && entry.canonicalTarget);
  const hasSurfaceTarget = !!(entry && (entry.targetId || entry.declaredTargetId));
  const hasLearnEvidence = !!(
    learnDraft
    && learnDraft.raw
    && learnDraft.raw.key
    && learnDraft.learn
    && learnDraft.learn.captureId
  );

  if (!hasCanonicalTarget) {
    requirements.push('Attach a canonical FLX6 target claim before promotion review.');
  }
  if (!hasSurfaceTarget) {
    requirements.push('Attach the provisional mapping to a concrete board surface before promotion review.');
  }
  if (entry && entry.ownership === DRAFT_RENDER_OWNERSHIP && !hasLearnEvidence) {
    requirements.push('Capture or retain learn-session evidence so this draft is reviewable beyond local compatibility.');
  }

  return freezeUniqueStrings(requirements);
}

function buildCompatibilityPromotionBlockers(entry, officialSource, reviewStatus) {
  const blockers = [];
  if (entry && entry.ownership === FALLBACK_RENDER_OWNERSHIP) {
    blockers.push('Fallback compatibility data cannot be promoted directly; recreate it as draft/learned review data first.');
  }

  if (officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP) {
    if (reviewStatus === 'shadowing-official') {
      blockers.push('Resolve why this draft shadows the existing official FLX6 surface and canonical target.');
    } else if (reviewStatus === 'competing-surface') {
      blockers.push('Resolve the competing surface claim before promotion.');
    } else if (reviewStatus === 'supplementary-canonical') {
      blockers.push('Resolve the supplementary canonical claim against the current official surface before promotion.');
    }
  }

  return freezeUniqueStrings(blockers);
}

function deriveCompatibilityReviewState(entry, learnDraft, officialSource, reviewStatus) {
  const reviewRequirements = buildCompatibilityReviewRequirements(entry, learnDraft);
  const promotionBlockers = buildCompatibilityPromotionBlockers(entry, officialSource, reviewStatus);
  const hasReviewRequirements = reviewRequirements.length > 0;
  const hasPromotionBlockers = promotionBlockers.length > 0;

  let reviewState = 'inspectable-only';
  if (hasPromotionBlockers) {
    reviewState = 'blocked';
  } else if (!hasReviewRequirements && entry && entry.ownership === DRAFT_RENDER_OWNERSHIP) {
    reviewState = 'review-candidate';
  }

  return Object.freeze({
    reviewState,
    reviewRequirements,
    promotionBlockers,
    reviewReady: reviewState === 'review-candidate',
    promotionBlocked: reviewState === 'blocked',
  });
}

function enrichInspectableCompatibilityMapping(entry, officialSource, learnDraftIndex) {
  const learnDraft = findLearnDraftDetails(entry, learnDraftIndex);
  const sourceDetails = describeCompatibilitySource(entry, learnDraft);
  const effectiveTargetId = entry && (
    entry.targetId
    || resolveCanonicalRenderTargetId(entry.canonicalTarget, entry.mappingId)
  ) || null;
  const reviewStatus = deriveCompatibilityReviewStatus(entry, officialSource);
  const reviewStateDetails = deriveCompatibilityReviewState(entry, learnDraft, officialSource, reviewStatus);
  const review = Object.freeze({
    status: reviewStatus,
    label: describeCompatibilityReviewStatus(reviewStatus),
    state: reviewStateDetails.reviewState,
    stateLabel: describeCompatibilityReviewStateLabel(reviewStateDetails.reviewState),
    summary: describeCompatibilityReviewState(
      reviewStateDetails.reviewState,
      reviewStateDetails.promotionBlockers,
      reviewStateDetails.reviewRequirements,
    ),
    requirements: reviewStateDetails.reviewRequirements,
    blockers: reviewStateDetails.promotionBlockers,
    ready: reviewStateDetails.reviewReady,
    blocked: reviewStateDetails.promotionBlocked,
  });
  const presentation = Object.freeze({
    source: sourceDetails.source,
    sourceDetail: sourceDetails.detail,
    whyExists: describeCompatibilityWhyExists(entry, learnDraft),
    differenceSummary: describeCompatibilityDifference(entry, officialSource, effectiveTargetId),
    authorityNote: describeCompatibilityAuthorityNote(entry, officialSource, reviewStatus),
    promotionChecklist: buildCompatibilityPromotionChecklist(entry, officialSource),
  });

  return Object.freeze({
    ...entry,
    effectiveTargetId,
    review,
    presentation,
    reviewStatus: review.status,
    reviewLabel: review.label,
    source: presentation.source,
    sourceDetail: presentation.sourceDetail,
    whyExists: presentation.whyExists,
    differenceSummary: presentation.differenceSummary,
    authorityNote: presentation.authorityNote,
    promotionChecklist: presentation.promotionChecklist,
    reviewState: review.state,
    reviewStateLabel: review.stateLabel,
    reviewStateSummary: review.summary,
    reviewRequirements: review.requirements,
    promotionBlockers: review.blockers,
    reviewReady: review.ready,
    promotionBlocked: review.blocked,
    learn: learnDraft && learnDraft.learn || null,
    learnDraftId: learnDraft && learnDraft.id || null,
    learnDraftNote: learnDraft && learnDraft.note || null,
  });
}

function buildInspectableMappingReview(officialSource, compatibilityMappings, ownershipCounts) {
  const summary = {
    shadowing: 0,
    competing: 0,
    supplementary: 0,
    compatibilityOwner: 0,
  };
  const reviewStateCounts = {
    inspectableOnly: 0,
    reviewCandidate: 0,
    blocked: 0,
  };
  const reviewRequirements = [];
  const promotionBlockers = [];
  const promotionRequirements = [];

  compatibilityMappings.forEach((entry) => {
    if (!entry) return;
    if (entry.reviewStatus === 'shadowing-official') summary.shadowing += 1;
    else if (entry.reviewStatus === 'competing-surface') summary.competing += 1;
    else if (entry.reviewStatus === 'supplementary-canonical') summary.supplementary += 1;
    else summary.compatibilityOwner += 1;

    if (entry.reviewState === 'blocked') reviewStateCounts.blocked += 1;
    else if (entry.reviewState === 'review-candidate') reviewStateCounts.reviewCandidate += 1;
    else reviewStateCounts.inspectableOnly += 1;

    reviewRequirements.push(...(entry.reviewRequirements || []));
    promotionBlockers.push(...(entry.promotionBlockers || []));
    promotionRequirements.push(...(entry.promotionChecklist || []));
  });

  const firstCompatibility = compatibilityMappings[0] || null;
  const authoritativeOwner = officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
    ? OFFICIAL_RENDER_OWNERSHIP
    : firstCompatibility && firstCompatibility.ownership || UNKNOWN_RENDER_OWNERSHIP;
  const reviewRequired = (ownershipCounts.draft || 0) > 0 || (ownershipCounts.fallback || 0) > 0;
  const reviewStatus = officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
    ? (reviewRequired ? 'review-needed' : 'clear')
    : firstCompatibility
      ? 'compatibility-only'
      : 'unmapped';
  const reviewState = reviewStateCounts.blocked > 0
    ? 'blocked'
    : reviewStateCounts.reviewCandidate > 0
      ? 'review-candidate'
      : reviewStateCounts.inspectableOnly > 0
        ? 'inspectable-only'
        : compatibilityMappings.length
          ? 'clear'
          : 'unmapped';
  const presentation = buildInspectableMappingReviewPresentation({
    officialSource,
    firstCompatibility,
    summary,
    reviewStateCounts,
    compatibilityMappings,
    ownershipCounts,
    reviewState,
  });
  const mergedPromotionRequirements = [...presentation.promotionRequirements];
  if (reviewRequired) {
    mergedPromotionRequirements.push(
      officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
        ? 'Any accepted mapping change must move into the official FLX6 profile path before it reads as shipped truth.'
        : 'Accepted behavior still needs an official FLX6 target/profile definition before it reads as shipped truth.'
    );
  }
  mergedPromotionRequirements.push(...promotionRequirements);

  return Object.freeze({
    status: reviewStatus,
    reviewState,
    reviewLabel: presentation.reviewLabel,
    authoritativeOwner,
    authoritativeLabel: presentation.authoritativeLabel,
    authoritativeSummary: presentation.authoritativeSummary,
    provisionalSummary: presentation.provisionalSummary,
    explicitReviewSummary: presentation.explicitReviewSummary,
    shadowingCount: summary.shadowing,
    competingCount: summary.competing,
    supplementaryCount: summary.supplementary,
    compatibilityOnlyCount: summary.compatibilityOwner,
    inspectableOnlyCount: reviewStateCounts.inspectableOnly,
    reviewCandidateCount: reviewStateCounts.reviewCandidate,
    blockedCount: reviewStateCounts.blocked,
    counts: Object.freeze({
      shadowing: summary.shadowing,
      competing: summary.competing,
      supplementary: summary.supplementary,
      compatibilityOnly: summary.compatibilityOwner,
    }),
    reviewCounts: Object.freeze({
      inspectableOnly: reviewStateCounts.inspectableOnly,
      reviewCandidate: reviewStateCounts.reviewCandidate,
      blocked: reviewStateCounts.blocked,
    }),
    presentation,
    reviewRequired,
    reviewRequirements: freezeUniqueStrings(reviewRequirements),
    promotionBlockers: freezeUniqueStrings(promotionBlockers),
    promotionRequirements: freezeUniqueStrings(mergedPromotionRequirements),
  });
}

export function inspectBoardTarget(targetId = '', mapEntries = getUnifiedMapEntries()) {
  const resolvedTargetId = resolveRenderTargetId(targetId);
  if (!resolvedTargetId) return null;

  const officialTarget = resolveBoardEditorTarget(resolvedTargetId)
    || resolveBoardEditorTarget(targetId)
    || null;
  const canonicalTarget = officialTarget && officialTarget.canonicalTarget || null;
  const renderKind = officialTarget && officialTarget.renderKind
    || getBoardRenderKind(resolvedTargetId, canonicalTarget)
    || null;
  const mappings = findInspectableMappingsForTarget(resolvedTargetId, canonicalTarget, mapEntries);
  const ownershipCounts = summarizeInspectableOwnership(mappings);
  const officialStatus = canonicalTarget || (officialTarget && officialTarget.owner === 'profile')
    ? OFFICIAL_RENDER_OWNERSHIP
    : UNKNOWN_RENDER_OWNERSHIP;
  const officialSource = Object.freeze({
    status: officialStatus,
    source: officialStatus === OFFICIAL_RENDER_OWNERSHIP ? 'official-profile-ui' : 'unknown',
    owner: officialTarget && officialTarget.owner || 'unknown',
    targetId: resolvedTargetId,
    canonicalTarget,
    label: officialTarget && officialTarget.label || resolvedTargetId,
    renderKind,
  });
  const learnDraftIndex = buildLearnDraftIndex();
  const compatibilityMappings = mappings
    .filter((entry) => entry.ownership !== OFFICIAL_RENDER_OWNERSHIP)
    .map((entry) => enrichInspectableCompatibilityMapping(entry, officialSource, learnDraftIndex));
  const mappingReview = buildInspectableMappingReview(officialSource, compatibilityMappings, ownershipCounts);

  return Object.freeze({
    targetId: resolvedTargetId,
    label: officialTarget && officialTarget.label || resolvedTargetId,
    canonicalTarget,
    renderKind,
    aliases: officialTarget && Array.isArray(officialTarget.aliases)
      ? officialTarget.aliases.slice()
      : [],
    officialSource,
    compatibilityMappings,
    ownershipCounts,
    mappingReview,
  });
}
