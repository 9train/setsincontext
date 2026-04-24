import { humanizeIdentifier, joinNotes } from '../event-log-snapshot.js';
import {
  describeHostControllerStatus,
  describeHostMIDIStatus,
  describeHostWSStatus,
} from '../host-status.js';

const DEFAULT_MAX_COMPATIBILITY_ENTRIES = 6;

function freezeRows(rows = []) {
  return Object.freeze(rows.filter(Boolean).map((row) => Object.freeze({
    ...row,
    badges: Object.freeze(Array.isArray(row.badges) ? row.badges.slice() : []),
  })));
}

function freezeSections(sections = []) {
  return Object.freeze(sections.filter(Boolean).map((section) => Object.freeze({
    ...section,
    rows: freezeRows(section.rows || []),
  })));
}

function getReviewTone(reviewState, fallback = 'unknown') {
  if (reviewState === 'blocked') return 'blocked';
  if (reviewState === 'review-candidate') return 'draft';
  if (reviewState === 'inspectable-only') return 'fallback';
  if (reviewState === 'clear') return 'official';
  return fallback;
}

function firstText(values = []) {
  return (Array.isArray(values) ? values : []).find(Boolean) || null;
}

function joinPathSegments(values = []) {
  return values.filter(Boolean).join(' -> ') || null;
}

function formatTransportPathLabel(transport) {
  const text = String(transport || '').trim().toLowerCase();
  if (!text || text === 'unknown') return null;
  if (text === 'midi') return 'WebMIDI host';
  return `${humanizeIdentifier(text)} host`;
}

function buildHeaderBadges(inspection, inspectionPinned) {
  const review = inspection.mappingReview || {};
  const badges = [
    {
      label: inspection.officialSource.status === 'official' ? 'official truth' : 'no official truth',
      status: inspection.officialSource.status,
    },
    {
      label: review.reviewLabel || 'Unmapped',
      status: getReviewTone(review.reviewState, review.authoritativeOwner),
    },
  ];
  if (inspection.ownershipCounts.draft) {
    badges.push({
      label: `draft ${inspection.ownershipCounts.draft}`,
      status: 'draft',
    });
  }
  if (inspection.ownershipCounts.fallback) {
    badges.push({
      label: `fallback ${inspection.ownershipCounts.fallback}`,
      status: 'fallback',
    });
  }
  if (inspectionPinned) {
    badges.push({ label: 'pinned review', status: 'updated' });
  } else {
    badges.push({ label: 'live follow', status: 'official' });
  }
  return Object.freeze(badges);
}

function buildInspectionContextRows(inspection, inspectionPinned, inspectionPinSource) {
  const pinnedFromRecentEvent = inspectionPinned && inspectionPinSource === 'recent-event';
  const pinnedFromBoard = inspectionPinned && inspectionPinSource === 'board-selection';

  return [
    {
      label: 'Mode',
      value: inspectionPinned ? 'Pinned selected-surface review' : 'Live-follow surface review',
      badges: [{
        label: inspectionPinned ? 'pinned review' : 'live follow',
        status: inspectionPinned ? 'updated' : 'official',
      }],
      note: inspectionPinned
        ? 'The live truth chain stays on the newest input while this surface review remains pinned.'
        : 'This surface review follows the newest live input target until you pin a board surface or recent event.',
    },
    {
      label: 'Anchor',
      value: inspectionPinned
        ? pinnedFromRecentEvent
          ? 'Pinned from a recent live input'
          : pinnedFromBoard
            ? 'Pinned from a board surface selection'
            : 'Pinned to the current selected surface'
        : 'Following the newest live input target',
      note: inspection.relatedEvent
        ? `Linked live event: ${inspection.relatedEvent.summary}`
        : 'No live event in this session has touched this surface yet.',
    },
    {
      label: 'How To Read',
      value: 'Live truth explains the newest event path; selected-surface review explains what currently owns this board surface.',
    },
  ];
}

