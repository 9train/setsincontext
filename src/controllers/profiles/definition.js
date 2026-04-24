/**
 * Static asset pointers owned by a controller profile.
 *
 * @typedef {Object} ProfileAssets
 * @property {string=} boardSvgPath
 * @property {string=} defaultMapPath
 * @property {string=} feelConfigPath
 */

/**
 * Device matching hints for selecting a profile.
 *
 * @typedef {Object} DeviceMatcher
 * @property {string[]=} names
 * @property {RegExp[]=} namePatterns
 * @property {string[]=} manufacturers
 * @property {RegExp[]=} manufacturerPatterns
 * @property {string[]=} inputNames
 * @property {string[]=} outputNames
 * @property {number[]=} vendorIds
 * @property {number[]=} productIds
 * @property {('midi'|'hid'|'virtual')[]=} transports
 */

/**
 * Optional feature summary advertised by a controller profile.
 * This extends the shared boolean flags with light structural hints.
 *
 * @typedef {Object} ProfileCapabilities
 * @property {boolean=} input
 * @property {boolean=} output
 * @property {boolean=} learn
 * @property {boolean=} remoteView
 * @property {('midi'|'hid'|'virtual')[]=} transports
 * @property {('left'|'right')[]=} deckSides
 * @property {number[]=} mixerChannels
 * @property {number[]=} padSlots
 * @property {number[]=} hotcueSlots
 * @property {number[]=} samplerSlots
 * @property {number[]=} fxUnits
 */

/**
 * Optional control-group hints a profile can expose without embedding runtime behavior.
 *
 * @typedef {Object} ProfileControlHints
 * @property {string[]=} jogTargets
 * @property {string[]=} linearTargets
 * @property {string[]=} buttonPrefixes
  * @property {import('../core/vocabulary.js').PadMode[]=} padModes
 * @property {string[]=} deckLayers
 */

/**
 * Runtime defaults that the future controller layer can use during boot.
 *
 * @typedef {Object} ProfileDefaults
 * @property {string=} preferredInputName
 * @property {string=} preferredOutputName
  * @property {string=} adapterId
  * @property {string=} outputId
 * @property {import('../core/vocabulary.js').PadMode=} defaultPadMode
 * @property {string=} defaultDeckLayer
 */

/**
 * Optional raw-name bridge for migrating hardware ids and older app target ids
 * into canonical control ids.
 *
 * @typedef {Object} ProfileAliases
 * @property {import('../core/aliases.js').CanonicalAliasMap=} controls
 * @property {import('../core/aliases.js').CanonicalAliasMap=} surfaceTargets
 */

/**
 * Profile-owned renderer/editor target descriptor.
 *
 * @typedef {Object} ProfileUiTarget
 * @property {string} targetId
 * @property {import('../core/vocabulary.js').CanonicalControlId=} canonicalTarget
 * @property {string=} label
 * @property {string[]=} aliases
 * @property {string=} renderKind
 */

/**
 * One profile-owned calibration hint for board surface motion.
 *
 * @typedef {Object} ProfileUiCalibrationHint
 * @property {string} targetId
 * @property {'x'|'y'} axis
 * @property {string[]=} railIds
 */

/**
 * Profile-owned renderer/edit-mode metadata.
 *
 * @typedef {Object} ProfileUiDefinition
 * @property {Record<string, string>=} renderTargets
 * @property {Record<string, string>=} surfaceAliases
 * @property {ProfileUiTarget[]=} editorTargets
 * @property {{ className: string, match: RegExp }[]=} groupRules
 * @property {ProfileUiCalibrationHint[]=} calibrationHints
 */

/**
 * Raw input address that can be bound into the canonical vocabulary.
 *
 * @typedef {Object} RawInputLocator
 * @property {('midi'|'hid'|'virtual')=} transport
 * @property {('cc'|'noteon'|'noteoff'|'pitch'|'unknown')=} kind
 * @property {number=} channel
 * @property {number=} code
 * @property {string=} key
 * @property {string=} group
 */

/**
 * Optional controller-state gates for one binding.
 *
 * @typedef {Object} InputBindingActivation
 * @property {'left'|'right'=} side
 * @property {boolean=} jogTouch
 */

/**
 * Declarative bridge from a hardware-side address into one canonical control id.
 *
 * @typedef {Object} InputControlFeelHints
 * @property {string=} instanceId
 * @property {string=} configKey
 * @property {('absolute'|'relative'|'jog')=} mode
 * @property {('relative7'|'twos-complement-7'|'signed-bit-7')=} deltaCodec
 * @property {'left'|'right'=} side
 * @property {number=} wheelResolution
 * @property {{ rearmOnDeckLayer?: boolean, resetOnShiftChange?: boolean }=} dispatcher
 */

/**
 * Declarative bridge from a hardware-side address into one canonical control id.
 *
 * @typedef {Object} InputControlBinding
 * @property {string=} id
 * @property {RawInputLocator=} raw
 * @property {string=} rawTarget
 * @property {import('../core/vocabulary.js').CanonicalControlId} canonical
 * @property {import('../core/vocabulary.js').ControlContext=} context
 * @property {InputBindingActivation=} activation
  * @property {('absolute'|'delta'|'binary')=} valueShape
 * @property {InputControlFeelHints=} feel
 * @property {boolean=} inverted
 * @property {string=} note
 */

