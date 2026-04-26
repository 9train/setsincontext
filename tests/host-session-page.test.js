import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initHostSessionPage } from '../src/runtime/host-session-page.js';

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

test('host session page module exists and exports initHostSessionPage', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-session-page.js');
  const source = readRepoFile('src/runtime/host-session-page.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof initHostSessionPage, 'function');
  assert.match(source, /export\s+function\s+initHostSessionPage\b/);
});

test('host session page module stays dependency-injected and away from host runtime boot systems', () => {
  const source = readRepoFile('src/runtime/host-session-page.js');

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
    '../mapper.js',
    '../controllers/',
    '../theme.js',
    '../presets.js',
    '../private-invite-ui.js',
    './host-probe.js',
    '/src/private-invite-ui.js',
    '/src/runtime/host-probe.js',
  ], 'src/runtime/host-session-page.js');
  assertIncludesNone(source, [
    'bootMIDIFromQuery',
    'connectWS',
    'initBoard',
    'boardConsume',
    'loadMappings',
    'sendMap',
    'runtimeApp.setNormalizer',
    'runtimeApp.setInfoConsumer',
    'initLauncher',
    'createHostLauncherActions',
    'initHostToolsPage',
    'initHostThemePage',
  ], 'src/runtime/host-session-page.js');
});

test('host-page.js delegates host session page wiring while host.html stays thin', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const host = readRepoFile('host.html');

  assertIncludesAll(hostPage, [
    './host-session-page.js',
    '../private-invite-ui.js',
    './host-probe.js',
    './host-status-page.js',
    './host-controller-pipeline.js',
    './host-draft-map-sync.js',
    './host-midi-capture.js',
    './host-launcher-actions.js',
    './host-tools-page.js',
    './host-theme-page.js',
    './app-bridge.js',
    '../bootstrap-shared.js',
  ], 'src/runtime/host-page.js');
  assert.match(hostPage, /const\s+hostSessionPage\s*=\s*deps\.initHostSessionPage\(\{[\s\S]*runtimeApp,[\s\S]*installHostProbeOnFirstConnect:\s*deps\.installHostProbeOnFirstConnect,[\s\S]*installPrivateInvitePanel:\s*deps\.installPrivateInvitePanel,[\s\S]*\}\)/);
  assertIncludesAll(hostPage, [
    'initHostStatusChrome(',
    'initHostControllerPipeline(',
    'initHostDraftMapSync(',
    'startHostMidiCapture(',
    'createHostLauncherActions(',
    'initHostToolsPage(',
    'initHostThemePage(',
  ], 'src/runtime/host-page.js');
  assertIncludesNone(hostPage, [
    'installHostProbeOnFirstConnect({ runtimeApp });',
    'installPrivateInvitePanel();',
  ], 'src/runtime/host-page.js');
  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
});

test('initHostSessionPage calls the injected probe and private invite installers and returns their handles', () => {
  const runtimeApp = { id: 'runtime-app' };
  const calls = [];
  const hostProbe = { id: 'probe-1' };
  const privateInvitePanel = { id: 'invite-1' };

  const result = initHostSessionPage({
    runtimeApp,
    installHostProbeOnFirstConnect(options) {
      calls.push(['probe', options]);
      return hostProbe;
    },
    installPrivateInvitePanel() {
      calls.push(['invite']);
      return privateInvitePanel;
    },
  });

  assert.deepEqual(calls, [
    ['probe', { runtimeApp }],
    ['invite'],
  ]);
  assert.deepEqual(result, {
    hostProbe,
    privateInvitePanel,
  });
});

test('initHostSessionPage requires installHostProbeOnFirstConnect', () => {
  assert.throws(
    () => initHostSessionPage({
      installPrivateInvitePanel() {
        return null;
      },
    }),
    {
      name: 'TypeError',
      message: 'initHostSessionPage requires installHostProbeOnFirstConnect',
    },
  );
});

test('initHostSessionPage requires installPrivateInvitePanel', () => {
  assert.throws(
    () => initHostSessionPage({
      installHostProbeOnFirstConnect() {
        return null;
      },
    }),
    {
      name: 'TypeError',
      message: 'initHostSessionPage requires installPrivateInvitePanel',
    },
  );
});

test('initHostSessionPage passes runtimeApp through as-is when it is missing', () => {
  let probeOptions = null;

  const result = initHostSessionPage({
    installHostProbeOnFirstConnect(options) {
      probeOptions = options;
      return { id: 'probe-missing-runtime' };
    },
    installPrivateInvitePanel() {
      return { id: 'invite-panel' };
    },
  });

  assert.deepEqual(probeOptions, { runtimeApp: undefined });
  assert.deepEqual(result, {
    hostProbe: { id: 'probe-missing-runtime' },
    privateInvitePanel: { id: 'invite-panel' },
  });
});
