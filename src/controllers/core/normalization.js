export const normalizationStages = Object.freeze([
  'capture',
  'decode',
  'normalize',
  'route',
]);

/**
 * Future normalization context shared across transports and controller profiles.
 *
 * @typedef {Object} NormalizationContext
 * @property {string=} profileId
 * @property {string=} sourceId
 * @property {number=} timestamp
 */

/**
 * Result envelope for future controller-layer normalization.
 *
 * @typedef {Object} NormalizationResult
 * @property {import('./contracts.js').NormalizedInputEvent[]} events
 * @property {string[]=} warnings
 */

function freezeContext(context) {
  if (!context || typeof context !== 'object') return null;
  return Object.freeze({ ...context });
}

/**
 * Creates a device-facing input event from decoded transport data.
 *
 * @param {Object} details
 * @param {'midi'|'hid'|'virtual'} details.transport
 * @param {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} details.interaction
 * @param {number} details.channel
 * @param {number} details.code
 * @param {number} details.value
 * @param {number=} details.data1
 * @param {number=} details.data2
 * @param {string=} details.key
 * @param {string=} details.profileId
 * @param {string=} details.sourceId
 * @param {string=} details.deviceName
 * @param {number=} details.timestamp
 * @param {Uint8Array|number[]=} details.bytes
 * @returns {Readonly<import('./contracts.js').RawInputEvent>}
 */
export function createRawInputEvent(details) {
  const transport = details && details.transport || 'midi';
  const interaction = details && details.interaction || 'unknown';
  const timestamp = details && details.timestamp != null
    ? Number(details.timestamp)
    : Date.now();
  const bytes = Array.isArray(details && details.bytes)
    ? details.bytes.slice()
    : Array.from((details && details.bytes) || []);
  const packet = Object.freeze({
    transport,
    deviceName: details && details.deviceName,
    bytes,
    receivedAt: timestamp,
  });

  return Object.freeze({
    eventType: 'raw_input',
    transport,
    profileId: details && details.profileId,
    sourceId: details && details.sourceId,
    deviceName: details && details.deviceName,
    interaction,
    channel: Number(details && details.channel || 0),
    code: Number(details && details.code || 0),
    value: Number(details && details.value || 0),
    data1: details && details.data1 != null ? Number(details.data1) : undefined,
    data2: details && details.data2 != null ? Number(details.data2) : undefined,
    key: details && details.key,
    timestamp,
    packet,
  });
}

/**
 * Builds one app-facing event from a raw event plus an optional profile binding.
 *
 * @param {import('./contracts.js').RawInputEvent} rawEvent
 * @param {Object=} options
 * @param {import('../profiles/definition.js').InputControlBinding=} options.binding
 * @param {string=} options.profileId
 * @param {string=} options.sourceId
 * @param {string=} options.deviceName
 * @returns {Readonly<import('./contracts.js').NormalizedInputEvent>}
 */
export function createNormalizedInputEvent(rawEvent, options) {
  const binding = options && options.binding || null;
  const interaction = rawEvent && rawEvent.interaction || 'unknown';
  const channel = Number(rawEvent && rawEvent.channel || 0);
  const code = Number(rawEvent && rawEvent.code || 0);
  const data1 = rawEvent && rawEvent.data1 != null ? Number(rawEvent.data1) : code;
  const data2 = rawEvent && rawEvent.data2 != null ? Number(rawEvent.data2) : Number(rawEvent && rawEvent.value || 0);
  const mapped = !!binding;
  const base = {
    eventType: 'normalized_input',
    transport: rawEvent && rawEvent.transport || 'midi',
    profileId: options && options.profileId || rawEvent && rawEvent.profileId,
    sourceId: options && options.sourceId || rawEvent && rawEvent.sourceId,
    deviceName: options && options.deviceName || rawEvent && rawEvent.deviceName,
    mapped,
    canonicalTarget: mapped ? binding.canonical : null,
    mappingId: mapped ? (binding.id || null) : null,
    rawTarget: mapped ? (binding.rawTarget || null) : null,
    context: mapped ? freezeContext(binding.context) : null,
    valueShape: mapped ? binding.valueShape : undefined,
    interaction,
    channel,
    code,
    value: Number(rawEvent && rawEvent.value || 0),
    data1,
    data2,
    key: rawEvent && rawEvent.key,
    timestamp: rawEvent && rawEvent.timestamp,
    raw: rawEvent,
    type: interaction,
    ch: channel,
    d1: data1,
    d2: data2,
  };

  if (interaction === 'cc') {
    return Object.freeze({
      ...base,
      controller: code,
    });
  }

  return Object.freeze(base);
}

/**
 * Tests whether a profile-owned input binding matches a raw input event.
 *
 * @param {import('./contracts.js').RawInputEvent} rawEvent
 * @param {import('../profiles/definition.js').InputControlBinding} binding
 * @returns {boolean}
 */
export function matchesInputBinding(rawEvent, binding) {
  const raw = binding && binding.raw;
  if (!rawEvent || !raw) return false;
  if (raw.transport && raw.transport !== rawEvent.transport) return false;
  if (raw.kind && raw.kind !== rawEvent.interaction) return false;
  if (raw.channel != null && Number(raw.channel) !== Number(rawEvent.channel)) return false;
  if (raw.code != null && Number(raw.code) !== Number(rawEvent.code)) return false;
  if (raw.key && raw.key !== rawEvent.key) return false;
  return true;
}

/**
 * Returns all profile mappings that match a raw input event.
 *
 * @param {import('./contracts.js').RawInputEvent} rawEvent
 * @param {import('../profiles/definition.js').ControllerProfileDefinition=} profile
 * @returns {import('../profiles/definition.js').InputControlBinding[]}
 */
export function findProfileInputBindings(rawEvent, profile) {
  const bindings = Array.isArray(profile && profile.inputs && profile.inputs.mappings)
    ? profile.inputs.mappings
    : [];
  return bindings.filter((binding) => matchesInputBinding(rawEvent, binding));
}

/**
 * Normalizes a raw input event into the app's canonical control language while
 * preserving the legacy MIDI-like fields needed by the current runtime.
 *
 * @param {import('./contracts.js').RawInputEvent} rawEvent
 * @param {NormalizationContext & { profile?: import('../profiles/definition.js').ControllerProfileDefinition }=} context
 * @returns {NormalizationResult}
 */
export function normalizeRawInputEvent(rawEvent, context) {
  const profile = context && context.profile;
  const bindings = findProfileInputBindings(rawEvent, profile);
  const profileId = context && context.profileId || rawEvent && rawEvent.profileId || profile && profile.id;
  const sourceId = context && context.sourceId || rawEvent && rawEvent.sourceId;
  const deviceName = rawEvent && rawEvent.deviceName;

  if (!bindings.length) {
    return {
      events: [
        createNormalizedInputEvent(rawEvent, {
          profileId,
          sourceId,
          deviceName,
        }),
      ],
      warnings: profile ? [`unmapped:${rawEvent && rawEvent.key || 'unknown'}`] : [],
    };
  }

  return {
    events: bindings.map((binding) =>
      createNormalizedInputEvent(rawEvent, {
        binding,
        profileId,
        sourceId,
        deviceName,
      })
    ),
    warnings: [],
  };
}

/**
 * Placeholder entrypoint for future controller-layer normalization.
 * Existing behavior still lives in the current runtime modules.
 *
 * @param {import('./contracts.js').RawPacket} packet
 * @param {NormalizationContext=} context
 * @returns {NormalizationResult|null}
 */
export function normalizeCapturedPacket(packet, context) {
  void packet;
  void context;
  return null;
}
