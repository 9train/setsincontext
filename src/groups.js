// src/groups.js
// Tag SVG elements with semantic classes for theming/styling,
// and expose helpers to control/inspect those groups.

import { getDefaultControllerProfile } from './controllers/profiles/index.js';
import { getProfileGroupRules } from './controllers/core/ui.js';

const DEFAULT_GROUP_PROFILE = getDefaultControllerProfile();
const STRUCTURAL_TAGS = new Set(['defs', 'style', 'metadata', 'sodipodi:namedview', 'inkscape:grid']);
const INLINE_PAINT_KEYS = new Set(['fill', 'stroke']);

export const THEME_SVG_PAINT_PRIORITY = 'scoped-important';

export const DEFAULT_RULES = Object.freeze([
  // Rails and guides
  { className: 'rail',       match: /^(channel_|tempo_|xf_|xfader|rail_)/i },

  // Faders / sliders
  { className: 'fader',      match: /^slider_ch[1-4]\b/i },
  { className: 'tempo',      match: /^slider_tempo_(l|r)\b/i },
  { className: 'xfader',     match: /^(xfader(_slider)?|crossfader)\b/i },

  // Pads and pad modes
  { className: 'pad',        match: /^pad_(l|r)_[0-8]\b/i },
  { className: 'pad-mode',   match: /^(hotcue_|padfx_|sampler_|beatjump_|beatsync_)/i },

  // Knobs and notch/pointers
  { className: 'knob',       match: /^(knob_|trim_|hi_|mid_|low_|filter_)/i },
  {
    className: 'knob-notch',
    test: ({ normalizedId = '', tagName = '' }) => (
      normalizedId.includes('notch')
      || normalizedId.includes('pointer')
      || normalizedId.includes('knob_notch')
      || (tagName === 'path' && normalizedId.includes('knob'))
    ),
  },
]);

/* --- id normalization helpers (match _x5F_ and _) --- */
function toIdVariants(id = '') {
  const v = String(id);
  const a = new Set([v]);
  if (v.includes('_x5F_')) a.add(v.replace(/_x5F_/g, '_'));
  if (v.includes('_'))     a.add(v.replace(/_/g, '_x5F_'));
  return [...a];
}
export function getElByAnyIdIn(root, id) {
  if (!root || !id) return null;
  for (const vid of toIdVariants(id)) {
    const el = root.getElementById(vid);
    if (el) return el;
  }
  return null;
}

function normalizeElementInfo(info = {}) {
  const id = String(info.id || '').trim();
  const tagName = String(info.tagName || info.tag || '').trim().toLowerCase();
  const label = String(info.label || '').trim();
  const styleText = String(info.styleText || info.style || '').trim();
  const inlinePaint = extractInlinePaint({
    styleText,
    fill: info.fill,
    stroke: info.stroke,
  });
  return {
    ...info,
    id,
    tagName,
    label,
    styleText,
    inlinePaint,
    hasInlinePaint: Object.keys(inlinePaint).length > 0,
    normalizedId: id.toLowerCase(),
    normalizedLabel: label.toLowerCase(),
    parentId: info.parentId ? String(info.parentId) : null,
    ancestorIds: Array.isArray(info.ancestorIds) ? info.ancestorIds.map((value) => String(value)) : [],
  };
}

function toElementInfoFromNode(node, ancestorIds = []) {
  return normalizeElementInfo({
    id: node?.id || node?.getAttribute?.('id') || '',
    tagName: node?.tagName || '',
    label: node?.getAttribute?.('inkscape:label') || '',
    styleText: node?.getAttribute?.('style') || '',
    fill: node?.getAttribute?.('fill'),
    stroke: node?.getAttribute?.('stroke'),
    ancestorIds,
  });
}

function parseStyleDeclarations(styleText = '') {
  const declarations = {};
  String(styleText || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const colonIndex = entry.indexOf(':');
      if (colonIndex <= 0) return;
      const key = entry.slice(0, colonIndex).trim().toLowerCase();
      const value = entry.slice(colonIndex + 1).trim();
      if (!key || !value) return;
      declarations[key] = value;
    });
  return declarations;
}

function extractInlinePaint({ styleText = '', fill = null, stroke = null } = {}) {
  const paint = {};
  const declarations = parseStyleDeclarations(styleText);
  INLINE_PAINT_KEYS.forEach((key) => {
    const attrValue = key === 'fill' ? fill : stroke;
    const styleValue = declarations[key];
    const value = styleValue ?? attrValue;
    if (value == null) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    paint[key] = normalized;
  });
  return paint;
}

