import {
  BINARY_FLASH_HOLD_MS,
  BINARY_RELEASE_HOLD_MS,
  CONTINUOUS_LIT_HOLD_MS,
  getBoardSvgRoot,
  hasMissingCalibrationHintsWarned,
  heldBinaryTargets,
  jogAngle,
  knobAccumAngle,
  lastCCValue,
  litTimers,
  setBoardSvgRoot,
  setMissingCalibrationHintsWarned,
} from './state.js';
import {
  DEFAULT_BOARD_PROFILE,
  DEFAULT_MAP_URL,
  DEFAULT_SVG_URL,
  getBoardCalibrationHints,
  getBoardRenderKind,
  getElByAnyId,
  listBoardTargetsInSvg,
  resolveRenderTargetId,
} from './profile.js';
import {
  applyDraftCompatibilityMap,
  infoKey,
  loadInitialUnifiedMap,
  remergeLocalMappings,
} from './map-store.js';
import {
  decodeRelative7,
  getContinuousRenderValue,
  getLinearControlPosition,
  shouldHoldBinaryVisualState,
} from './controls.js';
import {
  attachBoardRenderInfo,
  resolveInfoRenderPlan,
  updateBoardRenderInfo,
} from './render-plan.js';

function getBoardElementById(id) {
  return getElByAnyId(getBoardSvgRoot(), id);
}

function getJogConfig(el, entry) {
  const degPerStep = Number(el.getAttribute('data-deg-per-step') || entry?.degPerStep || 2.5);
  const mode = (entry?.mode || el.getAttribute('data-jog-mode') || 'relative7').toLowerCase();

  const ptr = el.getAttribute('data-rotate-id');
  let rotateTarget = el;
  if (ptr && el.ownerSVGElement) {
    const root = el.ownerSVGElement;
    rotateTarget =
      root.getElementById(ptr)
      || root.getElementById(ptr.replace(/_x5F_/g, '_'))
      || root.getElementById(ptr.replace(/_/g, '_x5F_'))
      || el;
  }
  return { degPerStep, mode, rotateTarget };
}

function findFirstByCandidates(candidates) {
  for (const id of candidates) {
    const el = getBoardElementById(id);
    if (el) return { id: el.id, el };
  }
  return null;
}

function setData(el, key, val) {
  if (!el) return;
  el.setAttribute(key, String(val));
}

function applyCalibrationHint(hint) {
  const cap = getBoardElementById(resolveRenderTargetId(hint && hint.targetId));
  if (!cap) return false;

  const rail = findFirstByCandidates(hint && hint.railIds || []);
  if (!rail) return false;

  const capBB = cap.getBBox();
  const railBB = rail.el.getBBox();

  if ((hint && hint.axis) === 'x') {
    const minX = railBB.x;
    const maxX = railBB.x + railBB.width - capBB.width;
    setData(cap, 'data-minX', minX.toFixed(1));
    setData(cap, 'data-maxX', maxX.toFixed(1));
    const x0 = parseFloat(cap.getAttribute('x') || minX);
    const x = Math.max(minX, Math.min(maxX, x0));
    cap.setAttribute('x', x.toFixed(1));
    return true;
  }

  const minY = railBB.y;
  const maxY = railBB.y + railBB.height - capBB.height;
  setData(cap, 'data-minY', minY.toFixed(1));
  setData(cap, 'data-maxY', maxY.toFixed(1));
  const y0 = parseFloat(cap.getAttribute('y') || minY);
  const y = Math.max(minY, Math.min(maxY, y0));
  cap.setAttribute('y', y.toFixed(1));
  return true;
}

function autoCalibrateSliders() {
  if (!getBoardSvgRoot()) return;
  const calibrationHints = getBoardCalibrationHints();
  if (!calibrationHints.length) {
    if (!hasMissingCalibrationHintsWarned()) {
      setMissingCalibrationHintsWarned(true);
      try {
        console.warn(
          '[Board] Missing official calibration hints for profile:',
          DEFAULT_BOARD_PROFILE && DEFAULT_BOARD_PROFILE.id || 'unknown',
        );
      } catch {}
    }
    return;
  }
  calibrationHints.forEach((hint) => {
    applyCalibrationHint(hint);
  });
}

