import {
  applyControllerStateEvent,
  getBeatFxTruth,
  getChannel4InputTruth,
  getDeckOwnershipTruth,
  getEventSide,
  getJogTruth,
  getPadModeTruth,
  resolveDeckNumberForSideLayer,
  snapshotControllerState,
} from '../core/state.js';
import { flx6InputMappings } from './ddj-flx6.mappings.js';

const flx6BindingIndex = new Map(
  flx6InputMappings
    .filter((binding) => binding && binding.id)
    .map((binding) => [binding.id, binding]),
);

function asArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function freeze(value) {
  return Object.freeze(value);
}

function cloneDebugValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneDebugValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneDebugValue(entry)]),
    );
  }
  return value;
}

function toIdVariants(id = '') {
  const value = String(id || '').trim();
  const out = new Set([value]);
  if (value.includes('_x5F_')) out.add(value.replace(/_x5F_/g, '_'));
  if (value.includes('_')) out.add(value.replace(/_/g, '_x5F_'));
  return [...out].flatMap((item) => [item, item.toLowerCase()]);
}

function lookupRecordValue(record, key) {
  if (!record || !key) return null;
  for (const variant of toIdVariants(key)) {
    if (Object.prototype.hasOwnProperty.call(record, variant)) return record[variant];
  }
  return null;
}

function resolveSurfaceTarget(targetId = '', profile = null) {
  const value = String(targetId || '').trim();
  if (!value) return null;
  const surfaceAliases = profile && profile.ui && profile.ui.surfaceAliases || null;
  return lookupRecordValue(surfaceAliases, value) || value;
}

function resolveRenderTarget(canonicalTarget = '', mappingId = '', profile = null) {
  const renderTargets = profile && profile.ui && profile.ui.renderTargets || {};
  const mappingKey = String(mappingId || '').trim();

  if (mappingKey) {
    let candidate = mappingKey;
    while (candidate) {
      const mappedTarget = lookupRecordValue(renderTargets, candidate);
      if (mappedTarget) return resolveSurfaceTarget(mappedTarget, profile);
      const nextCandidate = candidate.replace(/\.[^.]+$/, '');
      if (!nextCandidate || nextCandidate === candidate) break;
      candidate = nextCandidate;
    }
  }

  const canonicalKey = String(canonicalTarget || '').trim();
  if (!canonicalKey) return null;
  const targetId = renderTargets[canonicalKey];
  return targetId ? resolveSurfaceTarget(targetId, profile) : null;
}

function toTruthSnapshot(truth) {
  return freeze({
    value: truth && Object.prototype.hasOwnProperty.call(truth, 'value')
      ? cloneDebugValue(truth.value)
      : null,
    status: truth && truth.status || 'unknown',
    source: truth && truth.source || 'unknown',
    observedAt: truth && truth.observedAt != null ? Number(truth.observedAt) : null,
    note: truth && truth.note != null ? String(truth.note) : null,
  });
}

function truthSnapshotStatus(snapshot) {
  return snapshot && snapshot.status || 'unknown';
}

function snapshotDeckOwnershipTruth(state, side) {
  return side
    && state
    && state.truth
    && state.truth.deckOwnership
    && state.truth.deckOwnership[side]
    || null;
}

function snapshotPadModeTruth(state, side) {
  return side
    && state
    && state.truth
    && state.truth.padMode
    && state.truth.padMode[side]
    || null;
}

function snapshotJogTruth(state, side) {
  return side
    && state
    && state.truth
    && state.truth.jog
    && state.truth.jog[side]
    || null;
}

function snapshotChannel4Truth(state) {
  return state && state.truth && state.truth.channel4Input || null;
}

function normalizeBeatFxUnit(value) {
  const unit = Number(value);
  return unit === 1 || unit === 2 ? unit : null;
}

function normalizeBeatFxSlot(value) {
  const slot = Number(value);
  return slot >= 1 && slot <= 3 ? slot : null;
}

function normalizeBeatFxChannel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'master' || text === 'mst') return 'master';
  if (text === 'ch1' || text === 'channel1' || text === '1') return 'ch1';
  if (text === 'ch2' || text === 'channel2' || text === '2') return 'ch2';
  if (text === 'ch3' || text === 'channel3' || text === '3') return 'ch3';
  if (text === 'ch4' || text === 'channel4' || text === '4') return 'ch4';
  return null;
}

function getBeatFxEventContext(inputEvent) {
  const context = inputEvent && inputEvent.context || null;
  return freeze({
    unit: normalizeBeatFxUnit(context && context.unit),
    slot: normalizeBeatFxSlot(context && context.slot),
    selectedChannel: normalizeBeatFxChannel(context && context.selectedChannel),
  });
}

