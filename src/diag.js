// src/diag.js
// Focused FLX6 debugger overlay for the official controller path.
// It surfaces the latest event's truth chain plus a compact recent-event list.

import {
  getBoardSvgRoot,
  getUnifiedMap,
  inspectBoardTarget,
  resolveBoardSelectionFromElement,
  resolveCanonicalRenderTargetId,
} from './board.js';
import { getElByAnyIdIn } from './controllers/core/ui.js';
import {
  humanizeIdentifier,
  humanizeRenderReason,
  joinNotes,
  statusTone,
} from './event-log-snapshot.js';
import {
  buildBasicInspectionPresentationModel,
  buildBasicLatestPresentationModel,
} from './diag/basic.js';
import {
  buildDebuggerSessionPresentationModel,
  buildInspectionPresentationModel,
} from './diag/inspection-presentation.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

let installed = false;
let boardInspectorInstalled = false;

let root = null;
let basicPanelEl = null;
let basicLatestEl = null;
let basicInspectEl = null;
let basicHoverToggleEl = null;
let advancedPanelEl = null;
let basicTabEl = null;
let advancedTabEl = null;
let contextEl = null;
let latestEl = null;
let inspectEl = null;
let recentEl = null;
let popEl = null;
let hoverEl = null;
let popTimer = null;
let selectedReviewSnapshotId = null;
let selectedInspectionTargetId = null;
let inspectionPinned = false;
let inspectionPinSource = null;
let selectedInspectionEl = null;
let activeTab = 'basic';
let hoverExplainEnabled = false;

const runtimePresentationState = {
  wsStatus: null,
  midiStatus: null,
  controllerStatus: null,
};

function getRuntimeAppRecentSnapshots() {
  const runtimeApp = getRuntimeApp();
  if (!runtimeApp || typeof runtimeApp.getRecentDebuggerSnapshots !== 'function') return [];
  return runtimeApp.getRecentDebuggerSnapshots();
}

function deriveInspectionTargetIdFromSnapshot(snapshot) {
  if (!snapshot) return null;
  if (snapshot.render && snapshot.render.targetId) return snapshot.render.targetId;
  if (snapshot.binding && snapshot.binding.rawTarget) return snapshot.binding.rawTarget;
  return resolveCanonicalRenderTargetId(
    snapshot.semantic && snapshot.semantic.canonicalTarget,
    snapshot.binding && snapshot.binding.id || snapshot.normalized && snapshot.normalized.mappingId || '',
  );
}

function getLatestSnapshot() {
  const recentSnapshots = getRuntimeAppRecentSnapshots();
  return recentSnapshots[0] || null;
}

export function resolveDebuggerFocusState({
  recentSnapshots: snapshots = [],
  inspectionPinned: pinned = false,
  selectedReviewSnapshotId: reviewSnapshotId = null,
  selectedInspectionTargetId: inspectionTargetId = null,
} = {}) {
  const orderedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const latestSnapshot = orderedSnapshots[0] || null;
  const selectedReviewSnapshot = orderedSnapshots.find((snapshot) => snapshot && snapshot.id === reviewSnapshotId) || null;
  const inspectionSnapshot = pinned
    ? selectedReviewSnapshot || latestSnapshot
    : latestSnapshot;
  const resolvedInspectionTargetId = inspectionTargetId || deriveInspectionTargetIdFromSnapshot(inspectionSnapshot);

  return Object.freeze({
    latestSnapshot,
    selectedReviewSnapshot,
    inspectionSnapshot,
    inspectionTargetId: resolvedInspectionTargetId,
  });
}

function getDebuggerFocusState() {
  const recentSnapshots = getRuntimeAppRecentSnapshots();
  return resolveDebuggerFocusState({
    recentSnapshots,
    inspectionPinned,
    selectedReviewSnapshotId,
    selectedInspectionTargetId,
  });
}

function snapshotMatchesInspection(snapshot, inspection) {
  if (!snapshot || !inspection) return false;
  if (snapshot.render && snapshot.render.targetId && snapshot.render.targetId === inspection.targetId) return true;
  if (snapshot.binding && snapshot.binding.rawTarget && snapshot.binding.rawTarget === inspection.targetId) return true;
  if (
    inspection.canonicalTarget
    && (
      snapshot.semantic && snapshot.semantic.canonicalTarget === inspection.canonicalTarget
      || snapshot.normalized && snapshot.normalized.canonicalTarget === inspection.canonicalTarget
      || snapshot.binding && snapshot.binding.canonicalTarget === inspection.canonicalTarget
    )
  ) {
    return true;
  }
  return false;
}

function buildRelatedEventSnapshot(snapshot) {
  if (!snapshot) return null;
  return Object.freeze({
    summary: snapshot.summary,
    rawKey: snapshot.raw.key,
    meaningLabel: snapshot.semantic.meaningLabel,
    mappingId: snapshot.normalized.mappingId || null,
    canonicalTarget: snapshot.semantic.canonicalTarget || null,
    targetId: snapshot.render.targetId || null,
    mappingSource: snapshot.resolution.mappingSource,
    truthStatus: snapshot.semantic.truthStatus,
    contextSummary: joinNotes([
      snapshot.context && snapshot.context.surfaceSide ? `surface ${snapshot.context.surfaceSide}` : null,
      snapshot.context && snapshot.context.owner ? `owner ${snapshot.context.owner}` : null,
      snapshot.context && snapshot.context.padMode ? `pad ${snapshot.context.padMode}` : null,
      snapshot.context && snapshot.context.shifted === 'On' ? 'shift held' : null,
    ]),
    pathSummary: snapshot.resolution.pathSummary,
  });
}

