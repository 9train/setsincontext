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

function assertIncludesAll(text, expected, label) {
  for (const item of expected) {
    assert.match(text, new RegExp(escapeRegExp(item)), `${label} should include ${item}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('viewer-page module exports page boot without auto-running it', () => {
  const source = readRepoFile('src/runtime/viewer-page.js');

  assert.match(source, /export\s+async\s+function\s+initViewerPage\b/);
  assert.doesNotMatch(source, /^\s*initViewerPage\(\)\s*;?\s*$/m);
});

test('viewer-page module keeps viewer UI, board, theme, status, and jog setup together', () => {
  const source = readRepoFile('src/runtime/viewer-page.js');

  assertIncludesAll(source, [
    "initSharedPageBoot({ role: 'viewer' })",
    "await initBoard({ hostId: 'boardHost' })",
    "doc.getElementById('boardHost')",
    'THEME.attachThemeDesigner',
    "THEME.ensurePreset?.('instrument-dark')",
    "viewerPreset = 'classic'",
    'runtimeApp.setInfoConsumer',
    'updateLastAction(info)',
    'boardConsume(info)',
    'runtimeApp.setWSStatusHandler',
    'runtimeApp.setMIDIStatusHandler',
    "runtimeApp.setMIDIStatus('viewer')",
    'installJogRuntime',
    'getUnifiedMap: () => getUnifiedMap?.() || []',
    'exposeGlobalControls: true',
  ], 'src/runtime/viewer-page.js');
});

test('viewer-page module does not own websocket boot', () => {
  const source = readRepoFile('src/runtime/viewer-page.js');

  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /(?:^|['"])\/?src\/ws\.js|['"]\.\.?\/ws\.js['"]/);
});