function snapshotBeatFxTruth(state, unit) {
  return unit ? getBeatFxTruth(state, unit) : null;
}

function createTruthTransition(beforeTruth, afterTruth, extra = null) {
  return freeze({
    ...(extra && typeof extra === 'object' ? extra : {}),
    before: beforeTruth ? toTruthSnapshot(beforeTruth) : null,
    after: afterTruth ? toTruthSnapshot(afterTruth) : null,
  });
}

function buildFocusedTruthFamilies({
  inputEvent,
  stateBefore,
  stateAfter,
  semantic,
  render,
}) {
  const side = semantic && semantic.deckContext && semantic.deckContext.surfaceSide
    || getEventSide(inputEvent)
    || null;
  const binding = semantic && semantic.deckContext && semantic.deckContext.binding || null;
  const jogBefore = snapshotJogTruth(stateBefore, side);
  const jogAfter = snapshotJogTruth(stateAfter, side);
  const beatFxContext = getBeatFxEventContext(inputEvent);
  const beatFxUnit = beatFxContext.unit;
  const beatFxBefore = snapshotBeatFxTruth(stateBefore, beatFxUnit);
  const beatFxAfter = snapshotBeatFxTruth(stateAfter, beatFxUnit);

  return freeze({
    deckOwnership: side
      ? createTruthTransition(
        snapshotDeckOwnershipTruth(stateBefore, side),
        snapshotDeckOwnershipTruth(stateAfter, side),
        freeze({
          side,
          binding: freeze({
            deckNumber: binding && binding.deckNumber != null ? Number(binding.deckNumber) : null,
            deckLayer: binding && binding.deckLayer || null,
          }),
          compatibilityDeckLayerBefore: stateBefore && stateBefore.deckLayer && stateBefore.deckLayer[side] || null,
          compatibilityDeckLayerAfter: stateAfter && stateAfter.deckLayer && stateAfter.deckLayer[side] || null,
        }),
      )
      : null,
    padMode: side
      ? createTruthTransition(
        snapshotPadModeTruth(stateBefore, side),
        snapshotPadModeTruth(stateAfter, side),
        freeze({
          side,
          compatibilityValueBefore: stateBefore && stateBefore.padMode && stateBefore.padMode[side] || null,
          compatibilityValueAfter: stateAfter && stateAfter.padMode && stateAfter.padMode[side] || null,
        }),
      )
      : null,
    vinylMode: side
      ? freeze({
        side,
        lane: createTruthTransition(
          jogBefore && jogBefore.lastLane,
          jogAfter && jogAfter.lastLane,
        ),
        mode: createTruthTransition(
          jogBefore && jogBefore.vinylMode,
          jogAfter && jogAfter.vinylMode,
        ),
        button: createTruthTransition(
          jogBefore && jogBefore.vinylModeButton,
          jogAfter && jogAfter.vinylModeButton,
        ),
      })
      : null,
    jogCutter: side
      ? freeze({
        side,
        enabled: createTruthTransition(
          jogBefore && jogBefore.jogCutterEnabled,
          jogAfter && jogAfter.jogCutterEnabled,
        ),
        button: createTruthTransition(
          jogBefore && jogBefore.jogCutterButton,
          jogAfter && jogAfter.jogCutterButton,
        ),
      })
      : null,
    channel4Selector: createTruthTransition(
      snapshotChannel4Truth(stateBefore),
      snapshotChannel4Truth(stateAfter),
      freeze({
        targetId: semantic && semantic.family === 'channel4-selector'
          ? (render && render.targetId || null)
          : null,
      }),
    ),
    beatFx: beatFxUnit
      ? freeze({
        unit: beatFxUnit,
        slotContext: beatFxContext.slot,
        channelContext: beatFxContext.selectedChannel,
        targetId: render && render.targetId || null,
        compatibilityBefore: freeze({
          selectedSlot: stateBefore && stateBefore.beatFx && stateBefore.beatFx[`unit${beatFxUnit}`]
            ? stateBefore.beatFx[`unit${beatFxUnit}`].selectedSlot
            : null,
          selectedChannel: stateBefore && stateBefore.beatFx && stateBefore.beatFx[`unit${beatFxUnit}`]
            ? stateBefore.beatFx[`unit${beatFxUnit}`].selectedChannel
            : null,
          enabled: stateBefore && stateBefore.beatFx && stateBefore.beatFx[`unit${beatFxUnit}`]
            ? stateBefore.beatFx[`unit${beatFxUnit}`].enabled
            : null,
          levelDepth: stateBefore && stateBefore.beatFx && stateBefore.beatFx[`unit${beatFxUnit}`]
            ? stateBefore.beatFx[`unit${beatFxUnit}`].levelDepth
            : null,
        }),
        compatibilityAfter: freeze({
          selectedSlot: stateAfter && stateAfter.beatFx && stateAfter.beatFx[`unit${beatFxUnit}`]
            ? stateAfter.beatFx[`unit${beatFxUnit}`].selectedSlot
            : null,
          selectedChannel: stateAfter && stateAfter.beatFx && stateAfter.beatFx[`unit${beatFxUnit}`]
            ? stateAfter.beatFx[`unit${beatFxUnit}`].selectedChannel
            : null,
          enabled: stateAfter && stateAfter.beatFx && stateAfter.beatFx[`unit${beatFxUnit}`]
            ? stateAfter.beatFx[`unit${beatFxUnit}`].enabled
            : null,
          levelDepth: stateAfter && stateAfter.beatFx && stateAfter.beatFx[`unit${beatFxUnit}`]
            ? stateAfter.beatFx[`unit${beatFxUnit}`].levelDepth
            : null,
        }),
        selectedSlot: createTruthTransition(
          beatFxBefore && beatFxBefore.selectedSlot,
          beatFxAfter && beatFxAfter.selectedSlot,
        ),
        selectedChannel: createTruthTransition(
          beatFxBefore && beatFxBefore.selectedChannel,
          beatFxAfter && beatFxAfter.selectedChannel,
        ),
        enabled: createTruthTransition(
          beatFxBefore && beatFxBefore.enabled,
          beatFxAfter && beatFxAfter.enabled,
        ),
        levelDepth: createTruthTransition(
          beatFxBefore && beatFxBefore.levelDepth,
          beatFxAfter && beatFxAfter.levelDepth,
        ),
      })
      : null,
  });
}