function buildIdentityRows(inspection) {
  return [
    {
      label: 'Control',
      value: inspection.label,
    },
    {
      label: 'Board Target',
      value: inspection.targetId,
      mono: true,
    },
    {
      label: 'Canonical',
      value: inspection.canonicalTarget || 'unknown',
      mono: true,
    },
    {
      label: 'Render Kind',
      value: inspection.renderKind ? humanizeIdentifier(inspection.renderKind) : 'unknown',
    },
    {
      label: 'Aliases',
      value: inspection.aliases.length ? inspection.aliases.join(', ') : 'none',
      mono: inspection.aliases.length > 0,
    },
  ];
}

function buildAuthorityRows(inspection) {
  const review = inspection.mappingReview || {};
  const presentation = review.presentation || {};
  const officialSurfaceValue = inspection.officialSource.status === 'official'
    ? `${inspection.officialSource.canonicalTarget || inspection.officialSource.targetId} -> ${inspection.officialSource.targetId}`
    : 'No official FLX6 surface truth attached';

  return [
    {
      label: 'Current Behavior',
      value: presentation.authoritativeLabel || review.authoritativeLabel,
      badges: [
        {
          label: review.authoritativeOwner || inspection.officialSource.status,
          status: review.authoritativeOwner || inspection.officialSource.status,
        },
        {
          label: review.reviewLabel || 'Unmapped',
          status: getReviewTone(review.reviewState, review.authoritativeOwner),
        },
      ],
      note: presentation.authoritativeSummary || review.authoritativeSummary,
    },
    {
      label: 'Official Surface',
      value: officialSurfaceValue,
      mono: true,
      badges: [{ label: inspection.officialSource.status, status: inspection.officialSource.status }],
      note: inspection.officialSource.status === 'official'
        ? 'Official FLX6 UI/render metadata owns this selected board surface.'
        : 'This selected surface does not yet have an attached official FLX6 owner.',
    },
    {
      label: 'Provisional Claims',
      value: presentation.provisionalSummary || review.provisionalSummary,
      mono: true,
      badges: inspection.compatibilityMappings.length
        ? [{ label: `${inspection.compatibilityMappings.length} provisional`, status: 'draft' }]
        : [{ label: 'none', status: inspection.officialSource.status }],
      note: joinNotes([
        inspection.ownershipCounts.draft ? `${inspection.ownershipCounts.draft} draft` : null,
        inspection.ownershipCounts.fallback ? `${inspection.ownershipCounts.fallback} fallback` : null,
        !inspection.compatibilityMappings.length ? 'No draft or fallback entries overlap this surface right now.' : null,
      ]),
    },
  ];
}

function buildCurrentMappingRows(inspection, maxEntries) {
  const rows = [];

  rows.push({
    label: 'Authoritative',
    value: inspection.officialSource.status === 'official'
      ? `${inspection.officialSource.canonicalTarget || inspection.officialSource.targetId} -> ${inspection.officialSource.targetId}`
      : inspection.compatibilityMappings.length
        ? 'Compatibility-only provisional mapping'
        : 'No attached mapping',
    mono: inspection.officialSource.status === 'official',
    badges: [{
      label: inspection.officialSource.status === 'official'
        ? 'official profile'
        : inspection.compatibilityMappings.length
          ? 'compatibility only'
          : 'unmapped',
      status: inspection.officialSource.status === 'official'
        ? 'official'
        : inspection.compatibilityMappings.length
          ? 'fallback'
          : 'unknown',
    }],
    note: inspection.officialSource.status === 'official'
      ? 'Official FLX6 surface truth is the active owner for this selection.'
      : inspection.compatibilityMappings.length
        ? 'Only provisional draft/fallback data currently explains this surface.'
        : 'No official or provisional mapping currently owns this surface.',
  });

  let draftIndex = 0;
  let fallbackIndex = 0;
  inspection.compatibilityMappings.slice(0, maxEntries).forEach((entry) => {
    const review = entry.review || {};
    const presentation = entry.presentation || {};
    if (entry.ownership === 'draft') draftIndex += 1;
    else if (entry.ownership === 'fallback') fallbackIndex += 1;

    rows.push({
      label: entry.ownership === 'draft'
        ? `Draft ${draftIndex}`
        : entry.ownership === 'fallback'
          ? `Fallback ${fallbackIndex}`
          : 'Provisional',
      value: `${entry.key || 'unknown'} -> ${entry.canonicalTarget || entry.effectiveTargetId || 'unresolved'}`,
      mono: true,
      badges: [
        { label: presentation.source || entry.source || entry.ownership, status: entry.ownership },
        { label: review.label || entry.reviewLabel, status: entry.ownership },
        {
          label: review.stateLabel || entry.reviewStateLabel,
          status: getReviewTone(review.state || entry.reviewState, entry.ownership),
        },
      ],
      note: joinNotes([
        entry.effectiveTargetId ? `surface ${entry.effectiveTargetId}` : entry.declaredTargetId ? `declared ${entry.declaredTargetId}` : null,
        entry.mappingId ? `mapping ${entry.mappingId}` : null,
        presentation.sourceDetail || entry.sourceDetail,
        presentation.whyExists || entry.whyExists,
        review.summary || entry.reviewStateSummary,
        presentation.authorityNote || entry.authorityNote,
      ]),
    });
  });

  return rows;
}