export function buildDebuggerBoardInspectionSnapshot(targetId, options = {}) {
  const inspection = inspectBoardTarget(targetId, options.mapEntries || []);
  if (!inspection) return null;

  const recent = Array.isArray(options.recentSnapshots) ? options.recentSnapshots : [];
  const preferred = options.preferredSnapshot || null;
  const orderedSnapshots = preferred
    ? [preferred, ...recent.filter((snapshot) => snapshot && snapshot.id !== preferred.id)]
    : recent.slice();
  const related = orderedSnapshots.find((snapshot) => snapshotMatchesInspection(snapshot, inspection)) || null;

  return Object.freeze({
    ...inspection,
    relatedEvent: buildRelatedEventSnapshot(related),
  });
}

function buildInspectionSnapshotForTarget(targetId, preferredSnapshot = null) {
  if (!targetId) return null;
  return buildDebuggerBoardInspectionSnapshot(targetId, {
    mapEntries: getUnifiedMap(),
    recentSnapshots: getRuntimeAppRecentSnapshots(),
    preferredSnapshot,
  });
}

function setHighlightedInspectionTarget(targetId = null) {
  if (selectedInspectionEl) {
    selectedInspectionEl.style.filter = selectedInspectionEl.__diagPrevFilter || '';
    if (selectedInspectionEl.__diagPrevOpacity != null) {
      selectedInspectionEl.style.opacity = selectedInspectionEl.__diagPrevOpacity;
    } else {
      selectedInspectionEl.style.removeProperty('opacity');
    }
    delete selectedInspectionEl.__diagPrevFilter;
    delete selectedInspectionEl.__diagPrevOpacity;
    selectedInspectionEl = null;
  }

  const svgRoot = getBoardSvgRoot();
  if (!svgRoot || !targetId) return;
  const next = getElByAnyIdIn(svgRoot, targetId);
  if (!next) return;
  next.__diagPrevFilter = next.style.filter || '';
  next.__diagPrevOpacity = next.style.opacity || null;
  next.style.filter = 'drop-shadow(0 0 8px rgba(123,180,255,.88))';
  next.style.opacity = '1';
  selectedInspectionEl = next;
}

function setInspectionTarget(targetId = null, options = {}) {
  selectedInspectionTargetId = targetId || null;
  inspectionPinned = options.pinned === true;
  inspectionPinSource = inspectionPinned ? options.source || inspectionPinSource || 'board-selection' : null;
  setHighlightedInspectionTarget(selectedInspectionTargetId);
}

