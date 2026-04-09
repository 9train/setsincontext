export const adapterConnectionStates = Object.freeze([
  'disconnected',
  'connecting',
  'connected',
]);

/**
 * Adapter execution context for transport-specific translators.
 *
 * @typedef {Object} AdapterContext
 * @property {import('../profiles/definition.js').ControllerProfileDefinition=} profile
 * @property {(message: string, detail?: unknown) => void=} log
 * @property {number=} now
 */

/**
 * Live device identity surfaced by a transport adapter.
 * This is the shape profile matching can use later without caring whether the
 * device comes from WebMIDI, WebHID, or another transport.
 *
 * @typedef {Object} AdapterDeviceInfo
 * @property {string} id
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {string=} name
 * @property {string=} manufacturer
 * @property {string=} model
 * @property {string=} inputName
 * @property {string=} outputName
 * @property {number=} vendorId
 * @property {number=} productId
 * @property {string=} profileId
 */

/**
 * Shared input payload emitted by live device adapters.
 * The adapter is responsible for capturing the raw event, then optionally
 * attaching normalized canonical events before the rest of the app consumes it.
 *
 * @typedef {Object} AdapterInputEnvelope
 * @property {import('../core/contracts.js').RawInputEvent} raw
 * @property {import('../core/contracts.js').NormalizedInputEvent[]} normalized
 * @property {AdapterDeviceInfo=} device
 * @property {import('../profiles/definition.js').ControllerProfileDefinition=} profile
 * @property {import('../core/state.js').ControllerState|null=} controllerState
 * @property {number=} timestamp
 */

/**
 * Callback registered by consumers interested in adapter input.
 *
 * @callback AdapterInputCallback
 * @param {AdapterInputEnvelope} envelope
 * @returns {void}
 */

/**
 * Shared lifecycle contract for transport-backed controller connections.
 * This sits one layer above pure packet translators and is the interface a
 * future WebMIDI or WebHID adapter should implement.
 *
 * @typedef {Object} DeviceAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {(context?: AdapterContext) => Promise<AdapterDeviceInfo|null>|AdapterDeviceInfo|null} connect
 * @property {(reason?: string) => Promise<void>|void} disconnect
 * @property {(callback: AdapterInputCallback) => (() => void)} onInput
 * @property {(messages: import('../output/feedback.js').OutputMessage[]) => Promise<boolean>|boolean} send
 * @property {() => AdapterDeviceInfo|null} getDeviceInfo
 */

/**
 * Hardware-edge translator contract.
 * Adapters accept raw packets and emit app-level controller events.
 *
 * @typedef {Object} InputAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {'midi'|'hid'|'virtual'} transport
 * @property {(packet: import('../core/contracts.js').RawPacket, context?: AdapterContext) => boolean=} accepts
 * @property {(packet: import('../core/contracts.js').RawPacket, context?: AdapterContext) => import('../core/contracts.js').ControllerEvent[]} translate
 */

/**
 * Tiny subscription hub used by concrete adapters so they can expose `onInput`
 * without reimplementing listener bookkeeping.
 *
 * @returns {{
 *   subscribe: (callback: AdapterInputCallback) => (() => void),
 *   emit: (envelope: AdapterInputEnvelope) => number,
 *   clear: () => void,
 *   size: () => number,
 * }}
 */
export function createAdapterInputHub() {
  const listeners = new Set();

  return {
    subscribe(callback) {
      if (typeof callback !== 'function') return function noop() {};
      listeners.add(callback);
      return function unsubscribe() {
        listeners.delete(callback);
      };
    },
    emit(envelope) {
      let delivered = 0;
      listeners.forEach((listener) => {
        try {
          listener(envelope);
          delivered += 1;
        } catch {}
      });
      return delivered;
    },
    clear() {
      listeners.clear();
    },
    size() {
      return listeners.size;
    },
  };
}

/**
 * Tiny placeholder builder so future adapters have a consistent shape.
 *
 * @param {string} id
 * @param {'midi'|'hid'|'virtual'} [transport='midi']
 * @returns {InputAdapter}
 */
export function createInputAdapterStub(id, transport = 'midi') {
  return {
    id,
    displayName: id,
    transport,
    accepts() {
      return false;
    },
    translate() {
      return [];
    },
  };
}

/**
 * Tiny placeholder builder for future transport-backed device adapters.
 * This does not implement any hardware behavior yet; it only locks in the
 * shared lifecycle and callback shape for the next adapter step.
 *
 * @param {string} id
 * @param {'midi'|'hid'|'virtual'} [transport='midi']
 * @returns {DeviceAdapter}
 */
export function createDeviceAdapterStub(id, transport = 'midi') {
  const inputHub = createAdapterInputHub();
  let deviceInfo = null;

  return {
    id,
    displayName: id,
    transport,
    connect() {
      return deviceInfo;
    },
    disconnect() {},
    onInput(callback) {
      return inputHub.subscribe(callback);
    },
    send(messages) {
      void messages;
      return false;
    },
    getDeviceInfo() {
      return deviceInfo;
    },
  };
}