function resolveRotateTarget(el) {
  const ptrId = el.getAttribute('data-rotate-id');
  if (ptrId && el.ownerSVGElement) {
    const target = getElByAnyId(el.ownerSVGElement, ptrId);
    if (target) return target;
  }
  return el;
}

const MIXER_GROUPED_KNOB_ID_RE = /^(trim|hi|mid|low|filter)_\d+$/i;

export function isMixerGroupedKnobId(id) {
  return MIXER_GROUPED_KNOB_ID_RE.test(String(id || '').trim());
}

function getKnobRotateConfig(target) {
  const id = (target.id || target.getAttribute('id') || '').toLowerCase();
  const isEqKnob = /^(trim_|hi_|mid_|low_|filter_)/.test(id);

  const defaultMin = isEqKnob ? -135 : 0;
  const defaultMax = isEqKnob ? 135 : 360;
  const defaultOffset = isEqKnob ? 0 : -90;

  const angleMin = parseFloat(target.getAttribute('data-angle-min') ?? defaultMin);
  const angleMax = parseFloat(target.getAttribute('data-angle-max') ?? defaultMax);
  const angleOffset = parseFloat(target.getAttribute('data-angle-offset') ?? defaultOffset);
  const mode = (target.getAttribute('data-rotate-mode') || 'absolute').toLowerCase();

  const cx = target.hasAttribute('data-rotate-cx') ? +target.getAttribute('data-rotate-cx') : null;
  const cy = target.hasAttribute('data-rotate-cy') ? +target.getAttribute('data-rotate-cy') : null;

  return { angleMin, angleMax, angleOffset, mode, cx, cy };
}

function getRotateCenter(target, { cx = null, cy = null } = {}) {
  if (cx != null && cy != null) return [cx, cy];
  if (target.tagName && target.tagName.toLowerCase() === 'circle') {
    const cxi = parseFloat(target.getAttribute('cx') || '0');
    const cyi = parseFloat(target.getAttribute('cy') || '0');
    return [cxi, cyi];
  }
  const bb = target.getBBox();
  return [bb.x + bb.width / 2, bb.y + bb.height / 2];
}

function clearCssRotation(target) {
  try {
    target.style.transform = '';
    target.style.transformBox = '';
    target.style.transformOrigin = '';
    if (typeof target.style.removeProperty === 'function') {
      target.style.removeProperty('transform');
      target.style.removeProperty('transform-box');
      target.style.removeProperty('transform-origin');
    }
  } catch {}
}

function joinSvgTransforms(originalTransform, rotationTransform) {
  const base = String(originalTransform || '').trim();
  return base ? `${base} ${rotationTransform}` : rotationTransform;
}

function getRotationStrategy(target, options = {}) {
  if (!target) return 'css-transform';
  if (options.useAttributeRotation || target.hasAttribute('data-use-attr-rotate')) {
    return 'svg-attribute';
  }
  return 'css-transform';
}

function applyRotation(target, angleDeg, options = {}) {
  const useAttributeRotation = getRotationStrategy(target, options) === 'svg-attribute';

  if (!useAttributeRotation) {
    try {
      target.style.transformBox = 'fill-box';
      target.style.transformOrigin = 'center';
      target.style.transform = `rotate(${angleDeg}deg)`;
    } catch {}
    return;
  }

  clearCssRotation(target);

  if (target.__origTransform == null) {
    target.__origTransform = target.getAttribute('transform') || '';
  }

  const rotateCenter = getRotateCenter(target, options);
  const [rx, ry] = rotateCenter;
  target.setAttribute(
    'transform',
    joinSvgTransforms(target.__origTransform, `rotate(${angleDeg} ${rx} ${ry})`),
  );
}

function getKnobAngle(target, stateKey, value) {
  const { angleMin, angleMax, angleOffset, mode } = getKnobRotateConfig(target);
  const span = angleMax - angleMin;
  const v = Math.max(0, Math.min(127, Number(value) || 0));

  if (mode === 'accum') {
    const prev = (lastCCValue[stateKey + ':knob'] ?? v);
    const step = v - prev;
    const clamped = Math.max(-16, Math.min(16, step));
    const degPerStep = span / 127;
    knobAccumAngle[stateKey] = (knobAccumAngle[stateKey] ?? angleMin) + clamped * degPerStep;
    lastCCValue[stateKey + ':knob'] = v;
    return knobAccumAngle[stateKey] + angleOffset;
  }

  return angleMin + (span * (v / 127)) + angleOffset;
}

