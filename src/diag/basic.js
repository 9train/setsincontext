import { joinNotes } from '../event-log-snapshot.js';
import {
  buildPlainEnglishControlExplanation,
  UNKNOWN_CONTROL_EXPLANATION,
} from './control-explanations.js';

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function joinReadable(values = []) {
  return values.filter(Boolean).join(' | ') || null;
}

function formatPinnedStatus(inspectionPinned) {
  return inspectionPinned ? 'pinned help' : 'live help';
}

function formatTruthBadgeLabel(status) {
  if (status === 'official') return 'official truth';
  if (status === 'review-only' || status === 'candidate') return 'review-only candidate';
  if (status === 'debug-only') return 'debug-only target';
  if (status === 'unmapped') return 'unmapped';
  if (status === 'draft') return 'review-only candidate';
  if (status === 'fallback') return 'review-only candidate';
  return 'technical only';
}

function compactContextText(value) {
  const text = normalizeText(value);
  if (!text || text.toLowerCase() === 'unknown') return null;
  return String(text).replace(/\s*\|\s*/g, ', ');
}

function knownContextValue(value, formatter = (entry) => entry) {
  const text = normalizeText(value);
  if (!text || text.toLowerCase() === 'unknown') return null;
  return formatter(text);
}

function extractHeadlineContext(snapshot) {
  const owner = compactContextText(snapshot && snapshot.context && snapshot.context.owner);
  if (owner) return owner.split(',')[0] || owner;

  const side = normalizeText(snapshot && snapshot.context && snapshot.context.surfaceSide);
  if (side) return `${side} deck`;
  return null;
}

function buildCurrentContext(snapshot) {
  if (!snapshot) return null;

  return joinReadable([
    compactContextText(snapshot.context && snapshot.context.owner),
    knownContextValue(snapshot.context && snapshot.context.padMode, (value) => `Pad mode ${value}`),
    knownContextValue(snapshot.context && snapshot.context.vinylMode, (value) => `Vinyl ${value}`),
    snapshot.context && snapshot.context.shifted === 'On' ? 'Shift held' : null,
    knownContextValue(snapshot.context && snapshot.context.channel4Input, (value) => `CH4 ${value}`),
  ]);
}