function buildReviewRows(inspection) {
  const review = inspection.mappingReview || {};
  const blockers = review.promotionBlockers || [];
  const reviewRequirements = review.reviewRequirements || [];
  const promotionRequirements = review.promotionRequirements || [];

  return [
    {
      label: 'State',
      value: review.reviewLabel || 'Unmapped',
      badges: [{ label: review.reviewLabel || 'Unmapped', status: getReviewTone(review.reviewState, review.authoritativeOwner) }],
      note: review.explicitReviewSummary || 'No provisional entries currently need review.',
    },
    {
      label: 'Blockers',
      value: blockers.length ? blockers[0] : 'none',
      badges: [{ label: blockers.length ? 'blocked' : 'clear', status: blockers.length ? 'blocked' : 'official' }],
      note: blockers.length > 1 ? `+${blockers.length - 1} more blocker(s)` : null,
    },
    {
      label: 'Needs Review',
      value: firstText(reviewRequirements) || 'none',
      badges: [{
        label: reviewRequirements.length ? 'needs evidence' : 'ready',
        status: reviewRequirements.length ? 'fallback' : 'official',
      }],
      note: reviewRequirements.length > 1 ? `+${reviewRequirements.length - 1} more review requirement(s)` : null,
    },
    {
      label: 'Promotion Path',
      value: firstText(promotionRequirements) || 'No promotion work is attached right now.',
      badges: [{
        label: inspection.officialSource.status === 'official' ? 'official path required' : 'official path missing',
        status: inspection.officialSource.status === 'official' ? 'official' : 'fallback',
      }],
      note: review.provisionalSummary || null,
    },
  ];
}

function buildSafeNextStepRows(inspection) {
  const review = inspection.mappingReview || {};
  if (review.reviewState === 'blocked') {
    return [
      {
        label: 'Now',
        value: 'Keep the official FLX6 owner as the active truth for this surface.',
      },
      {
        label: 'Safe Action',
        value: firstText(review.promotionBlockers) || 'Resolve the provisional conflict before promotion.',
      },
      {
        label: 'After Review',
        value: firstText(review.promotionRequirements)
          || 'Move any accepted change into the official FLX6 profile path before it reads as shipped truth.',
      },
    ];
  }

  if (review.reviewState === 'review-candidate') {
    return [
      {
        label: 'Now',
        value: 'Compare the raw lane, canonical claim, and selected surface while the draft stays provisional.',
      },
      {
        label: 'Keep Safe',
        value: 'Leave the draft separate from official FLX6 truth until review accepts it.',
      },
      {
        label: 'If Accepted',
        value: firstText(review.promotionRequirements)
          || 'Land the accepted behavior in the official FLX6 profile path before promotion.',
      },
    ];
  }

  if (review.reviewState === 'inspectable-only') {
    return [
      {
        label: 'Now',
        value: firstText(review.reviewRequirements) || 'Capture stronger learn evidence before promotion review.',
      },
      {
        label: 'Keep Safe',
        value: 'Treat the current entry as draft-only inspection data, not shipped truth.',
      },
      {
        label: 'After Evidence',
        value: firstText(review.promotionRequirements)
          || 'Only move forward once the draft is reviewable and an official FLX6 path is identified.',
      },
    ];
  }

  if (inspection.officialSource.status === 'official') {
    return [
      {
        label: 'Now',
        value: 'Use the official FLX6 profile as the current explanation for this surface.',
      },
      {
        label: 'When To Draft',
        value: 'Start a draft review only if live hardware behavior disagrees with the official path.',
      },
      {
        label: 'Promotion',
        value: 'No draft promotion work is needed for this surface right now.',
      },
    ];
  }

  return [
    {
      label: 'Now',
      value: 'Inspect a live event or capture a draft; no current owner explains this surface yet.',
    },
    {
      label: 'Keep Safe',
      value: 'Any learned mapping should stay draft-first and separate from official truth.',
    },
    {
      label: 'If Accepted',
      value: 'Attach the accepted behavior to an official FLX6 target/profile path before treating it as shipped truth.',
    },
  ];
}