function createText(tag, text, styleText = '', className = '') {
  const el = document.createElement(tag);
  if (styleText) el.style.cssText = styleText;
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function createBadge(label, status = label) {
  const tone = statusTone(status);
  const el = createText('span', label, '', 'diag-badge');
  if (el.style && typeof el.style.setProperty === 'function') {
    el.style.setProperty('--diag-badge-border', tone.border);
    el.style.setProperty('--diag-badge-bg', tone.background);
    el.style.setProperty('--diag-badge-ink', tone.color);
  } else if (el.style && typeof el.style === 'object') {
    el.style.borderColor = tone.border;
    el.style.background = tone.background;
    el.style.color = tone.color;
  } else {
    el.setAttribute('style', `border-color:${tone.border};background:${tone.background};color:${tone.color};`);
  }
  return el;
}

function createButton(label, styleText = '') {
  const el = createText('button', label, styleText, 'diag-button');
  el.type = 'button';
  return el;
}

function createSection(title) {
  const section = createText('section', null, '', 'diag-section');
  section.appendChild(createText('div', title, '', 'diag-section-title'));
  return section;
}

function appendDetailRows(section, rows) {
  const grid = createText('div', null, '', 'diag-detail-grid');

  rows.forEach((row) => {
    if (!row || row.value == null) return;
    const labelEl = createText('div', row.label, '', 'diag-detail-label');
    const valueWrap = createText('div', null, '', 'diag-detail-value');
    const valueEl = createText('div', row.value, '', `diag-detail-copy${row.mono ? ' mono' : ''}`);
    valueWrap.appendChild(valueEl);

    (row.badges || []).forEach((badge) => {
      valueWrap.appendChild(createBadge(badge.label, badge.status));
    });

    if (row.note) {
      valueWrap.appendChild(createText('div', row.note, 'width:100%;', 'diag-detail-note'));
    }

    grid.appendChild(labelEl);
    grid.appendChild(valueWrap);
  });

  section.appendChild(grid);
}

function appendSectionMessage(section, text) {
  section.appendChild(createText('div', text, '', 'diag-section-message'));
}

function appendSectionFooter(section, text) {
  section.appendChild(createText('div', text, '', 'diag-section-footer'));
}

function createCard() {
  return createText('div', null, '', 'diag-card');
}

function createPresentationCard(presentation, { buildActions } = {}) {
  const card = createCard();
  const header = createText('div', null, '', 'diag-card-header');

  header.appendChild(createText('div', presentation.title, '', 'diag-card-title'));

  if (presentation.subtitle) {
    header.appendChild(createText('div', presentation.subtitle, '', 'diag-card-subtitle'));
  }

  if (presentation.badges && presentation.badges.length) {
    const badgeRow = createText('div', null, '', 'diag-badge-row');
    presentation.badges.forEach((badge) => {
      badgeRow.appendChild(createBadge(badge.label, badge.status));
    });
    header.appendChild(badgeRow);
  }

  const actions = typeof buildActions === 'function' ? buildActions() : null;
  if (actions) header.appendChild(actions);
  card.appendChild(header);

  presentation.sections.forEach((sectionModel) => {
    const section = createSection(sectionModel.title);
    if (sectionModel.rows && sectionModel.rows.length) {
      appendDetailRows(section, sectionModel.rows);
    }
    if (sectionModel.message) {
      appendSectionMessage(section, sectionModel.message);
    }
    if (sectionModel.footer) {
      appendSectionFooter(section, sectionModel.footer);
    }
    card.appendChild(section);
  });

  return card;
}

function renderTabState() {
  if (!basicTabEl || !advancedTabEl || !basicPanelEl || !advancedPanelEl) return;
  const basicSelected = activeTab === 'basic';
  basicTabEl.classList.toggle('is-selected', basicSelected);
  advancedTabEl.classList.toggle('is-selected', !basicSelected);
  basicTabEl.setAttribute('aria-selected', basicSelected ? 'true' : 'false');
  advancedTabEl.setAttribute('aria-selected', !basicSelected ? 'true' : 'false');
  basicPanelEl.style.display = basicSelected ? 'flex' : 'none';
  advancedPanelEl.style.display = basicSelected ? 'none' : 'flex';
  if (!basicSelected) hideHoverHelp();
}

function setActiveTab(nextTab = 'basic') {
  activeTab = nextTab === 'advanced' ? 'advanced' : 'basic';
  renderTabState();
}

function renderHoverToggle() {
  if (!basicHoverToggleEl) return;
  basicHoverToggleEl.textContent = `Explain controls when I hover: ${hoverExplainEnabled ? 'On' : 'Off'}`;
  basicHoverToggleEl.classList.toggle('is-selected', hoverExplainEnabled);
  basicHoverToggleEl.setAttribute('aria-pressed', hoverExplainEnabled ? 'true' : 'false');
}

function hideHoverHelp() {
  if (hoverEl) {
    hoverEl.remove();
    hoverEl = null;
  }
}

function renderHoverHelp(inspection, event = {}) {
  if (!hoverExplainEnabled || activeTab !== 'basic' || !inspection) {
    hideHoverHelp();
    return;
  }

  if (!hoverEl || !document.body.contains(hoverEl)) {
    hoverEl = document.createElement('div');
    hoverEl.id = 'diagHoverCard';
    hoverEl.className = 'diag-hover-card';
    document.body.appendChild(hoverEl);
  }

  hoverEl.innerHTML = '';
  hoverEl.appendChild(createPresentationCard(buildBasicInspectionPresentationModel(inspection, {
    inspectionPinned: false,
  })));

  const left = Number.isFinite(Number(event && event.clientX))
    ? `${Math.max(12, Number(event.clientX) + 14)}px`
    : '16px';
  const top = Number.isFinite(Number(event && event.clientY))
    ? `${Math.max(12, Number(event.clientY) + 14)}px`
    : '16px';
  hoverEl.style.left = left;
  hoverEl.style.top = top;
}

function renderBasic() {
  if (!basicLatestEl || !basicInspectEl) return;
  basicLatestEl.innerHTML = '';
  basicInspectEl.innerHTML = '';

  const focusState = getDebuggerFocusState();
  const latestInspection = buildInspectionSnapshotForTarget(
    deriveInspectionTargetIdFromSnapshot(focusState.latestSnapshot),
    focusState.latestSnapshot,
  );
  const currentInspection = buildInspectionSnapshotForTarget(
    focusState.inspectionTargetId,
    focusState.inspectionSnapshot,
  );
  const inspectionSnapshot = currentInspection && snapshotMatchesInspection(focusState.inspectionSnapshot, currentInspection)
    ? focusState.inspectionSnapshot
    : null;

  basicLatestEl.appendChild(createPresentationCard(
    buildBasicLatestPresentationModel(focusState.latestSnapshot, latestInspection),
  ));
  basicInspectEl.appendChild(createPresentationCard(
    buildBasicInspectionPresentationModel(currentInspection, {
      snapshot: inspectionSnapshot,
      inspectionPinned,
    }),
  ));
  renderHoverToggle();
}

function syncRuntimePresentationState(partial = {}) {
  if (Object.prototype.hasOwnProperty.call(partial, 'wsStatus')) {
    runtimePresentationState.wsStatus = partial.wsStatus ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'midiStatus')) {
    runtimePresentationState.midiStatus = partial.midiStatus ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'controllerStatus')) {
    runtimePresentationState.controllerStatus = partial.controllerStatus || null;
  }
}

function renderSessionContext() {
  if (!contextEl) return;
  contextEl.innerHTML = '';

  const focusState = getDebuggerFocusState();
  const presentation = buildDebuggerSessionPresentationModel({
    wsStatus: runtimePresentationState.wsStatus,
    midiStatus: runtimePresentationState.midiStatus,
    controllerStatus: runtimePresentationState.controllerStatus,
    inspectionPinned,
    inspectionPinSource,
    inspectionTargetId: focusState.inspectionTargetId,
    latestSnapshot: focusState.latestSnapshot,
    inspectionSnapshot: focusState.inspectionSnapshot,
  });

  contextEl.appendChild(createPresentationCard(presentation));
}