function buildTruthSummary(truthFocus) {
  const owner = truthFocus && truthFocus.deckOwnership;
  const pad = truthFocus && truthFocus.padMode;
  const vinyl = truthFocus && truthFocus.vinylMode;
  const cutter = truthFocus && truthFocus.jogCutter;
  const channel4 = truthFocus && truthFocus.channel4Selector;
  const beatFx = truthFocus && truthFocus.beatFx;

  return [
    owner ? `owner:${truthSnapshotStatus(owner.after)}` : null,
    pad ? `pad:${truthSnapshotStatus(pad.after)}` : null,
    vinyl
      ? `vinyl:mode=${truthSnapshotStatus(vinyl.mode.after)}/button=${truthSnapshotStatus(vinyl.button.after)}`
      : null,
    cutter
      ? `cutter:mode=${truthSnapshotStatus(cutter.enabled.after)}/button=${truthSnapshotStatus(cutter.button.after)}`
      : null,
    channel4 ? `ch4:${truthSnapshotStatus(channel4.after)}` : null,
    beatFx
      ? `beatfx:u${beatFx.unit} slot=${truthSnapshotStatus(beatFx.selectedSlot.after)} ch=${truthSnapshotStatus(beatFx.selectedChannel.after)} on=${truthSnapshotStatus(beatFx.enabled.after)} depth=${truthSnapshotStatus(beatFx.levelDepth.after)}`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function lookupBinding(mappingId) {
  const key = String(mappingId || '').trim();
  return key ? flx6BindingIndex.get(key) || null : null;
}

function createBindingSnapshot(binding, inputEvent) {
  if (!binding && !(inputEvent && (inputEvent.mappingId || inputEvent.canonicalTarget))) return null;
  return freeze({
    id: binding && binding.id || inputEvent && inputEvent.mappingId || null,
    label: binding && binding.label || null,
    canonicalTarget: binding && binding.canonical || inputEvent && inputEvent.canonicalTarget || null,
    rawTarget: binding && binding.rawTarget || inputEvent && inputEvent.rawTarget || null,
    context: binding && binding.context ? freeze({ ...binding.context }) : inputEvent && inputEvent.context ? freeze({ ...inputEvent.context }) : null,
    valueShape: binding && binding.valueShape || inputEvent && inputEvent.valueShape,
    note: binding && binding.note || null,
  });
}

function createRawLaneSnapshot(rawEvent, inputEvent) {
  const packet = rawEvent && rawEvent.packet || null;
  return freeze({
    key: rawEvent && rawEvent.key || inputEvent && inputEvent.key || null,
    interaction: rawEvent && rawEvent.interaction || inputEvent && inputEvent.interaction || inputEvent && inputEvent.type || null,
    channel: rawEvent && rawEvent.channel != null ? Number(rawEvent.channel) : inputEvent && inputEvent.channel != null ? Number(inputEvent.channel) : null,
    code: rawEvent && rawEvent.code != null ? Number(rawEvent.code) : inputEvent && inputEvent.code != null ? Number(inputEvent.code) : null,
    value: rawEvent && rawEvent.value != null ? Number(rawEvent.value) : inputEvent && inputEvent.value != null ? Number(inputEvent.value) : null,
    timestamp: rawEvent && rawEvent.timestamp != null ? Number(rawEvent.timestamp) : inputEvent && inputEvent.timestamp != null ? Number(inputEvent.timestamp) : null,
    transport: rawEvent && rawEvent.transport || inputEvent && inputEvent.transport || null,
    bytes: packet && Array.isArray(packet.bytes) ? packet.bytes.slice() : undefined,
  });
}

function getInteractionAction(inputEvent) {
  const interaction = String(inputEvent && (inputEvent.interaction || inputEvent.type) || '').toLowerCase();
  if (interaction === 'noteon') return 'press';
  if (interaction === 'noteoff') return 'release';
  if (interaction === 'cc') return 'set';
  return interaction || 'unknown';
}

function getCanonicalSegments(canonicalTarget) {
  return String(canonicalTarget || '')
    .split('.')
    .filter(Boolean);
}

function inferFamilyFromCanonical(canonicalTarget) {
  const target = String(canonicalTarget || '').toLowerCase();
  if (!target) return 'unknown';
  if (target.startsWith('beatfx.')) return 'beat-fx';
  if (target.includes('.jog.')) return 'jog';
  if (target.includes('.pad_mode.')) return 'pad-mode';
  if (/^deck\.(left|right)\.pad\./.test(target)) return 'pad';
  if (target === 'mixer.channel.4.input_select') return 'channel4-selector';
  if (/^mixer\.channel\.4\./.test(target)) return 'channel4-strip';
  if (target.startsWith('deck.')) return 'deck';
  if (target.startsWith('browser.')) return 'browser';
  if (target.includes('.fx.')) return 'fx';
  if (target.startsWith('mixer.')) return 'mixer';
  return target.split('.')[0] || 'unknown';
}

function genericMeaning(canonicalTarget) {
  const target = String(canonicalTarget || '').toLowerCase();
  if (!target) return 'unmapped_input';
  return target
    .replace(/^deck\.(left|right)\./, '')
    .replace(/^mixer\./, 'mixer_')
    .replace(/^browser\./, 'browser_')
    .replace(/\./g, '_');
}

function getBindingDeckLayer(binding, inputEvent) {
  const context = binding && binding.context || inputEvent && inputEvent.context || null;
  const deckLayer = context && context.deckLayer;
  if (deckLayer === 'main' || deckLayer === 'alternate') return deckLayer;
  return null;
}

function getBindingDeckNumber(side, bindingDeckLayer) {
  return side && bindingDeckLayer
    ? resolveDeckNumberForSideLayer(side, bindingDeckLayer)
    : null;
}

function buildDeckContext(controllerState, side, bindingDeckLayer, bindingDeckNumber) {
  const channel4InputTruth = getChannel4InputTruth(controllerState);
  const normalizedSide = side || null;

  if (!normalizedSide) {
    return freeze({
      surfaceSide: null,
      owner: null,
      binding: freeze({
        deckNumber: null,
        deckLayer: bindingDeckLayer || null,
      }),
      padMode: null,
      vinylMode: null,
      vinylModeButton: null,
      jogCutter: null,
      jogCutterButton: null,
      channel4Input: toTruthSnapshot(channel4InputTruth),
    });
  }

  const ownerTruth = getDeckOwnershipTruth(controllerState, normalizedSide);
  const ownerValue = ownerTruth.value || {};
  const padModeTruth = getPadModeTruth(controllerState, normalizedSide);
  const jogTruth = getJogTruth(controllerState, normalizedSide);

  return freeze({
    surfaceSide: normalizedSide,
    owner: freeze({
      deckNumber: ownerValue.ownerDeck != null ? Number(ownerValue.ownerDeck) : null,
      deckLayer: ownerValue.ownerLayer || null,
      status: ownerTruth.status || 'unknown',
      source: ownerTruth.source || 'unknown',
      pairedDecks: asArray(ownerValue.pairedDecks),
    }),
    binding: freeze({
      deckNumber: bindingDeckNumber != null ? Number(bindingDeckNumber) : null,
      deckLayer: bindingDeckLayer || null,
    }),
    padMode: toTruthSnapshot(padModeTruth),
    vinylMode: toTruthSnapshot(jogTruth.vinylMode),
    vinylModeButton: toTruthSnapshot(jogTruth.vinylModeButton),
    jogCutter: toTruthSnapshot(jogTruth.jogCutterEnabled),
    jogCutterButton: toTruthSnapshot(jogTruth.jogCutterButton),
    channel4Input: toTruthSnapshot(channel4InputTruth),
  });
}

function createSemanticResolution({
  family,
  action,
  meaning,
  truthStatus = 'official',
  deckContext = null,
  renderTargetHint = null,
}) {
  return freeze({
    family,
    action,
    meaning,
    truthStatus,
    deckContext,
    renderTargetHint: renderTargetHint ? freeze({ ...renderTargetHint }) : null,
  });
}

function createRenderResolution({
  targetId = null,
  canonicalTarget = null,
  mappingId = null,
  truthStatus = 'unknown',
  source = 'unresolved',
}) {
  return freeze({
    targetId,
    canonicalTarget,
    mappingId,
    truthStatus,
    source,
  });
}

function resolveJogMeaning(inputEvent) {
  const mappingId = String(inputEvent && inputEvent.mappingId || '').toLowerCase();
  const code = Number(inputEvent && (inputEvent.controller ?? inputEvent.d1));

  if (/\.jog\.touch\./.test(mappingId) || String(inputEvent && inputEvent.canonicalTarget || '').endsWith('.jog.touch')) {
    return /shifted/.test(mappingId) || code === 103
      ? 'jog_touch_shifted'
      : 'jog_touch';
  }

  if (/\.shifted\.secondary$/.test(mappingId) || code === 41) return 'jog_platter_turn_shifted';
  if (/\.shifted\.primary$/.test(mappingId) || code === 38) return 'jog_wheel_side_turn_shifted';
  if (/\.tertiary$/.test(mappingId) || code === 35) return 'jog_platter_turn_vinyl_off';
  if (/\.secondary$/.test(mappingId) || code === 34) return 'jog_platter_turn_vinyl_on';
  if (/\.primary$/.test(mappingId) || code === 33) return 'jog_wheel_side_turn';
  return 'jog_input';
}

function hasShiftedContext(inputEvent) {
  return !!(
    inputEvent
    && inputEvent.context
    && inputEvent.context.shifted
  );
}

function hasLongPressContext(inputEvent) {
  return !!(
    inputEvent
    && inputEvent.context
    && inputEvent.context.longPress
  );
}

function resolveBrowserMeaning(inputEvent, canonicalTarget) {
  const target = String(canonicalTarget || '').toLowerCase();
  const shifted = hasShiftedContext(inputEvent);
  const longPress = hasLongPressContext(inputEvent);
  const interactionAction = getInteractionAction(inputEvent);

  if (target === 'browser.scroll') {
    return {
      action: 'turn',
      meaning: shifted ? 'browser_scroll_shifted' : 'browser_scroll',
    };
  }

  if (target === 'browser.push') {
    return {
      action: interactionAction,
      meaning: shifted ? 'browser_push_shifted' : 'browser_push',
    };
  }

  if (target === 'browser.back') {
    return {
      action: interactionAction,
      meaning: shifted ? 'browser_back_shifted' : 'browser_back',
    };
  }

  if (target === 'browser.view') {
    if (longPress) {
      return {
        action: interactionAction === 'release' ? 'release' : 'long_press',
        meaning: 'browser_view_long_press',
      };
    }

    return {
      action: interactionAction,
      meaning: shifted ? 'browser_view_shifted' : 'browser_view',
    };
  }

  return {
    action: interactionAction,
    meaning: genericMeaning(target),
  };
}

function resolveLoadMeaning(inputEvent, bindingDeckNumber, bindingDeckLayer) {
  const shifted = hasShiftedContext(inputEvent);
  const interactionAction = getInteractionAction(inputEvent);
  const deckNumber = bindingDeckNumber != null ? Number(bindingDeckNumber) : null;
  const deckLayer = bindingDeckLayer || null;

  if (deckNumber != null) {
    return {
      action: interactionAction === 'release' ? 'release' : 'load',
      meaning: `load_to_deck_${deckNumber}${shifted ? '_shifted' : ''}`,
    };
  }

  if (deckLayer) {
    return {
      action: interactionAction === 'release' ? 'release' : 'load',
      meaning: `deck_load_${deckLayer}${shifted ? '_shifted' : ''}`,
    };
  }

  return {
    action: interactionAction === 'release' ? 'release' : 'load',
    meaning: shifted ? 'deck_load_shifted' : 'deck_load',
  };
}

function resolveTransportMeaning(inputEvent, canonicalTarget) {
  const target = String(canonicalTarget || '').toLowerCase();
  const shifted = hasShiftedContext(inputEvent);
  const interactionAction = getInteractionAction(inputEvent);
  const action = interactionAction === 'release' ? 'release' : 'press';

  if (target.endsWith('.transport.play')) {
    return { action, meaning: shifted ? 'transport_play_shifted' : 'transport_play' };
  }
  if (target.endsWith('.transport.cue')) {
    return { action, meaning: shifted ? 'transport_cue_shifted' : 'transport_cue' };
  }
  if (target.endsWith('.transport.sync')) {
    return { action, meaning: shifted ? 'transport_sync_shifted' : 'transport_sync' };
  }
  if (target.endsWith('.transport.master')) {
    return { action, meaning: shifted ? 'transport_master_shifted' : 'transport_master' };
  }

  return {
    action,
    meaning: genericMeaning(target),
  };
}

function resolvePadMeaning(inputEvent, deckContext) {
  const canonicalTarget = String(inputEvent && inputEvent.canonicalTarget || '');
  const slotMatch = /^deck\.(left|right)\.pad\.(\d+)$/i.exec(canonicalTarget);
  const slot = slotMatch ? Number(slotMatch[2]) : null;
  const padModeTruth = deckContext && deckContext.padMode;
  const mode = padModeTruth && padModeTruth.value || null;
  if (!slot || !mode) {
    return {
      meaning: slot ? `pad_${slot}_unresolved` : 'pad_unresolved',
      truthStatus: 'unknown',
    };
  }
  return {
    meaning: `${mode}_pad_${slot}_trigger`,
    truthStatus: padModeTruth.status || 'unknown',
  };
}

function resolveChannel4Meaning(canonicalTarget, selectorTruth) {
  const target = String(canonicalTarget || '').toLowerCase();
  if (!selectorTruth || !selectorTruth.value) {
    return {
      family: 'channel4-strip',
      meaning: 'channel_4_control_unresolved',
      truthStatus: 'unknown',
    };
  }

  if (selectorTruth.value === 'deck4') {
    return {
      family: 'mixer',
      meaning: genericMeaning(target),
      truthStatus: selectorTruth.status || 'official',
    };
  }

  if (target.endsWith('.fader')) {
    return { family: 'sampler', meaning: 'sampler_master_fader', truthStatus: selectorTruth.status || 'official' };
  }
  if (target.endsWith('.gain')) {
    return { family: 'sampler', meaning: 'sampler_trim', truthStatus: selectorTruth.status || 'official' };
  }
  if (target.endsWith('.eq.high')) {
    return { family: 'sampler', meaning: 'sampler_eq_high', truthStatus: selectorTruth.status || 'official' };
  }
  if (target.endsWith('.eq.mid')) {
    return { family: 'sampler', meaning: 'sampler_eq_mid', truthStatus: selectorTruth.status || 'official' };
  }
  if (target.endsWith('.eq.low')) {
    return { family: 'sampler', meaning: 'sampler_eq_low', truthStatus: selectorTruth.status || 'official' };
  }
  if (target.endsWith('.filter')) {
    return { family: 'sampler', meaning: 'sampler_filter', truthStatus: selectorTruth.status || 'official' };
  }
  return {
    family: 'sampler',
    meaning: 'sampler_strip_control',
    truthStatus: selectorTruth.status || 'official',
  };
}

export function resolveFlx6SemanticEvent({ rawEvent, inputEvent, binding, controllerState }) {
  const canonicalTarget = String(binding && binding.canonical || inputEvent && inputEvent.canonicalTarget || '');
  const side = getEventSide(inputEvent);
  const bindingDeckLayer = getBindingDeckLayer(binding, inputEvent);
  const bindingDeckNumber = getBindingDeckNumber(side, bindingDeckLayer);
  const deckContext = buildDeckContext(controllerState, side, bindingDeckLayer, bindingDeckNumber);
  const interactionAction = getInteractionAction(inputEvent);
  const beatFxContext = getBeatFxEventContext(inputEvent);
  const beatFxTruth = beatFxContext.unit
    ? getBeatFxTruth(controllerState, beatFxContext.unit)
    : null;

  if (!canonicalTarget) {
    return createSemanticResolution({
      family: 'unknown',
      action: interactionAction,
      meaning: 'unmapped_input',
      truthStatus: 'unknown',
      deckContext,
      renderTargetHint: {
        canonicalTarget: null,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (/^deck\.(left|right)\.transport\.layer\.status\.(main|alternate)$/i.test(canonicalTarget)) {
    return createSemanticResolution({
      family: 'deck-ownership',
      action: 'set',
      meaning: interactionAction === 'press' ? 'deck_control_on' : 'deck_control_off',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        targetId: side === 'left' ? 'decks_L' : 'decks_R',
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget.endsWith('.transport.layer')) {
    return createSemanticResolution({
      family: 'deck-ownership',
      action: interactionAction === 'release' ? 'release' : 'select',
      meaning: 'deck_owner_select_button',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        targetId: side === 'left' ? 'decks_L' : 'decks_R',
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget.endsWith('.jog.touch')) {
    return createSemanticResolution({
      family: 'jog',
      action: interactionAction === 'release' ? 'release' : 'touch',
      meaning: resolveJogMeaning(inputEvent),
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget.endsWith('.jog.motion')) {
    return createSemanticResolution({
      family: 'jog',
      action: 'turn',
      meaning: resolveJogMeaning(inputEvent),
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget.endsWith('.jog.cutter')) {
    return createSemanticResolution({
      family: 'jog',
      action: interactionAction === 'release' ? 'release' : 'toggle',
      meaning: 'jog_cutter_mode_toggle',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget.endsWith('.jog.vinyl_mode')) {
    return createSemanticResolution({
      family: 'jog',
      action: interactionAction === 'release' ? 'release' : 'toggle',
      meaning: 'vinyl_mode_toggle',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (/^deck\.(left|right)\.pad_mode\./i.test(canonicalTarget)) {
    const segments = getCanonicalSegments(canonicalTarget);
    return createSemanticResolution({
      family: 'pad-mode',
      action: interactionAction === 'release' ? 'release' : 'select',
      meaning: `${segments[3] || 'pad_mode'}_select`,
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (/^deck\.(left|right)\.pad\./i.test(canonicalTarget)) {
    const padMeaning = resolvePadMeaning(inputEvent, deckContext);
    return createSemanticResolution({
      family: 'pad',
      action: interactionAction,
      meaning: padMeaning.meaning,
      truthStatus: padMeaning.truthStatus,
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (/^browser\./i.test(canonicalTarget)) {
    const browserMeaning = resolveBrowserMeaning(inputEvent, canonicalTarget);
    return createSemanticResolution({
      family: 'browser',
      action: browserMeaning.action,
      meaning: browserMeaning.meaning,
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
        allowMissingTarget: true,
      },
    });
  }

  if (/^deck\.(left|right)\.transport\.(play|cue|sync|master)$/i.test(canonicalTarget)) {
    const transportMeaning = resolveTransportMeaning(inputEvent, canonicalTarget);
    return createSemanticResolution({
      family: 'transport',
      action: transportMeaning.action,
      meaning: transportMeaning.meaning,
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (/^deck\.(left|right)\.transport\.load$/i.test(canonicalTarget)) {
    const loadMeaning = resolveLoadMeaning(inputEvent, bindingDeckNumber, bindingDeckLayer);
    return createSemanticResolution({
      family: 'deck',
      action: loadMeaning.action,
      meaning: loadMeaning.meaning,
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'beatfx.select') {
    return createSemanticResolution({
      family: 'beat-fx',
      action: interactionAction === 'release' ? 'release' : 'select',
      meaning: beatFxContext.slot
        ? `beat_fx_select_slot_${beatFxContext.slot}`
        : 'beat_fx_select',
      truthStatus: beatFxTruth && beatFxTruth.selectedSlot && beatFxTruth.selectedSlot.status || 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'beatfx.channel_select') {
    return createSemanticResolution({
      family: 'beat-fx',
      action: interactionAction === 'release' ? 'release' : 'select',
      meaning: beatFxContext.selectedChannel
        ? `beat_fx_channel_select_${beatFxContext.selectedChannel}`
        : 'beat_fx_channel_select',
      truthStatus: beatFxTruth && beatFxTruth.selectedChannel && beatFxTruth.selectedChannel.status || 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'beatfx.beat.left' || canonicalTarget === 'beatfx.beat.right') {
    return createSemanticResolution({
      family: 'beat-fx',
      action: interactionAction === 'release' ? 'release' : 'step',
      meaning: canonicalTarget.endsWith('.left')
        ? 'beat_fx_beat_left'
        : 'beat_fx_beat_right',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'beatfx.level_depth') {
    return createSemanticResolution({
      family: 'beat-fx',
      action: 'set',
      meaning: beatFxContext.slot
        ? `beat_fx_level_depth_slot_${beatFxContext.slot}`
        : 'beat_fx_level_depth',
      truthStatus: beatFxTruth && beatFxTruth.levelDepth && beatFxTruth.levelDepth.status || 'unknown',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'beatfx.on_off') {
    return createSemanticResolution({
      family: 'beat-fx',
      action: interactionAction === 'release' ? 'release' : 'toggle',
      meaning: beatFxContext.slot
        ? `beat_fx_on_off_slot_${beatFxContext.slot}`
        : 'beat_fx_on_off',
      truthStatus: beatFxTruth && beatFxTruth.enabled && beatFxTruth.enabled.status || 'unknown',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  if (canonicalTarget === 'mixer.channel.4.input_select') {
    return createSemanticResolution({
      family: 'channel4-selector',
      action: 'select',
      meaning: interactionAction === 'press' ? 'channel_4_input_sampler' : 'channel_4_input_deck4',
      truthStatus: 'official',
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
        allowMissingTarget: true,
      },
    });
  }

  if (/^mixer\.channel\.4\./i.test(canonicalTarget)) {
    const selectorTruth = deckContext && deckContext.channel4Input || null;
    const channel4Meaning = resolveChannel4Meaning(canonicalTarget, selectorTruth);
    return createSemanticResolution({
      family: channel4Meaning.family,
      action: interactionAction,
      meaning: channel4Meaning.meaning,
      truthStatus: channel4Meaning.truthStatus,
      deckContext,
      renderTargetHint: {
        canonicalTarget,
        mappingId: inputEvent && inputEvent.mappingId || null,
      },
    });
  }

  return createSemanticResolution({
    family: inferFamilyFromCanonical(canonicalTarget),
    action: interactionAction,
    meaning: genericMeaning(canonicalTarget),
    truthStatus: 'official',
    deckContext,
    renderTargetHint: {
      canonicalTarget,
      mappingId: inputEvent && inputEvent.mappingId || null,
    },
  });
}

export function resolveFlx6RenderTarget({ semantic, inputEvent, profile }) {
  const hint = semantic && semantic.renderTargetHint || {};
  const canonicalTarget = hint.canonicalTarget != null
    ? hint.canonicalTarget
    : inputEvent && inputEvent.canonicalTarget || null;
  const mappingId = hint.mappingId != null
    ? hint.mappingId
    : inputEvent && inputEvent.mappingId || null;

  if (hint.targetId) {
    const resolvedTargetId = resolveSurfaceTarget(hint.targetId, profile) || hint.targetId;
    return createRenderResolution({
      targetId: resolvedTargetId,
      canonicalTarget,
      mappingId,
      truthStatus: 'official',
      source: 'semantic-direct',
    });
  }

  const targetId = resolveRenderTarget(canonicalTarget, mappingId, profile);
  if (targetId) {
    return createRenderResolution({
      targetId,
      canonicalTarget,
      mappingId,
      truthStatus: 'official',
      source: 'profile-ui',
    });
  }

  if (hint.allowMissingTarget) {
    return createRenderResolution({
      targetId: null,
      canonicalTarget,
      mappingId,
      truthStatus: 'blocked',
      source: 'no-official-render-target',
    });
  }

  return createRenderResolution({
    targetId: null,
    canonicalTarget,
    mappingId,
    truthStatus: 'unknown',
    source: 'unresolved',
  });
}

export function buildFlx6DebugEvent({
  rawEvent,
  inputEvent,
  bindingSnapshot,
  stateBefore,
  stateAfter,
  semantic,
  render,
}) {
  const truthFocus = buildFocusedTruthFamilies({
    inputEvent,
    stateBefore,
    stateAfter,
    semantic,
    render,
  });
  return freeze({
    eventType: 'controller_debug_resolution',
    profileId: inputEvent && inputEvent.profileId || rawEvent && rawEvent.profileId || null,
    truthStatus: semantic && semantic.truthStatus || 'unknown',
    truthFocus,
    truthSummary: buildTruthSummary(truthFocus),
    rawLane: createRawLaneSnapshot(rawEvent, inputEvent),
    binding: bindingSnapshot,
    stateBefore,
    stateAfter,
    semantic,
    render,
  });
}

export function resolveFlx6InputEvent({
  rawEvent,
  inputEvent,
  controllerState,
  profile,
}) {
  const binding = lookupBinding(inputEvent && inputEvent.mappingId);
  const bindingSnapshot = createBindingSnapshot(binding, inputEvent);
  const stateBefore = snapshotControllerState(controllerState);

  applyControllerStateEvent(controllerState, inputEvent, {
    rawEvent,
    binding,
  });

  const stateAfter = snapshotControllerState(controllerState);
  const semantic = resolveFlx6SemanticEvent({
    rawEvent,
    inputEvent,
    binding,
    controllerState: stateAfter,
  });
  const render = resolveFlx6RenderTarget({
    semantic,
    inputEvent,
    profile,
  });
  const debug = buildFlx6DebugEvent({
    rawEvent,
    inputEvent,
    bindingSnapshot,
    stateBefore,
    stateAfter,
    semantic,
    render,
  });

  return freeze({
    ...inputEvent,
    matchedBinding: bindingSnapshot,
    semantic,
    render,
    debug,
    truthStatus: semantic.truthStatus,
    resolvedRenderTarget: render.targetId || null,
  });
}