function buildRelatedEventRows(inspection) {
  return [
    {
      label: 'Event',
      value: inspection.relatedEvent.summary,
    },
    {
      label: 'Raw Lane',
      value: inspection.relatedEvent.rawKey,
      mono: true,
    },
    {
      label: 'Meaning',
      value: inspection.relatedEvent.meaningLabel,
      badges: [{ label: inspection.relatedEvent.truthStatus, status: inspection.relatedEvent.truthStatus }],
      note: inspection.relatedEvent.contextSummary,
    },
    {
      label: 'Resolved By',
      value: humanizeIdentifier(inspection.relatedEvent.mappingSource),
      badges: [{ label: inspection.relatedEvent.mappingSource, status: inspection.relatedEvent.mappingSource }],
    },
    {
      label: 'Path',
      value: inspection.relatedEvent.pathSummary,
      mono: true,
    },
  ];
}

export function buildDebuggerSessionPresentationModel({
  wsStatus = null,
  midiStatus = null,
  controllerStatus = null,
  inspectionPinned = false,
  inspectionPinSource = null,
  inspectionTargetId = null,
  latestSnapshot = null,
  inspectionSnapshot = null,
} = {}) {
  const ws = describeHostWSStatus(wsStatus);
  const midi = describeHostMIDIStatus(midiStatus);
  const controller = describeHostControllerStatus(controllerStatus);
  const activeDeviceName = controllerStatus && controllerStatus.deviceName
    || latestSnapshot && latestSnapshot.device && latestSnapshot.device.name
    || null;
  const activeProfileLabel = controllerStatus && controllerStatus.profileLabel
    || latestSnapshot && latestSnapshot.device && latestSnapshot.device.profileLabel
    || controllerStatus && controllerStatus.profileId
    || latestSnapshot && latestSnapshot.device && latestSnapshot.device.profileId
    || null;
  const activeTransport = controllerStatus && controllerStatus.transport
    || latestSnapshot && latestSnapshot.device && latestSnapshot.device.transport
    || null;
  const activePath = joinPathSegments([
    formatTransportPathLabel(activeTransport),
    activeDeviceName,
    activeProfileLabel ? `profile ${activeProfileLabel}` : null,
  ]);

  const reviewModeLabel = inspectionPinned ? 'Pinned review' : 'Live follow';
  const reviewFocusLabel = inspectionTargetId
    ? inspectionPinned
      ? `${inspectionTargetId} pinned for review`
      : `${inspectionTargetId} follows the newest live target`
    : inspectionPinned
      ? 'Pinned surface has no resolved target id yet'
      : 'Waiting for a live surface target';
  const reviewAnchorNote = inspectionPinned
    ? inspectionPinSource === 'recent-event'
      ? 'Pinned from a recent live input selection.'
      : inspectionPinSource === 'board-selection'
        ? 'Pinned directly from a board surface selection.'
        : 'Pinned to the current selected surface.'
    : 'The selected-surface review moves with the newest live input until pinned.';
  const latestTruthValue = latestSnapshot
    ? latestSnapshot.recentSummary
    : 'Waiting for the first live FLX6 event';
  const latestTruthNote = latestSnapshot
    ? `${latestSnapshot.raw.key} | always follows the newest live input`
    : 'No live event has been captured in this debugger session yet.';
  const inspectionAnchorNote = inspectionSnapshot && latestSnapshot && inspectionSnapshot.id !== latestSnapshot.id
    ? `Pinned review anchor: ${inspectionSnapshot.summary}`
    : reviewAnchorNote;

  return Object.freeze({
    title: 'Live Debugger Context',
    subtitle: inspectionPinned
      ? 'Latest truth stays live while selected-surface review remains pinned.'
      : 'Host readiness, live truth, and selected-surface review are following live input together.',
    badges: Object.freeze([
      { label: ws.badge, status: ws.tone },
      { label: midi.badge, status: midi.tone },
      { label: controller.badge, status: controller.tone },
      { label: inspectionPinned ? 'pinned review' : 'live follow', status: inspectionPinned ? 'updated' : 'official' },
    ]),
    sections: freezeSections([
      {
        title: 'Host And Runtime',
        rows: [
          {
            label: 'Host Link',
            value: ws.summary,
            badges: [{ label: ws.badge, status: ws.tone }],
            note: ws.detail,
          },
          {
            label: 'MIDI Lane',
            value: midi.summary,
            badges: [{ label: midi.badge, status: midi.tone }],
            note: midi.detail,
          },
          {
            label: 'Controller',
            value: controller.summary,
            badges: [{ label: controller.badge, status: controller.tone }],
            note: controller.detail,
          },
          activePath
            ? {
                label: 'Active Path',
                value: activePath,
                note: latestSnapshot
                  ? `Latest live event: ${latestSnapshot.summary}`
                  : 'Profile/runtime path is known before the first live event.',
              }
            : null,
        ],
      },
      {
        title: 'Inspection Flow',
        rows: [
          {
            label: 'Live Truth Chain',
            value: latestTruthValue,
            note: latestTruthNote,
          },
          {
            label: 'Surface Review',
            value: reviewFocusLabel,
            badges: [{
              label: reviewModeLabel.toLowerCase(),
              status: inspectionPinned ? 'updated' : 'official',
            }],
            note: inspectionAnchorNote,
          },
          {
            label: 'Reading Context',
            value: 'Live truth answers what just happened. Surface review answers what currently owns the selected control and whether draft data is safe to promote.',
          },
        ],
        footer: 'Click a board control or recent live input to pin review. Use Live Inspect to return to live follow.',
      },
    ]),
  });
}