function renderInspection() {
  if (!inspectEl) return;
  inspectEl.innerHTML = '';

  const focusState = getDebuggerFocusState();
  const inspectionTargetId = focusState.inspectionTargetId;
  if (!inspectionTargetId) {
    inspectEl.appendChild(createText('div', 'Select a board control or recent event to review what the surface is, what owns it, and what is safe to do next.', '', 'diag-empty'));
    setHighlightedInspectionTarget(null);
    return;
  }

  const inspection = buildInspectionSnapshotForTarget(inspectionTargetId, focusState.inspectionSnapshot);

  if (!inspection) {
    inspectEl.appendChild(createText('div', 'The selected board surface has no inspection metadata yet.', '', 'diag-empty'));
    setHighlightedInspectionTarget(null);
    return;
  }

  setHighlightedInspectionTarget(inspection.targetId);

  const presentation = buildInspectionPresentationModel(inspection, {
    inspectionPinned,
    inspectionPinSource,
  });
  inspectEl.appendChild(createPresentationCard(presentation, {
    buildActions: () => {
      const actionRow = createText('div', null, '', 'diag-action-row');

      const editLearnButton = createButton('Edit / Learn This Surface');
      editLearnButton.dataset.diagAction = 'edit-learn-surface';
      editLearnButton.disabled = !inspection.targetId;
      if (editLearnButton.disabled) {
        editLearnButton.style.opacity = '.55';
        editLearnButton.style.cursor = 'not-allowed';
        editLearnButton.title = 'Select a board surface to edit or learn it.';
      } else {
        editLearnButton.title = 'Open Edit Mode with this surface preselected. Listen still has to be clicked there.';
        editLearnButton.addEventListener('click', async () => {
          try {
            const editModule = await import('./editmode.js');
            const opened = typeof editModule.openForTarget === 'function'
              ? editModule.openForTarget({
                  targetId: inspection.targetId,
                  canonicalTarget: inspection.canonicalTarget || null,
                  label: inspection.label || inspection.targetId,
                })
              : false;
            if (opened) {
              showPop(`Opened Edit Mode for ${inspection.targetId}. Click Listen, then press the controller input.`);
            } else {
              showPop(`Could not open Edit Mode for ${inspection.targetId}.`);
            }
          } catch (error) {
            showPop(`Edit Mode bridge failed: ${error && error.message ? error.message : 'unknown error'}`);
          }
        });
      }
      actionRow.appendChild(editLearnButton);

      const copyReviewButton = createButton('Copy Draft Review JSON');
      copyReviewButton.disabled = inspection.compatibilityMappings.length === 0;
      if (copyReviewButton.disabled) {
        copyReviewButton.style.opacity = '.55';
        copyReviewButton.style.cursor = 'not-allowed';
        copyReviewButton.title = 'This surface has no draft/fallback entries to export right now.';
      } else {
        copyReviewButton.title = 'Copy a draft-only review artifact for the selected surface.';
        copyReviewButton.addEventListener('click', async () => {
          try {
            const { copyDraftReviewJSON } = await import('./learn.js');
            await copyDraftReviewJSON({
              targetId: inspection.targetId,
              canonicalTarget: inspection.canonicalTarget || null,
            });
            showPop(`Copied draft review JSON for ${inspection.targetId}`);
          } catch (error) {
            showPop(`Draft review export failed: ${error && error.message ? error.message : 'unknown error'}`);
          }
        });
      }
      actionRow.appendChild(copyReviewButton);
      return actionRow;
    },
  }));
}

