function freezeOutputBinding(binding) {
  const out = { ...binding };
  if (out.context) out.context = Object.freeze({ ...out.context });
  if (out.target) out.target = Object.freeze({ ...out.target });
  if (out.valueRange) out.valueRange = Object.freeze({ ...out.valueRange });
  return Object.freeze(out);
}

function outputBinding({
  id,
  canonical,
  feedbackKind = 'light',
  interaction = 'noteon',
  channel,
  code,
  context,
  binary,
  valueRange,
  note,
}) {
  return freezeOutputBinding({
    id,
    canonical,
    context,
    feedbackKind,
    binary,
    valueRange,
    target: {
      kind: 'light',
      channel,
      code,
      key: `${interaction}:${channel}:${code}`,
    },
    note,
  });
}

function lightBinding(options) {
  return outputBinding({
    ...options,
    feedbackKind: 'light',
    interaction: 'noteon',
    binary: options && options.binary !== false,
  });
}

function valueBinding(options) {
  return outputBinding({
    ...options,
    feedbackKind: 'value',
    interaction: 'cc',
    binary: false,
  });
}

function normalizeDeckLayer(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'alternate') return 'alternate';
  if (text === 'main') return 'main';
  return null;
}

function normalizePadMode(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function isPadCanonicalTarget(value) {
  return /^deck\.(left|right)\.pad\.[1-8]$/i.test(String(value || '').trim());
}

function getDeckSide(canonicalTarget) {
  const target = String(canonicalTarget || '').toLowerCase();
  if (target.startsWith('deck.left.')) return 'left';
  if (target.startsWith('deck.right.')) return 'right';
  return null;
}

function getRequestedDeckLayer(request, controllerState) {
  const fromContext = normalizeDeckLayer(request && request.context && request.context.deckLayer);
  if (fromContext) return fromContext;

  const side = getDeckSide(request && request.canonicalTarget);
  const fromState = side
    && controllerState
    && controllerState.deckLayer
    && normalizeDeckLayer(controllerState.deckLayer[side]);
  return fromState || 'main';
}

function getRequestedPadMode(request, controllerState) {
  const fromContext = normalizePadMode(request && request.context && request.context.mode);
  if (fromContext) return fromContext;

  const side = getDeckSide(request && request.canonicalTarget);
  const fromState = side
    && controllerState
    && controllerState.padMode
    && normalizePadMode(controllerState.padMode[side]);
  return fromState || null;
}

const flx6PadDeckOutputs = Object.freeze([
  Object.freeze({
    side: 'left',
    deckLayer: 'main',
    buttonChannel: 1,
    padChannel: 9,
    label: 'Left main deck',
  }),
  Object.freeze({
    side: 'right',
    deckLayer: 'main',
    buttonChannel: 2,
    padChannel: 11,
    label: 'Right main deck',
  }),
  Object.freeze({
    side: 'left',
    deckLayer: 'alternate',
    buttonChannel: 3,
    padChannel: 13,
    label: 'Left alternate deck',
  }),
  Object.freeze({
    side: 'right',
    deckLayer: 'alternate',
    buttonChannel: 4,
    padChannel: 15,
    label: 'Right alternate deck',
  }),
]);

const flx6PadFeedbackBanks = Object.freeze([
  Object.freeze({
    mode: 'hotcue',
    label: 'Hot Cue',
    modeButtonCode: 27,
    padCodeStart: 0,
  }),
  Object.freeze({
    mode: 'fx',
    label: 'Pad FX',
    modeButtonCode: 30,
    padCodeStart: 16,
  }),
  Object.freeze({
    mode: 'beatjump',
    label: 'Beat Jump',
    modeButtonCode: 32,
    padCodeStart: 32,
  }),
  Object.freeze({
    mode: 'sampler',
    label: 'Sampler',
    modeButtonCode: 34,
    padCodeStart: 48,
  }),
  Object.freeze({
    mode: 'keyboard',
    label: 'Keyboard',
    modeButtonCode: 105,
    padCodeStart: 64,
  }),
  Object.freeze({
    mode: 'key_shift',
    label: 'Key Shift',
    modeButtonCode: 111,
    padCodeStart: 80,
  }),
  Object.freeze({
    mode: 'beat_loop',
    label: 'Beat Loop',
    modeButtonCode: 109,
    padCodeStart: 96,
  }),
  Object.freeze({
    mode: 'sample_scratch',
    label: 'Sample Scratch',
    modeButtonCode: 107,
    padCodeStart: 112,
  }),
]);

const flx6TransportDeckLayers = Object.freeze([
  Object.freeze({ deckLayer: 'main', leftChannel: 1, rightChannel: 2 }),
  Object.freeze({ deckLayer: 'alternate', leftChannel: 3, rightChannel: 4 }),
]);

const flx6DeckLayerButtonSpecs = Object.freeze([
  Object.freeze({ canonical: 'deck.left.transport.layer', channel: 3, code: 114, label: 'Left deck layer' }),
  Object.freeze({ canonical: 'deck.right.transport.layer', channel: 4, code: 114, label: 'Right deck layer' }),
]);

const flx6MixerCueSpecs = Object.freeze([
  Object.freeze({ canonical: 'mixer.channel.1.cue', channel: 1, code: 84, label: 'Channel 1 cue' }),
  Object.freeze({ canonical: 'mixer.channel.2.cue', channel: 2, code: 84, label: 'Channel 2 cue' }),
  Object.freeze({ canonical: 'mixer.channel.3.cue', channel: 3, code: 84, label: 'Channel 3 cue' }),
  Object.freeze({ canonical: 'mixer.channel.4.cue', channel: 4, code: 84, label: 'Channel 4 cue' }),
]);

const flx6SyncMasterSpecs = Object.freeze([
  Object.freeze({ canonical: 'deck.left.transport.sync', side: 'left', code: 88, label: 'Left sync' }),
  Object.freeze({ canonical: 'deck.right.transport.sync', side: 'right', code: 88, label: 'Right sync' }),
  Object.freeze({ canonical: 'deck.left.transport.master', side: 'left', code: 92, label: 'Left master' }),
  Object.freeze({ canonical: 'deck.right.transport.master', side: 'right', code: 92, label: 'Right master' }),
]);

const flx6LoopButtonSpecs = Object.freeze([
  Object.freeze({ canonical: 'deck.left.loop.in', side: 'left', code: 16, label: 'Left loop in' }),
  Object.freeze({ canonical: 'deck.right.loop.in', side: 'right', code: 16, label: 'Right loop in' }),
  Object.freeze({ canonical: 'deck.left.loop.out', side: 'left', code: 17, label: 'Left loop out' }),
  Object.freeze({ canonical: 'deck.right.loop.out', side: 'right', code: 17, label: 'Right loop out' }),
  Object.freeze({ canonical: 'deck.left.loop.reloop_exit', side: 'left', code: 77, label: 'Left reloop/exit' }),
  Object.freeze({ canonical: 'deck.right.loop.reloop_exit', side: 'right', code: 77, label: 'Right reloop/exit' }),
]);

function buildDeckLayerLeds(specs) {
  return specs.flatMap((spec) =>
    flx6TransportDeckLayers.map((layer) => {
      const channel = spec.side === 'left' ? layer.leftChannel : layer.rightChannel;
      return lightBinding({
        id: `${spec.canonical}.${layer.deckLayer}.led`,
        canonical: spec.canonical,
        channel,
        code: spec.code,
        context: { deckLayer: layer.deckLayer },
        note: `${spec.label} LED for the ${layer.deckLayer} deck layer from the FLX6 CSV MIDI-OUT rows.`,
      });
    })
  );
}

function buildPadModeOutputBindings() {
  return flx6PadDeckOutputs.flatMap((lane) =>
    flx6PadFeedbackBanks.map((bank) =>
      lightBinding({
        id: `deck.${lane.side}.pad_mode.${bank.mode}.${lane.deckLayer}.led`,
        canonical: `deck.${lane.side}.pad_mode.${bank.mode}`,
        channel: lane.buttonChannel,
        code: bank.modeButtonCode,
        context: { deckLayer: lane.deckLayer },
        note: `${lane.label} ${bank.label} mode LED from the FLX6 CSV MIDI-OUT rows.`,
      })
    )
  );
}

function buildPadSurfaceOutputBindings() {
  return flx6PadDeckOutputs.flatMap((lane) =>
    flx6PadFeedbackBanks.flatMap((bank) =>
      Array.from({ length: 8 }, (_, index) =>
        lightBinding({
          id: `deck.${lane.side}.pad.${index + 1}.${lane.deckLayer}.${bank.mode}.led`,
          canonical: `deck.${lane.side}.pad.${index + 1}`,
          channel: lane.padChannel,
          code: bank.padCodeStart + index,
          context: {
            deckLayer: lane.deckLayer,
            mode: bank.mode,
          },
          note: `${lane.label} pad ${index + 1} ${bank.label} LED from the FLX6 CSV MIDI-OUT rows.`,
        })
      )
    )
  );
}

const flx6BeatFxOnOffSpecs = Object.freeze([
  Object.freeze({ unit: 1, slot: 1, channel: 5, code: 71, label: 'Beat FX unit 1 on/off slot 1' }),
  Object.freeze({ unit: 1, slot: 2, channel: 5, code: 72, label: 'Beat FX unit 1 on/off slot 2' }),
  Object.freeze({ unit: 1, slot: 3, channel: 5, code: 73, label: 'Beat FX unit 1 on/off slot 3' }),
  Object.freeze({ unit: 2, slot: 1, channel: 6, code: 71, label: 'Beat FX unit 2 on/off slot 1' }),
  Object.freeze({ unit: 2, slot: 2, channel: 6, code: 72, label: 'Beat FX unit 2 on/off slot 2' }),
  Object.freeze({ unit: 2, slot: 3, channel: 6, code: 73, label: 'Beat FX unit 2 on/off slot 3' }),
]);

const flx6BeatFxSelectSpecs = Object.freeze([
  Object.freeze({ unit: 1, slot: 1, channel: 5, code: 112, label: 'Beat FX unit 1 select slot 1' }),
  Object.freeze({ unit: 1, slot: 2, channel: 5, code: 113, label: 'Beat FX unit 1 select slot 2' }),
  Object.freeze({ unit: 1, slot: 3, channel: 5, code: 114, label: 'Beat FX unit 1 select slot 3' }),
  Object.freeze({ unit: 2, slot: 1, channel: 6, code: 112, label: 'Beat FX unit 2 select slot 1' }),
  Object.freeze({ unit: 2, slot: 2, channel: 6, code: 113, label: 'Beat FX unit 2 select slot 2' }),
  Object.freeze({ unit: 2, slot: 3, channel: 6, code: 114, label: 'Beat FX unit 2 select slot 3' }),
]);

function buildBeatFxOnOffOutputBindings() {
  return flx6BeatFxOnOffSpecs.map((spec) =>
    lightBinding({
      id: `beatfx.on_off.unit${spec.unit}.slot${spec.slot}.led`,
      canonical: 'beatfx.on_off',
      channel: spec.channel,
      code: spec.code,
      context: { unit: spec.unit, slot: spec.slot },
      note: `${spec.label} LED from the FLX6 CSV MIDI-OUT rows.`,
    })
  );
}

function buildBeatFxSelectOutputBindings() {
  return flx6BeatFxSelectSpecs.map((spec) =>
    lightBinding({
      id: `beatfx.select.unit${spec.unit}.slot${spec.slot}.led`,
      canonical: 'beatfx.select',
      channel: spec.channel,
      code: spec.code,
      context: { unit: spec.unit, slot: spec.slot },
      note: `${spec.label} LED from the FLX6 CSV MIDI-OUT rows.`,
    })
  );
}

function isBeatFxUnitSlotCanonical(value) {
  const canonical = String(value || '').trim().toLowerCase();
  return canonical === 'beatfx.on_off' || canonical === 'beatfx.select';
}

function coerceLightValue(value) {
  if (typeof value === 'boolean') return value ? 127 : 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'on' || text === 'true' || text === 'lit') return 127;
    if (text === 'off' || text === 'false' || text === 'dark') return 0;
  }

  let numeric = Number(value);
  if (!Number.isFinite(numeric)) numeric = 0;
  numeric = Math.round(numeric);
  if (numeric < 0) numeric = 0;
  if (numeric > 127) numeric = 127;
  return numeric;
}

