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

test('host-page.js delegates status chrome while host.html stays thin', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const host = readRepoFile('host.html');

  assertIncludesAll(hostPage, [
    './host-status-page.js',
    './host-controller-pipeline.js',
    '../bootstrap-shared.js',
    './app-bridge.js',
    '../midi.js',
    '../board.js',
    'initHostStatusChrome',
    'initHostControllerPipeline',
    'hostStatus.setLauncher',
    'hostStatus.getStatusSnapshot',
  ], 'src/runtime/host-page.js');

  assertIncludesNone(hostPage, [
    '../main.js',
    '../wsClient.js',
    '../legacy/wsClient.js',
    '../host-midi.js',
    'function ensureStatusButton',
    'function renderStatusButton',
    'function describeActivePopover',
    'function renderStatusPopover',
    'function renderStatusChrome',
    'function closeStatusPopover',
    'function toggleStatusPopover',
  ], 'src/runtime/host-page.js');
  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
});