function parseAttributes(attrText = '') {
  const attrs = {};
  for (const match of String(attrText || '').matchAll(/([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function collectInfosFromSvgText(svgText = '') {
  const infos = [];
  const stack = [];
  const tagPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z0-9:_-]+)\s*>|<([A-Za-z0-9:_-]+)\b([^<>]*?)(\/?)>/g;

  for (const match of String(svgText || '').matchAll(tagPattern)) {
    if (match[1]) {
      stack.pop();
      continue;
    }

    const tagName = String(match[2] || '').toLowerCase();
    const attrs = parseAttributes(match[3] || '');
    const selfClosing = match[4] === '/';
    const id = attrs.id ? String(attrs.id) : '';
    const ancestorIds = stack.map((entry) => entry.id).filter(Boolean);
    const parentId = [...ancestorIds].reverse().find(Boolean) || null;
    const entry = { tagName, id };

    if (id) {
      infos.push(normalizeElementInfo({
        id,
        tagName,
        label: attrs['inkscape:label'] || '',
        styleText: attrs.style || '',
        fill: attrs.fill,
        stroke: attrs.stroke,
        parentId,
        ancestorIds,
      }));
    }

    if (!selfClosing) stack.push(entry);
  }

  return infos;
}

function collectInfosFromSvgRoot(svgRoot) {
  const infos = [];

  function walk(node, ancestorIds = []) {
    if (!node || typeof node !== 'object') return;
    const info = toElementInfoFromNode(node, ancestorIds);
    const nextAncestorIds = info.id ? [...ancestorIds, info.id] : [...ancestorIds];

    if (info.id) infos.push(info);
    Array.from(node.children || []).forEach((child) => walk(child, nextAncestorIds));
  }

  walk(svgRoot, []);
  return infos;
}

function resolveActiveRules(rules = null) {
  return Array.isArray(rules)
    ? rules
    : getProfileGroupRules(DEFAULT_GROUP_PROFILE, DEFAULT_RULES);
}

function matchesRule(rule, info) {
  if (!rule || !info?.id) return false;
  if (typeof rule.test === 'function') return !!rule.test(info);
  if (rule.match instanceof RegExp) return rule.match.test(info.normalizedId);
  return false;
}

function inferIgnoreReason(info, directCoverage, infosById) {
  if (!info?.id) return 'missing-id';
  if (STRUCTURAL_TAGS.has(info.tagName)) return 'structural-node';
  if (/^(namedview|grid|defs|style)/i.test(info.id)) return 'metadata-node';
  if (info.parentId && /^defs/i.test(info.parentId) && /^rect/i.test(info.id)) return 'definition-template';

  const ancestorGroup = [...(info.ancestorIds || [])]
    .reverse()
    .find((ancestorId) => (directCoverage[ancestorId]?.groups || []).length);
  if (ancestorGroup) return `covered-by-ancestor:${ancestorGroup}`;

  if (info.tagName === 'g' || info.tagName === 'svg') {
    const hasIdChildren = Object.values(infosById).some((candidate) => candidate.parentId === info.id);
    if (hasIdChildren) return 'container-group';
    return 'empty-container';
  }

  return '';
}

function findCoveredAncestorId(info, directCoverage) {
  return [...(info?.ancestorIds || [])]
    .reverse()
    .find((ancestorId) => (directCoverage[ancestorId]?.groups || []).length) || null;
}

export function getThemeGroupsForId(id = '', rules = null, extra = {}) {
  const info = normalizeElementInfo({ ...extra, id });
  if (!info.id) return [];
  return resolveActiveRules(rules)
    .filter((rule) => matchesRule(rule, info))
    .map((rule) => rule.className)
    .filter(Boolean);
}

export function classifySvgId(id = '', rules = null, extra = {}) {
  const groups = getThemeGroupsForId(id, rules, extra);
  return {
    id: String(id || ''),
    groups,
    status: groups.length ? 'grouped' : 'ungrouped',
  };
}

export function auditSvgThemeCoverage(svgInput, rules = null, opts = {}) {
  const { themePaintWins = THEME_SVG_PAINT_PRIORITY === 'scoped-important' } = opts;
  const infos = typeof svgInput === 'string'
    ? collectInfosFromSvgText(svgInput)
    : collectInfosFromSvgRoot(svgInput);
  const activeRules = resolveActiveRules(rules);
  const infosById = Object.fromEntries(infos.map((info) => [info.id, info]));
  const directCoverage = Object.fromEntries(infos.map((info) => [info.id, {
    groups: getThemeGroupsForId(info.id, activeRules, info),
  }]));
  const idsByGroup = {};
  const groupedIds = [];
  const ignoredIds = [];
  const ungroupedSuspiciousIds = [];
  const inlinePaintIds = [];
  const paintBlockedIds = [];
  const reportById = {};

  infos.forEach((info) => {
    const groups = directCoverage[info.id]?.groups || [];
    const coveredByAncestorId = findCoveredAncestorId(info, directCoverage);
    const inheritedGroups = coveredByAncestorId ? (directCoverage[coveredByAncestorId]?.groups || []) : [];
    const effectiveGroups = groups.length ? groups : inheritedGroups;
    const inlinePaint = info.inlinePaint || {};
    const paintReason = groups.length
      ? 'inline-paint-on-grouped-node'
      : (coveredByAncestorId ? `inline-paint-under-ancestor:${coveredByAncestorId}` : '');
    const isPaintBlocked = !themePaintWins && info.hasInlinePaint && effectiveGroups.length > 0;

    if (info.hasInlinePaint) inlinePaintIds.push(info.id);
    groups.forEach((groupName) => {
      if (!idsByGroup[groupName]) idsByGroup[groupName] = [];
      idsByGroup[groupName].push(info.id);
    });

    if (isPaintBlocked) {
      if (groups.length) groupedIds.push(info.id);
      paintBlockedIds.push(info.id);
      reportById[info.id] = {
        status: 'paint-blocked',
        groups,
        effectiveGroups,
        reason: paintReason,
        inlinePaint,
        info,
      };
      return;
    }

    if (groups.length) {
      groupedIds.push(info.id);
      reportById[info.id] = { status: 'grouped', groups, inlinePaint, info };
      return;
    }

    const reason = inferIgnoreReason(info, directCoverage, infosById);
    if (reason) {
      ignoredIds.push(info.id);
      reportById[info.id] = {
        status: 'ignored',
        reason,
        groups: [],
        inheritedGroups,
        inlinePaint,
        info,
      };
      return;
    }

    ungroupedSuspiciousIds.push(info.id);
    reportById[info.id] = { status: 'ungrouped', groups: [], inlinePaint, info };
  });

  return {
    totalIds: infos.length,
    groupedIds,
    ignoredIds,
    ungroupedSuspiciousIds,
    inlinePaintIds,
    paintBlockedIds,
    idsByGroup,
    reportById,
  };
}

/**
 * Apply semantic classes to elements by id pattern.
 * @param {SVGSVGElement} svgRoot
 * @param {Array<{className:string, match:RegExp}>} rules
 * @param {{clearExisting?: boolean}} opts
 * @returns {{total:number, ids:string[]}}
 */
export function applyGroups(svgRoot, rules = null, opts = {}) {
  if (!svgRoot) return { total: 0, ids: [] };
  const { clearExisting = false } = opts;
  const activeRules = resolveActiveRules(rules);

  if (clearExisting) clearGroupClasses(svgRoot);

  const tagged = new Set();
  svgRoot.__flxGroupRules = activeRules;
  svgRoot.querySelectorAll('[id]').forEach(el => {
    const info = toElementInfoFromNode(el);
    activeRules
      .filter((rule) => matchesRule(rule, info))
      .forEach((rule) => {
        el.classList.add(`g-${rule.className}`);
        tagged.add(el.id);
      });
  });
  return { total: tagged.size, ids: [...tagged] };
}

/** Remove all g-* classes from the SVG (non-destructive to other classes). */
export function clearGroupClasses(svgRoot, prefix = 'g-') {
  if (!svgRoot) return;
  const toStrip = [];
  svgRoot.querySelectorAll('[class]').forEach(el => {
    const cls = el.getAttribute('class') || '';
    if (cls.includes(prefix)) toStrip.push(el);
  });
  toStrip.forEach(el => {
    const classes = (el.getAttribute('class') || '')
      .split(/\s+/)
      .filter(c => c && !c.startsWith(prefix));
    if (classes.length) el.setAttribute('class', classes.join(' '));
    else el.removeAttribute('class');
  });
}

/** Retag with a new ruleset (clears previous g-* classes first). */
export function retag(svgRoot, newRules = null) {
  clearGroupClasses(svgRoot);
  return applyGroups(svgRoot, newRules);
}

/** List ids by group class. */
export function listGroups(svgRoot, rules = null) {
  if (!svgRoot) return {};
  const activeRules = Array.isArray(rules)
    ? rules
    : svgRoot.__flxGroupRules || getProfileGroupRules(DEFAULT_GROUP_PROFILE, DEFAULT_RULES);
  const out = {};
  [...new Set(activeRules.map((rule) => rule.className).filter(Boolean))].forEach((cls) => {
    out[cls] = Array.from(svgRoot.querySelectorAll(`.g-${cls}`)).map(n=>n.id);
  });
  return out;
}

/** Find elements by group name ("pad", "knob", etc.). */
export function findByGroup(svgRoot, groupName) {
  if (!svgRoot) return [];
  return Array.from(svgRoot.querySelectorAll(`.g-${groupName}`));
}

/** Briefly highlight a whole group (adds .lit for ms). */
export function highlightGroup(svgRoot, groupName, ms = 250) {
  const els = findByGroup(svgRoot, groupName);
  els.forEach(el => el.classList.add('lit'));
  setTimeout(()=> els.forEach(el => el.classList.remove('lit')), ms);
}

/** Toggle applying themed CSS variables to the SVG root. */
export function toggleThemed(svgRoot, on) {
  if (!svgRoot) return;
  svgRoot.classList.toggle('themed', !!on);
}

/** Set CSS variables (keys without the leading --) on the SVG root. */
export function setThemeVars(svgRoot, vars = {}) {
  if (!svgRoot) return;
  const style = svgRoot.style;
  Object.entries(vars).forEach(([k, v]) => {
    style.setProperty(`--${k}`, v);
  });
}
