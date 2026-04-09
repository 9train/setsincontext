import { defineControllerProfile } from './definition.js';
import { flx6CanonicalAliases } from './ddj-flx6.aliases.js';
import {
  flx6InputMappings,
  flx6InputNormalization,
  flx6MappedRawTargets,
} from './ddj-flx6.mappings.js';
import {
  flx6RuntimeHooks,
} from './ddj-flx6.script.js';
import {
  flx6OutputBindings,
  flx6OutputTargets,
} from './ddj-flx6.outputs.js';

export const flx6Profile = defineControllerProfile({
  id: 'pioneer-ddj-flx6',
  displayName: 'Pioneer DDJ-FLX6',
  manufacturer: 'Pioneer DJ',
  model: 'DDJ-FLX6',
  profileVersion: 'draft-1',
  summary: 'First controller-profile entry for the DDJ-FLX6 using the new controller layer with prioritized input mappings and a small real LED output pass for transport buttons.',
  match: {
    names: ['DDJ-FLX6', 'Pioneer DDJ-FLX6'],
    namePatterns: [/DDJ[-\s]?FLX6/i, /Pioneer.*FLX6/i],
    manufacturers: ['Pioneer DJ', 'AlphaTheta'],
    manufacturerPatterns: [/Pioneer/i, /AlphaTheta/i],
    inputNames: ['DDJ-FLX6'],
    outputNames: ['DDJ-FLX6'],
    transports: ['midi'],
  },
  assets: {
    boardSvgPath: '/assets/board.svg',
    defaultMapPath: '/flx6_map.json',
    feelConfigPath: '/maps/flx6-feel.json',
  },
  capabilities: {
    input: true,
    output: true,
    learn: true,
    remoteView: true,
    transports: ['midi'],
    deckSides: ['left', 'right'],
    mixerChannels: [1, 2, 3, 4],
    padSlots: [1, 2, 3, 4, 5, 6, 7, 8],
    hotcueSlots: [1, 2, 3, 4, 5, 6, 7, 8],
    samplerSlots: [1, 2, 3, 4, 5, 6, 7, 8],
    fxUnits: [1, 2],
  },
  controlHints: {
    jogTargets: ['jog_L', 'jog_R'],
    linearTargets: [
      'slider_ch1',
      'slider_ch2',
      'slider_ch3',
      'slider_ch4',
      'slider_TEMPO_L',
      'slider_TEMPO_R',
      'xfader_slider',
    ],
    buttonPrefixes: [
      'play_',
      'cue_',
      'pad_',
      'hotcue_',
      'padfx_',
      'sampler_',
      'beatjump_',
      'beatsync_',
    ],
    padModes: ['hotcue', 'sampler', 'beatjump', 'fx'],
    deckLayers: ['main', 'alternate'],
  },
  defaults: {
    preferredInputName: 'DDJ-FLX6',
    preferredOutputName: 'DDJ-FLX6',
    adapterId: 'generic-web-midi',
    outputId: 'generic-web-midi',
    defaultPadMode: 'hotcue',
    defaultDeckLayer: 'main',
  },
  state: {
    padModes: ['hotcue', 'sampler', 'beatjump', 'fx'],
    deckLayers: ['main', 'alternate'],
    defaultPadMode: 'hotcue',
    defaultDeckLayer: 'main',
  },
  aliases: {
    controls: flx6CanonicalAliases,
    surfaceTargets: flx6CanonicalAliases,
  },
  inputs: {
    adapterId: 'generic-web-midi',
    transports: ['midi'],
    mappings: flx6InputMappings,
    normalization: flx6InputNormalization,
  },
  outputs: {
    outputId: 'generic-web-midi',
    transports: ['midi'],
    bindings: flx6OutputBindings,
  },
  runtime: {
    init: {
      steps: [],
    },
    keepalive: {
      enabled: false,
      steps: [],
    },
    hooks: flx6RuntimeHooks,
  },
  notes: `This is the first real FLX6 profile in the new controller layer. It carries canonical aliases, prioritized raw input mappings, and the first profile-driven LED output bindings without taking over the legacy runtime yet. Raw targets currently covered here: ${flx6MappedRawTargets.join(', ')}. Output targets currently covered here: ${flx6OutputTargets.join(', ')}.`,
});

export function matchesFlx6InputDevice(deviceName, transport = 'midi') {
  const match = flx6Profile.match || {};
  const name = String(deviceName || '');
  const normalizedName = name.trim().toLowerCase();

  if (Array.isArray(match.transports) && match.transports.length && !match.transports.includes(transport)) {
    return false;
  }

  if (Array.isArray(match.names) && match.names.some((entry) => String(entry || '').trim().toLowerCase() === normalizedName)) {
    return true;
  }

  if (Array.isArray(match.inputNames) && match.inputNames.some((entry) => String(entry || '').trim().toLowerCase() === normalizedName)) {
    return true;
  }

  if (Array.isArray(match.namePatterns) && match.namePatterns.some((pattern) => pattern && pattern.test && pattern.test(name))) {
    return true;
  }

  return false;
}

export default flx6Profile;
