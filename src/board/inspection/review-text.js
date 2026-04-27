import {
  DRAFT_RENDER_OWNERSHIP,
  FALLBACK_RENDER_OWNERSHIP,
  OFFICIAL_RENDER_OWNERSHIP,
} from '../map-store.js';

export function describeCompatibilityReviewStatus(reviewStatus) {
  if (reviewStatus === 'shadowing-official') return 'Shadowing Official';
  if (reviewStatus === 'competing-surface') return 'Competing Surface';
  if (reviewStatus === 'supplementary-canonical') return 'Supplementary Canonical';
  return 'Compatibility Owner';
}

export function describeCompatibilitySource(entry, learnDraft) {
  if (learnDraft) {
    return Object.freeze({
      source: 'learn-draft',
      detail: learnDraft.learn && learnDraft.learn.suggestedBy
        ? `Captured through the ${learnDraft.learn.suggestedBy} learn suggestion path.`
        : 'Captured through the learn session and kept separate as draft data.',
    });
  }
  if (entry && entry.ownership === DRAFT_RENDER_OWNERSHIP) {
    return Object.freeze({
      source: 'draft-candidate',
      detail: 'Stored in the local board compatibility map as diagnostic-only draft data.',
    });
  }
  if (entry && entry.ownership === FALLBACK_RENDER_OWNERSHIP) {
    return Object.freeze({
      source: 'fallback-candidate',
      detail: 'Loaded from fallback compatibility data as diagnostic-only metadata, not shipped FLX6 truth.',
    });
  }
  return Object.freeze({
    source: 'unknown',
    detail: 'Compatibility source is not identified yet.',
  });
}

export function describeCompatibilityDifference(entry, officialSource, effectiveTargetId) {
  if (!officialSource || officialSource.status !== OFFICIAL_RENDER_OWNERSHIP) {
    return 'No official FLX6 surface truth is attached here yet.';
  }

  const differences = [];
  if (entry && entry.canonicalTarget) {
    if (entry.canonicalTarget !== officialSource.canonicalTarget) {
      differences.push(`claims ${entry.canonicalTarget} instead of official ${officialSource.canonicalTarget}`);
    }
  } else {
    differences.push(`does not claim the official canonical target ${officialSource.canonicalTarget}`);
  }

  if (effectiveTargetId) {
    if (effectiveTargetId !== officialSource.targetId) {
      differences.push(`points at ${effectiveTargetId} instead of ${officialSource.targetId}`);
    }
  } else {
    differences.push(`does not resolve to the official surface ${officialSource.targetId}`);
  }

  return differences.length
    ? differences.join(' | ')
    : 'Matches the same canonical target and surface as the official FLX6 profile, so it remains provisional until reviewed and promoted explicitly.';
}

export function describeCompatibilityWhyExists(entry, learnDraft) {
  if (learnDraft && learnDraft.note) return learnDraft.note;
  if (learnDraft && learnDraft.learn && learnDraft.learn.existingMappingId) {
    return `Captured during learn review while ${learnDraft.learn.existingMappingId} remained the shipped profile mapping.`;
  }
  if (entry && entry.ownership === DRAFT_RENDER_OWNERSHIP) {
    return 'Saved as a diagnostic-only draft candidate and kept separate from the official FLX6 profile.';
  }
  if (entry && entry.ownership === FALLBACK_RENDER_OWNERSHIP) {
    return 'Kept only as a fallback candidate for diagnostics/import review and should not read as official FLX6 ownership.';
  }
  return 'Compatibility entry is present without official promotion metadata.';
}

export function describeCompatibilityAuthorityNote(entry, officialSource, reviewStatus) {
  if (officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP) {
    if (reviewStatus === 'shadowing-official') {
      return 'This provisional entry mirrors an official FLX6 surface and must not be mistaken for shipped truth.';
    }
    if (reviewStatus === 'competing-surface') {
      return 'This provisional entry points at the same surface as official truth but does not own it.';
    }
    if (reviewStatus === 'supplementary-canonical') {
      return 'This provisional entry supports the same canonical claim but still stays secondary to official surface ownership.';
    }
    return 'Official FLX6 profile truth stays authoritative while this compatibility entry remains provisional.';
  }

  if (entry && entry.ownership === DRAFT_RENDER_OWNERSHIP) {
    return 'This draft candidate is diagnostic-only metadata; it still needs review before any official promotion.';
  }
  if (entry && entry.ownership === FALLBACK_RENDER_OWNERSHIP) {
    return 'This fallback candidate is diagnostic-only compatibility metadata and should not be treated as promoted truth.';
  }
  return 'No authoritative source is attached to this compatibility entry yet.';
}