function describeRelativeDirection(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 65 && numeric <= 127) return 'right';
  if (numeric >= 1 && numeric <= 63) return 'left';
  return null;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round((numeric / 127) * 100)}%`;
}

function describeAction(snapshot, renderKind) {
  if (!snapshot) {
    return Object.freeze({
      headlineVerb: 'selected',
      text: 'No live input for this control in this session yet.',
    });
  }

  const interaction = String(snapshot.raw && snapshot.raw.interaction || '').trim().toLowerCase();
  const semanticAction = String(snapshot.semantic && snapshot.semantic.action || '').trim().toLowerCase();
  const rawValue = Number(snapshot.raw && snapshot.raw.data2);
  const direction = describeRelativeDirection(rawValue);

  if (interaction === 'noteoff' || semanticAction.includes('release')) {
    return Object.freeze({ headlineVerb: 'released', text: 'Released.' });
  }

  if (semanticAction.includes('touch') && rawValue === 0) {
    return Object.freeze({ headlineVerb: 'released', text: 'Released.' });
  }

  if (interaction === 'noteon' || semanticAction.includes('press') || semanticAction.includes('trigger')) {
    return Object.freeze({ headlineVerb: 'pressed', text: 'Pressed.' });
  }

  if (renderKind === 'jog') {
    if (semanticAction.includes('touch')) {
      return Object.freeze({ headlineVerb: 'touched', text: rawValue === 0 ? 'Released.' : 'Touched.' });
    }
    return Object.freeze({ headlineVerb: 'moved', text: 'Moved the jog wheel.' });
  }

  if (renderKind === 'knob' || renderKind === 'encoder' || renderKind === 'pad-mode') {
    if (rawValue === 64) {
      return Object.freeze({ headlineVerb: 'turned', text: 'Turned to center.' });
    }
    if (direction === 'left') {
      return Object.freeze({ headlineVerb: 'turned', text: 'Turned left.' });
    }
    if (direction === 'right') {
      return Object.freeze({ headlineVerb: 'turned', text: 'Turned right.' });
    }
    return Object.freeze({ headlineVerb: 'turned', text: 'Turned.' });
  }

  if (renderKind === 'fader' || renderKind === 'tempo' || renderKind === 'xfader') {
    const percent = formatPercent(rawValue);
    return Object.freeze({
      headlineVerb: 'moved',
      text: percent ? `Moved to ${percent}.` : 'Moved.',
    });
  }

  return Object.freeze({ headlineVerb: 'used', text: 'Used this control.' });
}

function resolveExplanationSource(snapshot, inspection) {
  return buildPlainEnglishControlExplanation({
    canonicalTarget: inspection && inspection.canonicalTarget
      || snapshot && snapshot.semantic && snapshot.semantic.canonicalTarget
      || snapshot && snapshot.binding && snapshot.binding.canonicalTarget
      || snapshot && snapshot.normalized && snapshot.normalized.canonicalTarget
      || '',
    targetId: inspection && inspection.targetId
      || snapshot && snapshot.render && snapshot.render.targetId
      || snapshot && snapshot.binding && snapshot.binding.rawTarget
      || '',
    label: inspection && inspection.label
      || snapshot && snapshot.normalized && snapshot.normalized.controlLabel
      || snapshot && snapshot.binding && snapshot.binding.label
      || '',
    renderKind: inspection && inspection.renderKind || '',
  });
}

function buildSubtitle(explanation, snapshot, inspection) {
  if (!snapshot) return explanation.controlName;
  const action = describeAction(snapshot, inspection && inspection.renderKind);
  const contextLabel = extractHeadlineContext(snapshot);
  return `You ${action.headlineVerb} ${explanation.controlName}${contextLabel ? ` - ${contextLabel}` : ''}`;
}

function buildRows(explanation, snapshot, inspection) {
  const action = describeAction(snapshot, inspection && inspection.renderKind);
  const currentContext = buildCurrentContext(snapshot);

  return [
    {
      label: 'What Did I Touch',
      value: explanation.controlName,
    },
    {
      label: 'Where Is It',
      value: explanation.location || 'Board location is not fully labeled yet.',
    },
    {
      label: 'What Does It Do',
      value: explanation.whatDoesItDo,
      note: explanation.known
        ? null
        : 'Use Advanced when you need the exact MIDI lane, canonical target, and render chain.',
    },
    {
      label: 'Action',
      value: action.text,
    },
    {
      label: 'Current Deck / Mode',
      value: currentContext,
    },
  ];
}

function buildBadges({ snapshot, inspection, inspectionPinned = false }) {
  const source = inspection && inspection.officialSource && inspection.officialSource.status
    || snapshot && snapshot.resolution && snapshot.resolution.mappingSource
    || 'unknown';

  return Object.freeze([
    { label: 'basic view', status: 'official' },
    { label: formatTruthBadgeLabel(source), status: source },
    { label: formatPinnedStatus(inspectionPinned), status: inspectionPinned ? 'updated' : 'official' },
  ]);
}

function buildEmptyModel({
  title,
  subtitle,
  inspectionPinned = false,
}) {
  return Object.freeze({
    title,
    subtitle,
    badges: buildBadges({ inspectionPinned }),
    sections: Object.freeze([Object.freeze({
      title: 'Plain-English Help',
      message: 'Touch a mapped FLX6 control and this tab will explain what happened in everyday language.',
      rows: Object.freeze([]),
    })]),
  });
}

function buildModel({
  title,
  subtitle,
  snapshot = null,
  inspection = null,
  inspectionPinned = false,
}) {
  const explanation = resolveExplanationSource(snapshot, inspection);
  const rows = buildRows(explanation, snapshot, inspection);

  return Object.freeze({
    title,
    subtitle: subtitle || buildSubtitle(explanation, snapshot, inspection),
    badges: buildBadges({ snapshot, inspection, inspectionPinned }),
    sections: Object.freeze([Object.freeze({
      title: 'Plain-English Help',
      rows: Object.freeze(rows.filter((row) => row && row.value != null)),
      footer: explanation.whatDoesItDo === UNKNOWN_CONTROL_EXPLANATION
        ? 'Advanced keeps the exact technical debugger available for controls that still need teaching copy.'
        : joinNotes([
            inspection && inspection.relatedEvent && inspection.relatedEvent.summary
              ? `Last linked live event: ${inspection.relatedEvent.summary}`
              : null,
            snapshot && snapshot.summary ? snapshot.summary : null,
          ]),
    })]),
  });
}

export function buildBasicLatestPresentationModel(snapshot, inspection = null) {
  if (!snapshot) {
    return buildEmptyModel({
      title: 'Latest Controller Action',
      subtitle: 'Waiting for live FLX6 input.',
    });
  }

  return buildModel({
    title: 'Latest Controller Action',
    snapshot,
    inspection,
    inspectionPinned: false,
  });
}

export function buildBasicInspectionPresentationModel(
  inspection,
  {
    snapshot = null,
    inspectionPinned = false,
  } = {},
) {
  if (!inspection && !snapshot) {
    return buildEmptyModel({
      title: inspectionPinned ? 'Pinned Control Help' : 'Current Control Help',
      subtitle: 'Hover or click a mapped board control for a plain-English explanation.',
      inspectionPinned,
    });
  }

  return buildModel({
    title: inspectionPinned ? 'Pinned Control Help' : 'Current Control Help',
    snapshot,
    inspection,
    inspectionPinned,
  });
}
