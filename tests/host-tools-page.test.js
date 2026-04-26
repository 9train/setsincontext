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

test('host-page.js delegates host-only tools while keeping host.html thin', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const host = readRepoFile('host.html');

  assertIncludesAll(hostPage, [
    './host-tools-page.js',
    '../jog-runtime.js',
    '../jog-calibration-ui.js',
    '../host-debug.js',
    'initHostToolsPage',
    'installJogRuntime',
    'attachJogCalibrationModal',
    'installHostDebug',
    './host-status-page.js',
    './host-controller-pipeline.js',
    './host-draft-map-sync.js',
    './host-midi-capture.js',
    './host-launcher-actions.js',
    '../midi.js',
    '../board.js',
    '../launcher.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../editmode.js',
    '../wizard.js',
    '../theme.js',
  ], 'src/runtime/host-page.js');

  assert.match(hostPage, /const\s+hostTools\s*=\s*deps\.initHostToolsPage\(\{[\s\S]*runtimeApp,[\s\S]*documentRef:\s*doc,[\s\S]*windowRef:\s*win,[\s\S]*boardHost:\s*stageEl,[\s\S]*getUnifiedMap:\s*deps\.getUnifiedMap,[\s\S]*installJogRuntime:\s*deps\.installJogRuntime,[\s\S]*attachJogCalibrationModal:\s*deps\.attachJogCalibrationModal,[\s\S]*installHostDebug:\s*deps\.installHostDebug,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assert.match(hostPage, /await\s+deps\.initBoard\(\{\s*hostId:\s*['"]boardHost['"]\s*\}\)/);
  assert.match(hostPage, /deps\.initHostStatusChrome\(\{[\s\S]*runtimeApp,[\s\S]*document:\s*doc[\s\S]*\}\)/);
  assert.match(hostPage, /deps\.initHostControllerPipeline\(\{[\s\S]*runtimeApp,[\s\S]*boardConsume:\s*deps\.boardConsume,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assert.match(hostPage, /deps\.initHostDraftMapSync\(\{[\s\S]*runtimeApp,[\s\S]*loadMappings:\s*deps\.loadMappings,[\s\S]*\}\)/);
  assert.match(hostPage, /deps\.startHostMidiCapture\(\{[\s\S]*runtimeApp,[\s\S]*hostStatus,[\s\S]*bootMIDIFromQuery:\s*deps\.bootMIDIFromQuery,[\s\S]*\}\)/);
  assert.match(hostPage, /deps\.createHostLauncherActions\(\{[\s\S]*DIAG:\s*deps\.DIAG,[\s\S]*RECUI:\s*deps\.RECUI,[\s\S]*WIZ:\s*deps\.WIZ,[\s\S]*EDIT:\s*deps\.EDIT,[\s\S]*THEME:\s*deps\.THEME,[\s\S]*FLXRec:\s*deps\.FLXRec,[\s\S]*runtimeApp,[\s\S]*\}\)/);
  assert.match(hostPage, /deps\.initLauncher\(\{/);

  assertIncludesNone(hostPage, [
    'const Jog = installJogRuntime({',
    'exposeGlobalControls: true',
    'jogRuntime: Jog',
    "trigger: document.getElementById('openJogCalibration')",
    'consumeInfo: (info) => runtimeApp.consumeInfo(info)',
    'getWSClient: () => runtimeApp.getWSClient()',
  ], 'src/runtime/host-page.js');
  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
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
