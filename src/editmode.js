// src/editmode.js
// Toggle edit mode: click an SVG control -> press on controller -> mapping saved.
// Highlight target, warn on duplicates, and offer Download.

import { getDefaultControllerProfile } from './controllers/profiles/index.js';
import { getElByAnyIdIn, resolveProfileEditorTargetFromElement } from './controllers/core/ui.js';

const DEFAULT_EDIT_PROFILE = getDefaultControllerProfile();

let on = false, bar, selEl, msgEl, learnBtn, dlBtn;

function css() {
  const s = document.createElement('style');
  s.textContent = `
  #editbar {
    position: fixed; left: 12px; top: 12px; z-index: 99990;
    background:#0b1020; color:#cfe0ff; border:1px solid #33406b;
    border-radius:12px; padding:8px 10px; box-shadow:0 8px 24px rgba(0,0,0,.35);
    display:none; gap:8px; align-items:center;
    font: 12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  }
  #editbar .sel { font-weight:600; color:#9fb2de; min-width: 160px }
  #editbar .warn { color:#ff9494 }
  `;
  document.head.appendChild(s);
}

function buildBar() {
  if (bar) return;
  css();
  bar = document.createElement('div');
  bar.id = 'editbar';

  const titleEl = document.createElement('span');
  titleEl.textContent = 'Edit Mode';
  bar.appendChild(titleEl);

  selEl = document.createElement('span');
  selEl.id = 'ed-sel';
  if (selEl.classList && typeof selEl.classList.add === 'function') selEl.classList.add('sel');
  selEl.textContent = '— click a control —';
  bar.appendChild(selEl);

  learnBtn = document.createElement('button');
  learnBtn.id = 'ed-learn';
  learnBtn.textContent = 'Listen';
  learnBtn.onclick = async () => {
    const target = bar.dataset.selId;
    const canonicalTarget = bar.dataset.selCanonicalTarget || null;
    if (!target) return msg('Pick a control first.');
    try {
      const { learnNext } = await import('./learn.js');
      const entry = await learnNext({ target, canonicalTarget, name: target });
      duplicateCheck(entry);
      msg('Saved: ' + entry.key);
    } catch (e) {
      msg(e.message, true);
    }
  };
  bar.appendChild(learnBtn);

  dlBtn = document.createElement('button');
  dlBtn.id = 'ed-dl';
  dlBtn.textContent = 'Copy selected review JSON';
  dlBtn.onclick = async () => {
    const target = bar.dataset.selId;
    const canonicalTarget = bar.dataset.selCanonicalTarget || null;
    if (!target) return msg('Pick a control first.');
    const { copyDraftReviewJSON } = await import('./learn.js');
    await copyDraftReviewJSON({ targetId: target, canonicalTarget });
    msg(`Copied draft review JSON for ${target}.`);
  };
  bar.appendChild(dlBtn);

  msgEl = document.createElement('span');
  msgEl.id = 'ed-msg';
  bar.appendChild(msgEl);

  document.body.appendChild(bar);
}

function msg(t, warn=false){
  if (!msgEl) return;
  msgEl.textContent = t || '';
  msgEl.className = warn ? 'warn' : '';
}

function duplicateCheck(newEntry){
  import('./board.js').then(mod=>{
    const mm = mod.getUnifiedMap();
    const dups = mm.filter(m => m.key === newEntry.key && m.target !== newEntry.target);
    if (dups.length){
      msg(`Duplicate mapping key! Also used by: ${dups.map(d=>d.target).join(', ')}`, true);
      console.warn('[EditMode] Duplicate key', newEntry.key, 'targets:', [newEntry.target, ...dups.map(d=>d.target)]);
    }
  });
}

function setSelectedTarget({ targetId, canonicalTarget = null, label = null, source = 'board-click' } = {}){
  if (!bar || !targetId) return false;
  bar.dataset.selId = targetId;
  if (canonicalTarget) bar.dataset.selCanonicalTarget = canonicalTarget;
  else delete bar.dataset.selCanonicalTarget;
  if (selEl) {
    const displayLabel = label || targetId;
    selEl.textContent = canonicalTarget
      ? `${displayLabel} · ${canonicalTarget}`
      : displayLabel;
  }
  const svg = document.querySelector('#boardHost svg');
  if (svg) {
    if (typeof svg.querySelectorAll === 'function') {
      svg.querySelectorAll('.editing').forEach((n) => n.classList && n.classList.remove('editing'));
    }
    const node = getElByAnyIdIn(svg, targetId);
    if (node) {
      if (node.classList) node.classList.add('editing');
      if (node.style) {
        node.style.filter = 'drop-shadow(0 0 6px #6ea8fe)';
        setTimeout(() => { if (node && node.style) node.style.filter = ''; }, 600);
      }
    }
  }
  if (source === 'debugger') {
    msg('Selected from debugger. Click Listen, then press the controller input.');
  } else {
    msg('Click Listen, then press on your controller.');
  }
  return true;
}

function clickHandler(e){
  if (!on) return;
  const svg = document.querySelector('#boardHost svg');
  if (!svg || !svg.contains(e.target)) return;
  const selection = resolveProfileEditorTargetFromElement(e.target, DEFAULT_EDIT_PROFILE);
  if (!selection || !selection.targetId) return;
  const node = getElByAnyIdIn(svg, selection.targetId) || e.target.closest('[id]');
  if (!node) return;
  setSelectedTarget({
    targetId: selection.targetId,
    canonicalTarget: selection.canonicalTarget || null,
    label: selection.label || selection.targetId,
    source: 'board-click',
  });
}

export function toggle() {
  on = !on;
  buildBar();
  bar.style.display = on ? 'flex' : 'none';
  if (on) msg('Click an SVG control…');
}
export function onState(){ return on; }
export function show() {
  if (on) return;
  toggle();
}
export function hide() {
  if (!on) return;
  toggle();
}
export function isOpen() {
  return onState();
}

export function openForTarget({ targetId, canonicalTarget = null, label = null } = {}) {
  if (!targetId) return false;
  buildBar();
  if (!on) {
    on = true;
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'flex';
  }
  return setSelectedTarget({
    targetId,
    canonicalTarget,
    label: label || targetId,
    source: 'debugger',
  });
}

if (typeof window!=='undefined') window.EDIT = { toggle, on:onState, show, hide, isOpen, openForTarget };
