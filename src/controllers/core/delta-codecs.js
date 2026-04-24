function toMidi7(value) {
  return Number(value) & 0x7F;
}

export function decodeRelative7(value) {
  const numeric = toMidi7(value);
  if (numeric === 0 || numeric === 64) return 0;
  if (numeric > 64) return numeric - 64;
  return -(64 - numeric);
}

export function decodeTwosComplement7(value) {
  const numeric = toMidi7(value);
  return numeric > 63 ? numeric - 128 : numeric;
}

export function decodeSignedBit7(value) {
  const numeric = toMidi7(value);
  const magnitude = numeric & 0x3F;
  if (!magnitude) return 0;
  return (numeric & 0x40) ? -magnitude : magnitude;
}
