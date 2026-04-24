export const deckSides = Object.freeze([
  'left',
  'right',
]);

export const mixerChannels = Object.freeze([1, 2, 3, 4]);

export const padSlots = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

export const hotcueSlots = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

export const samplerSlots = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

export const fxUnits = Object.freeze([1, 2]);

export const fxParameters = Object.freeze([1, 2, 3]);

export const padModes = Object.freeze([
  'hotcue',
  'sampler',
  'keyboard',
  'key_shift',
  'loop',
  'roll',
  'slicer',
  'fx',
  'beatjump',
  'beat_loop',
  'sample_scratch',
  'stems',
  'user',
]);

export const semanticActions = Object.freeze([
  'trigger',
  'set',
  'clear',
  'toggle',
  'select',
  'load',
  'assign',
  'increase',
  'decrease',
  'press',
  'release',
  'turn',
  'touch',
]);

export const controlContextKeys = Object.freeze([
  'mode',
  'bank',
  'shifted',
  'action',
  'size',
  'deckLayer',
  'assignment',
  'ownerDeck',
  'ownerLayer',
  'surfaceSide',
  'selector',
  'fxUnit',
]);

export const canonicalControlFamilies = Object.freeze([
  'mixer',
  'deck',
  'monitor',
  'browser',
  'sampler',
  'fx',
]);

export const canonicalBindingStyles = Object.freeze([
  'surface',
  'action',
  'modifier',
]);

export const canonicalControlKinds = Object.freeze([
  'continuous',
  'button',
  'touch',
  'pad',
  'encoder',
]);

export const canonicalValueShapes = Object.freeze([
  'absolute',
  'delta',
  'binary',
]);

export const canonicalSurfaces = Object.freeze([
  'fader',
  'knob',
  'button',
  'pad',
  'encoder',
  'touch',
  'strip',
  'wheel',
  'virtual',
]);

/**
 * Supported pad mode names carried in modal context.
 *
 * @typedef {'hotcue'|'sampler'|'loop'|'roll'|'slicer'|'fx'|'beatjump'|'stems'|'user'} PadMode
 */

/**
 * Supported semantic action hints carried in mapping context.
 *
 * @typedef {'trigger'|'set'|'clear'|'toggle'|'select'|'load'|'assign'|'increase'|'decrease'} SemanticAction
 */

/**
 * Canonical control id used by the app internally.
 * Valid ids come from `canonicalControlList` / `canonicalControlIds`.
 *
 * @typedef {string} CanonicalControlId
 */

/**
 * Optional pad state carried alongside a physical pad target.
 * The control id stays stable while the pad context can change.
 *
 * @typedef {Object} PadContext
 * @property {string=} bank
 * @property {PadMode=} mode
 * @property {boolean=} shifted
 */

/**
 * Optional semantic and modal hints that can accompany a canonical control id.
 *
 * @typedef {Object} ControlContext
 * @property {string=} bank
 * @property {PadMode=} mode
 * @property {boolean=} shifted
 * @property {SemanticAction=} action
 * @property {number|string=} size
 * @property {string=} deckLayer
 * @property {string=} assignment
 */

/**
 * Forward-compatible output/feedback hints for a canonical control.
 *
 * @typedef {Object} ControlFeedback
 * @property {boolean=} light
 * @property {boolean=} value
 * @property {boolean=} meter
 */

/**
 * Structured metadata for one canonical control target.
 *
 * @typedef {Object} CanonicalControlDescriptor
 * @property {CanonicalControlId} id
 * @property {string} label
 * @property {'surface'|'action'|'modifier'} bindingStyle
 * @property {'continuous'|'button'|'touch'|'pad'|'encoder'} kind
 * @property {'absolute'|'delta'|'binary'} valueShape
 * @property {'fader'|'knob'|'button'|'pad'|'encoder'|'touch'|'strip'|'wheel'|'virtual'} surface
 * @property {'mixer'|'deck'|'monitor'|'browser'|'sampler'|'fx'} family
 * @property {string=} section
 * @property {'left'|'right'=} side
 * @property {1|2|3|4=} channel
 * @property {number=} slot
 * @property {number=} unit
 * @property {number=} parameter
 * @property {string=} role
 * @property {1|2|3|4|5|6|7|8=} padSlot
 * @property {PadContext=} padContext
 * @property {string[]=} supportedContext
 * @property {ControlFeedback=} feedback
 */