function setLitClass(el, lit) {
  if (!el || !el.classList) return;
  if (lit) el.classList.add('lit');
  else el.classList.remove('lit');
}

const FLX6_VISUAL_SIDES = Object.freeze(['left', 'right']);
const FLX6_PAD_MODE_TARGETS = Object.freeze({
  left: Object.freeze({
    hotcue: 'hotcue_L',
    fx: 'padfx_L',
    padfx: 'padfx_L',
    beatjump: 'beatjump_L',
    sampler: 'sampler_L',
  }),
  right: Object.freeze({
    hotcue: 'hotcue_R',
    fx: 'padfx_R',
    padfx: 'padfx_R',
    beatjump: 'beatjump_R',
    sampler: 'sampler_R',
  }),
});
const FLX6_PAD_MODE_GROUP_TARGETS = Object.freeze({
  left: Object.freeze(['hotcue_L', 'padfx_L', 'beatjump_L', 'sampler_L']),
  right: Object.freeze(['hotcue_R', 'padfx_R', 'beatjump_R', 'sampler_R']),
});
const FLX6_DECK_STATE_TARGETS = Object.freeze({
  left: Object.freeze({
    jogCutter: 'deck_layer_alt_L',
    main: 'deck_layer_main_L',
    vinyl: 'vinyl_L',
  }),
  right: Object.freeze({
    jogCutter: 'deck_layer_alt_R',
    main: 'deck_layer_main_R',
    vinyl: 'vinyl_R',
  }),
});

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function setBoardTargetLit(targetId, lit) {
  const el = getBoardElementById(targetId);
  if (!el) return false;
  setLitClass(el, lit);
  return true;
}

function normalizePadModeName(mode) {
  const normalized = String(mode || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'hotcue') return 'hotcue';
  if (normalized === 'fx' || normalized === 'padfx') return 'fx';
  if (normalized === 'beatjump') return 'beatjump';
  if (normalized === 'sampler') return 'sampler';
  return null;
}

export function applyPadModeProjection(padMode) {
  if (!padMode || typeof padMode !== 'object') return false;

  let applied = false;
  FLX6_VISUAL_SIDES.forEach((side) => {
    if (!hasOwn(padMode, side)) return;

    const mode = normalizePadModeName(padMode[side]);
    const targetId = mode && FLX6_PAD_MODE_TARGETS[side][mode];
    if (!targetId) return;

    FLX6_PAD_MODE_GROUP_TARGETS[side].forEach((siblingId) => {
      applied = setBoardTargetLit(siblingId, siblingId === targetId) || applied;
    });
  });

  return applied;
}

function hasDeckProjectionForSide(jogCutter, jogVinylMode, side) {
  return hasOwn(jogCutter, side) || hasOwn(jogVinylMode, side);
}

export function applyDeckStateProjection({ jogCutter, jogVinylMode } = {}) {
  let applied = false;

  FLX6_VISUAL_SIDES.forEach((side) => {
    if (!hasDeckProjectionForSide(jogCutter, jogVinylMode, side)) return;

    const targets = FLX6_DECK_STATE_TARGETS[side];
    const activeTarget = jogCutter && jogCutter[side] === true
      ? targets.jogCutter
      : jogVinylMode && jogVinylMode[side] === true
        ? targets.vinyl
        : targets.main;

    [targets.jogCutter, targets.main, targets.vinyl].forEach((targetId) => {
      applied = setBoardTargetLit(targetId, targetId === activeTarget) || applied;
    });
  });

  return applied;
}

export function applyFlx6VisualStateProjection(projection) {
  if (!projection || typeof projection !== 'object') return false;

  const padModeApplied = applyPadModeProjection(projection.padMode);
  const deckStateApplied = applyDeckStateProjection({
    jogCutter: projection.jogCutter,
    jogVinylMode: projection.jogVinylMode,
  });

  return padModeApplied || deckStateApplied;
}

function applyInfoVisualStateProjection(info) {
  const projection = info && info.controllerVisualState && typeof info.controllerVisualState === 'object'
    ? info.controllerVisualState
    : info && info.controllerState && typeof info.controllerState === 'object'
      ? info.controllerState
      : null;
  return applyFlx6VisualStateProjection(projection);
}

function clearLitTimer(key) {
  if (!key || !litTimers[key]) return;
  clearTimeout(litTimers[key]);
  delete litTimers[key];
}

