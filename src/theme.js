// src/theme.js
// Theme Studio: scene-first board and page theming for the host dashboard.
// Keeps the underlying theme variable system intact while presenting a friendlier UI.

import { setThemeVars, toggleThemed, applyGroups } from './groups.js';

const LS_KEY = 'flx.theme.vars.v1';
const LS_SCENE_KEY = 'flx.theme.custom-scenes.v1';
const LS_RECENT_KEY = 'flx.theme.recent-colors.v1';
const LS_PALETTE_KEY = 'flx.theme.saved-palette.v1';
const SVG_RETRY_LIMIT = 12;
const SVG_RETRY_MS = 140;

let svgRootRef = null;
let panelRef = null;
let state = null;
let selectedStudioGroupKey = 'knob';
let selectedStudioTab = 'colors';
let openSceneOptionsId = null;
let svgRetryHandle = null;
let svgRetryCount = 0;

const CLASSIC_CORE_DEFAULTS = {
  bg: '#0b1020',
  panel: '#10162b',
  ink: '#cfe0ff',
  lit: '#5ec4ff',
  glowProfile: 'medium',
  'group-alpha': '1',
  'groups-enabled': true,
  'rail-fill': 'transparent',
  'rail-stroke': '#33406b',
  'fader-fill': '#0f1423',
  'fader-stroke': '#2a3350',
  'tempo-fill': '#0f1423',
  'tempo-stroke': '#33406b',
  'xfader-fill': '#0f1423',
  'xfader-stroke': '#33406b',
  'pad-fill': '#0f1423',
  'pad-stroke': '#33406b',
  'padmode-fill': '#10162b',
  'padmode-stroke': '#33406b',
  'knob-fill': '#1b2133',
  'knob-stroke': '#33406b',
  'knobnotch-fill': '#cfe0ff',
  'knobnotch-stroke': '#cfe0ff',
};

const CORE_DEFAULTS = {
  bg: '#050505',
  panel: 'rgba(18, 18, 16, 0.8)',
  ink: '#f3efe7',
  lit: '#9cd8ff',
  glowProfile: 'medium',
  'group-alpha': '1',
  'groups-enabled': true,
  'rail-fill': 'transparent',
  'rail-stroke': 'rgba(220, 214, 202, 0.18)',
  'fader-fill': 'rgba(18, 18, 16, 0.9)',
  'fader-stroke': 'rgba(220, 214, 202, 0.14)',
  'tempo-fill': 'rgba(18, 18, 16, 0.9)',
  'tempo-stroke': 'rgba(220, 214, 202, 0.14)',
  'xfader-fill': 'rgba(18, 18, 16, 0.92)',
  'xfader-stroke': 'rgba(220, 214, 202, 0.16)',
  'pad-fill': 'rgba(18, 18, 16, 0.9)',
  'pad-stroke': 'rgba(220, 214, 202, 0.16)',
  'padmode-fill': 'rgba(24, 24, 21, 0.95)',
  'padmode-stroke': 'rgba(220, 214, 202, 0.18)',
  'knob-fill': 'rgba(30, 30, 28, 0.96)',
  'knob-stroke': 'rgba(220, 214, 202, 0.18)',
  'knobnotch-fill': '#f3efe7',
  'knobnotch-stroke': '#f3efe7',
};

const DERIVED_GROUP_FALLBACKS = Object.freeze({
  'board-shell-fill': 'rgba(21, 21, 19, 0.96)',
  'board-shell-stroke': 'rgba(220, 214, 202, 0.18)',
  'label-fill': '#f3efe7',
  'label-stroke': 'transparent',
  'button-fill': 'rgba(24, 24, 21, 0.94)',
  'button-stroke': 'rgba(220, 214, 202, 0.18)',
  'transport-fill': 'rgba(24, 24, 21, 0.94)',
  'transport-stroke': 'rgba(220, 214, 202, 0.18)',
  'loop-fill': 'rgba(24, 24, 21, 0.94)',
  'loop-stroke': 'rgba(220, 214, 202, 0.18)',
  'deck-button-fill': 'rgba(24, 24, 21, 0.94)',
  'deck-button-stroke': 'rgba(220, 214, 202, 0.18)',
  'browser-fill': 'rgba(24, 24, 21, 0.94)',
  'browser-stroke': 'rgba(220, 214, 202, 0.18)',
  'load-fill': 'rgba(24, 24, 21, 0.94)',
  'load-stroke': 'rgba(220, 214, 202, 0.18)',
  'mixer-button-fill': 'rgba(24, 24, 21, 0.94)',
  'mixer-button-stroke': 'rgba(220, 214, 202, 0.18)',
  'fx-fill': 'rgba(24, 24, 21, 0.94)',
  'fx-stroke': 'rgba(220, 214, 202, 0.18)',
  'mergefx-fill': 'rgba(28, 28, 25, 0.95)',
  'mergefx-stroke': 'rgba(220, 214, 202, 0.2)',
  'deck-state-fill': 'rgba(24, 24, 21, 0.88)',
  'deck-state-stroke': 'rgba(220, 214, 202, 0.18)',
  'jog-ring-fill': 'rgba(28, 28, 25, 0.94)',
  'jog-ring-stroke': 'rgba(220, 214, 202, 0.24)',
  'jog-platter-fill': 'rgba(10, 10, 9, 0.96)',
  'jog-platter-stroke': 'rgba(220, 214, 202, 0.1)',
  'jog-touch-fill': 'rgba(18, 18, 16, 0.72)',
  'jog-touch-stroke': 'rgba(220, 214, 202, 0.12)',
  'jog-indicator-fill': '#f3efe7',
  'jog-indicator-stroke': '#f3efe7',
  'decor-fill': 'rgba(220, 214, 202, 0.72)',
  'decor-stroke': 'transparent',
  'icon-fill': '#f3efe7',
  'icon-stroke': 'transparent',
});

