export const controllerEventKinds = Object.freeze([
  'cc',
  'noteon',
  'noteoff',
  'pitch',
  'unknown',
]);

export const controllerTransports = Object.freeze([
  'midi',
  'hid',
  'virtual',
]);

export const controllerRoles = Object.freeze([
  'host',
  'viewer',
  'unknown',
]);

/**
 * Raw packet captured from a transport before app-specific translation.
 *
 * @typedef {Object} RawPacket
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {string=} deviceName
 * @property {Uint8Array|number[]=} bytes
 * @property {unknown=} payload
 * @property {number=} receivedAt
 */

/**
 * Stable control address used by the app after translation.
 *
 * @typedef {Object} ControlLocator
 * @property {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} kind
 * @property {number} channel
 * @property {number} code
 * @property {string=} key
 */

/**
 * Device-facing event captured after transport decode and before canonical mapping.
 *
 * @typedef {Object} RawInputEvent
 * @property {'raw_input'} eventType
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {string=} profileId
 * @property {string=} sourceId
 * @property {string=} deviceName
 * @property {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} interaction
 * @property {number} channel
 * @property {number} code
 * @property {number} value
 * @property {number=} data1
 * @property {number=} data2
 * @property {string=} key
 * @property {number=} timestamp
 * @property {RawPacket=} packet
 */

/**
 * Canonical app-facing event emitted after profile-driven normalization.
 * Backward-compatible MIDI-like fields remain present so the current runtime can
 * adopt this shape incrementally.
 *
 * @typedef {Object} NormalizedInputEvent
 * @property {'normalized_input'} eventType
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {string=} profileId
 * @property {string=} sourceId
 * @property {string=} deviceName
 * @property {boolean} mapped
 * @property {import('./vocabulary.js').CanonicalControlId|null=} canonicalTarget
 * @property {string|null=} mappingId
 * @property {string|null=} rawTarget
 * @property {import('./vocabulary.js').ControlContext|null=} context
 * @property {('absolute'|'delta'|'binary')=} valueShape
 * @property {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} interaction
 * @property {number} channel
 * @property {number} code
 * @property {number} value
 * @property {number=} data1
 * @property {number=} data2
 * @property {string=} key
 * @property {number=} timestamp
 * @property {RawInputEvent=} raw
 * @property {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} type
 * @property {number} ch
 * @property {number=} d1
 * @property {number=} d2
 * @property {number=} controller
 */

/**
 * Shared controller event shape for board rendering, relay, learn, and feedback.
 *
 * @typedef {Object} ControllerEvent
 * @property {'cc'|'noteon'|'noteoff'|'pitch'|'unknown'} kind
 * @property {number} channel
 * @property {number} code
 * @property {number} value
 * @property {number=} data1
 * @property {number=} data2
 * @property {string=} sourceId
 * @property {string=} deviceName
 * @property {string=} key
 * @property {number=} timestamp
 * @property {RawPacket=} raw
 */

/**
 * Shared runtime hooks the future controller layer can call into.
 *
 * @typedef {Object} ControllerRuntime
 * @property {'host'|'viewer'|'unknown'=} role
 * @property {string=} room
 * @property {(event: ControllerEvent|NormalizedInputEvent) => void=} onEvent
 * @property {(status: string) => void=} onStatus
 */

/**
 * Shared controller feature flags.
 *
 * @typedef {Object} ControllerCapabilities
 * @property {boolean=} input
 * @property {boolean=} output
 * @property {boolean=} learn
 * @property {boolean=} remoteView
 */