function pulseLitState(el, key, holdMs = CONTINUOUS_LIT_HOLD_MS) {
  if (!el || !key) return;
  setLitClass(el, true);
  clearLitTimer(key);
  litTimers[key] = setTimeout(() => {
    delete litTimers[key];
    if (heldBinaryTargets[key]) return;
    setLitClass(el, false);
  }, Math.max(0, Number(holdMs) || 0));
}

function setHeldBinaryLitState(el, key, held) {
  if (!el || !key) return;
  clearLitTimer(key);

  if (held) {
    heldBinaryTargets[key] = true;
    setLitClass(el, true);
    return;
  }

  delete heldBinaryTargets[key];
  pulseLitState(el, key, BINARY_RELEASE_HOLD_MS);
}

function animateContinuous(el, entry, value) {
  lastCCValue[entry.target] = value;
  const id = (entry.target || '').toLowerCase();
  const renderKind = getBoardRenderKind(entry.target, entry.canonicalTarget);

  const isVertSlider = renderKind === 'fader'
    || renderKind === 'tempo'
    || /^slider_ch[1-4]$/i.test(id)
    || /^slider_tempo_(l|r)$/i.test(id);
  const isXfader = renderKind === 'xfader' || /^(xfader(_slider)?|crossfader)$/i.test(id);

  if (isVertSlider && el.hasAttribute('y')) {
    if (!el.hasAttribute('data-minY') || !el.hasAttribute('data-maxY')) {
      autoCalibrateSliders();
    }
    const minY = parseFloat(el.getAttribute('data-minY') || el.getAttribute('y') || '0');
    const maxY = parseFloat(el.getAttribute('data-maxY') || (minY + 140));
    const y = getLinearControlPosition({ min: minY, max: maxY, value, invert: true });
    el.setAttribute('y', y.toFixed(1));
    return;
  }

  if (isXfader && el.hasAttribute('x')) {
    if (!el.hasAttribute('data-minX') || !el.hasAttribute('data-maxX')) {
      autoCalibrateSliders();
    }
    const minX = parseFloat(el.getAttribute('data-minX') || el.getAttribute('x') || '0');
    const maxX = parseFloat(el.getAttribute('data-maxX') || (minX + 300));
    const x = getLinearControlPosition({ min: minX, max: maxX, value });
    el.setAttribute('x', x.toFixed(1));
    return;
  }

  if (renderKind === 'jog' || /^jog_/.test(id)) {
    const { degPerStep, mode, rotateTarget } = getJogConfig(el, entry);

    let deltaDeg = 0;
    if (mode === 'relative7') {
      deltaDeg = decodeRelative7(value) * degPerStep;
    } else {
      const prev = (lastCCValue[entry.target + ':jogAbs'] ?? value);
      let diff = value - prev;
      if (diff > 64) diff -= 128;
      if (diff < -64) diff += 128;
      deltaDeg = diff * degPerStep;
      lastCCValue[entry.target + ':jogAbs'] = value;
    }

    const key = entry.target || id;
    jogAngle[key] = (jogAngle[key] ?? 0) + deltaDeg;

    rotateTarget.style.transformBox = 'fill-box';
    rotateTarget.style.transformOrigin = 'center';
    rotateTarget.style.transform = `rotate(${jogAngle[key]}deg)`;

    el.classList.add('lit');
    return;
  }

  if (renderKind === 'knob' || /(knob|trim_|^hi_|^mid_|^low_|^filter_)/.test(id)) {
    const target = resolveRotateTarget(el);
    if (!target) return;

    const angle = getKnobAngle(target, entry.target || id, value);
    applyRotation(target, angle);
    el.classList.add('lit');
    return;
  }

  el.classList.add('lit');
}

export async function initBoard({ hostId, svgUrl = DEFAULT_SVG_URL, mapUrl = DEFAULT_MAP_URL } = {}) {
  const host = document.getElementById(hostId);
  if (!host) throw new Error(`Board host #${hostId} not found`);

  const svgTxt = await (await fetch(svgUrl, { cache: 'no-store' })).text();
  host.innerHTML = svgTxt;
  setBoardSvgRoot(host.querySelector('svg'));
  installBoardWindowBindings();

  try {
    const mod = await import('../groups.js');
    if (mod?.applyGroups) {
      const info = mod.applyGroups(getBoardSvgRoot());
      if (typeof window !== 'undefined') {
        window.FLXGroups = {
          list: () => (mod.listGroups ? mod.listGroups(getBoardSvgRoot()) : info),
          info: () => info,
        };
      }
    }
  } catch {}

  await loadInitialUnifiedMap(mapUrl);
  autoCalibrateSliders();
}

