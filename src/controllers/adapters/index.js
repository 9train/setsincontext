import { WEB_MIDI_ADAPTER_ID } from './web-midi.js';

export * from './boundary.js';
export * from './web-midi.js';

export const officialControllerAdapterId = WEB_MIDI_ADAPTER_ID;

export const controllerAdapters = Object.freeze([
  WEB_MIDI_ADAPTER_ID,
]);
