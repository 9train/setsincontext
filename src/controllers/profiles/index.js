export * from './definition.js';
export * from './ddj-flx6.aliases.js';
export * from './ddj-flx6.mappings.js';
export * from './ddj-flx6.outputs.js';
export * from './ddj-flx6.script.js';
export * from './ddj-flx6.js';

import { flx6Profile } from './ddj-flx6.js';

export const controllerProfiles = Object.freeze([
  flx6Profile,
]);

function normalizeMatchText(value) {
  let text = String(value || '');
  try { text = text.normalize('NFKC'); } catch (error) {}
  return text.trim().toLowerCase();
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function matchesExact(entries, candidates) {
  if (!Array.isArray(entries) || !entries.length) return false;
  const wanted = entries.map((entry) => normalizeMatchText(entry)).filter(Boolean);
  return candidates.some((candidate) => wanted.includes(candidate));
}

function matchesPattern(patterns, values) {
  if (!Array.isArray(patterns) || !patterns.length) return false;
  return patterns.some((pattern) =>
    pattern && typeof pattern.test === 'function' && values.some((value) => pattern.test(value))
  );
}

function collectNameCandidates(deviceName, meta = {}) {
  return uniqueValues([
    deviceName,
    meta && meta.name,
    meta && meta.inputName,
    meta && meta.outputName,
    meta && meta.portName,
    meta && meta.input && meta.input.name,
    meta && meta.output && meta.output.name,
  ]);
}

function collectManufacturerCandidates(meta = {}) {
  return uniqueValues([
    meta && meta.manufacturer,
    meta && meta.input && meta.input.manufacturer,
    meta && meta.output && meta.output.manufacturer,
  ]);
}

export function matchesControllerProfile(profile, deviceName, transport = 'midi', meta = {}) {
  if (!profile || typeof profile !== 'object') return false;

  const match = profile.match || {};
  if (Array.isArray(match.transports) && match.transports.length && !match.transports.includes(transport)) {
    return false;
  }

  const nameValues = collectNameCandidates(deviceName, meta);
  const normalizedNames = nameValues.map((value) => normalizeMatchText(value)).filter(Boolean);
  const manufacturerValues = collectManufacturerCandidates(meta);
  const normalizedManufacturers = manufacturerValues.map((value) => normalizeMatchText(value)).filter(Boolean);

  if (
    matchesExact(match.names, normalizedNames) ||
    matchesExact(match.inputNames, normalizedNames) ||
    matchesExact(match.outputNames, normalizedNames) ||
    matchesPattern(match.namePatterns, nameValues)
  ) {
    return true;
  }

  if (
    matchesExact(match.manufacturers, normalizedManufacturers) ||
    matchesPattern(match.manufacturerPatterns, manufacturerValues)
  ) {
    return true;
  }

  return false;
}

export function matchControllerProfile(deviceName, transport = 'midi', meta = {}) {
  for (const profile of controllerProfiles) {
    if (matchesControllerProfile(profile, deviceName, transport, meta)) {
      return profile;
    }
  }
  return null;
}

export function getDefaultControllerProfile() {
  return controllerProfiles[0] || null;
}