function renderLatest(snapshot = getLatestSnapshot()) {
  if (!latestEl) return;
  latestEl.innerHTML = '';

  if (!snapshot) {
    latestEl.appendChild(createText('div', 'Waiting for the first live FLX6 event. This card only follows real input and never switches to a pinned review target.', '', 'diag-empty'));
    return;
  }

  const card = createCard();
  const header = createText('div', null, '', 'diag-card-header');
  header.appendChild(createText('div', 'Live Event Truth Chain', '', 'diag-card-title'));
  header.appendChild(createText('div', 'Always follows the newest live controller input, even while selected-surface review is pinned.', '', 'diag-section-message'));
  header.appendChild(createText('div', snapshot.summary, '', 'diag-card-subtitle'));

  const badgeRow = createText('div', null, '', 'diag-badge-row');
  badgeRow.appendChild(createBadge('latest live input', 'updated'));
  badgeRow.appendChild(createBadge(snapshot.authority.truthStatus, snapshot.authority.truthStatus));
  badgeRow.appendChild(createBadge(snapshot.binding.status, snapshot.binding.status));
  badgeRow.appendChild(createBadge(snapshot.render.authority, snapshot.render.authority));
  badgeRow.appendChild(createBadge(snapshot.render.ownership, snapshot.render.ownership));
  badgeRow.appendChild(createBadge(
    snapshot.render.boardUpdated === 'yes'
      ? 'board updated'
      : snapshot.render.boardUpdated === 'no'
        ? 'board not updated'
        : 'board update unknown',
    snapshot.render.boardUpdated === 'yes'
      ? 'updated'
      : snapshot.render.boardUpdated === 'no'
        ? snapshot.render.outcome
        : 'unknown',
  ));
  header.appendChild(badgeRow);
  card.appendChild(header);

  const summarySection = createSection('Human Summary');
  appendDetailRows(summarySection, [
    {
      label: 'What Happened',
      value: snapshot.semantic.meaningLabel || snapshot.summary,
      badges: [{ label: snapshot.semantic.truthStatus, status: snapshot.semantic.truthStatus }],
      note: snapshot.normalized.controlLabel
        ? `${snapshot.normalized.controlLabel} on ${snapshot.context.surfaceSide || 'unknown surface'}`
        : snapshot.summary,
    },
    {
      label: 'Visible Result',
      value: snapshot.render.targetId || 'No board target',
      mono: !!snapshot.render.targetId,
      badges: [{ label: snapshot.render.outcomeLabel, status: snapshot.render.outcome }],
      note: joinNotes([
        snapshot.render.detail,
        humanizeRenderReason(snapshot.render.fallbackReason),
      ]),
    },
    {
      label: 'Resolved By',
      value: humanizeIdentifier(snapshot.resolution.mappingSource),
      badges: [{ label: snapshot.resolution.mappingSource, status: snapshot.resolution.mappingSource }],
      note: snapshot.resolution.ownerSummary,
    },
  ]);
  card.appendChild(summarySection);

  if (snapshot.hardwareTruthMatrix && snapshot.hardwareTruthMatrix.rows && snapshot.hardwareTruthMatrix.rows.length) {
    const hardwareTruthSection = createSection('Hardware Truth Matrix');
    appendDetailRows(hardwareTruthSection, snapshot.hardwareTruthMatrix.rows);
    card.appendChild(hardwareTruthSection);
  }

  const transaction = snapshot.debugTransaction || null;
  const transactionSection = createSection('Debug Transaction');
  appendDetailRows(transactionSection, [
    {
      label: 'Device / Profile',
      value: transaction && transaction.deviceProfile && transaction.deviceProfile.deviceName || snapshot.device.name || 'unknown',
      note: joinNotes([
        transaction && transaction.deviceProfile && transaction.deviceProfile.profile
          ? `profile ${transaction.deviceProfile.profile}`
          : snapshot.device.profileLabel || snapshot.device.profileId
            ? `profile ${snapshot.device.profileLabel || snapshot.device.profileId}`
            : null,
        transaction && transaction.deviceProfile && transaction.deviceProfile.profileId
          && transaction.deviceProfile.profileId !== transaction.deviceProfile.profile
          ? transaction.deviceProfile.profileId
          : null,
        transaction && transaction.deviceProfile && transaction.deviceProfile.transport
          ? `transport ${humanizeIdentifier(transaction.deviceProfile.transport)}`
          : snapshot.device.transport
            ? `transport ${humanizeIdentifier(snapshot.device.transport)}`
            : null,
        snapshot.device.sourceId ? `source ${snapshot.device.sourceId}` : null,
      ]) || null,
    },
    {
      label: 'Raw MIDI',
      value: transaction && transaction.rawMidi && transaction.rawMidi.summary || snapshot.raw.key,
      mono: true,
      badges: [{ label: snapshot.raw.interactionLabel, status: snapshot.raw.interaction }],
    },
    {
      label: 'Official Mapping',
      value: transaction && transaction.mapping && transaction.mapping.officialId || 'No official mapping matched',
      mono: true,
      badges: [{
        label: snapshot.binding.status,
        status: snapshot.binding.status,
      }],
      note: joinNotes([
        transaction && transaction.mapping && transaction.mapping.matchedId
          && transaction.mapping.matchedId !== transaction.mapping.officialId
          ? `matched ${transaction.mapping.matchedId}`
          : null,
        snapshot.normalized.controlLabel ? `control ${snapshot.normalized.controlLabel}` : null,
      ]),
    },
    {
      label: 'Canonical Target',
      value: transaction && transaction.mapping && transaction.mapping.canonicalTarget
        || snapshot.binding.canonicalTarget
        || snapshot.semantic.canonicalTarget
        || 'unknown',
      mono: true,
    },
    {
      label: 'Deck / Mode / State',
      value: transaction && transaction.context && transaction.context.summary || 'No extra deck or mode context',
      note: transaction && transaction.context && transaction.context.stateSummary || null,
    },
    {
      label: 'Board / SVG Target',
      value: transaction && transaction.board && transaction.board.targetId || snapshot.render.targetId || snapshot.resolution.targetId || 'none',
      mono: true,
    },
    {
      label: 'Render Result',
      value: transaction && transaction.renderResult && transaction.renderResult.summary || snapshot.render.outcomeLabel,
      badges: [{ label: snapshot.render.outcomeLabel, status: snapshot.render.outcome }],
    },
    {
      label: 'Mapping Authority',
      value: humanizeIdentifier(transaction && transaction.mappingAuthority && transaction.mappingAuthority.owner || snapshot.resolution.mappingSource),
      badges: [{
        label: transaction && transaction.mappingAuthority && transaction.mappingAuthority.owner || snapshot.resolution.mappingSource,
        status: transaction && transaction.mappingAuthority && transaction.mappingAuthority.owner || snapshot.resolution.mappingSource,
      }],
      note: transaction && transaction.mappingAuthority && transaction.mappingAuthority.summary || snapshot.resolution.ownerSummary,
    },
    {
      label: 'Relay',
      value: transaction && transaction.relay && transaction.relay.summary || 'Relay status unavailable.',
      badges: transaction && transaction.relay && transaction.relay.available
        ? [{ label: transaction.relay.status || 'unknown', status: transaction.relay.tone || 'unknown' }]
        : [],
    },
    {
      label: 'Recorder / Log',
      value: transaction && transaction.recorder && transaction.recorder.summary || 'Recorder status unavailable.',
      badges: transaction && transaction.recorder && transaction.recorder.available
        ? [{ label: transaction.recorder.state || 'ready', status: transaction.recorder.tone || 'unknown' }]
        : [],
    },
  ]);
  card.appendChild(transactionSection);

  const technicalDisclosure = document.createElement('details');
  technicalDisclosure.className = 'diag-disclosure';
  const disclosureSummary = document.createElement('summary');
  disclosureSummary.textContent = 'Technical Trace';
  technicalDisclosure.appendChild(disclosureSummary);

  const rawSection = createSection('Raw MIDI');
  appendDetailRows(rawSection, [
    {
      label: 'Lane',
      value: snapshot.raw.key,
      mono: true,
      badges: [{ label: snapshot.raw.interactionLabel, status: snapshot.raw.interaction }],
    },
    {
      label: 'Status Byte',
      value: `${snapshot.raw.statusByteHex}${snapshot.raw.statusByte != null ? ` (${snapshot.raw.statusByte})` : ''}`,
      mono: true,
    },
    {
      label: 'Channel',
      value: snapshot.raw.channel != null ? String(snapshot.raw.channel) : 'unknown',
      mono: true,
    },
    {
      label: 'Data 1',
      value: snapshot.raw.data1 != null ? String(snapshot.raw.data1) : 'unknown',
      mono: true,
    },
    {
      label: 'Data 2',
      value: snapshot.raw.data2 != null ? String(snapshot.raw.data2) : 'unknown',
      mono: true,
    },
  ]);
  technicalDisclosure.appendChild(rawSection);

  const bindingSection = createSection('Normalized Control');
  appendDetailRows(bindingSection, [
    {
      label: 'Match',
      value: snapshot.binding.id || 'unmatched',
      mono: true,
      badges: [{ label: snapshot.binding.status, status: snapshot.binding.status }],
      note: joinNotes([
        snapshot.binding.label,
        snapshot.binding.note,
      ]),
    },
    {
      label: 'Family',
      value: humanizeIdentifier(snapshot.binding.family),
    },
    {
      label: 'Mapping',
      value: snapshot.normalized.mappingId || 'unknown',
      mono: true,
      badges: snapshot.normalized.mapped
        ? [{ label: 'mapped', status: snapshot.binding.status }]
        : [{ label: 'unmapped', status: 'unmatched' }],
    },
    {
      label: 'Context',
      value: snapshot.normalized.contextSummary || 'none',
      note: snapshot.normalized.valueShape ? `value ${snapshot.normalized.valueShape}` : null,
    },
  ]);
  technicalDisclosure.appendChild(bindingSection);

  const deckContextSection = createSection('Deck And Mode');
  appendDetailRows(deckContextSection, [
    {
      label: 'Surface',
      value: snapshot.context.surfaceSide || 'unknown',
    },
    {
      label: 'Owner',
      value: snapshot.context.owner || 'unknown',
      note: snapshot.context.bindingOwner,
    },
    {
      label: 'Pad Mode',
      value: snapshot.context.padMode || 'unknown',
    },
    {
      label: 'Vinyl Mode',
      value: snapshot.context.vinylMode || 'unknown',
    },
    {
      label: 'Shift',
      value: snapshot.context.shifted || 'Off',
    },
    {
      label: 'CH4 Input',
      value: snapshot.context.channel4Input || 'unknown',
    },
  ]);
  technicalDisclosure.appendChild(deckContextSection);

  const stateSection = createSection('Controller State');
  appendDetailRows(stateSection, snapshot.controllerStateRows.map((row) => ({
    label: row.label,
    value: `${row.before} -> ${row.after}`,
    badges: [{ label: row.status, status: row.status }],
    note: joinNotes([
      row.source ? `source ${row.source}` : null,
      row.note,
    ]),
  })));
  technicalDisclosure.appendChild(stateSection);

  const semanticSection = createSection('Semantic Meaning');
  appendDetailRows(semanticSection, [
    {
      label: 'Meaning',
      value: snapshot.semantic.meaningLabel,
      badges: [{ label: snapshot.semantic.truthStatus, status: snapshot.semantic.truthStatus }],
      note: snapshot.semantic.meaningId ? `id ${snapshot.semantic.meaningId}` : null,
    },
    {
      label: 'Family',
      value: humanizeIdentifier(snapshot.semantic.family),
    },
    {
      label: 'Action',
      value: humanizeIdentifier(snapshot.semantic.action),
    },
    {
      label: 'Canonical',
      value: snapshot.semantic.canonicalTarget || 'unknown',
      mono: true,
    },
  ]);
  technicalDisclosure.appendChild(semanticSection);

  const whySection = createSection('Why It Resolved');
  appendDetailRows(whySection, [
    {
      label: 'Resolved By',
      value: humanizeIdentifier(snapshot.resolution.mappingSource),
      badges: [{ label: snapshot.resolution.mappingSource, status: snapshot.resolution.mappingSource }],
      note: snapshot.resolution.ownerSummary,
    },
    {
      label: 'Path',
      value: snapshot.resolution.pathSummary,
      mono: true,
    },
    {
      label: 'Board Target',
      value: snapshot.resolution.targetId || 'none',
      mono: true,
    },
    {
      label: 'Reason',
      value: snapshot.resolution.whySummary || 'No extra reason recorded.',
    },
  ]);
  technicalDisclosure.appendChild(whySection);

  const authoritySection = createSection('Truth And Authority');
  appendDetailRows(authoritySection, [
    {
      label: 'Semantic Truth',
      value: humanizeIdentifier(snapshot.authority.truthStatus),
      badges: [{ label: snapshot.authority.truthStatus, status: snapshot.authority.truthStatus }],
    },
    {
      label: 'Binding Path',
      value: humanizeIdentifier(snapshot.authority.bindingStatus),
      badges: [{ label: snapshot.authority.bindingStatus, status: snapshot.authority.bindingStatus }],
    },
    {
      label: 'Render Authority',
      value: humanizeIdentifier(snapshot.authority.renderAuthority),
      badges: [{ label: snapshot.authority.renderAuthority, status: snapshot.authority.renderAuthority }],
    },
    {
      label: 'Resolved From',
      value: humanizeIdentifier(snapshot.authority.resolutionOwner),
      badges: [{ label: snapshot.authority.resolutionOwner, status: snapshot.authority.resolutionOwner }],
    },
    {
      label: 'Render Path',
      value: humanizeIdentifier(snapshot.authority.renderPath),
      badges: [{ label: snapshot.authority.renderPath, status: snapshot.authority.renderPath }],
    },
  ]);
  technicalDisclosure.appendChild(authoritySection);

  card.appendChild(technicalDisclosure);

  latestEl.appendChild(card);
}

