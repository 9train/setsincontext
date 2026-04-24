export const feedbackKinds = Object.freeze([
  'light',
  'value',
  'meter',
  'display',
  'motor',
  'unknown',
]);

/**
 * Future hardware feedback target.
 *
 * @typedef {Object} FeedbackTarget
 * @property {'light'|'display'|'motor'|'unknown'} kind
 * @property {number=} channel
 * @property {number=} code
 * @property {string=} group
 * @property {string=} key
 */

/**
 * App-owned outbound output request. This can already point at a concrete
 * hardware target, or it can stay canonical and let a profile hook resolve it.
 *
 * @typedef {Object} OutputMessage
 * @property {FeedbackTarget=} target
 * @property {import('../core/vocabulary.js').CanonicalControlId=} canonicalTarget
 * @property {import('../core/vocabulary.js').ControlContext=} context
 * @property {number|string|boolean} value
 * @property {('light'|'value'|'meter'|'display'|'motor'|'unknown')=} outputKind
 * @property {string=} bindingId
 * @property {number=} timestamp
 * @property {string=} profileId
 */

/**
 * Concrete outbound feedback message sent to a device after profile resolution.
 *
 * @typedef {OutputMessage} FeedbackMessage
 */

/**
 * Output driver contract for LEDs or other controller feedback later on.
 *
 * @typedef {Object} OutputAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {(profileId?: string) => boolean=} isAvailable
 * @property {(message: OutputMessage) => boolean} send
 */

/**
 * Returns true when a message already points at a concrete hardware target.
 *
 * @param {OutputMessage=} message
 * @returns {boolean}
 */
export function isTargetedOutputMessage(message) {
  return !!(message && message.target && typeof message.target === 'object');
}

/**
 * Returns true when a message is still expressed in canonical app language.
 *
 * @param {OutputMessage=} message
 * @returns {boolean}
 */
export function isCanonicalOutputMessage(message) {
  return !!(message && message.canonicalTarget);
}

/**
 * Tiny placeholder builder for future output drivers.
 *
 * @param {string} id
 * @returns {OutputAdapter}
 */
export function createOutputAdapterStub(id) {
  return {
    id,
    displayName: id,
    isAvailable() {
      return false;
    },
    send() {
      return false;
    },
  };
}