export function buildCompatibilityPromotionChecklist(entry, officialSource) {
  const checklist = [
    'Verify the raw MIDI lane against the claimed canonical target in the draft review flow.',
    officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
      ? 'Move any accepted change into the official FLX6 profile/UI path before treating it as shipped truth.'
      : 'Attach accepted behavior to an official FLX6 profile target before treating it as shipped truth.',
    'Keep the draft or fallback entry separate until that review is complete.',
  ];

  if (entry && entry.ownership === DRAFT_RENDER_OWNERSHIP) {
    checklist.unshift('Confirm why the draft exists and whether it is shadowing or competing with official truth.');
  }

  return Object.freeze(checklist);
}

export function describeCompatibilityReviewState(reviewState, blockers, reviewRequirements) {
  if (reviewState === 'blocked') {
    return blockers[0]
      || 'Promotion stays blocked until the provisional conflict is resolved.';
  }
  if (reviewState === 'review-candidate') {
    return 'This draft is review-ready, but it still remains provisional until an accepted change lands in the official FLX6 path.';
  }
  if (reviewRequirements.length) {
    return `Inspectable only: ${reviewRequirements[0]}`;
  }
  return 'Inspectable only: this provisional entry still needs explicit review evidence before promotion.';
}

export function describeCompatibilityReviewStateLabel(reviewState) {
  if (reviewState === 'blocked') return 'Promotion Blocked';
  if (reviewState === 'review-candidate') return 'Review Candidate';
  return 'Inspectable Only';
}

export function buildInspectableMappingReviewPresentation({
  officialSource,
  firstCompatibility,
  summary,
  reviewStateCounts,
  compatibilityMappings,
  ownershipCounts,
  reviewState,
}) {
  const authoritativeLabel = officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
    ? 'Official FLX6 Profile Truth'
    : firstCompatibility
      ? 'Compatibility Mapping Only'
      : 'No Attached Mapping';
  const authoritativeSummary = officialSource && officialSource.status === OFFICIAL_RENDER_OWNERSHIP
    ? 'Official FLX6 UI/render metadata currently owns this board surface.'
    : firstCompatibility
      ? `${describeCompatibilityReviewStatus(firstCompatibility.reviewStatus)} candidate data is available for review through ${firstCompatibility.ownership} compatibility data; it does not own this surface.`
      : 'No official or candidate mapping is attached to this board surface.';
  const provisionalSummary = compatibilityMappings.length
    ? `${summary.shadowing} shadowing | ${summary.competing} competing | ${summary.supplementary} supplementary | ${summary.compatibilityOwner} compatibility-only`
    : 'No provisional draft or fallback claims overlap this surface.';
  const explicitReviewSummary = compatibilityMappings.length
    ? `${reviewStateCounts.reviewCandidate} review-candidate | ${reviewStateCounts.inspectableOnly} inspectable-only | ${reviewStateCounts.blocked} blocked`
    : 'No provisional entries currently need review.';
  const reviewLabel = reviewState === 'blocked'
    ? 'Promotion Blocked'
    : reviewState === 'review-candidate'
      ? 'Review Candidate'
      : reviewState === 'inspectable-only'
        ? 'Inspectable Only'
        : reviewState === 'clear'
          ? 'Clear'
          : 'Unmapped';
  const promotionRequirements = [];
  if ((ownershipCounts.draft || 0) > 0) {
    promotionRequirements.push('Review each draft against the raw event, canonical claim, and board target before promotion.');
  }
  if ((ownershipCounts.fallback || 0) > 0) {
    promotionRequirements.push('Do not treat fallback compatibility data as equivalent to shipped FLX6 profile behavior.');
  }

  return Object.freeze({
    authoritativeLabel,
    authoritativeSummary,
    provisionalSummary,
    explicitReviewSummary,
    reviewLabel,
    promotionRequirements,
  });
}