function renderRecent() {
  if (!recentEl) return;
  recentEl.innerHTML = '';
  const recentSnapshots = getRuntimeAppRecentSnapshots();

  if (!recentSnapshots.length) {
    recentEl.appendChild(createText('div', 'Recent live inputs from this browser session will appear here. Selecting one pins surface review without freezing the live truth card above.', '', 'diag-empty'));
    return;
  }

  recentSnapshots.forEach((snapshot) => {
    const row = createText('button', null, '', `diag-recent-button${snapshot.id === selectedReviewSnapshotId ? ' is-selected' : ''}`);
    row.type = 'button';
    row.addEventListener('click', () => {
      selectedReviewSnapshotId = snapshot.id;
      setInspectionTarget(deriveInspectionTargetIdFromSnapshot(snapshot), {
        pinned: true,
        source: 'recent-event',
      });
      renderAllPanels();
    });

    const top = createText('div', null, 'display:flex;justify-content:space-between;gap:8px;align-items:center;');
    top.appendChild(createText('div', snapshot.raw.key, '', 'diag-card-subtitle'));
    const smallBadges = createText('div', null, '', 'diag-badge-row');
    smallBadges.appendChild(createBadge(snapshot.authority.truthStatus, snapshot.authority.truthStatus));
    smallBadges.appendChild(createBadge(snapshot.render.authority, snapshot.render.authority));
    smallBadges.appendChild(createBadge(snapshot.resolution.mappingSource, snapshot.resolution.mappingSource));
    top.appendChild(smallBadges);
    row.appendChild(top);

    row.appendChild(createText('div', snapshot.recentSummary, '', 'diag-detail-copy'));

    row.appendChild(createText(
      'div',
      `${snapshot.normalized.mappingId || 'unmapped'} | render ${snapshot.render.targetId || 'none'} | ${snapshot.render.outcomeLabel} | ${humanizeIdentifier(snapshot.hardwareTruthMatrix && snapshot.hardwareTruthMatrix.status || 'unknown')}`,
      '',
      'diag-detail-note',
    ));

    const matrixReason = snapshot.hardwareTruthMatrix && (snapshot.hardwareTruthMatrix.warning || snapshot.hardwareTruthMatrix.reason);
    if (matrixReason) {
      row.appendChild(createText('div', matrixReason, '', 'diag-detail-note'));
    }

    recentEl.appendChild(row);
  });
}