/**
 * Creates a frozen descriptor for the canonical control catalog.
 *
 * @param {CanonicalControlDescriptor} descriptor
 * @returns {Readonly<CanonicalControlDescriptor>}
 */
export function defineCanonicalControl(descriptor) {
  const supportedContext = Object.freeze([...(descriptor.supportedContext || [])]);
  const feedback = Object.freeze({ ...(descriptor.feedback || {}) });
  return Object.freeze({
    ...descriptor,
    supportedContext,
    feedback,
  });
}

/**
 * Stable pad id builder for physical pad surfaces.
 * Modes and banks should live in PadContext instead of changing the id.
 *
 * @param {'left'|'right'} side
 * @param {1|2|3|4|5|6|7|8} slot
 * @returns {CanonicalControlId}
 */
export function makePadControlId(side, slot) {
  return `deck.${side}.pad.${slot}`;
}

function sideLabel(side) {
  return side === 'left' ? 'Left' : 'Right';
}

function titleCase(token) {
  return String(token)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const controlEntries = [];

function addControl(key, descriptor) {
  controlEntries.push([key, defineCanonicalControl(descriptor)]);
}

addControl('mixerCrossfader', {
  id: 'mixer.crossfader',
  label: 'Crossfader',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'fader',
  family: 'mixer',
  section: 'crossfader',
  role: 'crossfader',
  feedback: { value: true },
});

for (const channel of mixerChannels) {
  addControl(`channelFader${channel}`, {
    id: `mixer.channel.${channel}.fader`,
    label: `Channel Fader ${channel}`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'fader',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'fader',
    feedback: { value: true },
  });

  addControl(`channelGain${channel}`, {
    id: `mixer.channel.${channel}.gain`,
    label: `Channel ${channel} Gain`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'knob',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'gain',
    feedback: { value: true },
  });

  addControl(`channelEqHigh${channel}`, {
    id: `mixer.channel.${channel}.eq.high`,
    label: `Channel ${channel} EQ High`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'knob',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'eq_high',
    feedback: { value: true },
  });

  addControl(`channelEqMid${channel}`, {
    id: `mixer.channel.${channel}.eq.mid`,
    label: `Channel ${channel} EQ Mid`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'knob',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'eq_mid',
    feedback: { value: true },
  });

  addControl(`channelEqLow${channel}`, {
    id: `mixer.channel.${channel}.eq.low`,
    label: `Channel ${channel} EQ Low`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'knob',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'eq_low',
    feedback: { value: true },
  });

  addControl(`channelFilter${channel}`, {
    id: `mixer.channel.${channel}.filter`,
    label: `Channel ${channel} Filter`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'knob',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'filter',
    feedback: { value: true },
  });

  addControl(`channelCue${channel}`, {
    id: `mixer.channel.${channel}.cue`,
    label: `Channel ${channel} Cue`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'mixer',
    section: 'channel',
    channel,
    role: 'cue',
    feedback: { light: true },
  });
}

addControl('mixerMasterVolume', {
  id: 'mixer.master.volume',
  label: 'Master Volume',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'knob',
  family: 'mixer',
  section: 'master',
  role: 'volume',
  feedback: { value: true },
});

addControl('mixerBoothVolume', {
  id: 'mixer.booth.volume',
  label: 'Booth Volume',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'knob',
  family: 'mixer',
  section: 'booth',
  role: 'volume',
  feedback: { value: true },
});

addControl('headphonesVolume', {
  id: 'monitor.headphones.volume',
  label: 'Headphones Volume',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'knob',
  family: 'monitor',
  section: 'headphones',
  role: 'volume',
  feedback: { value: true },
});

addControl('headphonesMix', {
  id: 'monitor.headphones.mix',
  label: 'Headphones Mix',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'knob',
  family: 'monitor',
  section: 'headphones',
  role: 'mix',
  feedback: { value: true },
});

addControl('headphonesSplitCue', {
  id: 'monitor.headphones.split_cue',
  label: 'Headphones Split Cue',
  bindingStyle: 'modifier',
  kind: 'button',
  valueShape: 'binary',
  surface: 'button',
  family: 'monitor',
  section: 'headphones',
  role: 'split_cue',
  feedback: { light: true },
});

addControl('headphonesBalance', {
  id: 'monitor.headphones.balance',
  label: 'Headphones Balance',
  bindingStyle: 'surface',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'knob',
  family: 'monitor',
  section: 'headphones',
  role: 'balance',
  feedback: { value: true },
});

for (const side of deckSides) {
  const sideTitle = sideLabel(side);

  addControl(`${side}TransportPlay`, {
    id: `deck.${side}.transport.play`,
    label: `${sideTitle} Play`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'play',
    feedback: { light: true },
  });

  addControl(`${side}TransportCue`, {
    id: `deck.${side}.transport.cue`,
    label: `${sideTitle} Cue`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'cue',
    feedback: { light: true },
  });

  addControl(`${side}TransportSync`, {
    id: `deck.${side}.transport.sync`,
    label: `${sideTitle} Sync`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'sync',
    feedback: { light: true },
  });

  addControl(`${side}TransportKeylock`, {
    id: `deck.${side}.transport.keylock`,
    label: `${sideTitle} Keylock`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'keylock',
    feedback: { light: true },
  });

  addControl(`${side}TransportQuantize`, {
    id: `deck.${side}.transport.quantize`,
    label: `${sideTitle} Quantize`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'quantize',
    feedback: { light: true },
  });

  addControl(`${side}TransportSlip`, {
    id: `deck.${side}.transport.slip`,
    label: `${sideTitle} Slip`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'slip',
    feedback: { light: true },
  });

  addControl(`${side}TransportReverse`, {
    id: `deck.${side}.transport.reverse`,
    label: `${sideTitle} Reverse`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'reverse',
    feedback: { light: true },
  });

  addControl(`${side}TransportLoad`, {
    id: `deck.${side}.transport.load`,
    label: `${sideTitle} Load`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'load',
  });

  addControl(`${side}TransportShift`, {
    id: `deck.${side}.transport.shift`,
    label: `${sideTitle} Shift`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'shift',
  });

  addControl(`${side}TransportLayer`, {
    id: `deck.${side}.transport.layer`,
    label: `${sideTitle} Deck Layer`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'transport',
    side,
    role: 'layer',
    supportedContext: ['deckLayer'],
  });

  addControl(`${side}TempoFader`, {
    id: `deck.${side}.tempo.fader`,
    label: `${sideTitle} Tempo Fader`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'fader',
    family: 'deck',
    section: 'tempo',
    side,
    role: 'tempo_fader',
    feedback: { value: true },
  });

  addControl(`${side}TempoBendUp`, {
    id: `deck.${side}.tempo.bend_up`,
    label: `${sideTitle} Tempo Bend Up`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'tempo',
    side,
    role: 'bend_up',
  });

  addControl(`${side}TempoBendDown`, {
    id: `deck.${side}.tempo.bend_down`,
    label: `${sideTitle} Tempo Bend Down`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'tempo',
    side,
    role: 'bend_down',
  });

  addControl(`${side}TempoReset`, {
    id: `deck.${side}.tempo.reset`,
    label: `${sideTitle} Tempo Reset`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'tempo',
    side,
    role: 'reset',
  });

  addControl(`${side}TempoRange`, {
    id: `deck.${side}.tempo.range`,
    label: `${sideTitle} Tempo Range`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'tempo',
    side,
    role: 'range',
  });

  addControl(`${side}JogMotion`, {
    id: `deck.${side}.jog.motion`,
    label: `${sideTitle} Jog Motion`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'delta',
    surface: 'wheel',
    family: 'deck',
    section: 'jog',
    side,
    role: 'jog_motion',
    feedback: { value: true },
  });

  addControl(`${side}JogTouch`, {
    id: `deck.${side}.jog.touch`,
    label: `${sideTitle} Jog Touch`,
    bindingStyle: 'surface',
    kind: 'touch',
    valueShape: 'binary',
    surface: 'touch',
    family: 'deck',
    section: 'jog',
    side,
    role: 'jog_touch',
    feedback: { light: true },
  });

  addControl(`${side}JogVinylMode`, {
    id: `deck.${side}.jog.vinyl_mode`,
    label: `${sideTitle} Vinyl Mode`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'jog',
    side,
    role: 'vinyl_mode',
    feedback: { light: true },
  });

  addControl(`${side}JogCutter`, {
    id: `deck.${side}.jog.cutter`,
    label: `${sideTitle} Jog Cutter`,
    bindingStyle: 'modifier',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'jog',
    side,
    role: 'jog_cutter',
    feedback: { light: true },
  });

  addControl(`${side}SearchNeedle`, {
    id: `deck.${side}.search.needle`,
    label: `${sideTitle} Needle Search`,
    bindingStyle: 'surface',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'strip',
    family: 'deck',
    section: 'search',
    side,
    role: 'needle',
    feedback: { value: true },
  });

  addControl(`${side}LoopIn`, {
    id: `deck.${side}.loop.in`,
    label: `${sideTitle} Loop In`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'loop_in',
    feedback: { light: true },
  });

  addControl(`${side}LoopOut`, {
    id: `deck.${side}.loop.out`,
    label: `${sideTitle} Loop Out`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'loop_out',
    feedback: { light: true },
  });

  addControl(`${side}LoopReloopExit`, {
    id: `deck.${side}.loop.reloop_exit`,
    label: `${sideTitle} Reloop Exit`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'reloop_exit',
    feedback: { light: true },
  });

  addControl(`${side}LoopCallBackward`, {
    id: `deck.${side}.loop.call.backward`,
    label: `${sideTitle} Cue Loop Call Backward`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'call_backward',
    feedback: { light: true },
  });

  addControl(`${side}LoopCallForward`, {
    id: `deck.${side}.loop.call.forward`,
    label: `${sideTitle} Cue Loop Call Forward`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'call_forward',
    feedback: { light: true },
  });

  addControl(`${side}LoopMemory`, {
    id: `deck.${side}.loop.memory`,
    label: `${sideTitle} Cue Loop Memory`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'memory',
    feedback: { light: true },
  });

  addControl(`${side}LoopHalve`, {
    id: `deck.${side}.loop.halve`,
    label: `${sideTitle} Loop Halve`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'halve',
    feedback: { light: true },
  });

  addControl(`${side}LoopDouble`, {
    id: `deck.${side}.loop.double`,
    label: `${sideTitle} Loop Double`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'double',
    feedback: { light: true },
  });

  addControl(`${side}LoopAutoloop`, {
    id: `deck.${side}.loop.autoloop`,
    label: `${sideTitle} Auto Loop`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'loop',
    side,
    role: 'autoloop',
    supportedContext: ['size'],
    feedback: { light: true },
  });

  addControl(`${side}LoopSize`, {
    id: `deck.${side}.loop.size`,
    label: `${sideTitle} Loop Size`,
    bindingStyle: 'action',
    kind: 'encoder',
    valueShape: 'delta',
    surface: 'encoder',
    family: 'deck',
    section: 'loop',
    side,
    role: 'size',
    supportedContext: ['size'],
    feedback: { value: true },
  });

  addControl(`${side}BeatjumpBackward`, {
    id: `deck.${side}.beatjump.backward`,
    label: `${sideTitle} Beatjump Backward`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'beatjump',
    side,
    role: 'backward',
    supportedContext: ['size'],
  });

  addControl(`${side}BeatjumpForward`, {
    id: `deck.${side}.beatjump.forward`,
    label: `${sideTitle} Beatjump Forward`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'beatjump',
    side,
    role: 'forward',
    supportedContext: ['size'],
  });

  addControl(`${side}BeatjumpSize`, {
    id: `deck.${side}.beatjump.size`,
    label: `${sideTitle} Beatjump Size`,
    bindingStyle: 'action',
    kind: 'encoder',
    valueShape: 'delta',
    surface: 'encoder',
    family: 'deck',
    section: 'beatjump',
    side,
    role: 'size',
    supportedContext: ['size'],
    feedback: { value: true },
  });

  addControl(`${side}DeckFxQuick`, {
    id: `deck.${side}.fx.quick`,
    label: `${sideTitle} Quick FX`,
    bindingStyle: 'surface',
    kind: 'encoder',
    valueShape: 'delta',
    surface: 'encoder',
    family: 'deck',
    section: 'fx',
    side,
    role: 'quick_fx',
    feedback: { value: true, light: true },
  });

  addControl(`${side}DeckFxQuickSelect`, {
    id: `deck.${side}.fx.quick_select`,
    label: `${sideTitle} Quick FX Select`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'deck',
    section: 'fx',
    side,
    role: 'quick_fx_select',
    feedback: { light: true },
  });

  for (const mode of padModes) {
    addControl(`${side}PadMode${titleCase(mode).replace(/\s+/g, '')}`, {
      id: `deck.${side}.pad_mode.${mode}`,
      label: `${sideTitle} Pad Mode ${titleCase(mode)}`,
      bindingStyle: 'modifier',
      kind: 'button',
      valueShape: 'binary',
      surface: 'button',
      family: 'deck',
      section: 'pad_mode',
      side,
      role: `pad_mode_${mode}`,
      feedback: { light: true },
    });
  }

  for (const slot of hotcueSlots) {
    addControl(`${side}Hotcue${slot}`, {
      id: `deck.${side}.hotcue.${slot}`,
      label: `${sideTitle} Hotcue ${slot}`,
      bindingStyle: 'action',
      kind: 'button',
      valueShape: 'binary',
      surface: 'virtual',
      family: 'deck',
      section: 'hotcue',
      side,
      role: 'hotcue',
      slot,
      supportedContext: ['action'],
      feedback: { light: true },
    });
  }

  for (const slot of padSlots) {
    addControl(`${side}Pad${slot}`, {
      id: makePadControlId(side, slot),
      label: `${sideTitle} Pad ${slot}`,
      bindingStyle: 'surface',
      kind: 'pad',
      valueShape: 'binary',
      surface: 'pad',
      family: 'deck',
      section: 'pad',
      side,
      role: 'pad',
      padSlot: slot,
      supportedContext: ['mode', 'bank', 'shifted'],
      feedback: { light: true },
    });
  }
}

for (const slot of samplerSlots) {
  addControl(`sampler${slot}Trigger`, {
    id: `sampler.${slot}.trigger`,
    label: `Sampler ${slot} Trigger`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'virtual',
    family: 'sampler',
    section: 'slot',
    slot,
    role: 'trigger',
    feedback: { light: true },
  });

  addControl(`sampler${slot}Stop`, {
    id: `sampler.${slot}.stop`,
    label: `Sampler ${slot} Stop`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'virtual',
    family: 'sampler',
    section: 'slot',
    slot,
    role: 'stop',
    feedback: { light: true },
  });

  addControl(`sampler${slot}Volume`, {
    id: `sampler.${slot}.volume`,
    label: `Sampler ${slot} Volume`,
    bindingStyle: 'action',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'virtual',
    family: 'sampler',
    section: 'slot',
    slot,
    role: 'volume',
    feedback: { value: true },
  });
}

for (const unit of fxUnits) {
  addControl(`fxUnit${unit}Enable`, {
    id: `fx.unit.${unit}.enable`,
    label: `FX Unit ${unit} Enable`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'virtual',
    family: 'fx',
    section: 'unit',
    unit,
    role: 'enable',
    feedback: { light: true },
  });

  addControl(`fxUnit${unit}DryWet`, {
    id: `fx.unit.${unit}.dry_wet`,
    label: `FX Unit ${unit} Dry Wet`,
    bindingStyle: 'action',
    kind: 'continuous',
    valueShape: 'absolute',
    surface: 'virtual',
    family: 'fx',
    section: 'unit',
    unit,
    role: 'dry_wet',
    feedback: { value: true },
  });

  for (const parameter of fxParameters) {
    addControl(`fxUnit${unit}Parameter${parameter}`, {
      id: `fx.unit.${unit}.parameter.${parameter}`,
      label: `FX Unit ${unit} Parameter ${parameter}`,
      bindingStyle: 'action',
      kind: 'continuous',
      valueShape: 'absolute',
      surface: 'virtual',
      family: 'fx',
      section: 'unit',
      unit,
      parameter,
      role: 'parameter',
      feedback: { value: true },
    });
  }

  for (const side of deckSides) {
    addControl(`fxUnit${unit}Assign${titleCase(side)}`, {
      id: `fx.unit.${unit}.assign.${side}`,
      label: `FX Unit ${unit} Assign ${titleCase(side)}`,
      bindingStyle: 'action',
      kind: 'button',
      valueShape: 'binary',
      surface: 'virtual',
      family: 'fx',
      section: 'unit',
      unit,
      side,
      role: 'assign',
      feedback: { light: true },
    });
  }
}

addControl('fxQuickMain', {
  id: 'fx.quick.main',
  label: 'Quick FX Main',
  bindingStyle: 'action',
  kind: 'continuous',
  valueShape: 'absolute',
  surface: 'virtual',
  family: 'fx',
  section: 'quick',
  role: 'main',
  feedback: { value: true },
});

addControl('browserScroll', {
  id: 'browser.scroll',
  label: 'Browser Scroll',
  bindingStyle: 'action',
  kind: 'encoder',
  valueShape: 'delta',
  surface: 'encoder',
  family: 'browser',
  section: 'library',
  role: 'scroll',
  feedback: { value: true },
});

addControl('browserPush', {
  id: 'browser.push',
  label: 'Browser Push',
  bindingStyle: 'action',
  kind: 'button',
  valueShape: 'binary',
  surface: 'button',
  family: 'browser',
  section: 'library',
  role: 'push',
});

addControl('browserBack', {
  id: 'browser.back',
  label: 'Browser Back',
  bindingStyle: 'action',
  kind: 'button',
  valueShape: 'binary',
  surface: 'button',
  family: 'browser',
  section: 'library',
  role: 'back',
});

addControl('browserView', {
  id: 'browser.view',
  label: 'Browser View',
  bindingStyle: 'action',
  kind: 'button',
  valueShape: 'binary',
  surface: 'button',
  family: 'browser',
  section: 'library',
  role: 'view',
});

for (const side of deckSides) {
  addControl(`browserLoad${titleCase(side)}`, {
    id: `browser.load.${side}`,
    label: `Browser Load ${titleCase(side)}`,
    bindingStyle: 'action',
    kind: 'button',
    valueShape: 'binary',
    surface: 'button',
    family: 'browser',
    section: 'library',
    side,
    role: 'load',
  });
}

export const canonicalControls = Object.freeze(
  Object.freeze(Object.fromEntries(controlEntries))
);

export const canonicalControlList = Object.freeze(
  controlEntries.map(([, descriptor]) => descriptor)
);

export const canonicalControlIds = Object.freeze(
  canonicalControlList.reduce((acc, descriptor) => {
    acc[descriptor.id] = descriptor.id;
    return acc;
  }, /** @type {Record<string, CanonicalControlId>} */ ({}))
);

/**
 * Lookup helper for descriptor metadata.
 *
 * @param {CanonicalControlId} id
 * @returns {Readonly<CanonicalControlDescriptor>|null}
 */
export function getCanonicalControl(id) {
  return canonicalControlList.find((entry) => entry.id === id) || null;
}
