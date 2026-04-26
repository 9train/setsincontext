import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initHostPage } from '../src/runtime/host-page.js';

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

test('host page module exists and exports initHostPage', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-page.js');
  const source = readRepoFile('src/runtime/host-page.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof initHostPage, 'function');
  assert.match(source, /export\s+async\s+function\s+initHostPage\b/);
});

test('host.html delegates host page composition to host-page.js while keeping bootstrap-host.js separate', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
    'hostStatusChrome',
    'hostStatusPopover',
    'privateInvitePanel',
    'boardHost',
    'hostStatusButton',
    'wsStatus',
    'midiStatus',
    'controllerStatus',
  ], 'host.html');
  assert.match(host, /<script\s+type=["']module["']>\s*import\s+\{\s*initHostPage\s*\}\s+from\s+['"]\/src\/runtime\/host-page\.js['"];\s*await\s+initHostPage\(\);\s*<\/script>/);
  assert.match(host, /<script\s+type=["']module["']\s+src=["']\/src\/bootstrap-host\.js["']><\/script>/);
  assertIncludesNone(host, [
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/board.js',
    '/src/midi.js',
    '/src/mapper.js',
    '/src/launcher.js',
    '/src/theme.js',
    '/src/presets.js',
    '/src/recorder.js',
    '/src/recorder_ui.js',
    '/src/diag.js',
    '/src/editmode.js',
    '/src/wizard.js',
    '/src/jog-runtime.js',
    '/src/host-debug.js',
    '/src/private-invite-ui.js',
    '/src/session-replay-library.js',
    '/src/runtime/host-probe.js',
    '/src/runtime/host-status-page.js',
    '/src/runtime/host-controller-pipeline.js',
    '/src/runtime/host-draft-map-sync.js',
    '/src/runtime/host-midi-capture.js',
    '/src/runtime/host-launcher-actions.js',
    '/src/runtime/host-tools-page.js',
    '/src/runtime/host-theme-page.js',
    '/src/runtime/host-session-page.js',
    'initSharedPageBoot(',
    'getRuntimeApp(',
    'initBoard(',
    'initHostStatusChrome(',
    'initHostControllerPipeline(',
    'initHostDraftMapSync(',
    'startHostMidiCapture(',
    'createHostLauncherActions(',
    'initHostToolsPage(',
    'initHostThemePage(',
    'initHostSessionPage(',
    'initLauncher(',
    'RECUI.install',
  ], 'host.html');
});

test('host-page.js imports the extracted host modules and host composition dependencies', () => {
  const source = readRepoFile('src/runtime/host-page.js');

  assertIncludesAll(source, [
    '../bootstrap-shared.js',
    './app-bridge.js',
    '../board.js',
    '../midi.js',
    '../mapper.js',
    '../launcher.js',
    '../theme.js',
    '../presets.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../editmode.js',
    '../wizard.js',
    '../jog-runtime.js',
    '../jog-calibration-ui.js',
    '../host-debug.js',
    '../private-invite-ui.js',
    './host-probe.js',
    '../session-replay-library.js',
    './host-status-page.js',
    './host-controller-pipeline.js',
    './host-draft-map-sync.js',
    './host-midi-capture.js',
    './host-launcher-actions.js',
    './host-tools-page.js',
    './host-theme-page.js',
    './host-session-page.js',
    "role: 'host'",
    "hostId: 'boardHost'",
  ], 'src/runtime/host-page.js');
  assertIncludesNone(source, [
    '../ws.js',
    '../wsClient.js',
    '../legacy/wsClient.js',
    '../host-midi.js',
    'connectWS(',
    'ddj-flx6.mappings',
    'ddj-flx6.outputs',
  ], 'src/runtime/host-page.js');
});

