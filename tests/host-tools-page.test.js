import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initHostToolsPage } from '../src/runtime/host-tools-page.js';

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

function createDocumentRef(trigger) {
  return {
    getElementById(id) {
      return id === 'openJogCalibration' ? trigger : null;
    },
  };
}

test('host tools page module exists and exports initHostToolsPage', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-tools-page.js');
  const source = readRepoFile('src/runtime/host-tools-page.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof initHostToolsPage, 'function');
  assert.match(source, /export\s+function\s+initHostToolsPage\b/);
});

test('host tools page module stays scoped to injected host-only tooling', () => {
  const source = readRepoFile('src/runtime/host-tools-page.js');

  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../mapper.js',
    '../controllers/',
  ], 'src/runtime/host-tools-page.js');
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
  ], 'src/runtime/host-tools-page.js');
  assertIncludesNone(source, [
    'ddj-flx6.mappings',
    'ddj-flx6.outputs',
    'controllerTruth: true',
    "mapAuthority: 'official'",
    'mapAuthority: "official"',
  ], 'src/runtime/host-tools-page.js');
});

test('host.html delegates host-only tools while keeping host boot ownership', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/runtime/host-tools-page.js',
    '/src/jog-runtime.js',
    '/src/jog-calibration-ui.js',
    '/src/host-debug.js',
    'initHostToolsPage',
    'installJogRuntime',
    'attachJogCalibrationModal',
    'installHostDebug',
    '/src/runtime/host-status-page.js',
    '/src/runtime/host-controller-pipeline.js',
    '/src/runtime/host-draft-map-sync.js',
    '/src/runtime/host-midi-capture.js',
    '/src/runtime/host-launcher-actions.js',
    '/src/midi.js',
    '/src/board.js',
    '/src/launcher.js',
    '/src/recorder.js',
    '/src/recorder_ui.js',
    '/src/diag.js',
    '/src/editmode.js',
    '/src/wizard.js',
    '/src/theme.js',
    '/src/bootstrap-host.js',
  ], 'host.html');

  assert.match(host, /const\s+hostTools\s*=\s*initHostToolsPage\(\{[\s\S]*runtimeApp,[\s\S]*documentRef:\s*document,[\s\S]*windowRef:\s*window,[\s\S]*boardHost:\s*stageEl,[\s\S]*getUnifiedMap,[\s\S]*installJogRuntime,[\s\S]*attachJogCalibrationModal,[\s\S]*installHostDebug,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assert.match(host, /await\s+initBoard\(\{\s*hostId:\s*['"]boardHost['"]\s*\}\)/);
  assert.match(host, /initHostStatusChrome\(\{[\s\S]*runtimeApp,[\s\S]*document,[\s\S]*\}\)/);
  assert.match(host, /initHostControllerPipeline\(\{[\s\S]*runtimeApp,[\s\S]*boardConsume,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assert.match(host, /initHostDraftMapSync\(\{[\s\S]*runtimeApp,[\s\S]*loadMappings,[\s\S]*\}\)/);
  assert.match(host, /startHostMidiCapture\(\{[\s\S]*runtimeApp,[\s\S]*hostStatus,[\s\S]*bootMIDIFromQuery,[\s\S]*\}\)/);
  assert.match(host, /createHostLauncherActions\(\{[\s\S]*DIAG,[\s\S]*RECUI,[\s\S]*WIZ,[\s\S]*EDIT,[\s\S]*THEME,[\s\S]*FLXRec,[\s\S]*runtimeApp,[\s\S]*\}\)/);
  assert.match(host, /initLauncher\(\{/);
  assert.match(host, /THEME\.attachThemeDesigner\(/);
  assert.doesNotMatch(host, /\/src\/runtime\/host-page\.js/);

  assertIncludesNone(host, [
    'const Jog = installJogRuntime({',
    'exposeGlobalControls: true',
    'jogRuntime: Jog',
    "trigger: document.getElementById('openJogCalibration')",
    'consumeInfo: (info) => runtimeApp.consumeInfo(info)',
    'getWSClient: () => runtimeApp.getWSClient()',
  ], 'host.html');
});

test('initHostToolsPage calls installJogRuntime with the existing host options', () => {
  const map = [{ key: 'cc:1:33', target: 'jog_L' }];
  const jogRuntime = { id: 'jog-runtime' };
  let jogOptions = null;

  const result = initHostToolsPage({
    runtimeApp: {
      consumeInfo() {},
      getWSClient() {
        return null;
      },
    },
    documentRef: createDocumentRef(null),
    getUnifiedMap: () => map,
    installJogRuntime(options) {
      jogOptions = options;
      return jogRuntime;
    },
  });

  assert.equal(result.jogRuntime, jogRuntime);
  assert.equal(jogOptions.exposeGlobalControls, true);
  assert.deepEqual(jogOptions.getUnifiedMap(), map);
});

test('initHostToolsPage wires jog calibration to the existing host trigger when provided', () => {
  const trigger = { id: 'openJogCalibration' };
  const jogRuntime = { id: 'jog-runtime' };
  const jogCalibration = { id: 'jog-calibration' };
  let calibrationOptions = null;

  const result = initHostToolsPage({
    runtimeApp: {
      consumeInfo() {},
      getWSClient() {
        return null;
      },
    },
    documentRef: createDocumentRef(trigger),
    installJogRuntime() {
      return jogRuntime;
    },
    attachJogCalibrationModal(options) {
      calibrationOptions = options;
      return jogCalibration;
    },
  });

  assert.equal(result.jogCalibration, jogCalibration);
  assert.deepEqual(calibrationOptions, {
    jogRuntime,
    trigger,
  });
});

test('initHostToolsPage calls installHostDebug with the existing host dependencies', () => {
  const map = [{ key: 'cc:1:16', target: 'xfader' }];
  const wsClient = { id: 'ws-client' };
  const consumed = [];
  const hostDebug = { id: 'host-debug' };
  let debugOptions = null;

  const result = initHostToolsPage({
    runtimeApp: {
      consumeInfo(info) {
        consumed.push(info);
        return 'consumed';
      },
      getWSClient() {
        return wsClient;
      },
    },
    documentRef: createDocumentRef(null),
    getUnifiedMap: () => map,
    installJogRuntime() {
      return { id: 'jog-runtime' };
    },
    installHostDebug(options) {
      debugOptions = options;
      return hostDebug;
    },
  });

  const info = { type: 'cc' };

  assert.equal(result.hostDebug, hostDebug);
  assert.deepEqual(debugOptions.getUnifiedMap(), map);
  assert.equal(debugOptions.consumeInfo(info), 'consumed');
  assert.deepEqual(consumed, [info]);
  assert.equal(debugOptions.getWSClient(), wsClient);
});

test('initHostToolsPage returns null hostDebug when installHostDebug is absent', () => {
  const result = initHostToolsPage({
    runtimeApp: {},
    documentRef: createDocumentRef(null),
    installJogRuntime() {
      return { id: 'jog-runtime' };
    },
  });

  assert.equal(result.hostDebug, null);
});

test('initHostToolsPage fails clearly without installJogRuntime', () => {
  assert.throws(
    () => initHostToolsPage({ runtimeApp: {}, documentRef: createDocumentRef(null) }),
    {
      name: 'TypeError',
      message: 'initHostToolsPage requires installJogRuntime',
    },
  );
});