function coerceBindingValue(value, binding) {
  if (binding && binding.binary) {
    return coerceLightValue(value) > 0 ? 127 : 0;
  }

  let numeric = coerceLightValue(value);
  const min = binding && binding.valueRange && binding.valueRange.min != null
    ? Number(binding.valueRange.min)
    : 0;
  const max = binding && binding.valueRange && binding.valueRange.max != null
    ? Number(binding.valueRange.max)
    : 127;

  if (numeric < min) numeric = min;
  if (numeric > max) numeric = max;
  return numeric;
}

export const flx6OutputBindings = Object.freeze([
  lightBinding({
    id: 'deck.left.transport.play.main.led',
    canonical: 'deck.left.transport.play',
    channel: 1,
    code: 11,
    context: { deckLayer: 'main' },
    note: 'Left play LED for the main deck layer.',
  }),
  lightBinding({
    id: 'deck.right.transport.play.main.led',
    canonical: 'deck.right.transport.play',
    channel: 2,
    code: 11,
    context: { deckLayer: 'main' },
    note: 'Right play LED for the main deck layer.',
  }),
  lightBinding({
    id: 'deck.left.transport.play.alternate.led',
    canonical: 'deck.left.transport.play',
    channel: 3,
    code: 11,
    context: { deckLayer: 'alternate' },
    note: 'Left play LED for the alternate deck layer.',
  }),
  lightBinding({
    id: 'deck.right.transport.play.alternate.led',
    canonical: 'deck.right.transport.play',
    channel: 4,
    code: 11,
    context: { deckLayer: 'alternate' },
    note: 'Right play LED for the alternate deck layer.',
  }),
  lightBinding({
    id: 'deck.left.transport.cue.main.led',
    canonical: 'deck.left.transport.cue',
    channel: 1,
    code: 12,
    context: { deckLayer: 'main' },
    note: 'Left cue LED for the main deck layer.',
  }),
  lightBinding({
    id: 'deck.right.transport.cue.main.led',
    canonical: 'deck.right.transport.cue',
    channel: 2,
    code: 12,
    context: { deckLayer: 'main' },
    note: 'Right cue LED for the main deck layer.',
  }),
  lightBinding({
    id: 'deck.left.transport.cue.alternate.led',
    canonical: 'deck.left.transport.cue',
    channel: 3,
    code: 12,
    context: { deckLayer: 'alternate' },
    note: 'Left cue LED for the alternate deck layer.',
  }),
  lightBinding({
    id: 'deck.right.transport.cue.alternate.led',
    canonical: 'deck.right.transport.cue',
    channel: 4,
    code: 12,
    context: { deckLayer: 'alternate' },
    note: 'Right cue LED for the alternate deck layer.',
  }),
  valueBinding({
    id: 'deck.left.jog.illumination.main',
    canonical: 'deck.left.jog.motion',
    channel: 12,
    code: 0,
    context: { deckLayer: 'main' },
    valueRange: { min: 0, max: 0x48 },
    note: 'Left jog illumination for the main deck layer from the FLX6 CSV MIDI-OUT rows.',
  }),
  valueBinding({
    id: 'deck.right.jog.illumination.main',
    canonical: 'deck.right.jog.motion',
    channel: 12,
    code: 1,
    context: { deckLayer: 'main' },
    valueRange: { min: 0, max: 0x48 },
    note: 'Right jog illumination for the main deck layer from the FLX6 CSV MIDI-OUT rows.',
  }),
  valueBinding({
    id: 'deck.left.jog.illumination.alternate',
    canonical: 'deck.left.jog.motion',
    channel: 12,
    code: 2,
    context: { deckLayer: 'alternate' },
    valueRange: { min: 0, max: 0x48 },
    note: 'Left jog illumination for the alternate deck layer from the FLX6 CSV MIDI-OUT rows.',
  }),
  valueBinding({
    id: 'deck.right.jog.illumination.alternate',
    canonical: 'deck.right.jog.motion',
    channel: 12,
    code: 3,
    context: { deckLayer: 'alternate' },
    valueRange: { min: 0, max: 0x48 },
    note: 'Right jog illumination for the alternate deck layer from the FLX6 CSV MIDI-OUT rows.',
  }),
  outputBinding({
    id: 'deck.left.fx.quick.illumination',
    canonical: 'deck.left.fx.quick',
    feedbackKind: 'light',
    interaction: 'cc',
    binary: true,
    channel: 5,
    code: 16,
    note: 'Left Merge FX illumination from the FLX6 CSV MIDI-OUT rows.',
  }),
  outputBinding({
    id: 'deck.right.fx.quick.illumination',
    canonical: 'deck.right.fx.quick',
    feedbackKind: 'light',
    interaction: 'cc',
    binary: true,
    channel: 6,
    code: 16,
    note: 'Right Merge FX illumination from the FLX6 CSV MIDI-OUT rows.',
  }),
  ...flx6DeckLayerButtonSpecs.map((spec) => lightBinding({
    id: `${spec.canonical}.led`,
    canonical: spec.canonical,
    channel: spec.channel,
    code: spec.code,
    note: `${spec.label} button LED from the FLX6 CSV MIDI-OUT rows.`,
  })),
  ...flx6MixerCueSpecs.map((spec) => lightBinding({
    id: `${spec.canonical}.led`,
    canonical: spec.canonical,
    channel: spec.channel,
    code: spec.code,
    note: `${spec.label} button LED from the FLX6 CSV MIDI-OUT rows.`,
  })),
  ...buildDeckLayerLeds(flx6SyncMasterSpecs),
  ...buildDeckLayerLeds(flx6LoopButtonSpecs),
  ...buildPadModeOutputBindings(),
  ...buildPadSurfaceOutputBindings(),
  ...buildBeatFxOnOffOutputBindings(),
  ...buildBeatFxSelectOutputBindings(),
]);