export function consumeInfo(info) {
  if (!getBoardSvgRoot() || !info) return;

  const key = infoKey(info);
  const renderPlan = resolveInfoRenderPlan(info);
  attachBoardRenderInfo(info, renderPlan);
  if (!renderPlan.targetId) {
    updateBoardRenderInfo(info, {
      applied: false,
      outcome: renderPlan.blocked ? 'blocked' : 'absent',
      detail: renderPlan.fallbackReason || renderPlan.source || 'no-render-target',
    });
    applyInfoVisualStateProjection(info);
    return;
  }

  const renderEntry = {
    target: renderPlan.targetId,
    canonicalTarget: renderPlan.canonicalTarget,
    mappingId: renderPlan.mappingId,
    context: renderPlan.context,
    profileId: renderPlan.profileId,
  };
  const el = getBoardElementById(renderPlan.targetId);
  if (!el) {
    updateBoardRenderInfo(info, {
      applied: false,
      outcome: 'target-missing',
      detail: renderPlan.targetId,
    });
    applyInfoVisualStateProjection(info);
    return;
  }
  const visualKey = renderPlan.targetId || key;
  const delegatedJogVisual = info.__flxJogVisualHandled === true
    && /^jog_/i.test(renderPlan.targetId || '');

  if (info.__flxDebug) {
    try {
      console.debug(
        '[FLX debug] applied event to',
        renderPlan.targetId,
        'via',
        renderPlan.authority,
        renderPlan.source,
        info.__flxDebugKey || key,
      );
    } catch {}
  }

  const type = (info.type || '').toLowerCase();
  if (delegatedJogVisual) {
    updateBoardRenderInfo(info, {
      applied: true,
      outcome: 'updated',
      detail: 'delegated-jog-runtime',
    });
    applyInfoVisualStateProjection(info);
    return;
  }
  if (type === 'cc') {
    const renderValue = getContinuousRenderValue(renderEntry, info);
    if (renderValue == null) {
      updateBoardRenderInfo(info, {
        applied: false,
        outcome: 'deferred',
        detail: 'waiting-for-paired-value',
      });
      applyInfoVisualStateProjection(info);
      return;
    }
    animateContinuous(el, renderEntry, renderValue);
    pulseLitState(el, visualKey, CONTINUOUS_LIT_HOLD_MS);
    updateBoardRenderInfo(info, {
      applied: true,
      outcome: 'updated',
      detail: 'continuous',
    });
  } else if (type === 'noteon') {
    if (shouldHoldBinaryVisualState(info)) {
      setHeldBinaryLitState(el, visualKey, true);
    } else {
      pulseLitState(el, visualKey, BINARY_FLASH_HOLD_MS);
    }
    updateBoardRenderInfo(info, {
      applied: true,
      outcome: 'updated',
      detail: shouldHoldBinaryVisualState(info) ? 'binary-hold-on' : 'binary-pulse-on',
    });
  } else if (type === 'noteoff') {
    if (shouldHoldBinaryVisualState(info)) {
      setHeldBinaryLitState(el, visualKey, false);
    } else {
      clearLitTimer(visualKey);
      setLitClass(el, false);
    }
    updateBoardRenderInfo(info, {
      applied: true,
      outcome: 'updated',
      detail: shouldHoldBinaryVisualState(info) ? 'binary-hold-off' : 'binary-off',
    });
  } else {
    updateBoardRenderInfo(info, {
      applied: false,
      outcome: 'unsupported-type',
      detail: type || 'unknown',
    });
  }

  applyInfoVisualStateProjection(info);
}

function allTargetIdsInSVG() {
  const svgRoot = getBoardSvgRoot();
  if (!svgRoot) return [];
  return listBoardTargetsInSvg(svgRoot).map((target) => target.targetId);
}

function flashByTarget(id, ms = 160) {
  const el = getBoardElementById(id);
  if (!el) return false;
  el.classList.add('lit');
  setTimeout(() => el.classList.remove('lit'), ms);
  return true;
}

