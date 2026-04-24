// Official controller surface for the supported app lane:
// host.html -> src/midi.js -> browser WebMIDI -> src/controllers -> DDJ-FLX6.

import { WEB_MIDI_ADAPTER_ID } from './adapters/web-midi.js';
import { officialDemoControllerProfile } from './profiles/index.js';

export * from './core/index.js';
export * from './adapters/index.js';
export * from './profiles/index.js';
export * from './output/index.js';
export * from './learn/index.js';

export const officialControllerRuntimePath = Object.freeze({
  hostEntrypoint: 'host.html',
  viewerEntrypoint: 'viewer.html',
  transport: 'browser-web-midi',
  adapterId: WEB_MIDI_ADAPTER_ID,
  controllerRoot: 'src/controllers',
  demoProfileId: officialDemoControllerProfile.id,
});

export const controllerLayerVersion = '0.1.0';