test('initHostPage composes the existing host runtime in host.html order without websocket boot ownership', async () => {
  const calls = [];
  const launcher = { id: 'launcher' };
  const stageEl = { id: 'boardHost', classList: { add() {}, remove() {}, toggle() {} } };
  const runtimeApp = {
    getRecentDebuggerSnapshots: () => [{ recentSummary: 'Last mapped action' }],
  };
  const hostStatus = {
    getStatusSnapshot() {
      return {
        hostLink: { summary: 'Connected' },
        midiLane: { summary: 'Ready' },
        controllerPath: { summary: 'Official' },
      };
    },
    setLauncher(nextLauncher) {
      calls.push(['hostStatus.setLauncher', nextLauncher]);
      return nextLauncher;
    },
  };
  const documentRef = {
    body: { classList: { toggle() {} } },
    getElementById(id) {
      calls.push(['document.getElementById', id]);
      return id === 'boardHost' ? stageEl : { id };
    },
  };
  const windowRef = {
    setTimeout() {},
  };
  const presetMounts = [];
  let launcherOptions = null;
  let launcherActionsOptions = null;

  const result = await initHostPage({
    documentRef,
    windowRef,
    URLRef: {
      createObjectURL() {
        return 'blob:test';
      },
      revokeObjectURL() {},
    },
    dependencies: {
      initSharedPageBoot(options) {
        calls.push(['initSharedPageBoot', options]);
      },
      getRuntimeApp() {
        calls.push(['getRuntimeApp']);
        return runtimeApp;
      },
      initHostSessionPage(options) {
        calls.push(['initHostSessionPage', options]);
        return { id: 'host-session' };
      },
      async initBoard(options) {
        calls.push(['initBoard:start', options]);
        await Promise.resolve();
        calls.push(['initBoard:end']);
        return { id: 'board' };
      },
      initHostStatusChrome(options) {
        calls.push(['initHostStatusChrome', options]);
        return hostStatus;
      },
      initHostControllerPipeline(options) {
        calls.push(['initHostControllerPipeline', options]);
        return { id: 'host-controller-pipeline' };
      },
      initHostDraftMapSync(options) {
        calls.push(['initHostDraftMapSync', options]);
        return { id: 'host-draft-map-sync' };
      },
      async startHostMidiCapture(options) {
        calls.push(['startHostMidiCapture:start', options]);
        await Promise.resolve();
        calls.push(['startHostMidiCapture:end']);
        return { id: 'host-midi' };
      },
      createHostLauncherActions(options) {
        launcherActionsOptions = options;
        calls.push(['createHostLauncherActions', options]);
        return { id: 'host-launcher-actions' };
      },
      initLauncher(options) {
        launcherOptions = options;
        calls.push(['initLauncher', options]);
        return launcher;
      },
      initHostThemePage(options) {
        calls.push(['initHostThemePage', options]);
        return { id: 'host-theme-page' };
      },
      initHostToolsPage(options) {
        calls.push(['initHostToolsPage', options]);
        return { id: 'host-tools-page' };
      },
      THEME: { id: 'theme' },
      DIAG: { id: 'diag' },
      RECUI: { id: 'recui' },
      WIZ: { id: 'wizard' },
      EDIT: { id: 'edit' },
      FLXRec: { id: 'recorder' },
      sessionReplayLibrary: { id: 'replay-library' },
      createReplayDownloadFilename() {
        return 'session-replay.json';
      },
      PRESETS: {
        attachPresetUI(mount) {
          presetMounts.push(mount);
        },
      },
      loadMappings() {
        return [];
      },
      boardConsume(info) {
        return info;
      },
      getUnifiedMap() {
        return [];
      },
      bootMIDIFromQuery() {},
      installJogRuntime() {
        return { id: 'jog-runtime' };
      },
      attachJogCalibrationModal() {
        return { id: 'jog-calibration' };
      },
      installHostDebug() {
        return { id: 'host-debug' };
      },
      installHostProbeOnFirstConnect() {
        return { id: 'probe' };
      },
      installPrivateInvitePanel() {
        return { id: 'private-invite' };
      },
    },
  });

  assert.deepEqual(calls.map(([name]) => name), [
    'initSharedPageBoot',
    'getRuntimeApp',
    'initHostSessionPage',
    'initBoard:start',
    'initBoard:end',
    'initHostStatusChrome',
    'initHostControllerPipeline',
    'initHostDraftMapSync',
    'startHostMidiCapture:start',
    'startHostMidiCapture:end',
    'document.getElementById',
    'createHostLauncherActions',
    'initLauncher',
    'hostStatus.setLauncher',
    'initHostThemePage',
    'initHostToolsPage',
  ]);

  assert.deepEqual(calls[0][1], { role: 'host', wsStatusId: '__hostBootStatus' });
  assert.equal(calls[2][1].runtimeApp, runtimeApp);
  assert.equal(typeof calls[2][1].installHostProbeOnFirstConnect, 'function');
  assert.equal(typeof calls[2][1].installPrivateInvitePanel, 'function');

  assert.deepEqual(calls[3][1], { hostId: 'boardHost' });
  assert.deepEqual(calls[5][1], { runtimeApp, document: documentRef });
  assert.equal(calls[6][1].runtimeApp, runtimeApp);
  assert.equal(calls[6][1].hostStatus, hostStatus);
  assert.equal(calls[7][1].runtimeApp, runtimeApp);
  assert.equal(calls[8][1].runtimeApp, runtimeApp);
  assert.equal(calls[8][1].hostStatus, hostStatus);
  assert.equal(calls[10][1], 'boardHost');
  assert.equal(launcherActionsOptions.stageEl, stageEl);
  assert.equal(typeof launcherActionsOptions.getLauncher, 'function');
  assert.equal(launcherActionsOptions.getLauncher(), launcher);
  assert.equal(launcherOptions.actions.id, 'host-launcher-actions');
  assert.equal(typeof launcherOptions.getStatusSnapshot, 'function');
  assert.equal(typeof launcherOptions.mountPresetUI, 'function');
  assert.deepEqual(launcherOptions.getStatusSnapshot(), {
    hostLink: { summary: 'Connected' },
    midiLane: { summary: 'Ready' },
    controllerPath: { summary: 'Official' },
    lastAction: 'Last mapped action',
  });

  const presetMount = { id: 'preset-mount' };
  launcherOptions.mountPresetUI(presetMount);
  assert.deepEqual(presetMounts, [presetMount]);

  assert.equal(result.runtimeApp, runtimeApp);
  assert.equal(result.hostStatus, hostStatus);
  assert.equal(result.launcher, launcher);
});