/**
 * Optional normalization hints attached to profile-owned input bindings.
 *
 * @typedef {Object} InputNormalizationHints
 * @property {import('../core/vocabulary.js').CanonicalControlId[]=} relative
 * @property {import('../core/vocabulary.js').CanonicalControlId[]=} touch
 * @property {import('../core/vocabulary.js').CanonicalControlId[]=} pickup
 */

/**
 * Input-side profile section. This is the future home for raw mapping data.
 *
 * @typedef {Object} ProfileInputs
 * @property {string=} adapterId
 * @property {('midi'|'hid'|'virtual')[]=} transports
 * @property {InputControlBinding[]=} mappings
 * @property {InputNormalizationHints=} normalization
 */

/**
 * Canonical output-to-hardware bridge for LEDs or other controller feedback later on.
 *
 * @typedef {Object} OutputControlBinding
 * @property {string=} id
 * @property {import('../core/vocabulary.js').CanonicalControlId} canonical
 * @property {import('../core/vocabulary.js').ControlContext=} context
 * @property {import('../output/feedback.js').FeedbackTarget} target
 * @property {('light'|'value'|'meter')=} feedbackKind
 * @property {boolean=} binary
 * @property {{ min?: number, max?: number }=} valueRange
 * @property {string=} note
 */

/**
 * Output-side profile section. This stays declarative until hardware feedback is wired in.
 *
 * @typedef {Object} ProfileOutputs
 * @property {string=} outputId
 * @property {('midi'|'hid'|'virtual')[]=} transports
 * @property {OutputControlBinding[]=} bindings
 */

/**
 * Named placeholder for future profile-owned runtime behavior.
 *
 * @typedef {Object} RuntimeHookReference
 * @property {string} id
 * @property {string=} modulePath
 * @property {string=} exportName
 * @property {string=} summary
 */

/**
 * One declarative runtime step reserved for init or keepalive flows later on.
 *
 * @typedef {Object} RuntimeStepDefinition
 * @property {string=} id
 * @property {('feedback'|'delay'|'hook')} type
 * @property {import('../output/feedback.js').FeedbackMessage=} message
 * @property {number=} delayMs
 * @property {RuntimeHookReference=} hook
 */

/**
 * Startup behavior reserved by a controller profile.
 *
 * @typedef {Object} ProfileInitDefinition
 * @property {boolean=} enabled
 * @property {RuntimeStepDefinition[]=} steps
 */

/**
 * Heartbeat/refresh behavior reserved by a controller profile.
 *
 * @typedef {Object} ProfileKeepaliveDefinition
 * @property {boolean=} enabled
 * @property {number=} intervalMs
 * @property {boolean=} suspendWhenIdle
 * @property {RuntimeStepDefinition[]=} steps
 */

/**
 * Optional named hook slots the future runtime can look up.
 *
 * @typedef {Object} ProfileRuntimeHooks
 * @property {RuntimeHookReference=} init
 * @property {RuntimeHookReference=} keepalive
 * @property {RuntimeHookReference=} input
 * @property {RuntimeHookReference=} output
 * @property {RuntimeHookReference=} shutdown
 * @property {RuntimeHookReference=} learn
 */

/**
 * Runtime-oriented profile section.
 *
 * @typedef {Object} ProfileRuntime
 * @property {ProfileInitDefinition=} init
 * @property {ProfileKeepaliveDefinition=} keepalive
 * @property {ProfileRuntimeHooks=} hooks
 */

/**
 * Optional controller-state hints that can grow later without forcing stateful logic now.
 *
 * @typedef {Object} ProfileStateHints
 * @property {import('../core/vocabulary.js').PadMode[]=} padModes
 * @property {string[]=} deckLayers
 * @property {import('../core/vocabulary.js').PadMode=} defaultPadMode
 * @property {string=} defaultDeckLayer
 */

/**
 * Structured controller profile format for this app.
 *
 * @typedef {Object} ControllerProfile
 * @property {string} id
 * @property {string} displayName
 * @property {string=} manufacturer
 * @property {string=} model
 * @property {string=} profileVersion
 * @property {string=} summary
 * @property {DeviceMatcher=} match
 * @property {ProfileAssets=} assets
 * @property {ProfileCapabilities=} capabilities
 * @property {ProfileControlHints=} controlHints
 * @property {ProfileDefaults=} defaults
 * @property {ProfileStateHints=} state
 * @property {ProfileAliases=} aliases
 * @property {ProfileUiDefinition=} ui
 * @property {ProfileInputs=} inputs
 * @property {ProfileOutputs=} outputs
 * @property {ProfileRuntime=} runtime
 * @property {string=} notes
 */

/**
 * Backward-compatible alias for existing imports.
 *
 * @typedef {ControllerProfile} ControllerProfileDefinition
 */

/**
 * Freezes metadata so profile modules stay declarative.
 *
 * @param {ControllerProfile} profile
 * @returns {Readonly<ControllerProfile>}
 */
export function defineControllerProfile(profile) {
  return Object.freeze(profile);
}

export const defineProfile = defineControllerProfile;