function smokeFlashAll({ delay = 60 } = {}) {
  const ids = allTargetIdsInSVG();
  let index = 0;
  const tick = () => {
    if (index >= ids.length) return;
    flashByTarget(ids[index++], 140);
    setTimeout(tick, delay);
  };
  tick();
  return { count: ids.length };
}

function listSliderBounds() {
  const out = [];
  for (let ch = 1; ch <= 4; ch += 1) {
    const el = getBoardElementById(`slider_ch${ch}`);
    if (!el) continue;
    out.push({
      id: el.id,
      minY: +el.getAttribute('data-minY') || null,
      maxY: +el.getAttribute('data-maxY') || null,
    });
  }
  ['L', 'R'].forEach((side) => {
    const el = getBoardElementById(`slider_TEMPO_${side}`);
    if (el) {
      out.push({
        id: el.id,
        minY: +el.getAttribute('data-minY') || null,
        maxY: +el.getAttribute('data-maxY') || null,
      });
    }
  });
  const xfader = getBoardElementById('xfader_slider')
    || getBoardElementById('xfader')
    || getBoardElementById('crossfader');
  if (xfader) {
    out.push({
      id: xfader.id,
      minX: +xfader.getAttribute('data-minX') || null,
      maxX: +xfader.getAttribute('data-maxX') || null,
    });
  }
  console.table(out);
  return out;
}

let lastDebugRotateTarget = null;

function markDebugRotateTarget(target) {
  if (lastDebugRotateTarget && lastDebugRotateTarget.dataset) {
    lastDebugRotateTarget.dataset.flxDebugRotateTarget = 'false';
  }
  if (target && target.dataset) {
    target.dataset.flxDebugRotateTarget = 'true';
  }
  lastDebugRotateTarget = target || null;
}

function rotateKnob(targetId, value = 127) {
  const resolvedTargetId = resolveRenderTargetId(targetId) || targetId;
  const el = getBoardElementById(resolvedTargetId) || getBoardElementById(targetId);
  if (!el) return null;

  const target = resolveRotateTarget(el);
  if (!target) return null;

  const angleDeg = getKnobAngle(target, target.id || resolvedTargetId || targetId, value);
  applyRotation(target, angleDeg);
  markDebugRotateTarget(target);

  const info = {
    requestedId: targetId,
    resolvedElementId: el.id || null,
    rotateTargetId: target.id || null,
    mixerGroupedKnob: isMixerGroupedKnobId(target.id || ''),
    strategy: getRotationStrategy(target),
    angleDeg,
  };

  try {
    console.debug('[FLXTest.rotateKnob]', info);
  } catch {}

  return info;
}

function getDraftMapCandidateFromEvent(ev) {
  const detail = ev && ev.detail;
  if (Array.isArray(detail)) return detail;
  if (detail && Array.isArray(detail.map)) return detail.map;
  return [];
}

export function installBoardWindowBindings() {
  if (typeof window === 'undefined') return;

  window.FLXTest = window.FLXTest || {};
  window.FLXTest.flashByTarget = flashByTarget;
  window.FLXTest.smokeFlashAll = smokeFlashAll;
  window.FLXTest.listIds = allTargetIdsInSVG;
  window.FLXTest.listSliderBounds = listSliderBounds;
  window.FLXTest.rotateKnob = rotateKnob;

  if (!window.__FLX_DRAFT_MAP_CANDIDATE_BIND__) {
    window.__FLX_DRAFT_MAP_CANDIDATE_BIND__ = true;
    const onDraftMapCandidate = (ev) => {
      try {
        const remote = getDraftMapCandidateFromEvent(ev);
        const merged = applyDraftCompatibilityMap(remote);
        // eslint-disable-next-line no-console
        console.log('[Board] Registered draft map candidate:', merged.length);
      } catch (e) {
        console.warn('[Board] draft map candidate failed:', e);
      }
    };
    window.addEventListener('flx:draft-map-candidate', onDraftMapCandidate);
    window.addEventListener('flx:remote-map', onDraftMapCandidate);
  }

  if (!window.__FLX_REMERGE_BIND__) {
    window.__FLX_REMERGE_BIND__ = true;
    window.addEventListener('flx:map-updated', () => {
      try {
        const merged = remergeLocalMappings();
        // eslint-disable-next-line no-console
        console.log('[Board] Re-merged learned mappings:', merged.length);
      } catch {}
    });
  }
}