export function buildInspectionPresentationModel(
  inspection,
  {
    inspectionPinned = false,
    inspectionPinSource = null,
    maxCompatibilityEntries = DEFAULT_MAX_COMPATIBILITY_ENTRIES,
  } = {},
) {
  const mappingRows = buildCurrentMappingRows(inspection, maxCompatibilityEntries);
  const sections = [
    {
      title: 'Inspection Context',
      rows: buildInspectionContextRows(inspection, inspectionPinned, inspectionPinSource),
    },
    {
      title: 'Target Identity',
      rows: buildIdentityRows(inspection),
    },
    {
      title: 'Current Authority',
      rows: buildAuthorityRows(inspection),
    },
    {
      title: 'Current Mappings',
      rows: mappingRows,
      footer: inspection.compatibilityMappings.length > maxCompatibilityEntries
        ? `+${inspection.compatibilityMappings.length - maxCompatibilityEntries} more provisional entries`
        : null,
    },
    {
      title: 'Review State',
      rows: buildReviewRows(inspection),
    },
    {
      title: 'Safe Next Step',
      rows: buildSafeNextStepRows(inspection),
      footer: inspection.compatibilityMappings.length
        ? 'Draft and fallback entries remain secondary until an accepted change lands in the official FLX6 path.'
        : null,
    },
    inspection.relatedEvent
      ? {
          title: 'Live Event Link',
          rows: buildRelatedEventRows(inspection),
        }
      : {
          title: 'Live Event Link',
          message: 'No recent live event has touched this surface in the current debugger session.',
        },
  ];

  return Object.freeze({
    title: inspectionPinned ? 'Pinned Surface Review' : 'Live-Follow Surface Review',
    subtitle: `${inspection.label} -> ${inspection.targetId}`,
    badges: buildHeaderBadges(inspection, inspectionPinned),
    sections: freezeSections(sections),
  });
}