export const flx6OutputTargets = Object.freeze([
  ...new Set(
    flx6OutputBindings
      .map((binding) => binding.canonical)
      .filter(Boolean),
  ),
]);

/**
 * Resolves FLX6 output bindings for one canonical request.
 *
 * @param {import('../output/feedback.js').OutputMessage=} request
 * @param {Object=} options
 * @param {import('../core/state.js').ControllerState=} options.controllerState
 * @param {import('../profiles/definition.js').OutputControlBinding[]=} options.bindings
 * @returns {import('../profiles/definition.js').OutputControlBinding[]}
 */
export function findFlx6OutputBindings(request, options = {}) {
  const canonicalTarget = String(request && request.canonicalTarget || '').trim().toLowerCase();
  if (!canonicalTarget) return [];

  const bindings = Array.isArray(options.bindings) && options.bindings.length
    ? options.bindings
    : flx6OutputBindings;
  const candidates = bindings.filter((binding) => String(binding && binding.canonical || '').toLowerCase() === canonicalTarget);
  if (!candidates.length) return [];

  const deckLayer = getRequestedDeckLayer(request, options.controllerState);
  const exactLayer = candidates.filter((binding) =>
    normalizeDeckLayer(binding && binding.context && binding.context.deckLayer) === deckLayer
  );
  const scoped = exactLayer.length ? exactLayer : candidates;

  if (!isPadCanonicalTarget(canonicalTarget)) {
    if (isBeatFxUnitSlotCanonical(canonicalTarget)) {
      const rawUnit = request && request.context && request.context.unit;
      const rawSlot = request && request.context && request.context.slot;
      const unit = Number(rawUnit);
      const slot = Number(rawSlot);
      if (!Number.isFinite(unit) || unit < 1 || !Number.isFinite(slot) || slot < 1) return [];
      return scoped.filter((b) =>
        b && b.context &&
        Number(b.context.unit) === unit &&
        Number(b.context.slot) === slot
      );
    }
    return scoped;
  }

  const padMode = getRequestedPadMode(request, options.controllerState);
  if (!padMode) return [];

  const exactMode = scoped.filter((binding) =>
    normalizePadMode(binding && binding.context && binding.context.mode) === padMode
  );
  return exactMode.length ? exactMode : [];
}