function renderAllPanels() {
  renderBasic();
  renderSessionContext();
  renderLatest();
  renderInspection();
  renderRecent();
}

function clearSnapshots() {
  selectedReviewSnapshotId = null;
  setInspectionTarget(null, { pinned: false });
  getRuntimeApp()?.clearRecentDebuggerSnapshots?.();
  hideHoverHelp();
  renderAllPanels();
}

function createPanel() {
  if (root && document.body.contains(root)) return root;

  root = document.createElement('div');
  root.id = 'diagRoot';
  root.className = 'diag-root';

  const header = createText('div', null, 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;');
  const titleWrap = createText('div', null, 'display:flex;flex-direction:column;gap:2px;');
  titleWrap.appendChild(createText('strong', 'FLX6 Debugger', '', 'diag-card-title'));
  titleWrap.appendChild(createText('div', 'Basic opens first for students. Advanced keeps the full technical truth chain.', '', 'diag-section-message'));
  header.appendChild(titleWrap);

  const controls = createText('div', null, '', 'diag-action-row');
  const liveButton = createButton('Live Inspect');
  liveButton.type = 'button';
  liveButton.addEventListener('click', () => {
    const latestSnapshot = getLatestSnapshot();
    selectedReviewSnapshotId = latestSnapshot ? latestSnapshot.id : null;
    setInspectionTarget(null, { pinned: false });
    renderAllPanels();
  });
  const clearButton = createButton('Clear');
  clearButton.type = 'button';
  clearButton.addEventListener('click', () => clearSnapshots());
  const closeButton = createButton('Close');
  closeButton.type = 'button';
  closeButton.addEventListener('click', () => hide());
  controls.appendChild(liveButton);
  controls.appendChild(clearButton);
  controls.appendChild(closeButton);
  header.appendChild(controls);

  const tabRow = createText('div', null, '', 'diag-tabs');
  tabRow.setAttribute('role', 'tablist');

  basicTabEl = createButton('Basic');
  basicTabEl.className = 'diag-tab';
  basicTabEl.dataset.tab = 'basic';
  basicTabEl.setAttribute('role', 'tab');
  basicTabEl.addEventListener('click', () => setActiveTab('basic'));

  advancedTabEl = createButton('Advanced');
  advancedTabEl.className = 'diag-tab';
  advancedTabEl.dataset.tab = 'advanced';
  advancedTabEl.setAttribute('role', 'tab');
  advancedTabEl.addEventListener('click', () => setActiveTab('advanced'));

  tabRow.appendChild(basicTabEl);
  tabRow.appendChild(advancedTabEl);

  basicPanelEl = createText('section', null, '', 'diag-tab-panel');
  basicPanelEl.dataset.tabPanel = 'basic';
  basicPanelEl.setAttribute('role', 'tabpanel');

  const basicControlsSection = createText('section', null, '', 'diag-section');
  basicControlsSection.appendChild(createText('div', 'Basic Options', '', 'diag-section-title'));
  basicControlsSection.appendChild(createText('div', 'Beginner-friendly explanations are built from the existing FLX6 target and mapping truth. Advanced still keeps the full debugger trace.', '', 'diag-section-message'));
  basicHoverToggleEl = createButton('Explain controls when I hover: Off');
  basicHoverToggleEl.type = 'button';
  basicHoverToggleEl.classList.add('diag-toggle');
  basicHoverToggleEl.dataset.hoverExplainToggle = 'true';
  basicHoverToggleEl.addEventListener('click', () => {
    hoverExplainEnabled = !hoverExplainEnabled;
    renderHoverToggle();
    if (!hoverExplainEnabled) hideHoverHelp();
  });
  basicControlsSection.appendChild(basicHoverToggleEl);

  basicLatestEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;');
  basicInspectEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;');
  basicPanelEl.appendChild(basicControlsSection);
  basicPanelEl.appendChild(basicLatestEl);
  basicPanelEl.appendChild(basicInspectEl);

  advancedPanelEl = createText('section', null, '', 'diag-tab-panel');
  advancedPanelEl.dataset.tabPanel = 'advanced';
  advancedPanelEl.setAttribute('role', 'tabpanel');

  contextEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;');
  latestEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;');
  inspectEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;');
  recentEl = createText('div', null, 'display:flex;flex-direction:column;gap:8px;overflow:auto;max-height:24vh;padding-right:2px;');

  const recentSection = createText('section', null, '', 'diag-section');
  recentSection.appendChild(createText('div', 'Recent Live Inputs', '', 'diag-section-title'));
  recentSection.appendChild(createText('div', 'Select one to pin selected-surface review while the live truth chain keeps following the newest event.', '', 'diag-section-message'));
  recentSection.appendChild(recentEl);

  advancedPanelEl.appendChild(contextEl);
  advancedPanelEl.appendChild(latestEl);
  advancedPanelEl.appendChild(inspectEl);
  advancedPanelEl.appendChild(recentSection);

  root.appendChild(header);
  root.appendChild(tabRow);
  root.appendChild(basicPanelEl);
  root.appendChild(advancedPanelEl);
  document.body.appendChild(root);

  setActiveTab(activeTab);
  renderAllPanels();

  return root;
}

function showPop(text) {
  if (!text) return;
  if (!popEl || !document.body.contains(popEl)) {
    popEl = document.createElement('div');
    popEl.id = 'diagPop';
    popEl.className = 'diag-pop';
    document.body.appendChild(popEl);
  }

  popEl.textContent = text;
  if (popTimer) {
    clearTimeout(popTimer);
    popTimer = null;
  }
  popTimer = setTimeout(() => {
    if (popEl) {
      popEl.remove();
      popEl = null;
    }
  }, 1800);
}

function onEvent(snapshot) {
  if (!root || !root.classList.contains('open')) return;
  if (!snapshot) return;
  if (!inspectionPinned) {
    selectedReviewSnapshotId = snapshot.id;
  }
  if (!inspectionPinned) {
    setInspectionTarget(deriveInspectionTargetIdFromSnapshot(snapshot), { pinned: false });
  }

  renderAllPanels();
  showPop(snapshot.summary);
}

function ensureBoardInspectorInstalled() {
  if (boardInspectorInstalled || typeof document === 'undefined') return;
  document.addEventListener('click', (event) => {
    if (!root || !root.classList.contains('open')) return;
    const svgRoot = getBoardSvgRoot();
    if (!svgRoot || !svgRoot.contains(event.target)) return;
    const selection = resolveBoardSelectionFromElement(event.target);
    if (!selection || !selection.targetId) return;
    selectedReviewSnapshotId = null;
    setInspectionTarget(selection.targetId, {
      pinned: true,
      source: 'board-selection',
    });
    renderAllPanels();
  });
  document.addEventListener('mouseover', (event) => {
    if (!root || !root.classList.contains('open')) return;
    if (!hoverExplainEnabled || activeTab !== 'basic') {
      hideHoverHelp();
      return;
    }
    const svgRoot = getBoardSvgRoot();
    if (!svgRoot || !svgRoot.contains(event.target)) {
      hideHoverHelp();
      return;
    }
    const selection = resolveBoardSelectionFromElement(event.target);
    if (!selection || !selection.targetId) {
      hideHoverHelp();
      return;
    }
    const inspection = buildInspectionSnapshotForTarget(selection.targetId, null);
    if (!inspection) {
      hideHoverHelp();
      return;
    }
    renderHoverHelp(inspection, event);
  });
  boardInspectorInstalled = true;
}

function ensureInstalled() {
  ensureBoardInspectorInstalled();
  if (installed) return;
  const runtimeApp = getRuntimeApp();
  if (!runtimeApp) return;
  syncRuntimePresentationState({
    wsStatus: runtimeApp.getWSStatus(),
    midiStatus: runtimeApp.getMIDIStatus(),
    controllerStatus: typeof runtimeApp.getControllerRuntime === 'function'
      ? runtimeApp.getControllerRuntime()
      : null,
  });
  runtimeApp.addWSStatusListener('diag-ws-status', (status) => {
    syncRuntimePresentationState({ wsStatus: status });
    renderSessionContext();
  });
  runtimeApp.addMIDIStatusListener('diag-midi-status', (status) => {
    syncRuntimePresentationState({ midiStatus: status });
    renderSessionContext();
  });
  if (typeof runtimeApp.addControllerRuntimeListener === 'function') {
    runtimeApp.addControllerRuntimeListener('diag-controller-runtime', (controllerStatus) => {
      syncRuntimePresentationState({ controllerStatus });
      renderSessionContext();
    });
  }
  if (typeof runtimeApp.addRecentDebuggerHistoryListener === 'function') {
    runtimeApp.addRecentDebuggerHistoryListener('diag-recent-debugger-history', (snapshot) => {
      try { onEvent(snapshot); } catch {}
    });
  }
  installed = true;
}

export function show() {
  ensureInstalled();
  createPanel();
  setActiveTab('basic');
  if (!inspectionPinned) {
    const latestSnapshot = getLatestSnapshot();
    selectedReviewSnapshotId = latestSnapshot ? latestSnapshot.id : null;
    setInspectionTarget(deriveInspectionTargetIdFromSnapshot(latestSnapshot), { pinned: false });
  }
  root.style.display = 'flex';
  root.classList.add('open');
  renderAllPanels();
}

export function hide() {
  if (root) {
    root.classList.remove('open');
    root.style.display = 'none';
  }
  hideHoverHelp();
  setHighlightedInspectionTarget(null);
  if (popTimer) {
    clearTimeout(popTimer);
    popTimer = null;
  }
  if (popEl) {
    popEl.remove();
    popEl = null;
  }
}

export function toggle(force) {
  if (force === true) return show();
  if (force === false) return hide();
  if (root && root.classList.contains('open')) hide(); else show();
}

export function isOpen() {
  return !!(root && root.classList.contains('open'));
}
