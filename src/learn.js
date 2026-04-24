// src/learn.js
// Minimal in-page learner used by Edit Mode & Wizard.
// The official learn session now lives in the controller layer.
// This file stays as a small compatibility wrapper for Edit Mode / Wizard:
// it captures through the controller-layer learn session, saves a draft artifact,
// writes the current board-compatible learned map, and still mirrors legacy
// learnedMappings as a fallback.

import { getDefaultControllerProfile } from './controllers/profiles/index.js';
import { flx6Profile } from './controllers/profiles/ddj-flx6.js';
import {
  armLearnSession,
  assignLearnCapture,
  captureLearnInput,
  createLearnSession,
  exportLearnDraft,
} from './controllers/learn/session.js';
import {
  loadDraftMappings as loadBoardDraftMappings,
  loadMappings as loadBoardMappings,
  upsertMapping as upsertBoardMapping,
} from './mapper.js';
import { resolveProfileEditorTarget } from './controllers/core/ui.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

export const LEARNED_MAPPINGS_KEY = 'learnedMappings';
export const CONTROLLER_LEARN_DRAFT_KEY = 'controllerLearnDraft';
const DEFAULT_LEARN_PROFILE = getDefaultControllerProfile() || flx6Profile;

function resolveId(id){
  const root = document; if (!id) return null;
  let el = root.getElementById(id);
  if (!el && id.includes('_x5F_')) el = root.getElementById(id.replace(/_x5F_/g,'_'));
  if (!el && id.includes('_'))     el = root.getElementById(id.replace(/_/g,'_x5F_'));
  return el ? el.id : null;
}
function waitNextEvent(timeoutMs=15000){
  const runtimeApp = getRuntimeApp();
  if (runtimeApp && typeof runtimeApp.waitForNextLearnInput === 'function') {
    return runtimeApp.waitForNextLearnInput({ timeoutMs });
  }
  return new Promise((res,rej)=>{
    let done=false;
    const t=setTimeout(()=>{ if(!done){done=true; window.FLX_LEARN_HOOK=null; rej(new Error('Timed out'))}}, timeoutMs);
    window.FLX_LEARN_HOOK = (info)=>{ if(done) return; done=true; clearTimeout(t); window.FLX_LEARN_HOOK=null; res(info); };
  });
}
function entryFromInfo(info, target, name){
  const type = (info.type||'').toLowerCase();
  const code = (type==='cc') ? (info.controller ?? info.d1) : info.d1;
  const key  = `${type}:${info.ch}:${code}`;
  return { name: name||target||key, key, type, ch: info.ch, code, target };
}
function saveLegacyLocal(entry){
  const k=LEARNED_MAPPINGS_KEY;
  let a=[]; try{ a=JSON.parse(localStorage.getItem(k)||'[]'); }catch{}
  const i=a.findIndex(x=>x.key===entry.key);
  if (i>=0) a[i] = { ...a[i], ...entry }; else a.push(entry);
  localStorage.setItem(k, JSON.stringify(a));
}

function saveBoardLocal(entry){
  upsertBoardMapping(entry);
  try { window.dispatchEvent(new CustomEvent('flx:map-updated')); } catch {}
}

export function getControllerLearnDraftStorageKey(profileId = DEFAULT_LEARN_PROFILE.id){
  return `${CONTROLLER_LEARN_DRAFT_KEY}:${profileId || 'unknown'}`;
}

function saveDraftLocal(draft){
  if (!draft || typeof draft !== 'object') return;
  try {
    localStorage.setItem(
      getControllerLearnDraftStorageKey(draft.profileId || DEFAULT_LEARN_PROFILE.id),
      JSON.stringify(draft),
    );
  } catch {}
}

