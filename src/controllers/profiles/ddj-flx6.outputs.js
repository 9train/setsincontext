function freezeOutputBinding(binding) {
  const out = { ...binding };
  if (out.context) out.context = Object.freeze({ ...out.context });
  if (out.target) out.target = Object.freeze({ ...out.target });
  return Object.freeze(out);
}

function lightBinding({
  id,
  canonical,
  channel,
  code,
  context,
  note,
}) {
  return freezeOutputBinding({
    id,
    canonical,
    context,
    feedbackKind: 'light',
    target: {
      kind: 'light',
      channel,
      code,
      key: `noteon:${channel}:${code}`,
    },
    note,
  });
}

function normalizeDeckLayer(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'alternate') return 'alternate';
  if (text === 'main') return 'main';
  return null;
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
  const exact = candidates.filter((binding) =>
    normalizeDeckLayer(binding && binding.context && binding.context.deckLayer) === deckLayer
  );

  return exact.length ? exact : candidates;
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
        value: coerceLightValue(request.value),
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
