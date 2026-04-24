// Shared controller contracts for the official runtime lane:
// host.html -> src/midi.js -> browser WebMIDI -> src/controllers -> DDJ-FLX6.
// HID and virtual transports stay available for compatibility and experiments,
// but they are not the supported default app path today.

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
 * Explicit truth descriptor used by the rewritten middle architecture.
 *
 * @typedef {Object} ControllerTruthValue
 * @property {unknown=} value
 * @property {'official'|'inferred'|'unknown'|'blocked'} status
 * @property {string} source
 * @property {number|null=} observedAt
 * @property {string|null=} note
 * @property {Object|null=} meta
 */

/**
 * One matched official binding snapshot carried forward with the event.
 *
 * @typedef {Object} MatchedBindingSnapshot
 * @property {string|null=} id
 * @property {string|null=} label
 * @property {string|null=} canonicalTarget
 * @property {string|null=} rawTarget
 * @property {Object|null=} context
 * @property {('absolute'|'delta'|'binary')|undefined=} valueShape
 * @property {string|null=} note
 */

/**
 * Semantic meaning resolved after controller state updates.
 *
 * @typedef {Object} SemanticResolution
 * @property {string} family
 * @property {string} action
 * @property {string} meaning
 * @property {'official'|'inferred'|'unknown'|'blocked'} truthStatus
 * @property {{ surfaceSide?: 'left'|'right'|null, owner?: { deckNumber?: number|null, deckLayer?: string|null, status?: string, source?: string, pairedDecks?: number[] }, binding?: { deckNumber?: number|null, deckLayer?: string|null }, padMode?: ControllerTruthValue, vinylMode?: ControllerTruthValue, vinylModeButton?: ControllerTruthValue, jogCutter?: ControllerTruthValue, jogCutterButton?: ControllerTruthValue, channel4Input?: ControllerTruthValue }=} deckContext
 * @property {{ canonicalTarget?: string|null, mappingId?: string|null, targetId?: string|null, allowMissingTarget?: boolean }=} renderTargetHint
 */

/**
 * Explicit render-target resolution kept separate from semantic meaning.
 *
 * @typedef {Object} RenderTargetResolution
 * @property {string|null=} targetId
 * @property {string|null=} canonicalTarget
 * @property {string|null=} mappingId
 * @property {'official'|'inferred'|'unknown'|'blocked'} truthStatus
 * @property {string} source
 */

/**
 * Debug payload that carries the full truth chain forward.
 *
 * @typedef {Object} ControllerDebugEvent
 * @property {'controller_debug_resolution'} eventType
 * @property {string|null=} profileId
 * @property {'official'|'inferred'|'unknown'|'blocked'} truthStatus
 * @property {{ deckOwnership?: { side?: string|null, binding?: { deckNumber?: number|null, deckLayer?: string|null }, compatibilityDeckLayerBefore?: string|null, compatibilityDeckLayerAfter?: string|null, before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }|null, padMode?: { side?: string|null, compatibilityValueBefore?: string|null, compatibilityValueAfter?: string|null, before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }|null, vinylMode?: { side?: string|null, lane?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, mode?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, button?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null } }|null, jogCutter?: { side?: string|null, enabled?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, button?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null } }|null, channel4Selector?: { targetId?: string|null, before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }|null, beatFx?: { unit?: number|null, slotContext?: number|null, channelContext?: string|null, targetId?: string|null, compatibilityBefore?: { selectedSlot?: number|null, selectedChannel?: string|null, enabled?: boolean|null, levelDepth?: number|null }, compatibilityAfter?: { selectedSlot?: number|null, selectedChannel?: string|null, enabled?: boolean|null, levelDepth?: number|null }, selectedSlot?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, selectedChannel?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, enabled?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null }, levelDepth?: { before?: ControllerTruthValue|null, after?: ControllerTruthValue|null } }|null }=} truthFocus
 * @property {string|null=} truthSummary
 * @property {{ key?: string, interaction?: string, channel?: number, code?: number, value?: number, timestamp?: number, transport?: string, bytes?: number[] }=} rawLane
 * @property {MatchedBindingSnapshot|null=} binding
 * @property {Object|null=} stateBefore
 * @property {Object|null=} stateAfter
 * @property {SemanticResolution|null=} semantic
 * @property {RenderTargetResolution|null=} render
 */

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
 * @property {number=} compatValue
 * @property {number=} semanticValue
 * @property {{ applied?: boolean, accepted?: boolean, blocked?: boolean, mode?: string, instanceId?: string, configKey?: string, value?: number, delta?: number, motion?: { vel?: number, pos?: number } }|null=} feel
 * @property {MatchedBindingSnapshot|null=} matchedBinding
 * @property {SemanticResolution|null=} semantic
 * @property {RenderTargetResolution|null=} render
 * @property {ControllerDebugEvent|null=} debug
 * @property {'official'|'inferred'|'unknown'|'blocked'=} truthStatus
 * @property {string|null=} resolvedRenderTarget
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