export function loadControllerLearnDraft(profileId = DEFAULT_LEARN_PROFILE.id){
  try {
    const raw = localStorage.getItem(getControllerLearnDraftStorageKey(profileId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function matchesDraftReviewScope(record, scope = {}) {
  if (!record || typeof record !== 'object') return false;
  const targetId = String(scope.targetId || '').trim();
  const canonicalTarget = String(scope.canonicalTarget || '').trim();
  if (!targetId && !canonicalTarget) return true;

  return (
    (targetId && (
      String(record.target || '').trim() === targetId
      || String(record.rawTarget || '').trim() === targetId
    ))
    || (canonicalTarget && (
      String(record.canonicalTarget || record.canonical || '').trim() === canonicalTarget
    ))
  );
}

function filterLearnDraftForScope(draft, scope = {}) {
  if (!draft || typeof draft !== 'object') return null;

  const mappings = Array.isArray(draft.mappings)
    ? draft.mappings.filter((mapping) => matchesDraftReviewScope(mapping, scope)).map((mapping) => clonePlain(mapping))
    : [];
  const hasScope = !!(scope.targetId || scope.canonicalTarget);

  if (hasScope && !mappings.length) return null;

  const captureIds = new Set(
    mappings
      .map((mapping) => mapping && mapping.learn && mapping.learn.captureId || null)
      .filter(Boolean),
  );
  const assignments = Array.isArray(draft.assignments)
    ? draft.assignments
      .filter((assignment) =>
        !hasScope
        || captureIds.has(assignment && assignment.captureId)
        || matchesDraftReviewScope(assignment, scope)
      )
      .map((assignment) => clonePlain(assignment))
    : [];

  return {
    ...clonePlain(draft),
    assignments,
    mappings,
  };
}

function resolveCanonicalTarget(target, profile = DEFAULT_LEARN_PROFILE){
  return resolveProfileEditorTarget(target, profile)?.canonicalTarget || null;
}

export function buildDraftReviewArtifact({
  targetId = null,
  canonicalTarget = null,
  profile = DEFAULT_LEARN_PROFILE,
  exportedAt = Date.now(),
} = {}) {
  const profileId = profile && profile.id || DEFAULT_LEARN_PROFILE.id;
  const scopedCanonicalTarget = canonicalTarget
    || resolveCanonicalTarget(targetId, profile)
    || null;
  const scope = Object.freeze({
    mode: targetId || scopedCanonicalTarget ? 'selected-target' : 'all-drafts',
    targetId: targetId || null,
    canonicalTarget: scopedCanonicalTarget,
  });
  const boardDraftMappings = Object.freeze(
    loadBoardDraftMappings(scope).map((entry) => Object.freeze(clonePlain(entry))),
  );
  const learnDraft = filterLearnDraftForScope(loadControllerLearnDraft(profileId), scope);
  const learnDraftMappings = Array.isArray(learnDraft && learnDraft.mappings)
    ? learnDraft.mappings
    : [];
  const rawLanes = new Set([
    ...boardDraftMappings.map((entry) => entry && entry.key || null),
    ...learnDraftMappings.map((mapping) => mapping && mapping.raw && mapping.raw.key || null),
  ].filter(Boolean));

  return Object.freeze({
    kind: 'flx6-draft-review',
    version: 1,
    profileId,
    exportedAt,
    scope,
    safety: Object.freeze({
      officialProfileIncluded: false,
      draftFirst: true,
      description: 'This artifact contains only draft/learned review data. Official FLX6 profile truth is intentionally excluded.',
    }),
    summary: Object.freeze({
      boardDraftCount: boardDraftMappings.length,
      learnDraftMappingCount: learnDraftMappings.length,
      rawLaneCount: rawLanes.size,
    }),
    notes: Object.freeze([
      'Draft review data stays separate from shipped official FLX6 profile truth.',
      'Any accepted change still needs an official FLX6 profile update before it becomes authoritative.',
    ]),
    boardDraftMappings,
    learnDraft: learnDraft ? Object.freeze(clonePlain(learnDraft)) : null,
  });
}

export async function copyDraftReviewJSON(options = {}) {
  const artifact = buildDraftReviewArtifact(options);
  const text = JSON.stringify(artifact, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    console.log('%cDraft review JSON copied to clipboard', 'color:#6ea8fe');
  } catch {
    console.log(text);
  }
  return artifact;
}

export async function learnNext({ target, canonicalTarget = null, name, profile = DEFAULT_LEARN_PROFILE, timeoutMs=15000 }={}){
  if (!target && !canonicalTarget) throw new Error('learnNext needs { target }');
  const targetSelection = resolveProfileEditorTarget(canonicalTarget || target, profile);
  const resolvedTarget = targetSelection && targetSelection.targetId || target;
  const id = resolveId(resolvedTarget);
  if (!id) throw new Error('SVG id not found: ' + resolvedTarget);
  const el = document.getElementById(id);
  el.classList.add('lit'); setTimeout(()=>el.classList.remove('lit'), 250);
  const selectedCanonicalTarget = canonicalTarget
    || targetSelection && targetSelection.canonicalTarget
    || resolveCanonicalTarget(id, profile);
  const session = createLearnSession({ profile, mode: 'single' });
  if (selectedCanonicalTarget) {
    armLearnSession(session, { targetId: selectedCanonicalTarget });
  }
  const info  = await waitNextEvent(timeoutMs);
  const capture = captureLearnInput(session, info, { profile });
  const assignedCanonicalTarget = selectedCanonicalTarget
    || capture && capture.existingCanonicalTarget
    || null;
  const existingAssignment = session.assignments[session.assignments.length - 1] || null;
  const assignment = existingAssignment && existingAssignment.captureId === (capture && capture.id)
    ? existingAssignment
    : assignedCanonicalTarget && capture
      ? assignLearnCapture(session, {
          captureId: capture.id,
          canonicalTarget: assignedCanonicalTarget,
        })
      : null;
  const draft = exportLearnDraft(session);
  if (draft.mappings.length) saveDraftLocal(draft);

  const entry = {
    ...entryFromInfo(info, id, name || targetSelection && targetSelection.label || id),
    canonicalTarget: assignment && assignment.canonicalTarget || assignedCanonicalTarget,
    mapped: !!(capture && capture.mapped),
    mappingId: capture && capture.existingMappingId || null,
    rawTarget: capture && capture.rawTarget || id,
    learnCaptureId: capture && capture.id || null,
    draft: assignment && assignment.mapping || draft.mappings[0] || null,
    learnDraft: draft,
  };
  const savedEntry = {
    name: entry.name,
    key: entry.key,
    type: entry.type,
    ch: entry.ch,
    code: entry.code,
    target: entry.target,
    canonicalTarget: entry.canonicalTarget,
    mapped: entry.mapped,
    mappingId: entry.mappingId,
    rawTarget: entry.rawTarget,
  };
  saveBoardLocal(savedEntry);
  saveLegacyLocal(savedEntry);
  try { const board = await import('./board.js'); await board.initBoard({ hostId:'boardHost' }); } catch {}
  return entry;
}

export async function copyMergedJSON(){
  let fileMap=[]; try{
    const mapUrl = DEFAULT_LEARN_PROFILE
      && DEFAULT_LEARN_PROFILE.assets
      && DEFAULT_LEARN_PROFILE.assets.defaultMapPath
      || '/flx6_map.json';
    const r = await fetch(mapUrl,{ cache:'no-store' });
    if (r.ok) fileMap = await r.json();
  }catch{}
  let local = loadBoardMappings();
  if (!local.length) {
    try { local = JSON.parse(localStorage.getItem(LEARNED_MAPPINGS_KEY)||'[]'); } catch {}
  }
  const byKey = new Map();
  fileMap.forEach(m => byKey.set(m.key || `${m.type}:${m.ch}:${m.code}` || m.target, m));
  local.forEach(m => byKey.set(m.key || `${m.type}:${m.ch}:${m.code}` || m.target, { ...(byKey.get(m.key)||{}), ...m }));
  const merged = [...byKey.values()];
  const text   = JSON.stringify(merged, null, 2);
  try { await navigator.clipboard.writeText(text); console.log('%cMerged JSON copied to clipboard','color:#6ea8fe'); }
  catch { console.log(text); }
  return merged;
}

if (typeof window!=='undefined') window.FLXLearn = {
  buildDraftReviewArtifact,
  copyDraftReviewJSON,
  learnNext,
  copyJSON: copyMergedJSON,
  loadDraft: loadControllerLearnDraft,
};