function withDerivedGroupVars(vars = {}) {
  const next = { ...vars };
  const fillIfMissing = (key, fallback) => {
    if (next[key] == null) next[key] = fallback;
  };

  fillIfMissing('board-shell-fill', next.panel || DERIVED_GROUP_FALLBACKS['board-shell-fill']);
  fillIfMissing('board-shell-stroke', next['rail-stroke'] || DERIVED_GROUP_FALLBACKS['board-shell-stroke']);
  fillIfMissing('label-fill', next.ink || DERIVED_GROUP_FALLBACKS['label-fill']);
  fillIfMissing('label-stroke', DERIVED_GROUP_FALLBACKS['label-stroke']);
  fillIfMissing('button-fill', next['padmode-fill'] || next['knob-fill'] || DERIVED_GROUP_FALLBACKS['button-fill']);
  fillIfMissing('button-stroke', next['padmode-stroke'] || next['knob-stroke'] || DERIVED_GROUP_FALLBACKS['button-stroke']);
  fillIfMissing('transport-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['transport-fill']);
  fillIfMissing('transport-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['transport-stroke']);
  fillIfMissing('loop-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['loop-fill']);
  fillIfMissing('loop-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['loop-stroke']);
  fillIfMissing('deck-button-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['deck-button-fill']);
  fillIfMissing('deck-button-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['deck-button-stroke']);
  fillIfMissing('browser-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['browser-fill']);
  fillIfMissing('browser-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['browser-stroke']);
  fillIfMissing('load-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['load-fill']);
  fillIfMissing('load-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['load-stroke']);
  fillIfMissing('mixer-button-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['mixer-button-fill']);
  fillIfMissing('mixer-button-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['mixer-button-stroke']);
  fillIfMissing('fx-fill', next['button-fill'] || DERIVED_GROUP_FALLBACKS['fx-fill']);
  fillIfMissing('fx-stroke', next['button-stroke'] || DERIVED_GROUP_FALLBACKS['fx-stroke']);
  fillIfMissing('mergefx-fill', next['knob-fill'] || next['button-fill'] || DERIVED_GROUP_FALLBACKS['mergefx-fill']);
  fillIfMissing('mergefx-stroke', next['knob-stroke'] || next['button-stroke'] || DERIVED_GROUP_FALLBACKS['mergefx-stroke']);
  fillIfMissing('deck-state-fill', next['padmode-fill'] || next['button-fill'] || DERIVED_GROUP_FALLBACKS['deck-state-fill']);
  fillIfMissing('deck-state-stroke', next['padmode-stroke'] || next['button-stroke'] || DERIVED_GROUP_FALLBACKS['deck-state-stroke']);
  fillIfMissing('jog-ring-fill', next['knob-fill'] || DERIVED_GROUP_FALLBACKS['jog-ring-fill']);
  fillIfMissing('jog-ring-stroke', next['knob-stroke'] || DERIVED_GROUP_FALLBACKS['jog-ring-stroke']);
  fillIfMissing('jog-platter-fill', next['fader-fill'] || DERIVED_GROUP_FALLBACKS['jog-platter-fill']);
  fillIfMissing('jog-platter-stroke', next['rail-stroke'] || DERIVED_GROUP_FALLBACKS['jog-platter-stroke']);
  fillIfMissing('jog-touch-fill', DERIVED_GROUP_FALLBACKS['jog-touch-fill']);
  fillIfMissing('jog-touch-stroke', next['rail-stroke'] || DERIVED_GROUP_FALLBACKS['jog-touch-stroke']);
  fillIfMissing('jog-indicator-fill', next['knobnotch-fill'] || DERIVED_GROUP_FALLBACKS['jog-indicator-fill']);
  fillIfMissing('jog-indicator-stroke', next['knobnotch-stroke'] || DERIVED_GROUP_FALLBACKS['jog-indicator-stroke']);
  fillIfMissing('decor-fill', next['rail-stroke'] || DERIVED_GROUP_FALLBACKS['decor-fill']);
  fillIfMissing('decor-stroke', DERIVED_GROUP_FALLBACKS['decor-stroke']);
  fillIfMissing('icon-fill', next.ink || DERIVED_GROUP_FALLBACKS['icon-fill']);
  fillIfMissing('icon-stroke', DERIVED_GROUP_FALLBACKS['icon-stroke']);

  return next;
}

function buildThemeVars(base, overrides = {}) {
  return Object.freeze(withDerivedGroupVars({
    ...base,
    ...overrides,
    'groups-enabled': true,
  }));
}

const CLASSIC_DEFAULTS = buildThemeVars(CLASSIC_CORE_DEFAULTS);
const DEFAULTS = buildThemeVars(CORE_DEFAULTS);

const SVG_GROUP_VAR_KEYS = Object.freeze([
  'group-alpha',
  'rail-fill',
  'rail-stroke',
  'fader-fill',
  'fader-stroke',
  'tempo-fill',
  'tempo-stroke',
  'xfader-fill',
  'xfader-stroke',
  'pad-fill',
  'pad-stroke',
  'padmode-fill',
  'padmode-stroke',
  'knob-fill',
  'knob-stroke',
  'knobnotch-fill',
  'knobnotch-stroke',
  'board-shell-fill',
  'board-shell-stroke',
  'label-fill',
  'label-stroke',
  'button-fill',
  'button-stroke',
  'transport-fill',
  'transport-stroke',
  'loop-fill',
  'loop-stroke',
  'deck-button-fill',
  'deck-button-stroke',
  'browser-fill',
  'browser-stroke',
  'load-fill',
  'load-stroke',
  'mixer-button-fill',
  'mixer-button-stroke',
  'fx-fill',
  'fx-stroke',
  'mergefx-fill',
  'mergefx-stroke',
  'deck-state-fill',
  'deck-state-stroke',
  'jog-ring-fill',
  'jog-ring-stroke',
  'jog-platter-fill',
  'jog-platter-stroke',
  'jog-touch-fill',
  'jog-touch-stroke',
  'jog-indicator-fill',
  'jog-indicator-stroke',
  'decor-fill',
  'decor-stroke',
  'icon-fill',
  'icon-stroke',
]);

function freezePreset(overrides = {}) {
  return buildThemeVars(CORE_DEFAULTS, overrides);
}

const PRESET_LIBRARY = Object.freeze({
  classic: CLASSIC_DEFAULTS,
  'instrument-dark': DEFAULTS,
  'neon-booth': freezePreset({
    bg: '#05070b',
    panel: 'rgba(10, 14, 23, 0.88)',
    ink: '#eff8ff',
    lit: '#4fe3ff',
    glowProfile: 'high',
    'rail-fill': 'transparent',
    'rail-stroke': 'rgba(113, 165, 255, 0.42)',
    'fader-fill': 'rgba(63, 18, 96, 0.84)',
    'fader-stroke': '#49d8ff',
    'tempo-fill': 'rgba(12, 53, 102, 0.84)',
    'tempo-stroke': '#58a5ff',
    'xfader-fill': 'rgba(88, 14, 66, 0.84)',
    'xfader-stroke': '#ff62b4',
    'pad-fill': 'rgba(60, 12, 116, 0.9)',
    'pad-stroke': '#9f69ff',
    'padmode-fill': 'rgba(8, 83, 94, 0.9)',
    'padmode-stroke': '#47f0ff',
    'knob-fill': 'rgba(32, 18, 80, 0.9)',
    'knob-stroke': '#7583ff',
    'knobnotch-fill': '#fff2a6',
    'knobnotch-stroke': '#fff2a6',
  }),
  'ocean-glow': freezePreset({
    bg: '#07121b',
    panel: 'rgba(9, 24, 36, 0.86)',
    ink: '#e6fbff',
    lit: '#6ee7ff',
    glowProfile: 'high',
    'rail-fill': 'transparent',
    'rail-stroke': 'rgba(88, 185, 220, 0.38)',
    'fader-fill': 'rgba(10, 51, 72, 0.84)',
    'fader-stroke': '#6bd7ff',
    'tempo-fill': 'rgba(14, 72, 98, 0.84)',
    'tempo-stroke': '#8ef3ff',
    'xfader-fill': 'rgba(9, 66, 90, 0.84)',
    'xfader-stroke': '#5ec4ff',
    'pad-fill': 'rgba(9, 82, 99, 0.88)',
    'pad-stroke': '#72f1d3',
    'padmode-fill': 'rgba(8, 62, 90, 0.9)',
    'padmode-stroke': '#7cc6ff',
    'knob-fill': 'rgba(11, 53, 79, 0.9)',
    'knob-stroke': '#7ee7ff',
    'knobnotch-fill': '#d6ffff',
    'knobnotch-stroke': '#d6ffff',
  }),
  'warm-studio': freezePreset({
    bg: '#120d09',
    panel: 'rgba(35, 24, 18, 0.84)',
    ink: '#f8ead5',
    lit: '#ffb66d',
    glowProfile: 'medium',
    'rail-fill': 'transparent',
    'rail-stroke': 'rgba(223, 161, 118, 0.34)',
    'fader-fill': 'rgba(61, 40, 24, 0.84)',
    'fader-stroke': '#ffbc84',
    'tempo-fill': 'rgba(73, 45, 26, 0.86)',
    'tempo-stroke': '#ffcf90',
    'xfader-fill': 'rgba(58, 36, 28, 0.88)',
    'xfader-stroke': '#ff9a68',
    'pad-fill': 'rgba(96, 46, 30, 0.88)',
    'pad-stroke': '#ffb05f',
    'padmode-fill': 'rgba(71, 43, 27, 0.9)',
    'padmode-stroke': '#f7d38c',
    'knob-fill': 'rgba(74, 50, 34, 0.92)',
    'knob-stroke': '#dcb07f',
    'knobnotch-fill': '#fff3dc',
    'knobnotch-stroke': '#fff3dc',
  }),
  'high-contrast': freezePreset({
    bg: '#000000',
    panel: 'rgba(12, 12, 12, 0.94)',
    ink: '#f8f8f8',
    lit: '#9ffcff',
    glowProfile: 'high',
    'group-alpha': '1',
    'rail-fill': 'transparent',
    'rail-stroke': '#f5f5f5',
    'fader-fill': 'rgba(18, 18, 18, 0.92)',
    'fader-stroke': '#ffffff',
    'tempo-fill': 'rgba(22, 22, 22, 0.92)',
    'tempo-stroke': '#9ffcff',
    'xfader-fill': 'rgba(16, 16, 16, 0.96)',
    'xfader-stroke': '#ffffff',
    'pad-fill': 'rgba(18, 18, 18, 0.92)',
    'pad-stroke': '#ffdf70',
    'padmode-fill': 'rgba(10, 10, 10, 0.96)',
    'padmode-stroke': '#ffffff',
    'knob-fill': 'rgba(22, 22, 22, 0.96)',
    'knob-stroke': '#ffffff',
    'knobnotch-fill': '#9ffcff',
    'knobnotch-stroke': '#9ffcff',
  }),
});

const SCENE_META = Object.freeze({
  'instrument-dark': Object.freeze({
    name: 'Instrument Dark',
    tag: 'Built-in',
    caption: 'Tuned host default',
  }),
  classic: Object.freeze({
    name: 'Classic',
    tag: 'Built-in',
    caption: 'Legacy blue skin',
  }),
  'neon-booth': Object.freeze({
    name: 'Neon Booth',
    tag: 'Built-in',
    caption: 'Bright club accent',
  }),
  'ocean-glow': Object.freeze({
    name: 'Ocean Glow',
    tag: 'Built-in',
    caption: 'Cool cyan wash',
  }),
  'warm-studio': Object.freeze({
    name: 'Warm Studio',
    tag: 'Built-in',
    caption: 'Amber coaching tone',
  }),
  'high-contrast': Object.freeze({
    name: 'High Contrast',
    tag: 'Built-in',
    caption: 'Sharp visibility mode',
  }),
});

const STUDIO_TABS = Object.freeze([
  Object.freeze({ key: 'colors', label: 'Colors' }),
  Object.freeze({ key: 'whites', label: 'Whites' }),
  Object.freeze({ key: 'themes', label: 'Themes' }),
  Object.freeze({ key: 'palette', label: 'Palette' }),
]);

const WHITE_PRESETS = Object.freeze([
  Object.freeze({
    key: 'warm-white',
    label: 'Warm White',
    note: 'Cozy amber tone',
    color: '#ffd5b4',
  }),
  Object.freeze({
    key: 'soft-white',
    label: 'Soft White',
    note: 'Gentle studio glow',
    color: '#ffe4d0',
  }),
  Object.freeze({
    key: 'neutral-white',
    label: 'Neutral White',
    note: 'Balanced and clean',
    color: '#f2f2ef',
  }),
  Object.freeze({
    key: 'cool-white',
    label: 'Cool White',
    note: 'Crisp board contrast',
    color: '#dfefff',
  }),
  Object.freeze({
    key: 'daylight',
    label: 'Daylight',
    note: 'Bright blue-white',
    color: '#cfe7ff',
  }),
]);

const FRIENDLY_GROUPS = Object.freeze([
  {
    key: 'board-shell',
    title: 'Board Body',
    fillKey: 'board-shell-fill',
    strokeKey: 'board-shell-stroke',
    fillAlpha: 0.95,
    detailControls: [{ label: 'Outline', fillKey: 'board-shell-fill', strokeKey: 'board-shell-stroke', type: 'stroke' }],
  },
  {
    key: 'jog',
    title: 'Jog Wheels',
    helper: 'Ring color drives the jog edge while keeping platter and touch separate.',
    fillKey: 'jog-ring-fill',
    strokeKey: 'jog-ring-stroke',
    fillAlpha: 0.9,
    mirrors: [{ fillKey: 'jog-indicator-fill', strokeKey: 'jog-indicator-stroke', fillAlpha: 1 }],
    detailControls: [
      { label: 'Touch Surface', fillKey: 'jog-touch-fill', strokeKey: 'jog-touch-stroke', type: 'pair', fillAlpha: 0.72 },
      { label: 'Indicator', fillKey: 'jog-indicator-fill', strokeKey: 'jog-indicator-stroke', type: 'pair', fillAlpha: 1 },
    ],
  },
  {
    key: 'jog-platter',
    title: 'Jog Platter',
    fillKey: 'jog-platter-fill',
    strokeKey: 'jog-platter-stroke',
    fillAlpha: 0.92,
    detailControls: [{ label: 'Outline', fillKey: 'jog-platter-fill', strokeKey: 'jog-platter-stroke', type: 'stroke' }],
  },
  {
    key: 'button',
    title: 'Buttons',
    fillKey: 'button-fill',
    strokeKey: 'button-stroke',
    fillAlpha: 0.9,
    detailControls: [{ label: 'Outline', fillKey: 'button-fill', strokeKey: 'button-stroke', type: 'stroke' }],
  },
  {
    key: 'transport',
    title: 'Transport Buttons',
    fillKey: 'transport-fill',
    strokeKey: 'transport-stroke',
    fillAlpha: 0.9,
    detailControls: [{ label: 'Outline', fillKey: 'transport-fill', strokeKey: 'transport-stroke', type: 'stroke' }],
  },
  {
    key: 'loop',
    title: 'Loop Buttons',
    fillKey: 'loop-fill',
    strokeKey: 'loop-stroke',
    fillAlpha: 0.9,
    detailControls: [{ label: 'Outline', fillKey: 'loop-fill', strokeKey: 'loop-stroke', type: 'stroke' }],
  },
  {
    key: 'browser-load',
    title: 'Browser / Load',
    fillKey: 'browser-fill',
    strokeKey: 'browser-stroke',
    fillAlpha: 0.9,
    mirrors: [{ fillKey: 'load-fill', strokeKey: 'load-stroke', fillAlpha: 0.9 }],
    detailControls: [
      { label: 'Browser', fillKey: 'browser-fill', strokeKey: 'browser-stroke', type: 'pair', fillAlpha: 0.9 },
      { label: 'Load Buttons', fillKey: 'load-fill', strokeKey: 'load-stroke', type: 'pair', fillAlpha: 0.9 },
    ],
  },
  {
    key: 'mixer-button',
    title: 'Mixer Buttons',
    fillKey: 'mixer-button-fill',
    strokeKey: 'mixer-button-stroke',
    fillAlpha: 0.9,
    detailControls: [{ label: 'Outline', fillKey: 'mixer-button-fill', strokeKey: 'mixer-button-stroke', type: 'stroke' }],
  },
  {
    key: 'knob',
    title: 'Mixer Knobs',
    fillKey: 'knob-fill',
    strokeKey: 'knob-stroke',
    fillAlpha: 0.82,
    detailControls: [
      {
        label: 'Outline',
        fillKey: 'knob-fill',
        strokeKey: 'knob-stroke',
        type: 'stroke',
      },
      {
        label: 'Knob Indicator',
        fillKey: 'knobnotch-fill',
        strokeKey: 'knobnotch-stroke',
        type: 'pair',
      },
    ],
  },
  {
    key: 'fader',
    title: 'Channel Faders',
    fillKey: 'fader-fill',
    strokeKey: 'fader-stroke',
    fillAlpha: 0.84,
    detailControls: [{ label: 'Outline', fillKey: 'fader-fill', strokeKey: 'fader-stroke', type: 'stroke' }],
  },
  {
    key: 'tempo',
    title: 'Tempo Faders',
    fillKey: 'tempo-fill',
    strokeKey: 'tempo-stroke',
    fillAlpha: 0.84,
    detailControls: [{ label: 'Outline', fillKey: 'tempo-fill', strokeKey: 'tempo-stroke', type: 'stroke' }],
  },
  {
    key: 'xfader',
    title: 'Crossfader',
    fillKey: 'xfader-fill',
    strokeKey: 'xfader-stroke',
    fillAlpha: 0.88,
    detailControls: [{ label: 'Outline', fillKey: 'xfader-fill', strokeKey: 'xfader-stroke', type: 'stroke' }],
  },
  {
    key: 'pad',
    title: 'Performance Pads',
    fillKey: 'pad-fill',
    strokeKey: 'pad-stroke',
    fillAlpha: 0.86,
    detailControls: [{ label: 'Outline', fillKey: 'pad-fill', strokeKey: 'pad-stroke', type: 'stroke' }],
  },
  {
    key: 'padmode',
    title: 'Pad Mode Buttons',
    fillKey: 'padmode-fill',
    strokeKey: 'padmode-stroke',
    fillAlpha: 0.9,
    detailControls: [{ label: 'Outline', fillKey: 'padmode-fill', strokeKey: 'padmode-stroke', type: 'stroke' }],
  },
  {
    key: 'rail',
    title: 'Rails / Outlines',
    fillKey: 'rail-fill',
    strokeKey: 'rail-stroke',
    mode: 'outline',
    detailControls: [{ label: 'Outline', fillKey: 'rail-fill', strokeKey: 'rail-stroke', type: 'stroke' }],
  },
  {
    key: 'fx-surface',
    title: 'Beat FX / Merge FX',
    fillKey: 'fx-fill',
    strokeKey: 'fx-stroke',
    fillAlpha: 0.9,
    mirrors: [{ fillKey: 'mergefx-fill', strokeKey: 'mergefx-stroke', fillAlpha: 0.92 }],
    detailControls: [
      { label: 'Beat FX', fillKey: 'fx-fill', strokeKey: 'fx-stroke', type: 'pair', fillAlpha: 0.9 },
      { label: 'Merge FX', fillKey: 'mergefx-fill', strokeKey: 'mergefx-stroke', type: 'pair', fillAlpha: 0.92 },
    ],
  },
  {
    key: 'label',
    title: 'Text Labels',
    fillKey: 'label-fill',
    strokeKey: 'label-stroke',
    mode: 'fill-only',
    fillAlpha: 1,
    mirrors: [{ fillKey: 'icon-fill', strokeKey: 'icon-stroke', mode: 'fill-only', fillAlpha: 1 }],
    detailControls: [
      { label: 'Live Text', fillKey: 'label-fill', strokeKey: 'label-stroke', type: 'pair', mode: 'fill-only', fillAlpha: 1 },
      { label: 'Vector Icons', fillKey: 'icon-fill', strokeKey: 'icon-stroke', type: 'pair', mode: 'fill-only', fillAlpha: 1 },
    ],
  },
  {
    key: 'decor',
    title: 'Decorative Lines',
    fillKey: 'decor-fill',
    strokeKey: 'decor-stroke',
    mode: 'fill-only',
    fillAlpha: 1,
    detailControls: [{ label: 'Decor', fillKey: 'decor-fill', strokeKey: 'decor-stroke', type: 'pair', mode: 'fill-only', fillAlpha: 1 }],
  },
]);

const RAW_GROUPS = Object.freeze([
  { key: 'board-shell', title: 'Board Body' },
  { key: 'rail', title: 'Rails / Outlines' },
  { key: 'fader', title: 'Channel Faders' },
  { key: 'tempo', title: 'Tempo Faders' },
  { key: 'xfader', title: 'Crossfader' },
  { key: 'pad', title: 'Performance Pads' },
  { key: 'padmode', title: 'Pad Mode Buttons' },
  { key: 'knob', title: 'Mixer Knobs' },
  { key: 'knobnotch', title: 'Knob Indicator' },
  { key: 'button', title: 'Buttons' },
  { key: 'transport', title: 'Transport Buttons' },
  { key: 'loop', title: 'Loop Buttons' },
  { key: 'deck-button', title: 'Deck Buttons' },
  { key: 'browser', title: 'Browser Buttons' },
  { key: 'load', title: 'Load Buttons' },
  { key: 'mixer-button', title: 'Mixer Buttons' },
  { key: 'fx', title: 'Beat FX' },
  { key: 'mergefx', title: 'Merge FX' },
  { key: 'deck-state', title: 'Deck State' },
  { key: 'jog-ring', title: 'Jog Ring' },
  { key: 'jog-platter', title: 'Jog Platter' },
  { key: 'jog-touch', title: 'Jog Touch' },
  { key: 'jog-indicator', title: 'Jog Indicator' },
  { key: 'label', title: 'Text Labels' },
  { key: 'decor', title: 'Decorative Lines' },
  { key: 'icon', title: 'Icons / Marks' },
]);

function $(selector) {
  return document?.querySelector?.(selector) || null;
}

function ce(tag, attrs = {}) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null) return;
    if (key === 'className') el.className = value;
    else if (key === 'textContent') el.textContent = value;
    else if (key === 'htmlFor') el.htmlFor = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') el.style.cssText = value;
    else el[key] = value;
  });
  return el;
}

function append(parent, ...children) {
  children.flat().filter(Boolean).forEach((child) => parent.appendChild(child));
  return parent;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHue(value) {
  const raw = Number.isFinite(value) ? value : parseFloat(value);
  if (!Number.isFinite(raw)) return 0;
  return ((raw % 360) + 360) % 360;
}

function normalizeHex(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '#000000';
  if (raw === 'transparent') return 'transparent';
  if (!raw.startsWith('#')) return normalizeHex(`#${raw}`);
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 7);
  return '#000000';
}

function parseCssColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return {
      r: parseInt(raw[1] + raw[1], 16),
      g: parseInt(raw[2] + raw[2], 16),
      b: parseInt(raw[3] + raw[3], 16),
      a: 1,
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(1, 3), 16),
      g: parseInt(raw.slice(3, 5), 16),
      b: parseInt(raw.slice(5, 7), 16),
      a: 1,
    };
  }
  if (/^rgba?\(/.test(raw)) {
    const parts = raw.match(/[\d.]+%?/g) || [];
    if (parts.length >= 3) {
      const [r, g, b, a = '1'] = parts;
      const toChannel = (part) => {
        if (String(part).endsWith('%')) return Math.round((parseFloat(part) / 100) * 255);
        return Math.max(0, Math.min(255, Math.round(parseFloat(part))));
      };
      return {
        r: toChannel(r),
        g: toChannel(g),
        b: toChannel(b),
        a: clamp01(parseFloat(a)),
      };
    }
  }
  return null;
}

function toHexChannel(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function rgbToHsl(r, g, b) {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = ((blue - red) / delta) + 2;
    else hue = ((red - green) / delta) + 4;
  }

  const lightness = (max + min) / 2;
  const saturation = delta
    ? delta / (1 - Math.abs((2 * lightness) - 1))
    : 0;

  return {
    h: normalizeHue(hue * 60),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToRgb(h, s, l) {
  const hue = normalizeHue(h);
  const saturation = clamp((Number.isFinite(s) ? s : parseFloat(s)) / 100, 0, 1);
  const lightness = clamp((Number.isFinite(l) ? l : parseFloat(l)) / 100, 0, 1);
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (sector >= 0 && sector < 1) [red, green, blue] = [chroma, x, 0];
  else if (sector < 2) [red, green, blue] = [x, chroma, 0];
  else if (sector < 3) [red, green, blue] = [0, chroma, x];
  else if (sector < 4) [red, green, blue] = [0, x, chroma];
  else if (sector < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const match = lightness - (chroma / 2);
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function colorToHsl(value, fallback = '#9cd8ff') {
  const parsed = parseCssColor(value) || parseCssColor(fallback) || { r: 156, g: 216, b: 255 };
  return rgbToHsl(parsed.r, parsed.g, parsed.b);
}

function colorToHexPreview(value, fallback = '#000000') {
  const parsed = parseCssColor(value);
  if (!parsed) return normalizeHex(fallback);
  return `#${toHexChannel(parsed.r)}${toHexChannel(parsed.g)}${toHexChannel(parsed.b)}`;
}

function withAlpha(hexColor, alpha = 1) {
  const parsed = parseCssColor(hexColor);
  if (!parsed) return hexColor;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamp01(alpha)})`;
}

function normalizeThemeState(vars = {}) {
  return { ...DEFAULTS, ...vars, 'groups-enabled': vars['groups-enabled'] !== false && vars['groups-enabled'] !== 'false' };
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    return normalizeThemeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

function saveToLocal(vars) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(normalizeThemeState(vars)));
  } catch {}
}

function hasStoredTheme() {
  try {
    return !!localStorage.getItem(LS_KEY);
  } catch {
    return false;
  }
}

function loadCustomScenes() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SCENE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((scene) => ({
        id: String(scene?.id || `scene-${Date.now()}`),
        name: String(scene?.name || 'Saved Scene').trim() || 'Saved Scene',
        vars: normalizeThemeState(scene?.vars || {}),
        createdAt: Number(scene?.createdAt || Date.now()),
      }))
      .filter((scene) => scene.id);
  } catch {
    return [];
  }
}

function saveCustomScenes(scenes = []) {
  try {
    localStorage.setItem(LS_SCENE_KEY, JSON.stringify(scenes));
  } catch {}
}

function loadRecentColors() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((value) => normalizeHex(value)).filter((value) => value !== 'transparent');
  } catch {
    return [];
  }
}

function saveRecentColors(colors = []) {
  try {
    localStorage.setItem(LS_RECENT_KEY, JSON.stringify(colors));
  } catch {}
}

function loadSavedPalette() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PALETTE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((value) => normalizeHex(value)).filter((value) => value !== 'transparent');
  } catch {
    return [];
  }
}

function saveSavedPalette(colors = []) {
  try {
    localStorage.setItem(LS_PALETTE_KEY, JSON.stringify(colors));
  } catch {}
}

function rememberRecentColor(color) {
  const normalized = normalizeHex(color);
  if (normalized === 'transparent') return;
  const next = [normalized, ...loadRecentColors().filter((entry) => entry !== normalized)].slice(0, 10);
  saveRecentColors(next);
}

function rememberPaletteColor(color) {
  const normalized = normalizeHex(color);
  if (normalized === 'transparent') return;
  const next = [normalized, ...loadSavedPalette().filter((entry) => entry !== normalized)].slice(0, 18);
  saveSavedPalette(next);
}

function sectionTitle(text, copy = '') {
  const wrap = ce('div', { className: 'theme-section-head' });
  append(
    wrap,
    ce('div', { className: 'theme-section-title', textContent: text }),
    copy ? ce('div', { className: 'theme-section-copy', textContent: copy }) : null,
  );
  return wrap;
}

function safeAlert(message) {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
}

function createScenePreview(vars = {}) {
  const bg = vars.bg || DEFAULTS.bg;
  const panel = vars.panel || DEFAULTS.panel;
  const glow = vars.lit || DEFAULTS.lit;
  const accent = vars['pad-stroke'] || vars['knob-stroke'] || glow;
  return `linear-gradient(135deg, ${bg} 0%, ${panel} 48%, ${glow} 78%, ${accent} 100%)`;
}

function applyGlobalVars(vars) {
  const rootStyle = document?.documentElement?.style;
  if (!rootStyle?.setProperty) return;
  rootStyle.setProperty('--bg', vars.bg);
  rootStyle.setProperty('--panel', vars.panel);
  rootStyle.setProperty('--ink', vars.ink);
  rootStyle.setProperty('--lit', vars.lit);
  ensureGlowStyle(vars.glowProfile);
}

function ensureGlowStyle(profile = 'medium') {
  const map = {
    light: { r1: '3px', r2: '7px' },
    medium: { r1: '4px', r2: '10px' },
    high: { r1: '6px', r2: '16px' },
  };
  const glow = map[profile] || map.medium;

  let tag = document.getElementById('theme-glow-style');
  if (!tag) {
    tag = ce('style', { id: 'theme-glow-style' });
    document.head?.appendChild(tag);
  }
  tag.textContent = `.lit { filter: drop-shadow(0 0 ${glow.r1} var(--lit)) drop-shadow(0 0 ${glow.r2} var(--lit)); }`;
}

function applyGroupVarsToSVG(svg, vars) {
  if (!svg) return;
  setThemeVars(svg, Object.fromEntries(
    SVG_GROUP_VAR_KEYS.map((key) => [
      key,
      key === 'group-alpha'
        ? String(vars[key] ?? DEFAULTS[key])
        : (vars[key] ?? DEFAULTS[key]),
    ]),
  ));
}

function prepareSvg(svg) {
  if (!svg) return;
  try {
    applyGroups(svg);
  } catch {}
  toggleThemed(svg, state?.['groups-enabled'] !== false);
}

function resolveSvgRoot(nextSvgRoot = null) {
  if (nextSvgRoot) svgRootRef = nextSvgRoot;
  const activeSvg = $('#boardHost svg');
  if (activeSvg) {
    svgRootRef = activeSvg;
    return svgRootRef;
  }
  if (svgRootRef && svgRootRef.isConnected !== false) return svgRootRef;
  svgRootRef = null;
  return null;
}

function clearPendingSvgRetry() {
  if (svgRetryHandle != null) clearTimeout(svgRetryHandle);
  svgRetryHandle = null;
}

function scheduleSvgRetry() {
  if (svgRetryHandle != null || svgRetryCount >= SVG_RETRY_LIMIT) return;
  svgRetryHandle = setTimeout(() => {
    svgRetryHandle = null;
    svgRetryCount += 1;
    refreshThemeSurface();
  }, SVG_RETRY_MS);
}

function applyAll() {
  if (!state) state = loadFromLocal();
  applyGlobalVars(state);
  const svg = resolveSvgRoot();
  if (!svg) {
    scheduleSvgRetry();
    return;
  }
  clearPendingSvgRetry();
  svgRetryCount = 0;
  prepareSvg(svg);
  applyGroupVarsToSVG(svg, state);
}

function refreshAndMaybeRebuild({ rebuild = false } = {}) {
  applyAll();
  if (rebuild && panelRef) rebuildUI(panelRef);
}

function getSceneCollection() {
  const builtIns = Object.keys(PRESET_LIBRARY).map((id) => ({
    id,
    kind: 'builtin',
    name: SCENE_META[id]?.name || id,
    tag: SCENE_META[id]?.tag || 'Built-in',
    caption: SCENE_META[id]?.caption || '',
    vars: PRESET_LIBRARY[id],
  }));
  const customScenes = loadCustomScenes().map((scene) => ({
    ...scene,
    kind: 'custom',
    tag: 'Saved',
    caption: 'Your snapshot',
  }));
  return [...builtIns, ...customScenes];
}

function themeMatches(vars = {}) {
  const current = normalizeThemeState(state || {});
  const candidate = normalizeThemeState(vars);
  return Object.keys(DEFAULTS).every((key) => key === 'groups-enabled' || current[key] === candidate[key]);
}

function applySceneVars(vars = {}, { save = true, rebuild = true } = {}) {
  state = normalizeThemeState({ ...vars, 'groups-enabled': true });
  openSceneOptionsId = null;
  applyAll();
  if (save) saveToLocal(state);
  if (rebuild && panelRef) rebuildUI(panelRef);
  return true;
}

function activeFriendlyGroup() {
  return FRIENDLY_GROUPS.find((group) => group.key === selectedStudioGroupKey && !group.disabled)
    || FRIENDLY_GROUPS.find((group) => !group.disabled)
    || null;
}

function getColorTargets(entry) {
  if (!entry) return [];
  const primary = entry.fillKey && entry.strokeKey ? [{
    fillKey: entry.fillKey,
    strokeKey: entry.strokeKey,
    fillAlpha: entry.fillAlpha,
    mode: entry.mode,
  }] : [];
  return [...primary, ...(Array.isArray(entry.mirrors) ? entry.mirrors : [])];
}

function applyColorToTarget(target, hex) {
  if (!target?.fillKey || !target?.strokeKey) return;
  const fillAlpha = target.fillAlpha ?? 0.84;

  if (target.mode === 'outline') {
    state[target.fillKey] = 'transparent';
    state[target.strokeKey] = hex;
    return;
  }

  if (target.mode === 'fill-only') {
    state[target.fillKey] = fillAlpha >= 1 ? hex : withAlpha(hex, fillAlpha);
    state[target.strokeKey] = 'transparent';
    return;
  }

  state[target.fillKey] = fillAlpha >= 1 ? hex : withAlpha(hex, fillAlpha);
  state[target.strokeKey] = hex;
}

function getFriendlyPreviewColor(group) {
  if (!group) return DEFAULTS.lit;
  const [target] = getColorTargets(group);
  if (!target) return DEFAULTS.lit;
  const strokeValue = state?.[target.strokeKey];
  const fillValue = state?.[target.fillKey];
  return colorToHexPreview(strokeValue || fillValue || DEFAULTS.lit, DEFAULTS.lit);
}

function syncStudioGroupPreview(group, color) {
  if (!panelRef || !group) return;
  const hex = normalizeHex(color);
  panelRef.querySelectorAll?.(`[data-group-swatch-for="${group.key}"]`).forEach((node) => {
    node.style.background = hex;
  });
  const colorLabel = panelRef.querySelector?.('[data-theme-current-color="true"]');
  if (colorLabel) colorLabel.textContent = hex.toUpperCase();
}

function finalizeStudioColor(color, { rebuild = false } = {}) {
  rememberRecentColor(color);
  if (rebuild && panelRef) rebuildUI(panelRef);
}

function setFriendlyGroupColor(group, color) {
  if (!group || group.disabled) return false;
  const hex = normalizeHex(color);
  if (hex === 'transparent') return false;

  state['groups-enabled'] = true;
  getColorTargets(group).forEach((target) => applyColorToTarget(target, hex));

  applyAll();
  saveToLocal(state);
  syncStudioGroupPreview(group, hex);
  return true;
}

function setFriendlyDetailColor(group, control, color) {
  if (!group || !control || group.disabled) return false;
  const hex = normalizeHex(color);
  if (hex === 'transparent') return false;

  state['groups-enabled'] = true;
  if (control.type === 'stroke') {
    state[control.strokeKey] = hex;
  } else {
    getColorTargets(control).forEach((target) => applyColorToTarget(target, hex));
  }

  applyAll();
  saveToLocal(state);
  syncStudioGroupPreview(group, hex);
  return true;
}

function createColorButton(labelText, initialColor, onInput, onChange) {
  const label = ce('label', { className: 'theme-color-button' });
  const text = ce('span', { textContent: labelText });
  const input = ce('input', { type: 'color', value: colorToHexPreview(initialColor, DEFAULTS.lit) });
  input.addEventListener('input', (event) => onInput?.(event.target.value));
  input.addEventListener('change', (event) => onChange?.(event.target.value));
  append(label, text, input);
  return { label, input };
}

function createColorChip(color, group, { className = 'theme-palette-chip', title = '' } = {}) {
  const chip = ce('button', {
    type: 'button',
    className,
    title: title || (group ? `Apply ${color} to ${group.title}` : 'Pick a board group first'),
  });
  chip.style.background = color;
  chip.disabled = !group;
  chip.addEventListener('click', () => {
    if (!group) return;
    setFriendlyGroupColor(group, color);
    finalizeStudioColor(color, { rebuild: true });
  });
  return chip;
}

function renameCustomScene(scene) {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
  const nextName = window.prompt('Rename saved theme scene', scene.name);
  if (nextName == null) return;
  const updated = loadCustomScenes().map((entry) => (
    entry.id === scene.id ? { ...entry, name: nextName.trim() || scene.name } : entry
  ));
  saveCustomScenes(updated);
  openSceneOptionsId = null;
  rebuildUI(panelRef);
}

function deleteCustomScene(scene) {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(`Delete "${scene.name}"?`)) return;
  saveCustomScenes(loadCustomScenes().filter((entry) => entry.id !== scene.id));
  openSceneOptionsId = null;
  rebuildUI(panelRef);
}

function buildSceneCard(scene) {
  const card = ce('article', {
    className: `theme-scene-card${themeMatches(scene.vars) ? ' is-active' : ''}`,
  });
  card.dataset.sceneId = scene.id;
  card.style.background = createScenePreview(scene.vars);

  const primaryButton = ce('button', {
    type: 'button',
    className: 'theme-scene-card-main',
  });
  primaryButton.addEventListener('click', () => {
    if (scene.kind === 'builtin') applyPreset(scene.id);
    else applySceneVars(scene.vars);
  });

  const header = ce('div', { className: 'theme-scene-card-head' });
  append(header, ce('span', { className: 'theme-scene-tag', textContent: scene.tag }));

  if (scene.kind === 'custom') {
    const optionsBtn = ce('button', {
      type: 'button',
      className: 'theme-scene-options-toggle',
      textContent: '•••',
      title: `Theme options for ${scene.name}`,
    });
    optionsBtn.addEventListener('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      openSceneOptionsId = openSceneOptionsId === scene.id ? null : scene.id;
      rebuildUI(panelRef);
    });
    header.appendChild(optionsBtn);
  }

  primaryButton.appendChild(header);
  primaryButton.appendChild(ce('strong', { className: 'theme-scene-name', textContent: scene.name }));
  primaryButton.appendChild(ce('span', { className: 'theme-scene-copy', textContent: scene.caption || 'One tap applies the full look.' }));
  card.appendChild(primaryButton);

  if (scene.kind === 'custom' && openSceneOptionsId === scene.id) {
    const options = ce('div', { className: 'theme-scene-options-menu' });
    const renameBtn = ce('button', { type: 'button', textContent: 'Rename' });
    renameBtn.addEventListener('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      renameCustomScene(scene);
    });
    const deleteBtn = ce('button', { type: 'button', textContent: 'Delete' });
    deleteBtn.addEventListener('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      deleteCustomScene(scene);
    });
    append(options, renameBtn, deleteBtn);
    card.appendChild(options);
  }

  return card;
}

function buildSceneSaveRow() {
  const wrap = ce('div', { className: 'theme-save-scene' });
  const info = ce('div', { className: 'theme-save-copy' });
  append(
    info,
    ce('strong', { textContent: 'Save as Theme Scene' }),
    ce('span', { textContent: 'Save the current page and controller colors as a reusable one-tap look.' }),
  );

  const input = ce('input', {
    type: 'text',
    className: 'theme-scene-name-input',
    placeholder: 'Name this scene',
  });
  const button = ce('button', { type: 'button', textContent: 'Save Scene' });

  const saveScene = () => {
    const name = String(input.value || '').trim() || `Scene ${loadCustomScenes().length + 1}`;
    const scenes = loadCustomScenes();
    scenes.unshift({
      id: `scene-${Date.now()}`,
      name,
      vars: normalizeThemeState(state),
      createdAt: Date.now(),
    });
    saveCustomScenes(scenes);
    input.value = '';
    rebuildUI(panelRef);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveScene();
  });
  button.addEventListener('click', saveScene);

  const controls = ce('div', { className: 'theme-save-actions' });
  append(controls, input, button);
  append(wrap, info, controls);
  return wrap;
}

function buildSelectedGroupCard(group) {
  const color = getFriendlyPreviewColor(group);
  const card = ce('div', { className: 'theme-selected-group' });
  const head = ce('div', { className: 'theme-selected-group-head' });
  const copy = ce('div', { className: 'theme-selected-group-copy' });
  const tone = ce('div', { className: 'theme-selected-group-tone' });
  const swatch = ce('span', {
    className: 'theme-selected-group-swatch',
    dataset: { groupSwatchFor: group.key },
  });
  const colorLabel = ce('span', {
    className: 'theme-selected-group-value',
    textContent: color.toUpperCase(),
    dataset: { themeCurrentColor: 'true' },
  });

  swatch.style.background = color;
  append(
    copy,
    ce('span', { className: 'theme-selected-group-kicker', textContent: 'Editing Group' }),
    ce('strong', { textContent: group.title }),
    ce('span', { textContent: group.helper || 'Color changes preview live on the board as you adjust them.' }),
  );
  append(tone, swatch, colorLabel);
  append(head, copy, tone);
  card.appendChild(head);
  return card;
}

function buildGroupSelector(activeGroup) {
  const wrap = ce('div', { className: 'theme-group-selector' });
  wrap.appendChild(sectionTitle('Controller Groups', 'Pick one semantic board family, then tune only that group.'));

  const row = ce('div', { className: 'theme-group-selector-grid' });
  FRIENDLY_GROUPS.forEach((group) => {
    const button = ce('button', {
      type: 'button',
      className: `theme-group-choice${activeGroup?.key === group.key ? ' is-selected' : ''}${group.disabled ? ' is-disabled' : ''}`,
    });
    button.dataset.groupKey = group.key;
    button.disabled = !!group.disabled;

    const swatch = ce('span', {
      className: 'theme-group-choice-swatch',
      dataset: { groupSwatchFor: group.key },
    });
    swatch.style.background = getFriendlyPreviewColor(group);

    append(
      button,
      swatch,
      ce('span', { className: 'theme-group-choice-label', textContent: group.title }),
    );

    if (!group.disabled) {
      button.addEventListener('click', () => {
        selectedStudioGroupKey = group.key;
        rebuildUI(panelRef);
      });
    }

    row.appendChild(button);
  });

  wrap.appendChild(row);
  return wrap;
}

function buildStudioTabs() {
  const row = ce('div', { className: 'theme-color-tabs' });
  row.setAttribute('role', 'tablist');
  STUDIO_TABS.forEach((tab) => {
    const button = ce('button', {
      type: 'button',
      className: `theme-color-tab${selectedStudioTab === tab.key ? ' is-selected' : ''}`,
      textContent: tab.label,
    });
    button.dataset.tab = tab.key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', selectedStudioTab === tab.key ? 'true' : 'false');
    button.addEventListener('click', () => {
      selectedStudioTab = tab.key;
      rebuildUI(panelRef);
    });
    row.appendChild(button);
  });
  return row;
}

function buildToneSliderRow({
  label,
  min,
  max,
  step,
  value,
  formatter,
  onInput,
  onChange,
}) {
  const row = ce('label', { className: 'theme-tone-row' });
  const head = ce('div', { className: 'theme-tone-head' });
  const title = ce('span', { className: 'theme-tone-label', textContent: label });
  const valueEl = ce('span', { className: 'theme-tone-value', textContent: formatter(value) });
  const input = ce('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    className: 'theme-tone-slider',
  });

  input.addEventListener('input', () => {
    const next = parseFloat(input.value);
    valueEl.textContent = formatter(next);
    onInput?.(next, input);
  });

  input.addEventListener('change', () => {
    const next = parseFloat(input.value);
    valueEl.textContent = formatter(next);
    onChange?.(next, input);
  });

  append(head, title, valueEl);
  append(row, head, input);
  return { row, input, valueEl };
}

function renderColorWheelTab(group) {
  const panel = ce('section', { className: 'theme-tab-panel' });
  const card = ce('div', { className: 'theme-wheel-card' });
  const wheelCopy = ce('div', { className: 'theme-wheel-copy' });
  append(
    wheelCopy,
    ce('strong', { textContent: 'Visual color wheel' }),
    ce('span', { textContent: `${group.title} updates live on the board while you drag.` }),
  );

  const wheelWrap = ce('div', {
    className: 'theme-wheel-wrap',
    tabIndex: 0,
  });
  wheelWrap.setAttribute('role', 'slider');
  wheelWrap.setAttribute('aria-label', `Hue selector for ${group.title}`);
  wheelWrap.setAttribute('aria-valuemin', '0');
  wheelWrap.setAttribute('aria-valuemax', '359');
  const wheel = ce('div', { className: 'theme-wheel' });

  const handleTrack = ce('div', { className: 'theme-wheel-handle-track' });
  const handle = ce('span', { className: 'theme-wheel-handle' });
  handleTrack.appendChild(handle);

  const center = ce('div', { className: 'theme-wheel-center' });
  const centerSwatch = ce('span', { className: 'theme-wheel-center-swatch' });
  const centerTitle = ce('strong', { textContent: group.title });
  const centerValue = ce('span', { className: 'theme-wheel-center-value' });
  append(center, centerSwatch, centerTitle, centerValue);
  append(wheelWrap, wheel, handleTrack, center);

  const picker = colorToHsl(getFriendlyPreviewColor(group), DEFAULTS.lit);
  const formatDegrees = (value) => `${Math.round(value)}°`;
  const formatPercent = (value) => `${Math.round(value)}%`;

  const applyPickerColor = ({ commit = false } = {}) => {
    const nextColor = hslToHex(picker.h, picker.s, picker.l);
    setFriendlyGroupColor(group, nextColor);
    syncPickerUi(nextColor);
    if (commit) finalizeStudioColor(nextColor);
    return nextColor;
  };

  const hueSlider = buildToneSliderRow({
    label: 'Hue',
    min: 0,
    max: 359,
    step: 1,
    value: picker.h,
    formatter: formatDegrees,
    onInput: (next) => {
      picker.h = normalizeHue(next);
      applyPickerColor();
    },
    onChange: (next) => {
      picker.h = normalizeHue(next);
      applyPickerColor({ commit: true });
    },
  });
  const saturationSlider = buildToneSliderRow({
    label: 'Saturation',
    min: 0,
    max: 100,
    step: 1,
    value: picker.s,
    formatter: formatPercent,
    onInput: (next) => {
      picker.s = clamp(next, 0, 100);
      applyPickerColor();
    },
    onChange: (next) => {
      picker.s = clamp(next, 0, 100);
      applyPickerColor({ commit: true });
    },
  });
  const lightnessSlider = buildToneSliderRow({
    label: 'Brightness',
    min: 8,
    max: 92,
    step: 1,
    value: picker.l,
    formatter: formatPercent,
    onInput: (next) => {
      picker.l = clamp(next, 8, 92);
      applyPickerColor();
    },
    onChange: (next) => {
      picker.l = clamp(next, 8, 92);
      applyPickerColor({ commit: true });
    },
  });

  hueSlider.input.style.background = 'linear-gradient(90deg, #ff6b6b 0%, #ffb36b 16%, #ffe56b 32%, #8ff56b 48%, #54f1c5 64%, #5ac8ff 80%, #7f76ff 90%, #ff68d3 100%)';

  function getWheelMetrics() {
    const rect = wheelWrap.getBoundingClientRect?.();
    const width = rect?.width || 100;
    const height = rect?.height || 100;
    return {
      width,
      height,
      left: rect?.left || 0,
      top: rect?.top || 0,
      centerX: width / 2,
      centerY: height / 2,
      radius: Math.min(width, height) * 0.4,
      usePixels: !!(rect?.width && rect?.height),
    };
  }

  function syncWheelHandle() {
    const metrics = getWheelMetrics();
    const angle = ((picker.h - 90) * Math.PI) / 180;
    const x = metrics.centerX + (Math.cos(angle) * metrics.radius);
    const y = metrics.centerY + (Math.sin(angle) * metrics.radius);
    const roundedX = Math.round(x * 1000) / 1000;
    const roundedY = Math.round(y * 1000) / 1000;

    if (metrics.usePixels) {
      wheelWrap.style.setProperty('--theme-wheel-x', `${roundedX}px`);
      wheelWrap.style.setProperty('--theme-wheel-y', `${roundedY}px`);
      return;
    }

    wheelWrap.style.setProperty('--theme-wheel-x', `${(roundedX / metrics.width) * 100}%`);
    wheelWrap.style.setProperty('--theme-wheel-y', `${(roundedY / metrics.height) * 100}%`);
  }

  function syncPickerUi(nextColor = hslToHex(picker.h, picker.s, picker.l)) {
    syncWheelHandle();
    centerSwatch.style.background = nextColor;
    centerValue.textContent = nextColor.toUpperCase();
    wheelWrap.setAttribute('aria-valuenow', String(Math.round(picker.h)));
    wheelWrap.setAttribute('aria-valuetext', `${Math.round(picker.h)} degrees`);

    hueSlider.input.value = String(Math.round(picker.h));
    saturationSlider.input.value = String(Math.round(picker.s));
    lightnessSlider.input.value = String(Math.round(picker.l));
    hueSlider.valueEl.textContent = formatDegrees(picker.h);
    saturationSlider.valueEl.textContent = formatPercent(picker.s);
    lightnessSlider.valueEl.textContent = formatPercent(picker.l);

    saturationSlider.input.style.background = `linear-gradient(90deg, ${hslToHex(picker.h, 0, picker.l)} 0%, ${hslToHex(picker.h, 100, picker.l)} 100%)`;
    lightnessSlider.input.style.background = `linear-gradient(90deg, ${hslToHex(picker.h, picker.s, 10)} 0%, ${hslToHex(picker.h, picker.s, 50)} 50%, ${hslToHex(picker.h, picker.s, 90)} 100%)`;
  }

  function updateHueFromPointer(event) {
    const metrics = getWheelMetrics();
    const centerX = metrics.left + metrics.centerX;
    const centerY = metrics.top + metrics.centerY;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    picker.h = normalizeHue((Math.atan2(dy, dx) * 180 / Math.PI) + 90);
    applyPickerColor();
  }

  let draggingPointerId = null;
  wheelWrap.addEventListener('pointerdown', (event) => {
    draggingPointerId = event.pointerId ?? null;
    wheelWrap.setPointerCapture?.(event.pointerId);
    updateHueFromPointer(event);
    event.preventDefault?.();
  });
  wheelWrap.addEventListener('pointermove', (event) => {
    if (draggingPointerId == null) return;
    if (event.pointerId != null && draggingPointerId !== event.pointerId) return;
    updateHueFromPointer(event);
  });
  const finishDragging = (event, { commit = true } = {}) => {
    if (draggingPointerId == null) return;
    if (event?.pointerId != null && draggingPointerId !== event.pointerId) return;
    if (event) updateHueFromPointer(event);
    const pointerId = draggingPointerId;
    draggingPointerId = null;
    if (commit) finalizeStudioColor(hslToHex(picker.h, picker.s, picker.l));
    wheelWrap.releasePointerCapture?.(pointerId);
  };
  wheelWrap.addEventListener('pointerup', (event) => finishDragging(event, { commit: true }));
  wheelWrap.addEventListener('pointercancel', (event) => finishDragging(event, { commit: false }));
  wheelWrap.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 12 : 4;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      picker.h = normalizeHue(picker.h + step);
      applyPickerColor();
      event.preventDefault?.();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      picker.h = normalizeHue(picker.h - step);
      applyPickerColor();
      event.preventDefault?.();
    } else if (event.key === 'Home') {
      picker.h = 0;
      applyPickerColor();
      event.preventDefault?.();
    } else if (event.key === 'End') {
      picker.h = 359;
      applyPickerColor();
      event.preventDefault?.();
    } else if (event.key === 'Enter' || event.key === ' ') {
      finalizeStudioColor(hslToHex(picker.h, picker.s, picker.l));
      event.preventDefault?.();
    }
  });

  syncPickerUi();

  append(
    card,
    wheelCopy,
    wheelWrap,
    hueSlider.row,
    saturationSlider.row,
    lightnessSlider.row,
  );
  panel.appendChild(card);
  return panel;
}

function renderWhitesTab(group) {
  const panel = ce('section', { className: 'theme-tab-panel' });
  panel.appendChild(sectionTitle('White Tones', 'Quick warm-to-daylight neutrals for fast board cleanup and teaching views.'));

  const currentColor = getFriendlyPreviewColor(group);
  const grid = ce('div', { className: 'theme-whites-grid' });
  WHITE_PRESETS.forEach((preset) => {
    const button = ce('button', {
      type: 'button',
      className: `theme-white-chip${normalizeHex(currentColor) === preset.color ? ' is-selected' : ''}`,
    });
    const swatch = ce('span', { className: 'theme-white-chip-swatch' });
    swatch.style.background = preset.color;
    const copy = ce('div', { className: 'theme-white-chip-copy' });
    append(
      copy,
      ce('strong', { textContent: preset.label }),
      ce('span', { textContent: preset.note }),
    );
    append(button, swatch, copy);
    button.addEventListener('click', () => {
      setFriendlyGroupColor(group, preset.color);
      finalizeStudioColor(preset.color, { rebuild: true });
    });
    grid.appendChild(button);
  });
  panel.appendChild(grid);
  return panel;
}

function renderThemesTab() {
  const panel = ce('section', { className: 'theme-tab-panel' });
  panel.appendChild(sectionTitle('Theme Scenes', 'Built-in looks and saved scenes still restyle the page and board together.'));

  const sceneGrid = ce('div', { className: 'theme-scene-grid' });
  getSceneCollection().forEach((scene) => sceneGrid.appendChild(buildSceneCard(scene)));
  panel.appendChild(sceneGrid);
  panel.appendChild(buildSceneSaveRow());
  return panel;
}

function buildPaletteSection(title, copyText, colors, group, emptyText) {
  const section = ce('div', { className: 'theme-palette-section' });
  const copy = ce('div', { className: 'theme-palette-copy' });
  append(
    copy,
    ce('strong', { textContent: title }),
    ce('span', { textContent: copyText }),
  );

  const grid = ce('div', { className: 'theme-palette-grid' });
  colors.forEach((color) => {
    grid.appendChild(createColorChip(color, group, {
      className: 'theme-palette-chip',
    }));
  });
  if (!grid.children.length) {
    grid.appendChild(ce('span', { className: 'theme-no-recent', textContent: emptyText }));
  }

  append(section, copy, grid);
  return section;
}

function renderPaletteTab(group) {
  const panel = ce('section', { className: 'theme-tab-panel' });
  const currentColor = getFriendlyPreviewColor(group);
  const savedPalette = loadSavedPalette();
  const saveCard = ce('div', { className: 'theme-palette-actions' });
  const saveCopy = ce('div', { className: 'theme-palette-copy' });
  const saveButton = ce('button', {
    type: 'button',
    textContent: savedPalette.includes(currentColor) ? 'Saved to Palette' : 'Save Current Color',
  });
  saveButton.disabled = savedPalette.includes(currentColor);
  saveButton.addEventListener('click', () => {
    rememberPaletteColor(currentColor);
    finalizeStudioColor(currentColor, { rebuild: true });
  });

  append(
    saveCopy,
    ce('strong', { textContent: 'Saved Palette' }),
    ce('span', { textContent: `Store favorite colors for ${group.title} and reuse them in one tap.` }),
  );
  append(
    saveCard,
    saveCopy,
    ce('span', { className: 'theme-selected-group-swatch', style: `background:${currentColor};` }),
    saveButton,
  );

  panel.appendChild(saveCard);
  panel.appendChild(buildPaletteSection(
    'Palette',
    'Your saved theme colors stay pinned here across sessions.',
    savedPalette,
    group,
    'Save the current group color and it will appear here.',
  ));
  panel.appendChild(buildPaletteSection(
    'Recent Colors',
    `Recent picks for ${group.title} stay close by while you experiment.`,
    loadRecentColors(),
    group,
    'Your recent group colors will show up here.',
  ));
  return panel;
}

function renderStudioTabPanel(group) {
  if (selectedStudioTab === 'whites') return renderWhitesTab(group);
  if (selectedStudioTab === 'themes') return renderThemesTab();
  if (selectedStudioTab === 'palette') return renderPaletteTab(group);
  return renderColorWheelTab(group);
}

function createThemeColorStudio() {
  const group = activeFriendlyGroup();
  const studio = ce('section', { className: 'theme-color-studio' });
  studio.appendChild(sectionTitle(
    'Theme Color Studio',
    'Friendly visual picking stays front-and-center here. Raw variables and native fallback inputs stay in Advanced.',
  ));
  studio.appendChild(buildSelectedGroupCard(group));
  studio.appendChild(buildGroupSelector(group));
  studio.appendChild(buildStudioTabs());
  studio.appendChild(renderStudioTabPanel(group));
  return studio;
}

function buildGroupCard(group) {
  const article = ce('article', {
    className: `theme-group-card${selectedStudioGroupKey === group.key ? ' is-selected' : ''}${group.disabled ? ' is-disabled' : ''}`,
  });
  article.dataset.groupKey = group.key;

  const header = ce('div', { className: 'theme-group-head' });
  const copy = ce('div', { className: 'theme-group-copy' });
  append(
    copy,
    ce('strong', { textContent: group.title }),
    ce('span', { textContent: group.helper || 'Pick a color and the board updates right away.' }),
  );
  const swatch = ce('span', { className: 'theme-current-swatch' });
  swatch.style.background = getFriendlyPreviewColor(group);
  append(header, copy, swatch);
  article.appendChild(header);

  if (group.disabled) {
    article.appendChild(ce('div', { className: 'theme-group-disabled-note', textContent: group.helper }));
    return article;
  }

  article.addEventListener('click', () => {
    selectedStudioGroupKey = group.key;
    rebuildUI(panelRef);
  });

  const actions = ce('div', { className: 'theme-group-actions' });
  const mainPicker = createColorButton(
    'Color',
    state[group.strokeKey] || state[group.fillKey],
    (value) => {
      selectedStudioGroupKey = group.key;
      setFriendlyGroupColor(group, value);
      swatch.style.background = value;
    },
    (value) => {
      selectedStudioGroupKey = group.key;
      setFriendlyGroupColor(group, value);
      rememberRecentColor(value);
      rebuildUI(panelRef);
    },
  );
  append(actions, mainPicker.label);
  article.appendChild(actions);

  if (Array.isArray(group.detailControls) && group.detailControls.length) {
    const details = ce('details', { className: 'theme-group-details' });
    const summary = ce('summary', { textContent: 'Details' });
    details.appendChild(summary);

    group.detailControls.forEach((control) => {
      const detailRow = ce('div', { className: 'theme-group-detail-row' });
      const picker = createColorButton(
        control.label,
        state[control.strokeKey] || state[control.fillKey],
        (value) => setFriendlyDetailColor(group, control, value),
        (value) => {
          setFriendlyDetailColor(group, control, value);
          rememberRecentColor(value);
          rebuildUI(panelRef);
        },
      );
      detailRow.appendChild(picker.label);
      details.appendChild(detailRow);
    });

    article.appendChild(details);
  }

  return article;
}

function rawColorRow(labelText, key) {
  const row = ce('div', { className: 'theme-advanced-row' });
  const label = ce('label', { className: 'theme-advanced-label', textContent: labelText });
  const color = ce('input', { type: 'color', value: colorToHexPreview(state[key] || DEFAULTS[key], DEFAULTS[key]) });
  const text = ce('input', {
    type: 'text',
    value: String(state[key] ?? DEFAULTS[key]),
    className: 'theme-advanced-text',
  });

  const syncFromState = () => {
    color.value = colorToHexPreview(state[key] || DEFAULTS[key], DEFAULTS[key]);
    text.value = String(state[key] ?? DEFAULTS[key]);
  };

  const applyValue = (nextValue) => {
    const trimmed = String(nextValue || '').trim();
    state[key] = trimmed || DEFAULTS[key];
    applyAll();
    saveToLocal(state);
  };

  color.addEventListener('input', () => {
    state[key] = color.value;
    text.value = color.value;
    applyAll();
    saveToLocal(state);
  });
  color.addEventListener('change', syncFromState);
  text.addEventListener('change', () => {
    applyValue(text.value);
    syncFromState();
  });

  append(row, label, color, text);
  return row;
}

function rawGroupRow(group) {
  const row = ce('div', { className: 'theme-advanced-row theme-advanced-group-row' });
  const title = ce('div', { className: 'theme-advanced-label', textContent: group.title });
  const fillKey = `${group.key}-fill`;
  const strokeKey = `${group.key}-stroke`;

  const fillPicker = createColorButton(
    'Fill',
    state[fillKey] || DEFAULTS[fillKey],
    (value) => {
      state[fillKey] = value;
      applyAll();
    },
    (value) => {
      state[fillKey] = value;
      saveToLocal(state);
      rememberRecentColor(value);
      rebuildUI(panelRef);
    },
  );

  const strokePicker = createColorButton(
    'Outline',
    state[strokeKey] || DEFAULTS[strokeKey],
    (value) => {
      state[strokeKey] = value;
      applyAll();
    },
    (value) => {
      state[strokeKey] = value;
      saveToLocal(state);
      rememberRecentColor(value);
      rebuildUI(panelRef);
    },
  );

  append(row, title, fillPicker.label, strokePicker.label);
  return row;
}

function buildAdvancedSection() {
  const details = ce('details', { className: 'theme-advanced-raw' });
  const summary = ce('summary', { textContent: 'Advanced' });
  details.appendChild(summary);

  const body = ce('div', { className: 'theme-advanced-body' });
  append(
    body,
    sectionTitle('Page Colors', 'Raw variables and native picker fallback stay here for power-user tuning and debugging.'),
    rawColorRow('Background', 'bg'),
    rawColorRow('Panel', 'panel'),
    rawColorRow('Text', 'ink'),
    rawColorRow('Glow', 'lit'),
  );

  const glowRow = ce('div', { className: 'theme-advanced-row theme-advanced-toggle-row' });
  glowRow.appendChild(ce('span', { className: 'theme-advanced-label', textContent: 'Glow strength' }));
  ['light', 'medium', 'high'].forEach((value) => {
    const label = ce('label', { className: 'theme-radio-pill' });
    const radio = ce('input', { type: 'radio', name: 'theme-glow-profile', value });
    radio.checked = state.glowProfile === value;
    radio.addEventListener('change', () => {
      state.glowProfile = value;
      applyAll();
      saveToLocal(state);
    });
    append(label, radio, ce('span', { textContent: value[0].toUpperCase() + value.slice(1) }));
    glowRow.appendChild(label);
  });
  body.appendChild(glowRow);

  const alphaRow = ce('div', { className: 'theme-advanced-row theme-advanced-toggle-row' });
  const alphaLabel = ce('span', { className: 'theme-advanced-label', textContent: 'Group opacity' });
  const alpha = ce('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state['group-alpha'] ?? '1') });
  const alphaValue = ce('span', { className: 'theme-advanced-value', textContent: String(state['group-alpha'] ?? '1') });
  alpha.addEventListener('input', () => {
    state['group-alpha'] = String(clamp01(parseFloat(alpha.value) || 0));
    alphaValue.textContent = state['group-alpha'];
    applyAll();
    saveToLocal(state);
  });
  append(alphaRow, alphaLabel, alpha, alphaValue);
  body.appendChild(alphaRow);

  const toggleRow = ce('div', { className: 'theme-advanced-row theme-advanced-toggle-row' });
  const toggleLabel = ce('label', { className: 'theme-switch' });
  const toggleInput = ce('input', { type: 'checkbox', checked: state['groups-enabled'] !== false });
  const toggleText = ce('span', { textContent: 'Color the controller groups' });
  toggleInput.addEventListener('change', () => {
    state['groups-enabled'] = !!toggleInput.checked;
    applyAll();
    saveToLocal(state);
  });
  append(toggleLabel, toggleInput, toggleText);
  append(toggleRow, ce('span', { className: 'theme-advanced-label', textContent: 'Board grouping' }), toggleLabel);
  body.appendChild(toggleRow);

  body.appendChild(sectionTitle('Raw Group Controls', 'Fill and outline pairs stay available here when you need exact CSS-level tuning or native color fallback.'));
  RAW_GROUPS.forEach((group) => body.appendChild(rawGroupRow(group)));

  const actions = ce('div', { className: 'theme-advanced-row theme-advanced-actions' });
  const exportBtn = ce('button', { type: 'button', textContent: 'Export JSON' });
  exportBtn.addEventListener('click', () => downloadJSON('theme.json', JSON.stringify(state, null, 2)));

  const importLabel = ce('label', { className: 'theme-import-label' });
  const importText = ce('span', { textContent: 'Import JSON' });
  const importInput = ce('input', { type: 'file', accept: 'application/json' });
  importInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      state = normalizeThemeState(JSON.parse(text));
      applyAll();
      saveToLocal(state);
      rebuildUI(panelRef);
    } catch {
      safeAlert('Invalid theme JSON.');
    } finally {
      event.target.value = '';
    }
  });
  append(importLabel, importText, importInput);

  const resetBtn = ce('button', { type: 'button', textContent: 'Reset' });
  resetBtn.addEventListener('click', () => {
    const groupsEnabled = state?.['groups-enabled'] !== false;
    state = { ...DEFAULTS, 'groups-enabled': groupsEnabled };
    applyAll();
    saveToLocal(state);
    rebuildUI(panelRef);
  });

  append(actions, exportBtn, importLabel, resetBtn);
  body.appendChild(actions);

  details.appendChild(body);
  return details;
}

function rebuildUI(mount) {
  if (!mount) return;
  mount.innerHTML = '';

  const studio = ce('div', { className: 'theme-studio' });
  studio.appendChild(createThemeColorStudio());
  studio.appendChild(buildAdvancedSection());

  mount.appendChild(studio);
}

function downloadJSON(name, text) {
  const a = ce('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function refreshThemeSurface({ svgRoot = null, rebuild = false } = {}) {
  resolveSvgRoot(svgRoot);
  const svg = resolveSvgRoot();
  applyGlobalVars(state || loadFromLocal());
  if (!svg) {
    scheduleSvgRetry();
    return false;
  }
  clearPendingSvgRetry();
  svgRetryCount = 0;
  prepareSvg(svg);
  applyGroupVarsToSVG(svg, state || loadFromLocal());
  if (rebuild && panelRef) rebuildUI(panelRef);
  return true;
}

export function attachThemeDesigner({ mount = null, svgRoot = null, startOpen = false } = {}) {
  svgRootRef = svgRoot || null;
  state = loadFromLocal();

  const targetMount = mount || $('#fabSheet');
  if (targetMount) {
    const useDedicatedMount = !!mount && targetMount.id !== 'fabSheet';
    if (useDedicatedMount) {
      panelRef = targetMount;
      rebuildUI(panelRef);
      if (startOpen) targetMount.closest?.('#fabSheet')?.classList.add('open');
    } else {
      const section = ce('div', { className: 'fab-section', id: 'theme-designer-sec' });
      section.appendChild(ce('div', { className: 'fab-title', textContent: 'Theme Studio' }));
      const body = ce('div');
      section.appendChild(body);
      targetMount.appendChild(section);
      panelRef = body;
      rebuildUI(panelRef);
      if (startOpen && targetMount.classList) targetMount.classList.add('open');
    }
  } else {
    const floating = ce('div', { id: 'themeDesigner' });
    floating.style.cssText = `
      position: fixed;
      right: 16px;
      top: 16px;
      z-index: 10000;
      width: min(440px, 92vw);
      max-height: 82vh;
      overflow: auto;
      padding: 12px;
      border-radius: 24px;
      background: var(--panel);
      color: var(--ink);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
    `;
    const close = ce('button', { type: 'button', textContent: 'Close' });
    close.addEventListener('click', () => floating.remove());
    floating.appendChild(close);
    const body = ce('div');
    floating.appendChild(body);
    panelRef = body;
    rebuildUI(panelRef);
    document.body.appendChild(floating);
  }

  refreshThemeSurface({ svgRoot });
}

export function listPresets() {
  return Object.keys(PRESET_LIBRARY);
}

export function applyPreset(name = 'instrument-dark', { save = true } = {}) {
  const preset = PRESET_LIBRARY[name];
  if (!preset) return false;
  return applySceneVars(preset, { save, rebuild: !!panelRef });
}

export function ensurePreset(name = 'instrument-dark') {
  if (hasStoredTheme()) {
    state = loadFromLocal();
    refreshAndMaybeRebuild({ rebuild: !!panelRef });
    return false;
  }
  return applyPreset(name, { save: false });
}

export function toggle(open) {
  const sec = $('#theme-designer-sec');
  const sheet = $('#fabSheet');
  if (sec && sheet) {
    sheet.classList.toggle('open', open ?? !sheet.classList.contains('open'));
    return;
  }
  if (open !== false) attachThemeDesigner({ startOpen: true });
}

export function focus(which = 'scenes') {
  const sec = document.getElementById('theme-designer-sec');
  const sheet = document.getElementById('fabSheet');
  if (sec && sheet) {
    selectedStudioTab = which === 'groups' ? 'colors' : 'themes';
    if (panelRef) rebuildUI(panelRef);
    sheet.classList.add('open');
    const selector = which === 'groups' ? '.theme-color-studio' : '.theme-scene-grid';
    const target = sec.querySelector(selector);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    return;
  }
  toggle(true);
}

export function setVars(vars = {}) {
  state = normalizeThemeState({ ...(state || loadFromLocal()), ...vars });
  applyAll();
  saveToLocal(state);
  if (panelRef) rebuildUI(panelRef);
}

export function getVars() {
  return { ...(state || loadFromLocal()) };
}
