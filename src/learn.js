// src/learn.js
// Minimal in-page learner used by Edit Mode & Wizard.
// The official learn session now lives in the controller layer.
// This file stays as a small compatibility wrapper for Edit Mode / Wizard:
// it captures through the controller-layer learn session, saves a draft artifact,
// and still writes legacy learnedMappings as a fallback for the current board.

import { lookupCanonicalAlias } from './controllers/core/aliases.js';
import { flx6Profile } from './controllers/profiles/ddj-flx6.js';
import {
  armLearnSession,
  assignLearnCapture,
  captureLearnInput,
  createLearnSession,
  exportLearnDraft,
} from './controllers/learn/session.js';

export const LEARNED_MAPPINGS_KEY = 'learnedMappings';
export const CONTROLLER_LEARN_DRAFT_KEY = 'controllerLearnDraft';

function resolveId(id){
  const root = document; if (!id) return null;
  let el = root.getElementById(id);
  if (!el && id.includes('_x5F_')) el = root.getElementById(id.replace(/_x5F_/g,'_'));
  if (!el && id.includes('_'))     el = root.getElementById(id.replace(/_/g,'_x5F_'));
  return el ? el.id : null;
}
function waitNextEvent(timeoutMs=15000){
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
function saveLocal(entry){
  const k=LEARNED_MAPPINGS_KEY;
  let a=[]; try{ a=JSON.parse(localStorage.getItem(k)||'[]'); }catch{}
  const i=a.findIndex(x=>x.key===entry.key);
  if (i>=0) a[i] = { ...a[i], ...entry }; else a.push(entry);
  localStorage.setItem(k, JSON.stringify(a));
}

export function getControllerLearnDraftStorageKey(profileId = flx6Profile.id){
  return `${CONTROLLER_LEARN_DRAFT_KEY}:${profileId || 'unknown'}`;
}

function saveDraftLocal(draft){
  if (!draft || typeof draft !== 'object') return;
  try {
    localStorage.setItem(
      getControllerLearnDraftStorageKey(draft.profileId || flx6Profile.id),
      JSON.stringify(draft),
    );
  } catch {}
}

export function loadControllerLearnDraft(profileId = flx6Profile.id){
  try {
    const raw = localStorage.getItem(getControllerLearnDraftStorageKey(profileId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function resolveCanonicalTarget(target){
  if (!target) return null;
  const aliases = flx6Profile && flx6Profile.aliases && flx6Profile.aliases.controls || null;
  return lookupCanonicalAlias(aliases, target);
}

export async function learnNext({ target, name, timeoutMs=15000 }={}){
  if (!target) throw new Error('learnNext needs { target }');
  const id = resolveId(target);
  if (!id) throw new Error('SVG id not found: '+target);
  const el = document.getElementById(id);
  el.classList.add('lit'); setTimeout(()=>el.classList.remove('lit'), 250);
  const canonicalTarget = resolveCanonicalTarget(id);
  const session = createLearnSession({ profile: flx6Profile, mode: 'single' });
  if (canonicalTarget) {
    armLearnSession(session, { targetId: canonicalTarget });
  }
  const info  = await waitNextEvent(timeoutMs);
  const capture = captureLearnInput(session, info, { profile: flx6Profile });
  const assignedCanonicalTarget = canonicalTarget
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
    ...entryFromInfo(info, id, name),
    canonicalTarget: assignment && assignment.canonicalTarget || assignedCanonicalTarget,
    mapped: !!(capture && capture.mapped),
    mappingId: capture && capture.existingMappingId || null,
    rawTarget: capture && capture.rawTarget || id,
    learnCaptureId: capture && capture.id || null,
    draft: assignment && assignment.mapping || draft.mappings[0] || null,
    learnDraft: draft,
  };
  saveLocal({
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
  });
  try { const board = await import('./board.js'); await board.initBoard({ hostId:'boardHost' }); } catch {}
  return entry;
}

export async function copyMergedJSON(){
  let fileMap=[]; try{
    const mapUrl = flx6Profile
      && flx6Profile.assets
      && flx6Profile.assets.defaultMapPath
      || '/flx6_map.json';
    const r = await fetch(mapUrl,{ cache:'no-store' });
    if (r.ok) fileMap = await r.json();
  }catch{}
  let local=[]; try{ local = JSON.parse(localStorage.getItem('learnedMappings')||'[]'); }catch{}
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
  learnNext,
  copyJSON: copyMergedJSON,
  loadDraft: loadControllerLearnDraft,
};