/**
 * Builds concrete MIDI feedback messages for the first FLX6 LED bindings.
 *
 * @param {import('../output/feedback.js').OutputMessage[]=} requests
 * @param {Object=} options
 * @param {string=} options.profileId
 * @param {number=} options.timestamp
 * @param {import('../core/state.js').ControllerState=} options.controllerState
 * @param {import('../profiles/definition.js').OutputControlBinding[]=} options.bindings
 * @returns {import('../output/feedback.js').FeedbackMessage[]}
 */
export function buildFlx6OutputMessages(requests, options = {}) {
  const queue = Array.isArray(requests) ? requests : [];
  const profileId = String(options.profileId || 'pioneer-ddj-flx6');
  const timestamp = options.timestamp != null ? Number(options.timestamp) : Date.now();
  const controllerState = options.controllerState;
  const messages = [];

  queue.forEach((request) => {
    if (!request || typeof request !== 'object' || !request.canonicalTarget) return;

    const bindings = findFlx6OutputBindings(request, {
      controllerState,
      bindings: options.bindings,
    });
    if (!bindings.length) return;

    bindings.forEach((binding) => {
      messages.push(Object.freeze({
        target: Object.freeze({ ...(binding.target || {}) }),
        canonicalTarget: binding.canonical,
        context: Object.freeze({
          ...(binding.context || {}),
          ...(request.context || {}),
        }),
        value: coerceBindingValue(request.value, binding),
        outputKind: binding.feedbackKind || 'light',
        bindingId: binding.id || undefined,
        timestamp: request.timestamp != null ? Number(request.timestamp) : timestamp,
        profileId: request.profileId || profileId,
      }));
    });
  });

  return messages;
}

export default flx6OutputBindings;
