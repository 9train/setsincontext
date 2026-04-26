import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludesAll(text, expected, label) {
  for (const item of expected) {
    assert.match(text, new RegExp(escapeRegExp(item)), `${label} should include ${item}`);
  }
}

function assertIncludesNone(text, forbidden, label) {
  for (const item of forbidden) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(item)), `${label} should not include ${item}`);
  }
}

test('host status page module exists and exports the chrome initializer', () => {
  const source = readRepoFile('src/runtime/host-status-page.js');

  assert.match(source, /export\s+function\s+initHostStatusChrome\b/);
  assert.match(source, /from\s+['"]\.\.\/host-status\.js['"]/);
  assertIncludesAll(source, [
    'hostStatusChrome',
    'hostStatusPopover',
    'hostStatusButton',
    'wsStatus',
    'midiStatus',
    'controllerStatus',
  ], 'src/runtime/host-status-page.js');
});

test('host status page module stays scoped away from host boot systems', () => {
  const source = readRepoFile('src/runtime/host-status-page.js');

  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
  ], 'src/runtime/host-status-page.js');
  assert.doesNotMatch(source, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\binitBoard\b/);
});

test('host.html delegates status chrome while keeping host boot imports', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/runtime/host-status-page.js',
    '/src/runtime/host-controller-pipeline.js',
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/midi.js',
    '/src/board.js',
    '/src/bootstrap-host.js',
    'initHostStatusChrome',
    'initHostControllerPipeline',
    'hostStatus.setLauncher',
    'hostStatus.getStatusSnapshot',
  ], 'host.html');

  assertIncludesNone(host, [
    '/src/main.js',
    '/src/wsClient.js',
    '/src/legacy/wsClient.js',
    '/src/host-midi.js',
    'function ensureStatusButton',
    'function renderStatusButton',
    'function describeActivePopover',
    'function renderStatusPopover',
    'function renderStatusChrome',
    'function closeStatusPopover',
    'function toggleStatusPopover',
  ], 'host.html');
});
