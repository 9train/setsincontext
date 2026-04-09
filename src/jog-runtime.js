// /src/jog-runtime.js
// Shared HTML-page jog wrapper/runtime used by the canonical host/viewer pages.

function toIdVariants(id) {
  const v = String(id || '');
  const a = new Set([v]);
  if (v.includes('_x5F_')) a.add(v.replace(/_x5F_/g, '_'));
  if (v.includes('_')) a.add(v.replace(/_/g, '_x5F_'));
  return [...a];
}

function getEl(id) {
  for (const vid of toIdVariants(id)) {
    const el = document.getElementById(vid);
    if (el) return el;
  }
  return null;
}

function normalizeJogTargetId(target) {
  return String(target || '')
    .toLowerCase()
    .replace(/_x5f_/g, '_');
}

function getJogSideFromTarget(target) {
  const id = normalizeJogTargetId(target);
  if (/^jog_l(?:_|$)/.test(id)) return 'L';
  if (/^jog_r(?:_|$)/.test(id)) return 'R';
  return null;
}

function getJogSideFromCanonicalInfo(info) {
  const canonicalTarget = String(info && info.canonicalTarget || '').toLowerCase();
  const mappingId = String(info && info.mappingId || '').toLowerCase();

  if (canonicalTarget === 'deck.left.jog.motion' || canonicalTarget === 'deck.left.jog.touch') return 'L';
  if (canonicalTarget === 'deck.right.jog.motion' || canonicalTarget === 'deck.right.jog.touch') return 'R';
  if (mappingId.startsWith('deck.left.jog.motion') || mappingId.startsWith('deck.left.jog.touch')) return 'L';
  if (mappingId.startsWith('deck.right.jog.motion') || mappingId.startsWith('deck.right.jog.touch')) return 'R';
  return null;
}

function applyRotation(el, ang) {
  if (!el) return;
  try {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
    el.style.transform = `rotate(${ang}deg)`;
  } catch {}
  try {
    const bb = el.getBBox();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.setAttribute('transform', `rotate(${ang} ${cx} ${cy})`);
  } catch {}
}

function findJogSide(info, mapEntries) {
  const canonicalSide = getJogSideFromCanonicalInfo(info);
  if (canonicalSide) return canonicalSide;

  const type = (info.type || '').toLowerCase();
  const code = type === 'cc' ? (info.controller ?? info.d1) : info.d1;
  const key = `${type}:${info.ch}:${code}`;
  const hits = (mapEntries || []).filter((m) =>
    (m.key && m.key === key && m.target) ||
    (!m.key && m.type === type && m.ch === info.ch && m.code === (info.controller ?? info.d1) && m.target)
  );

  for (const hit of hits) {
    const side = getJogSideFromTarget(hit.target);
    if (side) return side;
  }
  return null;
}

export function installJogRuntime({
  getUnifiedMap = () => [],
  exposeGlobalControls = false,
} = {}) {
  const CFG = { mode: 'off', sensitivity: 2.5, damping: 0.92 };
  const S = {
    L: { angle: 0, vel: 0, lastVal: null, lastKey: null, el: null },
    R: { angle: 0, vel: 0, lastVal: null, lastKey: null, el: null },
    anim: null,
  };

  function resolveJogEls() {
    S.L.el = getEl('jog_L');
    S.R.el = getEl('jog_R');
  }

  function tick() {
    S.anim = requestAnimationFrame(tick);
    if (CFG.mode !== 'tape') return;
    ['L', 'R'].forEach((side) => {
      const j = S[side];
      if (!j.el) return;
      j.angle += j.vel;
      j.vel *= CFG.damping;
      if (Math.abs(j.vel) < 0.001) j.vel = 0;
      applyRotation(j.el, j.angle);
    });
  }

  function onEvent(info) {
    if (!info || CFG.mode === 'off') return;
    if ((info.type || '').toLowerCase() !== 'cc') return;
    const side = findJogSide(info, getUnifiedMap?.() || []);
    if (!side) return;

    const j = S[side];
    if (!j.el) resolveJogEls();

    if (CFG.mode === 'absolute') {
      const angle = (info.value ?? info.d2 ?? 0) * (360 / 127);
      j.angle = angle;
      applyRotation(j.el, j.angle);
      return;
    }

    if (CFG.mode === 'tape') {
      const type = (info.type || '').toLowerCase();
      const code = type === 'cc' ? (info.controller ?? info.d1) : info.d1;
      const key = `${type}:${info.ch}:${code}`;
      const v = (info.value ?? info.d2 ?? 0) | 0;
      if (j.lastKey !== key) j.lastVal = null;
      let d;
      if (j.lastVal == null) d = 0;
      else {
        d = v - j.lastVal;
        if (d > 64) d -= 128;
        if (d < -64) d += 128;
      }
      j.lastVal = v;
      j.lastKey = key;
      j.vel += d * CFG.sensitivity;
      if (!S.anim) tick();
    }
  }

  resolveJogEls();

  if (!window.__JOG_WRAP__) {
    window.__JOG_WRAP__ = true;
    const orig = window.consumeInfo || ((x) => x);
    window.consumeInfo = (info) => {
      try { onEvent(info); } catch {}
      return orig(info);
    };
  }

  const api = {
    setMode: (m) => {
      CFG.mode = (m === 'off' || m === 'absolute' || m === 'tape') ? m : 'off';
      if (m !== 'tape' && S.anim) {
        cancelAnimationFrame(S.anim);
        S.anim = null;
      }
    },
    get mode() {
      return CFG.mode;
    },
  };

  if (exposeGlobalControls) {
    window.__JOG__ = api;
  }

  return api;
}
