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

const canonicalForbiddenImports = [
  '/src/main.js',
  '/src/wsClient.js',
  '/src/legacy/wsClient.js',
  '/src/host-midi.js',
];

test('host.html is the thin official host page inventory', () => {
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
  assertIncludesNone(host, canonicalForbiddenImports, 'host.html');
});

test('host-page.js is the composition owner for the official host page', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');

  assert.match(hostPage, /export\s+async\s+function\s+initHostPage\b/);
  assertIncludesAll(hostPage, [
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
    'initHostSessionPage(',
    'initHostStatusChrome(',
    'initHostControllerPipeline(',
    'initHostDraftMapSync(',
    'startHostMidiCapture(',
    'createHostLauncherActions(',
    'initLauncher(',
    'hostStatus.setLauncher(launcher)',
    'initHostThemePage(',
    'initHostToolsPage(',
  ], 'src/runtime/host-page.js');
  assertIncludesNone(hostPage, [
    '../ws.js',
    '../wsClient.js',
    '../legacy/wsClient.js',
    '../host-midi.js',
    'connectWS(',
    'ddj-flx6.mappings',
    'ddj-flx6.outputs',
  ], 'src/runtime/host-page.js');
});

test('bootstrap-host.js remains the host websocket entrypoint while runtime/host-ws-bootstrap.js owns the actual ws logic', () => {
  const host = readRepoFile('host.html');
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const bootstrapHost = readRepoFile('src/bootstrap-host.js');
  const hostWSBootstrap = readRepoFile('src/runtime/host-ws-bootstrap.js');

  assert.match(host, /<script\s+type=["']module["']\s+src=["']\/src\/bootstrap-host\.js["']><\/script>/);
  assertIncludesAll(bootstrapHost, [
    './runtime/host-ws-bootstrap.js',
    'initHostWSBootstrap();',
  ], 'src/bootstrap-host.js');
  assertIncludesNone(bootstrapHost, [
    './ws.js',
    './bootstrap-shared.js',
    './runtime/app-bridge.js',
    'connectWS',
    'acceptDraftMapCandidate',
    "const WS_ROLE = 'host'",
  ], 'src/bootstrap-host.js');

  assertIncludesAll(hostWSBootstrap, [
    '../ws.js',
    '../bootstrap-shared.js',
    './app-bridge.js',
    '../map-bootstrap.js',
    'connectWS',
    'acceptDraftMapCandidate',
    "const WS_ROLE = 'host'",
    'runtimeApp?.setWSClient(wsClient)',
  ], 'src/runtime/host-ws-bootstrap.js');

  assertIncludesAll(bootstrapHost, [
    'initHostWSBootstrap',
  ], 'src/bootstrap-host.js');
  assertIncludesNone(hostPage, ['../ws.js', 'connectWS(', 'setWSClient('], 'src/runtime/host-page.js');
});

test('viewer.html remains the official thin viewer page inventory', () => {
  const viewer = readRepoFile('viewer.html');

  assertIncludesAll(viewer, [
    '/src/runtime/viewer-page.js',
    '/src/bootstrap-viewer.js',
  ], 'viewer.html');
  assert.match(viewer, /initViewerPage\(\)/);
  assertIncludesNone(viewer, [
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/board.js',
    '/src/jog-runtime.js',
    '/src/theme.js',
  ], 'viewer.html');
  assertIncludesNone(viewer, canonicalForbiddenImports, 'viewer.html');
});

test('viewer-page.js owns viewer UI boot dependencies while bootstrap-viewer.js owns websocket boot', () => {
  const viewerPage = readRepoFile('src/runtime/viewer-page.js');
  const bootstrapViewer = readRepoFile('src/bootstrap-viewer.js');

  assertIncludesAll(viewerPage, [
    '../board.js',
    '../bootstrap-shared.js',
    '../jog-runtime.js',
    '../theme.js',
    './app-bridge.js',
  ], 'src/runtime/viewer-page.js');
  assert.match(viewerPage, /export\s+async\s+function\s+initViewerPage\b/);
  assert.doesNotMatch(viewerPage, /\bconnectWS\b/);
  assert.doesNotMatch(viewerPage, /(?:^|['"])\/?src\/ws\.js|['"]\.\.?\/ws\.js['"]/);

  assertIncludesAll(bootstrapViewer, [
    './ws.js',
    './bootstrap-shared.js',
    './runtime/app-bridge.js',
    'connectWS',
    "const WS_ROLE = 'viewer'",
  ], 'src/bootstrap-viewer.js');
});

test('root index.html is only a launcher into host.html or viewer.html', () => {
  const index = readRepoFile('index.html');

  assertIncludesAll(index, ['host.html', 'viewer.html'], 'index.html');
  assertIncludesNone(index, [
    '/src/main.js',
    '/src/wsClient.js',
    '/src/board.js',
    '/src/midi.js',
    '/src/ws.js',
    '/src/bootstrap-host.js',
    '/src/bootstrap-viewer.js',
    'initBoard',
    'connectWS',
    'initWebMIDI',
  ], 'index.html');
  assert.match(index, /launcher|redirect/i);
});

test('legacy and compatibility entrypoints stay labeled and are not imported by canonical pages', () => {
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');
  const rootIndex = readRepoFile('index.html');
  const publicIndex = readRepoFile('public/index.html');
  const main = readRepoFile('src/main.js');
  const wsClient = readRepoFile('src/wsClient.js');
  const legacyWsClient = readRepoFile('src/legacy/wsClient.js');
  const hostMidi = readRepoFile('src/host-midi.js');

  assert.match(main, /LEGACY\/DEMO ENTRYPOINT|legacy\/demo/i);
  assert.match(publicIndex, /LEGACY\/DEMO ENTRYPOINT|legacy\/demo/i);
  assert.notEqual(rootIndex, publicIndex);
  assert.match(wsClient, /LEGACY|DEMO|COMPAT/i);
  assert.match(legacyWsClient, /LEGACY|DEMO|COMPAT/i);
  assert.match(hostMidi, /legacy|alternate/i);

  assertIncludesNone(host, canonicalForbiddenImports, 'host.html');
  assertIncludesNone(viewer, canonicalForbiddenImports, 'viewer.html');
});
