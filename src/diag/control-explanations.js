import { humanizeIdentifier } from '../event-log-snapshot.js';

export const UNKNOWN_CONTROL_EXPLANATION = 'This control is not fully explained yet. Advanced view can show the technical signal.';

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function formatDeckSide(side) {
  const text = String(side || '').trim().toLowerCase();
  if (text === 'left') return 'Left';
  if (text === 'right') return 'Right';
  return 'Unknown';
}

function formatDeckLocation(side, section) {
  return `${formatDeckSide(side)} deck, ${section}.`;
}

function formatMixerLocation(channel, section = 'strip') {
  return `Mixer, channel ${Number(channel)} ${section}.`;
}

function formatModeName(mode) {
  const text = humanizeIdentifier(mode);
  return text === 'unknown' ? 'Mode' : text.toUpperCase();
}

function formatFallbackControlName(label, targetId, renderKind) {
  const rawLabel = normalizeText(label)
    || normalizeText(targetId)
    || normalizeText(renderKind)
    || 'Unknown control';
  return rawLabel
    .replace(/^(Left|Right)\s+/i, '')
    .replace(/^Channel\s+\d+\s+/i, '')
    .replace(/\s+Mode$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function known(controlName, whatDoesItDo, location) {
  return Object.freeze({
    known: true,
    controlName,
    whatDoesItDo,
    location,
  });
}

function unknown({ label, targetId, renderKind, location = null } = {}) {
  return Object.freeze({
    known: false,
    controlName: formatFallbackControlName(label, targetId, renderKind),
    whatDoesItDo: UNKNOWN_CONTROL_EXPLANATION,
    location,
  });
}

export function buildPlainEnglishControlExplanation({
  canonicalTarget = '',
  targetId = '',
  label = '',
  renderKind = '',
} = {}) {
  const canonical = normalizeText(canonicalTarget);
  if (!canonical) return unknown({ label, targetId, renderKind });

  let match = canonical.match(/^deck\.(left|right)\.transport\.play$/);
  if (match) {
    return known(
      'PLAY / PAUSE',
      'Starts or stops the song on this deck.',
      formatDeckLocation(match[1], 'transport section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.transport\.cue$/);
  if (match) {
    return known(
      'CUE',
      'Jumps back to a saved starting point. DJs use it to prepare where a track starts.',
      formatDeckLocation(match[1], 'transport section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.transport\.sync$/);
  if (match) {
    return known(
      'BEAT SYNC',
      'Matches this deck to the timing of the other deck.',
      formatDeckLocation(match[1], 'transport section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.transport\.master$/);
  if (match) {
    return known(
      'MASTER',
      'Makes this deck the tempo master that other synced decks can follow.',
      formatDeckLocation(match[1], 'transport section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.transport\.layer$/);
  if (match) {
    return known(
      'DECK LAYER',
      'Switches this side of the controller between its deck layers.',
      formatDeckLocation(match[1], 'deck layer controls'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.transport\.load(?:\.[a-z_]+)?$/);
  if (match) {
    return known(
      'LOAD',
      'Loads the selected track to this deck.',
      formatDeckLocation(match[1], 'browse and load section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.tempo\.fader$/);
  if (match) {
    return known(
      'TEMPO FADER',
      'Speeds the track up or down so you can match timing.',
      formatDeckLocation(match[1], 'tempo fader lane'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.jog\.(motion|touch)$/);
  if (match) {
    return known(
      'JOG WHEEL',
      'Lets you move the track by hand. In Vinyl mode, the top acts more like scratching.',
      formatDeckLocation(match[1], 'jog wheel area'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.jog\.cutter$/);
  if (match) {
    return known(
      'JOG CUTTER',
      'Turns on a scratch-helper mode using the jog wheel.',
      formatDeckLocation(match[1], 'jog controls'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.jog\.vinyl_mode$/);
  if (match) {
    return known(
      'VINYL MODE',
      'Changes the jog wheel so the top behaves more like touching a record.',
      formatDeckLocation(match[1], 'jog controls'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.loop\.in$/);
  if (match) {
    return known(
      'LOOP IN',
      'Sets the starting point of a loop.',
      formatDeckLocation(match[1], 'loop section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.loop\.out$/);
  if (match) {
    return known(
      'LOOP OUT',
      'Sets the ending point of a loop.',
      formatDeckLocation(match[1], 'loop section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.loop\.call\.backward$/);
  if (match) {
    return known(
      'CUE / LOOP CALL LEFT',
      'Moves backward through saved cues or loops on this deck.',
      formatDeckLocation(match[1], 'loop section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.loop\.call\.forward$/);
  if (match) {
    return known(
      'CUE / LOOP CALL RIGHT',
      'Moves forward through saved cues or loops on this deck.',
      formatDeckLocation(match[1], 'loop section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.loop\.memory$/);
  if (match) {
    return known(
      'CUE / LOOP MEMORY',
      'Stores or recalls saved cue and loop memory points.',
      formatDeckLocation(match[1], 'loop section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.pad_mode\.([a-z_]+)$/);
  if (match) {
    return known(
      `${formatModeName(match[2])} MODE`,
      'Chooses what the performance pads do on this deck.',
      formatDeckLocation(match[1], 'pad mode buttons'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.pad\.(\d+)$/);
  if (match) {
    return known(
      `PAD ${Number(match[2])}`,
      'Triggers the current pad action for this slot on this deck.',
      formatDeckLocation(match[1], 'performance pads'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.fx\.quick$/);
  if (match) {
    return known(
      'MERGE FX',
      'Changes how much Merge FX is applied on this deck.',
      formatDeckLocation(match[1], 'Merge FX section'),
    );
  }

  match = canonical.match(/^deck\.(left|right)\.fx\.quick_select$/);
  if (match) {
    return known(
      'MERGE FX SELECT',
      'Chooses the Merge FX preset for this deck.',
      formatDeckLocation(match[1], 'Merge FX section'),
    );
  }

  match = canonical.match(/^mixer\.crossfader$/);
  if (match) {
    return known(
      'CROSSFADER',
      'Blends between the left and right sides of the mixer.',
      'Mixer, crossfader section.',
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.fader$/);
  if (match) {
    return known(
      'CHANNEL FADER',
      'Controls how loud this channel is in the mix.',
      formatMixerLocation(match[1], 'fader lane'),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.gain$/);
  if (match) {
    return known(
      'TRIM',
      'Sets the input loudness before the channel fader.',
      formatMixerLocation(match[1]),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.eq\.high$/);
  if (match) {
    return known(
      'EQ HIGH',
      'Controls the high frequencies, like hats and bright sounds.',
      formatMixerLocation(match[1], 'EQ section'),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.eq\.mid$/);
  if (match) {
    return known(
      'EQ MID',
      'Controls the middle frequencies, like vocals and many instruments.',
      formatMixerLocation(match[1], 'EQ section'),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.eq\.low$/);
  if (match) {
    return known(
      'EQ LOW',
      'Controls the bass and low-end weight.',
      formatMixerLocation(match[1], 'EQ section'),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.filter$/);
  if (match) {
    return known(
      'FILTER',
      'Changes the tone of this channel. Left sounds darker or muffled. Right sounds brighter or thinner. Center is normal.',
      formatMixerLocation(match[1], 'filter section'),
    );
  }

  match = canonical.match(/^mixer\.channel\.(\d+)\.cue$/);
  if (match) {
    return known(
      'HEADPHONE CUE',
      'Sends this channel to the DJ headphones cue mix.',
      formatMixerLocation(match[1]),
    );
  }

  match = canonical.match(/^mixer\.channel\.4\.input_select$/);
  if (match) {
    return known(
      'CH4 INPUT SELECT',
      'Chooses whether channel 4 listens to Deck 4 or the sampler input.',
      formatMixerLocation(4),
    );
  }

  match = canonical.match(/^beatfx\.select$/);
  if (match) {
    return known(
      'BEAT FX SELECT',
      'Chooses which Beat FX effect is active.',
      'Mixer, Beat FX section.',
    );
  }

  match = canonical.match(/^beatfx\.channel_select$/);
  if (match) {
    return known(
      'BEAT FX CHANNEL SELECT',
      'Chooses which channel or master output the Beat FX section controls.',
      'Mixer, Beat FX section.',
    );
  }

  match = canonical.match(/^beatfx\.beat\.(left|right)$/);
  if (match) {
    return known(
      match[1] === 'left' ? 'BEAT FX BEAT LEFT' : 'BEAT FX BEAT RIGHT',
      'Changes the Beat FX timing amount.',
      'Mixer, Beat FX section.',
    );
  }

  match = canonical.match(/^beatfx\.level_depth$/);
  if (match) {
    return known(
      'BEAT FX LEVEL / DEPTH',
      'Changes how strong the Beat FX effect sounds.',
      'Mixer, Beat FX section.',
    );
  }

  match = canonical.match(/^beatfx\.on_off$/);
  if (match) {
    return known(
      'BEAT FX ON / OFF',
      'Turns the Beat FX effect on or off.',
      'Mixer, Beat FX section.',
    );
  }

  return unknown({
    label,
    targetId,
    renderKind,
  });
}
